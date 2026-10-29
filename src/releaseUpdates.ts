import * as vscode from 'vscode';
import { createHash } from 'node:crypto';
import { AvailableRelease, MAX_VSIX_BYTES, parseOfficialRelease } from './releaseMetadata';
import {
  STARTUP_MIN_GAP_MS, UPDATE_CHECK_INTERVAL_MS, UpdateMode,
  isCheckDue, resolveUpdateMode, staleVsixFiles,
} from './updatePolicy';

const LATEST_RELEASE_API = 'https://api.github.com/repos/sbc-apps/sbc-code/releases/latest';
const LAST_NOTIFIED_KEY = 'sbcCode.lastNotifiedRelease';
const LAST_CHECK_KEY = 'sbcCode.lastUpdateCheck';
const ETAG_KEY = 'sbcCode.releaseEtag';
const CACHED_RELEASE_KEY = 'sbcCode.cachedRelease';
const INSTALLED_RELEASE_KEY = 'sbcCode.installedRelease';
const LAST_RUN_VERSION_KEY = 'sbcCode.lastRunVersion';
const STARTUP_DELAY_MS = 5000;
const USER_AGENT = 'sbc-code-vscode-extension';

export type UpdateState =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'downloading'; version: string }
  | { state: 'available'; version: string; releaseUrl: string }
  | { state: 'installed'; version: string; releaseUrl: string }
  | { state: 'updated'; version: string; releaseUrl: string };

/** Only the fields the release parser needs are cached between ETag lookups. */
function compactRelease(data: unknown): unknown {
  if (!data || typeof data !== 'object') {
    return undefined;
  }
  const release = data as Record<string, unknown>;
  const assets = Array.isArray(release.assets) ? release.assets : [];
  return {
    tag_name: release.tag_name,
    html_url: release.html_url,
    draft: release.draft,
    prerelease: release.prerelease,
    assets: assets.map((item: unknown) => {
      const asset = (item ?? {}) as Record<string, unknown>;
      return {
        name: asset.name, browser_download_url: asset.browser_download_url,
        digest: asset.digest, size: asset.size,
      };
    }),
  };
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class ReleaseUpdates implements vscode.Disposable {
  private readonly startup: ReturnType<typeof setTimeout>;
  private readonly interval: ReturnType<typeof setInterval>;
  private readonly focus: vscode.Disposable;
  private readonly changed = new vscode.EventEmitter<UpdateState>();
  private checking = false;
  private installing = false;
  private disposed = false;
  private current: UpdateState = { state: 'idle' };

  /** Fires when an update is checked, downloaded, installed or applied. */
  readonly onDidChangeState = this.changed.event;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.startup = setTimeout(() => void this.automaticCheck(STARTUP_MIN_GAP_MS), STARTUP_DELAY_MS);
    this.interval = setInterval(() => void this.automaticCheck(UPDATE_CHECK_INTERVAL_MS), UPDATE_CHECK_INTERVAL_MS);
    // Timers drift while a laptop sleeps; re-check when the window regains focus.
    this.focus = vscode.window.onDidChangeWindowState((state) => {
      if (state.focused) {
        void this.automaticCheck(UPDATE_CHECK_INTERVAL_MS);
      }
    });
    void this.announceCompletedUpdate();
  }

  get state(): UpdateState {
    return this.current;
  }

  get version(): string {
    return this.context.extension.packageJSON.version as string;
  }

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.startup);
    clearInterval(this.interval);
    this.focus.dispose();
    this.changed.dispose();
  }

  mode(): UpdateMode {
    const config = vscode.workspace.getConfiguration('sbcCode');
    const explicit = config.inspect<string>('autoUpdate');
    const configured = explicit?.workspaceFolderValue ?? explicit?.workspaceValue ?? explicit?.globalValue;
    return resolveUpdateMode(configured, config.get<boolean>('updateNotifications', true));
  }

  private setState(next: UpdateState): void {
    this.current = next;
    if (!this.disposed) {
      this.changed.fire(next);
    }
  }

  private async automaticCheck(minimumGap: number): Promise<void> {
    // Development hosts should not install release builds over the code being debugged.
    if (this.context.extensionMode !== vscode.ExtensionMode.Production || this.mode() === 'off') {
      return;
    }
    const last = this.context.globalState.get<number>(LAST_CHECK_KEY);
    if (!isCheckDue(last, Date.now(), minimumGap)) {
      return;
    }
    await this.check(false);
  }

  async check(manual: boolean): Promise<void> {
    if (this.checking || this.installing || this.disposed) {
      return;
    }
    const mode = this.mode();
    if (!manual && mode === 'off') {
      return;
    }

    this.checking = true;
    const previous = this.current;
    if (manual) {
      this.setState({ state: 'checking' });
    }
    try {
      await this.context.globalState.update(LAST_CHECK_KEY, Date.now());
      const data = await this.fetchLatestRelease();
      if (data === undefined) {
        this.setState(previous);
        if (manual) {
          void vscode.window.showInformationMessage('SBC Code: no GitHub Release has been published yet.');
        }
        return;
      }
      const release = parseOfficialRelease(data, this.version);
      if (!release) {
        this.setState(previous);
        if (manual) {
          void vscode.window.showInformationMessage('SBC Code v' + this.version + ' is up to date.');
        }
        return;
      }

      // Another window may already have installed this release.
      if (this.context.globalState.get<string>(INSTALLED_RELEASE_KEY) === release.tag) {
        this.setState({ state: 'installed', version: release.version, releaseUrl: release.releaseUrl });
        if (manual) {
          await this.promptReload(release);
        }
        return;
      }

      if (release.asset && (mode === 'install' || manual)) {
        this.checking = false;
        await this.install(release, manual);
        return;
      }

      this.setState({ state: 'available', version: release.version, releaseUrl: release.releaseUrl });
      if (!manual && this.context.globalState.get<string>(LAST_NOTIFIED_KEY) === release.tag) {
        return;
      }
      await this.context.globalState.update(LAST_NOTIFIED_KEY, release.tag);
      await this.notify(release);
    } catch (error) {
      this.setState(previous);
      if (manual) {
        void vscode.window.showWarningMessage('SBC Code: update check failed. ' + errorText(error));
      }
      // Automatic checks fail silently when offline.
    } finally {
      this.checking = false;
    }
  }

  /** Conditional GitHub lookup: unchanged releases return 304 and do not use the API rate limit. */
  private async fetchLatestRelease(): Promise<unknown> {
    const etag = this.context.globalState.get<string>(ETAG_KEY);
    const cached = this.context.globalState.get<unknown>(CACHED_RELEASE_KEY);
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': USER_AGENT,
    };
    if (etag && cached) {
      headers['If-None-Match'] = etag;
    }
    const response = await fetch(LATEST_RELEASE_API, {
      redirect: 'error',
      signal: AbortSignal.timeout(12000),
      headers,
    });
    if (response.status === 304 && cached) {
      return cached;
    }
    if (response.status === 404) {
      return undefined;
    }
    if (!response.ok) {
      throw new Error('GitHub release lookup returned HTTP ' + response.status);
    }
    const data = compactRelease(await response.json());
    await this.context.globalState.update(CACHED_RELEASE_KEY, data);
    await this.context.globalState.update(ETAG_KEY, response.headers.get('etag') ?? undefined);
    return data;
  }

  private async notify(release: AvailableRelease): Promise<void> {
    const actions = release.asset
      ? ['Install Update', 'View Release', 'Later'] as const
      : ['View Release', 'Later'] as const;
    const selection = await vscode.window.showInformationMessage(
      'SBC Code v' + release.version + ' is available.',
      ...actions,
    );
    if (selection === 'View Release') {
      await vscode.env.openExternal(vscode.Uri.parse(release.releaseUrl));
    } else if (selection === 'Install Update' && release.asset) {
      await this.install(release, true);
    }
  }

  private async promptReload(release: AvailableRelease): Promise<void> {
    const action = await vscode.window.showInformationMessage(
      'SBC Code v' + release.version + ' is installed. Reload VS Code to start using it.',
      'Reload Now',
      'Release Notes',
    );
    if (action === 'Reload Now') {
      await vscode.commands.executeCommand('workbench.action.reloadWindow');
    } else if (action === 'Release Notes') {
      await vscode.env.openExternal(vscode.Uri.parse(release.releaseUrl));
    }
  }

  private async download(release: AvailableRelease, token?: vscode.CancellationToken): Promise<vscode.Uri> {
    const asset = release.asset!;
    const controller = new AbortController();
    const cancellation = token?.onCancellationRequested(() => controller.abort());
    const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000);
    try {
      const response = await fetch(asset.url, {
        redirect: 'follow', // GitHub redirects release downloads to its asset CDN.
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT },
      });
      if (!response.ok || !response.body) {
        throw new Error('VSIX download failed (HTTP ' + response.status + ').');
      }
      const headerSize = Number(response.headers.get('content-length') || '0');
      if (headerSize > MAX_VSIX_BYTES) {
        throw new Error('VSIX download is larger than the 30 MiB safety limit.');
      }
      const reader = response.body.getReader();
      const hasher = createHash('sha256');
      const chunks: Buffer[] = [];
      let total = 0;
      try {
        while (true) {
          const piece = await reader.read();
          if (piece.done) {
            break;
          }
          total += piece.value.byteLength;
          if (total > MAX_VSIX_BYTES) {
            throw new Error('VSIX download exceeded the 30 MiB safety limit.');
          }
          const buffer = Buffer.from(piece.value);
          hasher.update(buffer);
          chunks.push(buffer);
        }
      } finally {
        reader.releaseLock();
      }
      if (token?.isCancellationRequested) {
        throw new Error('Download cancelled.');
      }
      if (total !== asset.size || hasher.digest('hex') !== asset.sha256) {
        throw new Error('VSIX checksum or size mismatch. Update was not installed.');
      }
      await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
      const fileUri = vscode.Uri.joinPath(this.context.globalStorageUri, asset.name);
      await vscode.workspace.fs.writeFile(fileUri, Buffer.concat(chunks));
      return fileUri;
    } finally {
      clearTimeout(timeout);
      cancellation?.dispose();
    }
  }

  /**
   * Download, verify and install a release. Background installs report
   * progress in the status bar; manual installs use a cancellable notification.
   */
  private async install(release: AvailableRelease, interactive: boolean): Promise<void> {
    if (!release.asset || this.installing) {
      return;
    }
    this.installing = true;
    this.setState({ state: 'downloading', version: release.version });
    let retry = false;
    try {
      const fileUri = interactive
        ? await vscode.window.withProgress({
          title: 'SBC Code: downloading and verifying v' + release.version,
          location: vscode.ProgressLocation.Notification,
          cancellable: true,
        }, (_progress, token) => this.download(release, token))
        : await vscode.window.withProgress({
          title: 'SBC Code: updating to v' + release.version,
          location: vscode.ProgressLocation.Window,
        }, () => this.download(release));
      // Built-in documented VS Code command: installs a local VSIX URI.
      await vscode.commands.executeCommand('workbench.extensions.installExtension', fileUri);
      await this.context.globalState.update(INSTALLED_RELEASE_KEY, release.tag);
      await this.context.globalState.update(LAST_NOTIFIED_KEY, release.tag);
      await this.removeStaleDownloads(release.asset.name);
      this.setState({ state: 'installed', version: release.version, releaseUrl: release.releaseUrl });
      this.installing = false;
      await this.promptReload(release);
    } catch (error) {
      this.setState({ state: 'available', version: release.version, releaseUrl: release.releaseUrl });
      this.installing = false;
      const action = await vscode.window.showWarningMessage(
        'SBC Code v' + release.version + ' could not be installed: ' + errorText(error),
        ...(interactive ? ['View Release'] : ['Retry', 'View Release']),
      );
      if (action === 'Retry') {
        retry = true;
      } else if (action === 'View Release') {
        await vscode.env.openExternal(vscode.Uri.parse(release.releaseUrl));
      }
    } finally {
      this.installing = false;
    }
    if (retry) {
      await this.install(release, true);
    }
  }

  private async removeStaleDownloads(keep?: string): Promise<void> {
    try {
      const entries = await vscode.workspace.fs.readDirectory(this.context.globalStorageUri);
      const names = entries.filter(([, type]) => type === vscode.FileType.File).map(([name]) => name);
      for (const name of staleVsixFiles(names, keep)) {
        await vscode.workspace.fs.delete(vscode.Uri.joinPath(this.context.globalStorageUri, name));
      }
    } catch {
      // The storage directory does not exist until the first download.
    }
  }

  /** After a reload into a new version, announce it once and tidy old downloads. */
  private async announceCompletedUpdate(): Promise<void> {
    const previous = this.context.globalState.get<string>(LAST_RUN_VERSION_KEY);
    const version = this.version;
    if (previous === version) {
      return;
    }
    await this.context.globalState.update(LAST_RUN_VERSION_KEY, version);
    await this.context.globalState.update(INSTALLED_RELEASE_KEY, undefined);
    await this.removeStaleDownloads();
    if (previous && this.context.extensionMode === vscode.ExtensionMode.Production) {
      this.setState({
        state: 'updated', version,
        releaseUrl: 'https://github.com/sbc-apps/sbc-code/releases/tag/v' + version,
      });
    }
  }
}
