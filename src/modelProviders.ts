export type ModelProvider = 'colibri' | 'ollama';

export const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';

/**
 * Ollama accepts both an origin URL and an OpenAI-compatible /v1 URL.
 * Restrict the configured path to these documented forms to avoid sending
 * code to a surprising API endpoint when the provider is changed.
 */
function ollamaUrl(raw: string, endpoint: 'v1' | 'api'): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error('Invalid Ollama URL. Use http://127.0.0.1:11434.');
  }
  if (!['/', '', '/v1', '/v1/', '/api', '/api/'].includes(url.pathname)) {
    throw new Error('Ollama URL must be a server origin, /v1 or /api endpoint.');
  }
  url.pathname = '/' + endpoint;
  return url.toString();
}

export function ollamaChatBase(raw: string): string {
  return ollamaUrl(raw, 'v1');
}

export function ollamaNativeBase(raw: string): string {
  return ollamaUrl(raw, 'api');
}

/** Native Ollama GET /api/tags response (the model ID is the name/tag). */
export function parseOllamaModelIds(input: unknown): string[] {
  if (!input || typeof input !== 'object' || !('models' in input)) {
    throw new Error('Ollama returned an invalid /api/tags response.');
  }
  const items = (input as { models: unknown }).models;
  if (!Array.isArray(items)) {
    throw new Error('Ollama model list is not an array.');
  }
  return [...new Set(items.map((item: unknown) => {
    if (!item || typeof item !== 'object') {
      return '';
    }
    const value = item as { name?: unknown; model?: unknown };
    return typeof value.name === 'string'
      ? value.name
      : typeof value.model === 'string' ? value.model : '';
  }).filter((id: string) => id.trim().length > 0))];
}
