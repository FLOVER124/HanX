const {test}=require('node:test');
const assert=require('node:assert/strict');
const P=require('../presentation-playback.js');
const animation=(patch={})=>({shapeID:1,effect:'fade',trigger:'clickEffect',duration:2,delay:0,direction:'bottom',...patch});
test('timeline groups click steps and distinguishes withPrevious start from afterPrevious end',()=>{
 const groups=P.timeline([animation({trigger:'withEffect',delay:.2}),animation({trigger:'withEffect',delay:.3}),animation({trigger:'afterEffect',duration:1,delay:.1}),animation({trigger:'clickEffect'}),animation({trigger:'withEffect',duration:3})]);
 assert.equal(groups.length,2);assert.equal(groups[0].onClick,false);assert.equal(groups[1].onClick,true);
 assert.deepEqual(groups[0].items.map(x=>Math.round(x.start*100)/100),[.2,.5,2.6]);assert.equal(Math.round(groups[0].duration*100)/100,3.6);assert.equal(groups[1].duration,3);
});
test('instant effects ignore stored duration and do not delay dependent animations',()=>{
 const group=P.timeline([animation({effect:'appear',delay:1}),animation({effect:'fade',trigger:'afterEffect'})])[0];assert.equal(group.items[0].end,1);assert.equal(group.items[1].start,1);
});
test('all nineteen effects generate meaningful keyframes preserving base transforms',()=>{
 assert.equal(P.effects.length,19);for(const [effect] of P.effects){const frames=P.keyframes(effect,'left','rotate(30deg) scaleX(-1)');assert.ok(frames.length>=2,effect);assert.ok(frames.some(frame=>JSON.stringify(frame)!==JSON.stringify(frames[0])),effect);for(const frame of frames)if(frame.transform)assert.ok(frame.transform.includes('rotate(30deg)'),effect);if(effect.endsWith('Out')||effect==='disappear')assert.equal(frames.at(-1).opacity,0,effect);}
 assert.match(P.keyframes('flyIn','right')[0].transform,/1000%/);assert.match(P.keyframes('flyIn','top')[0].transform,/-1000%/);
});
test('transition plans preserve direction, push/pull layering and split axis',()=>{
 assert.equal(P.transitions.length,21);assert.equal(P.transitionFrames({kind:'pull'}).oldAbove,true);assert.equal(P.transitionFrames({kind:'push',direction:'left'}).incoming[0].transform,'translate(-100%,0%)');assert.equal(P.transitionFrames({kind:'split',vertical:true}).incoming[0].clipPath,'inset(0 50%)');assert.equal(P.transitionFrames({kind:'dissolve'}).dissolve,true);assert.equal(P.transitionFrames({kind:'unknown'}).unsupported,true);
});
test('timeline rejects invalid enums and nonfinite timing before playback',()=>{
 for(const patch of [{effect:'unknown'},{trigger:'unknown'},{direction:'unknown'},{duration:NaN},{delay:-1},{duration:3601}])assert.throws(()=>P.timeline([animation(patch)]));
});

test('pattern transitions have distinct evolving normalized geometry and complete endpoints',()=>{
 const kinds=['blinds','checker','comb','randomBar','strips','circle','diamond','plus','wedge','wheel'];
 const middles=new Set();
 for(const kind of kinds){
  const t={kind,direction:'left'};
  assert.equal(P.transitionFrames(t).mask,true,kind);
  assert.equal(P.transitionMask(t,0),'',kind);
  assert.equal(P.transitionMask(t,1),'M0 0H1V1H0Z',kind);
  const middle=P.transitionMask(t,.43);assert.ok(middle.length>10,kind);middles.add(middle);
  assert.notEqual(middle,P.transitionMask(t,.65),kind);
  assert.equal(P.transitionMask({...t,inward:true},.57),middle,kind);
 }
 assert.equal(middles.size,kinds.length);
 for(const kind of ['blinds','checker','comb','randomBar','strips']){
  assert.notEqual(P.transitionMask({kind},.4),P.transitionMask({kind,vertical:true},.4),kind);
  assert.notEqual(P.transitionMask({kind,direction:'left'},.4),P.transitionMask({kind,direction:'right'},.4),kind);
 }
 assert.match(P.transitionFrames({kind:'newsflash'}).incoming[0].transform,/rotate/);
 assert.equal(P.transitionFrames({kind:'circle',inward:true}).oldAbove,true);
});
