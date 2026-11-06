(function(root){
 'use strict';
 // Pure helpers for annotations and form fields in the shared PDF editor.
 const kinds={note:'메모',highlight:'형광펜',underline:'밑줄',strikeout:'취소선',squiggly:'물결 밑줄',square:'사각형',circle:'원',link:'링크',freetext:'글상자',stamp:'스탬프',ink:'펜',line:'선',polygon:'다각형',polyline:'꺾은선',attachment:'첨부 파일',caret:'삽입 표시',redact:'가림 표시'};
 const fields={text:'입력란',checkbox:'체크박스',radio:'라디오 버튼',combobox:'선택 목록',listbox:'목록',signature:'서명',button:'버튼'};
 function label(a){if(a.type==='widget'){const f=a.field||{};return (fields[f.type]||'양식 필드')+(f.label||f.name?' · '+(f.label||f.name):'');}const base=kinds[a.type]||'주석';const text=(a.contents||a.uri||'').replace(/\s+/g,' ').trim();return text?base+' · '+(text.length>40?text.slice(0,40)+'…':text):base;}
 // Fields the user can fill and annotations HanX can restyle are interactive on the page.
 function interactive(a){return !a.hidden&&(a.type==='widget'&&a.field&&!['signature','button','unknown'].includes(a.field.type)||a.type==='note');}
 function markupRects(objects){return objects.filter(o=>['text','outline'].includes(o.type)).map(o=>o.bounds.map(v=>Math.round(v*100)/100));}
 // Unrotated page size (PDF points) from the displayed size and rotation.
 function pageBox(width,height,rotation){return rotation%180?[height,width]:[width,height];}
 function noteRect(selectionBounds,width,height,rotation){const [w,h]=pageBox(width,height,rotation);if(selectionBounds){const [,,r,t]=selectionBounds;const x=Math.min(Math.max(0,r+4),w-20),y=Math.min(Math.max(20,t),h);return [x,y-20,x+20,y];}return [w/2-10,h/2-10,w/2+10,h/2+10];}
 function fieldOperation(a,value){const f=a.field;if(!f||f.readOnly)throw Error('읽기 전용 양식 필드입니다.');const op={op:'set_field',annotation:a.id};
  if(f.type==='checkbox'||f.type==='radio')op.checked=value===true;else if(f.type==='listbox')op.values=Array.isArray(value)?value:[value];else if(['text','combobox'].includes(f.type))op.value=String(value);else throw Error('이 양식 필드는 값을 바꿀 수 없습니다.');return op;}
 const api={label,interactive,markupRects,noteRect,pageBox,fieldOperation,kinds,fields};if(typeof module==='object'&&module.exports)module.exports=api;else root.PDFAnnotations=api;
})(typeof globalThis==='object'?globalThis:this);
