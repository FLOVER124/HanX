const {test}=require('node:test');const assert=require('node:assert/strict');
const {resize,viewDelta}=require('../pdf/geometry.js');
const source={rect:[10,20,110,70],rotation:0};
test('corner resize preserves opposite corner and maps the PDF center',()=>{const r=resize(source,'se',40,20,false);assert.deepEqual(r.rect,[10,20,150,90]);assert.equal(r.scaleX,1.4);assert.equal(r.scaleY,1.4);assert.deepEqual([r.dx,r.dy],[20,-10]);});
test('northwest handle preserves southeast corner',()=>{const r=resize(source,'nw',20,10,false);assert.deepEqual(r.rect,[30,30,110,70]);assert.deepEqual([r.dx,r.dy],[10,-5]);});
test('Shift preserves aspect ratio and resize never flips',()=>{const r=resize(source,'se',40,1,true);assert.equal((r.rect[2]-r.rect[0])/(r.rect[3]-r.rect[1]),2);const small=resize(source,'nw',1000,1000,false);assert.ok(small.scaleX>0&&small.scaleY>0);assert.equal(small.rect[2],110);assert.equal(small.rect[3],70);});
test('all page rotations map visual centers and swap axes at right angles',()=>{for(const rotation of [0,90,180,270]){const r=resize({...source,rotation},'e',50,0,false);assert.deepEqual([r.dx||0,r.dy||0],({0:[25,0],90:[0,25],180:[-25,0],270:[0,-25]})[rotation]);assert.equal(r.scaleX,rotation%180?1:1.5);assert.equal(r.scaleY,rotation%180?1.5:1);}});
test('zero-sized or nonfinite geometry is rejected',()=>{assert.throws(()=>resize({rect:[0,0,0,4]},'se',1,1));assert.throws(()=>resize(source,'se',NaN,1));});
