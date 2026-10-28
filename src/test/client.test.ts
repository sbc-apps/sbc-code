import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { buildEndpoint, SseDecoder, parseModelIds, extractResponseText } from '../colibriClient';
import { cleanReplacement, editMessages } from '../codeEdit';
import { isRestrictedFile } from '../workspacePaths';

test('Colibri localhost endpoint is normalized', () => {
  assert.equal(buildEndpoint('http://127.0.0.1:8000/v1/', 'models'), 'http://127.0.0.1:8000/v1/models');
  assert.equal(buildEndpoint('http://localhost:8000/v1', 'chat/completions'), 'http://localhost:8000/v1/chat/completions');
});

test('Remote HTTP, credentials and other protocols are rejected', () => {
  assert.throws(() => buildEndpoint('http://example.com/v1', 'models'), /Remote HTTP is disabled/);
  assert.throws(() => buildEndpoint('file:///tmp/test', 'models'), /HTTP and HTTPS/);
  assert.throws(() => buildEndpoint('http://alice:secret@localhost/v1', 'models'), /credentials/);
  assert.match(buildEndpoint('https://example.com/v1', 'models'), /^https:/);
  assert.match(buildEndpoint('http://example.com/v1', 'models', true), /^http:/);
});

test('SSE decoder reassembles streamed data, including CRLF', () => {
  const decoder = new SseDecoder();
  assert.deepEqual(decoder.feed('data: {"choices":[{"delta":{"content":"hi"}}]}\r'), []);
  const events = decoder.feed('\n\r\ndata: [DONE]\n\n');
  assert.equal(events.length, 2);
  assert.equal(JSON.parse(events[0]).choices[0].delta.content, 'hi');
  assert.equal(events[1], '[DONE]');
});

test('Parse model list and response content', () => {
  assert.deepEqual(parseModelIds({ data: [{ id: 'm1' }, { id: 'm1' }, { id: 'm2' }, {}] }), ['m1', 'm2']);
  assert.throws(() => parseModelIds({ notData: [] }), /invalid/);
  assert.equal(extractResponseText({ choices: [{ message: { content: 'hello' } }] }), 'hello');
  assert.equal(extractResponseText({ choices: [{ delta: { content: 'world' } }] }), 'world');
});

test('Code edit strips fenced code blocks', () => {
  const fence = String.fromCharCode(96).repeat(3);
  assert.equal(cleanReplacement(fence + 'ts\nconst count = 1;\n' + fence), 'const count = 1;');
  assert.equal(cleanReplacement('let a = 1;\n'), 'let a = 1;');
  assert.equal(editMessages('index.ts', 'typescript', 'foo', 'Refactor').length, 2);
});

test('Agent secret path filter rejects sensitive files', () => {
  for (const relative of ['.env', 'src/.env.production', '.git/config', 'node_modules/x.js', 'cert.pem']) {
    assert.equal(isRestrictedFile(relative), true);
  }
  assert.equal(isRestrictedFile('src/app/page.tsx'), false);
});
