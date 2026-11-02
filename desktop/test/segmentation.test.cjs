const {test}=require('node:test');
const assert=require('node:assert/strict');
const tools=require('../image-tools.js');
test('mask application multiplies original alpha and never alters RGB',()=>{
 const source=Uint8ClampedArray.from([10,20,30,128,40,50,60,0]);
 assert.deepEqual([...tools.applyMask(source,2,1,Float32Array.from([0.5,1]))],[10,20,30,64,40,50,60,0]);
 assert.equal(source[3],128);
});
test('brush stroke is continuous and restores only original coverage',()=>{
 const mask=new Float32Array(25);tools.paintMask(mask,5,5,{x:0,y:2},{x:4,y:2},0.5,1);
 assert.deepEqual([...mask.slice(10,15)],[1,1,1,1,1]);
 tools.paintMask(mask,5,5,{x:2,y:2},{x:2,y:2},0.5,0);assert.equal(mask[12],0);assert.equal(mask[11],1);
});
test('model normalization is finite for black and constant predictions',()=>{
 const tensor=tools.subjectTensor(new Uint8ClampedArray(320*320*4));assert.equal(tensor.length,3*320*320);assert.ok(tensor.every(Number.isFinite));
 assert.deepEqual([...tools.normalizeMask(Float32Array.of(0.4,0.4))],[0,0]);
 assert.deepEqual([...tools.normalizeMask(Float32Array.of(0.2,0.8))],[0,1]);
 assert.throws(()=>tools.normalizeMask(Float32Array.of(NaN,1)));
});
test('bundled inference assets match the reviewed provenance manifest',()=>{
 const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
 const root=path.resolve(__dirname,'../assets/segmentation'),manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
 for(const [name,expected] of Object.entries(manifest.files)){const data=fs.readFileSync(path.join(root,name));assert.equal(data.length,expected.bytes,name);assert.equal(crypto.createHash('sha256').update(data).digest('hex'),expected.sha256,name);}
});
