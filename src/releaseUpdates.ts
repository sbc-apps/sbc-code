import * as vscode from 'vscode';
import { createHash } from 'node:crypto';
import { AvailableRelease, MAX_VSIX_BYTES, parseOfficialRelease } from './releaseMetadata';

const LATEST_RELEASE_API = 'https://api.github.com/repos/sbc-apps/sbc-code/releases/latest';
const LAST_NOTIFIED_KEY = 'sbcCode.lastNotifiedRelease';
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 7000;

export class ReleaseUpdates implements vscode.Disposable {
  private readonly startup: ReturnType<typeof setTimeout>;
  private readonly interval: ReturnType<typeof setInterval>;
  private checking = false;
  private installing = false;
  private disposed = false;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.startup = setTimeout(() => void this.check(false), STARTUP_DELAY_MS);
    this.interval = setInterval(() => void this.check(false), CHECK_INTERVAL_MS);
  }

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.startup);
    clearInterval(this.interval);
  }

  async check(manual: boolean): Promise<void> {
    if (this.checking || this.installing || this.disposed) {
      return;
    }
    const configured = vscode.workspace.getConfiguration('sbcCode').get<boolean>('updateNotifications', true);
    if (!manual && !configured) {
      return;
    }
    // Development hosts should not show update prompts while debugging code.
    if (!manual && this.context.extensionMode !== vscode.ExtensionMode.Production) {
      return;
    }

    this.checking = true;
    try {
      const response = await fetch(LATEST_RELEASE_API, {
        redirect: 'error',
        signal: AbortSignal.timeout(12000),
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'sbc-code-vscode-extension',
        },
      });

      if (response.status === 404) {
        if (manual) {
          void vscode.window.showInformationMessage('SBC Code: no GitHub Release has been published yet.');
        }
        return;
      }
      if (!response.ok) {
        throw new Error('GitHub release lookup returned HTTP ' + response.status);
      }

      const data = await response.json() as unknown;
      const release = parseOfficialRelease(data, this.context.extension.packageJSON.version as string);
      if (!release) {
        if (manual) {
          void vscode.window.showInformationMessage('SBC Code is up to date.');
        }
        return;
      }
      if (!manual && this.context.globalState.get<string>(LAST_NOTIFIED_KEY) === release.tag) {
        return;
      }
      await this.context.globalState.update(LAST_NOTIFIED_KEY, release.tag);
      await this.notify(release);
    } catch (error) {
      if (manual) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showWarningMessage('SBC Code: update check failed. ' + message);
      }
      // Automatic checks fail silently when offline.
    } finally {
      this.checking = false;
    }
  }

  private async notify(release: AvailableRelease): Promise<void> {
    const actions = release.asset
      ? ['Install Update', 'View Release', 'Later'] as const
      : ['View Release', 'Later'] as const;
    const selection = await vscode.window.showInformationMessage(
      'SBC Code v' + release.version + ' is available on GitHub Releases.',
      ...actions,
    );
    if (selection === 'View Release') {
      await vscode.env.openExternal(vscode.Uri.parse(release.releaseUrl));
    } else if (selection === 'Install Update' && release.asset) {
      await this.install(release);
    }
  }

  private async install(release: AvailableRelease): Promise<void> {
    if (!release.asset || this.installing) {
      return;
    }
    this.installing = true;
    try {
      const fileUri = await vscode.window.withProgress({
        title: 'SBC Code: downloading and verifying v' + release.version,
        location: vscode.ProgressLocation.Notification,
        cancellable: true,
      }, async (_progress, token) => {
        const controller = new AbortController();
        const cancellation = token.onCancellationRequested(() => controller.abort());
        try {
          const response = await fetch(release.asset!.url, {
            redirect: 'follow', // GitHub redirects release downloads to its asset CDN.
            signal: controller.signal,
            headers: { 'User-Agent': 'sbc-code-vscode-extension' },
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
          if (token.isCancellationRequested) {
            throw new Error('Download cancelled.');
          }
          if (total !== release.asset!.size || hasher.digest('hex') !== release.asset!.sha256) {
            throw new Error('VSIX checksum or size mismatch. Update was not installed.');
          }
          await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
          const fileUri = vscode.Uri.joinPath(this.context.globalStorageUri, release.asset!.name);
          await vscode.workspace.fs.writeFile(fileUri, Buffer.concat(chunks));
          return fileUri;
        } finally {
          cancellation.dispose();
        }
      });
      // Built-in documented VS Code command: installs a local VSIX URI.
      await vscode.commands.executeCommand('workbench.extensions.installExtension', fileUri);
      const action = await vscode.window.showInformationMessage(
        'SBC Code v' + release.version + ' installed. Reload VS Code to activate it.',
        'Reload Window',
        'Later',
      );
      if (action === 'Reload Window') {
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const action = await vscode.window.showErrorMessage(
        'SBC Code update could not be installed: ' + message,
        'View Release',
      );
      if (action === 'View Release') {
        await vscode.env.openExternal(vscode.Uri.parse(release.releaseUrl));
      }
    } finally {
      this.installing = false;
    }
  }
}
