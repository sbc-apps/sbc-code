import * as vscode from 'vscode';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { resolveWorkspaceFile } from './workspacePaths';
import { buildFileContext, FileContextEntry, parseFileMentions, validateFileContexts } from './fileContextText';

const MAX_PICKED_FILES = 3;

export class FileAttachments {
  private pending: string[] = [];

  list(): string[] {
    return [...this.pending];
  }

  clear(): void {
    this.pending = [];
  }

  remove(relativePath: string): void {
    this.pending = this.pending.filter((item) => item !== relativePath);
  }

  private workspaceRoot(): string {
    if (!vscode.workspace.isTrusted) {
      throw new Error('Trust the workspace before attaching code files.');
    }
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length !== 1 || folders[0].uri.scheme !== 'file') {
      throw new Error('File attachments require one trusted local VS Code workspace folder.');
    }
    return folders[0].uri.fsPath;
  }

  async pick(): Promise<string[]> {
    const root = this.workspaceRoot();
    const files = await vscode.window.showOpenDialog({
      title: 'SBC Code: Attach code files',
      openLabel: 'Attach files',
      defaultUri: vscode.Uri.file(root),
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: true,
    });
    if (!files?.length) {
      return this.list();
    }
    const incoming: string[] = [];
    for (const uri of files) {
      if (uri.scheme !== 'file') {
        throw new Error('Only local workspace files are supported.');
      }
      const relative = path.relative(root, uri.fsPath).replace(/\\/g, '/');
      // Validate the source and its bounds before it is shown as attached.
      await this.load(root, relative);
      incoming.push(relative);
    }
    const combined = [...new Set([...this.pending, ...incoming])];
    if (combined.length > MAX_PICKED_FILES) {
      throw new Error('You can attach at most three code files per message.');
    }
    this.pending = combined;
    return this.list();
  }

  async buildContext(prompt: string): Promise<{ context: string; paths: string[] }> {
    const root = this.workspaceRoot();
    const paths = [...new Set([...this.pending, ...parseFileMentions(prompt)])];
    if (paths.length > MAX_PICKED_FILES) {
      throw new Error('You can reference at most three code files per message.');
    }
    const entries: FileContextEntry[] = [];
    for (const relative of paths) {
      entries.push(await this.load(root, relative));
    }
    validateFileContexts(entries);
    return { context: buildFileContext(entries), paths };
  }

  /** Do not silently truncate file data: the user can choose a smaller file or a selection. */
  private async load(root: string, relative: string): Promise<FileContextEntry> {
    const absolute = await resolveWorkspaceFile(root, relative, false);
    const stats = await fs.stat(absolute);
    if (!stats.isFile() || stats.size > 64 * 1024) {
      throw new Error('Not a regular text file, or file exceeds 64 KiB: ' + relative);
    }
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(absolute));
    const entry = { path: relative, language: doc.languageId, content: doc.getText() };
    validateFileContexts([entry]);
    return entry;
  }
}
