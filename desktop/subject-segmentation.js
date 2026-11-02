(function(root){
 'use strict';
 function start(rgba,{timeout=120000}={}){
  const worker=new Worker(new URL('segmentation-worker.js',document.baseURI));let settled=false,rejectPromise,timer;
  const finish=()=>{settled=true;clearTimeout(timer);worker.terminate();};
  const promise=new Promise((resolve,reject)=>{
   rejectPromise=reject;worker.onmessage=({data})=>{if(settled)return;finish();data.error?reject(Error(data.error)):resolve(data.mask);};
   worker.onerror=()=>{if(settled)return;finish();reject(Error('사진 분석을 시작하지 못했습니다. 다시 시도하거나 브러시로 직접 수정하세요.'));};
   timer=setTimeout(()=>{if(settled)return;finish();reject(Error('사진 분석 시간이 초과되었습니다. 더 작은 사진을 사용하거나 브러시로 수정하세요.'));},timeout);
   worker.postMessage({rgba},[rgba.buffer]);
  });
  return {promise,cancel(){if(settled)return;finish();rejectPromise(new DOMException('취소됨','AbortError'));}};
 }
 root.HanXSubjectSegmentation={start};
})(globalThis);
