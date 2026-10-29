import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { ColibriClient } from '../colibriClient';
import type { ApiConfiguration } from '../colibriClient';

async function withOllama(
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void,
  verify: (origin: string) => Promise<void>,
): Promise<void> {
  const server = createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch((error) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({error: {message: String(error)}}));
    });
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address() as AddressInfo;
    await verify('http://127.0.0.1:' + address.port);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function requestBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  let source = '';
  for await (const chunk of req) source += chunk.toString('utf8');
  return JSON.parse(source) as Record<string, unknown>;
}

test('Ollama provider lists native tags and chats through OpenAI-compatible API', async () => {
  const paths: string[] = [];
  await withOllama(async (req, res) => {
    paths.push(req.url ?? '');
    assert.equal(req.headers.authorization, undefined, 'Colibri token must not leak to Ollama');
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/tags') {
      res.end(JSON.stringify({models:[{name:'qwen3-coder:latest'},{name:'codegemma:latest'}]}));
    } else {
      assert.equal(req.url, '/v1/chat/completions');
      const body = await requestBody(req);
      assert.equal(body.model, 'qwen3-coder:latest');
      assert.equal(body.stream, false);
      res.end(JSON.stringify({choices:[{message:{content:'Ollama coding assistant ready'}}]}));
    }
  }, async (origin) => {
    const config: ApiConfiguration = {
      provider:'ollama',baseUrl:'https://colibri.example/v1',ollamaBaseUrl:origin,
      allowInsecureRemote:false,
    };
    const client = new ColibriClient(() => config, async () => 'COLIBRI_SECRET');
    assert.deepEqual(await client.models(),['qwen3-coder:latest','codegemma:latest']);
    const answer = await client.complete(
      'qwen3-coder:latest',[{role:'user',content:'Test Ollama'}],
      {maxTokens:64,temperature:0},
    );
    assert.equal(answer,'Ollama coding assistant ready');
  });
  assert.deepEqual(paths,['/api/tags','/v1/chat/completions']);
});

test('Ollama streams SSE and omits unsupported tool_choice', async () => {
  const paths: string[] = [];
  await withOllama(async (req, res) => {
    paths.push(req.url ?? '');
    const body = await requestBody(req);
    assert.equal(body.model,'qwen3-coder:latest');
    assert.equal(Object.hasOwn(body,'tool_choice'),false);
    if (body.stream === true) {
      res.writeHead(200, { 'Content-Type':'text/event-stream' });
      res.write('data: {"choices":[{"delta":{"content":"One "}}]}\n\n');
      res.end('data: {"choices":[{"delta":{"content":"two"}}]}\n\ndata: [DONE]\n\n');
    } else {
      assert.equal(Array.isArray(body.tools),true);
      res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify({choices:[{message:{content:'',tool_calls:[{
        id:'call_ollama_1',type:'function',function:{name:'list_files',arguments:'{"glob":"src/**"}'},
      }]}}]}));
    }
  },async (origin) => {
    const client = new ColibriClient(
      () => ({ provider:'ollama',baseUrl:'http://localhost:8000/v1',ollamaBaseUrl:origin+'/v1',allowInsecureRemote:false }),
      async () => undefined,
    );
    const deltas:string[] = [];
    assert.equal(await client.stream(
      'qwen3-coder:latest',[{role:'user',content:'stream please'}],
      {maxTokens:64,temperature:0},(text) => deltas.push(text),
    ),'One two');
    assert.deepEqual(deltas,['One ','two']);
    const reply = await client.agentStep(
      'qwen3-coder:latest',[{role:'user',content:'list sources'}],
      [{type:'function',function:{name:'list_files',parameters:{type:'object',properties:{glob:{type:'string'}}}}}],
      {maxTokens:64,temperature:0},
    );
    assert.equal(reply.tool_calls[0].function.name,'list_files');
  });
  assert.deepEqual(paths,['/v1/chat/completions','/v1/chat/completions']);
});

test('bad Ollama URLs and remote HTTP are rejected before network access', async () => {
  const client = new ColibriClient(
    () => ({provider:'ollama',baseUrl:'http://127.0.0.1:8000/v1',ollamaBaseUrl:'http://example.com:11434',allowInsecureRemote:false}),
    async () => undefined,
  );
  await assert.rejects(client.models(),/Remote HTTP is disabled/);
});
