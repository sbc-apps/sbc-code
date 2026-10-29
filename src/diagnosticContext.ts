/**
 * Bounded, text-only VS Code Problems context for a local coding agent.
 * No arbitrary diagnostic attributes, full file contents, or relatedInformation.
 */
export type DiagnosticLevel = 'error' | 'warning' | 'information' | 'hint';

export interface DiagnosticRecord {
  path: string;
  line: number;
  column: number;
  severity: DiagnosticLevel;
  message: string;
  source?: string;
  code?: string;
}

export interface DiagnosticSummary {
  diagnostics: DiagnosticRecord[];
  count: number;
  omitted: number;
}

const MAX_DIAGNOSTICS = 40;
const MAX_MESSAGE_CHARS = 320;

export function summarizeDiagnostics(items: readonly DiagnosticRecord[], max = MAX_DIAGNOSTICS): DiagnosticSummary {
  if (!Number.isSafeInteger(max) || max < 1 || max > MAX_DIAGNOSTICS) {
    throw new Error('Invalid diagnostic limit (1–40).');
  }
  const allowed = new Set<DiagnosticLevel>(['error', 'warning', 'information', 'hint']);
  const ordered = items.filter((item) =>
    allowed.has(item.severity) &&
    item.path.trim().length > 0 &&
    Number.isSafeInteger(item.line) && item.line > 0 &&
    Number.isSafeInteger(item.column) && item.column > 0
  ).sort((a, b) =>
    (a.severity === 'error' ? 0 : a.severity === 'warning' ? 1 : 2) -
    (b.severity === 'error' ? 0 : b.severity === 'warning' ? 1 : 2) ||
    a.path.localeCompare(b.path) || a.line - b.line || a.column - b.column
  );
  const diagnostics = ordered.slice(0, max).map((item) => ({
    path: item.path.slice(0, 400),
    line: item.line,
    column: item.column,
    severity: item.severity,
    message: item.message.replace(/\0/g, '').slice(0, MAX_MESSAGE_CHARS),
    ...(item.source ? { source: item.source.slice(0, 60) } : {}),
    ...(item.code ? { code: item.code.slice(0, 60) } : {}),
  }));
  return { diagnostics, count: ordered.length, omitted: ordered.length - diagnostics.length };
}

export function diagnosticsForAgent(summary: DiagnosticSummary): string {
  return JSON.stringify(summary);
}
