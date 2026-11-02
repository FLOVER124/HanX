/* Local-only worker. Closing/cancelling the dialog terminates inference and its WASM heap. */
'use strict';
importScripts('image-tools.js','assets/segmentation/ort.wasm.min.js');
ort.env.wasm.numThreads=1;
ort.env.wasm.proxy=false;
ort.env.wasm.wasmPaths=new URL('assets/segmentation/',self.location.href).href;
self.onmessage=async({data})=>{
 let session;
 try{
  const bytes=await (await fetch(new URL('assets/segmentation/u2netp.onnx',self.location.href))).arrayBuffer();
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
  if(digest!=='309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8')throw Error('분석 모델 파일이 손상되었습니다.');
  session=await ort.InferenceSession.create(bytes,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
  const input=new ort.Tensor('float32',HanXImageTools.subjectTensor(data.rgba),[1,3,320,320]);
  const result=await session.run({[session.inputNames[0]]:input});
  const mask=HanXImageTools.normalizeMask(result[session.outputNames[0]].data);
  self.postMessage({mask},[mask.buffer]);
 }catch(error){self.postMessage({error:String(error.message||error)});}
 finally{if(session)await session.release();}
};
