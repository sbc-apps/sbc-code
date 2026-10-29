import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { summarizeDiagnostics, diagnosticsForAgent, DiagnosticRecord } from '../diagnosticContext';

const example: DiagnosticRecord = {
  path: 'src/example.ts', line: 5, column: 2, severity: 'warning',
  message: 'Unused variable', source: 'typescript', code: '6133',
};

test('diagnostics are sorted by severity and serialized without extra fields', () => {
  const error = { ...example, severity: 'error' as const, message: 'Not assignable', line: 7 };
  const result = summarizeDiagnostics([example, error]);
  assert.equal(result.count, 2);
  assert.equal(result.omitted, 0);
  assert.equal(result.diagnostics[0].severity, 'error');
  assert.equal(JSON.parse(diagnosticsForAgent(result)).diagnostics[1].code, '6133');
});

test('diagnostic records have bounded messages and output count', () => {
  const entries = Array.from({length: 50}, (_, index) => ({
    ...example, line:index+1, message:'z'.repeat(1000),
  }));
  const result = summarizeDiagnostics(entries);
  assert.equal(result.count, 50);
  assert.equal(result.omitted, 10);
  assert.equal(result.diagnostics.length, 40);
  assert.equal(result.diagnostics[0].message.length, 320);
});

test('invalid records and limits are rejected', () => {
  assert.equal(summarizeDiagnostics([{ ...example, line:0 }]).count, 0);
  assert.throws(() => summarizeDiagnostics([example], 0), /Invalid/);
  assert.throws(() => summarizeDiagnostics([example], 41), /Invalid/);
  assert.equal(summarizeDiagnostics([{ ...example, message: 'text\0removed' }]).diagnostics[0].message, 'textremoved');
});
