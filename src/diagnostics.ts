import * as vscode from 'vscode';
import * as path from 'node:path';
import { resolveWorkspaceFile } from './workspacePaths';
import { DiagnosticRecord, DiagnosticLevel, DiagnosticSummary, summarizeDiagnostics } from './diagnosticContext';

function rootFolder(): string {
  if (!vscode.workspace.isTrusted) {
    throw new Error('Diagnostics access requires a trusted workspace.');
  }
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length !== 1 || folders[0].uri.scheme !== 'file') {
    throw new Error('Diagnostics are supported only in one local VS Code workspace.');
  }
  return folders[0].uri.fsPath;
}

function level(value: vscode.DiagnosticSeverity): DiagnosticLevel {
  switch (value) {
    case vscode.DiagnosticSeverity.Error: return 'error';
    case vscode.DiagnosticSeverity.Warning: return 'warning';
    case vscode.DiagnosticSeverity.Information: return 'information';
    default: return 'hint';
  }
}

export async function getWorkspaceDiagnostics(relativeFile?: string): Promise<DiagnosticSummary> {
  const root = rootFolder();
  let scoped: string | undefined;
  if (relativeFile) {
    scoped = await resolveWorkspaceFile(root, relativeFile, false);
  }

  const collected: DiagnosticRecord[] = [];
  // Diagnostic data is read from VS Code's Problems API; no external compiler is run.
  const all: ReadonlyArray<[vscode.Uri, readonly vscode.Diagnostic[]]> = scoped
    ? [[vscode.Uri.file(scoped), vscode.languages.getDiagnostics(vscode.Uri.file(scoped))]]
    : vscode.languages.getDiagnostics();

  for (const [uri, diagnostics] of all) {
    if (uri.scheme !== 'file') {
      continue;
    }
    const relative = path.relative(root, uri.fsPath).replace(/\\/g, '/');
    if (!relative || relative.startsWith('../') || relative === '..') {
      continue;
    }
    let absolute: string;
    try {
      absolute = await resolveWorkspaceFile(root, relative, false);
    } catch {
      // Ignore secret files, external symlinks, generated/outside-workspace sources.
      continue;
    }
    if (scoped && absolute !== scoped) {
      continue;
    }
    for (const problem of diagnostics) {
      if (collected.length >= 400) {
        break;
      }
      collected.push({
        path: relative,
        line: problem.range.start.line + 1,
        column: problem.range.start.character + 1,
        severity: level(problem.severity),
        message: problem.message,
        ...(problem.source ? { source: problem.source } : {}),
        ...(problem.code !== undefined ? {
          code: typeof problem.code === 'object' ? String(problem.code.value) : String(problem.code),
        } : {}),
      });
    }
    if (collected.length >= 400) {
      break;
    }
  }
  return summarizeDiagnostics(collected);
}
