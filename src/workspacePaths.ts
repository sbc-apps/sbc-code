import * as path from 'node:path';
import { promises as fs } from 'node:fs';

export function isRestrictedFile(relativePath: string): boolean {
  const parts = relativePath.replace(/\\/g, '/').toLowerCase().split('/');
  return parts.some((part) =>
    part === '.git' || part === 'node_modules' || part === '.ssh' ||
    part === '.env' || part.startsWith('.env.') ||
    part === 'id_rsa' || part.endsWith('.pem') || part.endsWith('.key'),
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
  let real: string;
  try {
    real = await fs.realpath(absolute);
  } catch (error) {
    if (!allowNew || (error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
    const parentReal = await fs.realpath(path.dirname(absolute));
    real = path.join(parentReal, path.basename(absolute));
  }
  const fromRoot = path.relative(rootReal, real);
  if (!fromRoot || fromRoot.startsWith('..' + path.sep) || fromRoot === '..' || path.isAbsolute(fromRoot)) {
    throw new Error('Resolved file is outside the trusted workspace (possibly through a symlink).');
  }
  return absolute;
}

