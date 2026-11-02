(function(root){
 'use strict';
 function dimensions(rows,columns){const r=Number(rows),c=Number(columns);if(!Number.isInteger(r)||!Number.isInteger(c)||r<1||c<1||r>100||c>50||r*c>2000)throw Error('행은 1–100, 열은 1–50 범위로 입력하세요. 표는 2,000셀 이하여야 합니다.');return [r,c];}
 function specification(rows,columns,width,height){const [r,c]=dimensions(rows,columns),w=Math.min(width*.8,c*100),h=Math.min(height*.7,r*32);return {kind:'table',x:(width-w)/2,y:(height-h)/2,width:w,height:h,table:{rows:Array.from({length:r},()=>Array(c).fill('')),columnWidths:Array(c).fill(w/c)}};}
 function insert(ctx){const {el,button,model,selected,edit}=ctx,dialog=el('dialog',{'aria-label':'표 넣기',class:'table-insert-dialog'}),rows=el('input',{type:'number',value:3,min:1,max:100,'aria-label':'행 수'}),columns=el('input',{type:'number',value:3,min:1,max:50,'aria-label':'열 수'});const close=()=>{dialog.close();dialog.remove();};
  const apply=button('삽입',()=>{try{const value=specification(rows.value,columns.value,model.width,model.height);rows.setCustomValidity('');close();edit({op:'add_shape',slide:selected,value});}catch(error){rows.setCustomValidity(error.message);rows.reportValidity();}});
  dialog.append(el('h2',{text:'표 넣기'}),el('label',{},'행 수',rows),el('label',{},'열 수',columns),el('div',{class:'dialog-actions'},button('취소',close),apply));dialog.addEventListener('cancel',event=>{event.preventDefault();close();});root.document.body.append(dialog);dialog.showModal();rows.focus();
 }
 function attach(tableNode,table,{slide,shapeId,edit,paragraphText,cellEditable}){
  const positions=[];table.rows.forEach((row,r)=>row.forEach((cell,c)=>{if(!cell.isMergedAway)positions.push({row:r,column:c,cell});}));
  const cells=Array.from(tableNode.rows).flatMap(row=>Array.from(row.cells));cells.forEach((td,index)=>{const pos=positions[index];if(!pos)return;if(!cellEditable(pos.cell)){td.setAttribute('aria-readonly','true');return;}td.tabIndex=0;td.setAttribute('aria-label',`표 ${pos.row+1}행 ${pos.column+1}열`);
   function begin(){if(td.querySelector('textarea'))return;const text=pos.cell.blocks.map(b=>paragraphText(b.paragraph._0)).join('\n'),editor=root.document.createElement('textarea');editor.value=text;editor.setAttribute('aria-label',td.getAttribute('aria-label'));editor.style.cssText='width:100%;height:100%;min-height:2em;box-sizing:border-box;';let finished=false;const original=Array.from(td.childNodes);
    function finish(cancel){if(finished)return;finished=true;const value=editor.value;td.replaceChildren(...original);if(!cancel&&value!==text)edit({op:'set_table_cell',slide,shapeId,row:pos.row,column:pos.column,text:value});}
    editor.onblur=()=>finish(false);editor.onkeydown=event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();finish(true);td.focus();}else if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();finish(false);td.focus();}};editor.onpointerdown=event=>event.stopPropagation();td.replaceChildren(editor);editor.focus();
   }
   td.ondblclick=event=>{event.stopPropagation();begin();};td.onkeydown=event=>{if(event.target!==td)return;if(event.key==='Enter'||event.key==='F2'){event.preventDefault();event.stopPropagation();begin();}};
  });return tableNode;
 }
 const api={dimensions,specification,insert,attach};if(typeof module!=='undefined')module.exports=api;else root.HanXTables=api;
})(typeof window!=='undefined'?window:globalThis);
