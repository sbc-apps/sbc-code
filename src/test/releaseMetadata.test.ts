import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { isNewerRelease, parseOfficialRelease, MAX_VSIX_BYTES } from '../releaseMetadata';

const SHA = 'a'.repeat(64);
function release(version: string, digest: string = 'sha256:' + SHA) {
  const tag = 'v' + version;
  const url = 'https://github.com/sbc-apps/sbc-code/releases/tag/' + tag;
  const file = 'sbc-code-' + version + '.vsix';
  return {
    draft: false, prerelease: false, tag_name: tag, html_url: url,
    assets: [{
      name: file, browser_download_url:
        'https://github.com/sbc-apps/sbc-code/releases/download/' + tag + '/' + file,
      digest, size: 12345,
    }],
  };
}

test('stable semantic versions are compared numerically', () => {
  assert.equal(isNewerRelease('0.5.0','0.6.0'),true);
  assert.equal(isNewerRelease('0.9.9','0.10.0'),true);
  assert.equal(isNewerRelease('1.2.9','1.3.0'),true);
  assert.equal(isNewerRelease('1.0.0','1.0.0'),false);
  assert.equal(isNewerRelease('1.1.0','1.0.9'),false);
  assert.equal(isNewerRelease('1.0.0','1.1.0-beta'),false);
  assert.equal(isNewerRelease('0.6.0','banana'),false);
});

test('only an official, stable, newer GitHub release is accepted', () => {
  const info = parseOfficialRelease(release('0.6.0'),'0.5.0');
  assert.equal(info?.version,'0.6.0');
  assert.equal(info?.asset?.sha256,SHA);
  assert.equal(info?.asset?.name,'sbc-code-0.6.0.vsix');
  assert.equal(parseOfficialRelease(release('0.5.0'),'0.5.0'),undefined);
  assert.equal(parseOfficialRelease({...release('0.6.0'),draft:true},'0.5.0'),undefined);
  assert.equal(parseOfficialRelease({...release('0.6.0'),prerelease:true},'0.5.0'),undefined);
  assert.equal(parseOfficialRelease({...release('0.6.0'),html_url:'https://evil.example'},'0.5.0'),undefined);
  assert.equal(parseOfficialRelease({...release('0.6.0'),tag_name:'v0.6.0-beta'},'0.5.0'),undefined);
});

test('missing or invalid hash disallows automatic install but still allows release notification', () => {
  assert.equal(parseOfficialRelease(release('0.6.0',''),'0.5.0')?.asset,undefined);
  assert.equal(parseOfficialRelease(release('0.6.0','sha256:123'),'0.5.0')?.asset,undefined);
  const big = release('0.6.0');
  big.assets[0].size = MAX_VSIX_BYTES + 1;
  assert.equal(parseOfficialRelease(big,'0.5.0')?.asset,undefined);
  big.assets[0].size = 1200;
  big.assets[0].browser_download_url = 'https://malicious.invalid/fake.vsix';
  assert.equal(parseOfficialRelease(big,'0.5.0')?.asset,undefined);
});
