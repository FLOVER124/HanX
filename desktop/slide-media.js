(function (root) {
  'use strict';
  const maxBytes = 16 * 1024 * 1024;
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
    if (!file.size || file.size>maxBytes) throw Error('16 MiB 이하의 파일을 선택하세요.');
    const shape = {kind:'image',name:file.name,lockAspect:true};
    if (['mp4','m4v'].includes(extension)) {
      const header = new Uint8Array(await file.slice(0,12).arrayBuffer());
      if (String.fromCharCode(...header.slice(4,8))!=='ftyp') throw Error('MP4 또는 M4V 파일을 선택하세요.');
      const data = (await asURL(file)).split(',')[1];
      return {...shape,...place(model,480,270,point),videoData:{name:file.name,data}};
    }
    if (!['png','jpg','jpeg'].includes(extension)) throw Error('PNG, JPEG, MP4 또는 M4V 파일을 선택하세요.');
    const image = new Image(); image.src = await asURL(file); await image.decode();
    const width=image.naturalWidth,height=image.naturalHeight;
    if (!width || !height || width*height>16000000) throw Error('그림은 1,600만 화소 이하만 삽입할 수 있습니다.');
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    canvas.getContext('2d').drawImage(image,0,0);
    const data=canvas.toDataURL('image/png').split(',')[1];
    if(data.length>Math.ceil(maxBytes/3)*4)throw Error('변환한 그림이 16 MiB를 초과합니다.');
    return {...shape,...place(model,width,height,point),imageData:{name:'image.png',data}};
  }
  async function insert(files,model,slide,point,submit) {
    if (!files.length) return;
    if (files.length>16||files.reduce((sum,f)=>sum+f.size,0)>maxBytes) throw Error('한 번에 16개, 합계 16 MiB 이하의 파일을 넣을 수 있습니다.');
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
  root.HanXSlideMedia={attachDrop,attachMovie,pick,insert,place};
})(globalThis);
