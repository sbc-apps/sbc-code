import * as path from 'node:path';
import { promises as fs } from 'node:fs';

export function isRestrictedFile(relativePath: string): boolean {
  const parts = relativePath.replace(/\\/g, '/').toLowerCase().split('/');
  return parts.some((part) =>
    ['.git', 'node_modules', '.ssh', '.aws', '.kube', '.gnupg', '.npmrc', '.pypirc', '.netrc', '.git-credentials'].includes(part) ||
    part === '.env' || part.startsWith('.env.') || part.startsWith('id_rsa') ||
    part.startsWith('id_ed25519') || part.endsWith('.pem') ||
    part.endsWith('.key') || part.endsWith('.p12') || part.endsWith('.pfx'),
  );
}

export async function resolveWorkspaceFile(root: string, relativePath: string, allowNew: boolean): Promise<string> {
  if (!relativePath.trim() || path.isAbsolute(relativePath) || relativePath.includes('\0')) {
    throw new Error('Expected a workspace-relative file path.');
  }
  const relative = relativePath.replace(/\\/g, '/');
  if (isRestrictedFile(relative)) {
    throw new Error('Access to secret or dependency files is restricted.');
  }

  const absolute = path.resolve(root, relative);
  const normalized = path.relative(root, absolute);
  if (!normalized || normalized.startsWith('..' + path.sep) || normalized === '..' || path.isAbsolute(normalized)) {
    throw new Error('Path is outside the workspace root.');
  }

  const rootReal = await fs.realpath(root);
  // Resolve the nearest existing ancestor. The parent of a new file may be
  // missing (e.g. src/components/Calculator.tsx), but symlinks must not escape
  // the actual workspace. Do not create any folders during path validation.
  let ancestor = absolute;
  let real: string | undefined;
  while (true) {
    try {
      real = await fs.realpath(ancestor);
      break;
    } catch (error) {
      if (!allowNew || (error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      const parent = path.dirname(ancestor);
      if (parent === ancestor) {
        throw new Error('Workspace file path cannot be resolved.');
      }
      ancestor = parent;
    }
  }
  const resolved = path.resolve(real!, path.relative(ancestor, absolute));
  const fromRoot = path.relative(rootReal, resolved);
  if (!fromRoot || fromRoot.startsWith('..' + path.sep) || fromRoot === '..' || path.isAbsolute(fromRoot)) {
    throw new Error('Resolved file is outside the trusted workspace (possibly through a symlink).');
  }
  return absolute;
}

