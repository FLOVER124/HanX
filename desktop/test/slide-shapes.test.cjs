const {test}=require('node:test'),assert=require('node:assert/strict');
const S=require('../slide-shapes.js'),fs=require('node:fs'),path=require('node:path');
test('every native shape kind has a portable title and nondegenerate geometry',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../../Sources/Slides/SlideModel.swift'),'utf8');
 const native=source.split('enum ShapeKind')[1].split('var title')[0].match(/case ([^\n]+)/g).flatMap(line=>line.slice(5).split(',').map(s=>s.trim()));
 assert.deepEqual(new Set(Object.keys(S.titles)),new Set(native));
 const distinct=new Set();
 for(const kind of native){
  const spec=S.geometry(kind,320,120);
  if(['image','table'].includes(kind)){assert.equal(spec,null);continue;}
  assert.ok(spec);assert.doesNotMatch(JSON.stringify(spec),/NaN|Infinity/);
  if(!['text','rect'].includes(kind))distinct.add(JSON.stringify(spec));
 }
 assert.equal(distinct.size,native.length-4);
});
test('inserted arrows and text have positive geometry and remain centered',()=>{
 for(const kind of Object.keys(S.titles).filter(k=>!['image','table'].includes(k))){
  const s=S.insertion(kind,{width:960,height:540});
  assert.ok(s.width>0&&s.height>0);assert.equal(s.x+s.width/2,480);
  if(kind!=='line')assert.equal(s.y+s.height/2,270);
 }
 const arrow=S.geometry('rightArrow',300,100)[1].points;
 const points=arrow.split(' ').map(p=>p.split(',').map(Number));
 assert.ok(Math.abs(points[1][0]-200)<1e-9);assert.equal(points[1][1],25);assert.deepEqual(points[3],[300,50]);
});
