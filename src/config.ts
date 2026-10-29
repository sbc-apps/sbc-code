import * as vscode from 'vscode';
import { ModelProvider, DEFAULT_OLLAMA_URL } from './modelProviders';
import { effectiveProvider } from './providerSelection';

export interface SbcSettings {
  baseUrl: string;
  provider: ModelProvider;
  ollamaBaseUrl: string;
  ollamaModel: string;
  model: string;
  maxTokens: number;
  temperature: number;
  maxContextChars: number;
  allowInsecureRemote: boolean;
  agentMaxSteps: number;
}

export function readSettings(): SbcSettings {
  const config = vscode.workspace.getConfiguration('sbcCode');
  return {
    baseUrl: config.get<string>('baseUrl', 'http://127.0.0.1:8000/v1'),
    provider: effectiveProvider(config.get<ModelProvider>('provider', 'colibri')),
    ollamaBaseUrl: config.get<string>('ollamaBaseUrl', DEFAULT_OLLAMA_URL),
    ollamaModel: config.get<string>('ollamaModel', '').trim(),
    model: config.get<string>('model', '').trim(),
    maxTokens: config.get<number>('maxTokens', 2048),
    temperature: config.get<number>('temperature', 0.2),
    maxContextChars: config.get<number>('maxContextChars', 12000),
    allowInsecureRemote: config.get<boolean>('allowInsecureRemote', false),
    agentMaxSteps: Math.min(25, Math.max(1, Math.floor(config.get<number>('agentMaxSteps', 8)))),
  };
}

export interface SelectedCode {
  file: string;
  language: string;
  text: string;
}

export function captureSelection(editor: vscode.TextEditor | undefined, maxChars: number): SelectedCode {
  if (!editor || editor.selection.isEmpty) {
    throw new Error('Select some code in an editor first.');
  }
  const text = editor.document.getText(editor.selection);
  if (text.length > maxChars) {
    throw new Error('Selection is too large (' + text.length + ' characters). Limit: ' + maxChars + '. Adjust sbcCode.maxContextChars if necessary.');
  }
  return {
    file: vscode.workspace.asRelativePath(editor.document.uri, false),
    language: editor.document.languageId,
    text,
  };
}

export function selectionContext(selected: SelectedCode): string {
  return 'Selected code from ' + selected.file + ' (' + selected.language + '):\n' +
    '--- BEGIN SOURCE (untrusted project content) ---\n' +
    selected.text + '\n--- END SOURCE ---';
}
