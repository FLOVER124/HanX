const $=id=>document.getElementById(id),M=HanXModel;
let state,selected=0,shapeID=null,busy=false,cell='A1',gridRows=40,gridCols=12,docBlock=0,slideClipboard=false,cellRange='A1',ribbonKind='',ribbonTab='홈';
const imageOriginals=new Map();
const kindNames={document:'문서',spreadsheet:'스프레드시트',presentation:'프레젠테이션'};
function el(tag,attrs={},...children){const node=document.createElement(tag);for(const [key,value] of Object.entries(attrs)){if(key.startsWith('on'))node.addEventListener(key.slice(2),value);else if(key==='class')node.className=value;else if(key==='text')node.textContent=value;else if(key==='style')Object.assign(node.style,value);else if(value!==undefined&&value!==null)node.setAttribute(key,value);}for(const child of children.flat())if(child!=null)node.append(typeof child==='string'?document.createTextNode(child):child);return node;}
function button(text,action,cls=''){return el('button',{text,onclick:action,class:cls});}
let pending=Promise.resolve();
function run(task,success='준비됨'){const next=pending.then(()=>perform(task,success));pending=next.catch(()=>{});return next;}
async function perform(task,success){busy=true;document.body.classList.add('busy');$('status').textContent='작업 중…';try{const next=await task();if(next&&next.model){state=next;render();}$('status').textContent=success;}catch(error){if(!String(error?.message||error).includes('[hanx-notified]'))await hanx.reportError(String(error?.message||error)).catch(()=>{});$('status').textContent='준비됨';}finally{busy=false;document.body.classList.remove('busy');}}
const edit=(...ops)=>run(()=>hanx.edit(ops),'변경됨');
function field(label,value,onchange,type='text',cls=''){const input=el('input',{type,value,'aria-label':label,onchange:e=>onchange(type==='number'?Number(e.target.value):e.target.value)});return el('label',{class:'field'+(cls?' '+cls:'')},el('span',{text:label}),input);}
function selectField(label,values,current,onchange){const input=el('select',{onchange:e=>onchange(e.target.value)});for(const [value,text] of values)input.append(el('option',{value,text,selected:value===current?'selected':null}));return el('label',{class:'field'},el('span',{text:label}),input);}
function textEditor(text,onchange,attrs={}){const input=el('textarea',{...attrs,onchange:e=>{if(e.target.value!==text)onchange(e.target.value);}});input.value=text;input.rows=Math.max(1,text.split('\n').length);return input;}
function changeSelection(index){document.activeElement?.blur();selected=index;shapeID=null;render();}
function render(){if(!state)return;const model=state.model,kind=state.kind,list=kind==='document'?model.sections:kind==='spreadsheet'?model.sheets:model.slides;selected=Math.max(0,Math.min(selected,list.length-1));$('filename').textContent=(state.path?.split(/[\\/]/).pop()||'새 '+kindNames[kind])+(state.dirty?' *':'');$('filetype').textContent=kindNames[kind];document.title=$('filename').textContent+' | HanX';$('undo').disabled=!state.canUndo;$('redo').disabled=!state.canRedo;
 document.body.dataset.kind=kind;const outline=$('outline');outline.tabIndex=kind==='presentation'&&!list.length?0:-1;(kind==='spreadsheet'?$('sheetTabs'):document.querySelector('.navigation')).append(outline);$('sheetTabs').hidden=kind!=='spreadsheet';$('inspector').hidden=kind!=='presentation'||shapeID===null;
 $('outlineTitle').textContent={document:'문서 구역',spreadsheet:'워크시트',presentation:'슬라이드'}[kind];$('outline').replaceChildren(...list.map((item,i)=>{const title=kind==='spreadsheet'?item.name:kind==='presentation'?item.shapes.map(s=>s.paragraphs?.map(M.paragraphText).join(' ')).find(Boolean)||'빈 슬라이드':`구역 ${i+1}`;const node=button('',()=>{changeSelection(i);if(kind==='presentation')focusThumbnail();},i===selected?'selected':'');node.setAttribute('aria-current',i===selected?'true':'false');if(kind==='presentation'){node.dataset.slideIndex=i;node.append(miniSlide(model,item),el('span',{class:'slide-index',text:String(i+1)}));node.oncontextmenu=e=>{e.preventDefault();changeSelection(i);focusThumbnail();slideMenu(e,i);};}node.append(el('span',{text:title}));return node;}));
 $('workspace').replaceChildren();$('workspace').dataset.kind=kind;$('tools').replaceChildren();$('properties').replaceChildren();
 if(kind==='document')renderDocument(model);else if(kind==='spreadsheet')renderSpreadsheet(model);else renderPresentation(model);
 renderRibbon();
 $('counts').textContent=kind==='document'?`${state.text?.length||0}자`:kind==='spreadsheet'?`${model.sheets.length}개 워크시트`:`${model.slides.length}개 슬라이드`;
}
function appendInlines(node,p,images){
 for(const [index,inline] of (p.inlines||[]).entries()){
  const attrs={'data-source-run':index};
  if(inline.text)node.append(el('span',{...attrs,style:M.runStyle(inline.text._1),text:inline.text._0}));
  else if(inline.tab)node.append(el('span',{...attrs,text:'\t',style:{...M.runStyle(inline.tab._0),whiteSpace:'pre'}}));
  else if(inline.lineBreak)node.append(el('br',attrs));
  else if(inline.image){const img=inline.image,src=M.imageSource(images?.[img.id]);if(src)node.append(el('img',{src,alt:images[img.id].name,style:{width:img.width+'pt',maxWidth:'100%',height:'auto'}}));else node.append(el('span',{class:'media-note',text:'그림',title:'그림 미리보기'}));}
  else if(inline.field)node.append(el('span',{text:inline.field._0==='page'?'1':'#',style:M.runStyle(inline.field._1)}));
 }
}
function richRuns(node,p){
 const runs=[];
 function walk(n){
  const element=n.nodeType===Node.TEXT_NODE?n.parentElement:n;
  const source=element.closest('[data-source-run]'),sourceRun=source?Number(source.dataset.sourceRun):undefined;
  const inline=p.inlines?.[sourceRun],base=inline?.text?._1||inline?.tab?._0||inline?.lineBreak?._0||p.markProps||{};
  const run={sourceRun};
  if(n.nodeType===Node.TEXT_NODE){
   const css=getComputedStyle(element);
   const bold=Number(css.fontWeight)>=600,italic=css.fontStyle==='italic';
   if(bold!==Boolean(base.bold))run.bold=bold;
   if(italic!==Boolean(base.italic))run.italic=italic;
   let underlined=false;
   for(let ancestor=element;ancestor&&ancestor!==node;ancestor=ancestor.parentElement){
    if(getComputedStyle(ancestor).textDecorationLine.includes('underline')){underlined=true;break;}
   }
   if(underlined!==Boolean(base.underline&&base.underline!=='none'))run.underline=underlined;
   for(const part of n.textContent.split(/([\t\n])/)){
    if(part==='\t'||part==='\n')runs.push({...run,kind:part==='\t'?'tab':'lineBreak'});
    else if(part)runs.push({...run,text:part});
   }
  }else if(n.nodeName==='BR'){
   if(source||n.parentElement.childNodes.length>1)runs.push({...run,kind:'lineBreak'});
  }else{
   if(n!==node&&['DIV','P'].includes(n.nodeName)&&n.previousSibling)runs.push({kind:'lineBreak'});
   for(const child of n.childNodes)walk(child);
  }
 }
 walk(node);return runs;
}
function paragraphLineHeight(spacing){
 if(spacing?.multiple)return String(spacing.multiple._0);
 if(spacing?.percentOfSize)return spacing.percentOfSize._0+'%';
 if(spacing?.exact)return spacing.exact._0+'pt';
 if(spacing?.atLeast)return 'max(1.2em, '+spacing.atLeast._0+'pt)';
 return 'normal';
}
function richParagraph(p,images,onchange){const node=el('div',{class:'rich-paragraph',role:'textbox','aria-label':'문단 편집',style:{...M.runStyle(p.markProps),...(p.inlines?.length?{backgroundColor:'transparent',textDecoration:'none',verticalAlign:'baseline'}:{}),lineHeight:paragraphLineHeight(p.props?.lineSpacing),textAlign:p.props?.alignment==='distribute'?'justify':p.props?.alignment||'left',marginTop:(p.props?.spaceBefore||0)+'pt',marginBottom:(p.props?.spaceAfter||0)+'pt',paddingLeft:(p.props?.indentLeft||0)+'pt',paddingRight:(p.props?.indentRight||0)+'pt',textIndent:(p.props?.firstLine||0)+'pt'}});const hasObject=(p.inlines||[]).some(i=>i.image||i.field||i.pageBreak);node.contentEditable=onchange&&!hasObject?'true':'false';appendInlines(node,p,images);if(!node.childNodes.length)node.append(el('br'));let original=node.innerHTML;if(onchange)node.addEventListener('blur',()=>{if(node.innerHTML!==original&&!hasObject){const runs=richRuns(node,p);original=node.innerHTML;onchange(runs);}});node.addEventListener('paste',e=>{e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'));});return node;}
function readOnlyTable(table,images){const result=el('table',{class:'doc-table'});for(const row of table.rows){const tr=el('tr');for(const c of row){if(c.isMergedAway)continue;const td=el('td',{colspan:c.colSpan,rowspan:c.rowSpan,style:{background:M.color(c.background,'transparent'),verticalAlign:c.verticalAlign}});for(const b of c.blocks){if(b.paragraph)td.append(richParagraph(b.paragraph._0,images));else if(b.table)td.append(readOnlyTable(b.table._0,images));}tr.append(td);}result.append(tr);}return result;}
function sectionDecoration(blocks,images,label,pageNumber,pageCount){
 if(!blocks?.length)return null;
 const area=el('div',{class:'page-decoration','aria-label':label});
 for(const block of blocks){
  if(block.table)area.append(readOnlyTable(block.table._0,images));
  if(block.paragraph){
   const paragraph=block.paragraph._0;
   const inlines=paragraph.inlines.map(i=>i.field?{text:{_0:String(i.field._0==='page'?pageNumber:pageCount),_1:i.field._1}}:i);
   area.append(richParagraph({...paragraph,inlines},images));
  }
 }
 return area;
}
function editSectionText(part){
 const section=state.model.sections[selected],blocks=section[part]||[],label=part==='header'?'머리말':'꼬리말';
 if(blocks.some(b=>!b.paragraph||b.paragraph._0.inlines.some(i=>!i.text))){
  run(()=>{throw Error('그림, 표 또는 필드가 포함된 '+label+'은 이 편집기에서 수정할 수 없습니다.');});return;
 }
 const initial=blocks.map(M.blockText).join('\n'),field=el('textarea',{'aria-label':label,rows:5});
 field.value=initial;
 const dialog=el('dialog',{class:'section-text-dialog'},el('h2',{text:label}),field,el('div',{class:'dialog-actions'},
  button('취소',()=>dialog.close()),button('적용',()=>{dialog.close();if(field.value!==initial)edit({op:'set_section_text',section:selected,part,text:field.value});},'primary')));
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);dialog.showModal();field.focus();
}
function renderDocument(model){
 const section=model.sections[selected],pages=[];
 const newPage=()=>{const paper=el('article',{class:'paper document-page',style:{width:section.page.width+'pt',minHeight:section.page.height+'pt',padding:`${section.page.marginTop}pt ${section.page.marginRight}pt ${section.page.marginBottom}pt ${section.page.marginLeft}pt`}});pages.push(paper);$('workspace').append(paper);return paper;};
 let paper=newPage();
 section.blocks.forEach((block,index)=>{
  if(block.paragraph?._0.props.pageBreakBefore&&index>0)paper=newPage();
  let wrap=el('div',{class:'document-block'});
  if(block.paragraph){
   const p=block.paragraph._0;
   if(p.inlines.some(i=>i.pageBreak)){
    let line=[];for(const item of p.inlines){
     if(item.pageBreak){wrap.append(richParagraph({...p,inlines:line},model.images));paper.append(wrap);paper=newPage();wrap=el('div',{class:'document-block'});line=[];}else line.push(item);
    }
    wrap.append(richParagraph({...p,inlines:line},model.images));
   }else{
    const node=richParagraph(p,model.images,runs=>edit({op:'set_paragraph',section:selected,block:index,runs}));
    node.addEventListener('focus',()=>{if(docBlock!==index){docBlock=index;renderRibbon();}});wrap.append(node);
   }
   const border=p.props.bottomBorder;
   if(border&&border.style!=='none')wrap.style.borderBottom=`${border.width}pt ${border.style} ${M.color(border.color)}`;
  }else if(block.table){const table=readOnlyTable(block.table._0,model.images);const native=[];block.table._0.rows.forEach((row,r)=>row.forEach((c,col)=>{if(!c.isMergedAway)native.push([r,col,c]);}));Array.from(table.rows).flatMap(row=>Array.from(row.cells)).forEach((td,n)=>{const [r,c,source]=native[n];if(!M.tableCellEditable(source)){td.setAttribute('aria-readonly','true');td.title='그림, 필드 또는 중첩 표를 보존하기 위해 읽기 전용입니다.';return;}td.ondblclick=()=>{if(td.querySelector('textarea'))return;const text=source.blocks.map(M.blockText).join('\n');td.replaceChildren(textEditor(text,text=>edit({op:'set_cell',section:selected,block:index,row:r,column:c,text}),{'aria-label':`표 ${r+1}행 ${c+1}열`}));td.querySelector('textarea').focus();};});wrap.append(table);}
  wrap.append(button('×',()=>edit({op:'delete_block',section:selected,block:index}),'delete-block'));paper.append(wrap);
 });
 pages.forEach((paper,i)=>{
  const header=sectionDecoration(section.header,model.images,'머리말',i+1,pages.length),footer=sectionDecoration(section.footer,model.images,'꼬리말',i+1,pages.length);
  if(header)paper.prepend(header);if(footer){footer.classList.add('page-footer');paper.append(footer);}
 });
}
function renderSpreadsheet(model){const sheet=model.sheets[selected],cells=sheet.cells||{},calculated=state.calculated?.[selected]||{};const formula=el('input',{id:'formula',placeholder:'값 또는 수식','aria-label':'수식 입력줄',onchange:e=>edit({op:'set_cell',sheet:selected,cell,input:e.target.value})});formula.value=cells[cell]?.input||'';const ref=el('input',{class:'cell-ref',value:cell,'aria-label':'셀 주소',onchange:e=>{const address=e.target.value.toUpperCase();if(/^[A-Z]{1,3}[1-9][0-9]{0,6}$/.test(address)){cell=address;cellRange=address;formula.value=cells[cell]?.input||'';renderRibbon();}}});const bar=el('div',{class:'formula-bar'},ref,el('span',{text:'ƒx'}),formula);const scroll=el('div',{class:'grid-scroll'}),table=el('table',{class:'sheet-grid'});const head=el('tr',{},el('th'));for(let c=0;c<gridCols;c++)head.append(el('th',{text:M.columnName(c)}));table.append(head);
 const covered=new Set(),merges={};for(const range of sheet.merges||[]){const [start,end]=range.split(':').map(parseCell);if(!start||!end)continue;merges[M.columnName(start.col)+(start.row+1)]={colSpan:end.col-start.col+1,rowSpan:end.row-start.row+1};for(let r=start.row;r<=end.row;r++)for(let c=start.col;c<=end.col;c++)if(r!==start.row||c!==start.col)covered.add(M.columnName(c)+(r+1));}
 for(let r=0;r<gridRows;r++){const row=el('tr',{},el('th',{text:r+1}));for(let c=0;c<gridCols;c++){const address=M.columnName(c)+(r+1),value=cells[address];if(covered.has(address))continue;const input=el('input',{'aria-label':address,value:calculated[address]?.display??value?.input??'',onfocus:()=>{cell=address;cellRange=address;ref.value=address;formula.value=cells[address]?.input||'';table.querySelectorAll('.active-cell').forEach(n=>n.classList.remove('active-cell'));input.classList.add('active-cell');renderRibbon();},ondblclick:()=>{input.value=cells[address]?.input||'';input.select();},onkeydown:e=>{if(e.key==='Enter'){e.preventDefault();input.blur();}else if(e.key==='F2'){e.preventDefault();input.value=cells[address]?.input||'';}},onchange:e=>{if(e.target.value!==(calculated[address]?.display??value?.input??''))edit({op:'set_cell',sheet:selected,cell:address,input:e.target.value});},onpaste:e=>{const text=e.clipboardData.getData('text');if(text.includes('\t')||text.includes('\n')){e.preventDefault();edit({op:'set_range',sheet:selected,start:address,values:text.replace(/\r/g,'').replace(/\n$/,'').split('\n').map(line=>line.split('\t').map(input=>({input})))});}}});if(value?.style)Object.assign(input.style,{fontWeight:value.style.bold?'700':'400',fontStyle:value.style.italic?'italic':'normal',color:value.style.color?'#'+value.style.color:'',background:value.style.fill?'#'+value.style.fill:'',textAlign:value.style.align==='general'?(calculated[address]?.type==='number'?'right':'left'):value.style.align,fontSize:(value.style.fontSize||11)+'pt',fontFamily:value.style.fontName?JSON.stringify(value.style.fontName):'',textDecoration:value.style.underline?'underline':'none'});const merge=merges[address];row.append(el('td',{colspan:merge?.colSpan,rowspan:merge?.rowSpan},input));}table.append(row);}applyGridMetrics(table,sheet);
 const canvas=el('div',{class:'sheet-canvas'},table);
 if(sheet.charts?.length) canvas.append(HanXSheetCharts.renderCharts({
   sheet,calculated,scale:4/3,originX:43,originY:27,
   onSelect:index=>HanXChartEditor.open(advancedContext(model),index)
 }));
 scroll.append(canvas);$('workspace').append(bar,scroll);

}

function applyGridMetrics(table,sheet){
 const metrics=HanXAdvanced.gridMetrics(sheet,gridRows,gridCols),headerHeight=27,rowHeaderWidth=43;
 const columns=el('colgroup',{},el('col',{style:{width:rowHeaderWidth+'px'}}),metrics.widths.map(width=>el('col',{style:{width:width+'pt'}})));table.prepend(columns);
 table.style.width=(rowHeaderWidth+metrics.widths.reduce((a,b)=>a+b,0)*4/3)+'px';
 [...table.rows].forEach((row,index)=>{const r=index-1;row.style.height=(r<0?headerHeight+'px':metrics.heights[r]+'pt');
  [...row.cells].forEach((td,cIndex)=>{
   if(td.tagName==='TH'){td.style.background='var(--surface)';if(cIndex===0){td.style.width=rowHeaderWidth+'px';td.style.minWidth=rowHeaderWidth+'px';td.style.left='0';td.style.zIndex=r<0?'8':'5';if(r>=0)td.style.top='auto';if(r>=0&&r<metrics.frozenRows){td.style.top=headerHeight+metrics.top[r]*4/3+'px';td.style.zIndex='7';}}else if(r<0&&cIndex-1<metrics.frozenColumns){td.style.left=rowHeaderWidth+metrics.left[cIndex-1]*4/3+'px';td.style.zIndex='7';}return;}
   const input=td.querySelector('input'),address=parseCell(input.getAttribute('aria-label')),c=address.col,colspan=td.colSpan||1,rowspan=td.rowSpan||1;
   input.style.width='100%';input.style.minWidth='0';input.style.height='100%';td.style.height=metrics.heights.slice(r,r+rowspan).reduce((a,b)=>a+b,0)+'pt';td.style.width=metrics.widths.slice(c,c+colspan).reduce((a,b)=>a+b,0)+'pt';
   if(r<metrics.frozenRows||c<metrics.frozenColumns){td.style.position='sticky';td.style.background='#fff';td.style.zIndex=r<metrics.frozenRows&&c<metrics.frozenColumns?'6':'4';if(r<metrics.frozenRows)td.style.top=headerHeight+metrics.top[r]*4/3+'px';if(c<metrics.frozenColumns)td.style.left=rowHeaderWidth+metrics.left[c]*4/3+'px';}
  });
 });
}

function parseCell(a){const match=a?.match(/^([A-Z]+)(\d+)$/);if(!match)return null;let col=0;for(const c of match[1])col=col*26+c.charCodeAt(0)-64;return {row:Number(match[2])-1,col:col-1};}
const selectedShapeIDs=new Set();
let shapeSelectionSlide=null;
function selectedShapes(){return state?.kind==='presentation'?(state.model.slides[selected]?.shapes||[]).filter(s=>selectedShapeIDs.has(s.id)&&!s.locked):[];}
function syncShapeSelection(slide){if(shapeID===null||shapeSelectionSlide!==selected){selectedShapeIDs.clear();shapeID=null;}shapeSelectionSlide=selected;const valid=new Set((slide?.shapes||[]).filter(s=>!s.locked).map(s=>s.id));for(const id of selectedShapeIDs)if(!valid.has(id))selectedShapeIDs.delete(id);if(!selectedShapeIDs.has(shapeID))shapeID=selectedShapeIDs.values().next().value??null;}
function selectShape(shape,toggle=false){if(shape.locked)return;if(toggle){if(selectedShapeIDs.has(shape.id))selectedShapeIDs.delete(shape.id);else selectedShapeIDs.add(shape.id);}else{selectedShapeIDs.clear();selectedShapeIDs.add(shape.id);}shapeID=selectedShapeIDs.has(shape.id)?shape.id:selectedShapeIDs.values().next().value??null;shapeSelectionSlide=selected;refreshShapeSelection();}
function refreshShapeSelection(){const stage=document.querySelector('.slide-stage');stage?.querySelectorAll('.resize-handle,.rotate-handle').forEach(n=>n.remove());stage?.querySelectorAll('.slide-shape').forEach(n=>n.classList.toggle('active',selectedShapeIDs.has(Number(n.dataset.shapeId))||selectedShapeIDs.has(n.dataset.shapeId)));const chosen=selectedShapes();if(chosen.length===1){const node=Array.from(stage?.querySelectorAll('.slide-shape')||[]).find(n=>String(chosen[0].id)===n.dataset.shapeId);if(node)addHandles(node,chosen[0],state.model);}renderProperties(state.model,state.model.slides[selected]);}
function arrangeShapes(mode){const ops=HanXArrangement.arrange(state.model.slides[selected].shapes,selectedShapeIDs,mode,state.model.width,state.model.height,selected);if(ops.length)edit(...ops);}
function shapeBatch(op){const ops=selectedShapes().map(s=>({op,slide:selected,shapeId:s.id}));if(ops.length)edit(...ops);}
function changeShapeOrder(front) {
  const shapes = selectedShapes();
  if (!shapes.length) return;
  const to = front ? state.model.slides[selected].shapes.length - 1 : 0;
  if (!front) shapes.reverse();
  edit(...shapes.map(shape => ({op:'reorder_shape', slide:selected, shapeId:shape.id, to})));
}
function arrangementGroup(){return ribbonGroup('정렬과 간격',...[["왼쪽 맞춤","left"],["가운데 맞춤","center"],["오른쪽 맞춤","right"],["위쪽 맞춤","top"],["중간 맞춤","middle"],["아래쪽 맞춤","bottom"],["가로 간격 같게","horizontal"],["세로 간격 같게","vertical"]].map(([label,mode])=>{const b=button(label,()=>arrangeShapes(mode)),count=selectedShapes().length;b.disabled=count<(mode==='horizontal'||mode==='vertical'?3:1);b.title=count===1?'슬라이드에 맞춤':'선택한 개체에 맞춤';return b;}));}
function miniSlide(model,slide){
 const mini=el('div',{class:'mini-slide',style:{aspectRatio:model.width+'/'+model.height}});
 const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),view=document.createElementNS(ns,'foreignObject');
 svg.setAttribute('viewBox',`0 0 ${model.width} ${model.height}`);svg.setAttribute('aria-hidden','true');
 view.setAttribute('width',model.width);view.setAttribute('height',model.height);
 view.append(staticSlide(slide,model,true));svg.append(view);mini.append(svg);return mini;
}
function slideShapeContent(node,shape,model,scale,editable=false){
 const graphic=HanXShapes.graphic(shape,M.color);
 if(graphic)node.append(graphic);
 if(shape.kind==='image'){
  const src=M.imageSource(model.images?.[shape.imageID]);
  if(editable && src && !shape.videoID && !shape.locked)node.ondblclick=event=>{
   if(event.target.closest('button,.resize-handle,.rotate-handle')||selectedShapeIDs.size!==1)return;
   event.stopPropagation();cropSlideImage(shape);
  };
  node.append(src?el('img',{src,alt:shape.name||'슬라이드 그림',draggable:'false'}):el('span',{class:'media-note',text:'그림'}));
 }else if(shape.kind==='table'&&shape.table){
  const table=readOnlyTable(shape.table,model.images);
  node.append(editable?HanXTables.attach(table,shape.table,{slide:selected,shapeId:shape.id,edit,paragraphText:M.paragraphText,cellEditable:M.tableCellEditable}):table);
 }else if(shape.kind!=='line'){
  const insets=shape.insets||{left:7.2,right:7.2,top:3.6,bottom:3.6};
  const textScale=scale*Math.min(1,shape.autofitScale||1)*.75;
  // Native shapes rotate their text, but horizontal/vertical flips affect only the graphic.
  const layer=el('div',{class:'shape-text-layer',style:{transform:`scaleX(${shape.flipH?-1:1}) scaleY(${shape.flipV?-1:1})`}});
  const content=el('div',{class:'shape-text',style:{
   left:insets.left*scale+'px',top:insets.top*scale+'px',
   width:Math.max(4,shape.frame.w-insets.left-insets.right)*scale/textScale+'px',
   height:Math.max(4,shape.frame.h-insets.top-insets.bottom)*scale/textScale+'px',
   transformOrigin:'top left',transform:'scale('+textScale+')',
   justifyContent:({center:'center',bottom:'flex-end'})[shape.anchor]||'flex-start',whiteSpace:shape.wrap===false?'pre':'pre-wrap'
  }});
  (shape.paragraphs||[]).forEach(p=>content.append(richParagraph(p,model.images)));
  layer.append(content);node.append(layer);
  if(editable)node.ondblclick=()=>{
   if(shape.locked||selectedShapeIDs.size>1||node.querySelector('textarea'))return;
   const text=(shape.paragraphs||[]).map(M.paragraphText).join('\n');content.hidden=true;
   const editor=textEditor(text,text=>edit({op:'update_shape',slide:selected,shapeId:shape.id,text}),{'aria-label':'도형 텍스트',style:{fontSize:(shape.paragraphs?.[0]?.markProps?.size||24)*scale+'px'}});
   editor.addEventListener('blur',()=>{editor.remove();content.hidden=false;});layer.append(editor);editor.focus();
  };
 }
}
function focusThumbnail(){(document.querySelector('#outline [data-slide-index="'+selected+'"]')||$('outline')).focus();}
function thumbnailIndex(target,action){
 const thumb=target.closest('#outline [data-slide-index]');
 if(thumb)return Number(thumb.dataset.slideIndex);
 if(target===$('outline')&&state?.kind==='presentation'&&!state.model.slides.length&&action==='paste')return -1;
 return null;
}
function deleteSelectedSlide(index=selected){return run(async()=>{
 const next=await hanx.edit([{op:'delete_slide',slide:index}]);
 selected=Math.min(index,next.model.slides.length-1);shapeID=null;selectedShapeIDs.clear();return next;
});}
function duplicateSlide(index=selected){return run(async()=>{
 const next=await hanx.edit([{op:'duplicate_slide',slide:index}]);
 selected=index+1;shapeID=null;selectedShapeIDs.clear();return next;
});}
function copySlide(index=selected){return run(async()=>{await hanx.copySlide(index);slideClipboard=true;},'슬라이드를 복사했습니다.');}
function cutSlide(index=selected){return run(async()=>{
 await hanx.copySlide(index);slideClipboard=true;
 const next=await hanx.edit([{op:'delete_slide',slide:index}]);
 selected=Math.min(index,next.model.slides.length-1);shapeID=null;selectedShapeIDs.clear();return next;
},'슬라이드를 잘라냈습니다.');}
function pasteSlide(index=selected){return run(async()=>{const at=state.model.slides.length?index+1:0,next=await hanx.pasteSlide(at);selected=at;shapeID=null;selectedShapeIDs.clear();return next;},'슬라이드를 붙여넣었습니다.');}
const thumbnailActions={copy:copySlide,cut:cutSlide,paste:pasteSlide,duplicate:duplicateSlide,delete:deleteSelectedSlide};
function thumbnailAction(action,index){
 const focus=document.activeElement;
 thumbnailActions[action](index).then(()=>{if(document.activeElement===document.body||document.activeElement===focus||document.activeElement.closest('#contextMenu'))focusThumbnail();});
}
function slideMenu(event,index=selected){
 const menu=$('contextMenu');
 menu.replaceChildren(...Object.entries({cut:'슬라이드 잘라내기',copy:'슬라이드 복사',paste:'슬라이드 붙여넣기',duplicate:'슬라이드 복제',delete:'슬라이드 삭제'}).map(([action,label])=>button(label,()=>thumbnailAction(action,index))));
 menu.hidden=false;menu.style.left=Math.min(event.clientX,innerWidth-190)+'px';menu.style.top=Math.min(event.clientY,innerHeight-menu.offsetHeight)+'px';
}
function renderPresentation(model){const slide=model.slides[selected];syncShapeSelection(slide);if(!slide){$('workspace').append(el('div',{class:'empty-slide'},button('슬라이드 추가',()=>edit({op:'add_slide',value:{title:'제목을 입력하세요',body:['내용을 입력하세요']}}),'primary')));$('tools').append(button('붙여넣기',()=>pasteSlide()));return;}
 const stage=el('div',{class:'slide-stage',tabindex:0,'aria-label':`${selected+1}번 슬라이드`,style:{width:'720px',height:model.height*720/model.width+'px',background:M.color(slide.background),backgroundImage:slideBackgroundPaint(slide,model),backgroundSize:'100% 100%'}});const scale=720/model.width;
 slide.shapes.forEach(shape=>{const frame=shape.frame;const node=el('div',{'data-shape-id':shape.id,class:'slide-shape kind-'+shape.kind+(selectedShapeIDs.has(shape.id)?' active':''),style:{left:frame.x/model.width*100+'%',top:frame.y/model.height*100+'%',width:frame.w/model.width*100+'%',height:frame.h/model.height*100+'%',transform:M.shapeTransform(shape)},onclick:e=>{e.stopPropagation();if(e.detail===0&&!selectedShapeIDs.has(shape.id))selectShape(shape,e.shiftKey||e.ctrlKey||e.metaKey);},oncontextmenu:e=>{e.preventDefault();e.stopPropagation();if(shape.locked)return;if(!selectedShapeIDs.has(shape.id))selectShape(shape);const menu=$('contextMenu');menu.replaceChildren(button('도형 복제',()=>shapeBatch('duplicate_shape')),button('도형 삭제',()=>shapeBatch('delete_shape')));menu.hidden=false;menu.style.left=Math.min(e.clientX,innerWidth-190)+'px';menu.style.top=Math.min(e.clientY,innerHeight-120)+'px';}}); slideShapeContent(node,shape,model,scale,true);
 HanXSlideMedia.attachMovie(node,shape,model,false,message=>hanx.reportError(message));
 node.addEventListener('pointerdown',event=>{if(shape.locked||event.target.closest('textarea,input,button,select,[contenteditable=true],.resize-handle,.rotate-handle'))return;if(event.shiftKey||event.ctrlKey||event.metaKey){event.preventDefault();event.stopPropagation();selectShape(shape,true);return;}if(!selectedShapeIDs.has(shape.id))selectShape(shape);beginTransform(event,node,shape,model,'move');});if(selectedShapeIDs.size===1&&shapeID===shape.id&&!shape.locked)addHandles(node,shape,model);stage.append(node);});
 HanXSlideMedia.attachDrop(stage,model,selected,run,ops=>hanx.edit(ops));
 stage.onclick=e=>{if(e.target!==stage)return;shapeID=null;selectedShapeIDs.clear();render();};
 $('workspace').append(el('div',{class:'slide-holder'},stage),el('label',{class:'notes'},el('span',{text:'발표자 메모'}),textEditor(slide.notes||'',text=>edit({op:'set_notes',slide:selected,text}))));
 renderProperties(model,slide);
}

function addHandles(node,shape,model){node.parentElement?.querySelectorAll('.resize-handle,.rotate-handle').forEach(n=>n.remove());node.querySelectorAll('.resize-handle,.rotate-handle').forEach(n=>n.remove());for(const corner of ['nw','ne','sw','se'])node.append(el('span',{class:'resize-handle '+corner,role:'button','aria-label':'크기 조절',onpointerdown:e=>beginTransform(e,node,shape,model,corner)}));node.append(el('span',{class:'rotate-handle',role:'button','aria-label':'회전',onpointerdown:e=>beginTransform(e,node,shape,model,'rotate')}));}
function beginTransform(event,node,shape,model,mode){if(event.button!==0||shape.locked)return;event.preventDefault();event.stopPropagation();shapeID=shape.id;node.classList.add('active');const scale=720/model.width,start={x:event.clientX,y:event.clientY},f={...shape.frame};let result={};const moving=mode==='move'?selectedShapes().map(s=>({shape:s,node:Array.from(node.parentElement.querySelectorAll('.slide-shape')).find(n=>n.dataset.shapeId===String(s.id))})):[];const rect=node.getBoundingClientRect(),cx=rect.left+rect.width/2,cy=rect.top+rect.height/2,initialAngle=Math.atan2(start.y-cy,start.x-cx)*180/Math.PI;node.setPointerCapture(event.pointerId);
 const move=e=>{const dx=(e.clientX-start.x)/scale,dy=(e.clientY-start.y)/scale;if(mode==='move'){result={x:f.x+dx,y:f.y+dy};for(const item of moving){if(item.node){item.node.style.left=(item.shape.frame.x+dx)/model.width*100+'%';item.node.style.top=(item.shape.frame.y+dy)/model.height*100+'%';}}}else if(mode==='rotate')result={rotation:Math.round((shape.rotation||0)+Math.atan2(e.clientY-cy,e.clientX-cx)*180/Math.PI-initialAngle)};else result=M.resizeFrame(shape,mode,dx,dy);if(result.x!==undefined)node.style.left=result.x/model.width*100+'%';if(result.y!==undefined)node.style.top=result.y/model.height*100+'%';if(result.width)node.style.width=result.width/model.width*100+'%';if(result.height)node.style.height=result.height/model.height*100+'%';if(result.rotation!==undefined)node.style.transform=M.shapeTransform({...shape,rotation:result.rotation});};
 const end=()=>{node.removeEventListener('pointermove',move);node.removeEventListener('pointerup',end);node.removeEventListener('pointercancel',cancel);if(Object.keys(result).length){if(mode==='move')edit(...moving.map(item=>({op:'update_shape',slide:selected,shapeId:item.shape.id,x:item.shape.frame.x+result.x-f.x,y:item.shape.frame.y+result.y-f.y})));else edit({op:'update_shape',slide:selected,shapeId:shape.id,...result});}else refreshShapeSelection();};const cancel=()=>{node.removeEventListener('pointermove',move);node.removeEventListener('pointerup',end);node.removeEventListener('pointercancel',cancel);render();};node.addEventListener('pointermove',move);node.addEventListener('pointerup',end);node.addEventListener('pointercancel',cancel);
}
function previewTransition(){const stage=document.querySelector('.slide-stage'),transition=state.model.slides[selected]?.transition;if(!stage)return;const kind=transition?.kind||'none',duration=Math.min(5,transition?.duration||.5)*1000;const frames=kind==='fade'?[{opacity:0},{opacity:1}]:kind==='push'?[{transform:'translateX(90%)'},{transform:'translateX(0)'}]:kind==='wipe'?[{clipPath:'inset(0 100% 0 0)'},{clipPath:'inset(0 0 0 0)'}]:[{opacity:1},{opacity:1}];stage.animate(frames,{duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:duration,easing:'ease-out'});$('status').textContent=kind==='none'||kind==='cut'?'전환 효과 없음':'전환 효과 미리보기';}
function renderProperties(model,slide){const props=$('properties');props.replaceChildren();const shape=selectedShapeIDs.size===1?slide.shapes.find(s=>s.id===shapeID):null;$('inspector').hidden=!shape;if(!shape){renderRibbon();return;}
 props.append(el('strong',{text:shape.name||({text:'텍스트',rect:'사각형',ellipse:'타원',image:'그림',table:'표'}[shape.kind]||shape.kind)}));for(const [label,key,native] of [['가로 위치','x','x'],['세로 위치','y','y'],['너비','width','w'],['높이','height','h']])props.append(field(`${label} (pt)`,Math.round(shape.frame[native]),value=>edit({op:'update_shape',slide:selected,shapeId:shape.id,[key]:value,...(shape.lockAspect&&key==='width'?{height:value*shape.frame.h/shape.frame.w}:shape.lockAspect&&key==='height'?{width:value*shape.frame.w/shape.frame.h}:{})}),'number'));props.append(field('회전 (°)',shape.rotation||0,rotation=>edit({op:'update_shape',slide:selected,shapeId:shape.id,rotation}),'number'),field('채우기',M.color(shape.fill),fill=>edit({op:'update_shape',slide:selected,shapeId:shape.id,fill:fill.slice(1)}),'color'));
 renderRibbon();
}

// The portable ribbon exposes implemented engine operations only. Tab names and
// group order follow OfficeRibbon; unsupported native tools are intentionally absent.
function ribbonGroup(title,...controls){return el('section',{class:'ribbon-group','aria-label':title},el('div',{class:'ribbon-controls'},controls),el('span',{class:'ribbon-group-title',text:title}));}
function preserveFocus(control){control.addEventListener('mousedown',event=>event.preventDefault());return control;}
function clipboardGroup(){return ribbonGroup('클립보드',...[["잘라내기","cut"],["복사","copy"],["붙여넣기","paste"]].map(([label,action])=>preserveFocus(button(label,()=>run(()=>hanx.clipboard(action))))));}
function addSheet(){let n=1;while(state.model.sheets.some(s=>s.name===`Sheet${n}`))n++;edit({op:'add_sheet',name:`Sheet${n}`});}
function advancedContext(model){return {model,selected,cell,cellRange,el,button,field,selectField,ribbonGroup,edit};}
function newTemplate(template){return run(async()=>{
 const next=await hanx.newFile('document',template);
 if(next){selected=0;docBlock=0;imageOriginals.clear();}
 return next;
});}
function documentRibbon(model){const section=model.sections[selected],paragraphs=section.blocks.map((block,index)=>[block,index]).filter(([block])=>block.paragraph);if(!section.blocks[docBlock]?.paragraph)docBlock=paragraphs[0]?.[1]??0;const p=section.blocks[docBlock]?.paragraph?._0,c=p?.markProps||{};
 const style=change=>edit({op:'style_paragraph',section:selected,block:docBlock,style:change});
 const format=([label,command])=>{const b=preserveFocus(button(label,()=>{if(document.activeElement?.isContentEditable)document.execCommand(command);else style({[command]:!c[command]||c[command]==='none'});}));b.disabled=!p;b.setAttribute('aria-pressed',String(Boolean(c[command]&&c[command]!=='none')));return b;};
 const paragraphIndex=el('select',{'aria-label':'서식을 바꿀 문단',onchange:e=>{docBlock=Number(e.target.value);renderRibbon();}});for(const [block,index] of paragraphs)paragraphIndex.append(el('option',{value:index,text:`${index+1}번 문단`,selected:index===docBlock?'selected':null}));
 const layout=change=>{if(p)edit({op:'set_paragraph_layout',section:selected,block:docBlock,...change});};
 const align=selectField('문단 정렬',[['left','왼쪽'],['center','가운데'],['right','오른쪽'],['justify','양쪽'],['distribute','배분']],p?.props.alignment||'left',alignment=>layout({alignment}));align.querySelector('select').disabled=!p;
 const dimensions=()=>Object.entries({indentLeft:'왼쪽 들여쓰기',indentRight:'오른쪽 들여쓰기',firstLine:'첫 줄 들여쓰기',spaceBefore:'문단 앞 간격',spaceAfter:'문단 뒤 간격'}).map(([key,label])=>field(label+' (pt)',p.props[key],value=>layout({[key]:value}),'number'));
 const lineControls=()=>{
  const [kind,amount]=Object.entries(p.props.lineSpacing||{multiple:{_0:1}})[0];
  const rules=[['multiple','배수'],['percentOfSize','글자 크기 (%)'],['exact','고정 (pt)'],['atLeast','최소 (pt)']];
  return [selectField('줄 간격 기준',rules,kind,kind=>layout({lineSpacing:{kind,value:kind==='multiple'?1:kind==='percentOfSize'?160:16}})),field('줄 간격',amount._0,value=>{if(value>0)layout({lineSpacing:{kind,value}});},'number')];
 };
 const sectionIndex=el('select',{'aria-label':'문서 구역',onchange:e=>changeSelection(Number(e.target.value))});model.sections.forEach((section,index)=>sectionIndex.append(el('option',{value:index,text:`구역 ${index+1}`,selected:index===selected?'selected':null})));
 return [
  ['홈',()=>[clipboardGroup(),ribbonGroup('글꼴',field('글꼴',c.fontName||'맑은 고딕',font=>style({font}),'text','font-face'),field('글자 크기 (pt)',c.size||12,size=>style({size}),'number','font-size'),...[['굵게','bold'],['기울임','italic'],['밑줄','underline']].map(format)),ribbonGroup('문단',el('label',{class:'field'},el('span',{text:'문단 선택'}),paragraphIndex),align)]],
  ['글자 모양',()=>p?[ribbonGroup('문단 글자 모양',field('글자색',M.color(c.color,'#203247'),color=>style({color:color.slice(1)}),'color'),field('형광펜',M.color(c.highlight,'#ffff00'),highlight=>style({highlight:highlight.slice(1)}),'color'),button('형광펜 없음',()=>style({highlight:null})),button('취소선',()=>style({strike:!c.strike})),selectField('첨자',[['baseline','기본'],['superscript','위 첨자'],['subscript','아래 첨자']],c.verticalAlign||'baseline',verticalAlign=>style({verticalAlign})),field('자간 (pt)',c.spacing||0,spacing=>style({spacing}),'number'))]:[]],
  ['양식',()=>[ribbonGroup('새 문서',button('편지지',()=>newTemplate('letter')),button('라벨 2열 × 7행',()=>newTemplate('labels')))]],
 ['삽입',()=>[ribbonGroup('문서 요소',button('쪽 나누기',()=>edit({op:'insert_page_break',section:selected,block:Math.min(docBlock+1,section.blocks.length)})),button('구분선',()=>edit({op:'insert_divider',section:selected,block:Math.min(docBlock+1,section.blocks.length)})),button('머리말',()=>editSectionText('header')),button('꼬리말',()=>editSectionText('footer')),button('문단 추가',()=>edit({op:'append_paragraph',section:selected,text:''})),button('표 삽입',()=>edit({op:'append_block',section:selected,block:{type:'table',rows:[['',''],['','']]}})))]],
  ['쪽 문단',()=>[...(p?[ribbonGroup('문단 여백',...dimensions()),ribbonGroup('줄 간격',...lineControls())]:[]),...HanXAdvanced.documentGroups(advancedContext(model)),ribbonGroup('용지',field('용지 너비 (pt)',section.page.width,width=>edit({op:'set_page',section:selected,page:{width}}),'number'),field('용지 높이 (pt)',section.page.height,height=>edit({op:'set_page',section:selected,page:{height}}),'number')),ribbonGroup('문서 구역',el('label',{class:'field'},el('span',{text:'구역'}),sectionIndex))]]
 ];
}
function spreadsheetRibbon(model){const sheet=model.sheets[selected],style=sheet.cells?.[cell]?.style||{};const restyle=change=>edit({op:'style_range',sheet:selected,range:cellRange,style:change});const toggle=([label,key])=>{const control=button(label,()=>restyle({[key]:!style[key]}));control.setAttribute('aria-pressed',String(Boolean(style[key])));return control;};return [
 ['홈',()=>[clipboardGroup(),ribbonGroup('선택',field('셀 또는 범위',cellRange,value=>{cellRange=value.toUpperCase();})),ribbonGroup('글꼴',field('글꼴',style.fontName||'맑은 고딕',fontName=>restyle({fontName}),'text','font-face'),field('글자 크기 (pt)',style.fontSize||11,fontSize=>restyle({fontSize}),'number','font-size'),...[['굵게','bold'],['기울임','italic'],['밑줄','underline']].map(toggle)),ribbonGroup('셀 정렬',selectField('셀 정렬',[['general','일반'],['left','왼쪽'],['center','가운데'],['right','오른쪽']],style.align||'general',align=>restyle({align})),button('셀 병합',()=>edit({op:'merge',sheet:selected,range:cellRange})),button('병합 해제',()=>edit({op:'unmerge',sheet:selected,range:cellRange}))),ribbonGroup('편집',button('지우기',()=>edit({op:'clear_range',sheet:selected,range:cellRange})))]],
 ['셀 서식',()=>[ribbonGroup('선택',field('셀 또는 범위',cellRange,value=>{cellRange=value.toUpperCase();})),ribbonGroup('색과 테두리',field('글자 색','#'+(style.color||'203247'),color=>restyle({color:color.slice(1)}),'color'),field('채우기','#'+(style.fill||'FFFFFF'),fill=>restyle({fill:fill.slice(1)}),'color')),ribbonGroup('표시 형식',field('표시 형식',style.numberFormat||'',numberFormat=>restyle({numberFormat})))]],
 ['삽입 크기',()=>[ribbonGroup('시트',button('시트 추가',addSheet),button('시트 삭제',()=>edit({op:'delete_sheet',sheet:selected}))),ribbonGroup('차트',button('차트 삽입',()=>HanXChartEditor.open(advancedContext(model))))]],
 ['크기와 수식',()=>HanXAdvanced.spreadsheetGroups(advancedContext(model))],
 ['데이터',()=>HanXSheetData.groups(advancedContext(model))],
 ['보기',()=>[ribbonGroup('화면',button('첫 행 고정',()=>edit({op:'freeze',sheet:selected,rows:1,columns:0})),button('행 더 보기',()=>{gridRows=Math.min(1000,gridRows+40);render();}),button('열 더 보기',()=>{gridCols=Math.min(100,gridCols+12);render();}))]]
];}

function insertSlideShape(kind,model){return edit({op:'add_shape',slide:selected,value:HanXShapes.insertion(kind,model)});}
function shapePicker(model){
 const select=el('select',{'aria-label':'도형 선택'},el('option',{value:'',text:'도형 선택'}));
 for(const [kind,title] of Object.entries(HanXShapes.titles))if(!['image','table','line','text'].includes(kind))select.append(el('option',{value:kind,text:title}));
 select.onchange=()=>{const kind=select.value;select.value='';if(kind)insertSlideShape(kind,model);};return select;
}
function slideBackgroundPaint(slide,model){
 const picture=M.imageSource(model.images?.[slide.backgroundImage]);
 if(picture)return `url("${picture}")`;
 const middle=slide.backgroundMiddle?`${M.color(slide.backgroundMiddle)} ${slide.backgroundMiddlePosition??50}%,`:'';
 return slide.backgroundEnd?`linear-gradient(${90+(slide.backgroundAngle||0)}deg,${M.color(slide.background)},${middle}${M.color(slide.backgroundEnd)})`:null;
}
function editGradient(slide){
 const index=selected;
 const first=el('input',{type:'color',value:M.color(slide.background),'aria-label':'시작 색'});
 const last=el('input',{type:'color',value:M.color(slide.backgroundEnd),'aria-label':'끝 색'});
 const angle=el('input',{type:'number',min:0,max:360,step:1,value:slide.backgroundAngle||0,'aria-label':'각도'});
 const preview=el('div',{style:{width:'320px',height:'180px',borderRadius:'8px'},'aria-label':'배경 미리보기'});
 const useMiddle=el('input',{type:'checkbox'});useMiddle.checked=Boolean(slide.backgroundEnd&&slide.backgroundMiddle);
 const middle=el('input',{type:'color',value:M.color(slide.backgroundMiddle),'aria-label':'중간 색'});
 const position=el('input',{type:'number',min:0.001,max:99.999,step:'any',value:slide.backgroundMiddlePosition??50,'aria-label':'중간 색 위치'});
 const update=()=>{
  middle.disabled=position.disabled=!useMiddle.checked;
  const stop=useMiddle.checked?`${middle.value} ${position.value}%,`:'';
  preview.style.background=`linear-gradient(${90+Number(angle.value)}deg,${first.value},${stop}${last.value})`;
 };
 for(const input of [first,last,angle,useMiddle,middle,position])input.addEventListener('input',update);
 const dialog=el('dialog',{'aria-label':'그라데이션 배경'},
  el('h2',{text:'그라데이션 배경'}),preview,
  el('div',{class:'image-adjustments'},el('label',{},'시작 색',first),el('label',{},'끝 색',last),el('label',{},'각도 (°)',angle),el('label',{},useMiddle,'중간 색 사용'),el('label',{},'중간 색',middle),el('label',{},'위치 (%)',position)),
  el('div',{class:'dialog-actions'},button('취소',()=>dialog.close()),button('적용',()=>{
   if(!angle.checkValidity()||!angle.value.trim()){angle.reportValidity();return;}
   if(useMiddle.checked&&(!position.checkValidity()||position.value==='')){position.reportValidity();return;}
   const stop=useMiddle.checked?{middleColor:middle.value,middlePosition:Number(position.value)}:{};
   dialog.close();edit({op:'set_background',slide:index,color:first.value,endColor:last.value,angle:Number(angle.value),...stop});
  },'primary')));
 dialog.addEventListener('close',()=>dialog.remove(),{once:true});document.body.append(dialog);update();dialog.showModal();
}
function backgroundTools(slide){
 const color=el('input',{type:'color',value:M.color(slide.background)||'#ffffff','aria-label':'슬라이드 배경색'});
 const set=(props)=>edit({op:'set_background',slide:selected,...props});
 color.onchange=()=>set({color:color.value});
 const designs=[['바다','204680','80D3E9'],['새벽','553F75','FFB38D'],['숲','135B54','ACE2A3']];
 return [ribbonGroup('배경색',color,button('흰색',()=>set({color:'FFFFFF'}))),ribbonGroup('배경 디자인',button('직접 설정',()=>editGradient(slide)),...designs.map(([name,color,endColor])=>button(name,()=>set({color,endColor})))),ribbonGroup('슬라이드 배경',button('배경 그림',()=>run(()=>hanx.insertImage(selected,true))),button('모두 적용',()=>set({copyToAll:true})))];
}
function presentationRibbon(model){const slide=model.slides[selected],shape=slide?.shapes.find(s=>s.id===shapeID);const add=()=>edit({op:'add_slide',at:selected+1,value:{title:'제목을 입력하세요',body:['내용을 입력하세요']}});const slides=()=>ribbonGroup('슬라이드',button('슬라이드 추가',add),button('복제',()=>duplicateSlide()),button('슬라이드 삭제',()=>deleteSelectedSlide()));const shapeButton=(label,action)=>{const b=button(label,action);b.disabled=!shape;return b;};if(!slide)return [['홈',()=>[ribbonGroup('슬라이드',button('슬라이드 추가',add),button('붙여넣기',()=>pasteSlide()))]]];return [
 ['홈',()=>[ribbonGroup('클립보드',button('슬라이드 복사',()=>copySlide()),button('붙여넣기',()=>pasteSlide())),slides()]],
 ['삽입',()=>[slides(),ribbonGroup('개체',button('동영상 넣기',()=>HanXSlideMedia.pick(model,selected,run,ops=>hanx.edit(ops))),button('표 넣기',()=>HanXTables.insert({el,button,model,selected,edit})),button('그림 넣기',()=>run(()=>hanx.insertImage(selected))),button('텍스트',()=>insertSlideShape('text',model)),shapePicker(model),button('선',()=>insertSlideShape('line',model)))]],
 ['디자인',()=>backgroundTools(slide)],
 ['배치',()=>[arrangementGroup(),ribbonGroup('크기와 회전',...(selectedShapeIDs.size===1?[shapeButton('크기 위치',()=>{$('properties').querySelector('input')?.focus();})]:[])),ribbonGroup('순서',shapeButton('맨 앞으로',()=>changeShapeOrder(true)),shapeButton('맨 뒤로',()=>changeShapeOrder(false))),ribbonGroup('개체',shapeButton('도형 복제',()=>shapeBatch('duplicate_shape')),shapeButton('도형 삭제',()=>shapeBatch('delete_shape'))) ]],
 ...(shape&&selectedShapeIDs.size===1?[['도형 서식',()=>shapeFormatGroups(model,shape)]]:[]),
 ...(shape?.kind==='image'&&!shape.videoID&&selectedShapeIDs.size===1?[['그림',()=>[ribbonGroup('그림 편집',button('자르기',()=>cropSlideImage(shape)),button('그림 보정',()=>adjustSlideImage(shape)),button('배경 제거',()=>removeImageBackground(shape,true)),button('단색 배경 제거',()=>removeImageBackground(shape)),imageRestoreButton(shape)),ribbonGroup('회전과 대칭',shapeButton('왼쪽으로 90°',()=>edit({op:'update_shape',slide:selected,shapeId:shape.id,rotation:(shape.rotation||0)-90})),shapeButton('오른쪽으로 90°',()=>edit({op:'update_shape',slide:selected,shapeId:shape.id,rotation:(shape.rotation||0)+90})),shapeButton('좌우 대칭',()=>edit({op:'update_shape',slide:selected,shapeId:shape.id,flipH:!shape.flipH})),shapeButton('상하 대칭',()=>edit({op:'update_shape',slide:selected,shapeId:shape.id,flipV:!shape.flipV})))]]]:[]),
 ...(window.HanXPlayback?[['애니메이션',()=>HanXPlayback.animationGroups(playbackContext(model))],['슬라이드 쇼',()=>HanXPlayback.playbackGroups(playbackContext(model))]]:[]),
 ['전환',()=>window.HanXPlayback?HanXPlayback.transitionGroups(playbackContext(model)):[ribbonGroup('화면 전환',selectField('전환 효과',[['none','없음'],['cut','바로 전환'],['fade','서서히'],['push','밀기'],['wipe','닦아내기']],slide.transition?.kind||'none',kind=>edit({op:'set_transition',slide:selected,kind})),field('전환 시간 (초)',slide.transition?.duration||.5,duration=>edit({op:'set_transition',slide:selected,duration}),'number'),button('전환 미리보기',previewTransition))]]
];}
function staticSlide(slide,model,thumbnail=false){
 const stage=el('div',{class:'playback-slide',style:{position:'relative',overflow:'hidden',width:model.width+'px',height:model.height+'px',background:M.color(slide.background),backgroundImage:slideBackgroundPaint(slide,model),backgroundSize:'100% 100%'}});
 for(const shape of slide.shapes){
  const f=shape.frame,node=el('div',{'data-shape-id':shape.id,class:(thumbnail?'mini-shape':'slide-shape')+' kind-'+shape.kind,style:{left:f.x+'px',top:f.y+'px',width:f.w+'px',height:f.h+'px',transform:M.shapeTransform(shape),cursor:'default'}});
  slideShapeContent(node,shape,model,1);if(!thumbnail)HanXSlideMedia.attachMovie(node,shape,model,true,message=>hanx.reportError(message));stage.append(node);
 }
 return stage;
}
function playbackContext(model){return {...advancedContext(model),shapeID,run,stage:document.querySelector('.slide-stage'),renderSlide:staticSlide};}
function shapeFormatGroups(model,shape){
 const update=change=>edit({op:'update_shape',slide:selected,shapeId:shape.id,...change}),c=shape.paragraphs?.[0]?.markProps||{},toggle=(label,key,value)=>{const control=button(label,()=>update({[key]:!value}));control.setAttribute('aria-pressed',String(Boolean(value)));return control;};
 const groups=[ribbonGroup('채우기와 선',field('채우기',M.color(shape.fill),fill=>update({fill:fill.slice(1)}),'color'),button('채우기 없음',()=>update({fill:null})),field('선 색',M.color(shape.line,'#203247'),line=>update({line:line.slice(1)}),'color'),field('선 굵기 (pt)',shape.lineWidth||0,lineWidth=>update({lineWidth}),'number'),button('선 없음',()=>update({line:null}))),ribbonGroup('대칭과 비율',toggle('가로 세로 비율 고정','lockAspect',shape.lockAspect),toggle('좌우 대칭','flipH',shape.flipH),toggle('상하 대칭','flipV',shape.flipV))];
 if(shape.paragraphs?.length)groups.push(ribbonGroup('글꼴',field('글꼴',c.fontName||'맑은 고딕',font=>update({style:{font}}),'text','font-face'),field('글자 크기 (pt)',c.size||24,size=>update({style:{size}}),'number','font-size'),...[['굵게','bold'],['기울임','italic'],['밑줄','underline']].map(([label,key])=>{const active=Boolean(c[key]&&c[key]!=='none'),control=button(label,()=>update({style:{[key]:!active}}));control.setAttribute('aria-pressed',String(active));return control;}),field('글자 색',M.color(c.color,'#203247'),color=>update({style:{color:color.slice(1)}}),'color')));
 return groups;
}
function imageRestoreButton(shape){
 const original=imageOriginals.get(shape.imageID),control=button('원본 복원',()=>edit({op:'update_shape',slide:selected,shapeId:shape.id,imageID:original.id,...HanXCrop.restoredFrame(shape,original.region)}));
 control.disabled=!original||!state.model.images?.[original.id];control.title='이 파일을 연 뒤 편집한 그림의 원본을 복원합니다.';return control;
}
function rememberImageEdit(updatedID,sourceID,cropRegion){
 const previous=imageOriginals.get(sourceID);
 imageOriginals.set(updatedID,{id:previous?.id||sourceID,region:HanXCrop.composeRegion(previous?.region,cropRegion)});
}
function cropSlideImage(shape){return run(async()=>{
 if(shape.locked||shape.videoID||document.querySelector('dialog[open]'))return;
 const slideIndex=selected,revision=state.model,sourceID=shape.imageID;
 const current=()=>state.model===revision&&state.model.slides[slideIndex]?.shapes.some(s=>s.id===shape.id&&!s.locked&&s.imageID===sourceID);
 const src=M.imageSource(revision.images?.[sourceID]);if(!src)throw Error('그림을 읽을 수 없습니다.');
 const picture=new Image();picture.src=src;await picture.decode();if(!current())return;
 if(!picture.naturalWidth||!picture.naturalHeight||picture.naturalWidth*picture.naturalHeight>HanXImageTools.MAX_PIXELS)throw Error('그림은 1,600만 픽셀 이하만 편집할 수 있습니다.');
 HanXCrop.show({picture,shape,current,el,button,report:message=>hanx.reportError(message),commit:async(data,frame,region)=>{
  if(!current())throw Error('그림이 변경되었습니다. 다시 선택해 주세요.');
  const next=await hanx.edit([{op:'update_shape',slide:slideIndex,shapeId:shape.id,...frame,imageData:{name:'cropped.png',data}}]);
  const updated=next.model.slides[slideIndex].shapes.find(s=>s.id===shape.id);
  rememberImageEdit(updated.imageID,sourceID,region);
  state=next;render();$('status').textContent='그림을 잘랐습니다.';
 }});
});}
function adjustSlideImage(shape){return run(async()=>{
 const slideIndex=selected,sourceID=shape.imageID,revision=state.model,src=M.imageSource(revision.images?.[sourceID]);if(!src)throw Error('이 그림 형식은 조정을 지원하지 않습니다. PNG 또는 JPEG 그림을 사용하세요.');
 const picture=new Image();picture.src=src;await picture.decode();if(state.model!==revision)return;
 const width=picture.naturalWidth,height=picture.naturalHeight;if(!width||!height||width*height>HanXImageTools.MAX_PIXELS)throw Error('그림은 1,600만 픽셀 이하만 편집할 수 있습니다.');
 const scale=Math.min(1,600/Math.max(width,height)),pw=Math.max(1,Math.round(width*scale)),ph=Math.max(1,Math.round(height*scale));
 const preview=el('canvas',{width:pw,height:ph,style:{width:Math.min(600,400*pw/ph)+'px',maxWidth:'100%'},'aria-label':'그림 보정 미리보기'}),context=preview.getContext('2d',{willReadFrequently:true});context.drawImage(picture,0,0,pw,ph);const pixels=context.getImageData(0,0,pw,ph);
 const options={...HanXImageTools.adjustmentDefaults},dialog=el('dialog',{class:'image-dialog','aria-labelledby':'imageAdjustmentTitle'}),controls=el('div',{class:'image-adjustments'}),inputs=[];
 let frame=0,applying=false;
 const current=()=>dialog.open&&state.model===revision&&state.model.slides?.[slideIndex]?.shapes.find(item=>item.id===shape.id)?.imageID===sourceID;
 const changed=()=>Object.keys(options).some(key=>options[key]!==HanXImageTools.adjustmentDefaults[key]);
 const draw=()=>{frame=0;context.putImageData(new ImageData(HanXImageTools.adjustImage(pixels.data,pw,ph,options),pw,ph),0,0);apply.disabled=applying||!current()||!changed();};
 const schedule=()=>{apply.disabled=true;if(frame)cancelAnimationFrame(frame);frame=requestAnimationFrame(draw);};
 for(const [key,label,min,max] of [['opacity','투명도 (%)',0,100],['brightness','밝기',-100,100],['contrast','대비',-100,100],['saturation','채도 (%)',0,200],['skewX','가로 기울이기 (°)',-30,30],['skewY','세로 기울이기 (°)',-30,30],['perspectiveX','가로 원근 (%)',-75,75],['perspectiveY','세로 원근 (%)',-75,75]]){
  const display=()=>key==='opacity'?100-options[key]:options[key];
  const output=el('output',{text:String(display())}),input=el('input',{type:'range',min,max,step:1,value:display(),'aria-label':label});input.oninput=()=>{options[key]=key==='opacity'?100-Number(input.value):Number(input.value);output.textContent=input.value;schedule();};inputs.push(()=>{input.value=display();output.textContent=input.value;});controls.append(el('label',{},label,input,output));
 }
 const filter=el('select',{'aria-label':'필터'},...Object.entries({normal:'없음',grayscale:'흑백',sepia:'세피아',invert:'색 반전'}).map(([value,text])=>el('option',{value,text})));filter.onchange=()=>{options.filter=filter.value;schedule();};inputs.push(()=>{filter.value=options.filter;});controls.append(el('label',{},'필터',filter));
 const apply=button('적용',()=>{if(applying||frame||!current())return;applying=true;apply.disabled=true;run(async()=>{
  if(!current())throw Error('그림이 변경되었습니다. 창을 닫고 다시 선택하세요.');
  const canvas=el('canvas',{width,height}),ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(picture,0,0);const original=ctx.getImageData(0,0,width,height);ctx.putImageData(new ImageData(HanXImageTools.adjustImage(original.data,width,height,options),width,height),0,0);
  const data=canvas.toDataURL('image/png').split(',')[1];if(data.length>Math.ceil(16*1024*1024/3)*4)throw Error('처리한 그림이 16MB를 넘습니다. 더 작은 그림을 사용하세요.');
  const next=await hanx.edit([{op:'update_shape',slide:slideIndex,shapeId:shape.id,imageData:{name:'adjusted.png',data}}]);const updated=next.model.slides[slideIndex].shapes.find(item=>item.id===shape.id);rememberImageEdit(updated.imageID,sourceID);dialog.close();return next;
 },'그림을 조정했습니다.').finally(()=>{applying=false;if(dialog.open)draw();});},'primary');
 dialog.append(button('×',()=>dialog.close(),'dialog-close'),el('h2',{id:'imageAdjustmentTitle',text:'그림 보정'}),el('div',{class:'image-comparison'},preview),controls,el('div',{class:'dialog-actions'},button('초기화',()=>{Object.assign(options,HanXImageTools.adjustmentDefaults);inputs.forEach(reset=>reset());schedule();}),button('취소',()=>dialog.close()),apply));
 dialog.querySelector('.dialog-close').setAttribute('aria-label','닫기');dialog.addEventListener('close',()=>{if(frame)cancelAnimationFrame(frame);dialog.remove();},{once:true});document.body.append(dialog);dialog.showModal();draw();
});}
function removeImageBackground(shape,automatic=false){return run(async()=>{
 const slideIndex=selected,sourceID=shape.imageID,revision=state.model,src=M.imageSource(revision.images?.[sourceID]);if(!src)throw Error('이 그림 형식은 배경 제거를 지원하지 않습니다. PNG 또는 JPEG 그림을 사용하세요.');
 const picture=new Image();picture.src=src;await picture.decode();const width=picture.naturalWidth,height=picture.naturalHeight;
 if(state.model!==revision)return;
 if(!width||!height||width*height>HanXImageTools.MAX_PIXELS)throw Error('그림은 1,600만 픽셀 이하만 편집할 수 있습니다.');
 const previewStyle={width:Math.min(350,260*width/height)+'px'},source=el('canvas',{width,height,style:previewStyle,'aria-label':'원본 그림. 클릭하여 배경 색 선택'}),preview=el('canvas',{width,height,style:{...previewStyle,touchAction:'none'},'aria-label':'배경 제거 미리보기. 브러시로 보정'}),sourceContext=source.getContext('2d',{willReadFrequently:true}),context=preview.getContext('2d');
 sourceContext.drawImage(picture,0,0);const pixels=sourceContext.getImageData(0,0,width,height),dialog=el('dialog',{class:'image-dialog','aria-labelledby':'imageDialogTitle'}),output=el('output',{'aria-live':'polite'});
 const color=el('input',{type:'color','aria-label':'제거할 배경 색',value:'#'+HanXImageTools.edgeColor(pixels.data,width,height).map(v=>v.toString(16).padStart(2,'0')).join('')}),tolerance=el('input',{type:'range',min:0,max:100,step:1,value:12,'aria-label':'색상 허용 범위'}),amount=el('output',{text:'12'});
 const brush=el('select',{'aria-label':'보정 브러시'},el('option',{value:'none',text:'브러시 끄기'}),el('option',{value:'keep',text:'남길 부분'}),el('option',{value:'remove',text:'지울 부분'})),size=el('input',{type:'range',min:2,max:80,value:20,'aria-label':'브러시 크기'});
 const feather=el('input',{type:'range',min:0,max:20,value:0,'aria-label':'가장자리 부드럽게 (px)'}),featherAmount=el('output',{text:'0'}),hardness=el('input',{type:'range',min:0,max:100,value:100,'aria-label':'브러시 경도 (%)'}),hardnessAmount=el('output',{text:'100'});
 let frame=0,job=null,generation=0,mask=new Float32Array(width*height).fill(1),lastPoint=null,applying=false;
 const stop=()=>{generation++;if(job){job.cancel();job=null;}if(frame){cancelAnimationFrame(frame);frame=0;}};
 const current=()=>dialog.open&&state.model===revision&&state.model.slides?.[slideIndex]?.shapes.find(item=>item.id===shape.id)?.imageID===sourceID;
 const apply=button('적용',()=>{if(job||frame||applying||!current()){output.textContent='그림이 변경되었거나 분석 중입니다. 완료 후 다시 시도하세요.';return;}applying=true;apply.disabled=true;run(async()=>{
  if(!current())throw Error('그림이 변경되었습니다. 창을 닫고 다시 선택하세요.');
  const data=preview.toDataURL('image/png').split(',')[1];if(data.length>Math.ceil(16*1024*1024/3)*4)throw Error('처리한 그림이 16MB를 넘습니다. 더 작은 그림을 사용하세요.');
  const next=await hanx.edit([{op:'update_shape',slide:slideIndex,shapeId:shape.id,imageData:{name:'background-removed.png',data}}]);
  const updated=next.model.slides[slideIndex].shapes.find(item=>item.id===shape.id);rememberImageEdit(updated.imageID,sourceID);dialog.close();return next;
 },'배경을 제거했습니다.').finally(()=>{applying=false;if(dialog.open)draw();});},'primary');
 const draw=()=>{frame=0;if(!dialog.open)return;const result=HanXImageTools.applyMask(pixels.data,width,height,HanXImageTools.featherMask(mask,width,height,Number(feather.value)));context.putImageData(new ImageData(result,width,height),0,0);let removed=0;for(let i=3;i<result.length;i+=4)if(result[i]<pixels.data[i])removed++;apply.disabled=applying||Boolean(job)||!removed||!current();output.textContent=current()?(removed?`${removed.toLocaleString()}개 픽셀의 배경을 줄였습니다. 미리보기를 확인하세요.`:'남길 부분과 지울 부분을 브러시로 조절하세요.'):'그림이 변경되었습니다. 창을 닫고 다시 선택하세요.';};
 const update=()=>{frame=0;if(!current())return;const rgb=color.value.slice(1).match(/../g).map(v=>parseInt(v,16)),result=HanXImageTools.removeBackground(pixels.data,width,height,rgb,Number(tolerance.value));mask=Float32Array.from({length:width*height},(_,i)=>pixels.data[i*4+3]?result.data[i*4+3]/pixels.data[i*4+3]:0);draw();};
 const schedule=()=>{stop();apply.disabled=true;amount.textContent=tolerance.value;frame=requestAnimationFrame(update);};
 const analyze=async()=>{
  stop();brush.value='none';apply.disabled=true;output.textContent='이 기기에서 사진의 대상을 분석하고 있습니다…';const token=generation;
  const small=el('canvas',{width:320,height:320}),c=small.getContext('2d',{willReadFrequently:true});c.fillStyle='#fff';c.fillRect(0,0,320,320);c.drawImage(picture,0,0,320,320);
  try{job=HanXSubjectSegmentation.start(c.getImageData(0,0,320,320).data);const values=await job.promise;if(token!==generation||!current())return;
   job=null;const rgba=new Uint8ClampedArray(320*320*4);for(let i=0;i<values.length;i++){rgba[i*4]=rgba[i*4+1]=rgba[i*4+2]=Math.round(values[i]*255);rgba[i*4+3]=255;}c.putImageData(new ImageData(rgba,320,320),0,0);
   const expanded=el('canvas',{width,height}),ec=expanded.getContext('2d',{willReadFrequently:true});ec.drawImage(small,0,0,width,height);const p=ec.getImageData(0,0,width,height).data;mask=Float32Array.from({length:width*height},(_,i)=>p[i*4]/255);draw();
  }catch(error){if(token!==generation||!dialog.open)return;job=null;draw();if(error.name!=='AbortError')output.textContent='자동 분석을 완료하지 못했습니다. 브러시 또는 단색 배경 제거를 사용하세요. '+error.message;}
 };
 color.oninput=schedule;tolerance.oninput=schedule;source.onclick=event=>{if(applying)return;const rect=source.getBoundingClientRect(),x=Math.max(0,Math.min(width-1,Math.floor((event.clientX-rect.left)/rect.width*width))),y=Math.max(0,Math.min(height-1,Math.floor((event.clientY-rect.top)/rect.height*height))),i=(y*width+x)*4;if(!pixels.data[i+3])return;color.value='#'+[...pixels.data.slice(i,i+3)].map(v=>v.toString(16).padStart(2,'0')).join('');schedule();};
 brush.onchange=()=>{stop();draw();};feather.oninput=()=>{featherAmount.textContent=feather.value;draw();};hardness.oninput=()=>{hardnessAmount.textContent=hardness.value;};
 const point=event=>{const rect=preview.getBoundingClientRect();return {x:(event.clientX-rect.left)/rect.width*width,y:(event.clientY-rect.top)/rect.height*height};};
 const paint=event=>{if(!lastPoint||!current()||applying)return;const next=point(event);HanXImageTools.paintMask(mask,width,height,lastPoint,next,Number(size.value)/2/preview.getBoundingClientRect().width*width,brush.value==='keep'?1:0,Number(hardness.value)/100);lastPoint=next;draw();};
 preview.onpointerdown=event=>{if(brush.value==='none'||applying||!current()||event.button!==0)return;event.preventDefault();stop();lastPoint=point(event);preview.setPointerCapture(event.pointerId);paint(event);};preview.onpointermove=paint;preview.onpointerup=preview.onpointercancel=preview.onlostpointercapture=()=>{lastPoint=null;};
 dialog.append(button('×',()=>dialog.close(),'dialog-close'),el('h2',{id:'imageDialogTitle',text:'그림 배경 제거'}),el('p',{text:'자동 분석은 이 기기에서만 실행됩니다. 복잡한 배경이나 머리카락은 결과를 확인하고 남길 부분·지울 부분 브러시로 보정하세요. 원본을 클릭하면 가장자리와 이어진 단색 배경을 선택합니다.'}),el('div',{class:'dialog-actions'},button('대상 자동 선택',analyze),button('분석 취소',()=>{stop();draw();}),button('단색으로 다시 선택',schedule),button('마스크 초기화',()=>{stop();mask.fill(1);draw();})),el('div',{class:'image-comparison'},el('figure',{},el('figcaption',{text:'원본'}),source),el('figure',{},el('figcaption',{text:'미리보기'}),preview)),el('div',{class:'image-adjustments'},el('label',{},'배경 색',color),el('label',{},'색상 허용 범위',tolerance,amount),el('label',{},'보정',brush),el('label',{},'브러시 크기',size),el('label',{},'브러시 경도 (%)',hardness,hardnessAmount),el('label',{},'가장자리 부드럽게 (px)',feather,featherAmount)),output,el('div',{class:'dialog-actions'},button('취소',()=>dialog.close()),apply));
 dialog.querySelector('.dialog-close').setAttribute('aria-label','닫기');dialog.addEventListener('close',()=>{stop();dialog.remove();},{once:true});document.body.append(dialog);dialog.showModal();if(automatic){draw();analyze();}else update();
});}
function renderRibbon(){if(!state)return;const tabs=state.kind==='document'?documentRibbon(state.model):state.kind==='spreadsheet'?spreadsheetRibbon(state.model):presentationRibbon(state.model);if(ribbonKind!==state.kind||!tabs.some(([title])=>title===ribbonTab)){ribbonKind=state.kind;ribbonTab=tabs[0][0];}
 const selector=$('ribbonTabs');selector.replaceChildren(...tabs.map(([title],index)=>{const active=title===ribbonTab;return el('button',{id:`ribbon-tab-${index}`,role:'tab',text:title,'aria-selected':String(active),'aria-controls':'tools',tabindex:active?'0':'-1',onclick:()=>{ribbonTab=title;renderRibbon();$('ribbonTabs').children[index].focus();},onkeydown:event=>{let next=index;if(event.key==='ArrowRight')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();ribbonTab=tabs[next][0];renderRibbon();$('ribbonTabs').children[next].focus();}});}));
 const active=tabs.find(([title])=>title===ribbonTab);$('tools').replaceChildren(...active[1]());$('tools').setAttribute('aria-labelledby',`ribbon-tab-${tabs.indexOf(active)}`);
}

const actions={open:()=>run(async()=>{const next=await hanx.open();if(next?.model){imageOriginals.clear();shapeID=null;selected=0;}return next;},'파일을 열었습니다.'),save:()=>run(()=>hanx.save(false),'저장했습니다.'),saveAs:()=>run(()=>hanx.save(true),'저장했습니다.'),undo:()=>run(()=>hanx.undo(false),'실행을 취소했습니다.'),redo:()=>run(()=>hanx.undo(true),'다시 실행했습니다.')};for(const [name,action] of Object.entries(actions))$(name).onclick=()=>{document.activeElement?.blur();setTimeout(action,0);};$('new').onclick=()=>run(async()=>{selected=0;shapeID=null;cell='A1';cellRange='A1';docBlock=0;const next=await hanx.newFile($('newKind').value);if(next?.model)imageOriginals.clear();return next;});hanx.onAction(action=>{if(['cut','copy','paste'].includes(action)){const index=thumbnailIndex(document.activeElement,action);if(index!==null&&!document.querySelector('dialog[open]'))thumbnailAction(action,index);else hanx.clipboard(action);return;}if(document.querySelector('dialog[open]'))return;document.activeElement?.blur();setTimeout(()=>actions[action]?.(),0);});
$('help').onclick=()=>run(()=>hanx.help(state?.kind||'document'));
$('connections').onclick=async()=>{try{const info=await hanx.connections();$('enginePath').value=info.engine;$('mcpCommand').value=JSON.stringify(info.engine)+' mcp';$('connectionDialog').showModal();}catch(error){if(!String(error?.message||error).includes('[hanx-notified]'))await hanx.reportError(String(error?.message||error)).catch(()=>{});$('status').textContent='준비됨';}};
document.addEventListener('click',e=>{if(!e.target.closest('#contextMenu'))$('contextMenu').hidden=true;else $('contextMenu').hidden=true;});
document.addEventListener('keydown',e=>{if(e.defaultPrevented||document.querySelector('dialog[open]'))return;if(e.key==='Escape'){$('contextMenu').hidden=true;return;}if(state?.kind!=='presentation')return;
 const mod=e.ctrlKey||e.metaKey,key=e.key.toLowerCase();
 const action=mod&&!e.shiftKey&&!e.altKey?({c:'copy',x:'cut',v:'paste',d:'duplicate'})[key]:!mod&&(key==='delete'||key==='backspace')?'delete':null;
 const index=thumbnailIndex(e.target,action);
 if(index!==null){if(action){e.preventDefault();thumbnailAction(action,index);}
  else if(!mod&&!e.altKey&&['ArrowUp','ArrowDown','Home','End'].includes(e.key)){e.preventDefault();const last=state.model.slides.length-1;if(last>=0){changeSelection(e.key==='Home'?0:e.key==='End'?last:Math.max(0,Math.min(last,index+(e.key==='ArrowDown'?1:-1))));focusThumbnail();}}
  else if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){e.preventDefault();const rect=e.target.getBoundingClientRect();slideMenu({clientX:rect.left,clientY:rect.top},index);$('contextMenu').querySelector('button')?.focus();}
  return;}
 if(shapeID===null||e.target.closest('input,textarea,select,button,[contenteditable="true"]'))return;
 if(mod&&key==='d'){e.preventDefault();shapeBatch('duplicate_shape');}
 else if(key==='delete'||key==='backspace'){e.preventDefault();shapeBatch('delete_shape');}
 else if(e.key.startsWith('Arrow')&&shapeID!==null){const shape=state.model.slides[selected]?.shapes.find(s=>s.id===shapeID);if(!shape)return;e.preventDefault();const step=e.shiftKey?10:1;edit(...selectedShapes().map(s=>({op:'update_shape',slide:selected,shapeId:s.id,x:s.frame.x+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0),y:s.frame.y+(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0)})));}});
hanx.onOpened(next=>run(()=>{selected=0;shapeID=null;selectedShapeIDs.clear();docBlock=0;cell='A1';cellRange='A1';imageOriginals.clear();return next;}));
run(()=>hanx.initial(),'준비됨');
