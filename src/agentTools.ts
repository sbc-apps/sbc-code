import * as vscode from 'vscode';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import type { ToolCall } from './agentTypes';
import { EditCheckpoints } from './editCheckpoints';
import { isRestrictedFile, resolveWorkspaceFile } from './workspacePaths';

export const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List up to 80 non-secret files in the open VS Code workspace. Use before opening relevant code.',
      parameters: {
        type: 'object',
        properties: { glob: { type: 'string', description: 'VS Code glob, e.g. src/**/*.ts. Default **/*.' } },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_workspace',
      description: 'Find a literal text pattern in workspace files, returning matching paths and line snippets. Not a regex search.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a text file from the VS Code workspace, excluding secrets and hidden configuration.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Workspace-relative path.' } },
        required: ['path'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_edits',
      description: 'Propose full file content for up to four workspace files. The extension shows VS Code diffs and asks the user before making any edits. Always read a file before editing it.',
      parameters: {
        type: 'object',
        properties: {
          changes: {
            type: 'array',
            maxItems: 4,
            items: {
              type: 'object',
              properties: {
                path: { type: 'string', description: 'Workspace-relative file path.' },
                content: { type: 'string', description: 'Full replacement file contents, not a patch.' },
              },
              required: ['path', 'content'],
              additionalProperties: false,
            },
          },
        },
        required: ['changes'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_checks',
      description: 'Run an explicitly approved test, lint, build or git status command in the workspace. Only pre-approved command choices are accepted; the user must confirm each run.',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            enum: ['npm test', 'npm run check', 'npm run lint', 'npm run build', 'pnpm test', 'pnpm lint', 'pnpm build', 'git status --short', 'pytest -q', 'go test ./...', 'cargo test'],
          },
        },
        required: ['command'],
        additionalProperties: false,
      },
    },
  },
] as const;

const EXCLUDE = '**/{.git,node_modules,dist,out,build,coverage,.next,.venv,vendor}/**,**/.env*,**/*.pem,**/*.key,**/id_rsa*';
const SEARCH_MAX_RESULTS = 30;
const MAX_READ_BYTES = 48 * 1024;
const PREVIEW_SCHEME = 'sbc-code-agent-preview';

interface ChangeProposal {
  relative: string;
  uri: vscode.Uri;
  content: string;
  original: string;
  originalVersion: number;
  exists: boolean;
}

class PreviewTextProvider implements vscode.TextDocumentContentProvider {
  private readonly content = new Map<string, string>();

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.content.get(uri.toString()) ?? '';
  }

  store(text: string, label: string): vscode.Uri {
    const uri = vscode.Uri.from({
      scheme: PREVIEW_SCHEME,
      path: '/' + Date.now() + '-' + Math.floor(Math.random() * 100000) + '-' + label,
    });
    this.content.set(uri.toString(), text);
    if (this.content.size > 20) {
      this.content.delete(this.content.keys().next().value!);
    }
    return uri;
  }
}

const SUPPORTED_CHECKS: Record<string, readonly [string, readonly string[]]> = {
  'npm test': ['npm', ['test']],
  'npm run check': ['npm', ['run', 'check']],
  'npm run lint': ['npm', ['run', 'lint']],
  'npm run build': ['npm', ['run', 'build']],
  'pnpm test': ['pnpm', ['test']],
  'pnpm lint': ['pnpm', ['lint']],
  'pnpm build': ['pnpm', ['build']],
  'git status --short': ['git', ['status', '--short']],
  'pytest -q': ['pytest', ['-q']],
  'go test ./...': ['go', ['test', './...']],
  'cargo test': ['cargo', ['test']],
};

function asRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Expected a JSON object.');
  }
  return input as Record<string, unknown>;
}

function requireString(value: unknown, name: string, maxLength: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new Error(name + ' must be a non-empty string of at most ' + maxLength + ' characters.');
  }
  return value;
}

function runProcess(binary: string, args: readonly string[], cwd: string, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('Cancelled.'));
      return;
    }
    const child = spawn(binary, [...args], { cwd, shell: false, windowsHide: true });
    let output = '';
    let truncated = false;
    let timedOut = false;
    const append = (buffer: Buffer) => {
      if (output.length >= 16000) {
        truncated = true;
        return;
      }
      output += buffer.toString('utf8').slice(0, 16000 - output.length);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 120000);
    const onAbort = () => child.kill();
    signal.addEventListener('abort', onAbort, { once: true });
    let settled = false;
    const finish = (error: Error | undefined, code?: number | null) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      if (error) {
        reject(error);
      } else {
        resolve('Exit code: ' + (code ?? 'unknown') + (timedOut ? ' (timed out)' : '') +
          '\n' + output + (truncated ? '\n[Output truncated]' : ''));
      }
    };
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);
    child.on('error', (error) => finish(error));
    child.on('close', (code) => finish(undefined, code));
  });
}

export class AgentTools {
  private readonly preview = new PreviewTextProvider();
  private readonly readFiles = new Set<string>();

  constructor(context: vscode.ExtensionContext, private readonly checkpoints: EditCheckpoints) {
    context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider(PREVIEW_SCHEME, this.preview));
  }

  resetTurn(): void {
    this.readFiles.clear();
  }

  private root(): string {
    if (!vscode.workspace.isTrusted) {
      throw new Error('Agent tools are disabled until you trust this VS Code workspace.');
    }
    const folders = vscode.workspace.workspaceFolders;
    if (!folders?.length || folders.length > 1 || folders[0].uri.scheme !== 'file') {
      throw new Error('Agent mode currently requires one local, trusted workspace folder.');
    }
    return folders[0].uri.fsPath;
  }

  async execute(call: ToolCall, signal: AbortSignal): Promise<string> {
    try {
      if (signal.aborted) {
        throw new Error('Cancelled.');
      }
      const args = asRecord(JSON.parse(call.function.arguments || '{}') as unknown);
      const root = this.root();
      switch (call.function.name) {
        case 'list_files':
          return await this.listFiles(root, args);
        case 'search_workspace':
          return await this.searchWorkspace(root, args, signal);
        case 'read_file':
          return await this.readFile(root, args);
        case 'propose_edits':
          return await this.proposeEdits(root, args, signal);
        case 'run_checks':
          return await this.runChecks(root, args, signal);
        default:
          throw new Error('Unknown or disallowed agent tool: ' + call.function.name);
      }
    } catch (error) {
      return JSON.stringify({ error: error instanceof Error ? error.message : String(error) });
    }
  }

  private async listFiles(root: string, args: Record<string, unknown>): Promise<string> {
    const glob = args.glob === undefined ? '**/*' : requireString(args.glob, 'glob', 150);
    const uris = await vscode.workspace.findFiles(glob, EXCLUDE, 80);
    const files = uris
      .filter((uri) => uri.scheme === 'file')
      .map((uri) => path.relative(root, uri.fsPath).replace(/\\/g, '/'))
      .filter((relative) => relative && !relative.startsWith('..') && !isRestrictedFile(relative));
    return JSON.stringify({ files, truncated: uris.length === 80 });
  }

  private async searchWorkspace(root: string, args: Record<string, unknown>, signal: AbortSignal): Promise<string> {
    const query = requireString(args.query, 'query', 120).toLowerCase();
    const uris = await vscode.workspace.findFiles('**/*', EXCLUDE, 250);
    const matches: Array<{ path: string; line: number; preview: string }> = [];
    for (const uri of uris) {
      if (signal.aborted) {
        throw new Error('Cancelled.');
      }
      if (uri.scheme !== 'file') {
        continue;
      }
      const relative = path.relative(root, uri.fsPath).replace(/\\/g, '/');
      if (relative.startsWith('..') || isRestrictedFile(relative)) {
        continue;
      }
      try {
        const safe = await resolveWorkspaceFile(root, relative, false);
        const stats = await fs.stat(safe);
        if (!stats.isFile() || stats.size > MAX_READ_BYTES) {
          continue;
        }
        const contents = await fs.readFile(safe, 'utf8');
        if (contents.includes('\0')) {
          continue;
        }
        for (const [i, line] of contents.split(/\r?\n/).entries()) {
          if (line.toLowerCase().includes(query)) {
            matches.push({ path: relative, line: i + 1, preview: line.trim().slice(0, 180) });
            if (matches.length >= SEARCH_MAX_RESULTS) {
              return JSON.stringify({ matches, truncated: true });
            }
          }
        }
      } catch {
        // Skip unreadable or symlink-escaped files.
      }
    }
    return JSON.stringify({ matches, truncated: uris.length === 250 });
  }

  private async readFile(root: string, args: Record<string, unknown>): Promise<string> {
    const relative = requireString(args.path, 'path', 400);
    const filename = await resolveWorkspaceFile(root, relative, false);
    const stats = await fs.stat(filename);
    if (!stats.isFile() || stats.size > MAX_READ_BYTES) {
      throw new Error('File is not regular text or is too large (48 KiB limit).');
    }
    const contents = await fs.readFile(filename, 'utf8');
    if (contents.includes('\0')) {
      throw new Error('Binary file refused.');
    }
    if (contents.length > 18000) {
      throw new Error('File is too long for reliable agent edits. Narrow the request or use Edit Selection.');
    }
    this.readFiles.add(path.resolve(filename));
    return JSON.stringify({ path: relative, content: contents.slice(0, 18000), truncated: contents.length > 18000 });
  }

  private async proposeEdits(root: string, args: Record<string, unknown>, signal: AbortSignal): Promise<string> {
    if (!Array.isArray(args.changes) || !args.changes.length || args.changes.length > 4) {
      throw new Error('propose_edits requires 1–4 changes.');
    }
    const proposals: ChangeProposal[] = [];
    const paths = new Set<string>();
    for (const raw of args.changes) {
      const change = asRecord(raw);
      const relative = requireString(change.path, 'path', 400);
      if (typeof change.content !== 'string' || change.content.length > 100000) {
        throw new Error('File content must be a string of at most 100,000 characters.');
      }
      const filename = await resolveWorkspaceFile(root, relative, true);
      if (paths.has(filename)) {
        throw new Error('Duplicate path in proposed edit.');
      }
      paths.add(filename);
      let exists = true;
      try {
        await fs.stat(filename);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
        exists = false;
      }
      if (exists && !this.readFiles.has(path.resolve(filename))) {
        throw new Error('Read the file with read_file before proposing an edit: ' + relative);
      }
      const uri = vscode.Uri.file(filename);
      const document = exists ? await vscode.workspace.openTextDocument(uri) : undefined;
      proposals.push({
        uri, relative, content: change.content, original: document?.getText() ?? '',
        originalVersion: document?.version ?? -1, exists,
      });
    }

    for (const proposal of proposals) {
      if (signal.aborted) {
        throw new Error('Cancelled.');
      }
      const basename = path.basename(proposal.relative);
      const original = proposal.exists
        ? proposal.uri
        : this.preview.store('', 'empty-' + basename);
      const proposed = this.preview.store(proposal.content, 'new-' + basename);
      await vscode.commands.executeCommand('vscode.diff', original, proposed, 'SBC Code Agent: ' + proposal.relative);
      const choice = await vscode.window.showInformationMessage(
        'SBC Code Agent proposes changes to ' + proposal.relative + '. Review the diff.',
        'Approve File', 'Reject Changes',
      );
      if (choice !== 'Approve File') {
        return JSON.stringify({ applied: false, reason: 'User rejected or dismissed edit.' });
      }
    }
    if (signal.aborted) {
      throw new Error('Cancelled.');
    }

    const edit = new vscode.WorkspaceEdit();
    for (const proposal of proposals) {
      if (proposal.exists) {
        const document = await vscode.workspace.openTextDocument(proposal.uri);
        if (document.version !== proposal.originalVersion || document.getText() !== proposal.original) {
          return JSON.stringify({ applied: false, reason: 'Document changed during review: ' + proposal.relative });
        }
        const last = document.positionAt(document.getText().length);
        edit.replace(proposal.uri, new vscode.Range(new vscode.Position(0, 0), last), proposal.content);
      } else {
        try {
          await fs.stat(proposal.uri.fsPath);
          return JSON.stringify({ applied: false, reason: 'File appeared during review: ' + proposal.relative });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
          }
        }
        edit.createFile(proposal.uri);
        edit.insert(proposal.uri, new vscode.Position(0, 0), proposal.content);
      }
    }
    if (!await vscode.workspace.applyEdit(edit)) {
      throw new Error('VS Code refused to apply one or more edits.');
    }
    this.readFiles.clear();
    const checkpointSaved = this.checkpoints.record(
      'Agent: ' + proposals.map((proposal) => proposal.relative).join(', '),
      proposals.map((proposal) => ({
        uri: proposal.uri,
        before: proposal.exists ? proposal.original : null,
        after: proposal.content,
      })),
    );
    return JSON.stringify({
      applied: true, files: proposals.map((item) => item.relative),
      checkpointSaved,
      note: checkpointSaved
        ? 'Edits applied. Use SBC Code: Restore Last AI Edit to undo this batch.'
        : 'Edits applied, but the files exceeded the in-memory checkpoint budget; use VS Code Undo if available.',
    });
  }

  private async runChecks(root: string, args: Record<string, unknown>, signal: AbortSignal): Promise<string> {
    const command = requireString(args.command, 'command', 100);
    const check = SUPPORTED_CHECKS[command];
    if (!check) {
      throw new Error('Command is not in the allowlist.');
    }
    const approval = await vscode.window.showWarningMessage(
      'SBC Code Agent requests permission to run "' + command + '" in ' + root + '. Project scripts may execute code.',
      { modal: true },
      'Run Once',
    );
    if (approval !== 'Run Once') {
      return JSON.stringify({ ran: false, reason: 'User declined command execution.' });
    }
    if (signal.aborted) {
      throw new Error('Cancelled.');
    }
    const output = await runProcess(check[0], check[1], root, signal);
    return JSON.stringify({ ran: true, command, output });
  }
}
