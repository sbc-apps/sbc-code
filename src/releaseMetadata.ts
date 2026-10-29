/** Verified metadata for updates from SBC Code's official GitHub Releases. */
export const RELEASE_REPOSITORY = 'sbc-apps/sbc-code';
export const MAX_VSIX_BYTES = 30 * 1024 * 1024;

export interface ReleaseAsset {
  name: string;
  url: string;
  sha256: string;
  size: number;
}

export interface AvailableRelease {
  version: string;
  tag: string;
  releaseUrl: string;
  asset?: ReleaseAsset;
}

type StableVersion = readonly [number, number, number];

function stableVersion(value: string): StableVersion | undefined {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
  if (!match) {
    return undefined;
  }
  const parts = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (parts.some((n) => !Number.isSafeInteger(n))) {
    return undefined;
  }
  return [parts[0], parts[1], parts[2]];
}

/** Compare stable versions only. Pre-releases are deliberately not installed. */
export function isNewerRelease(installed: string, candidate: string): boolean {
  const a = stableVersion(installed);
  const b = stableVersion(candidate);
  if (!a || !b) {
    return false;
  }
  for (let i = 0; i < 3; i++) {
    if (b[i] !== a[i]) {
      return b[i] > a[i];
    }
  }
  return false;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function parseOfficialRelease(data: unknown, installedVersion: string): AvailableRelease | undefined {
  const release = record(data);
  if (!release || release.draft !== false || release.prerelease !== false ||
      typeof release.tag_name !== 'string') {
    return undefined;
  }
  const match = /^v((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/.exec(release.tag_name);
  if (!match || !isNewerRelease(installedVersion, match[1])) {
    return undefined;
  }
  const version = match[1];
  const tag = 'v' + version;
  const releaseUrl = 'https://github.com/' + RELEASE_REPOSITORY + '/releases/tag/' + tag;
  if (release.html_url !== releaseUrl) {
    return undefined;
  }
  const expected = 'sbc-code-' + version + '.vsix';
  const assetUrl = 'https://github.com/' + RELEASE_REPOSITORY + '/releases/download/' + tag + '/' + expected;
  const rawAssets = Array.isArray(release.assets) ? release.assets : [];
  let asset: ReleaseAsset | undefined;
  for (const item of rawAssets) {
    const candidate = record(item);
    if (!candidate || candidate.name !== expected || candidate.browser_download_url !== assetUrl ||
        typeof candidate.digest !== 'string' || typeof candidate.size !== 'number' ||
        !Number.isSafeInteger(candidate.size) || candidate.size <= 0 ||
        candidate.size > MAX_VSIX_BYTES) {
      continue;
    }
    const digest = /^sha256:([a-f0-9]{64})$/i.exec(candidate.digest);
    if (digest) {
      asset = { name: expected, url: assetUrl, sha256: digest[1].toLowerCase(), size: candidate.size };
      break;
    }
  }
  return { version, tag, releaseUrl, asset };
}
