const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {Session}=require('../engine.cjs');
test('background designs, pictures and solid colors survive PPTX and undo',async()=>{
 const engine=process.env.HANX_CLI_PATH||path.resolve(__dirname,'../../build/hanx-cli');
 const session=await new Session(engine).init();
 try{
  await session.create('presentation');
  await session.edit([{op:'add_slide',at:1,value:{title:'Second'}}]);
  await session.edit([{op:'set_background',slide:0,color:'204680',endColor:'80D3E9',angle:135,middleColor:'FF0000',middlePosition:33}]);
  await session.edit([{op:'set_background',slide:0,copyToAll:true}]);
  await assert.rejects(()=>session.edit([{op:'set_background',slide:0,color:'FFFFFF',endColor:'000000',angle:361}]));
  const before=await session.undo();
  assert.ok(!before.model.slides[1].backgroundEnd);
  await session.undo(true);
  const file=path.join(session.directory,'background.pptx');
  await session.save(file);
  const {model}=await session.open(file);
  for(const slide of model.slides){
   assert.deepEqual(slide.background,{r:32,g:70,b:128});
   assert.deepEqual(slide.backgroundEnd,{r:128,g:211,b:233});
   assert.equal(slide.backgroundAngle,135);
   assert.deepEqual(slide.backgroundMiddle,{r:255,g:0,b:0});
   assert.equal(slide.backgroundMiddlePosition,33);
  }
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lZ8AAAAASUVORK5CYII=';
  await session.edit([{op:'set_background',slide:1,imageData:{name:'fixture.png',data:png}}]);
  await session.save(file);
  const picture=(await session.open(file)).model;
  assert.equal(picture.images[picture.slides[1].backgroundImage].data,png);
  await session.edit([{op:'set_background',slide:1,color:'ffffff'}]);
  const solid=(await session.read()).model.slides[1];
  assert.ok(!solid.backgroundEnd&&!solid.backgroundImage);
  assert.deepEqual(solid.background,{r:255,g:255,b:255});
 }finally{await session.close();}
});
