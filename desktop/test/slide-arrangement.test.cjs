const {test}=require('node:test'),assert=require('node:assert/strict');
const {bounds,arrange}=require('../slide-arrangement.js');
const shape=(id,x,y,w=20,h=10,rotation=0)=>({id,frame:{x,y,w,h},rotation});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('rotated bounds retain center and include all corners',()=>{const b=bounds(shape(1,10,20,20,10,90));close(b.x,15);close(b.y,15);close(b.w,10);close(b.h,20);});
test('single alignment targets slide including rotation',()=>{const s=shape(1,10,20,20,10,90),[op]=arrange([s],new Set([1]),'right',100,80,2);close(op.x,85);assert.equal(op.slide,2);assert.equal(op.op,'update_shape');assert.equal(op.rotation,undefined);});
test('multiple alignment uses group bounds, excludes locked and unselected',()=>{const a=shape(1,10,5),b=shape(2,40,30),c={...shape(3,-100,-100),locked:true};const ops=arrange([a,b,c,shape(4,-200,0)],new Set([1,2,3]),'left',100,80,0);assert.deepEqual(ops,[{op:'update_shape',slide:0,shapeId:2,x:10,y:30}]);});
test('distribution preserves endpoints and equalizes edge gaps for different sizes',()=>{const shapes=[shape(1,0,0,10),shape(2,20,0,20),shape(3,90,0,10)];const [op]=arrange(shapes,new Set([1,2,3]),'horizontal',100,80,0);assert.equal(op.shapeId,2);assert.equal(op.x,40);assert.equal(op.y,0);assert.deepEqual(arrange(shapes,new Set([1,2]),'horizontal',100,80,0),[]);});
test('vertical distribution includes rotated bounds and preserves inputs',()=>{const shapes=[shape(1,0,0),shape(2,5,35,20,10,90),shape(3,0,90)];const before=JSON.stringify(shapes),[op]=arrange(shapes,new Set([1,2,3]),'vertical',100,100,0);close(op.y,45);assert.equal(op.x,5);assert.equal(JSON.stringify(shapes),before);});
test('all six alignments match shared rotated edges or centers',()=>{for(const mode of ['left','center','right','top','middle','bottom']){const shapes=[shape(1,10,20,30,10,30),shape(2,70,50,20,40,-20)];const ops=arrange(shapes,new Set([1,2]),mode,200,200,0);const boxes=shapes.map(s=>{const op=ops.find(o=>o.shapeId===s.id);return bounds(op?{...s,frame:{...s.frame,x:op.x,y:op.y}}:s);});const value=b=>mode==='left'?b.x:mode==='center'?b.x+b.w/2:mode==='right'?b.x+b.w:mode==='top'?b.y:mode==='middle'?b.y+b.h/2:b.y+b.h;close(value(boxes[0]),value(boxes[1]));}});

test('an alignment batch is one undoable edit in the document session', async () => {
  const path = require('node:path');
  const { Session } = require('../engine.cjs');
  const executable = process.env.HANX_CLI_PATH || path.resolve(__dirname, '../../build/hanx-cli');
  const session = await new Session(executable).init();
  try {
    await session.create('presentation');
    const setup = [10, 30, 80].map(x => ({
      op: 'add_shape', slide: 0, value: {kind:'rect', x, y:20, width:40, height:30}
    }));
    const {model} = await session.edit(setup);
    const shapes = model.slides[0].shapes.slice(-3);
    const batch = arrange(shapes, new Set(shapes.map(s=>s.id)), 'right', model.width, model.height, 0);
    assert.equal(batch.length, 2);
    const edited = await session.edit(batch);
    assert.deepEqual(edited.model.slides[0].shapes.slice(-3).map(s=>s.frame.x), [80,80,80]);
    const reverted = await session.undo();
    assert.deepEqual(reverted.model.slides[0].shapes, model.slides[0].shapes);
  } finally {
    await session.close();
  }
});
