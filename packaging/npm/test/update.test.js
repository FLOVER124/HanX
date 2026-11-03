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
 assert.deepEqual(U.plan('brew','2.11.0').map(x=>x[1]),[['update'],['upgrade','StudentsView/tap/hanx']]);
 assert.equal(U.plan('npm','2.11.0')[0][1].at(-1),'@juyoungsuh/hanx@2.11.0');
});

test('an up-to-date CLI still updates an explicitly selected older GUI',async()=>{
 const calls=[];
 await U.update({root:__dirname,current:'2.11.0',kind:'npm',readState:()=>({components:'all',guiVersion:'2.10.0'}),fetchLatest:async()=>'2.11.0',execute:async(...args)=>calls.push(args)});
 assert.equal(calls.length,1);assert.deepEqual(calls[0][1].slice(1),['setup','--components','all','--yes']);
});
