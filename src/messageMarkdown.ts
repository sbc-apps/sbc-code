/**
 * Minimal, safe Markdown subset for model replies. The output is a plain data
 * tree rendered with React text nodes; model output is never treated as HTML.
 */
export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'em'; text: string };

export type Block =
  | { kind: 'paragraph'; inlines: Inline[] }
  | { kind: 'heading'; level: 1 | 2 | 3; inlines: Inline[] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] }
  | { kind: 'quote'; inlines: Inline[] }
  | { kind: 'code'; language: string; code: string; complete: boolean };

const INLINE = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\s][^*\n]*\*|_[^_\s][^_\n]*_)/g;

export function parseInline(text: string): Inline[] {
  const result: Inline[] = [];
  let cursor = 0;
  for (const match of text.matchAll(INLINE)) {
    const token = match[0];
    const index = match.index ?? 0;
    // Do not treat snake_case identifiers as emphasis.
    if (token.startsWith('_') && index > 0 && /\w/.test(text[index - 1])) {
      continue;
    }
    if (index > cursor) {
      result.push({ kind: 'text', text: text.slice(cursor, index) });
    }
    if (token.startsWith('`')) {
      result.push({ kind: 'code', text: token.slice(1, -1) });
    } else if (token.startsWith('**') || token.startsWith('__')) {
      result.push({ kind: 'strong', text: token.slice(2, -2) });
    } else {
      result.push({ kind: 'em', text: token.slice(1, -1) });
    }
    cursor = index + token.length;
  }
  if (cursor < text.length) {
    result.push({ kind: 'text', text: text.slice(cursor) });
  }
  return result;
}

const FENCE = /^\s*(```+|~~~+)\s*([^\s`]*)/;
const LIST_ITEM = /^\s*(?:([-*+])|(\d{1,4})[.)])\s+(.*)$/;

/** Parse a (possibly still streaming) reply. An unterminated fence is an incomplete code block. */
export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ kind: 'paragraph', inlines: parseInline(paragraph.join('\n')) });
      paragraph = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = FENCE.exec(line);
    if (fence) {
      flushParagraph();
      const marker = fence[1];
      const code: string[] = [];
      let complete = false;
      for (i++; i < lines.length; i++) {
        if (lines[i].trim().startsWith(marker) && lines[i].trim().replace(/[`~]/g, '') === '') {
          complete = true;
          break;
        }
        code.push(lines[i]);
      }
      blocks.push({ kind: 'code', language: fence[2].slice(0, 40), code: code.join('\n'), complete });
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      const level = Math.min(3, heading[1].length) as 1 | 2 | 3;
      blocks.push({ kind: 'heading', level, inlines: parseInline(heading[2].replace(/\s+#+\s*$/, '')) });
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      flushParagraph();
      const ordered = item[2] !== undefined;
      const items: Inline[][] = [parseInline(item[3])];
      while (i + 1 < lines.length) {
        const next = LIST_ITEM.exec(lines[i + 1]);
        if (!next || (next[2] !== undefined) !== ordered) {
          break;
        }
        items.push(parseInline(next[3]));
        i++;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }
    if (line.startsWith('>')) {
      flushParagraph();
      const quoted = [line.replace(/^>\s?/, '')];
      while (i + 1 < lines.length && lines[i + 1].startsWith('>')) {
        quoted.push(lines[++i].replace(/^>\s?/, ''));
      }
      blocks.push({ kind: 'quote', inlines: parseInline(quoted.join('\n')) });
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  return blocks;
}
