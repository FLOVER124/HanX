const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {existingEngine,uninstall}=require('../lib/uninstall.js');
const version=require('../package.json').version;
test('finds installed engines for GUI-only without downloads or trusting setup paths',()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'hanx-delete-test-'));
 try {
  const root=path.join(base,'npm'),home=path.join(base,'home'),data=path.join(base,'data');
  for(const platform of ['win32','linux']) {
   const file=path.join(data,'HanX',version,`${platform}-x64`,'cli',platform==='win32'?'hanx.exe':'hanx');
   fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'test');
   assert.equal(existingEngine(root,platform,'x64',home,{XDG_DATA_HOME:data,LOCALAPPDATA:data}),file);
   fs.rmSync(file);
  }
  const exe=path.join(data,'Programs/HanX/resources/cli/hanx.exe');fs.mkdirSync(path.dirname(exe),{recursive:true});fs.writeFileSync(exe,'test');
  assert.equal(existingEngine(root,'win32','x64',home,{LOCALAPPDATA:data}),exe);
  assert.equal(existingEngine(root,'linux','x64',home,{XDG_DATA_HOME:data}),undefined);
 }finally{fs.rmSync(base,{recursive:true,force:true});}
});
test('delete never accepts a bypass confirmation flag',async()=>{
 await assert.rejects(()=>uninstall('/unused',['--yes']),/사용법/);
 await assert.rejects(()=>uninstall('/unused',['--force']),/사용법/);
});
