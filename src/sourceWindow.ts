/**
 * Read a bounded source window without normalizing line endings.
 * A line range makes it possible to inspect a large file using a small
 * context budget, while returning only text the model is allowed to edit.
 */
export interface SourceWindow {
  content: string;
  start_line: number;
  end_line: number;
  total_lines: number;
  complete: boolean;
}

export const MAX_AGENT_READ_CHARS = 18000;
export const MAX_AGENT_READ_LINES = 250;

export function selectSourceWindow(source: string, startLine?: number, endLine?: number): SourceWindow {
  if (typeof source !== 'string' || source.includes('\0')) {
    throw new Error('Binary or invalid source cannot be read.');
  }
  if ((startLine === undefined) !== (endLine === undefined)) {
    throw new Error('Provide both start_line and end_line, or omit both.');
  }

  const lineStarts: number[] = [0];
  const terminators = /\r\n|\n|\r/g;
  let match: RegExpExecArray | null;
  while ((match = terminators.exec(source)) !== null) {
    lineStarts.push(match.index + match[0].length);
  }
  const totalLines = lineStarts.length;
  const from = startLine ?? 1;
  const to = endLine ?? totalLines;
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) ||
      from < 1 || to < from || to > totalLines) {
    throw new Error('Invalid source line range: use 1-based lines within the file.');
  }
  if (endLine !== undefined && to - from + 1 > MAX_AGENT_READ_LINES) {
    throw new Error('Read at most 250 source lines at a time.');
  }
  const start = lineStarts[from - 1];
  const end = to < totalLines ? lineStarts[to] : source.length;
  const content = source.slice(start, end);
  if (content.length > MAX_AGENT_READ_CHARS) {
    throw new Error('Source window exceeds 18,000 characters. Request a smaller line range.');
  }
  return {
    content,
    start_line: from,
    end_line: to,
    total_lines: totalLines,
    complete: from === 1 && to === totalLines,
  };
}
