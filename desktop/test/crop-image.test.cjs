const {test}=require('node:test');
const assert=require('node:assert/strict');
const {selection,croppedFrame,composeRegion,restoredFrame}=require('../crop-image.js');
test('reverse/out-of-bounds drag snaps to the valid source pixel range',()=>{
 assert.deepEqual(selection({x:8.2,y:12},{x:-4,y:3.8},10,10),{x:0,y:4,w:8,h:6});
});
test('cropped left half of a mirrored rotated image retains the same slide pixels',()=>{
 const shape={frame:{x:20,y:40,w:80,h:20},rotation:90,flipH:true};
 assert.deepEqual(croppedFrame(shape,{x:0,y:0,w:3,h:8},6,8),{x:40,y:60,width:40,height:20});
});
test('nested crop restores full geometry after inherited effects and flips',()=>{
 const shape={frame:{x:-4,y:38,w:144,h:72},rotation:52,flipH:true,flipV:true};
 const first={x:.125,y:.25,w:.75,h:.5},second={x:0,y:.5,w:.8,h:.5};
 const region=composeRegion(first,second),cropped=croppedFrame(shape,region,1,1);
 const restored=restoredFrame({...shape,frame:{x:cropped.x,y:cropped.y,w:cropped.width,h:cropped.height}},composeRegion(region,null));
 for(const [key,value] of Object.entries({x:-4,y:38,width:144,height:72}))assert.ok(Math.abs(restored[key]-value)<1e-10);
});
