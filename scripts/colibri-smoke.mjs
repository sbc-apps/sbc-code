#!/usr/bin/env node
/**
 * Manual smoke test for a running Colibri OpenAI-compatible server.
 * Never runs during CI. Does not access workspace code or execute model tools.
 *
 *   COLIBRI_BASE_URL=http://127.0.0.1:8000/v1 npm run smoke:colibri
 *   COLIBRI_MODEL=qwen3-coder-30b-a3b-colibri npm run smoke:colibri
 *   npm run smoke:colibri -- --tools   # optional tool-call protocol probe
 */
const rawBase = process.env.COLIBRI_BASE_URL || 'http://127.0.0.1:8000/v1';
const key = process.env.COLIBRI_API_KEY;
const probeTools = process.argv.includes('--tools');

async function request(endpoint, payload) {
  const root = new URL(rawBase);
  if (!['http:','https:'].includes(root.protocol) ||
      root.username || root.password || root.search || root.hash) {
    throw new Error('Expected a plain HTTP(S) API base URL without embedded credentials.');
  }
  const local = ['localhost','127.0.0.1','[::1]'].includes(root.hostname.toLowerCase());
  if (!local && root.protocol !== 'https:') {
    throw new Error('Remote Colibri endpoints require HTTPS.');
  }
  root.pathname = root.pathname.replace(/\/+$/,'') + '/' + endpoint;
  const response = await fetch(root.toString(),{
    method: payload ? 'POST' : 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(180000),
    headers: {
      Accept:'application/json',
      ...(payload ? {'Content-Type':'application/json'} : {}),
      ...(key ? {Authorization:'Bearer ' + key} : {}),
    },
    ...(payload ? {body:JSON.stringify(payload)} : {}),
  });
  const result = await response.json();
  if (!response.ok) {
    const reason = result?.error?.message || 'HTTP ' + response.status;
    throw new Error(String(reason).slice(0,300));
  }
  return result;
}

try {
  const modelList = await request('models');
  const available = (modelList.data || []).map((entry) => entry.id).filter(Boolean);
  if (available.length === 0) {
    throw new Error('Server has no models available via /v1/models.');
  }
  const model = process.env.COLIBRI_MODEL || available[0];
  console.log('Server connection: OK');
  console.log('Model:',model);
  const reply = await request('chat/completions',{
    model,stream:false,max_tokens:64,temperature:0,
    messages:[{role:'user',content:'Respond with a short TypeScript function returning 42.'}],
  });
  const content = reply?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Chat completion returned no text.');
  }
  console.log('Chat completion: OK (' + content.length + ' chars)');
  console.log('Reply preview:',content.replace(/\s+/g,' ').slice(0,120));

  if (probeTools) {
    const toolReply = await request('chat/completions',{
      model,stream:false,max_tokens:128,temperature:0,
      messages:[{role:'user',content:'Call the report_status tool with status ok. Do not answer in plain text.'}],
      tools:[{
        type:'function',
        function:{
          name:'report_status',
          description:'A dummy status-reporting tool. No command runs.',
          parameters:{type:'object',properties:{status:{type:'string'}},required:['status']},
        },
      }],
      tool_choice:'auto',
    });
    const calls = toolReply?.choices?.[0]?.message?.tool_calls || [];
    console.log('Tool protocol:',calls.length ? 'tool call returned' : 'no tool call returned (model-dependent)');
    if (calls.length) console.log('First tool:',String(calls[0]?.function?.name || '').slice(0,60));
  }
  console.log('Smoke test completed.');
} catch(error) {
  console.error('Colibri smoke test failed:',error instanceof Error ? error.message : String(error));
  process.exitCode=1;
}
