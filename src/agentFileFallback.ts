/**
 * Constrained fallback for local models that answer with code instead of tool calls.
 * It only acts on an explicit file-creation request and never guesses a path from
 * model prose. The tool runner remains the sole writer.
 */
export interface GeneratedFileTarget {
  path: string;
  language: 'html' | 'code';
}

const FILE_RE = /(?:^|[\s"'\x60])((?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:html|css|js|jsx|ts|tsx|json|md|py|go|rs|sql|yaml|yml))(?=$|[\s"'\x60,.:;!?])/gi;

export function getRequestedFileTarget(userMessage: string): GeneratedFileTarget | undefined {
  const prompt = userMessage.includes('User request:\n')
    ? userMessage.slice(userMessage.lastIndexOf('User request:\n') + 'User request:\n'.length)
    : userMessage;
  if (!/\b(create|build|make|generate|write|add)\b/i.test(prompt)) {
    return undefined;
  }
  const paths = [...prompt.matchAll(FILE_RE)].map((match) => match[1]);
  const unique = [...new Set(paths)];
  if (unique.length > 1) {
    return undefined; // Multi-file jobs require real tool calls.
  }
  if (unique.length === 1) {
    const name = unique[0];
    return { path: name, language: /\.html$/i.test(name) ? 'html' : 'code' };
  }
  // Safe conventional default when a user explicitly requests an HTML webpage.
  if (/\b(html|webpage|web page|website)\b/i.test(prompt) &&
      /\b(calculator|landing page|single.page|html page)\b/i.test(prompt)) {
    return { path: 'index.html', language: 'html' };
  }
  return undefined;
}

export function extractGeneratedFile(text: string, target: GeneratedFileTarget): string | undefined {
  const fence = String.fromCharCode(96).repeat(3);
  const expression = new RegExp(fence + '([A-Za-z0-9_-]*)[^\\n]*\\n([\\s\\S]*?)\\n?' + fence, 'g');
  const blocks = [...text.matchAll(expression)];
  let candidate: string | undefined;
  if (blocks.length === 1) {
    const lang = blocks[0][1].toLowerCase();
    if (target.language === 'html' && lang && lang !== 'html' && lang !== 'htm') {
      return undefined;
    }
    candidate = blocks[0][2];
  } else if (blocks.length === 0 && target.language === 'html') {
    const match = /(?:<!doctype html[^>]*>\s*)?<html\b[\s\S]*?<\/html>/i.exec(text);
    candidate = match?.[0];
  }
  if (!candidate || candidate.length > 100000 || candidate.includes('\0')) {
    return undefined;
  }
  if (target.language === 'html' && !/<html\b[^>]*>[\s\S]*<\/html>/i.test(candidate)) {
    return undefined;
  }
  return candidate.trimEnd() + '\n';
}
