#!/usr/bin/env node
/**
 * Trusted main branch release publisher without a third-party release action.
 * Creates a draft, uploads a VSIX and checksum, then publishes the release.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const REPOSITORY = 'sbc-apps/sbc-code';
const apiBase = 'https://api.github.com/repos/' + REPOSITORY;
const token = process.env.GH_TOKEN;
const commit = process.env.RELEASE_COMMIT;
if (process.env.GITHUB_REPOSITORY !== REPOSITORY ||
    !token || !/^[a-f0-9]{40}$/i.test(commit || '')) {
  throw new Error('Release publishing requires the SBC repository, a GitHub token and an exact commit SHA.');
}

const manifest = JSON.parse(await readFile('package.json','utf8'));
const version = manifest.version;
if (manifest.name !== 'sbc-code' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
  throw new Error('Invalid stable SBC Code package version.');
}
const tag = 'v' + version;
const filename = 'sbc-code-' + version + '.vsix';
const archive = await readFile(filename);
if (!archive.length || archive.length > 30 * 1024 * 1024) {
  throw new Error('VSIX asset missing or too large.');
}
const checksum = createHash('sha256').update(archive).digest('hex');
const checksumName = filename + '.sha256';
await writeFile(checksumName, checksum + '  ' + filename + '\n');

const headers = {
  Authorization:'Bearer ' + token,
  Accept:'application/vnd.github+json',
  'X-GitHub-Api-Version':'2022-11-28',
  'User-Agent':'sbc-code-release-ci',
};

async function api(endpoint, options = {}) {
  const response = await fetch(apiBase + endpoint, {
    ...options, headers: {...headers, ...(options.headers || {})},
    redirect:'error',
    signal:AbortSignal.timeout(45000),
  });
  if (response.status === 204) return { status:204, data:null };
  let data;
  try { data = await response.json(); }
  catch { data = { message:'Invalid GitHub API response' }; }
  if (!response.ok && response.status !== 404) {
    throw new Error('GitHub release API HTTP ' + response.status + ': ' + String(data.message || 'unknown').slice(0,200));
  }
  return { status:response.status, data };
}

// Prevent an older CI completion from publishing after a newer main commit.
const currentMain = await api('/git/ref/heads/main');
if (currentMain.data?.object?.sha !== commit) {
  console.log('Skipping stale release for ' + commit + '; main has advanced.');
  process.exit(0);
}

const existing = await api('/releases/tags/' + encodeURIComponent(tag));
let release;
if (existing.status === 200) {
  release = existing.data;
  if (release.draft === false) {
    console.log(tag + ' already published; not replacing assets.');
    process.exit(0);
  }
  if (release.target_commitish !== commit) {
    throw new Error('Existing draft release targets a different commit; refusing to overwrite.');
  }
} else {
  const created = await api('/releases', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      tag_name:tag,
      target_commitish:commit,
      name:'SBC Code ' + tag,
      body:'Download the verified VSIX from the release assets. SHA-256 checksum is included.',
      draft:true,
      prerelease:false,
      generate_release_notes:true,
    }),
  });
  if (created.status !== 201 || !created.data?.id) {
    throw new Error('GitHub did not create a draft release.');
  }
  release = created.data;
}

async function upload(name, bytes, mime) {
  if ((release.assets || []).some((asset) => asset.name === name)) {
    console.log('Asset already present: ' + name);
    return;
  }
  const url = 'https://uploads.github.com/repos/' + REPOSITORY +
    '/releases/' + release.id + '/assets?name=' + encodeURIComponent(name);
  const result = await fetch(url, {
    method:'POST',
    headers:{
      ...headers,
      'Content-Type':mime,
      'Content-Length':String(bytes.length),
    },
    body:bytes,
    redirect:'error',
    signal:AbortSignal.timeout(120000),
  });
  const response = await result.json();
  if (result.status !== 201) {
    throw new Error('GitHub failed to upload ' + name + ': ' + String(response.message || result.status).slice(0,200));
  }
  console.log('Uploaded asset: ' + name);
}

await upload(filename,archive,'application/octet-stream');
await upload(checksumName,Buffer.from(checksum + '  ' + filename + '\n'),'text/plain');

const published = await api('/releases/' + release.id,{
  method:'PATCH',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({draft:false,prerelease:false,make_latest:'true'}),
});
if (published.status !== 200 || published.data.draft !== false) {
  throw new Error('Failed to publish the completed release.');
}
console.log('Published ' + tag + ': ' + published.data.html_url);
