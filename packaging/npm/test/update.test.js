const {test}=require('node:test'),assert=require('node:assert/strict'),U=require('../lib/update.js');
test('version comparison is numeric and rejects executable or prerelease metadata',()=>{
 assert.equal(U.compare('2.9.0','2.11.0'),-1);assert.equal(U.compare('2.12.0','2.12.0'),0);
 for(const v of ['latest','v2.1.0','2.1.0;id','2.1.0-beta','9999999.1.0'])assert.throws(()=>U.compare(v,'2.1.0'));
});
test('offline version check never reports up to date',async()=>{
 const info=await U.check({current:'2.11.0',fetchLatest:async()=>{throw Error('offline')}});
 assert.equal(info.status,'Version check unavailable');assert.equal(info.updateAvailable,null);
});
test('update check identifies newer local and available stable versions',async()=>{
 for(const [latest,status] of [['2.11.0','Up to date'],['2.12.0','Update available'],['2.9.0','Newer local version']])
  assert.equal((await U.check({current:'2.11.0',fetchLatest:async()=>latest})).status,status);
});
test('up to date exits without executing an installer',async()=>{
 let called=false;await U.update({root:__dirname,current:'2.11.0',kind:'npm',readState:()=>({components:'cli'}),fetchLatest:async()=>'2.11.0',execute:async()=>{called=true}});assert.equal(called,false);
});
test('installer failures stop the update and never silently succeed',async()=>{
 await assert.rejects(U.update({root:__dirname,current:'2.10.0',kind:'npm',readState:()=>({components:'cli'}),fetchLatest:async()=>'2.11.0',execute:async()=>{throw Error('permission denied')}}),/permission denied/);
});
test('update plans never interpolate registry data into a shell',()=>{
 assert.deepEqual(U.plan('brew','2.11.0').map(x=>x[1]),[['update'],['upgrade','flover124/tap/hanx']]);
 assert.equal(U.plan('npm','2.11.0')[0][1].at(-1),require('../package.json').name+'@2.11.0');
});

test('an up-to-date CLI still updates an explicitly selected older GUI',async()=>{
 const calls=[];
 await U.update({root:__dirname,current:'2.11.0',kind:'npm',readState:()=>({components:'all',guiVersion:'2.10.0'}),fetchLatest:async()=>'2.11.0',execute:async(...args)=>calls.push(args)});
 assert.equal(calls.length,1);assert.deepEqual(calls[0][1].slice(1),['setup','--components','all','--yes']);
});


test('legacy Homebrew installs update their remote before upgrading their existing formula',()=>{
 assert.deepEqual(U.plan('brew','2.13.0','studentsview/tap').map(x=>x[1]),[
  ['tap','--custom-remote','studentsview/tap','https://github.com/FLOVER124/homebrew-tap.git'],
  ['update'],['upgrade','studentsview/tap/hanx']
 ]);
 assert.deepEqual(U.plan('brew','2.13.0','other/tap').map(x=>x[1]),[['update'],['upgrade','other/tap/hanx']]);
 assert.throws(()=>U.plan('brew','2.13.0','--bad/tap'));
});

test('Homebrew receipt determines the installed tap through an opt symlink',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hanx-update-'));
 try {
  const keg=path.join(dir,'Cellar','hanx','2.12.0'),root=path.join(keg,'libexec');
  fs.mkdirSync(root,{recursive:true});
  fs.writeFileSync(path.join(keg,'INSTALL_RECEIPT.json'),JSON.stringify({source:{tap:'StudentsView/tap'}}));
  const opt=path.join(dir,'opt');fs.symlinkSync(keg,opt,'dir');
  assert.equal(U.brewTap(path.join(opt,'libexec')),'studentsview/tap');
  fs.writeFileSync(path.join(keg,'INSTALL_RECEIPT.json'),JSON.stringify({source:{tap:'flover124/tap'}}));
  assert.equal(U.brewTap(root),'flover124/tap');
  fs.writeFileSync(path.join(keg,'INSTALL_RECEIPT.json'),'broken');
  assert.throws(()=>U.brewTap(root));
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
