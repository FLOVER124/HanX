'use strict';
const {BrowserWindow}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
// Print a private snapshot so subsequent edits or closing the editor cannot change it.
async function printPDF(source){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'hanx-print-')),file=path.join(directory,'document.pdf');
 let win;try{
  await fs.copyFile(source,file);
  win=new BrowserWindow({width:1000,height:780,show:false,title:'인쇄 — HanX',webPreferences:{contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true,partition:'hanx-print'}});
  win.webContents.session.setPermissionRequestHandler((_web,_permission,callback)=>callback(false));
  win.webContents.session.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!['file:','data:','blob:','chrome-extension:','chrome:','about:'].some(prefix=>details.url.startsWith(prefix))}));
  win.webContents.on('will-navigate',event=>event.preventDefault());
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.once('closed',()=>{fs.rm(directory,{recursive:true,force:true}).catch(()=>{});});
  await win.loadFile(file);win.show();
  return await new Promise((resolve,reject)=>{let finished=false;const done=(success,reason)=>{if(finished)return;finished=true;if(!success&&reason&&!/cancel/i.test(reason))reject(Error('인쇄를 시작하지 못했습니다. 프린터 설정을 확인하세요. '+reason));else resolve(success);if(!win.isDestroyed())win.close();};win.once('closed',()=>done(false));win.webContents.print({silent:false,printBackground:true},done);});
 }catch(error){if(win&&!win.isDestroyed())win.destroy();await fs.rm(directory,{recursive:true,force:true});throw error;}
}
module.exports={printPDF};
