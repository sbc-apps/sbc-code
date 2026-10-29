import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import {
  PROVIDER_STATE_KEY, initializeProvider, selectProvider, effectiveProvider, validProvider,
} from '../providerSelection';

test('provider selection persists separately from VS Code User Settings', () => {
  assert.equal(PROVIDER_STATE_KEY, 'sbcCode.activeProvider');
  assert.equal(initializeProvider(undefined, 'colibri'), 'colibri');
  assert.equal(selectProvider('ollama'), 'ollama');
  assert.equal(effectiveProvider('colibri'), 'ollama');
  assert.equal(initializeProvider('ollama', 'colibri'), 'ollama');
  assert.equal(effectiveProvider('colibri'), 'ollama');
  assert.equal(selectProvider('colibri'), 'colibri');
  assert.equal(effectiveProvider('ollama'), 'colibri');
});

test('invalid stored provider falls back to configured provider or Colibri', () => {
  assert.equal(validProvider('https://untrusted.invalid'), undefined);
  assert.equal(validProvider('ollama'), 'ollama');
  assert.equal(initializeProvider('invalid', 'ollama'), 'ollama');
  assert.equal(initializeProvider(undefined, undefined), 'colibri');
});

test('VS Code package manifest exposes both provider settings in packaged extension', () => {
  const pkg = JSON.parse(readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8')) as {
    contributes?: { configuration?: { properties?: Record<string, {type?: string; enum?: string[]}> } };
  };
  const properties = pkg.contributes?.configuration?.properties;
  assert.equal(properties?.['sbcCode.provider']?.type, 'string');
  assert.deepEqual(properties?.['sbcCode.provider']?.enum, ['colibri', 'ollama']);
  assert.equal(properties?.['sbcCode.ollamaBaseUrl']?.type, 'string');
});
