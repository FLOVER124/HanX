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
const types={text:'텍스트',path:'도형',image:'이미지',form:'그룹',shading:'음영',unknown:'개체'};
function node(tag,attrs={}){const el=document.createElement(tag);for(const [k,v] of Object.entries(attrs)){if(k==='text')el.textContent=v;else if(k==='class')el.className=v;else el.setAttribute(k,v);}return el;}
async function modal(title,contents,{confirm='확인',cancel='취소',input}={}){
 $('dialogTitle').textContent=title;$('dialogBody').replaceChildren(typeof contents==='string'?document.createTextNode(contents):contents);$('confirm').textContent=confirm;$('cancel').textContent=cancel;$('cancel').hidden=!cancel;
 const dialog=$('dialog');dialog.returnValue='';dialog.showModal();if(input)setTimeout(()=>input.focus(),0);
 return new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='confirm'),{once:true}));
}
async function task(fn){if(busy)return;busy=true;document.body.classList.add('busy');$('status').textContent='작업 중…';controls();try{await fn();}catch(e){await modal('작업을 완료하지 못했습니다',e.message,{cancel:''});}finally{busy=false;document.body.classList.remove('busy');$('status').textContent='준비됨';controls();}}
async function refresh(index=page,keep=null){const next=await request('page',{page:index});state=next;page=next.page;selection=keep&&next.objects.some(o=>o.id===keep.id&&o.type===keep.type)?keep.id:null;render();}
function selected(){return state?.objects.find(o=>o.id===selection);}
function controls(){const o=selected();for(const id of ['save','saveAs','ocr','addText','addImage','addRect','zoom'])$(id).disabled=busy||!state;$('undo').disabled=busy||!state?.canUndo;$('redo').disabled=busy||!state?.canRedo;$('delete').disabled=busy||!o;$('editText').disabled=busy||o?.type!=='text';$('replaceImage').disabled=busy||o?.type!=='image';}
function render(){
 $('filename').textContent=state.name+(state.dirty?' *':'');document.title=$('filename').textContent+' | HanX';$('pageCount').textContent=`${page+1} / ${state.pageCount}`;
 $('preview').src=state.image;$('paper').style.width=state.width*zoom+'px';$('paper').style.height=state.height*zoom+'px';
 $('pages').replaceChildren();for(let i=0;i<state.pageCount;i++){const b=node('button',{text:String(i+1),class:i===page?'active':'','aria-label':`${i+1}페이지`});b.onclick=()=>task(()=>refresh(i));$('pages').append(b);}
 $('objects').replaceChildren();$('objectList').replaceChildren();
 for(const o of state.objects){
  const label=`${o.searchText?'검색 텍스트':types[o.type]} ${o.id+1}${o.text?'  '+o.text:''}`;
  const box=node('button',{class:'pdf-object'+(o.searchText?' search-text':''),'aria-label':label,'data-id':o.id});const [l,t,r,b]=o.viewBounds;
  Object.assign(box.style,{left:l*100+'%',top:t*100+'%',width:Math.max(0,r-l)*100+'%',height:Math.max(0,b-t)*100+'%'});
  box.onpointerdown=e=>startDrag(e,o,box);box.ondblclick=()=>{select(o.id);if(o.type==='text')editText();};box.oncontextmenu=e=>{e.preventDefault();select(o.id);};box.onfocus=()=>select(o.id);$('objects').append(box);
  const row=node('button',{text:label,'data-id':o.id});row.onclick=()=>{select(o.id);$('paper').focus();};$('objectList').append(row);
 }
 select(selection);controls();
}
function select(id){selection=id;const o=selected();for(const container of ['objects','objectList'])for(const item of $(container).children)item.classList.toggle('selected',Number(item.dataset.id)===id);$('inspector').hidden=!o;if(o){const [l,b,r,t]=o.bounds;for(const [id,v] of Object.entries({x:l,y:b,width:r-l,height:t-b}))$(id).value=Number(v.toFixed(2));$('fill').value=o.fill||'#202632';$('fill').disabled=!['text','path'].includes(o.type);}controls();}
function viewDelta(dx,dy){switch(state.rotation){case 90:return [dy,dx];case 180:return [-dx,dy];case 270:return [-dy,-dx];default:return [dx,-dy];}}
function startDrag(e,o,box){if(busy||e.button!==0)return;select(o.id);box.focus();box.setPointerCapture(e.pointerId);drag={x:e.clientX,y:e.clientY};
 box.onpointermove=event=>{if(drag)box.style.transform=`translate(${event.clientX-drag.x}px,${event.clientY-drag.y}px)`;};
 box.onpointercancel=()=>{drag=null;box.style.transform='';};
 box.onpointerup=event=>{if(!drag)return;const dx=event.clientX-drag.x,dy=event.clientY-drag.y;drag=null;box.style.transform='';if(Math.hypot(dx,dy)<3)return;const [x,y]=viewDelta(dx/zoom,dy/zoom);apply({op:'transform',object:o.id,dx:x,dy:y});};
}
async function apply(op){return task(async()=>{const added={add_text:'text',add_rect:'path',add_image:'image'}[op.op];const keep=added?{id:state.objects.length,type:added}:op.op==='delete'?null:state.objects.find(o=>o.id===op.object);await request('edit',{operations:[{...op,page}],revision:state.revision});await refresh(page,keep);});}
async function editText(add=false){if(busy)return;const o=selected();if(!add&&o?.type!=='text')return;const area=node('div'),input=node('textarea',{'aria-label':'텍스트',rows:4});input.value=add?'':o.text;area.append(input);const label=node('label',{text:'글자 크기 '});const size=node('input',{type:'number',min:1,max:1000,value:add?18:o.size||18,'aria-label':'글자 크기'});label.append(size);area.append(label);let font;const fontButton=node('button',{type:'button',text:'글꼴 파일 선택…'});fontButton.onclick=async()=>{try{const file=await request('chooseFont');if(file){font=file;fontButton.textContent=file.split(/[\\/]/).pop();}}catch(e){fontButton.textContent='글꼴 선택 실패';}};area.append(fontButton);
 if(await modal(add?'텍스트 추가':o.searchText?'검색 텍스트 수정':'텍스트 수정',area,{confirm:'적용',input})){const op={op:add?'add_text':'set_text',text:input.value};if(add||Number(size.value)!==o.size)op.size=Number(size.value);if(font)op.font=font;if(add){op.x=40;op.y=40;}else op.object=o.id;await apply(op);}}
$('editText').onclick=()=>editText();$('addText').onclick=()=>editText(true);
$('delete').onclick=()=>{const o=selected();if(o)apply({op:'delete',object:o.id});};
$('applyGeometry').onclick=()=>{const o=selected();if(!o)return;const [l,b,r,t]=o.bounds;const w=Number($('width').value),h=Number($('height').value),x=Number($('x').value),y=Number($('y').value);apply({op:'transform',object:o.id,scaleX:w/(r-l),scaleY:h/(t-b),dx:x+w/2-(l+r)/2,dy:y+h/2-(b+t)/2});};
for(const [id,angle] of [['rotateLeft',90],['rotateRight',-90]])$(id).onclick=()=>{const o=selected();if(o)apply({op:'transform',object:o.id,rotation:angle});};
$('fill').onchange=()=>{const o=selected();if(o)apply({op:'set_fill',object:o.id,color:$('fill').value});};
$('addRect').onclick=()=>apply({op:'add_rect',x:40,y:40,width:140,height:80,color:'#dbeafe'});
for(const [id,op] of [['addImage','add_image'],['replaceImage','replace_image']])$(id).onclick=()=>task(async()=>{const image=await request('chooseImage');if(!image)return;const keep={id:op==='add_image'?state.objects.length:selection,type:'image'};await request('edit',{revision:state.revision,operations:[{op,page,object:selection,image,x:40,y:40,width:200,height:150}]});await refresh(page,keep);});
for(const action of ['undo','redo'])$(action).onclick=()=>task(async()=>{await request(action);await refresh();});
for(const id of ['save','saveAs'])$(id).onclick=()=>task(async()=>{await request('save',{as:id==='saveAs'});await refresh();});
$('zoom').onchange=()=>{zoom=Number($('zoom').value);if(state)render();};
$('ocr').onclick=async()=>{if(busy)return;const wrapper=node('div');const select=node('select',{'aria-label':'OCR 언어'});for(const [value,text] of [['kor+eng','한국어 + 영어'],['eng','영어'],['kor','한국어'],['jpn','일본어']])select.append(node('option',{value,text}));wrapper.append(select);if(!await modal('문자 인식',wrapper,{confirm:'인식'}))return;
 await task(async()=>{const result=await request('ocr',{page,language:select.value});const input=node('textarea',{'aria-label':'인식한 텍스트',rows:16});input.value=result.text;input.readOnly=true;const body=node('div');body.append(input);const copy=node('button',{type:'button',text:'텍스트 복사'});copy.disabled=!result.text;copy.onclick=async()=>{try{await request('copyText',{text:input.value});copy.textContent='복사됨';}catch{input.focus();input.select();}};body.append(copy);
 const canAdd=!!result.words?.length&&!state.objects.some(o=>o.type==='text'&&o.text?.trim());
 if(await modal('인식한 텍스트',body,{confirm:canAdd?'검색 텍스트 추가':'닫기',cancel:canAdd?'닫기':'',input})&&canAdd){await request('edit',{revision:state.revision,operations:[{op:'add_ocr_layer',page,regions:result.words}]});await refresh();}});};
document.addEventListener('keydown',e=>{if(busy||$('dialog').open||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName))return;const cmd=e.metaKey||e.ctrlKey;if(cmd&&e.key.toLowerCase()==='s'){e.preventDefault();$(e.shiftKey?'saveAs':'save').click();return;}if(cmd&&e.key.toLowerCase()==='z'){e.preventDefault();$(e.shiftKey?'redo':'undo').click();return;}if((e.key==='Delete'||e.key==='Backspace')&&selected()){e.preventDefault();$('delete').click();return;}if(e.key==='Enter'&&selected()?.type==='text'){e.preventDefault();editText();return;}if(e.key==='Escape')select(null);const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(delta&&selected()){e.preventDefault();const [dx,dy]=viewDelta(delta[0]*(e.shiftKey?10:1),delta[1]*(e.shiftKey?10:1));apply({op:'transform',object:selection,dx,dy});}});
window.hanxPDFAction=action=>{if($('dialog').open){if(['undo','redo'].includes(action))document.execCommand(action);return;}$(action)?.click();};
window.addEventListener('hanx-pdf-action',event=>window.hanxPDFAction(event.detail));
task(async()=>{try{await refresh();}catch(error){if(!error.message.includes('pdf setup'))throw error;if(await modal('PDF 편집 준비','이 컴퓨터에 PDF 편집 엔진을 설치합니다. 문서는 외부로 전송하지 않습니다.',{confirm:'준비하기'})){await request('setup');await refresh();}else {$('status').textContent='준비 전';return;}}});
