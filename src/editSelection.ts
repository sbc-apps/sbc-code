import * as vscode from 'vscode';
import { ColibriClient } from './colibriClient';
import { readSettings, captureSelection } from './config';
import { cleanReplacement, editMessages } from './codeEdit';
import { EditCheckpoints } from './editCheckpoints';

const PREVIEW_SCHEME = 'sbc-code-preview';

class PreviewProvider implements vscode.TextDocumentContentProvider {
  private readonly previews = new Map<string, string>();

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.previews.get(uri.toString()) ?? '';
  }

  add(uri: vscode.Uri, content: string): void {
    this.previews.set(uri.toString(), content);
    if (this.previews.size > 12) {
      const first = this.previews.keys().next().value;
      if (first) {
        this.previews.delete(first);
      }
    }
  }
}

export class EditSelectionController {
  private readonly preview = new PreviewProvider();

  constructor(
    private readonly api: ColibriClient,
    private readonly getModel: () => string,
    private readonly checkpoints: EditCheckpoints,
    context: vscode.ExtensionContext,
  ) {
    context.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider(PREVIEW_SCHEME, this.preview),
    );
  }

  async run(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    const settings = readSettings();
    const selected = captureSelection(editor, settings.maxContextChars);
    if (!editor) {
      return;
    }
    if (editor.document.uri.scheme !== 'file' && editor.document.uri.scheme !== 'untitled') {
      throw new Error('Selection editing currently supports local or untitled files only.');
    }

    const model = this.getModel();
    if (!model) {
      throw new Error('Select a model first using SBC Code: Select Model.');
    }
    const instruction = await vscode.window.showInputBox({
      title: 'SBC Code: Edit Selection',
      prompt: 'Describe the change to the selected source code',
      placeHolder: 'Refactor this function to handle errors...',
      ignoreFocusOut: true,
      validateInput: (value) => value.trim() ? undefined : 'Enter an edit instruction.',
    });
    if (!instruction?.trim()) {
      return;
    }

    const document = editor.document;
    const snapshotVersion = document.version;
    const originalFullText = document.getText();
    const range = new vscode.Range(editor.selection.start, editor.selection.end);
    const start = document.offsetAt(range.start);
    const end = document.offsetAt(range.end);

    const raw = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'SBC Code: generating edit with ' + model,
        cancellable: true,
      },
      async (_progress, token) => {
        const controller = new AbortController();
        const subscription = token.onCancellationRequested(() => controller.abort());
        try {
          return await this.api.complete(
            model,
            editMessages(selected.file, selected.language, selected.text, instruction.trim()),
            { maxTokens: settings.maxTokens, temperature: settings.temperature, signal: controller.signal },
          );
        } finally {
          subscription.dispose();
        }
      },
    );
    const replacement = cleanReplacement(raw);
    if (!replacement.trim()) {
      throw new Error('Model returned an empty edit. Nothing was changed.');
    }
    if (replacement === selected.text) {
      void vscode.window.showInformationMessage('SBC Code: no change was proposed.');
      return;
    }
    if (document.version !== snapshotVersion || document.getText() !== originalFullText) {
      throw new Error('The document changed while the model was generating. Reselect code and try again.');
    }

    const previewContent = originalFullText.slice(0, start) + replacement + originalFullText.slice(end);
    const basename = document.uri.path.split('/').pop() ?? 'file.txt';
    const previewUri = vscode.Uri.from({
      scheme: PREVIEW_SCHEME,
      path: '/' + Date.now() + '-' + basename,
    });
    this.preview.add(previewUri, previewContent);

    await vscode.commands.executeCommand(
      'vscode.diff',
      document.uri,
      previewUri,
      'SBC Code: Review proposed edit — ' + basename,
      { preview: true },
    );

    const action = await vscode.window.showInformationMessage(
      'SBC Code: review the diff before applying this edit.',
      'Apply Change',
      'Discard',
    );
    if (action !== 'Apply Change') {
      return;
    }
    if (document.version !== snapshotVersion || document.getText(range) !== selected.text) {
      throw new Error('The source changed during review. Edit was not applied.');
    }
    const workspaceEdit = new vscode.WorkspaceEdit();
    workspaceEdit.replace(document.uri, range, replacement);
    if (!await vscode.workspace.applyEdit(workspaceEdit)) {
      throw new Error('VS Code could not apply the edit.');
    }
    const checkpointSaved = this.checkpoints.record('Edit selection: ' + basename, [
      { uri: document.uri, before: originalFullText, after: previewContent },
    ]);
    if (checkpointSaved) {
      const action = await vscode.window.showInformationMessage(
        'SBC Code: edit applied. Review and save the file when ready.',
        'Restore Last Edit',
      );
      if (action === 'Restore Last Edit') {
        await this.checkpoints.restoreLast();
      }
    } else {
      void vscode.window.showWarningMessage(
        'SBC Code: edit applied, but the file exceeded the checkpoint memory limit. Use VS Code Undo to reverse it.',
      );
    }
  }
}
