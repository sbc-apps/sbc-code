import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { parseInline, parseMarkdown } from '../messageMarkdown';

test('fenced code keeps language, content and completion state', () => {
  const blocks = parseMarkdown('Intro\n\n```ts\nconst a = 1;\n```\nAfter');
  assert.deepEqual(blocks.map((block) => block.kind), ['paragraph', 'code', 'paragraph']);
  assert.deepEqual(blocks[1], { kind: 'code', language: 'ts', code: 'const a = 1;', complete: true });
});

test('a streaming, unterminated fence is an incomplete code block', () => {
  const blocks = parseMarkdown('```py\nprint(1)\n');
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].kind, 'code');
  assert.equal(blocks[0].kind === 'code' && blocks[0].complete, false);
});

test('headings, lists and quotes are recognised', () => {
  const blocks = parseMarkdown('## Plan\n- one\n- two\n1. first\n2. second\n> note');
  assert.deepEqual(blocks.map((block) => block.kind), ['heading', 'list', 'list', 'quote']);
  assert.equal(blocks[1].kind === 'list' && blocks[1].ordered, false);
  assert.equal(blocks[2].kind === 'list' && blocks[2].items.length, 2);
});

test('inline code, strong and emphasis; snake_case is not emphasis', () => {
  assert.deepEqual(parseInline('Use `npm test` **now** or *later*'), [
    { kind: 'text', text: 'Use ' }, { kind: 'code', text: 'npm test' },
    { kind: 'text', text: ' ' }, { kind: 'strong', text: 'now' },
    { kind: 'text', text: ' or ' }, { kind: 'em', text: 'later' },
  ]);
  assert.deepEqual(parseInline('call read_file_now_ok'), [{ kind: 'text', text: 'call read_file_now_ok' }]);
});

test('HTML in model output stays literal text', () => {
  const blocks = parseMarkdown('<img src=x onerror=alert(1)>');
  assert.deepEqual(blocks, [{ kind: 'paragraph', inlines: [{ kind: 'text', text: '<img src=x onerror=alert(1)>' }] }]);
});
