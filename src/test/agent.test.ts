import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { resolveWorkspaceFile } from '../workspacePaths';

test('agent paths stay inside workspace, including symlinks', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sbc-code-test-'));
  const other = await mkdtemp(path.join(os.tmpdir(), 'sbc-code-other-'));
  try {
    await mkdir(path.join(root, 'src'));
    await writeFile(path.join(root, 'src', 'index.ts'), 'export const a = 1;\n');
    await writeFile(path.join(other, 'secret.ts'), 'nope');
    await symlink(other, path.join(root, 'external'), 'dir');
    assert.equal(await resolveWorkspaceFile(root, 'src/index.ts', false), path.join(root, 'src', 'index.ts'));
    assert.equal(await resolveWorkspaceFile(root, 'src/new.ts', true), path.join(root, 'src', 'new.ts'));
    await assert.rejects(resolveWorkspaceFile(root, '../outside.ts', true), /outside/);
    await assert.rejects(resolveWorkspaceFile(root, 'external/secret.ts', false), /outside/);
    await assert.rejects(resolveWorkspaceFile(root, '.env.local', true), /restricted/);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(other, { recursive: true, force: true });
  }
});
