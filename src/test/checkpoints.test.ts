import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { canStoreCheckpoint, hasUnmodifiedAiResult, MAX_CHECKPOINT_CHARACTERS } from '../checkpointRules';

test('checkpoints hold changes only within the in-memory size budget', () => {
  assert.equal(canStoreCheckpoint([]), false);
  assert.equal(canStoreCheckpoint([{ before: 'old', after: 'new' }]), true);
  assert.equal(canStoreCheckpoint([{ before: null, after: 'created' }]), true);
  assert.equal(canStoreCheckpoint([{ before: 'x'.repeat(MAX_CHECKPOINT_CHARACTERS), after: 'y' }]), false);
});

test('restore refuses to overwrite subsequent user changes', () => {
  assert.equal(hasUnmodifiedAiResult('model output', 'model output'), true);
  assert.equal(hasUnmodifiedAiResult('model output plus user edit', 'model output'), false);
  assert.equal(hasUnmodifiedAiResult('model output\n', 'model output'), false);
});
