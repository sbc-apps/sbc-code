import type { AgentToolMessage, ToolAssistantReply } from './agentTypes';
export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface CompletionOptions {
  maxTokens: number;
  temperature: number;
  signal?: AbortSignal;
}

export interface ApiConfiguration {
  baseUrl: string;
  allowInsecureRemote: boolean;
}

interface CompletionReply {
  choices?: Array<{
    message?: { content?: unknown };
    delta?: { content?: unknown };
    text?: string;
  }>;
  error?: { message?: string };
}

export function buildEndpoint(baseUrl: string, suffix: string, allowInsecureRemote = false): string {
  let url: URL;
  try {
    url = new URL(baseUrl.trim());
  } catch {
    throw new Error('Invalid SBC Code base URL. Set sbcCode.baseUrl to a Colibri /v1 endpoint.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only HTTP and HTTPS endpoints are supported.');
  }
  if (url.username || url.password || url.hash || url.search) {
    throw new Error('The API base URL cannot include credentials, a query string or a fragment.');
  }

  const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  if (url.protocol === 'http:' && !localHosts.has(url.hostname.toLowerCase()) && !allowInsecureRemote) {
    throw new Error('Remote HTTP is disabled to protect source code. Use HTTPS, or explicitly enable sbcCode.allowInsecureRemote.');
  }

  url.pathname = url.pathname.replace(/\/+$/, '') + '/' + suffix.replace(/^\/+/, '');
  return url.toString();
}

export class SseDecoder {
  private buffer = '';

  feed(chunk: string): string[] {
    this.buffer += chunk;
    const events: string[] = [];
    const separator = /(?:\r\n|\n|\r)(?:\r\n|\n|\r)/;

    while (true) {
      const match = separator.exec(this.buffer);
      if (!match) {
        break;
      }
      const raw = this.buffer.slice(0, match.index);
      this.buffer = this.buffer.slice(match.index + match[0].length);
      const data = this.decodeEvent(raw);
      if (data !== undefined) {
        events.push(data);
      }
    }
    return events;
  }

  finish(): string[] {
    const remainder = this.buffer;
    this.buffer = '';
    const data = this.decodeEvent(remainder);
    return data === undefined ? [] : [data];
  }

  private decodeEvent(event: string): string | undefined {
    const lines = event.split(/\r\n|\r|\n/);
    const data = lines
      .filter((line) => line === 'data' || line.startsWith('data:'))
      .map((line) => line === 'data' ? '' : line.slice(5).replace(/^ /, ''));
    return data.length ? data.join('\n') : undefined;
  }
}

export function extractResponseText(body: CompletionReply): string {
  const content = body.choices?.[0]?.message?.content ?? body.choices?.[0]?.delta?.content;
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content.map((part) =>
      part && typeof part === 'object' && 'text' in part && typeof part.text === 'string'
        ? part.text
        : ''
    ).join('');
  }
  return body.choices?.[0]?.text ?? '';
}

export function parseModelIds(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object' || !('data' in payload)) {
    throw new Error('Model server returned an invalid /v1/models response.');
  }
  const data = (payload as { data: unknown }).data;
  if (!Array.isArray(data)) {
    throw new Error('Model list is not an array.');
  }
  return [...new Set(data
    .map((item: unknown) =>
      item && typeof item === 'object' && 'id' in item && typeof item.id === 'string'
        ? item.id
        : ''
    )
    .filter((id: string) => id.length > 0))];
}

export class ColibriClient {
  constructor(
    private readonly readConfiguration: () => ApiConfiguration,
    private readonly readApiKey: () => Promise<string | undefined>,
  ) {}

  async models(signal?: AbortSignal): Promise<string[]> {
    const response = await this.request('models', { method: 'GET', signal });
    await this.throwOnError(response);
    return parseModelIds(await response.json());
  }

  async complete(model: string, messages: ChatMessage[], options: CompletionOptions): Promise<string> {
    const response = await this.request('chat/completions', {
      method: 'POST',
      signal: options.signal,
      body: JSON.stringify(this.body(model, messages, options, false)),
    });
    await this.throwOnError(response);
    const reply = (await response.json()) as CompletionReply;
    if (reply.error?.message) {
      throw new Error(reply.error.message);
    }
    return extractResponseText(reply);
  }

  async agentStep(
    model: string,
    messages: AgentToolMessage[],
    tools: readonly unknown[],
    options: CompletionOptions,
  ): Promise<ToolAssistantReply> {
    if (!model.trim()) {
      throw new Error('Choose a model before starting Agent mode.');
    }
    const response = await this.request('chat/completions', {
      method: 'POST',
      signal: options.signal,
      body: JSON.stringify({
        model,
        messages,
        tools,
        tool_choice: 'auto',
        stream: false,
        max_tokens: options.maxTokens,
        temperature: options.temperature,
      }),
    });
    await this.throwOnError(response);
    const body = await response.json() as {
      choices?: Array<{ message?: { content?: unknown; tool_calls?: unknown } }>;
      error?: { message?: string };
    };
    if (body.error?.message) {
      throw new Error(body.error.message);
    }
    const assistant = body.choices?.[0]?.message;
    if (!assistant) {
      throw new Error('Model did not return an agent message.');
    }
    const rawCalls = assistant.tool_calls;
    if (rawCalls !== undefined && !Array.isArray(rawCalls)) {
      throw new Error('Model returned malformed tool calls.');
    }
    const tool_calls = (rawCalls ?? []).map((entry: unknown) => {
      if (!entry || typeof entry !== 'object') {
        throw new Error('Invalid tool call from model.');
      }
      const call = entry as Record<string, unknown>;
      const fn = call.function as Record<string, unknown> | undefined;
      if (typeof call.id !== 'string' || call.type !== 'function' ||
        !fn || typeof fn.name !== 'string' || typeof fn.arguments !== 'string') {
        throw new Error('Model returned a tool call with invalid fields.');
      }
      return {
        id: call.id,
        type: 'function' as const,
        function: { name: fn.name, arguments: fn.arguments },
      };
    });
    return {
      content: typeof assistant.content === 'string' ? assistant.content : '',
      tool_calls,
    };
  }

  async stream(
    model: string,
    messages: ChatMessage[],
    options: CompletionOptions,
    onDelta: (text: string) => void,
  ): Promise<string> {
    const response = await this.request('chat/completions', {
      method: 'POST',
      signal: options.signal,
      body: JSON.stringify(this.body(model, messages, options, true)),
    });
    await this.throwOnError(response);

    if (!response.headers.get('content-type')?.includes('text/event-stream')) {
      const reply = (await response.json()) as CompletionReply;
      if (reply.error?.message) {
        throw new Error(reply.error.message);
      }
      const text = extractResponseText(reply);
      if (text) {
        onDelta(text);
      }
      return text;
    }
    if (!response.body) {
      throw new Error('Model server returned an empty streaming response.');
    }

    const reader = response.body.getReader();
    const textDecoder = new TextDecoder();
    const sse = new SseDecoder();
    let result = '';
    let done = false;

    const consume = (data: string) => {
      if (data === '[DONE]') {
        done = true;
        return;
      }
      let event: CompletionReply;
      try {
        event = JSON.parse(data) as CompletionReply;
      } catch {
        throw new Error('Model server sent malformed streaming JSON.');
      }
      if (event.error?.message) {
        throw new Error(event.error.message);
      }
      const delta = extractResponseText(event);
      if (delta) {
        result += delta;
        onDelta(delta);
      }
    };

    try {
      while (!done) {
        const item = await reader.read();
        if (item.done) {
          break;
        }
        for (const data of sse.feed(textDecoder.decode(item.value, { stream: true }))) {
          consume(data);
          if (done) {
            break;
          }
        }
      }
      if (!done) {
        for (const data of sse.feed(textDecoder.decode()) .concat(sse.finish())) {
          consume(data);
        }
      }
    } finally {
      if (done) {
        await reader.cancel().catch(() => undefined);
      }
      reader.releaseLock();
    }
    return result;
  }

  private body(model: string, messages: ChatMessage[], options: CompletionOptions, stream: boolean) {
    if (!model.trim()) {
      throw new Error('No model selected. Run SBC Code: Select Model.');
    }
    return {
      model,
      messages,
      stream,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
    };
  }

  private async request(endpoint: string, options: RequestInit): Promise<Response> {
    const configuration = this.readConfiguration();
    const url = buildEndpoint(configuration.baseUrl, endpoint, configuration.allowInsecureRemote);
    const key = await this.readApiKey();
    const headers: Record<string, string> = { Accept: 'application/json, text/event-stream' };
    if (options.method === 'POST') {
      headers['Content-Type'] = 'application/json';
    }
    if (key) {
      headers.Authorization = 'Bearer ' + key;
    }
    try {
      return await fetch(url, { ...options, headers, redirect: 'error' });
    } catch (error) {
      if (options.signal?.aborted) {
        throw error;
      }
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error('Could not reach Colibri at ' + configuration.baseUrl + '. Start the server and check sbcCode.baseUrl. ' + detail);
    }
  }

  private async throwOnError(response: Response): Promise<void> {
    if (response.ok) {
      return;
    }
    let detail = (await response.text()).slice(0, 2000);
    try {
      const json = JSON.parse(detail) as { error?: { message?: string } };
      detail = json.error?.message ?? detail;
    } catch {
      // Preserve the server response if it is not JSON.
    }
    throw new Error('Model API HTTP ' + response.status + ': ' + detail);
  }
}
