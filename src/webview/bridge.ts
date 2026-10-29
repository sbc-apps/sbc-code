/** Typed wrapper around the VS Code webview messaging API. */
interface VsCodeApi {
  postMessage(message: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const api: VsCodeApi = typeof acquireVsCodeApi === 'function'
  ? acquireVsCodeApi()
  : { postMessage: (message) => console.debug('[sbc-code] post', message) };

export type OutgoingMessage =
  | { type: 'ready' | 'cancel' | 'attachFiles' | 'openFolder' | 'refreshModels' | 'setApiKey' }
  | { type: 'fixDiagnostics' | 'restoreLastEdit' | 'clear' | 'openSettings' | 'checkUpdates' }
  | { type: 'reloadWindow' | 'openReleaseNotes' }
  | { type: 'send'; prompt: string; attachSelection: boolean; agentMode: boolean }
  | { type: 'removeFile'; file: string }
  | { type: 'openFile'; path: string }
  | { type: 'setModel'; model: string }
  | { type: 'setProvider'; provider: Provider }
  | { type: 'copy'; text: string };

export type Provider = 'colibri' | 'ollama';

export function post(message: OutgoingMessage): void {
  api.postMessage(message);
}
