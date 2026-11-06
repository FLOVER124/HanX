const {test}=require('node:test');const assert=require('node:assert/strict');
const {moveTarget,move,commands}=require('../pdf/pages.js');
test('drop positions map to final page indices',()=>{
 assert.equal(moveTarget(0,3,false,5),2);assert.equal(moveTarget(0,3,true,5),3);
 assert.equal(moveTarget(4,1,false,5),1);assert.equal(moveTarget(4,1,true,5),2);
 assert.equal(moveTarget(2,2,true,5),2);assert.equal(moveTarget(2,3,false,5),2);
});
test('moving keeps the viewed page in view',()=>{
 assert.equal(move(2,2,2,5),null);
 assert.deepEqual(move(0,3,0,5),{operations:[{op:'move_page',page:0,to:3}],page:3});
 assert.equal(move(0,3,2,5).page,1);assert.equal(move(4,1,2,5).page,3);assert.equal(move(4,1,0,5).page,0);
});
test('page menu offers only valid commands',()=>{
 const single=commands(0,1).map(c=>c.id);
 assert.ok(!single.includes('deletePage')&&!single.includes('movePageUp')&&!single.includes('movePageDown'));
 const middle=Object.fromEntries(commands(1,3).map(c=>[c.id,c]));
 assert.deepEqual(middle.rotatePageRight.operations,[{op:'rotate_page',page:1,rotation:90}]);
 assert.deepEqual(middle.deletePage,{id:'deletePage',label:'페이지 삭제',operations:[{op:'delete_page',page:1}],page:1,danger:true});
 assert.equal(commands(2,3).find(c=>c.id==='deletePage').page,1);
 assert.equal(middle.importPages.import,2);assert.equal(middle.duplicatePage.page,2);
 assert.deepEqual(middle.movePageUp.operations,[{op:'move_page',page:1,to:0}]);
 assert.throws(()=>commands(3,3));assert.throws(()=>moveTarget(0,1,false,0));
});
const {selectPages,selectionCommands,extractOperations}=require('../pdf/pages.js');
test('thumbnail selection supports toggle and range',()=>{
 assert.deepEqual(selectPages([2],4,{},6),{pages:[4],anchor:4});
 assert.deepEqual(selectPages([2],4,{toggle:true},6),{pages:[2,4],anchor:4});
 assert.deepEqual(selectPages([2,4],4,{toggle:true},6),{pages:[2],anchor:4});
 assert.deepEqual(selectPages([2],2,{toggle:true},6),{pages:[2],anchor:2});
 assert.deepEqual(selectPages([2],5,{range:true,anchor:2},6),{pages:[2,3,4,5],anchor:2});
 assert.deepEqual(selectPages([0],3,{range:true,toggle:true,anchor:5},6),{pages:[0,3,4,5],anchor:5});
});
test('selection commands rotate, delete from the end and extract',()=>{
 const c=Object.fromEntries(selectionCommands([3,1],5).map(x=>[x.id,x]));
 assert.deepEqual(c.rotateSelectionRight.operations,[{op:'rotate_page',page:1,rotation:90},{op:'rotate_page',page:3,rotation:90}]);
 assert.deepEqual(c.deletePages.operations,[{op:'delete_page',page:3},{op:'delete_page',page:1}]);assert.equal(c.deletePages.page,1);
 assert.deepEqual(c.extractPages.extract,[1,3]);
 assert.ok(!selectionCommands([0,1,2],3).some(x=>x.id==='deletePages'));
 assert.equal(selectionCommands([3,4],5).find(x=>x.id==='deletePages').page,2);
 assert.deepEqual(extractOperations([1,3],5),[{op:'delete_page',page:4},{op:'delete_page',page:2},{op:'delete_page',page:0}]);
});
