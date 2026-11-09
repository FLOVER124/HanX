// Shared harness for UI checks of desktop/pdf without Electron or a compiled CLI.
// The page runs in Playwright's Chromium; its host bridge sends the requests the
// CLI would send to the real worker. Fixtures are generated in a temporary folder.
const {chromium}=require('playwright');const {spawnSync}=require('node:child_process');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const crypto=require('node:crypto');
const repo=path.resolve(__dirname,'../..'),py=process.env.HANX_PDF_PYTHON||'python3',worker=path.join(repo,'Tools/pdf/worker.py');
function call(request){const r=spawnSync(py,[worker],{input:JSON.stringify(request),encoding:'utf8'});const envelope=JSON.parse(r.stdout||'{}');if(!envelope.ok)throw Error(envelope.error?.message||r.stderr);return envelope.data;}
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function openEditor({make,files,choose={},viewport={width:1250,height:1000}}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hanx-pdf-ui-'));const paths=files.map(name=>path.join(dir,name));
 const made=spawnSync(py,['-c',make,...paths],{encoding:'utf8'});if(made.status)throw Error(made.stderr);
 const original=paths[0],before=hash(original),revisions=path.join(dir,'revisions');fs.mkdirSync(revisions);
 let current=original,history=[],future=[],serial=0;const requests=[];
 const host={page:a=>({...call({action:'inspect',input:current,page:a.page}),image:call({action:'render',input:current,page:a.page}).image,name:path.basename(original),dirty:current!==original,canUndo:!!history.length,canRedo:!!future.length}),
  thumbnail:a=>call({action:'render',input:current,page:a.page,scale:.2}),
  edit:a=>{requests.push(a.operations);const out=path.join(revisions,`rev-${++serial}.pdf`);call({action:'edit',input:current,output:out,revision:a.revision,operations:a.operations});history.push(current);future=[];current=out;return true;},
  undo:()=>{if(history.length){future.push(current);current=history.pop();}return true;},redo:()=>{if(future.length){history.push(current);current=future.pop();}return true;},
  extract:a=>{const operations=require('../../desktop/pdf/pages.js').extractOperations(a.pages,a.count);const out=path.join(dir,'extracted.pdf');if(operations.length)call({action:'edit',input:current,output:out,force:true,operations});else fs.copyFileSync(current,out);return out;},
  stageImage:a=>{const target=path.join(dir,`staged-${++serial}.png`);fs.writeFileSync(target,Buffer.from(a.data,'base64'));return target;},
  ocr:()=>({words:[]}),draft:()=>true,
  // Like Electron, an SVG choice is returned as data for the editor page to rasterize.
  ...Object.fromEntries(Object.entries(choose).map(([k,v])=>[k,()=>v.endsWith('.svg')?{convert:'data:image/svg+xml;base64,'+fs.readFileSync(path.join(dir,v)).toString('base64'),name:v}:path.join(dir,v)]))};
 const browser=await chromium.launch();const ui=await browser.newPage({viewport});const errors=[];ui.on('pageerror',e=>errors.push(e.message));
 await ui.exposeFunction('hostCall',(action,args)=>{try{if(!host[action])throw Error('unsupported '+action);return {ok:true,data:host[action](args)};}catch(e){return {ok:false,error:e.message};}});
 await ui.addInitScript(()=>{window.hanxPDF={request:async(a,b)=>{const r=await window.hostCall(a,b);if(!r.ok)throw Error(r.error);return r.data;}};});
 await ui.goto('file://'+path.join(repo,'desktop/pdf/index.html'));
 const ready=()=>ui.waitForFunction(()=>!document.body.classList.contains('busy')&&document.querySelector('#status').textContent==='준비됨');
 await ready();
 // Dialog actions start their edit after the dialog closes; wait for that request.
 const edited=async count=>{while(requests.length<count)await new Promise(r=>setTimeout(r,25));await ready();};
 return {ui,dir,call,ready,edited,errors,requests,current:()=>current,inspect:(page=0)=>call({action:'inspect',input:current,page}),
  unchanged:()=>hash(original)===before,
  async close(){if(process.env.HANX_PDF_TEST_SCREENSHOT)await ui.screenshot({path:process.env.HANX_PDF_TEST_SCREENSHOT});await browser.close();fs.rmSync(dir,{recursive:true,force:true});}};
}
module.exports={openEditor};
