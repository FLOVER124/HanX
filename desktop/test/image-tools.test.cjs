const {test}=require('node:test');
const assert=require('node:assert/strict');
const {removeBackground,edgeColor}=require('../image-tools.js');
const {shapeTransform}=require('../model.js');
function fixture(width,height,color=[255,255,255,255]){return Uint8ClampedArray.from(Array.from({length:width*height},()=>color).flat());}
function pixel(data,width,x,y,color){data.set(color,(y*width+x)*4);}
test('solid background removal preserves enclosed same-color foreground and source pixels',()=>{
 const data=fixture(5,5);for(let y=1;y<4;y++)for(let x=1;x<4;x++)pixel(data,5,x,y,[30,40,50,255]);pixel(data,5,2,2,[255,255,255,255]);const before=data.slice();
 const result=removeBackground(data,5,5,[255,255,255],0);assert.equal(result.removed,16);assert.equal(result.data[3],0);assert.equal(result.data[(2*5+2)*4+3],255);assert.equal(result.data[(1*5+1)*4+3],255);assert.deepEqual(data,before);
});
test('tolerance is predictable and transparent borders connect to matching background',()=>{
 const data=fixture(3,3,[245,245,245,255]);pixel(data,3,0,0,[0,0,0,0]);pixel(data,3,1,1,[20,30,40,128]);
 assert.equal(removeBackground(data,3,3,[255,255,255],0).removed,0);const result=removeBackground(data,3,3,[255,255,255],4);assert.equal(result.removed,7);assert.equal(result.data[(1*3+1)*4+3],128);assert.deepEqual(edgeColor(data,3,3),[245,245,245]);
});
test('one-row and one-column pictures remove correctly, and malformed or huge inputs reject',()=>{
 for(const [w,h] of [[1,1],[1,4],[4,1]])assert.equal(removeBackground(fixture(w,h),w,h,[255,255,255],0).removed,w*h);
 assert.throws(()=>removeBackground(new Uint8Array(4),16000001,1,[255,255,255],0));assert.throws(()=>removeBackground(fixture(1,1),1,1,[255,255,255],NaN));assert.throws(()=>edgeColor(new Uint8Array(4),2,2));
});
test('rotation and image flips compose consistently',()=>{assert.equal(shapeTransform({rotation:30,flipH:true,flipV:true}),'rotate(30deg) scaleX(-1) scaleY(-1)');});
test('100 percent tolerance includes opposite RGB extremes',()=>{assert.equal(removeBackground(fixture(1,1,[0,0,0,255]),1,1,[255,255,255],100).removed,1);});
test('locked rotated and flipped resize preserves aspect and fixed opposite corner',()=>{
 const {resizeFrame}=require('../model.js');const shape={frame:{x:10,y:20,w:100,h:50},rotation:90,flipH:true,lockAspect:true};
 const result=resizeFrame(shape,'se',-25,-50);assert.ok(Math.abs(result.width/result.height-2)<1e-10);assert.equal(result.width,150);assert.equal(result.height,75);
 assert.equal(result.x,-27.5);assert.equal(result.y,-17.5);
});
