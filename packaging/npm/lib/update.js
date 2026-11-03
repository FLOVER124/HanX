'use strict';
const https=require('node:https'),path=require('node:path'),fs=require('node:fs');
const {spawn}=require('node:child_process');
const PACKAGE='@juyoungsuh/hanx';
function compare(a,b){const parse=s=>{if(!/^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(s))throw Error('올바르지 않은 버전 정보입니다.');return s.split('.').map(Number);};const x=parse(a),y=parse(b);for(let i=0;i<3;i++)if(x[i]!==y[i])return Math.sign(x[i]-y[i]);return 0;}
function latest(){return new Promise((resolve,reject)=>{
 const request=https.get('https://registry.npmjs.org/@juyoungsuh%2fhanx/latest',{headers:{Accept:'application/json','User-Agent':'HanX updater'}},response=>{
  if(response.statusCode!==200){response.resume();reject(Error('최신 버전을 확인할 수 없습니다.'));return;}
  let text='';response.setEncoding('utf8');response.on('data',chunk=>{text+=chunk;if(text.length>1024*1024)request.destroy(Error('버전 응답이 너무 큽니다.'));});response.on('error',reject);response.on('end',()=>{try{const value=JSON.parse(text).version;compare(value,value);resolve(value);}catch(error){reject(error);}});
 });const timer=setTimeout(()=>request.destroy(Error('최신 버전 확인 시간이 초과됐습니다.')),5000);request.once('close',()=>clearTimeout(timer));request.on('error',reject);
});}
function channel(root){const real=fs.realpathSync(root).replaceAll('\\','/');return /\/(Cellar|opt)\/hanx\//.test(real)?'brew':'npm';}
function plan(kind,version){compare(version,version);return kind==='brew'?[[process.platform==='win32'?'brew.exe':'brew',['update']],['brew',['upgrade','StudentsView/tap/hanx']]]:[[process.platform==='win32'?'npm.cmd':'npm',['install','--global',PACKAGE+'@'+version]]];}
function run(file,args){return new Promise((resolve,reject)=>{
 // Windows npm is a .cmd launcher; use its JS entry with Node, without a shell.
 if(process.platform==='win32'&&file==='npm.cmd') {const npm=path.join(path.dirname(process.execPath),'node_modules','npm','bin','npm-cli.js');if(!fs.existsSync(npm)){reject(Error('npm 실행 파일을 찾을 수 없습니다. npm install -g @juyoungsuh/hanx@latest 를 실행하세요.'));return;}args=[npm,...args];file=process.execPath;}
 const child=spawn(file,args,{stdio:'inherit',shell:false});child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(Error('업데이트하지 못했습니다. 설치 관리자 메시지를 확인하세요.')));
});}
async function check({current,fetchLatest=latest}){try{const version=await fetchLatest();const order=compare(current,version);return {version:current,latestVersion:version,updateAvailable:order<0,status:order<0?'Update available':order===0?'Up to date':'Newer local version'};}catch(error){return {version:current,latestVersion:null,updateAvailable:null,status:'Version check unavailable',message:error.message};}}
async function update({root,current,fetchLatest=latest,execute=run,kind=channel(root),readState=()=>require('./setup.js').readState()}){
 const info=await check({current,fetchLatest});
 if(info.updateAvailable===null)throw Error(info.message);
 console.log(`HanX ${current}  ${info.status}${info.updateAvailable?' → '+info.latestVersion:''}`);
 const state=readState();
 const guiSelected=state.components==='gui'||state.components==='all';
 let guiBehind=guiSelected&&!state.guiVersion;
 if(guiSelected&&state.guiVersion){try{guiBehind=compare(state.guiVersion,info.latestVersion)<0;}catch{throw Error('앱 설치 정보를 확인할 수 없습니다. hanx setup을 실행하세요.');}}
 if(!info.updateAvailable&&!guiBehind)return info;
 const stableRoot=root.replace(/([/\\])Cellar[/\\]hanx[/\\][^/\\]+/, '$1opt/hanx');
 let updatedRoot=root;
 if(info.updateAvailable){
  for(const [file,args] of plan(kind,info.latestVersion))await execute(file,args);
  updatedRoot=kind==='brew'?fs.realpathSync(stableRoot):path.join((await npmPrefix()),'node_modules',...PACKAGE.split('/'));
  if(JSON.parse(fs.readFileSync(path.join(updatedRoot,'package.json'),'utf8')).version!==info.latestVersion)throw Error('설치 관리자의 배포 버전이 아직 갱신되지 않았습니다. 잠시 후 다시 시도하세요.');
 }
 if(guiBehind)await execute(process.execPath,[path.join(updatedRoot,'bin','hanx.js'),'setup','--components',state.components,'--yes']);
 console.log(`HanX ${info.latestVersion}  Up to date`);return info;
}
async function npmPrefix(){const {execFile}=require('node:child_process');return new Promise((resolve,reject)=>{const file=process.platform==='win32'?process.execPath:'npm';const args=process.platform==='win32'?[path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),'root','--global']:['root','--global'];execFile(file,args,{timeout:10000},(error,stdout)=>error?reject(error):resolve(path.dirname(stdout.trim())));});}
module.exports={compare,latest,channel,plan,check,update};
