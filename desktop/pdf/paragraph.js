(function(root){
 'use strict';
 // Groups horizontal PDF text objects into visual lines and paragraphs using the
 // text matrix (origin = baseline start) reported by inspect. Pure functions.
 function horizontal(o){const m=o&&o.matrix;return o.type==='text'&&!o.searchText&&typeof o.text==='string'&&o.text.trim()!==''&&Array.isArray(m)&&m.length===6&&Math.abs(m[1])<1e-6&&Math.abs(m[2])<1e-6&&m[0]>0&&m[3]>0;}
 function size(o){return Math.max(1,(o.size||12)*o.matrix[3]);}
 function lines(objects){
  const items=objects.filter(horizontal).sort((a,b)=>b.matrix[5]-a.matrix[5]||a.matrix[4]-b.matrix[4]);
  const rows=[];
  for(const o of items){const row=rows.at(-1);if(row&&Math.abs(row.baseline-o.matrix[5])<=size(o)*.3)row.items.push(o);else rows.push({baseline:o.matrix[5],items:[o]});}
  const result=[];
  for(const row of rows){
   row.items.sort((a,b)=>a.matrix[4]-b.matrix[4]);let line=null;
   // Text in separate columns can share a baseline; a wide gap starts a new line.
   for(const o of row.items){if(line&&o.bounds[0]-line.right>Math.max(line.size,size(o))*3)line=null;if(!line){line={baseline:row.baseline,items:[],left:o.matrix[4],right:o.bounds[2],size:size(o)};result.push(line);}line.items.push(o);line.right=Math.max(line.right,o.bounds[2]);line.size=Math.max(line.size,size(o));}
  }
  return result;
 }
 function continues(upper,lower){const gap=upper.baseline-lower.baseline,s=Math.max(upper.size,lower.size);return gap>0&&gap<=s*2.2&&Math.abs(upper.size-lower.size)<=s*.15&&Math.abs(upper.left-lower.left)<=s*2.5&&Math.min(upper.right,lower.right)>Math.max(upper.left,lower.left);}
 function collect(objects,id){
  const all=lines(objects),start=all.find(l=>l.items.some(o=>o.id===id));if(!start)return [];
  const chain=[start];
  for(const direction of [-1,1]){let current=start;for(;;){const next=all.filter(l=>!chain.includes(l)&&(direction>0?continues(current,l):continues(l,current))).sort((a,b)=>direction>0?b.baseline-a.baseline:a.baseline-b.baseline)[0];if(!next)break;direction>0?chain.push(next):chain.unshift(next);current=next;}}
  return chain.flatMap(l=>l.items.map(o=>o.id));
 }
 function text(objects,ids){
  const chosen=objects.filter(o=>ids.includes(o.id));
  if(!chosen.length||!chosen.every(horizontal))return null;
  const rows=lines(chosen).sort((a,b)=>b.baseline-a.baseline||a.left-b.left);
  const width=Math.max(...rows.map(l=>l.right-l.left));
  return rows.map((line,i)=>{
   let value='';let right=null;
   for(const o of line.items){if(right!==null&&o.bounds[0]-right>size(o)*.2&&!/\s$/.test(value)&&!/^\s/.test(o.text))value+=' ';value+=o.text;right=o.bounds[2];}
   value=value.replace(/\s+$/,'');
   // A visibly short line ends its sentence block: keep that break explicitly.
   const separator=i===rows.length-1?'':line.right-line.left<width*.8?'\n':' ';
   return value+separator;
  }).join('');
 }
 const api={lines,collect,text,horizontal};if(typeof module==='object'&&module.exports)module.exports=api;else root.PDFParagraph=api;
})(typeof globalThis==='object'?globalThis:this);
