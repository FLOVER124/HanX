(function(root){
 'use strict';
 function viewDelta(dx,dy,rotation=0){switch(rotation){case 90:return [dy,dx];case 180:return [-dx,dy];case 270:return [-dy,-dx];default:return [dx,-dy];}}
 function resize({rect,rotation=0},handle,dx,dy,lock=false){
  if(!Array.isArray(rect)||rect.length!==4||!rect.every(Number.isFinite)||![dx,dy].every(Number.isFinite)||!['n','ne','e','se','s','sw','w','nw'].includes(handle))throw Error('잘못된 크기 조절입니다.');
  const [l,t,r,b]=rect,w=r-l,h=b-t;if(w<=0||h<=0)throw Error('크기가 없는 개체입니다.');
  const horizontal=handle.includes('w')?-1:handle.includes('e')?1:0,vertical=handle.includes('n')?-1:handle.includes('s')?1:0;
  let nw=Math.max(w*.01,Math.min(w*100,w+horizontal*dx)),nh=Math.max(h*.01,Math.min(h*100,h+vertical*dy));
  if(lock){const scale=horizontal&&vertical?(Math.abs(nw/w-1)>=Math.abs(nh/h-1)?nw/w:nh/h):horizontal?nw/w:nh/h;nw=w*scale;nh=h*scale;}
  const x=horizontal<0?r-nw:horizontal>0?l:(l+r-nw)/2,y=vertical<0?b-nh:vertical>0?t:(t+b-nh)/2;
  const [px,py]=viewDelta(x+nw/2-(l+r)/2,y+nh/2-(t+b)/2,rotation);
  return {rect:[x,y,x+nw,y+nh],scaleX:rotation%180?nh/h:nw/w,scaleY:rotation%180?nw/w:nh/h,dx:px,dy:py};
 }
 const api={viewDelta,resize};if(typeof module==='object'&&module.exports)module.exports=api;else root.PDFGeometry=api;
})(typeof globalThis==='object'?globalThis:this);
