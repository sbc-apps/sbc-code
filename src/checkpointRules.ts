export interface TextCheckpointEntry {
  before: string | null;
  after: string;
}

export const MAX_CHECKPOINT_CHARACTERS = 2_000_000;

export function canStoreCheckpoint(changes: readonly TextCheckpointEntry[]): boolean {
  return changes.length > 0 &&
    changes.reduce((total, change) => total + (change.before?.length ?? 0) + change.after.length, 0) <= MAX_CHECKPOINT_CHARACTERS;
}

/** Exact match prevents a restore from silently overwriting edits made after an AI change. */
export function hasUnmodifiedAiResult(current: string, aiResult: string): boolean {
  return current === aiResult;
}
