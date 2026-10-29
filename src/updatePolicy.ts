/** Pure update scheduling rules, kept free of VS Code APIs so they can be unit tested. */
export type UpdateMode = 'install' | 'notify' | 'off';

export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** Several VS Code windows share one extension state; avoid duplicate startup lookups. */
export const STARTUP_MIN_GAP_MS = 60 * 60 * 1000;

export function isUpdateMode(value: unknown): value is UpdateMode {
  return value === 'install' || value === 'notify' || value === 'off';
}

/**
 * An explicit sbcCode.autoUpdate value wins. Otherwise the legacy
 * sbcCode.updateNotifications=false switch still disables update checks.
 */
export function resolveUpdateMode(explicitMode: unknown, legacyNotifications: unknown): UpdateMode {
  if (isUpdateMode(explicitMode)) {
    return explicitMode;
  }
  return legacyNotifications === false ? 'off' : 'install';
}

/** True when an automatic check is due; clock changes into the past also trigger a check. */
export function isCheckDue(lastCheck: number | undefined, now: number, minimumGap: number): boolean {
  if (lastCheck === undefined || !Number.isFinite(lastCheck) || lastCheck > now) {
    return true;
  }
  return now - lastCheck >= minimumGap;
}

/** Previously downloaded VSIX files that can be removed from extension storage. */
export function staleVsixFiles(names: readonly string[], keep?: string): string[] {
  return names.filter((name) => /^sbc-code-\d+\.\d+\.\d+\.vsix$/.test(name) && name !== keep);
}
