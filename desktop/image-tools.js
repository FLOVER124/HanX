(function(root){
 'use strict';
 const MAX_PIXELS=16000000;
 function validate(data,width,height){if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>MAX_PIXELS||data.length!==width*height*4)throw Error('그림은 1,600만 픽셀 이하만 편집할 수 있습니다.');}
 // The most frequent quantized edge color is a useful default, not a subject detector.
 function edgeColor(data,width,height){
  validate(data,width,height);const bins=new Map();
  const sample=i=>{const p=i*4;if(data[p+3]<128)return;const rgb=[data[p],data[p+1],data[p+2]],key=rgb.map(v=>v>>4).join(',');const bin=bins.get(key)||{count:0,sum:[0,0,0]};bin.count++;rgb.forEach((v,n)=>bin.sum[n]+=v);bins.set(key,bin);};
  for(let x=0;x<width;x++){sample(x);if(height>1)sample((height-1)*width+x);}for(let y=1;y<height-1;y++){sample(y*width);if(width>1)sample(y*width+width-1);}
  const bin=[...bins.values()].sort((a,b)=>b.count-a.count)[0];return bin?bin.sum.map(v=>Math.round(v/bin.count)):[255,255,255];
 }
 function removeBackground(data,width,height,color,tolerance=12){
  validate(data,width,height);if(!Array.isArray(color)||color.length!==3||color.some(v=>!Number.isFinite(v)||v<0||v>255)||!Number.isFinite(tolerance)||tolerance<0||tolerance>100)throw Error('배경 색과 허용 범위를 확인하세요.');
  const output=new Uint8ClampedArray(data),count=width*height,seen=new Uint8Array(count),queue=new Uint32Array(count),limit=3*(tolerance/100*255)**2;let head=0,tail=0,removed=0;
  const visit=i=>{if(seen[i])return;seen[i]=1;const p=i*4,match=data[p+3]===0||(data[p]-color[0])**2+(data[p+1]-color[1])**2+(data[p+2]-color[2])**2<=limit;if(match){queue[tail++]=i;if(output[p+3])removed++;output[p+3]=0;}};
  for(let x=0;x<width;x++){visit(x);visit((height-1)*width+x);}for(let y=1;y<height-1;y++){visit(y*width);visit(y*width+width-1);}
  while(head<tail){const i=queue[head++],x=i%width;if(x)visit(i-1);if(x<width-1)visit(i+1);if(i>=width)visit(i-width);if(i<count-width)visit(i+width);}
  return {data:output,removed};
 }
 function applyMask(data,width,height,mask){
  validate(data,width,height);if(mask.length!==width*height)throw Error('잘못된 마스크 크기입니다.');
  const result=new Uint8ClampedArray(data);for(let i=0;i<mask.length;i++){if(!Number.isFinite(mask[i]))throw Error('잘못된 마스크입니다.');result[i*4+3]=Math.round(data[i*4+3]*Math.max(0,Math.min(1,mask[i])));}return result;
 }
 function paintMask(mask,width,height,start,end,radius,value){
  if(mask.length!==width*height||![start.x,start.y,end.x,end.y,radius,value].every(Number.isFinite)||radius<=0||radius>Math.max(width,height)*2||![0,1].includes(value))throw Error('잘못된 브러시입니다.');
  const dx=end.x-start.x,dy=end.y-start.y,length=dx*dx+dy*dy;
  for(let y=Math.max(0,Math.floor(Math.min(start.y,end.y)-radius));y<=Math.min(height-1,Math.ceil(Math.max(start.y,end.y)+radius));y++)for(let x=Math.max(0,Math.floor(Math.min(start.x,end.x)-radius));x<=Math.min(width-1,Math.ceil(Math.max(start.x,end.x)+radius));x++){
   const t=length?Math.max(0,Math.min(1,((x-start.x)*dx+(y-start.y)*dy)/length)):0;
   if((x-start.x-t*dx)**2+(y-start.y-t*dy)**2<=radius*radius)mask[y*width+x]=value;
  }
 }
 function subjectTensor(rgba){
  const n=320*320;if(rgba.length!==n*4)throw Error('잘못된 모델 입력 크기입니다.');
  const result=new Float32Array(n*3),mean=[0.485,0.456,0.406],std=[0.229,0.224,0.225];let max=0;
  for(let i=0;i<n;i++)for(let c=0;c<3;c++)max=Math.max(max,rgba[4*i+c]);max=max||255;
  for(let i=0;i<n;i++)for(let c=0;c<3;c++)result[c*n+i]=(rgba[4*i+c]/max-mean[c])/std[c];return result;
 }
 function normalizeMask(values){
  let min=Infinity,max=-Infinity;for(const v of values){if(!Number.isFinite(v))throw Error('인물 분석 결과가 올바르지 않습니다.');min=Math.min(min,v);max=Math.max(max,v);}
  return Float32Array.from(values,v=>max>min?(v-min)/(max-min):0);
 }
 const api={MAX_PIXELS,edgeColor,removeBackground,applyMask,paintMask,subjectTensor,normalizeMask};if(typeof module!=='undefined')module.exports=api;else root.HanXImageTools=api;
})(typeof window!=='undefined'?window:globalThis);
