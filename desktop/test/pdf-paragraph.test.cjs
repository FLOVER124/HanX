const {test}=require('node:test');const assert=require('node:assert/strict');
const {collect,text,lines}=require('../pdf/paragraph.js');
const t=(id,value,x,y,right,size=12)=>({id,type:'text',text:value,size,matrix:[1,0,0,1,x,y],bounds:[x,y-2,right,y+9]});
const page=[
 t(0,'Title',50,700,120,20),
 t(1,'The quick brown fox jumps',50,650,250),t(2,'over the lazy dog and',50,635,240),t(3,'rests.',50,620,90),
 t(4,'Second paragraph line one',50,580,248),t(5,'and line two',50,565,140),
 t(6,'Right column',320,650,400),t(7,'continues here',320,635,410),
 {id:8,type:'path',matrix:null,bounds:[0,0,10,10]},{...t(9,'Rotated',10,10,20),matrix:[0,1,-1,0,10,10]}
];
test('lines split columns that share a baseline',()=>{const l=lines(page);assert.equal(l.filter(x=>x.baseline===650).length,2);});
test('collect follows one paragraph and stops at gaps, size changes and columns',()=>{
 assert.deepEqual(collect(page,2),[1,2,3]);assert.deepEqual(collect(page,5),[4,5]);
 assert.deepEqual(collect(page,0),[0]);assert.deepEqual(collect(page,7),[6,7]);assert.deepEqual(collect(page,8),[]);assert.deepEqual(collect(page,9),[]);
});
test('text joins wrapped lines and keeps short-line breaks',()=>{
 assert.equal(text(page,[1,2,3]),'The quick brown fox jumps over the lazy dog and rests.');
 assert.equal(text([t(1,'Item one',50,650,100),t(2,'A much longer second line',50,635,250),t(3,'end',50,620,80)],[1,2,3]),'Item one\nA much longer second line end');
 assert.equal(text([t(1,'Hello',50,650,80),t(2,'world',90,650,120)],[1,2]),'Hello world');
 assert.equal(text(page,[1,9]),null);assert.equal(text(page,[8]),null);
});
