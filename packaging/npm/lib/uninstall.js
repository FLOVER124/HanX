'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {spawn}=require('node:child_process');
const setup=require('./setup.js');
function existingEngine(root,platform=process.platform,arch=process.arch,home=os.homedir(),env=process.env) {
 const name=platform==='win32'?'hanx.exe':'hanx';
 const data=platform==='win32'?(env.LOCALAPPDATA||path.join(home,'AppData','Local')):(env.XDG_DATA_HOME||path.join(home,'.local','share'));
 const candidates=[path.join(root,'native',`${platform}-${arch}`,name)];
 if(platform==='darwin')candidates.push(path.join(root,'native','hanx'),path.join(home,'Applications/HanX.app/Contents/Resources/CLI/hanx'),'/Applications/HanX.app/Contents/Resources/CLI/hanx');
 candidates.push(path.join(data,'HanX',setup.VERSION,`${platform}-${arch}`,'cli',name));
 if(platform==='win32')candidates.push(path.join(data,'Programs','HanX','resources','cli','hanx.exe'));
 return candidates.find(file=>fs.existsSync(file));
}
function run(file,args,options={}) {return new Promise((resolve,reject)=>{
 const child=spawn(file,args,{stdio:'inherit',shell:false,...options});
 child.once('error',reject);child.once('exit',(code,signal)=>resolve(signal?130:code??1));
});}
async function uninstall(root,args) {
 if(args.length && !(args.length===1&&args[0]==='--dry-run'))throw Error('사용법: hanx --delete [--dry-run]');
 let engine=existingEngine(root)||setup.optionalBinary(),temporary;
 try {
  // GUI-only AppImages contain an engine. Extract that local engine instead of
  // downloading or installing anything to perform an uninstall.
  if(!engine&&process.platform==='linux') {
   const app=path.join(setup.paths().root,setup.VERSION,setup.platformKey(),'HanX.AppImage');
   if(fs.existsSync(app)) {
    temporary=fs.mkdtempSync(path.join(os.tmpdir(),'hanx-uninstall-engine-'));
    if(await run(app,['--appimage-extract'],{cwd:temporary,stdio:'ignore'})!==0)throw Error('앱의 삭제 엔진을 준비하지 못했습니다.');
    engine=path.join(temporary,'squashfs-root','resources','cli','hanx');
    if(!fs.existsSync(engine))throw Error('앱에서 삭제 엔진을 찾지 못했습니다.');
   }
  }
  if(!engine)throw Error('설치된 HanX 실행 엔진을 찾지 못했습니다. 설치를 복구한 뒤 다시 실행하세요.');
  return await run(engine,['--delete',...args]);
 } finally {if(temporary)fs.rmSync(temporary,{recursive:true,force:true});}
}
module.exports={existingEngine,uninstall};
