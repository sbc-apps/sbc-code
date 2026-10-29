import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ollamaChatBase, ollamaNativeBase, parseOllamaModelIds, DEFAULT_OLLAMA_URL } from '../modelProviders';

test('Ollama defaults to local OpenAI-compatible and native API roots', () => {
  assert.equal(ollamaChatBase(DEFAULT_OLLAMA_URL), 'http://127.0.0.1:11434/v1');
  assert.equal(ollamaNativeBase(DEFAULT_OLLAMA_URL), 'http://127.0.0.1:11434/api');
  assert.equal(ollamaChatBase('http://localhost:11434/v1/'), 'http://localhost:11434/v1');
  assert.equal(ollamaNativeBase('http://localhost:11434/v1'), 'http://localhost:11434/api');
  assert.equal(ollamaChatBase('https://host.example/api'), 'https://host.example/v1');
});

test('invalid Ollama URL paths and schemes are refused before request', () => {
  assert.throws(() => ollamaChatBase('hello Ollama'), /Invalid Ollama URL/);
  assert.throws(() => ollamaChatBase('http://localhost:11434/random/path'), /server origin/);
});

test('Ollama native /api/tags model IDs retain tags and are deduplicated', () => {
  assert.deepEqual(parseOllamaModelIds({models:[
    {name:'qwen3-coder:latest'}, {name:'deepseek-coder:6.7b'},
    {name:'qwen3-coder:latest'}, {model:'fallback:latest'}, {},
  ]}), ['qwen3-coder:latest','deepseek-coder:6.7b','fallback:latest']);
  assert.throws(() => parseOllamaModelIds({data:[]}), /invalid/);
  assert.throws(() => parseOllamaModelIds({models:{}}), /not an array/);
});
