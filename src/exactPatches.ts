/** Small, exact source replacements for local coding models.
 * No fuzzy matching: an ambiguous or stale snippet must never change a file.
 */
export interface ExactPatchHunk {
  find: string;
  replace: string;
}

export const MAX_PATCH_HUNKS = 8;
export const MAX_PATCH_FIND_CHARS = 16000;
export const MAX_PATCH_REPLACE_CHARS = 25000;
export const MAX_PATCH_RESULT_CHARS = 100000;

interface LocatedPatch {
  start: number;
  end: number;
  replacement: string;
  index: number;
}

/**
 * Apply all source patches against the ORIGINAL content, not against a
 * progressively modified buffer. This makes overlapping/ambiguous edits fail
 * instead of accidentally matching code produced by an earlier replacement.
 */
export function applyExactPatches(original: string, patches: readonly ExactPatchHunk[]): string {
  if (typeof original !== 'string' || original.includes('\0')) {
    throw new Error('Patching binary or non-text source is not allowed.');
  }
  if (!Array.isArray(patches) || patches.length === 0 || patches.length > MAX_PATCH_HUNKS) {
    throw new Error('Provide 1–8 exact snippet replacements per file.');
  }
  const located: LocatedPatch[] = [];
  for (const [index, patch] of patches.entries()) {
    if (!patch || typeof patch.find !== 'string' || patch.find.length < 1 ||
        patch.find.length > MAX_PATCH_FIND_CHARS ||
        typeof patch.replace !== 'string' || patch.replace.length > MAX_PATCH_REPLACE_CHARS ||
        patch.find.includes('\0') || patch.replace.includes('\0')) {
      throw new Error('Patch ' + (index + 1) + ' must have a non-empty find string and a valid replacement.');
    }
    const start = original.indexOf(patch.find);
    if (start < 0) {
      throw new Error('Patch ' + (index + 1) + ': original snippet not found. Read the latest file content and retry.');
    }
    if (original.indexOf(patch.find, start + 1) >= 0) {
      throw new Error('Patch ' + (index + 1) + ': snippet appears more than once. Include more surrounding lines to make it unique.');
    }
    located.push({ start, end: start + patch.find.length, replacement: patch.replace, index });
  }

  located.sort((a, b) => a.start - b.start);
  for (let index = 1; index < located.length; index++) {
    if (located[index].start < located[index - 1].end) {
      throw new Error('Patches ' + (located[index - 1].index + 1) + ' and ' +
        (located[index].index + 1) + ' overlap. Combine them into one snippet.');
    }
  }

  let next = '';
  let cursor = 0;
  for (const patch of located) {
    next += original.slice(cursor, patch.start);
    next += patch.replacement;
    cursor = patch.end;
  }
  next += original.slice(cursor);

  if (next.length > MAX_PATCH_RESULT_CHARS) {
    throw new Error('Resulting file exceeds the 100,000-character patch limit.');
  }
  if (next === original) {
    throw new Error('Proposed patch makes no changes.');
  }
  return next;
}
