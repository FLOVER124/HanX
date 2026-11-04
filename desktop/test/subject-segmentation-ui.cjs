// Source-only inference test using the already installed Electron runtime.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
app.on('window-all-closed',()=>{});
(async()=>{await app.whenReady();const temp=await fs.mkdtemp(path.join(os.tmpdir(),'hanx-subject-'));let win;
try{const preload=path.join(temp,'preload.cjs');await fs.writeFile(preload,"require('electron').contextBridge.exposeInMainWorld('hanx',{initial:async()=>null,onOpened:()=>{},onAction:()=>{},reportError:async()=>{}})");
win=new BrowserWindow({show:false,webPreferences:{preload,sandbox:true,contextIsolation:true,backgroundThrottling:false}});
win.webContents.on('console-message',(_e,...args)=>{const m=typeof args[0]==='object'?args[0].message:args[1];if(String(m).includes('Error')||String(m).includes('Refused'))console.error(m);});
await win.loadFile(path.join(__dirname,'../index.html'));
const result=await win.webContents.executeJavaScript(`(async()=>{const c=document.createElement('canvas');c.width=c.height=320;const x=c.getContext('2d');x.fillStyle='#d6deeb';x.fillRect(0,0,320,320);x.fillStyle='#b22f34';x.beginPath();x.ellipse(160,160,70,110,0,0,7);x.fill();const data=x.getImageData(0,0,320,320).data;const canceled=HanXSubjectSegmentation.start(new Uint8ClampedArray(data));canceled.cancel();let aborted=false;try{await canceled.promise;}catch(e){aborted=e.name==='AbortError';}const job=HanXSubjectSegmentation.start(data);const mask=await job.promise;let min=1,max=0,sum=0;for(const v of mask){if(!Number.isFinite(v))throw Error('Nonfinite mask');min=Math.min(min,v);max=Math.max(max,v);sum+=v;}return {aborted,length:mask.length,min,max,sum};})()`);
assert.equal(result.aborted,true);assert.equal(result.length,102400);assert.equal(result.min,0);assert.equal(result.max,1);assert.ok(result.sum>0&&result.sum<102400);console.log('HANX_SUBJECT_INFERENCE_OK',JSON.stringify(result));
}finally{win?.destroy();await fs.rm(temp,{recursive:true,force:true});app.quit();}})().catch(error=>{console.error(error);app.exit(1);});
