import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { parseFileMentions, buildFileContext, validateFileContexts } from '../fileContextText';
import { summarizeToolResult } from '../agentActivity';

test('explicit @file references are deduplicated without guessing adjacent names', () => {
  assert.deepEqual(
    parseFileMentions('Review @file(src/app.ts) and @file( src/index.ts ) then @file(src/app.ts)'),
    ['src/app.ts', 'src/index.ts'],
  );
  assert.deepEqual(parseFileMentions('The @ sign alone is not a file mention'), []);
});

test('file contexts identify attached source as untrusted project data', () => {
  const context = buildFileContext([{path: 'src/app.ts', language: 'typescript', content: 'const answer = 42;'}]);
  assert.match(context, /untrusted project data/);
  assert.match(context, /Workspace path: src\/app.ts/);
  assert.match(context, /const answer = 42/);
  assert.equal(buildFileContext([]), '');
});

test('attachment context is bounded without silent truncation', () => {
  const entry = {path: 'ok.ts', language: 'typescript', content: 'x'.repeat(8000)};
  assert.doesNotThrow(() => validateFileContexts([entry]));
  assert.throws(() => validateFileContexts([{...entry, content: 'x'.repeat(8001)}]), /8,000/);
  assert.throws(() => validateFileContexts([entry, entry, entry, entry]), /at most 3/);
  assert.throws(() => validateFileContexts([entry, entry, {...entry, content: 'x'}]), /16,000/);
  assert.throws(() => validateFileContexts([{...entry, content: 'a\0b'}]), /Binary/);
});

test('agent activity summaries do not reveal raw tool results', () => {
  assert.equal(summarizeToolResult('{"applied":true,"files":["index.ts"]}'), 'done');
  assert.equal(summarizeToolResult('{"applied":false}'), 'declined');
  assert.equal(summarizeToolResult('{"ran":false}'), 'declined');
  assert.equal(summarizeToolResult('{"error":"Secret value"}'), 'error');
  assert.equal(summarizeToolResult('not-json'), 'done');
});
