'use strict';
const $=id=>document.getElementById(id);
const pending=new Map();let serial=0;
$('cancel').onclick=()=>$('dialog').close('cancel');
window.hanxPDFReply=(id,result)=>{const p=pending.get(id);if(!p)return;pending.delete(id);result.ok?p.resolve(result.data):p.reject(Error(result.error));};
function request(action,args={}){
 if(window.hanxPDF)return window.hanxPDF.request(action,args);
 return new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});window.webkit.messageHandlers.hanxPDF.postMessage({id,action,args});});
}
let state,page=0,selection=null,busy=false,zoom=1,drag=null;
let selectionIDs=new Set();
let resizeGesture=null,inlineEdit=null,textCommit=null;
let findMatches=[],findIndex=-1;
let thumbnailObserver,objectObserver;const thumbnails=new Map();let thumbnailRevision;
let rawObjects=[],outlineRegions=[];
const types={outline:'윤곽선 글자',text:'텍스트',path:'도형',image:'이미지',form:'그룹',shading:'음영',unknown:'개체'};
function node(tag,attrs={}){const el=document.createElement(tag);for(const [k,v] of Object.entries(attrs)){if(k==='text')el.textContent=v;else if(k==='class')el.className=v;else el.setAttribute(k,v);}return el;}
async function modal(title,contents,{confirm='확인',cancel='취소',input}={}){
 $('dialogTitle').textContent=title;$('dialogBody').replaceChildren(typeof contents==='string'?document.createTextNode(contents):contents);$('confirm').textContent=confirm;$('cancel').textContent=cancel;$('cancel').hidden=!cancel;
 const dialog=$('dialog');dialog.returnValue='';dialog.showModal();if(input)setTimeout(()=>input.focus(),0);
 return new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='confirm'),{once:true}));
}
async function task(fn){if(inlineEdit&&!await inlineEdit.commit())return false;if(textCommit&&!await textCommit)return false;if(busy)return false;busy=true;document.body.classList.add('busy');$('status').textContent='작업 중…';controls();try{await fn();return true;}catch(e){await modal('작업을 완료하지 못했습니다',e.message,{cancel:''});return false;}finally{busy=false;document.body.classList.remove('busy');$('status').textContent='준비됨';controls();}}
async function refresh(index=page,keep=null){resizeGesture?.cancel();hideContext();const next=await request('page',{page:index});if(thumbnailRevision&&thumbnailRevision!==next.revision){thumbnails.clear();if(thumbnailObserver)for(const button of $('pages').children)thumbnailObserver.observe(button);}thumbnailRevision=next.revision;rawObjects=next.objects;outlineRegions=[];
 if(rawObjects.filter(o=>o.type==='path').length>50&&rawObjects.filter(o=>o.type==='text'&&o.text?.trim()).length<10){try{const recognized=await request('ocr',{page:next.page,language:'kor+eng'});outlineRegions=recognized.words||[];}catch(error){next.outlineError=error.message;}}
 next.objects=$('showDetails').checked?rawObjects:PDFOutlines.groupOutlines(rawObjects,outlineRegions);
 const changingPage=next.page!==page;state=next;page=next.page;if(changingPage){$('workspace').scrollTop=0;$('workspace').scrollLeft=0;}selection=keep&&next.objects.some(o=>o.id===keep.id&&o.type===keep.type)?keep.id:null;selectionIDs=new Set(selection===null?[]:[selection]);render();}
function selected(){const list=state?.objects.filter(o=>selectionIDs.has(o.id))||[];if(list.length>1){const union=k=>[Math.min(...list.map(o=>o[k][0])),Math.min(...list.map(o=>o[k][1])),Math.max(...list.map(o=>o[k][2])),Math.max(...list.map(o=>o[k][3]))];return {id:selection,type:'selection',members:list.flatMap(o=>o.members||[o]),bounds:union('bounds'),viewBounds:union('viewBounds')};}return state?.objects.find(o=>o.id===selection);}
function controls(){$('findNext').disabled=$('findPrevious').disabled=busy||!findMatches.length;$('previousPage').disabled=busy||!state||page===0;$('nextPage').disabled=busy||!state||page>=state.pageCount-1;$('pageNumber').disabled=busy||!state;const o=selected();for(const element of document.querySelectorAll('#inspector button,#inspector input'))element.disabled=busy||!o;if(o)$('fill').disabled=busy||!['text','path','outline'].includes(o.type);for(const element of document.querySelectorAll('#pages button,#objectList button'))element.disabled=busy;for(const id of ['print','documentMode','save','saveAs','ocr','addText','addImage','addRect','zoom'])$(id).disabled=busy||!state;$('undo').disabled=busy||!state?.canUndo;$('redo').disabled=busy||!state?.canRedo;$('delete').disabled=busy||!o;$('editText').disabled=busy||o?.type!=='text';$('editParagraph').disabled=busy||!(o?.type==='text'||o?.type==='selection'&&o.members.some(m=>m.type==='text'));$('replaceImage').disabled=busy||o?.type!=='image';}
function render(){
 $('filename').textContent=state.name+(state.dirty?' *':'');document.title=$('filename').textContent+' | HanX';$('pageCount').textContent=`/ ${state.pageCount}`;$('pageNumber').value=page+1;$('pageNumber').max=state.pageCount;zoom=resolveZoom();
 $('preview').src=state.image;$('paper').style.width=state.width*zoom+'px';$('paper').style.height=state.height*zoom+'px';
 if($('pages').children.length!==state.pageCount){
  thumbnailObserver?.disconnect();$('pages').replaceChildren();
  thumbnailObserver=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){thumbnailObserver.unobserve(e.target);queueThumbnail(e.target);}}, {root:document.querySelector('aside.pages'),rootMargin:'150px'});
  for(let i=0;i<state.pageCount;i++){const b=node('button',{'aria-label':`${i+1}페이지`,'data-page':i});b.append(node('span',{class:'page-placeholder',text:String(i+1)}),node('span',{class:'page-number',text:String(i+1)}));b.onclick=()=>task(()=>refresh(i));wirePage(b,i);$('pages').append(b);thumbnailObserver.observe(b);}
 }
 thumbnails.set(page,state.image);
 for(const b of $('pages').children){b.classList.toggle('active',Number(b.dataset.page)===page);b.setAttribute('aria-current',String(Number(b.dataset.page)===page));if(Number(b.dataset.page)===page)setThumbnail(b,state.image);}
 objectObserver?.disconnect();
 const bitmap=new Image();bitmap.src=state.image;
 objectObserver=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){objectObserver.unobserve(entry.target);const object=state.objects.find(o=>o.id===Number(entry.target.dataset.object));if(object)bitmap.decode().then(()=>drawObjectPreview(entry.target,object,bitmap)).catch(()=>{});}}, {root:$('objectList'),rootMargin:'80px'});
 $('objects').replaceChildren();$('objectList').replaceChildren();
 for(const o of state.objects){
  const label=`${o.searchText?'검색 텍스트':types[o.type]} ${o.id+1}${o.text?'  '+o.text:''}`;
  const box=node('button',{class:'pdf-object'+(o.searchText?' search-text':''),'aria-label':label,'data-id':o.id});const [l,t,r,b]=o.viewBounds;
  Object.assign(box.style,{left:l*100+'%',top:t*100+'%',width:Math.max(0,r-l)*100+'%',height:Math.max(0,b-t)*100+'%'});
  box.onpointerdown=e=>startDrag(e,o,box);box.ondblclick=()=>{select(o.id);if(o.type==='text')inlineText(o);};box.oncontextmenu=e=>openContext(e,o.id);box.onfocus=()=>{if(!selectionIDs.has(o.id))select(o.id);};box.style.zIndex=String(10+Math.round(100*(1-Math.min(1,Math.max(0,r-l)*Math.max(0,b-t))))+(['text','outline'].includes(o.type)?200:0));$('objects').append(box);
  const row=node('button',{'data-id':o.id,'aria-label':label});const icon=['text','outline'].includes(o.type)?node('span',{class:'text-icon',text:'T'}):node('canvas',{class:'object-thumbnail','data-object':o.id,width:48,height:42});row.append(icon,node('span',{class:'object-label',text:label}));if(o.type!=='text')objectObserver.observe(icon);row.ondblclick=()=>{select(o.id);if(o.type==='text')editText();};row.oncontextmenu=e=>openContext(e,o.id);row.onclick=()=>{select(o.id);revealSelection();$('paper').focus({preventScroll:true});};$('objectList').append(row);
 }
 filterObjects();updateFind();select([...selectionIDs]);controls();
}
const thumbnailQueue=[];let thumbnailRunning=false;
function setThumbnail(button,src){let image=button.querySelector('img');if(!image){image=node('img',{alt:'',class:'page-thumbnail'});button.querySelector('.page-placeholder')?.replaceWith(image);}image.src=src;}
async function queueThumbnail(button){const index=Number(button.dataset.page);if(thumbnails.has(index)){setThumbnail(button,thumbnails.get(index));return;}thumbnailQueue.push({button,index});if(thumbnailRunning)return;thumbnailRunning=true;try{while(thumbnailQueue.length){if(busy){await new Promise(resolve=>setTimeout(resolve,100));continue;}const {button,index}=thumbnailQueue.shift();if(thumbnails.has(index)){if(button.isConnected)setThumbnail(button,thumbnails.get(index));continue;}const revision=thumbnailRevision;try{const result=await request('thumbnail',{page:index});if(revision!==thumbnailRevision){if(button.isConnected)thumbnailObserver.observe(button);continue;}if(thumbnails.size>=48)thumbnails.delete(thumbnails.keys().next().value);thumbnails.set(index,result.image);if(button.isConnected)setThumbnail(button,result.image);}catch{if(button.isConnected)thumbnailObserver.observe(button);break;}}}finally{thumbnailRunning=false;}}
function drawObjectPreview(canvas,object,bitmap){if(!canvas.isConnected)return;const [l,t,r,b]=object.viewBounds;const x=Math.max(0,l)*bitmap.naturalWidth,y=Math.max(0,t)*bitmap.naturalHeight,w=(Math.min(1,r)-Math.max(0,l))*bitmap.naturalWidth,h=(Math.min(1,b)-Math.max(0,t))*bitmap.naturalHeight;if(w<=0||h<=0)return;const scale=Math.min(44/w,38/h);const ctx=canvas.getContext('2d');ctx.clearRect(0,0,48,42);ctx.drawImage(bitmap,x,y,w,h,(48-w*scale)/2,(42-h*scale)/2,w*scale,h*scale);}
function select(id,add=false){if(Array.isArray(id)){selectionIDs=new Set(id);selection=id[0]??null;}else{if(add){selectionIDs.has(id)?selectionIDs.delete(id):selectionIDs.add(id);selection=selectionIDs.values().next().value??null;}else{selection=id;selectionIDs=new Set(id===null?[]:[id]);}}const o=selected();for(const container of ['objects','objectList'])for(const item of $(container).children)item.classList.toggle('selected',selectionIDs.has(Number(item.dataset.id)));$('inspector').hidden=!o;if(o){const [l,b,r,t]=o.bounds;for(const [id,v] of Object.entries({x:l,y:b,width:r-l,height:t-b}))$(id).value=Number(v.toFixed(2));$('fill').value=o.fill||'#202632';$('fill').disabled=!['text','path','outline'].includes(o.type);}updateSelectionFrame();controls();}
function viewDelta(dx,dy){return PDFGeometry.viewDelta(dx,dy,state.rotation);}
function revealSelection(){if(selection!==null)document.querySelector('#objects [data-id="'+selection+'"]')?.scrollIntoView({block:'nearest',inline:'nearest'});}
function viewRect(o){return o.viewBounds.map((v,i)=>v*(i%2?state.height:state.width));}
function paintFrame(rect){const [l,t,r,b]=rect;Object.assign($('selectionFrame').style,{left:l*zoom+'px',top:t*zoom+'px',width:(r-l)*zoom+'px',height:(b-t)*zoom+'px'});}
function updateSelectionFrame(){const o=selected(),frame=$('selectionFrame');frame.replaceChildren();frame.hidden=!o;if(!o)return;const rect=viewRect(o);paintFrame(rect);if(rect[2]<=rect[0]||rect[3]<=rect[1])return;for(const direction of ['nw','n','ne','e','se','s','sw','w']){const handle=node('button',{class:'resize-handle','data-handle':direction,'aria-label':({nw:'왼쪽 위',n:'위',ne:'오른쪽 위',e:'오른쪽',se:'오른쪽 아래',s:'아래',sw:'왼쪽 아래',w:'왼쪽'})[direction]+' 크기 조절',title:'드래그하여 크기 조절 · Shift 비율 유지',tabindex:'-1'});handle.onpointerdown=event=>startResize(event,o,direction,handle);frame.append(handle);}}
function startResize(event,object,direction,handle){
 if(busy||resizeGesture||drag||event.isPrimary===false||event.button!==0)return;event.preventDefault();event.stopPropagation();hideContext();
 const x=event.clientX,y=event.clientY,source={rect:viewRect(object),rotation:state.rotation};let last=null;
 handle.setPointerCapture(event.pointerId);resizeGesture={cancel:()=>{resizeGesture=null;paintFrame(source.rect);}};
 handle.onpointermove=e=>{if(!resizeGesture)return;last=PDFGeometry.resize(source,direction,(e.clientX-x)/zoom,(e.clientY-y)/zoom,e.shiftKey);paintFrame(last.rect);};
 handle.onpointercancel=()=>resizeGesture?.cancel();
 handle.onpointerup=e=>{if(!resizeGesture)return;resizeGesture=null;const distance=Math.hypot(e.clientX-x,e.clientY-y);if(distance<3){paintFrame(source.rect);return;}last=PDFGeometry.resize(source,direction,(e.clientX-x)/zoom,(e.clientY-y)/zoom,e.shiftKey);const {rect,...transform}=last;apply({op:'transform',object:object.id,...transform});};
}
function hideContext(){$('contextMenu').hidden=true;}
function openContext(event,id){event.preventDefault();if(busy)return;select(id);const o=selected();if(!o)return;const menu=$('contextMenu');menu.replaceChildren();const actions=[];if(o.type==='text')actions.push(['editText','텍스트 수정'],['editParagraph','문단 편집']);else if(o.type==='selection'&&o.members.some(m=>m.type==='text'))actions.push(['editParagraph','문단 편집']);if(o.type==='image')actions.push(['replaceImage','이미지 교체']);actions.push(['rotateLeft','왼쪽으로 90° 회전'],['rotateRight','오른쪽으로 90° 회전'],['delete','삭제']);for(const [action,label] of actions){const button=node('button',{type:'button',role:'menuitem','data-action':action,text:label});button.onclick=()=>{hideContext();$(action).click();};menu.append(button);}menu.hidden=false;const bounds=menu.getBoundingClientRect();menu.style.left=Math.max(4,Math.min(event.clientX,innerWidth-bounds.width-4))+'px';menu.style.top=Math.max(4,Math.min(event.clientY,innerHeight-bounds.height-4))+'px';menu.firstElementChild?.focus();}
document.addEventListener('pointerdown',event=>{if(!$('contextMenu').contains(event.target))hideContext();});
document.addEventListener('keydown',event=>{if($('contextMenu').hidden)return;if(event.key==='Escape'){hideContext();$('paper').focus();event.preventDefault();event.stopImmediatePropagation();}else if(['ArrowDown','ArrowUp'].includes(event.key)){const buttons=[...$('contextMenu').children],index=buttons.indexOf(document.activeElement);buttons[(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();event.preventDefault();event.stopImmediatePropagation();}});
function resolveZoom(){const mode=$('zoom').value;if(!['page','width'].includes(mode)||!state)return Number(mode)||1;const workspace=$('workspace'),style=getComputedStyle(workspace),width=workspace.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-2,height=workspace.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom)-2;return Math.max(.1,Math.min(4,mode==='width'?width/state.width:Math.min(width/state.width,height/state.height)));}
function hasDraft(){return !!(inlineEdit||textCommit);}
async function pageEdit(operations,next){await request('edit',{revision:state.revision,operations});thumbnails.clear();await refreshNear(next);$('pages').children[page]?.scrollIntoView({block:'nearest'});}
// Undo/redo or a page edit can change the page count; fall back to the nearest page.
async function refreshNear(index){try{await refresh(index);}catch(error){if(index===0)throw error;await refresh(0);if(index<state.pageCount)throw error;if(state.pageCount>1)await refresh(state.pageCount-1);}}
function runPageCommand(command){if(!state)return;task(async()=>{if(command.import!==undefined){const source=await request('choosePDF');if(!source)return;await pageEdit([{op:'import_pages',source,at:command.import}],command.import);return;}await pageEdit(command.operations,command.page);});}
function openPageContext(event,index){event.preventDefault();if(busy||!state)return;hideContext();const menu=$('contextMenu');menu.setAttribute('aria-label',`${index+1}페이지 메뉴`);menu.replaceChildren();for(const command of PDFPages.commands(index,state.pageCount)){const button=node('button',{type:'button',role:'menuitem','data-action':command.id,text:command.label});if(command.danger)button.className='danger';button.onclick=()=>{hideContext();runPageCommand(command);};menu.append(button);}menu.hidden=false;const bounds=menu.getBoundingClientRect();menu.style.left=Math.max(4,Math.min(event.clientX,innerWidth-bounds.width-4))+'px';menu.style.top=Math.max(4,Math.min(event.clientY,innerHeight-bounds.height-4))+'px';menu.firstElementChild?.focus();}
let pageDrag=null;
function clearDropMarks(){for(const b of $('pages').children)b.classList.remove('drop-before','drop-after');}
function wirePage(button,index){
 button.draggable=true;
 button.oncontextmenu=event=>openPageContext(event,index);
 button.addEventListener('keydown',event=>{if(event.key==='ContextMenu'||event.key==='F10'&&event.shiftKey){const r=button.getBoundingClientRect();openPageContext({preventDefault:()=>event.preventDefault(),clientX:r.right-8,clientY:r.top+8},index);event.stopPropagation();}});
 button.addEventListener('dragstart',event=>{if(busy||hasDraft()){event.preventDefault();return;}pageDrag=index;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',String(index+1));button.classList.add('dragging');});
 button.addEventListener('dragend',()=>{pageDrag=null;button.classList.remove('dragging');clearDropMarks();});
 button.addEventListener('dragover',event=>{if(pageDrag===null)return;event.preventDefault();event.dataTransfer.dropEffect='move';const r=button.getBoundingClientRect(),after=event.clientY>r.top+r.height/2;clearDropMarks();button.classList.add(after?'drop-after':'drop-before');});
 button.addEventListener('drop',event=>{if(pageDrag===null)return;event.preventDefault();const from=pageDrag,r=button.getBoundingClientRect(),after=event.clientY>r.top+r.height/2;pageDrag=null;clearDropMarks();const command=PDFPages.move(from,PDFPages.moveTarget(from,index,after,state.pageCount),page,state.pageCount);if(command)task(()=>pageEdit(command.operations,command.page));});
}
function goPage(index){hideContext();if(!state||!Number.isInteger(index)||index<0||index>=state.pageCount||busy){if(state)$('pageNumber').value=page+1;return;}task(async()=>{await refresh(index);$('pages').children[index]?.scrollIntoView({block:'nearest'});});}
$('previousPage').onclick=()=>goPage(page-1);$('nextPage').onclick=()=>goPage(page+1);
$('pageNumber').onchange=()=>goPage(Number($('pageNumber').value)-1);$('pageNumber').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();goPage(Number($('pageNumber').value)-1);}};
$('workspace').addEventListener('scroll',hideContext);window.addEventListener('blur',()=>{hideContext();resizeGesture?.cancel();drag?.cancel();});
new ResizeObserver(()=>{hideContext();if(state&&!drag&&!resizeGesture&&['page','width'].includes($('zoom').value)&&Math.abs(resolveZoom()-zoom)>.002)render();}).observe($('workspace'));
function startDrag(e,o,box){if(o.type==='path'&&(o.viewBounds[2]-o.viewBounds[0])*(o.viewBounds[3]-o.viewBounds[1])>.85&&!selectionIDs.has(o.id)){beginMarquee(e,true);return;}if(busy||resizeGesture||drag||e.isPrimary===false||e.button!==0)return;if(e.shiftKey||e.metaKey||e.ctrlKey){select(o.id,true);return;}if(!selectionIDs.has(o.id))select(o.id);box.focus({preventScroll:true});box.setPointerCapture(e.pointerId);const original=viewRect(o);drag={x:e.clientX,y:e.clientY,cancel:()=>{drag=null;box.style.transform='';paintFrame(original);}};
 box.onpointermove=event=>{if(drag){const dx=event.clientX-drag.x,dy=event.clientY-drag.y;box.style.transform=`translate(${dx}px,${dy}px)`;paintFrame(original.map((v,i)=>v+(i%2?dy:dx)/zoom));}};
 box.onpointercancel=()=>drag?.cancel();
 box.onpointerup=event=>{if(!drag)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;drag=null;box.style.transform='';if(Math.hypot(dx,dy)<3)return;const [x,y]=viewDelta(dx/zoom,dy/zoom);apply({op:'transform',object:o.id,dx:x,dy:y});};
}
async function apply(op){return task(async()=>{thumbnails.clear();const added={add_text:'text',add_rect:'path',add_image:'image'}[op.op];const keep=added?{id:rawObjects.length,type:added}:op.op==='delete'?null:state.objects.find(o=>o.id===op.object);const target=selectionIDs.has(op.object)&&selectionIDs.size>1?selected():state.objects.find(o=>o.id===op.object);const ops=target?.members?PDFOutlines.operations(target,op):[op];await request('edit',{operations:ops.map(item=>({...item,page})),revision:state.revision});await refresh(page,keep);});}
function inlineText(object,draft){
 if(busy||document.getElementById('inlineText'))return;
 const input=node('input',{id:'inlineText',type:'text','aria-label':'텍스트 직접 편집'});input.value=draft??object.text??'';
 const [l,t,r,b]=object.viewBounds;Object.assign(input.style,{left:Math.max(0,l)*100+'%',top:Math.max(0,t)*100+'%',width:Math.max(100,(r-l)*state.width*zoom+24)+'px',height:Math.max(30,(b-t)*state.height*zoom+12)+'px',fontSize:Math.max(12,(object.size||14)*zoom)+'px',color:object.fill||'#202632'});
 let finished=false;const finish=commit=>{
  if(finished)return textCommit||Promise.resolve(true);finished=true;const text=input.value;inlineEdit=null;input.remove();
  if(!commit||text===object.text){request('draft',{active:false}).catch(()=>{});return Promise.resolve(true);}
  const operation=apply({op:'set_text',object:object.id,text});
  textCommit=operation.then(ok=>{textCommit=null;if(!ok)inlineText(object,text);else request('draft',{active:false}).catch(()=>{});return ok;});return textCommit;
 };
 inlineEdit={commit:()=>finish(true),cancel:()=>finish(false)};input.oninput=()=>request('draft',{active:input.value!==object.text}).catch(()=>{});
 input.onkeydown=event=>{event.stopPropagation();const key=event.key.toLowerCase();if((event.metaKey||event.ctrlKey)&&['s','p'].includes(key)){event.preventDefault();window.hanxPDFAction(key==='p'?'print':event.shiftKey?'saveAs':'save');return;}if(event.key==='Enter'&&!event.isComposing){event.preventDefault();finish(true);}if(event.key==='Escape'){event.preventDefault();finish(false);}};input.onblur=()=>finish(true);
 $('paper').append(input);input.focus();input.select();
}
async function editText(add=false){if(busy)return;const o=selected();if(!add&&o?.type!=='text')return;const area=node('div'),input=node('textarea',{'aria-label':'텍스트',rows:4});input.value=add?'':o.text;area.append(input);const label=node('label',{text:'글자 크기 '});const size=node('input',{type:'number',min:1,max:1000,value:add?18:o.size||18,'aria-label':'글자 크기'});label.append(size);area.append(label);let font;const fontButton=node('button',{type:'button',text:'원본 글꼴: '+(o?.font?.family||'유사 글꼴')+' · 변경…'});fontButton.onclick=async()=>{try{const file=await request('chooseFont');if(file){font=file;fontButton.textContent=file.split(/[\\/]/).pop();}}catch(e){fontButton.textContent='글꼴 선택 실패';}};area.append(fontButton);
 if(await modal(add?'텍스트 추가':o.searchText?'검색 텍스트 수정':'텍스트 수정',area,{confirm:'적용',input})){const op={op:add?'add_text':'set_text',text:input.value};if(add||Number(size.value)!==o.size)op.size=Number(size.value);if(font)op.font=font;if(add){op.x=40;op.y=40;}else if(op.text.includes('\n')){op.op='set_paragraph';op.objects=[o.id];}else op.object=o.id;await apply(op);}}
async function editParagraph(){
 if(busy)return;const o=selected();if(!o)return;
 const ids=o.type==='selection'?o.members.filter(m=>m.type==='text').map(m=>m.id):o.type==='text'?PDFParagraph.collect(state.objects,o.id):[];
 const value=ids.length?PDFParagraph.text(state.objects,ids):null;
 if(value===null){await modal('문단 편집','가로로 놓인 텍스트를 선택하세요. 회전하거나 기울어진 텍스트는 문단으로 편집할 수 없습니다.',{cancel:''});return;}
 select(ids);
 const area=node('div'),input=node('textarea',{'aria-label':'문단 텍스트',rows:9});input.value=value;
 const lineCount=PDFParagraph.lines(state.objects.filter(item=>ids.includes(item.id))).length;
 area.append(input,node('p',{class:'hint',text:`${lineCount}줄을 원래 폭과 줄 간격으로 다시 배치합니다. 입력한 줄바꿈은 유지됩니다.`}));
 let font;const fontButton=node('button',{type:'button',text:'글꼴 변경…'});fontButton.onclick=async()=>{try{const file=await request('chooseFont');if(file){font=file;fontButton.textContent=file.split(/[\\/]/).pop();}}catch{fontButton.textContent='글꼴 선택 실패';}};area.append(fontButton);
 if(!await modal('문단 편집',area,{confirm:'적용',input}))return;
 const op={op:'set_paragraph',objects:ids,text:input.value};if(font)op.font=font;
 await task(async()=>{thumbnails.clear();await request('edit',{operations:[{...op,page}],revision:state.revision});await refresh(page);});
}
$('print').onclick=()=>task(()=>request('print'));
$('documentMode').onclick=async()=>{if(busy)return;if(await modal('문서로 편집','본문은 편집할 수 있고, 수식과 도표는 이미지로 보존됩니다.',{confirm:'문서로 열기'}))await task(()=>request('document'));};
$('editText').onclick=()=>editText();$('editParagraph').onclick=()=>editParagraph();$('addText').onclick=()=>editText(true);
$('delete').onclick=()=>{const o=selected();if(o)apply({op:'delete',object:o.id});};
$('applyGeometry').onclick=()=>{const o=selected();if(!o)return;const [l,b,r,t]=o.bounds;const w=Number($('width').value),h=Number($('height').value),x=Number($('x').value),y=Number($('y').value);apply({op:'transform',object:o.id,scaleX:w/(r-l),scaleY:h/(t-b),dx:x+w/2-(l+r)/2,dy:y+h/2-(b+t)/2});};
for(const [id,angle] of [['rotateLeft',90],['rotateRight',-90]])$(id).onclick=()=>{const o=selected();if(o)apply({op:'transform',object:o.id,rotation:angle});};
$('fill').onchange=()=>{const o=selected();if(o)apply({op:'set_fill',object:o.id,color:$('fill').value});};
$('addRect').onclick=()=>apply({op:'add_rect',x:40,y:40,width:140,height:80,color:'#dbeafe'});
for(const [id,op] of [['addImage','add_image'],['replaceImage','replace_image']])$(id).onclick=()=>task(async()=>{const image=await request('chooseImage');if(!image)return;const keep={id:op==='add_image'?rawObjects.length:selection,type:'image'};await request('edit',{revision:state.revision,operations:[{op,page,object:selection,image,x:40,y:40,width:200,height:150}]});await refresh(page,keep);});
for(const action of ['undo','redo'])$(action).onclick=()=>task(async()=>{await request(action);thumbnails.clear();await refreshNear(page);});
for(const id of ['save','saveAs'])$(id).onclick=()=>task(async()=>{await request('save',{as:id==='saveAs'});await refresh();});
$('zoom').onchange=()=>{if(state)render();};
$('ocr').onclick=async()=>{if(busy)return;const wrapper=node('div');const select=node('select',{'aria-label':'OCR 언어'});for(const [value,text] of [['kor+eng','한국어 + 영어'],['eng','영어'],['kor','한국어'],['jpn','일본어']])select.append(node('option',{value,text}));wrapper.append(select);if(!await modal('문자 인식',wrapper,{confirm:'인식'}))return;
 await task(async()=>{const result=await request('ocr',{page,language:select.value});const input=node('textarea',{'aria-label':'인식한 텍스트',rows:16});input.value=result.text;input.readOnly=true;const body=node('div');body.append(input);const copy=node('button',{type:'button',text:'텍스트 복사'});copy.disabled=!result.text;copy.onclick=async()=>{try{await request('copyText',{text:input.value});copy.textContent='복사됨';}catch{input.focus();input.select();}};body.append(copy);
 const canAdd=!!result.words?.length&&!state.objects.some(o=>o.type==='text'&&o.text?.trim());
 if(await modal('인식한 텍스트',body,{confirm:canAdd?'검색 텍스트 추가':'닫기',cancel:canAdd?'닫기':'',input})&&canAdd){await request('edit',{revision:state.revision,operations:[{op:'add_ocr_layer',page,regions:result.words}]});await refresh();}});};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&drag){drag.cancel();e.preventDefault();return;}if(e.key==='Escape'&&resizeGesture){resizeGesture.cancel();e.preventDefault();return;}if(busy||$('dialog').open||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;if(['PageDown','PageUp'].includes(e.key)){e.preventDefault();goPage(page+(e.key==='PageDown'?1:-1));return;}if(e.key==='F10'&&e.shiftKey&&selected()){const r=$('selectionFrame').getBoundingClientRect();openContext({preventDefault:()=>e.preventDefault(),clientX:r.x,clientY:r.y},selection);return;}const cmd=e.metaKey||e.ctrlKey;if(cmd&&e.key.toLowerCase()==='p'){e.preventDefault();window.hanxPDFAction('print');return;}if(cmd&&e.key.toLowerCase()==='a'){e.preventDefault();select(state.objects.map(o=>o.id));return;}if(cmd&&e.key.toLowerCase()==='s'){e.preventDefault();$(e.shiftKey?'saveAs':'save').click();return;}if(cmd&&e.key.toLowerCase()==='z'){e.preventDefault();$(e.shiftKey?'redo':'undo').click();return;}if((e.key==='Delete'||e.key==='Backspace')&&selected()){e.preventDefault();$('delete').click();return;}if(e.key==='Enter'&&selected()?.type==='text'){e.preventDefault();editText();return;}if(e.key==='Escape')select(null);const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(delta&&selected()){e.preventDefault();const [dx,dy]=viewDelta(delta[0]*(e.shiftKey?10:1),delta[1]*(e.shiftKey?10:1));apply({op:'transform',object:selection,dx,dy});}});
window.hanxPDFAction=async action=>{if($('dialog').open||inlineEdit&&['undo','redo'].includes(action)){if(['undo','redo'].includes(action))document.execCommand(action);return;}if(inlineEdit&&!await inlineEdit.commit())return;if(textCommit&&!await textCommit)return;$(action)?.click();};
const deferredButtons='header button, nav button, #pages button, .page-controls button';
document.addEventListener('pointerdown',event=>{if(inlineEdit&&event.target.closest(deferredButtons))event.preventDefault();},true);
document.addEventListener('click',async event=>{const button=event.target.closest(deferredButtons);if(!button||!inlineEdit&&!textCommit)return;event.preventDefault();event.stopImmediatePropagation();if(inlineEdit&&!await inlineEdit.commit())return;if(textCommit&&!await textCommit)return;if(button.isConnected)button.click();},true);
function filterObjects(){const type=$('objectType').value;for(const row of $('objectList').children){const object=state?.objects.find(o=>o.id===Number(row.dataset.id));row.hidden=type!=='all'&&object?.type!==type&&!(type==='text'&&object?.type==='outline');}}
$('objectType').onchange=filterObjects;
$('showDetails').onchange=()=>{if(busy||inlineEdit||textCommit){$('showDetails').checked=!$('showDetails').checked;return;}state.objects=$('showDetails').checked?rawObjects:PDFOutlines.groupOutlines(rawObjects,outlineRegions);selection=null;selectionIDs.clear();render();};
function updateFind(){const query=$('findQuery').value.normalize('NFC').toLocaleLowerCase().trim();findMatches=query&&state?state.objects.filter(o=>['text','outline'].includes(o.type)&&(o.text||'').normalize('NFC').toLocaleLowerCase().includes(query)).map(o=>o.id):[];findIndex=-1;$('findCount').textContent=query?findMatches.length+'개':'';for(const box of $('objects').children)box.classList.toggle('find-match',!$('findBar').hidden&&findMatches.includes(Number(box.dataset.id)));$('findNext').disabled=$('findPrevious').disabled=busy||!findMatches.length;}
async function openFind(){if(inlineEdit&&!await inlineEdit.commit())return;if(textCommit&&!await textCommit)return;$('findBar').hidden=false;updateFind();$('findQuery').focus();$('findQuery').select();}
function nextMatch(direction){if(busy||!findMatches.length)return;findIndex=(findIndex+direction+findMatches.length)%findMatches.length;select(findMatches[findIndex]);revealSelection();$('findCount').textContent=(findIndex+1)+' / '+findMatches.length;}
function closeFind(){$('findBar').hidden=true;updateFind();$('paper').focus({preventScroll:true});}
$('find').onclick=openFind;$('findQuery').oninput=updateFind;$('findNext').onclick=()=>nextMatch(1);$('findPrevious').onclick=()=>nextMatch(findIndex<0?0:-1);$('findClose').onclick=closeFind;
$('findQuery').onkeydown=event=>{event.stopPropagation();if(event.key==='Enter'&&!event.isComposing){event.preventDefault();nextMatch(event.shiftKey?(findIndex<0?0:-1):1);}if(event.key==='Escape'){event.preventDefault();closeFind();}};
document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='f'&&!$('dialog').open){event.preventDefault();event.stopImmediatePropagation();openFind();}},true);
window.addEventListener('hanx-pdf-action',event=>window.hanxPDFAction(event.detail));
task(async()=>{try{await refresh();}catch(error){if(!error.message.includes('pdf setup'))throw error;if(await modal('PDF 편집 준비','이 컴퓨터에 PDF 편집 엔진을 설치합니다. 문서는 외부로 전송하지 않습니다.',{confirm:'준비하기'})){await request('setup');await refresh();}else {$('status').textContent='준비 전';return;}}});

let gestureZoom=1;
function pinchPDF(value,x,y){if(!state||busy||inlineEdit)return;const box=$('paper').getBoundingClientRect(),px=(x-box.left)/zoom,py=(y-box.top)/zoom;const amount=Math.max(.1,Math.min(4,value));let option=$('customZoom');if(!option){option=node('option',{id:'customZoom'});$('zoom').append(option);}option.value=String(amount);option.textContent=Math.round(amount*100)+'%';$('zoom').value=String(amount);render();const after=$('paper').getBoundingClientRect();$('workspace').scrollLeft+=after.left+px*zoom-x;$('workspace').scrollTop+=after.top+py*zoom-y;}
$('workspace').addEventListener('wheel',event=>{if(!event.ctrlKey)return;event.preventDefault();pinchPDF(zoom*Math.exp(-event.deltaY*.008),event.clientX,event.clientY);},{passive:false});
$('workspace').addEventListener('gesturestart',event=>{event.preventDefault();gestureZoom=zoom;},{passive:false});$('workspace').addEventListener('gesturechange',event=>{event.preventDefault();pinchPDF(gestureZoom*event.scale,event.clientX,event.clientY);},{passive:false});
function beginMarquee(event,force=false){if(busy||event.button!==0||(!force&&!['objects','paper'].includes(event.target.id)))return;event.preventDefault();const start={x:event.clientX,y:event.clientY},before=new Set(event.shiftKey?selectionIDs:[]),paper=$('paper'),rubber=node('div',{class:'marquee'});paper.append(rubber);paper.setPointerCapture(event.pointerId);const move=e=>{const rect=paper.getBoundingClientRect(),l=Math.min(start.x,e.clientX),t=Math.min(start.y,e.clientY),r=Math.max(start.x,e.clientX),b=Math.max(start.y,e.clientY);Object.assign(rubber.style,{left:l-rect.left+'px',top:t-rect.top+'px',width:r-l+'px',height:b-t+'px'});select([...new Set([...before,...state.objects.filter(o=>{const [a,c,d,f]=viewRect(o);return a*zoom+rect.left>=l&&d*zoom+rect.left<=r&&c*zoom+rect.top>=t&&f*zoom+rect.top<=b;}).map(o=>o.id)])]);};const end=()=>{rubber.remove();paper.removeEventListener('pointermove',move);paper.removeEventListener('pointerup',end);paper.removeEventListener('pointercancel',end);};paper.addEventListener('pointermove',move);paper.addEventListener('pointerup',end);paper.addEventListener('pointercancel',end);}
$('paper').addEventListener('pointerdown',beginMarquee);
