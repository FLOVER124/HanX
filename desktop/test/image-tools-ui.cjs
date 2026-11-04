// Run with desktop/node_modules/.bin/electron desktop/test/image-tools-ui.cjs.
// Uses the real renderer, canvas PNG encoder, IPC boundary, and editing engine.
const {app,BrowserWindow,ipcMain,nativeImage}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {Session}=require('../engine.cjs');
app.on('window-all-closed',()=>{});
(async()=>{
 await app.whenReady();const session=await new Session(process.env.HANX_CLI_PATH||path.resolve(__dirname,'../../build/hanx-cli')).init();let win;
 try{
  await session.create('presentation');
  const preload=path.join(session.directory,'preload.cjs');
  await fs.writeFile(preload,`const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('hanx',{initial:()=>ipcRenderer.invoke('image-test-read'),edit:ops=>ipcRenderer.invoke('image-test-edit',ops),reportError:message=>ipcRenderer.invoke('image-test-error',message),undo:redo=>ipcRenderer.invoke('image-test-undo',redo),onOpened:()=>{},onAction:()=>{}});`);
  const errors=[];ipcMain.handle('image-test-read',()=>session.read());ipcMain.handle('image-test-edit',(_e,ops)=>session.edit(ops));ipcMain.handle('image-test-undo',(_e,redo)=>session.undo(redo));ipcMain.handle('image-test-error',(_e,message)=>errors.push(message));
  win=new BrowserWindow({show:true,width:1200,height:850,webPreferences:{preload,contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  win.webContents.on('console-message',(_event,...args)=>{const message=typeof args[0]==='object'?args[0].message:args[1];if(String(message).includes('Error'))console.error(message);});
  const js=code=>win.webContents.executeJavaScript(code).catch(error=>{throw Error(code+'\n'+error.message);}),wait=async expr=>{for(let i=0;i<300;i++){if(await js(expr))return;await new Promise(r=>setTimeout(r,20));}throw Error('Timed out: '+expr+' '+errors.join('; ')+' '+await js("JSON.stringify({busy,dialog:document.querySelector('.image-dialog')?.outerHTML.slice(-1800)})"));};
  const click=async text=>{assert.equal(await js(`(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent===${JSON.stringify(text)}&&!b.disabled);if(!button)return false;button.click();return true;})()`),true,'Control '+text);};
  await win.loadFile(path.join(__dirname,'../index.html'));await wait('state&&!busy');
  const original=await js(`(()=>{const canvas=document.createElement('canvas');canvas.width=5;canvas.height=5;const c=canvas.getContext('2d');c.fillStyle='white';c.fillRect(0,0,5,5);c.fillStyle='red';c.fillRect(1,1,3,3);c.fillStyle='white';c.fillRect(2,2,1,1);return canvas.toDataURL('image/png').split(',')[1];})()`);
  await session.edit([{op:'add_shape',slide:0,value:{kind:'image',x:100,y:200,width:150,height:150,imageData:{name:'original.png',data:original},flipH:true}}]);
  await js('(async()=>{state=await hanx.initial();render();})()');assert.equal(await js("[...document.querySelectorAll('[role=tab]')].some(n=>n.textContent==='그림')"),false,'Image tab is contextual');
  await js("document.querySelector('.slide-shape.kind-image').click()");await click('그림');
  assert.equal(await js("document.querySelector('.slide-shape.kind-image').style.transform.includes('scaleX(-1)')"),true);
  assert.equal(await js("document.querySelectorAll('.mini-shape')[2].style.transform.includes('scaleX(-1)')"),true);
  await click('단색 배경 제거');await wait("Boolean(document.querySelector('.image-dialog[open]'))&&!busy");
  const alpha=()=>js("(()=>{const c=document.querySelectorAll('.image-comparison canvas')[1],p=c.getContext('2d').getImageData(0,0,5,5).data;return [p[3],p[(1*5+1)*4+3],p[(2*5+2)*4+3]];})()");
  assert.deepEqual(await alpha(),[0,255,255],'Real preview removes only edge-connected white');
  await js("(()=>{const input=document.querySelector('.image-dialog input[type=range]');input.value=100;input.dispatchEvent(new Event('input'));})()");await js('new Promise(requestAnimationFrame)');assert.deepEqual(await alpha(),[0,0,0],'Tolerance updates the preview');
  await js("(()=>{const input=document.querySelector('.image-dialog input[type=range]');input.value=0;input.dispatchEvent(new Event('input'));})()");await js('new Promise(requestAnimationFrame)');
  if(process.env.HANX_RENDERER_UI_OUTPUT){await fs.mkdir(process.env.HANX_RENDERER_UI_OUTPUT,{recursive:true});await fs.writeFile(path.join(process.env.HANX_RENDERER_UI_OUTPUT,'image-background-dialog.png'),(await win.webContents.capturePage()).toPNG());}
  await click('취소');await wait("!document.querySelector('.image-dialog')");assert.equal((await session.read()).model.images?Object.keys((await session.read()).model.images).length:0,1,'Cancel does not mutate media');
  await click('단색 배경 제거');await wait("Boolean(document.querySelector('.image-dialog[open]'))&&!busy");await click('적용');await wait("!document.querySelector('.image-dialog')&&!busy");
  const edited=await session.read(),shape=edited.model.slides[0].shapes.find(s=>s.kind==='image'),transparent=edited.model.images[shape.imageID].data;assert.notEqual(transparent,original);assert.equal(shape.flipH,true,'Image transformations survive replacement');
  const readPixels=encoded=>js(`(async()=>{const image=new Image();image.src='data:image/png;base64,'+${JSON.stringify(encoded)};await image.decode();const canvas=document.createElement('canvas');canvas.width=5;canvas.height=5;const c=canvas.getContext('2d');c.drawImage(image,0,0);const p=c.getImageData(0,0,5,5).data;return [p[3],p[(1*5+1)*4+3],p[(2*5+2)*4+3]];})()`);
  assert.deepEqual(await readPixels(transparent),[0,255,255]);
  await js('actions.undo()');assert.equal((await session.read()).model.images[(await session.read()).model.slides[0].shapes.find(s=>s.kind==='image').imageID].data,original,'Undo restores actual pixels');
  await js('actions.redo()');await click('원본 복원');await wait('!busy');const restored=await session.read();assert.equal(restored.model.images[restored.model.slides[0].shapes.find(s=>s.kind==='image').imageID].data,original,'Original button restores source bytes');
  await js('actions.undo()');
  const output=path.join(session.directory,'transparent.pptx');await session.save(output);await session.open(output);const reopened=await session.read(),savedImage=reopened.model.images[reopened.model.slides[0].shapes.find(s=>s.kind==='image').imageID];assert.deepEqual(await readPixels(savedImage.data),[0,255,255],'PPTX reopening preserves alpha and enclosed pixels');assert.equal(savedImage.data,transparent,'PPTX preserves PNG bytes');
  await js('(async()=>{state=await hanx.initial();shapeID=null;render();})()');assert.equal(await js("[...document.querySelectorAll('[role=tab]')].some(n=>n.textContent==='그림')"),false,'Deselect removes contextual tab');
  const importedPath=path.join(session.directory,'그림 가져오기.png');await fs.writeFile(importedPath,Buffer.from(original,'base64'));
  const beforeCount=reopened.model.slides[0].shapes.length;
  const imported=await require('../media-import.cjs').importSlideImage(session,0,importedPath,nativeImage);
  assert.equal(imported.model.slides[0].shapes.length,beforeCount+1);assert.equal(imported.model.slides[0].shapes.at(-1).lockAspect,true);
  const invalidPath=path.join(session.directory,'invalid.png');await fs.writeFile(invalidPath,'not an image');await assert.rejects(()=>require('../media-import.cjs').importSlideImage(session,0,invalidPath,nativeImage));
  assert.equal((await session.read()).model.slides[0].shapes.length,beforeCount+1,'Invalid import does not mutate the document');
  assert.deepEqual(errors,[]);console.log('HANX_IMAGE_TOOLS_UI_OK');
 }finally{win?.destroy();await session.close();app.quit();}
})().catch(error=>{console.error(error);app.exit(1);});
