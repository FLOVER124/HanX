const {test}=require('node:test');
const assert=require('node:assert/strict');
const T=require('../slide-table-editor.js');
test('slide table insertion centers a bounded independent cell grid',()=>{
 const s=T.specification('3','4',960,540);assert.equal(s.kind,'table');assert.equal(s.table.rows.length,3);assert.equal(s.table.rows[0].length,4);assert.equal(s.x*2+s.width,960);assert.equal(s.y*2+s.height,540);assert.equal(s.table.columnWidths.reduce((a,b)=>a+b,0),s.width);s.table.rows[0][0]='edited';assert.equal(s.table.rows[1][0],'');
});
test('invalid or excessive table sizes are rejected before allocating cells',()=>{
 for(const args of [[0,1],[2,0],[-1,3],[Infinity,2],[2.5,2],[100,50],[101,1],[1,51],['bad',2]])assert.throws(()=>T.specification(...args,960,540));
});
