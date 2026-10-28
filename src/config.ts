import * as vscode from 'vscode';

export interface SbcSettings {
  baseUrl: string;
  model: string;
  maxTokens: number;
  temperature: number;
  maxContextChars: number;
  allowInsecureRemote: boolean;
}

export function readSettings(): SbcSettings {
  const config = vscode.workspace.getConfiguration('sbcCode');
  return {
    baseUrl: config.get<string>('baseUrl', 'http://127.0.0.1:8000/v1'),
    model: config.get<string>('model', '').trim(),
    maxTokens: config.get<number>('maxTokens', 1024),
    temperature: config.get<number>('temperature', 0.2),
    maxContextChars: config.get<number>('maxContextChars', 12000),
    allowInsecureRemote: config.get<boolean>('allowInsecureRemote', false),
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
