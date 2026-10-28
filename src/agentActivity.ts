export type ActivityState = 'thinking' | 'started' | 'finished';

export interface AgentActivity {
  state: ActivityState;
  step: string;
  id?: string;
  result?: 'done' | 'declined' | 'error';
}

/** Prevent tool output or source content from being displayed in the activity summary. */
export function summarizeToolResult(output: string): 'done' | 'declined' | 'error' {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return 'done';
  }
  if (parsed && typeof parsed === 'object') {
    const value = parsed as { error?: unknown; applied?: unknown; ran?: unknown };
    if (value.error !== undefined) {
      return 'error';
    }
    if (value.applied === false || value.ran === false) {
      return 'declined';
    }
  }
  return 'done';
}
