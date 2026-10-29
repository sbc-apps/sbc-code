import { createHash } from 'node:crypto';

/** Key on the text immediately around the cursor, which determines the completion. */
export function completionCacheKey(model: string, language: string, before: string, after: string): string {
  return createHash('sha1')
    .update(model).update('\0').update(language).update('\0')
    .update(before.slice(-1200)).update('\0').update(after.slice(0, 200))
    .digest('hex');
}

/** Small least-recently-used cache; an empty string records "no suggestion". */
export class CompletionCache {
  private readonly entries = new Map<string, string>();

  constructor(private readonly capacity: number) {}

  get(key: string): string | undefined {
    const value = this.entries.get(key);
    if (value !== undefined) {
      this.entries.delete(key);
      this.entries.set(key, value);
    }
    return value;
  }

  set(key: string, value: string): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.capacity) {
      this.entries.delete(this.entries.keys().next().value!);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}
