import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { selectSourceWindow, MAX_AGENT_READ_CHARS } from '../sourceWindow';

test('read full source when it fits the context budget', () => {
  assert.deepEqual(selectSourceWindow('a\nb\n'), {
    content:'a\nb\n', start_line:1, end_line:3, total_lines:3, complete:true,
  });
});

test('preserves CRLF and original offset at both ends of a window', () => {
  assert.deepEqual(selectSourceWindow('alpha\r\nbeta\r\ngamma\r\n', 2, 2), {
    content:'beta\r\n', start_line:2, end_line:2, total_lines:4, complete:false,
  });
  assert.equal(selectSourceWindow('one\ntwo\nthree', 2, 3).content, 'two\nthree');
});

test('rejects partial, reversed and out-of-range windows', () => {
  assert.throws(() => selectSourceWindow('abc', 1), /both/);
  assert.throws(() => selectSourceWindow('abc', undefined, 1), /both/);
  assert.throws(() => selectSourceWindow('abc', 2, 1), /Invalid/);
  assert.throws(() => selectSourceWindow('abc', 0, 1), /Invalid/);
  assert.throws(() => selectSourceWindow('abc', 1, 2), /Invalid/);
  assert.throws(() => selectSourceWindow('abc', 1.5, 1), /Invalid/);
});

test('large files must be read in bounded windows', () => {
  const source = 'line\n'.repeat(5000);
  assert.throws(() => selectSourceWindow(source), /18,000/);
  assert.equal(selectSourceWindow(source, 100, 150).end_line, 150);
  assert.throws(() => selectSourceWindow(source, 1, 251), /250/);
  assert.throws(() => selectSourceWindow('x'.repeat(MAX_AGENT_READ_CHARS + 1), 1, 1), /18,000/);
});

test('binary inputs are rejected', () => {
  assert.throws(() => selectSourceWindow('a\0b'), /Binary/);
  assert.equal(selectSourceWindow('').content, '');
});
