#!/usr/bin/env node
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
function fail(code, message) {
  process.stderr.write(JSON.stringify({ ok: false, error: { code, message } }) + '\n');
  process.exitCode = 1;
}
function resolveBinary(root, platform, arch, exists = fs.existsSync) {
  if (!['darwin','linux','win32'].includes(platform) || !['arm64','x64'].includes(arch)) {
    throw Object.assign(new Error(`Unsupported HanX platform: ${platform}-${arch}.`), { code: 'unsupported_platform' });
  }
  const binary = path.join(root, 'native', `${platform}-${arch}`, platform === 'win32' ? 'hanx.exe' : 'hanx');
  if (exists(binary)) return binary;
  const legacy = path.join(root, 'native', 'hanx');
  if (platform === 'darwin' && exists(legacy)) return legacy;
  throw Object.assign(new Error(`HanX native executable is missing for ${platform}-${arch}: ${binary}. This package must include a native build for your platform; reinstall a matching package or use the standalone CLI archive.`), { code: 'native_binary_missing' });
}
async function main() {
  const setup = require('../lib/setup.js');
  const command = process.argv[2];
  try {
    if (['--delete','--uninstall','uninstall'].includes(command)) {
      process.exitCode=await require('../lib/uninstall.js').uninstall(path.resolve(__dirname,'..'),process.argv.slice(3));return;
    }
    if (['--update','update','--check-update','--version','version'].includes(command)) {
      const updater=require('../lib/update.js'),current=require('../package.json').version;
      const args=process.argv.slice(3);
      if(args.some(a=>a!=='--pretty'))throw Error('지원하지 않는 업데이트 옵션입니다.');
      if(command==='--update'||command==='update'){await updater.update({root:path.resolve(__dirname,'..'),current});return;}
      const info=await updater.check({current});
      if(process.stdout.isTTY){console.log(`HanX ${current}  ${info.status}`);if(info.updateAvailable)console.log(`Latest ${info.latestVersion}  hanx --update`);}
      else console.log(JSON.stringify({ok:true,version:current,data:info},null,args.includes('--pretty')?2:0));
      return;
    }
    if (command === 'setup') { await setup.setup(process.argv.slice(3)); return; }
    if (command === 'gui') { await setup.launchGUI(); return; }
    if (setup.readState().components === 'gui') { fail('cli_not_selected', 'GUI only is selected. Run hanx setup --components cli --yes (or all) to enable terminal commands.'); return; }
  } catch(error) { fail('setup_failed', error.message); return; }
  let binary;
  try { binary = resolveBinary(path.resolve(__dirname, '..'), process.platform, process.arch); }
  catch (error) {
    if (error.code !== 'native_binary_missing') { fail(error.code, error.message); return; }
    try { binary = setup.optionalBinary() || await setup.installCLI(); }
    catch (installError) { fail('native_install_failed', installError.message); return; }
  }
  const child = spawn(binary, process.argv.slice(2), { stdio: 'inherit', shell: false });
  const handlers = new Map();
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    const handler = () => { if (!child.killed) child.kill(signal); };
    handlers.set(signal, handler);
    process.on(signal, handler);
  }
  function cleanup() { for (const [signal, handler] of handlers) process.removeListener(signal, handler); }
  child.once('error', error => { cleanup(); fail('native_launch_failed', `${binary}: ${error.message}`); });
  child.once('exit', (code, signal) => {
    cleanup();
    if (signal) process.kill(process.pid, signal);
    else process.exitCode = code === null ? 1 : code;
  });
}
module.exports = { resolveBinary };
if (require.main === module) main().catch(error => fail('launcher_failed', error.message));
