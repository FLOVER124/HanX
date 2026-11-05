// Optional real-document regression. The source is never modified or checked in.
const {app,dialog}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const fixture=process.env.HANX_PDF_TEST_FIXTURE,cli=process.env.HANX_PDF_TEST_CLI,output=process.env.HANX_PDF_TEST_OUTPUT;
if(!fixture||!cli||!output)throw Error('Set HANX_PDF_TEST_FIXTURE, HANX_PDF_TEST_CLI and HANX_PDF_TEST_OUTPUT.');
app.whenReady().then(async()=>{let win;try{
 const hash=async()=>crypto.createHash('sha256').update(await fs.readFile(fixture)).digest('hex');const original=await hash();let imported=false;
 win=await require(root+'/desktop/pdf-window.cjs').openPDF(cli,fixture,async file=>{assert.equal((await fs.readFile(file)).subarray(0,4).toString(),'%PDF');imported=true;return true;});
 const js=s=>win.webContents.executeJavaScript(s);
 const wait=async test=>{for(let n=0;n<450;n++){if(await js(test))return;await new Promise(r=>setTimeout(r,100));}throw Error('UI timed out: '+test+' '+await js('document.body.innerText.slice(-1200)'));};
 await wait('typeof state!=="undefined"&&!!state&&!busy');
 await wait('document.querySelector("#pages img")?.naturalWidth>0');
 assert.equal(await js('document.querySelectorAll("#pages button").length'),await js('state.pageCount'));
 await js('task(()=>refresh(Math.min(5,state.pageCount-1)))');await wait('!busy&&page===Math.min(5,state.pageCount-1)');
 await wait('[...document.querySelectorAll("#objectList canvas")].some(c=>c.getContext("2d").getImageData(0,0,48,42).data.some(v=>v>0))');
 assert.ok(await js('document.querySelectorAll(".text-icon").length>0'));
 // The center of a text object must hit text, even below a page-sized background.
 const target=await js(`(()=>{const o=state.objects.find(o=>o.type==='text'&&o.text?.trim()&&o.viewBounds[0]>.01&&o.viewBounds[2]<.99);select(o.id);const el=document.querySelector('.pdf-object[data-id="'+o.id+'"]');el.scrollIntoView({block:'center'});return {id:o.id,text:o.text}})()`);
 await js(`(()=>{const el=document.querySelector('.pdf-object[data-id="${target.id}"]');const r=el.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);if(!hit?.classList.contains('pdf-object'))throw Error('Text has no hit target');if(state.objects.find(o=>o.id===Number(hit.dataset.id)).type!=='text')throw Error('Text blocked by background');el.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));})()`);
 await wait('!!document.getElementById("inlineText")');
 const changed=target.text.trim()+' 수정';await js(`$('inlineText').value=${JSON.stringify(changed)};$('inlineText').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));`);
 await wait(`!busy&&state.objects.some(o=>o.text?.trim()===${JSON.stringify(changed)})`);
 await js(`select(${target.id});$('x').value=Number($('x').value)+8;$('applyGeometry').click()`);await wait('!busy&&state.canUndo');
 const oldCount=await js('state.objects.length');await js("$('delete').click()");await wait(`!busy&&state.objects.length===${oldCount-1}`);
 await js("$('undo').click()");await wait(`!busy&&state.objects.length===${oldCount}`);
 // Save a copy and verify it remains a valid, full-length PDF.
 dialog.showSaveDialog=async()=>({canceled:false,filePath:output});await js("$('saveAs').click()");await wait('!busy&&!state.dirty');
 assert.equal((await fs.readFile(output)).subarray(0,4).toString(),'%PDF');assert.equal(await hash(),original);
 await js("$('documentMode').click()");await wait("$('dialog').open");await js("$('confirm').click()");for(let i=0;i<300&&!imported;i++)await new Promise(r=>setTimeout(r,100));assert.ok(imported);await wait('!busy');
 await fs.writeFile(output+'.png',(await win.webContents.capturePage()).toPNG());
 console.log('PASS real PDF: page thumbnails, T icons, shape previews, text hit testing, inline Korean edit, move, delete, undo, save copy, document mode, original unchanged');win.destroy();app.exit(0);
 }catch(error){console.error(error);win?.destroy();app.exit(1);}});
