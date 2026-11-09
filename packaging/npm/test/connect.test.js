'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { createBridge, sanitizeArguments, prepareWorkspace, parseArgs, parseTunnelUrl, startTunnel, BridgeError } = require('../lib/connect.js');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hanx-connect-'));
const root = fs.realpathSync(fs.mkdirSync(path.join(temp, 'HanX'), { recursive: true }) || path.join(temp, 'HanX'));
const outside = path.join(temp, 'secret.txt');
fs.writeFileSync(outside, 'secret');
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

test('resolves relative paths inside the workspace', () => {
  const safe = sanitizeArguments('hanx_convert', { input: '보고서.hwp', output: 'out/보고서.docx' }, { root });
  assert.equal(safe.input, path.join(root, '보고서.hwp'));
  assert.equal(safe.output, path.join(root, 'out', '보고서.docx'));
});

test('rejects paths that leave the workspace', () => {
  for (const args of [{ input: '../secret.txt' }, { input: outside }, { output: '/etc/hanx.docx' }, { input: 'a.hwp', baseDirectory: '..' }]) {
    assert.throws(() => sanitizeArguments('hanx_read', args, { root }), BridgeError, JSON.stringify(args));
  }
  assert.throws(() => sanitizeArguments('hanx_create', { output: 'x.docx', spec: { kind: 'document', blocks: [{ type: 'image', path: outside }] } }, { root }), /작업 폴더/);
  assert.throws(() => sanitizeArguments('hanx_pdf_edit', { input: 'a.pdf', output: 'b.pdf', operations: [{ op: 'set_text', font: '../../x.ttf' }] }, { root }), /작업 폴더/);
});

test('rejects symlinks that point outside the workspace', { skip: process.platform === 'win32' }, () => {
  fs.symlinkSync(outside, path.join(root, 'link.txt'));
  assert.throws(() => sanitizeArguments('hanx_read', { input: 'link.txt' }, { root }), /작업 폴더/);
});

test('read-only tools may read the installed guide, write tools may not', () => {
  const guideDir = fs.realpathSync(temp);
  assert.equal(sanitizeArguments('hanx_read', { input: outside }, { root, readRoots: [guideDir] }).input, fs.realpathSync(outside));
  assert.throws(() => sanitizeArguments('hanx_edit', { input: outside, output: 'x.txt', operations: [] }, { root, readRoots: [guideDir] }), /작업 폴더/);
});

test('overwriting is refused unless allowed', () => {
  assert.throws(() => sanitizeArguments('hanx_convert', { input: 'a.hwp', output: 'b.docx', force: true }, { root }), /교체/);
  assert.equal(sanitizeArguments('hanx_convert', { input: 'a.hwp', output: 'b.docx', force: true }, { root, allowOverwrite: true }).force, true);
  assert.equal(sanitizeArguments('hanx_create', { output: 'a.hwp', spec: {} }, { root }).baseDirectory, root);
});

test('refuses the home folder as a workspace', () => {
  assert.throws(() => prepareWorkspace(os.homedir()), /홈 폴더/);
  assert.equal(prepareWorkspace(path.join(temp, 'new folder')), fs.realpathSync(path.join(temp, 'new folder')));
});

test('parses options and tunnel addresses', () => {
  assert.deepEqual(parseArgs(['--folder', 'docs', '--port', '9000', '--no-tunnel']), { folder: 'docs', port: 9000, tunnel: false, allowOverwrite: false });
  assert.throws(() => parseArgs(['--bogus']), BridgeError);
  assert.equal(parseTunnelUrl('INF |  https://quiet-river-1234.trycloudflare.com  |'), 'https://quiet-river-1234.trycloudflare.com');
  assert.equal(parseTunnelUrl('https://api.trycloudflare.com.evil.example'), null);
});

test('starts cloudflared and reads its public address', async () => {
  const fake = path.join(temp, 'fake-cloudflared.js');
  fs.writeFileSync(fake, "process.stderr.write('INF Your quick Tunnel has been created! Visit it at:\\nINF |  https://calm-sea-42.trycloudflare.com  |\\n'); setInterval(()=>{}, 1000);");
  const launcher = path.join(temp, process.platform === 'win32' ? 'cf.cmd' : 'cf');
  fs.writeFileSync(launcher, process.platform === 'win32' ? `@"${process.execPath}" "${fake}" %*` : `#!/bin/sh\nexec "${process.execPath}" "${fake}" "$@"\n`, { mode: 0o755 });
  const { child, url } = await startTunnel(launcher, 1234);
  child.kill();
  assert.equal(url, 'https://calm-sea-42.trycloudflare.com');
});

// Full round trip through the real engine: HANX_BIN=/path/to/hanx npm test
const BIN = process.env.HANX_BIN;
test('serves MCP over HTTP with the real engine', { skip: BIN ? false : 'set HANX_BIN to run' }, async () => {
  const work = fs.realpathSync(fs.mkdtempSync(path.join(temp, 'work-')));
  const token = 'test-token-0123456789abcdef';
  const server = http.createServer(createBridge({ binary: BIN, root: work, token }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let id = 0;
  const post = (url, body) => fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const rpc = async (method, params) => (await post(`/mcp/${token}`, { jsonrpc: '2.0', id: ++id, method, params })).json();
  const call = async (name, args) => { const r = (await rpc('tools/call', { name, arguments: args })).result; return { isError: r.isError, data: JSON.parse(r.content[0].text) }; };
  try {
    assert.equal((await post('/mcp/wrong-token', { jsonrpc: '2.0', id: 1, method: 'ping' })).status, 404);
    assert.equal((await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } })).result.serverInfo.name, 'hanx');
    const tools = (await rpc('tools/list')).result.tools;
    assert.equal(tools[0].name, 'hanx_list_files');
    assert.ok(!tools.some((t) => t.inputSchema.properties?.force), 'force is hidden');

    const created = await call('hanx_create', { output: '보고서.hwp', spec: { kind: 'document', text: '2025년 원문' } });
    assert.equal(created.isError, false, JSON.stringify(created.data));
    assert.ok(!JSON.stringify(created.data).includes(work), 'workspace path is shown relative');
    await call('hanx_edit', { input: '보고서.hwp', output: '보고서-수정.docx', operations: [{ op: 'replace_text', find: '2025년', replace: '2026년' }] });
    assert.equal((await call('hanx_read', { input: '보고서-수정.docx' })).data.data.text, '2026년 원문');
    assert.deepEqual((await call('hanx_list_files', {})).data.data.files.map((f) => f.path), ['보고서-수정.docx', '보고서.hwp']);

    const escape = await call('hanx_read', { input: outside });
    assert.equal(escape.isError, true);
    assert.equal(fs.readFileSync(outside, 'utf8'), 'secret');
    const overwrite = await call('hanx_convert', { input: '보고서.hwp', output: '보고서-수정.docx', force: true });
    assert.equal(overwrite.isError, true);
  } finally {
    server.close();
  }
});
