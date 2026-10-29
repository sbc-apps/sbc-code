import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import * as path from 'node:path';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

test('the VS Code extension icon is the official SBC 227x227 PNG', () => {
  const icon = readFileSync(path.resolve(__dirname, '../../media/sbc-logo.png'));
  assert.deepEqual([...icon.subarray(0,8)], [137,80,78,71,13,10,26,10]);
  assert.equal(icon.readUInt32BE(16),227);
  assert.equal(icon.readUInt32BE(20),227);
  const githubBlobSha = createHash('sha1')
    .update('blob ' + icon.length + '\0')
    .update(icon).digest('hex');
  assert.equal(githubBlobSha,'84d589c86e483198362e9a8704d834f984247718');
});

test('extension package manifest points to the SBC brand PNG', () => {
  const manifest = JSON.parse(readFileSync(path.resolve(__dirname,'../../package.json'),'utf8')) as {
    icon: string; contributes: { viewsContainers: { activitybar: Array<{icon:string}> } };
  };
  assert.equal(manifest.icon,'media/sbc-logo.png');
  assert.equal(manifest.contributes.viewsContainers.activitybar[0].icon,'media/sbc-code.svg');
});
