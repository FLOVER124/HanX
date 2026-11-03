const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {dialog}=require('electron');
const {runEngine}=require('./engine.cjs');
module.exports=async function smoke(win,session){
 const js=async code=>{
  try { return await win.webContents.executeJavaScript(code); }
  catch(error){throw new Error('Renderer smoke step failed: '+code.slice(0,180), {cause:error});}
 };
 const shownNotices=[];dialog.showMessageBox=async(_parent,options)=>{shownNotices.push(options);return {response:0};};
 async function click(id){await js("(()=>{document.getElementById("+JSON.stringify(id)+").click();return new Promise(resolve=>setTimeout(()=>pending.then(resolve),0));})()");}
 async function waitFor(expression){for(let i=0;i<150;i++){if(await js(expression))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out: '+expression+'\n'+await js("document.getElementById('status').textContent"));}
 const screenshotDir=process.env.HANX_SMOKE_OUTPUT_DIR;if(screenshotDir)await fs.mkdir(screenshotDir,{recursive:true});
 async function settle(){await js('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');}
 async function screenshot(name){await settle();if(screenshotDir)await fs.writeFile(path.join(screenshotDir,name+'.png'),(await win.webContents.capturePage()).toPNG());}
 async function saveAs(filename){const target=path.join(session.directory,filename);dialog.showSaveDialog=async()=>({canceled:false,filePath:target});await click('saveAs');await waitFor('!busy');await fs.access(target);return target;}
 async function open(filename){dialog.showOpenDialog=async()=>({canceled:false,filePaths:[filename]});await click('open');await waitFor(`!busy && state.path===${JSON.stringify(filename)}`);}
 async function newFile(kind){await js(`document.getElementById('newKind').value=${JSON.stringify(kind)};document.getElementById('new').click()`);await waitFor(`!busy && state.kind===${JSON.stringify(kind)} && !state.path`);}
 async function drag(selector,dx,dy){const p=await js(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);await settle();win.focus();win.webContents.sendInputEvent({type:'mouseMove',...p});await new Promise(r=>setTimeout(r,50));win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...p});await new Promise(r=>setTimeout(r,50));win.webContents.sendInputEvent({type:'mouseMove',modifiers:['leftButtonDown'],x:p.x+dx,y:p.y+dy});await new Promise(r=>setTimeout(r,50));win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:p.x+dx,y:p.y+dy});}
 await waitFor('Boolean(state && !busy)');win.show();win.focus();await settle();assert.equal(await js('document.documentElement.lang'),'ko');
 await js("document.getElementById('connections').click()");await waitFor("document.getElementById('connectionDialog').open");assert.match(await js("document.getElementById('mcpCommand').value"),/mcp$/);await js("document.getElementById('connectionDialog').close()");
 await js("edit({op:'set_paragraph',section:0,block:0,runs:[{text:'데스크톱 문서',bold:true},{text:' 편집',italic:true}]})");await waitFor("!busy && document.querySelector('.rich-paragraph span')?.textContent==='데스크톱 문서'");
 await js("(()=>{const p=document.querySelector('.rich-paragraph');p.focus();p.querySelector('span').textContent='문서 편집 확인';p.blur();p.dispatchEvent(new FocusEvent('blur'));})()");await waitFor("!busy && state.text.includes('문서 편집 확인')");
 await js("edit({op:'append_paragraph',section:0,text:'분기 매출 보고서',style:{size:20,bold:true,color:'1659A7'}},{op:'append_paragraph',section:0,text:'2026년 3분기 문서 처리 현황'},{op:'append_block',section:0,block:{type:'table',rows:[['작업','진행 상황'],['문서 편집','완료'],['데이터 계산','확인 중']]}})");await waitFor('!busy && state.model.sections[0].blocks.length===4');
 const doc=await saveAs('gui.docx');await open(doc);assert.match(await js('state.text'),/문서 편집 확인/);await screenshot('document');
 const protectedModel=(await session.read()).model,protectedTable=protectedModel.sections[0].blocks[3].table._0,nested=structuredClone(protectedTable),imageID='protected-cell-image';
 protectedModel.images[imageID]={name:'cell.png',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lZ8AAAAASUVORK5CYII='};
 protectedTable.rows[0][0].blocks[0].paragraph._0.inlines.push({image:{id:imageID,width:20,height:20}});
 protectedTable.rows[1][0].blocks[0].paragraph._0.inlines.push({field:{_0:'page',_1:structuredClone(protectedTable.rows[1][0].blocks[0].paragraph._0.markProps)}});
 protectedTable.rows[2][0].blocks.push({table:{_0:nested}});
 const protectedFile=path.join(session.directory,'protected-table.json');await runEngine(session.executable,['create','--spec','-','--output',protectedFile],{kind:'document',model:protectedModel});await open(protectedFile);
 assert.equal(await js("document.querySelector('.paper .doc-table').rows[0].cells[0].getAttribute('aria-readonly')"),'true');
 await js("(()=>{const table=document.querySelector('.paper .doc-table');for(const row of table.rows)row.cells[0].dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));})()");
 assert.equal(await js("document.querySelectorAll('.paper .doc-table textarea').length"),0);assert.equal(await js("document.querySelectorAll('.paper .doc-table img').length"),1);
 await js("(()=>{const td=document.querySelector('.paper .doc-table').rows[0].cells[1];td.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));const input=td.querySelector('textarea');input.value='편집한 일반 셀';input.dispatchEvent(new Event('change'));})()");
 await waitFor("!busy && state.model.sections[0].blocks[3].table._0.rows[0][1].blocks[0].paragraph._0.inlines[0].text._0==='편집한 일반 셀'");
 assert.equal(await js("document.querySelectorAll('.paper .doc-table img').length"),1);
 await newFile('spreadsheet');
 await js("edit({op:'set_range',sheet:0,start:'A1',values:[[{input:'7'},{input:'=A1*6'}]]})");await waitFor("!busy && document.querySelector('[aria-label=\"B1\"]')?.value==='42'");
 await js("document.querySelector('[aria-label=\"A1\"]').focus();document.getElementById('formula').value='8';document.getElementById('formula').dispatchEvent(new Event('change'))");await waitFor("!busy && state.calculated[0].B1.display==='48'");
 await js("edit({op:'set_range',sheet:0,start:'A3',values:[['항목','수량','단가','금액'],['노트',12,2500,{input:'=B4*C4'}],['펜',8,1200,{input:'=B5*C5'}],['합계','','',{input:'=SUM(D4:D5)'}]]},{op:'style_range',sheet:0,range:'A3:D3',style:{bold:true,fill:'1659A7',color:'FFFFFF'}},{op:'style_range',sheet:0,range:'A6:D6',style:{bold:true,fill:'D9EFF0'}})");await waitFor("!busy && state.calculated[0].D6.display==='39600'");
 const sheet=await saveAs('gui.xlsx');await open(sheet);await screenshot('spreadsheet');
 await newFile('presentation');
 await js("edit({op:'add_shape',slide:0,value:{kind:'rect',x:400,y:300,width:160,height:80,rotation:30,fill:'008B94'}},{op:'set_transition',slide:0,kind:'fade',duration:0.4})");await waitFor('!busy && state.model.slides[0].shapes.length===3');
 await js("document.querySelector('.slide-shape:last-child').click()");assert.ok(await js("Boolean(document.querySelector('.resize-handle'))"));
 await drag('.resize-handle.se',20,15);await waitFor('!busy && state.model.slides[0].shapes[2].frame.w>160');
 await js('duplicateSlide()');await waitFor('!busy && state.model.slides.length===2');
 const slides=await saveAs('gui.pptx');await open(slides);assert.equal(await js('state.model.slides[0].transition.kind'),'fade');await screenshot('presentation');
 const pdf=await saveAs('gui.pdf');assert.equal((await fs.readFile(pdf)).subarray(0,4).toString(),'%PDF');
 await open(pdf);assert.ok(shownNotices.some(n=>n.type==='warning'&&n.detail.includes('PDF')));const warningCount=shownNotices.length;
 await js("edit({op:'append_paragraph',section:0,text:'알림 반복 확인'})");await waitFor('!busy');assert.equal(shownNotices.length,warningCount);
 assert.equal(await js("Boolean(document.getElementById('error')||document.getElementById('notices')||document.querySelector('.local-note'))"),false);
 await js("run(()=>hanx.edit([{op:'not-supported'}]))");await waitFor('!busy');assert.equal(shownNotices.length,warningCount+1);assert.equal(shownNotices.at(-1).type,'error');
 await js("run(()=>{throw Error('로컬 화면 오류 확인')})");await waitFor('!busy');assert.equal(shownNotices.length,warningCount+2);assert.ok(shownNotices.at(-1).detail.includes('로컬 화면 오류 확인'));
 await click('help');assert.equal(shownNotices.at(-1).type,'info');
 // Apply an adjustment, then remove its background and verify the embedded PNG after reopen.
 await newFile('presentation');
 const sample=await js(`(()=>{const c=document.createElement('canvas');c.width=c.height=5;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,5,5);ctx.fillStyle='red';ctx.fillRect(1,1,3,3);return c.toDataURL().split(',')[1];})()`);
 await js(`edit({op:'add_shape',slide:0,value:{kind:'image',x:0,y:0,width:50,height:50,imageData:{name:'fixture.png',data:${JSON.stringify(sample)}}}})`);
 const shape="state.model.slides[0].shapes.find(s=>s.kind==='image')";
 await js(`adjustSlideImage(${shape})`);await waitFor("Boolean(document.querySelector('#imageAdjustmentTitle'))");
 await js(`(()=>{const slider=document.querySelector('input[aria-label="투명도 (%)"]');slider.value=50;slider.dispatchEvent(new Event('input'));const filter=document.querySelector('select[aria-label="필터"]');filter.value='grayscale';filter.dispatchEvent(new Event('change'));})()`);await settle();
 async function applyDialog(){await js("[...document.querySelectorAll('dialog[open] button')].find(b=>b.textContent==='적용').click()");await waitFor("!busy && !document.querySelector('dialog[open]')");}
 await applyDialog();
 await js(`removeImageBackground(${shape})`);await settle();await applyDialog();
 const imageFile=await saveAs('adjusted.pptx');await open(imageFile);
 const alpha=await js(`(async()=>{const img=new Image();img.src=M.imageSource(state.model.images[${shape}.imageID]);await img.decode();const c=document.createElement('canvas');c.width=c.height=5;const x=c.getContext('2d');x.drawImage(img,0,0);const data=x.getImageData(0,0,5,5).data;return [data[3],...data.slice(48,52)];})()`);
 assert.equal(alpha[0],0);assert.equal(alpha[4],128);assert.equal(alpha[1],alpha[2]);assert.equal(alpha[2],alpha[3]);
 // Start from an unselected image. Send actual UI pointer events so selection and crop
 // must coexist without replacing the double-click target between presses.
 const imageCenter=await js("(()=>{const r=document.querySelector('.slide-stage .kind-image').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()");
 win.focus();await settle();
 for(const clickCount of [1,2]){
  for(const type of ['mouseDown','mouseUp'])win.webContents.sendInputEvent({type,button:'left',clickCount,...imageCenter});
 }
 await settle();await waitFor("Boolean(document.querySelector('#crop-title'))");
 const cropPoints=await js("(()=>{const r=document.querySelector('dialog[open] canvas').getBoundingClientRect();return [.2,.8].map(f=>({x:Math.round(r.left+r.width*f),y:Math.round(r.top+r.height*f)}));})()");
 win.webContents.sendInputEvent({type:'mouseDown',button:'left',...cropPoints[0]});
 win.webContents.sendInputEvent({type:'mouseMove',modifiers:['leftButtonDown'],...cropPoints[1]});
 win.webContents.sendInputEvent({type:'mouseUp',button:'left',...cropPoints[1]});
 await waitFor(`document.querySelector('[aria-label="너비 (px)"]')?.value==='3'`);
 await applyDialog();
 assert.equal(await js(shape+".frame.w"),30);
 await click('undo');assert.equal(await js(shape+".frame.w"),50);
 await click('redo');assert.equal(await js(shape+".frame.w"),30);
 const croppedFile=await saveAs('cropped.pptx');await open(croppedFile);
 const cropDims=await js(`(async()=>{const img=new Image();img.src=M.imageSource(state.model.images[${shape}.imageID]);await img.decode();return [img.naturalWidth,img.naturalHeight,${shape}.frame.x,${shape}.frame.y];})()`);
 assert.deepEqual(cropDims,[3,3,10,10]);

 await js("editGradient(state.model.slides[selected])");
 await js(`(()=>{const angle=document.querySelector('dialog[open] input[aria-label="각도"]');const stop=document.querySelector('dialog[open] input[type="checkbox"]');stop.click();const mid=document.querySelector('dialog[open] input[aria-label="중간 색"]');mid.value='#cc3300';mid.dispatchEvent(new Event('input'));angle.value='135';angle.dispatchEvent(new Event('input'));})()`);
 await applyDialog();
 assert.equal(await js("state.model.slides[selected].backgroundAngle"),135);
 assert.match(await js("document.querySelector('.slide-stage').style.backgroundImage"),/225deg/);
 const gradientFile=await saveAs('gradient.pptx');await open(gradientFile);
 assert.equal(await js("state.model.slides[0].backgroundAngle"),135);
 assert.deepEqual(await js("state.model.slides[0].backgroundMiddle"),{r:204,g:51,b:0});
 await newTemplateSmoke('letter');
 assert.equal(await js("document.querySelectorAll('.page-decoration').length"),2);
 await js("edit({op:'insert_page_break',section:0,block:1},{op:'insert_divider',section:0,block:2})");
 assert.equal(await js("document.querySelectorAll('.document-page').length"),2);
 await saveAs('letter.docx');
 await newTemplateSmoke('labels');
 assert.equal(await js("document.querySelectorAll('.paper table td').length"),14);
 async function newTemplateSmoke(name){await js(`newTemplate(${JSON.stringify(name)})`);await waitFor("!busy && state.kind==='document'");}
 for(const kind of ['document','presentation','spreadsheet']){
  await newFile(kind);
  const target=path.join(session.directory,'새 파일 '+kind+'.hanx');let defaults;
  dialog.showSaveDialog=async(_window,options)=>{defaults=options;return {canceled:false,filePath:target};};
  await click('save');await waitFor('!busy');
  assert.equal(path.extname(defaults.defaultPath),'.hanx');assert.deepEqual(defaults.filters[0].extensions,['hanx']);
  await open(target);assert.equal(await js('state.kind'),kind);
 }
 await open(slides);
 const importedBytes=await fs.readFile(slides);
 const nativeTarget=path.join(session.directory,'가져온 발표.hanx');
 let suggested;
 dialog.showSaveDialog=async(_window,options)=>{suggested=options.defaultPath;return {canceled:false,filePath:nativeTarget};};
 await click('save');await waitFor('!busy');
 assert.equal(path.extname(suggested),'.hanx');assert.deepEqual(await fs.readFile(slides),importedBytes);
 await open(nativeTarget);assert.equal(await js('state.kind'),'presentation');
 const inference=await js(`(async()=>{const c=document.createElement('canvas');c.width=c.height=320;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,320,320);x.fillStyle='red';x.fillRect(90,60,140,200);const mask=await HanXSubjectSegmentation.start(x.getImageData(0,0,320,320).data).promise;return {length:mask.length,finite:mask.every(Number.isFinite)};})()`);
 assert.equal(inference.length,102400);assert.equal(inference.finite,true);
 console.log('HANX_GUI_SMOKE_OK: native renderer open/edit/calculation/resize/save/docx/xlsx/pptx/pdf');
};
