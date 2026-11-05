const {app}=require('electron');const fs=require('node:fs/promises');const assert=require('node:assert/strict');const path=require('node:path');
const fixture=process.env.HANX_PDF_TEST_FIXTURE,cli=process.env.HANX_PDF_TEST_CLI;
if(!fixture||!cli)throw Error('Set HANX_PDF_TEST_FIXTURE and HANX_PDF_TEST_CLI');
app.whenReady().then(async()=>{let win;try{
 win=await require(path.resolve(__dirname,'../../desktop/pdf-window.cjs')).openPDF(cli,fixture);
 const js=async s=>{try{return await win.webContents.executeJavaScript(s);}catch(error){throw Error(s+"\n"+error.message);}};const wait=async s=>{for(let i=0;i<300;i++){if(await js(s))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timeout '+s+' '+await js('document.body.innerText.slice(-500)'));};
 await wait('typeof state!=="undefined"&&state&&!busy');await js('select(1)');assert.equal(await js('document.querySelectorAll(".resize-handle").length'),8);
 const before=await js('state.objects[1].bounds');
 const handle=await js("(()=>{const r=document.querySelector('[data-handle=se]').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()");
 for(const event of [{type:'mouseDown',x:handle.x,y:handle.y,button:'left',clickCount:1},{type:'mouseMove',x:handle.x+30,y:handle.y+20,button:'left'},{type:'mouseUp',x:handle.x+30,y:handle.y+20,button:'left',clickCount:1}])win.webContents.sendInputEvent(event);
 await wait(`!busy&&state.objects[1].bounds[2]-state.objects[1].bounds[0]>${before[2]-before[0]+25}`);
 const resized=await js('state.objects[1].bounds');assert.ok(Math.abs(resized[0]-before[0])<1);assert.ok(Math.abs(resized[3]-before[3])<1);assert.ok(resized[3]-resized[1]>before[3]-before[1]+15);
 await js("$('undo').click()");await wait(`!busy&&Math.abs(state.objects[1].bounds[2]-${before[2]})<1`);
 // Escape cancels a gesture before it creates a new PDF revision.
 await js('select(1)');const unchanged=await js('state.revision');const cancelHandle=await js("(()=>{const r=document.querySelector('[data-handle=se]').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()");
 win.webContents.sendInputEvent({type:'mouseDown',...cancelHandle,button:'left',clickCount:1});win.webContents.sendInputEvent({type:'mouseMove',x:cancelHandle.x+20,y:cancelHandle.y+20,button:'left'});await wait('!!resizeGesture');await js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");win.webContents.sendInputEvent({type:'mouseUp',...cancelHandle,button:'left',clickCount:1});assert.equal(await js('state.revision'),unchanged);assert.equal(await js('resizeGesture'),null);
 await js("document.querySelector('.pdf-object[data-id=\"1\"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:300,clientY:300}))");assert.equal(await js("$('contextMenu').hidden"),false);
 await js("document.querySelector('#contextMenu [data-action=delete]').click()");await wait('!busy&&state.objects.length===2');await js("$('undo').click()");await wait('!busy&&state.objects.length===3');
 await js("$('zoom').value='width';$('zoom').dispatchEvent(new Event('change'))");assert.ok(await js("$('paper').offsetWidth<=$('workspace').clientWidth-30"));
 if(process.env.HANX_PDF_TEST_SCREENSHOT){await js('select(1);revealSelection()');await new Promise(r=>setTimeout(r,200));await fs.writeFile(process.env.HANX_PDF_TEST_SCREENSHOT,(await win.webContents.capturePage()).toPNG());}
 if(await js('state.pageCount>1')){await js("$('pageNumber').value=state.pageCount;$('pageNumber').dispatchEvent(new Event('change'))");await wait('!busy&&page===state.pageCount-1');await js("document.dispatchEvent(new KeyboardEvent('keydown',{key:'PageUp',bubbles:true}))");await wait('!busy&&page===state.pageCount-2');}
 console.log('PASS PDF manipulation: mouse resize, fixed opposite corner, undo, right-click delete, page jump, PageUp and fit width');win.destroy();app.exit(0);
 }catch(error){console.error(error);win?.destroy();app.exit(1);}});
