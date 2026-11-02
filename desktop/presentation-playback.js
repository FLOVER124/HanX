(function(root){
 'use strict';
 const effects=[['appear','나타내기'],['fade','서서히 나타내기'],['flyIn','날아오기'],['floatIn','떠오르기'],['wipe','닦아내기'],['split','마름모 나타내기'],['zoom','확대 나타내기'],['wheel','시계 방향 나타내기'],['spin','회전'],['growShrink','크게/작게'],['transparency','반투명'],['pulse','펄스'],['disappear','사라지기'],['fadeOut','서서히 사라지기'],['flyOut','날아가기'],['floatOut','떠내려가기'],['wipeOut','닦아 사라지기'],['splitOut','마름모 사라지기'],['zoomOut','축소 사라지기']];
 const transitions=[['none','없음'],['cut','바로 전환'],['fade','페이드'],['push','밀기'],['wipe','닦아내기'],['cover','덮기'],['pull','당기기'],['split','나누기'],['zoom','확대/축소'],['dissolve','디졸브'],['blinds','블라인드'],['checker','체커보드'],['comb','빗질'],['randomBar','임의의 막대'],['strips','대각선 줄무늬'],['circle','원형'],['diamond','마름모'],['plus','십자'],['wedge','쐐기'],['wheel','바퀴'],['newsflash','뉴스 속보']];
 const directions=[['bottom','아래에서'],['left','왼쪽에서'],['right','오른쪽에서'],['top','위에서']];
 const triggers=[['clickEffect','클릭할 때'],['withEffect','이전 효과와 함께'],['afterEffect','이전 효과 다음에']];
 const exits=new Set(['disappear','fadeOut','flyOut','floatOut','wipeOut','splitOut','zoomOut']);
 const emphasis=new Set(['spin','growShrink','transparency','pulse']);
 function finite(value,min,max,label){if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw Error(`${label}: ${min}–${max} 범위로 입력하세요.`);return value;}
 function validateAnimation(animation){if(!effects.some(([id])=>id===animation.effect)||!triggers.some(([id])=>id===animation.trigger)||!directions.some(([id])=>id===animation.direction))throw Error('지원하지 않는 애니메이션 설정입니다.');finite(animation.duration,0,3600,'효과 시간');finite(animation.delay,0,3600,'지연 시간');return animation;}
 function timeline(animations){const groups=[];let group=null,previous=null;for(const a of animations){validateAnimation(a);if(!group||a.trigger==='clickEffect'){group={onClick:a.trigger==='clickEffect',items:[],duration:0};groups.push(group);previous=null;}const anchor=a.trigger==='withEffect'?(previous?.start||0):a.trigger==='afterEffect'?(previous?.end||0):0,start=anchor+a.delay,duration=['appear','disappear'].includes(a.effect)?0:a.duration,end=start+duration;const item={animation:a,start,end};group.items.push(item);group.duration=Math.max(group.duration,end);previous=item;}return groups;}
 function vector(direction,distance=100){return direction==='left'?[-distance,0]:direction==='right'?[distance,0]:direction==='top'?[0,-distance]:[0,distance];}
 function wipe(direction){return {left:'inset(0 100% 0 0)',right:'inset(0 0 0 100%)',top:'inset(0 0 100% 0)',bottom:'inset(100% 0 0 0)'}[direction]||'inset(100% 0 0 0)';}
 function wheel(progress){const points=['50% 50%'];for(let i=0;i<=64;i++){const angle=-Math.PI/2+2*Math.PI*progress*i/64;points.push(`${50+Math.cos(angle)*72}% ${50+Math.sin(angle)*72}%`);}return `polygon(${points.join(',')})`;}
 function keyframes(effect,direction='bottom',base='none',opacity=1){if(!effects.some(([id])=>id===effect))throw Error('지원하지 않는 애니메이션입니다.');const t=base==='none'?'':base,[x,y]=vector(direction),transform=s=>`${t} ${s}`.trim(),normal={opacity,transform:base,clipPath:'inset(0)'},hidden={opacity:0};let frames;
  switch(effect){
   case 'appear':frames=[hidden,normal];break;
   case 'disappear':frames=[normal,hidden];break;
   case 'fade':frames=[hidden,{opacity}];break;
   case 'fadeOut':frames=[{opacity},hidden];break;
   case 'flyIn':case 'flyOut':frames=[{opacity:0,transform:transform(`translate(${x*10}%,${y*10}%)`)},{opacity,transform:base}];break;
   case 'floatIn':case 'floatOut':frames=[{opacity:0,transform:transform(`translate(${x/3}%,${y/3}%)`)},{opacity,transform:base}];break;
   case 'wipe':case 'wipeOut':frames=[{opacity,clipPath:wipe(direction)},{opacity,clipPath:'inset(0)'}];break;
   case 'split':case 'splitOut':frames=[{opacity,clipPath:'polygon(50% 50%,50% 50%,50% 50%,50% 50%)'},{opacity,clipPath:'polygon(50% -50%,150% 50%,50% 150%,-50% 50%)'}];break;
   case 'zoom':case 'zoomOut':frames=[{opacity:0,transform:transform('scale(0.01)')},{opacity,transform:base}];break;
   case 'wheel':frames=Array.from({length:33},(_,i)=>({offset:i/32,opacity,clipPath:wheel(i/32)}));break;
   case 'spin':frames=[{transform:base},{transform:transform('rotate(360deg)')}];break;
   case 'growShrink':frames=[{transform:base},{transform:transform('scale(1.5)')}];break;
   case 'pulse':frames=[{transform:base,opacity},{transform:transform('scale(1.15)'),opacity:opacity*.65},{transform:base,opacity}];break;
   case 'transparency':frames=[{opacity},{opacity:opacity*.5}];break;
  }
  if(exits.has(effect)&&!['disappear','fadeOut'].includes(effect))frames=frames.reverse();
  if(exits.has(effect))frames[frames.length-1]={...frames.at(-1),opacity:0};return frames;
 }
 // Browser-native geometric approximations, not pixel-identical PowerPoint rendering.
 // Normalized SVG geometry keeps patterns independent of slide dimensions.
 function transitionMask(t,progress){
  const p=Math.round(Math.max(0,Math.min(1,t.inward?1-progress:progress))*1e9)/1e9;
  if(p<=0)return '';if(p>=1)return 'M0 0H1V1H0Z';
  const paths=[],direction=t.direction||'right';
  const point=(x,y)=>{if(t.vertical)[x,y]=[y,x];if(direction==='right')x=1-x;if(direction==='bottom')y=1-y;if(direction==='top'||direction==='bottom')[x,y]=[y,x];return [Number(x.toFixed(7)),Number(y.toFixed(7))].join(' ');};
  const polygon=points=>paths.push('M'+points.map(([x,y])=>point(x,y)).join('L')+'Z');
  const rect=(x,y,w,h)=>polygon([[x,y],[x+w,y],[x+w,y+h],[x,y+h]]);
  const sector=(start,sweep)=>{const points=[[.5,.5]];for(let i=0;i<=64;i++){const a=start+sweep*i/64;points.push([.5+Math.cos(a)*1.42,.5+Math.sin(a)*1.42]);}polygon(points);};
  switch(t.kind){
   case 'blinds':for(let i=0;i<10;i++)rect(0,i/10,1,p/10);break;
   case 'checker':for(let r=0;r<8;r++)for(let c=0;c<12;c++){const q=Math.max(0,Math.min(1,p*2-(r+c)%2));rect(c/12,r/8,q/12,1/8);}break;
   case 'comb':for(let i=0;i<12;i++)rect(i%2?1-p:0,i/12,p,1/12);break;
   case 'randomBar':for(let i=0;i<32;i++){const q=Math.max(0,Math.min(1,p*2-((i*17)%32)/32));rect(0,i/32,q,1/32);}break;
   case 'strips':for(let i=-8;i<16;i++){const x=i/8;polygon([[x,0],[x+p/8,0],[x+1+p/8,1],[x+1,1]]);}break;
   case 'circle':{const ratio=t.aspectRatio>0?t.aspectRatio:1,ry=p*Math.hypot(ratio,1)/2,rx=ry/ratio;paths.push(`M${.5-rx} .5a${rx} ${ry} 0 1 0 ${2*rx} 0a${rx} ${ry} 0 1 0 ${-2*rx} 0Z`);break;}
   case 'diamond':polygon([[.5,.5-p],[.5+p,.5],[.5,.5+p],[.5-p,.5]]);break;
   case 'plus':rect(.5-p/2,0,p,1);rect(0,.5-p/2,1,p);break;
   case 'wedge':sector(-Math.PI/2-Math.PI*p,Math.PI*2*p);break;
   case 'wheel':for(let i=0;i<4;i++)sector(-Math.PI/2+i*Math.PI/2,Math.PI/2*p);break;
   case 'dissolve':for(let r=0;r<10;r++)for(let c=0;c<16;c++)if(p>((r*16+c)*73%160)/160)rect(c/16,r/10,1/16+.0001,.1001);break;
  }
  return paths.join('');
 }
 function transitionFrames(transition={}){const kind=transition.kind||'none',direction=transition.direction||'right',[x,y]=vector(direction),incoming=[{transform:`translate(${x}%,${y}%)`},{transform:'translate(0,0)'}],outgoing=[{transform:'translate(0,0)'},{transform:`translate(${-x}%,${-y}%)`}];switch(kind){
  case 'none':case 'cut':return {incoming:[],outgoing:[]};
  case 'fade':return {incoming:[{opacity:0},{opacity:1}],outgoing:[]};
  case 'push':return {incoming,outgoing};
  case 'cover':return {incoming,outgoing:[]};
  case 'pull':return {incoming:[],outgoing,oldAbove:true};
  case 'wipe':return {incoming:[{clipPath:wipe(direction)},{clipPath:'inset(0)'}],outgoing:[]};
  case 'split':{const frames=[{clipPath:transition.vertical?'inset(0 50%)':'inset(50% 0)'},{clipPath:'inset(0)'}];return transition.inward?{incoming:[],outgoing:frames.reverse(),oldAbove:true}:{incoming:frames,outgoing:[]};}
  case 'zoom':{const frames=[{transform:'scale(0.01)',opacity:0},{transform:'scale(1)',opacity:1}];return transition.inward?{incoming:[],outgoing:frames.reverse(),oldAbove:true}:{incoming:frames,outgoing:[]};}
  case 'newsflash':{const frames=[{transform:'rotate(-720deg) scale(0.01)',opacity:0},{transform:'rotate(0deg) scale(1)',opacity:1}];return transition.inward?{incoming:[],outgoing:frames.reverse(),oldAbove:true}:{incoming:frames,outgoing:[]};}
  case 'dissolve':case 'blinds':case 'checker':case 'comb':case 'randomBar':case 'strips':case 'circle':case 'diamond':case 'plus':case 'wedge':case 'wheel':return {incoming:[],outgoing:[],mask:true,dissolve:kind==='dissolve',oldAbove:!!transition.inward};
  default:return {incoming:[],outgoing:[],unsupported:true};
 }}
 function animationGroups(ctx){const {el,button,field,selectField,ribbonGroup,model,selected,shapeID,edit}=ctx,slide=model.slides[selected];if(!slide)return [];const list=slide.animations||[],shape=slide.shapes.find(s=>s.id===shapeID),commit=animations=>edit({op:'set_animations',slide:selected,animations});
  const add=button('애니메이션 추가',()=>commit([...list,{shapeID:shape.id,effect:'fade',trigger:'clickEffect',duration:.5,delay:0,direction:'bottom'}]));add.disabled=!shape||list.length>=1000;
  const controls=el('div',{class:'animation-detail'}),selector=el('select',{'aria-label':'애니메이션 순서'});list.forEach((a,i)=>selector.append(el('option',{value:i,text:`${i+1}. ${slide.shapes.find(s=>s.id===a.shapeID)?.name||'개체 '+a.shapeID} / ${effects.find(([id])=>id===a.effect)?.[1]||a.effect}`})));
  function refresh(){controls.replaceChildren();const index=Number(selector.value),a=list[index];if(!a)return;const update=patch=>{const next={...a,...patch};validateAnimation(next);return commit(list.map((entry,i)=>i===index?next:entry));};const numeric=(label,key)=>{let control;control=field(label,a[key],value=>{const input=control.querySelector('input');try{update({[key]:value});input.setCustomValidity('');}catch(error){input.setCustomValidity(error.message);input.reportValidity();}},'number');return control;};
   const move=delta=>{const next=list.slice(),to=index+delta;if(to<0||to>=list.length)return;[next[index],next[to]]=[next[to],next[index]];return commit(next);},up=button('효과 위로',()=>move(-1)),down=button('효과 아래로',()=>move(1));up.disabled=index===0;down.disabled=index===list.length-1;
   controls.append(selectField('효과',effects,a.effect,effect=>update({effect,duration:['appear','disappear'].includes(effect)?0:a.duration||.5})),selectField('시작',triggers,a.trigger,trigger=>update({trigger})),selectField('방향',directions,a.direction,direction=>update({direction})),numeric('효과 시간 (초)','duration'),numeric('지연 시간 (초)','delay'),up,down,button('효과 삭제',()=>commit(list.filter((_,i)=>i!==index))));
  }
  selector.onchange=refresh;if(list.length)selector.value=String(Math.max(0,list.findIndex(a=>a.shapeID===shapeID)));refresh();return [ribbonGroup('애니메이션',add,...(list.length?[selector,controls]:[]))];
 }
 function transitionGroups(ctx){const {model,selected,edit,selectField,field,ribbonGroup,button}=ctx,slide=model.slides[selected];if(!slide)return [];const t=slide.transition||{},update=patch=>edit({op:'set_transition',slide:selected,...patch}),kinds=transitions.some(([id])=>id===t.kind)?transitions:[...transitions,[t.kind||'none','가져온 효과 (재생 시 바로 전환)']];
  const automatic=selectField('자동 넘김',[['off','사용 안 함'],['on','사용']],t.advanceAfter==null?'off':'on',value=>update({advanceAfter:value==='on'?5:null}));
  return [ribbonGroup('화면 전환',button('전환 미리 보기',()=>start({model,index:selected,renderSlide:ctx.renderSlide,preview:true})),selectField('전환 효과',kinds,t.kind||'none',kind=>update({kind})),selectField('전환 방향',directions,t.direction||'right',direction=>update({direction})),field('전환 시간 (초)',t.duration||.7,duration=>{if(duration>0&&duration<=60)update({duration});},'number'),selectField('나누기 축',[['horizontal','가로'],['vertical','세로']],t.vertical?'vertical':'horizontal',value=>update({vertical:value==='vertical'})),selectField('전환 방향 모드',[['out','바깥으로'],['in','안으로']],t.inward?'in':'out',value=>update({inward:value==='in'})),button('모든 슬라이드에 적용',()=>ctx.edit(...model.slides.map((_,slide)=>({op:'set_transition',slide,kind:t.kind||'none',duration:t.duration||.7,direction:t.direction||'right',vertical:!!t.vertical,inward:!!t.inward,advanceOnClick:t.advanceOnClick!==false,advanceAfter:t.advanceAfter??null}))))),ribbonGroup('슬라이드 넘김',automatic,...(t.advanceAfter!=null?[field('자동 넘김 대기 (초)',t.advanceAfter,advanceAfter=>{if(advanceAfter>=0&&advanceAfter<=3600)update({advanceAfter});},'number')]:[]),selectField('마우스로 넘김',[['yes','사용'],['no','사용 안 함']],t.advanceOnClick===false?'no':'yes',value=>update({advanceOnClick:value==='yes'})))];
 }
 function playbackGroups(ctx){return [ctx.ribbonGroup('슬라이드 쇼',ctx.button('처음부터 재생',()=>start({model:ctx.model,index:0,renderSlide:ctx.renderSlide})),ctx.button('현재부터 재생',()=>start({model:ctx.model,index:ctx.selected,renderSlide:ctx.renderSlide})))];}
 function start({model,index=0,renderSlide,preview=false}){
  if(!model.slides.length)return null;if(typeof renderSlide!=='function')throw Error('슬라이드 표시기가 없습니다.');
  const doc=root.document,dialog=doc.createElement('dialog'),viewport=doc.createElement('div'),surface=doc.createElement('div'),bar=doc.createElement('div'),counter=doc.createElement('span');dialog.setAttribute('aria-label','슬라이드 쇼');dialog.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:#080c12;color:white;overflow:hidden;';viewport.style.cssText='position:absolute;inset:0 0 52px;overflow:hidden;';surface.style.cssText=`position:absolute;width:${model.width}px;height:${model.height}px;transform-origin:top left;overflow:hidden;background:white;`;bar.style.cssText='position:absolute;bottom:0;left:0;right:0;height:52px;display:flex;align-items:center;justify-content:center;gap:16px;background:#141b25;';viewport.append(surface);dialog.append(viewport,bar);doc.body.append(dialog);
  let current=null,groups=[],step=0,busy=false,closed=false,epoch=0,autoTimer=null;const timers=new Set(),animations=new Set(),cleanups=new Set(),reduce=root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  function later(fn,ms){const id=setTimeout(()=>{timers.delete(id);fn();},ms);timers.add(id);return id;}
  function stop(){epoch++;for(const id of timers)clearTimeout(id);timers.clear();autoTimer=null;for(const a of animations)a.cancel();animations.clear();for(const cleanup of cleanups)cleanup();cleanups.clear();busy=false;}
  function fit(){const bounds=viewport.getBoundingClientRect(),scale=Math.min(bounds.width/model.width,bounds.height/model.height);surface.style.left=(bounds.width-model.width*scale)/2+'px';surface.style.top=(bounds.height-model.height*scale)/2+'px';surface.style.transform=`scale(${scale})`;}
  const resize=new ResizeObserver(fit);resize.observe(viewport);
  function close(){if(closed)return;closed=true;stop();resize.disconnect();dialog.close();dialog.remove();}
  function animate(node,frames,duration,done){const token=epoch;if(!frames.length){done?.();return;}const animation=node.animate(frames,{duration:reduce?0:Math.max(0,duration*1000),fill:'forwards',easing:'ease-in-out'});animations.add(animation);animation.finished.then(()=>{if(token!==epoch||!node.isConnected||closed)return;const final=frames.at(-1);for(const key of ['opacity','transform','clipPath'])if(final[key]!==undefined)node.style[key]=String(final[key]);animations.delete(animation);animation.cancel();done?.();}).catch(()=>{});}
  function scheduleAuto(){if(autoTimer!=null){clearTimeout(autoTimer);timers.delete(autoTimer);}const delay=preview?null:model.slides[index].transition?.advanceAfter;if(step>=groups.length&&delay!=null)autoTimer=later(()=>show(index+1),Math.max(0,delay)*1000);}
  function playGroup(){if(step>=groups.length||busy)return;busy=true;const group=groups[step++],token=epoch;for(const item of group.items)later(()=>{if(token!==epoch)return;const a=item.animation,node=current.querySelector(`[data-shape-id="${a.shapeID}"]`);if(!node)return;const style=root.getComputedStyle(node),opacity=Number(style.opacity)||1;node.style.visibility='visible';const frames=keyframes(a.effect,a.direction,style.transform,opacity);animate(node,frames,item.end-item.start);},reduce?0:item.start*1000);later(()=>{if(token!==epoch)return;busy=false;if(step<groups.length&&!groups[step].onClick)playGroup();else scheduleAuto();},reduce?0:group.duration*1000+20);}
  function enter(){if(groups[step]&&!groups[step].onClick)playGroup();else scheduleAuto();}
  function transition(old,next,t,done){const frames=transitionFrames(t);if(!old){done();return;}if(frames.unsupported){counter.title='가져온 전환 효과는 이 재생기에서 바로 전환됩니다.';}else counter.title='';const duration=reduce?0:t.duration||.7;if(frames.oldAbove)old.style.zIndex='2';next.style.zIndex='1';
   if(frames.mask&&duration>0){const ns='http://www.w3.org/2000/svg',svg=doc.createElementNS(ns,'svg'),defs=doc.createElementNS(ns,'defs'),clip=doc.createElementNS(ns,'clipPath'),path=doc.createElementNS(ns,'path'),id='hanx-transition-'+Math.random().toString(36).slice(2),target=t.inward?old:next;clip.id=id;clip.setAttribute('clipPathUnits','objectBoundingBox');clip.append(path);defs.append(clip);svg.append(defs);svg.style.cssText='position:absolute;width:0;height:0;';surface.append(svg);path.setAttribute('d',transitionMask({...t,aspectRatio:model.width/model.height},0));target.style.clipPath=`url(#${id})`;let raf;const startTime=performance.now(),token=epoch,cleanup=()=>{cancelAnimationFrame(raf);target.style.clipPath='';svg.remove();};cleanups.add(cleanup);const tick=now=>{if(token!==epoch)return;const progress=Math.min(1,(now-startTime)/(duration*1000));path.setAttribute('d',transitionMask({...t,aspectRatio:model.width/model.height},progress));if(progress>=1){cleanup();cleanups.delete(cleanup);old.remove();done();}else raf=requestAnimationFrame(tick);};raf=requestAnimationFrame(tick);return;}

   let pending=(frames.incoming.length?1:0)+(frames.outgoing.length?1:0);const finish=()=>{if(--pending<=0){old.remove();done();}};if(!pending){old.remove();done();return;}if(frames.incoming.length)animate(next,frames.incoming,duration,finish);if(frames.outgoing.length)animate(old,frames.outgoing,duration,finish);
  }
  function show(nextIndex,useTransition=true){if(closed)return;if(nextIndex>=model.slides.length){close();return;}if(nextIndex<0)nextIndex=0;stop();for(const child of [...surface.children])if(child!==current)child.remove();const old=current;index=nextIndex;const slide=model.slides[index];current=renderSlide(slide,model);current.style.position='absolute';current.style.inset='0';current.style.width=model.width+'px';current.style.height=model.height+'px';current.querySelectorAll('.resize-handle,.rotate-handle').forEach(n=>n.remove());surface.append(current);groups=timeline(slide.animations||[]);step=0;const first=new Map();for(const a of slide.animations||[])if(!first.has(a.shapeID))first.set(a.shapeID,a);for(const [id,a]of first)if(!emphasis.has(a.effect)&&!exits.has(a.effect)){const node=current.querySelector(`[data-shape-id="${id}"]`);if(node)node.style.visibility='hidden';}counter.textContent=`${index+1} / ${model.slides.length}`;fit();busy=true;transition(old,current,useTransition?slide.transition||{}:{kind:'none'},()=>{busy=false;enter();});}
  function next(pointer=false){if(busy)return;if(autoTimer!=null){clearTimeout(autoTimer);timers.delete(autoTimer);autoTimer=null;}if(step<groups.length)playGroup();else if(!pointer||model.slides[index].transition?.advanceOnClick!==false)show(index+1);else scheduleAuto();}
  for(const [label,fn]of [['이전',()=>show(index-1,false)],['다음',()=>next()],['쇼 종료',close]]){const button=doc.createElement('button');button.textContent=label;button.onclick=fn;bar.append(button);}bar.insertBefore(counter,bar.children[1]);viewport.onclick=()=>next(true);dialog.addEventListener('cancel',event=>{event.preventDefault();close();});dialog.addEventListener('keydown',event=>{if(['ArrowRight','ArrowDown','PageDown',' ','Enter'].includes(event.key)){event.preventDefault();next();}else if(['ArrowLeft','ArrowUp','PageUp','Backspace'].includes(event.key)){event.preventDefault();show(index-1,false);}else if(event.key==='Home'){event.preventDefault();show(0,false);}else if(event.key==='End'){event.preventDefault();show(model.slides.length-1,false);}else if(event.key==='Escape'){event.preventDefault();close();}});dialog.showModal();if(preview){current=renderSlide(model.slides[Math.max(0,index-1)],model);current.style.cssText+=`position:absolute;inset:0;width:${model.width}px;height:${model.height}px;`;surface.append(current);}show(Math.max(0,Math.min(model.slides.length-1,index)),preview);return {close,next:()=>next(),previous:()=>show(index-1,false),dialog};
 }
 const api={effects,transitions,directions,triggers,timeline,keyframes,transitionFrames,transitionMask,validateAnimation,animationGroups,transitionGroups,playbackGroups,start};if(typeof module!=='undefined')module.exports=api;else root.HanXPlayback=api;
})(typeof window!=='undefined'?window:globalThis);
