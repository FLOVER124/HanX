(function(root){
 'use strict';
 // Page commands for the shared PDF editor. Each command is one atomic engine
 // batch; `page` is the page shown after the edit so the view follows the user.
 function check(index,count){if(!Number.isInteger(count)||count<1||!Number.isInteger(index)||index<0||index>=count)throw Error('잘못된 페이지입니다.');}
 // Final index for a page dropped before (or after) `target` in the thumbnail list.
 function moveTarget(from,target,after,count){check(from,count);check(target,count);const insertion=target+(after?1:0);return insertion-(from<insertion?1:0);}
 function move(from,to,current,count){check(from,count);check(to,count);if(from===to)return null;const page=current===from?to:current>from&&current<=to?current-1:current<from&&current>=to?current+1:current;return {operations:[{op:'move_page',page:from,to}],page};}
 function commands(index,count){
  check(index,count);
  const list=[
   {id:'rotatePageLeft',label:'왼쪽으로 90° 회전',operations:[{op:'rotate_page',page:index,rotation:-90}],page:index},
   {id:'rotatePageRight',label:'오른쪽으로 90° 회전',operations:[{op:'rotate_page',page:index,rotation:90}],page:index},
   {id:'duplicatePage',label:'페이지 복제',operations:[{op:'duplicate_page',page:index}],page:index+1},
   {id:'insertBefore',label:'앞에 빈 페이지 삽입',operations:[{op:'insert_blank_page',at:index}],page:index},
   {id:'insertAfter',label:'뒤에 빈 페이지 삽입',operations:[{op:'insert_blank_page',at:index+1}],page:index+1},
   {id:'importPages',label:'다른 PDF 페이지 뒤에 삽입…',import:index+1}
  ];
  if(index>0)list.push({id:'movePageUp',label:'앞으로 이동',...move(index,index-1,index,count)});
  if(index<count-1)list.push({id:'movePageDown',label:'뒤로 이동',...move(index,index+1,index,count)});
  if(count>1)list.push({id:'deletePage',label:'페이지 삭제',operations:[{op:'delete_page',page:index}],page:Math.min(index,count-2),danger:true});
  return list;
 }
 const api={moveTarget,move,commands};if(typeof module==='object'&&module.exports)module.exports=api;else root.PDFPages=api;
})(typeof globalThis==='object'?globalThis:this);
