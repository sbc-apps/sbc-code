import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { ColibriClient, ChatMessage } from '../colibriClient';

type Handler = (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;

async function mockColibri(handler: Handler, check: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = createServer((request, response) => {
    Promise.resolve(handler(request, response)).catch((error) => {
      response.writeHead(500, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: { message: String(error) } }));
    });
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const port = (server.address() as AddressInfo).port;
    await check('http://127.0.0.1:' + port + '/v1');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk.toString('utf8');
  }
  return JSON.parse(raw) as Record<string, unknown>;
}

const chat: ChatMessage[] = [{role:'user',content:'Write hello world'}];
const options = {maxTokens:90,temperature:0.1};

test('Colibri-compatible model listing, chat and API key over real HTTP', async () => {
  const seen: Array<{ url: string; authorization?: string; request?: Record<string, unknown> }> = [];
  await mockColibri(async (req, res) => {
    const call = {url:req.url ?? '', authorization:req.headers.authorization, request:req.method === 'POST' ? await body(req) : undefined};
    seen.push(call);
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/v1/models') {
      res.end(JSON.stringify({data:[{id:'qwen3-coder-30b-a3b-colibri'},{id:'test-model'}]}));
      return;
    }
    assert.equal(req.url, '/v1/chat/completions');
    res.end(JSON.stringify({choices:[{message:{content:'Hello from local Colibri'}}]}));
  }, async (baseUrl) => {
    const client = new ColibriClient(() => ({baseUrl,allowInsecureRemote:false}), async () => 'secret');
    assert.deepEqual(await client.models(), ['qwen3-coder-30b-a3b-colibri','test-model']);
    assert.equal(await client.complete('test-model',chat,options), 'Hello from local Colibri');
  });
  assert.deepEqual(seen.map((x) => x.url), ['/v1/models','/v1/chat/completions']);
  assert.equal(seen[0].authorization, 'Bearer secret');
  assert.equal(seen[1].authorization, 'Bearer secret');
  assert.equal(seen[1].request?.model, 'test-model');
  assert.equal(seen[1].request?.stream, false);
});

test('streaming response reconstructs fragmented SSE deltas', async () => {
  await mockColibri(async (req, res) => {
    assert.equal(req.url, '/v1/chat/completions');
    const request = await body(req);
    assert.equal(request.stream, true);
    res.writeHead(200, {'Content-Type':'text/event-stream'});
    res.write('data: {"choices":[{"delta":{"content":"Hel');
    res.write('lo"}}]}\n\n');
    res.write('data: {"choices":[{"delta":{"content":" world"}}]}\n\n');
    res.end('data: [DONE]\n\n');
  }, async (baseUrl) => {
    const client = new ColibriClient(() => ({baseUrl,allowInsecureRemote:false}), async () => undefined);
    const deltas: string[] = [];
    const output = await client.stream('test-model',chat,options,(text) => deltas.push(text));
    assert.equal(output, 'Hello world');
    assert.deepEqual(deltas,['Hello',' world']);
  });
});

test('agent tool calling round-trip uses OpenAI-compatible message protocol', async () => {
  await mockColibri(async (req, res) => {
    assert.equal(req.url,'/v1/chat/completions');
    const request = await body(req);
    assert.equal(request.tool_choice,'auto');
    assert.equal((request.tools as unknown[]).length,1);
    const messages = request.messages as Array<{role:string}>;
    assert.equal(messages[0].role,'user');
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({
      choices:[{message:{content:'',tool_calls:[{
        id:'call_1',type:'function',function:{name:'get_diagnostics',arguments:'{}'},
      }]}}],
    }));
  },async (baseUrl) => {
    const client = new ColibriClient(() => ({baseUrl,allowInsecureRemote:false}), async () => undefined);
    const result = await client.agentStep(
      'test-model',
      [{role:'user',content:'Check errors'}],
      [{type:'function',function:{name:'get_diagnostics',parameters:{type:'object'}}}],
      options,
    );
    assert.equal(result.content,'');
    assert.equal(result.tool_calls.length,1);
    assert.equal(result.tool_calls[0].function.name,'get_diagnostics');
  });
});

test('model API errors keep helpful messages', async () => {
  await mockColibri((_req,res) => {
    res.writeHead(429,{'Content-Type':'application/json'});
    res.end(JSON.stringify({error:{message:'queue_timeout'}}));
  },async (baseUrl) => {
    const client = new ColibriClient(() => ({baseUrl,allowInsecureRemote:false}), async () => undefined);
    await assert.rejects(client.complete('m',chat,options),/429: queue_timeout/);
  });
});
