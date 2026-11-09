(function (root) {
  'use strict';
  const maxBytes = 16 * 1024 * 1024;
  const imageLimit = 128 * 1024 * 1024;
  // Formats Chromium decodes. HEIC and TIFF are not available in the portable app.
  const imageExtensions = ['png','jpg','jpeg','webp','avif','gif','bmp','svg','ico'];
  const unreadable = '그림을 읽을 수 없습니다. PNG, JPEG, WebP, AVIF, GIF, BMP, SVG 형식을 사용하세요.';
  // Raster images keep their size up to 16 million pixels; vectors are drawn at 2048 px.
  function fitImage(width,height,vector) {
    const scale = vector ? Math.min(2048/Math.max(width,height),Math.sqrt(16e6/(width*height))) : Math.min(1,Math.sqrt(16e6/(width*height)));
    return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
  }
  async function rasterize(file) {
    if (!file.size || file.size>imageLimit) throw Error(file.name+': 그림 파일은 128 MiB 이하만 넣을 수 있습니다.');
    const vector = ext(file.name)==='svg' || file.type==='image/svg+xml';
    const image = new Image(); image.src = await asURL(file);
    try { await image.decode(); } catch { throw Error(file.name+': '+unreadable); }
    let {width,height} = fitImage(image.naturalWidth||300,image.naturalHeight||150,vector);
    for (let attempt=0; attempt<10; attempt++) {
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      canvas.getContext('2d').drawImage(image,0,0,width,height);
      const data=canvas.toDataURL('image/png').split(',')[1];
      if (data.length<=Math.ceil(maxBytes/3)*4) return {data,width,height};
      width=Math.max(1,Math.round(width*.8));height=Math.max(1,Math.round(height*.8));
    }
    throw Error(file.name+': 그림을 16 MiB 이하로 줄이지 못했습니다.');
  }
  const videoTypes = {mp4:'video/mp4',m4v:'video/mp4',mov:'video/quicktime',webm:'video/webm'};
  function ext(name) { return name.split('.').at(-1).toLowerCase(); }
  function asURL(blob) {
    return new Promise((resolve,reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(Error('파일을 읽을 수 없습니다.'));
      reader.readAsDataURL(blob);
    });
  }
  function place(model,width,height,point) {
    const scale = Math.min(1,model.width * .65 / width,model.height * .65 / height);
    width *= scale; height *= scale;
    const x = Math.max(0,Math.min(model.width-width,(point?.x ?? model.width/2)-width/2));
    const y = Math.max(0,Math.min(model.height-height,(point?.y ?? model.height/2)-height/2));
    return {x,y,width,height};
  }
  async function prepare(file,model,point) {
    const extension = ext(file.name);
    const shape = {kind:'image',name:file.name,lockAspect:true};
    if (['mp4','m4v'].includes(extension)) {
      if (!file.size || file.size>maxBytes) throw Error('동영상은 16 MiB 이하만 넣을 수 있습니다.');
      const header = new Uint8Array(await file.slice(0,12).arrayBuffer());
      if (String.fromCharCode(...header.slice(4,8))!=='ftyp') throw Error('MP4 또는 M4V 파일을 선택하세요.');
      const data = (await asURL(file)).split(',')[1];
      return {...shape,...place(model,480,270,point),videoData:{name:file.name,data}};
    }
    if (!imageExtensions.includes(extension) && !file.type.startsWith('image/')) throw Error(file.name+': 그림(PNG, JPEG, WebP, AVIF, GIF, BMP, SVG) 또는 MP4·M4V 동영상을 선택하세요.');
    const {data,width,height} = await rasterize(file);
    return {...shape,...place(model,width,height,point),imageData:{name:'image.png',data}};
  }
  async function insert(files,model,slide,point,submit) {
    if (!files.length) return;
    if (files.length>16) throw Error('한 번에 16개 이하의 파일을 넣을 수 있습니다.');
    // Videos are embedded unchanged; images are converted and scaled one by one.
    if (files.filter(f=>['mp4','m4v'].includes(ext(f.name))).reduce((sum,f)=>sum+f.size,0)>maxBytes) throw Error('한 번에 넣는 동영상은 합계 16 MiB 이하여야 합니다.');
    const operations=[];
    for(const [i,file] of files.entries()) {
      const anchor=point?{x:point.x+16*i,y:point.y+16*i}:null;
      operations.push({op:'add_shape',slide,value:await prepare(file,model,anchor)});
    }
    return submit(operations);
  }
  function attachDrop(stage,model,slide,run,submit) {
    const hasFiles=e=>Array.from(e.dataTransfer?.types||[]).includes('Files');
    stage.addEventListener('dragover',e=>{if(hasFiles(e)){e.preventDefault();e.dataTransfer.dropEffect='copy';}});
    stage.addEventListener('drop',e=>{
      if(!hasFiles(e))return;
      e.preventDefault();e.stopPropagation();const files=Array.from(e.dataTransfer.files);
      const rect=stage.getBoundingClientRect(),point={x:(e.clientX-rect.left)*model.width/rect.width,y:(e.clientY-rect.top)*model.height/rect.height};
      run(()=>insert(files,model,slide,point,submit));
    });
  }
  function pickImage(model,slide,run,submit,background=false) {
    const input=document.createElement('input');input.type='file';input.accept=imageExtensions.map(e=>'.'+e).join(',')+',image/*';input.multiple=!background;
    input.onchange=()=>run(async()=>{const files=Array.from(input.files);if(!files.length)return;
      if(!background)return insert(files,model,slide,null,submit);
      const {data}=await rasterize(files[0]);return submit([{op:'set_background',slide,imageData:{name:'background.png',data}}]);});
    input.click();
  }
  function pick(model,slide,run,submit) {
    const input=document.createElement('input');input.type='file';input.accept='.mp4,.m4v';
    input.onchange=()=>run(()=>insert(Array.from(input.files),model,slide,null,submit));input.click();
  }
  function player(shape,model,report) {
    const asset=model.images?.[shape.videoID],video=document.createElement('video');
    video.controls=true;video.preload='none';video.playsInline=true;
    video.style.cssText='width:100%;height:100%;object-fit:contain;background:black';
    video.setAttribute('aria-label',shape.name||'동영상');
    const poster=root.HanXModel.imageSource(model.images?.[shape.imageID]);if(poster)video.poster=poster;
    for(const event of ['click','dblclick','pointerdown','keydown'])video.addEventListener(event,e=>{if(e.key!=='Escape')e.stopPropagation();});
    video.addEventListener('error',()=>report('이 환경에서 동영상을 재생할 수 없습니다. 코덱과 파일을 확인하세요.'),{once:true});
    video.src='data:'+(videoTypes[ext(asset?.name||'')]||'application/octet-stream')+';base64,'+(asset?.data||'');
    return video;
  }
  function attachMovie(node,shape,model,presenting,report) {
    if(!shape.videoID)return;
    if(presenting){node.replaceChildren(player(shape,model,report));return;}
    const play=document.createElement('button');play.type='button';play.textContent='▶';play.setAttribute('aria-label','동영상 재생');play.title='동영상 재생';play.className='play-movie';
    play.onclick=e=>{e.stopPropagation();const dialog=document.createElement('dialog'),video=player(shape,model,report),close=document.createElement('button');dialog.className='movie-preview';dialog.setAttribute('aria-label',shape.name||'동영상');close.textContent='닫기';close.onclick=()=>dialog.close();dialog.append(video,close);document.body.append(dialog);dialog.addEventListener('close',()=>{video.pause();video.removeAttribute('src');video.load();dialog.remove();},{once:true});dialog.showModal();video.play().catch(()=>{});};node.append(play);
  }
  root.HanXSlideMedia={attachDrop,attachMovie,pick,pickImage,insert,place,fitImage};
})(globalThis);
