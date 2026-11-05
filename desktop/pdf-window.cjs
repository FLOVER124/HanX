'use strict';
const {BrowserWindow,ipcMain,dialog}=require('electron');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {PDFSession}=require('./pdf-session.cjs');
const {runEngine}=require('./engine.cjs');
const windows=new Map();
const page=pathToFileURL(path.join(__dirname,'pdf/index.html')).href;
let initialized=false;
function register(){if(initialized)return;initialized=true;ipcMain.handle('hanx:pdf',(event,action,args)=>{
 const context=windows.get(event.sender.id);
 if(!context||event.senderFrame!==context.win.webContents.mainFrame||event.senderFrame.url!==page)throw Error('Untrusted PDF editor request.');
 if(typeof action!=='string'||!args||typeof args!=='object'||Array.isArray(args))throw Error('Invalid request.');
 const {win,session}=context;
 const result=context.queue.then(async()=>{
  switch(action){
   case 'draft':context.draft=args.active===true;return true;
   case 'thumbnail':return session.thumbnail(args.page);
   case 'document':if(!context.openDocument)throw Error('문서 편집기를 찾지 못했습니다.');return context.openDocument(session.current);
   case 'page':return session.page(args.page);
   case 'edit':return session.edit(args);
   case 'undo':return session.undo();
   case 'redo':return session.undo(true);
   case 'ocr':return session.ocr(args);
   case 'copyText':if(typeof args.text!=='string'||args.text.length>2000000)throw Error('복사할 텍스트가 너무 큽니다.');require('electron').clipboard.writeText(args.text);return true;
   case 'setup':return runEngine(session.executable,['pdf','setup']);
   case 'chooseImage':case 'chooseFont':{const result=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:action==='chooseImage'?'이미지':'글꼴',extensions:action==='chooseImage'?['png','jpg','jpeg','tif','tiff']:['ttf']}]});return result.canceled?null:result.filePaths[0];}
   case 'save':{let destination=session.source;if(args.as===true||!session.savedCopy){const result=await dialog.showSaveDialog(win,{defaultPath:path.join(path.dirname(destination),path.parse(destination).name+'-편집.pdf'),filters:[{name:'PDF',extensions:['pdf']}]});if(result.canceled)return null;destination=result.filePath;if(!path.extname(destination))destination+='.pdf';}return session.save(destination);}
   default:throw Error('지원하지 않는 PDF 작업입니다.');
  }
 });context.queue=result.catch(()=>{});return result;
});}
async function openPDF(executable,source,openDocument){register();const session=await new PDFSession(executable,source).init();
 const win=new BrowserWindow({width:1250,height:850,minWidth:900,minHeight:640,title:'HanX PDF',backgroundColor:'#eef1f6',webPreferences:{preload:path.join(__dirname,'pdf-preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true}});
 const context={win,session,openDocument,queue:Promise.resolve(),closing:false};const id=win.webContents.id;windows.set(id,context);
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());
 win.webContents.on('before-input-event',(event,input)=>{if(input.type!=='keyDown'||!(input.control||input.meta))return;const key=input.key.toLowerCase();const action=key==='s'?(input.shift?'saveAs':'save'):key==='z'?(input.shift?'redo':'undo'):null;if(action){event.preventDefault();win.webContents.send('hanx:pdf-action',action);}});
 win.on('close',event=>{if(context.closing)return;event.preventDefault();context.queue=context.queue.then(async()=>{if(session.dirty||context.draft){const {response}=await dialog.showMessageBox(win,{type:'question',message:'저장하지 않은 PDF 변경 사항을 버릴까요?',buttons:['계속 편집','변경 사항 버리기'],defaultId:0,cancelId:0});if(response!==1)return;}context.closing=true;win.close();});});
 win.on('closed',()=>{windows.delete(id);context.queue.finally(()=>session.close()).catch(()=>{});});
 await win.loadFile(path.join(__dirname,'pdf/index.html'));return win;
}
module.exports={openPDF};
