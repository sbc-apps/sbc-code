import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { applyExactPatches, MAX_PATCH_HUNKS, MAX_PATCH_FIND_CHARS, MAX_PATCH_RESULT_CHARS } from '../exactPatches';

test('single exact patch changes only the specified snippet', () => {
  const source = 'const first = 1;\nconst second = 2;\n';
  assert.equal(
    applyExactPatches(source, [{find:'const second = 2;',replace:'const second = 3;'}]),
    'const first = 1;\nconst second = 3;\n',
  );
});

test('unordered nonoverlapping patches use original file offsets', () => {
  const original = 'alpha\nbeta\ngamma\n';
  const changed = applyExactPatches(original, [
    {find:'gamma',replace:'beta'},
    {find:'alpha',replace:'first'},
  ]);
  assert.equal(changed, 'first\nbeta\nbeta\n');
});

test('multiple patches cannot overlap, even when submitted out of order', () => {
  assert.throws(() =>
    applyExactPatches('line-1\nline-2\nline-3\n', [
      {find:'line-2',replace:'B'},
      {find:'line-1\nline-2',replace:'A'},
    ]), /overlap/);
});

test('rejects ambiguous and missing originals rather than guessing', () => {
  assert.throws(() => applyExactPatches('same same', [{find:'same',replace:'different'}]), /more than once/);
  assert.throws(() => applyExactPatches('one', [{find:'two',replace:'three'}]), /not found/);
  assert.throws(() => applyExactPatches('aaa', [{find:'aa',replace:'b'}]), /more than once/);
});

test('supports deleting one unique snippet and CRLF without normalization', () => {
  assert.equal(applyExactPatches('a\r\nb\r\n', [{find:'b\r\n',replace:''}]), 'a\r\n');
});

test('rejects no-op patches and malformed input', () => {
  assert.throws(() => applyExactPatches('x', [{find:'x',replace:'x'}]), /no changes/);
  assert.throws(() => applyExactPatches('abc', [{find:'',replace:'x'}]), /non-empty/);
  assert.throws(() => applyExactPatches('abc', []), /1–8/);
  assert.throws(() => applyExactPatches('abc', Array.from({length:MAX_PATCH_HUNKS+1},()=>({find:'a',replace:'b'}))), /1–8/);
  assert.throws(() => applyExactPatches('a\0b', [{find:'a',replace:'c'}]), /binary/);
  assert.throws(() => applyExactPatches('abc', [{find:'a',replace:'x\0y'}]), /valid replacement/);
  assert.throws(() => applyExactPatches('abc', [{find:'x'.repeat(MAX_PATCH_FIND_CHARS+1),replace:'d'}]), /non-empty/);
});

test('refuses resulting output larger than configured maximum', () => {
  const original = 'a'.repeat(MAX_PATCH_RESULT_CHARS - 2) + 'YZ';
  assert.throws(
    () => applyExactPatches(original, [{find:'YZ',replace:'XYZ'}]),
    /exceeds/,
  );
});

test('source snippets are not regex expressions or fuzzy patterns', () => {
  assert.equal(applyExactPatches('return a+b;', [{find:'a+b',replace:'a - b'}]), 'return a - b;');
  assert.throws(() => applyExactPatches('return a+b;', [{find:'a.*b',replace:'c'}]), /not found/);
});
