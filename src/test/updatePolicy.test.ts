import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { isCheckDue, resolveUpdateMode, staleVsixFiles } from '../updatePolicy';
import { CompletionCache, completionCacheKey } from '../completionCache';

test('automatic install is the default; explicit mode wins over the legacy switch', () => {
  assert.equal(resolveUpdateMode(undefined, true), 'install');
  assert.equal(resolveUpdateMode(undefined, undefined), 'install');
  assert.equal(resolveUpdateMode(undefined, false), 'off');
  assert.equal(resolveUpdateMode('notify', false), 'notify');
  assert.equal(resolveUpdateMode('install', false), 'install');
  assert.equal(resolveUpdateMode('bogus', true), 'install');
});

test('checks are throttled across windows and recover from clock changes', () => {
  const hour = 3600000;
  assert.equal(isCheckDue(undefined, 10 * hour, hour), true);
  assert.equal(isCheckDue(10 * hour, 10 * hour + 1000, hour), false);
  assert.equal(isCheckDue(10 * hour, 11 * hour, hour), true);
  assert.equal(isCheckDue(20 * hour, 10 * hour, hour), true);
  assert.equal(isCheckDue(Number.NaN, 10 * hour, hour), true);
});

test('only SBC Code VSIX downloads are cleaned up', () => {
  assert.deepEqual(
    staleVsixFiles(['sbc-code-0.9.0.vsix', 'sbc-code-1.0.0.vsix', 'checkpoints.json', 'other.vsix'], 'sbc-code-1.0.0.vsix'),
    ['sbc-code-0.9.0.vsix'],
  );
});

test('completion cache evicts least recently used entries', () => {
  const cache = new CompletionCache(2);
  cache.set('a', '1');
  cache.set('b', '2');
  assert.equal(cache.get('a'), '1');
  cache.set('c', '3');
  assert.equal(cache.get('b'), undefined);
  assert.equal(cache.get('a'), '1');
  assert.equal(cache.size, 2);
  assert.notEqual(completionCacheKey('m', 'ts', 'abc', 'x'), completionCacheKey('m', 'ts', 'abd', 'x'));
  assert.equal(completionCacheKey('m', 'ts', 'abc', 'x'), completionCacheKey('m', 'ts', 'abc', 'x'));
});
