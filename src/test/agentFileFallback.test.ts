import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { getRequestedFileTarget, extractGeneratedFile } from '../agentFileFallback';

test('explicit file creation and conventional HTML calculator requests are recognized', () => {
  assert.deepEqual(getRequestedFileTarget('User request:\nCreate index.html with a calculator'),
    {path:'index.html',language:'html'});
  assert.deepEqual(getRequestedFileTarget('User request:\nBuild a calculator project with html'),
    {path:'index.html',language:'html'});
  assert.deepEqual(getRequestedFileTarget('User request:\nWrite src/app.ts'),
    {path:'src/app.ts',language:'code'});
  assert.equal(getRequestedFileTarget('User request:\nExplain src/app.ts'),undefined);
  assert.equal(getRequestedFileTarget('User request:\nCreate index.html and package.json'),undefined);
});

test('HTML fallback takes only a complete HTML document, not JSON or prose', () => {
  const target={path:'index.html',language:'html'} as const;
  const fence=String.fromCharCode(96).repeat(3);
  assert.equal(extractGeneratedFile(fence+'html\n<!doctype html><html><body>Calc</body></html>\n'+fence,target),
    '<!doctype html><html><body>Calc</body></html>\n');
  assert.equal(extractGeneratedFile('I created it! '+fence+'json\n{"name":"calc"}\n'+fence,target),undefined);
  assert.equal(extractGeneratedFile('some HTML <body></body>',target),undefined);
  assert.equal(extractGeneratedFile('Here is the file:\n<html><body>ok</body></html>',target),
    '<html><body>ok</body></html>\n');
});
