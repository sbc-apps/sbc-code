import * as vscode from 'vscode';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { resolveWorkspaceFile } from './workspacePaths';
import { canStoreCheckpoint, hasUnmodifiedAiResult } from './checkpointRules';

const RESTORE_SCHEME = 'sbc-code-restore-preview';
const MAX_HISTORY = 5;

export interface FileEditSnapshot {
  uri: vscode.Uri;
  /** Null if the file was created by SBC Code. */
  before: string | null;
  after: string;
}

interface EditCheckpoint {
  label: string;
  files: FileEditSnapshot[];
}

class PreviewProvider implements vscode.TextDocumentContentProvider {
  private readonly previews = new Map<string, string>();
  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.previews.get(uri.toString()) ?? '';
  }
  store(content: string, label: string): vscode.Uri {
    const uri = vscode.Uri.from({
      scheme: RESTORE_SCHEME,
      path: '/' + Date.now() + '-' + Math.floor(Math.random() * 1000000) + '-' + label,
    });
    this.previews.set(uri.toString(), content);
    if (this.previews.size > 20) {
      this.previews.delete(this.previews.keys().next().value!);
    }
    return uri;
  }
}

/**
 * Session-only snapshots. Restores are conflict checked and never overwrite
 * user edits that differ from the text originally produced by SBC Code.
 */
export class EditCheckpoints {
  private readonly history: EditCheckpoint[] = [];
  private readonly preview = new PreviewProvider();
  private restoring = false;

  constructor(context: vscode.ExtensionContext) {
    context.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider(RESTORE_SCHEME, this.preview),
    );
  }

  record(label: string, files: readonly FileEditSnapshot[]): boolean {
    if (!canStoreCheckpoint(files)) {
      // A non-reversible edit is a history barrier. Never offer to undo an older
      // edit when the newest operation cannot be tracked reliably.
      this.history.length = 0;
      return false;
    }
    if (files.some((file) =>
      !['file', 'untitled'].includes(file.uri.scheme) ||
      (file.before === null && file.uri.scheme !== 'file')
    )) {
      this.history.length = 0;
      return false;
    }
    this.history.unshift({
      label,
      files: files.map((file) => ({ uri: file.uri, before: file.before, after: file.after })),
    });
    while (this.history.length > MAX_HISTORY) {
      this.history.pop();
    }
    return true;
  }

  async restoreLast(): Promise<void> {
    if (this.restoring) {
      void vscode.window.showWarningMessage('SBC Code: a restore is already in progress.');
      return;
    }
    const checkpoint = this.history[0];
    if (!checkpoint) {
      void vscode.window.showInformationMessage('SBC Code: no edits are available to restore in this VS Code session.');
      return;
    }

    this.restoring = true;
    try {
      await this.validate(checkpoint);
      for (const change of checkpoint.files) {
        const basename = path.basename(change.uri.path);
        const preview = this.preview.store(change.before ?? '', 'before-' + basename);
        await vscode.commands.executeCommand(
          'vscode.diff',
          change.uri,
          preview,
          'SBC Code: Preview restore — ' + basename,
          { preview: true },
        );
      }

      const created = checkpoint.files.filter((change) => change.before === null).length;
      const message = 'Restore the last SBC Code edit (' + checkpoint.files.length +
        ' file(s))? ' + (created ? 'This will delete ' + created + ' file(s) created by the agent. ' : '') +
        'Any changes you made after the AI edit will prevent restoration.';
      const choice = await vscode.window.showWarningMessage(
        message,
        { modal: true },
        'Restore Last Edit',
      );
      if (choice !== 'Restore Last Edit') {
        return;
      }

      // Recheck after the user has spent time reviewing the diff.
      await this.validate(checkpoint);
      const edit = new vscode.WorkspaceEdit();
      for (const change of checkpoint.files) {
        if (change.before === null) {
          edit.deleteFile(change.uri, { ignoreIfNotExists: false });
        } else {
          const document = await vscode.workspace.openTextDocument(change.uri);
          edit.replace(
            change.uri,
            new vscode.Range(new vscode.Position(0, 0), document.positionAt(document.getText().length)),
            change.before,
          );
        }
      }
      if (!await vscode.workspace.applyEdit(edit)) {
        throw new Error('VS Code did not apply the restore operation.');
      }
      const index = this.history.indexOf(checkpoint);
      if (index >= 0) {
        this.history.splice(index, 1);
      }
      void vscode.window.showInformationMessage('SBC Code: previous file contents restored. Review and save your files.');
    } finally {
      this.restoring = false;
    }
  }

  private async validate(checkpoint: EditCheckpoint): Promise<void> {
    for (const file of checkpoint.files) {
      if (file.uri.scheme === 'file') {
        if (!vscode.workspace.isTrusted) {
          throw new Error('Trust this workspace before restoring AI file changes.');
        }
        const folder = vscode.workspace.getWorkspaceFolder(file.uri);
        if (!folder || folder.uri.scheme !== 'file') {
          throw new Error('The file is no longer in an open local workspace: ' + file.uri.fsPath);
        }
        const relative = path.relative(folder.uri.fsPath, file.uri.fsPath).replace(/\\/g, '/');
        await resolveWorkspaceFile(folder.uri.fsPath, relative, false);
        const stats = await fs.stat(file.uri.fsPath);
        if (!stats.isFile()) {
          throw new Error('Restore target is no longer a regular file: ' + relative);
        }
      }
      let current: vscode.TextDocument;
      try {
        current = await vscode.workspace.openTextDocument(file.uri);
      } catch {
        throw new Error('File no longer exists or cannot be opened: ' + file.uri.toString());
      }
      if (!hasUnmodifiedAiResult(current.getText(), file.after)) {
        throw new Error('Restore blocked: file changed after the AI edit: ' + file.uri.toString());
      }
    }
  }
}
