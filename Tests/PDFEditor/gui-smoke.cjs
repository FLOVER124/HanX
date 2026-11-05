const {app,dialog}=require('electron');const fs=require('node:fs/promises');const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const fixture=process.env.HANX_PDF_TEST_FIXTURE, cli=process.env.HANX_PDF_TEST_CLI, output=process.env.HANX_PDF_TEST_OUTPUT;
if(!fixture||!cli||!output)throw Error('Set HANX_PDF_TEST_FIXTURE, HANX_PDF_TEST_CLI and HANX_PDF_TEST_OUTPUT.');
app.whenReady().then(async()=>{let win;try{
 win=await require(root+'/desktop/pdf-window.cjs').openPDF(cli,fixture);
 win.webContents.on('console-message',event=>{if(event.level==='error')console.error(event.message);});
 const js=script=>win.webContents.executeJavaScript(script);
 const wait=async test=>{for(let i=0;i<200;i++){if(await js(test))return;await new Promise(r=>setTimeout(r,100));}throw Error('UI timed out: '+test+' '+await js('document.body.innerText'));};
 await wait('typeof state !== "undefined" && !!state && !busy');
 if(process.env.HANX_PDF_TEST_OCR==='1'){
  const before=await js('state.image');await js("$('ocr').click()");await wait("$('dialog').open");await js("$('confirm').click()");
  await wait("$('dialog').open && $('confirm').textContent==='검색 텍스트 추가'");
  assert.match(await js("document.querySelector('#dialogBody textarea').value"),/검토/);await js("$('confirm').click()");
  await wait('!busy && state.objects.some(o=>o.searchText)');assert.equal(await js('state.image'),before);
  dialog.showSaveDialog=async()=>({canceled:false,filePath:output});await js("$('saveAs').click()");await wait('!busy && !state.dirty');
  console.log('PASS OCR GUI: Korean recognition, invisible text layer, unchanged image and PDF copy');win.close();app.quit();return;
 }
 assert.equal(await js('state.objects.length'),3);
 await js("select(0);$('editText').click()");await wait("$('dialog').open");
 await js("document.querySelector('#dialogBody textarea').value='Updated in GUI';$('confirm').click()");await wait('!busy && state.objects[0].text === "Updated in GUI"');
 await js("select(1);$('x').value='95';$('y').value='150';$('applyGeometry').click()");await wait('!busy && Math.abs(state.objects[1].bounds[0]-95)<1');
 const rect=await js("(()=>{const r=document.querySelector('.pdf-object[data-id=\"1\"]').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()");
 win.webContents.sendInputEvent({type:'mouseDown',x:rect.x,y:rect.y,button:'left',clickCount:1});
 win.webContents.sendInputEvent({type:'mouseMove',x:rect.x+20,y:rect.y+10,button:'left'});
 win.webContents.sendInputEvent({type:'mouseUp',x:rect.x+20,y:rect.y+10,button:'left',clickCount:1});
 await wait('!busy && Math.abs(state.objects[1].bounds[0]-115)<1');
 await js("select(2);$('delete').click()");await wait('!busy && state.objects.length===2');
 await js("$('undo').click()");await wait('!busy && state.objects.length===3');
 await js("$('redo').click()");await wait('!busy && state.objects.length===2');
 dialog.showSaveDialog=async()=>({canceled:false,filePath:output});
 await js("$('saveAs').click()");await wait('!busy && state.dirty===false');
 await js('select(1)');await new Promise(r=>setTimeout(r,100));await fs.writeFile(output+'.png',(await win.webContents.capturePage()).toPNG());
 assert.equal((await fs.readFile(output)).subarray(0,4).toString(),'%PDF');
 console.log('PASS shared PDF UI: open, select, text edit, geometry, delete, undo/redo, save');
 win.close();app.quit();
 }catch(e){console.error(e);app.exit(1);}});
