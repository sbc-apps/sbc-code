import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { initialWriteReport, recordWriteToolResult } from '../agentWriteReport';

test('model prose alone is never proof that a file exists', () => {
  const start = initialWriteReport();
  const result = recordWriteToolResult(start, 'read_file', '{"path":"index.html","content":"HTML"}');
  assert.deepEqual(result, start);
  assert.deepEqual(start.created, []);
  assert.deepEqual(start.modified, []);
});

test('only applied true with explicit file lists records a successful workspace edit', () => {
  const first = recordWriteToolResult(initialWriteReport(), 'propose_edits', JSON.stringify({
    applied: true, created:['index.html'], modified:[],
  }));
  assert.deepEqual(first.created, ['index.html']);
  assert.equal(first.appliedBatches, 1);
  assert.equal(first.writeToolsAttempted, 1);

  const second = recordWriteToolResult(first,'propose_patch',JSON.stringify({
    applied:true,created:[],modified:['index.html','app.ts'],
  }));
  assert.deepEqual(second.created,['index.html']);
  assert.deepEqual(second.modified,['app.ts']);
  assert.equal(second.appliedBatches, 2);
});

test('declined, invalid, or error tool calls cannot claim successful writes', () => {
  const initial = initialWriteReport();
  for (const response of [
    '{"applied":false,"reason":"User declined"}',
    '{"error":"Unknown path"}',
    '{"applied":true,"files":["index.html"]}',
    'I created index.html',
  ]) {
    const result = recordWriteToolResult(initial,'propose_edits',response);
    assert.deepEqual(result.created,[]);
    assert.deepEqual(result.modified,[]);
    assert.equal(result.appliedBatches,0);
    assert.equal(result.writeToolsAttempted,1);
  }
});
