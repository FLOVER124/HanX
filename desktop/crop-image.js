(function(root){
 'use strict';
 const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
 // Source pixel coordinates are top-left based; right and bottom are exclusive.
 function selection(start,end,width,height){
  const edge=(a,b,size)=>[
   clamp(Math.round(Math.min(a,b)),0,size),
   clamp(Math.round(Math.max(a,b)),0,size)
  ];
  const [x,right]=edge(start.x,end.x,width),[y,bottom]=edge(start.y,end.y,height);
  return {x,y,w:right-x,h:bottom-y};
 }
 function croppedFrame(shape,crop,width,height){
  const f=shape.frame, w=f.w*crop.w/width,h=f.h*crop.h/height;
  const dx=((crop.x+crop.w/2)/width-.5)*f.w*(shape.flipH?-1:1);
  const dy=((crop.y+crop.h/2)/height-.5)*f.h*(shape.flipV?-1:1);
  const radians=(shape.rotation||0)*Math.PI/180;
  const c=Math.cos(radians),s=Math.sin(radians);
  return {x:f.x+f.w/2+c*dx-s*dy-w/2,y:f.y+f.h/2+s*dx+c*dy-h/2,width:w,height:h};
 }
 // A relative region composes across repeated edits and follows subsequent moves/rotations.
 function composeRegion(region,child){
  if(!region)return child;if(!child)return region;
  return {x:region.x+region.w*child.x,y:region.y+region.h*child.y,w:region.w*child.w,h:region.h*child.h};
 }
 function restoredFrame(shape,region){
  if(!region)return {};
  return croppedFrame(shape,{x:-region.x/region.w,y:-region.y/region.h,w:1/region.w,h:1/region.h},1,1);
 }
 function show({picture,current,shape,el,button,commit,report}){
  const width=picture.naturalWidth,height=picture.naturalHeight;
  const scale=Math.min(700/width,420/height);
  const preview=el('canvas',{width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale)),
   'aria-label':'유지할 영역을 드래그하세요',style:{maxWidth:'100%',height:'auto',display:'block',margin:'auto',touchAction:'none',cursor:'crosshair'}});
  const dialog=el('dialog',{class:'image-dialog','aria-labelledby':'crop-title'});
  const context=preview.getContext('2d');
  let crop={x:0,y:0,w:width,h:height},start=null,applying=false;
  const fields={},limits={x:width-1,y:height-1,w:width,h:height};
  const valid=()=>Object.values(crop).every(Number.isInteger)&&crop.x>=0&&crop.y>=0&&crop.w>0&&crop.h>0&&crop.x+crop.w<=width&&crop.y+crop.h<=height;
  function draw(){
   context.clearRect(0,0,preview.width,preview.height);
   context.drawImage(picture,0,0,preview.width,preview.height);
   context.fillStyle='rgba(0,0,0,.55)';context.fillRect(0,0,preview.width,preview.height);
   if(valid()){
    const x=crop.x*preview.width/width,y=crop.y*preview.height/height;
    const w=crop.w*preview.width/width,h=crop.h*preview.height/height;
    context.clearRect(x,y,w,h);context.drawImage(picture,crop.x,crop.y,crop.w,crop.h,x,y,w,h);
    context.strokeStyle='#246bfb';context.lineWidth=2;context.strokeRect(x,y,w,h);
   }
   apply.disabled=applying||!valid()||!current()||(crop.w===width&&crop.h===height);
  }
  function refresh(){for(const key of Object.keys(fields))fields[key].value=crop[key];draw();}
  function point(event){
   const rect=preview.getBoundingClientRect();
   return {x:(event.clientX-rect.left)/rect.width*width,y:(event.clientY-rect.top)/rect.height*height};
  }
  preview.onpointerdown=event=>{
   if(applying||event.button!==0)return;
   start=point(event);preview.setPointerCapture(event.pointerId);
  };
  preview.onpointermove=event=>{if(start){crop=selection(start,point(event),width,height);refresh();}};
  preview.onpointerup=event=>{if(start){crop=selection(start,point(event),width,height);refresh();start=null;}};
  preview.onpointercancel=preview.onlostpointercapture=()=>{start=null;};
  const controls=el('div',{class:'image-adjustments'});
  for(const [key,label] of Object.entries({x:'왼쪽',y:'위쪽',w:'너비',h:'높이'})){
   const input=el('input',{type:'number',min:key==='w'||key==='h'?1:0,max:limits[key],step:1,'aria-label':label+' (px)'});
   input.oninput=()=>{crop[key]=input.valueAsNumber;draw();};fields[key]=input;controls.append(el('label',{},label+' (px)',input));
  }
  const apply=button('적용',async()=>{
   if(applying||!current()||!valid())return;
   applying=true;apply.disabled=true;
   try{
    const canvas=el('canvas',{width:crop.w,height:crop.h});
    canvas.getContext('2d').drawImage(picture,crop.x,crop.y,crop.w,crop.h,0,0,crop.w,crop.h);
    const data=canvas.toDataURL('image/png').split(',')[1];
    if(!data||data.length>Math.ceil(16*1024*1024/3)*4)throw Error('처리한 그림이 16MB를 넘습니다.');
    await commit(data,croppedFrame(shape,crop,width,height),{x:crop.x/width,y:crop.y/height,w:crop.w/width,h:crop.h/height});dialog.close();
   }catch(error){if(!String(error.message).includes('[hanx-notified]'))await report(error.message);}
   finally{applying=false;if(dialog.open)draw();}
  },'primary');
  dialog.append(el('h2',{id:'crop-title',text:'그림 자르기'}),el('p',{text:'남길 영역을 드래그하거나 픽셀 단위로 입력하세요.'}),preview,controls,
   el('div',{class:'dialog-actions'},button('초기화',()=>{crop={x:0,y:0,w:width,h:height};refresh();}),button('취소',()=>{if(!applying)dialog.close();}),apply));
  dialog.addEventListener('cancel',event=>{if(applying)event.preventDefault();});
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  document.body.append(dialog);dialog.showModal();refresh();
 }
 const api={selection,croppedFrame,composeRegion,restoredFrame,show};
 if(typeof module!=='undefined')module.exports=api;else root.HanXCrop=api;
})(typeof window!=='undefined'?window:globalThis);
