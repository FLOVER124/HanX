const {test}=require('node:test'),assert=require('node:assert/strict'),D=require('../sheet-data-controls.js');
test('sort explicitly records the range, absolute key column, direction and header policy',()=>{
 assert.deepEqual(D.sortOperation(2,'a1:c20',' b ',false,true),{op:'sort_range',sheet:2,range:'A1:C20',keyColumn:'B',ascending:false,header:true});
 assert.equal(D.sortOperation(0,'C20:A1','b',true,false).keyColumn,'B');
 for(const [range,key] of [['A1:B2','C'],['A1:C2','A1'],['A1:XFD1048576','A']])assert.throws(()=>D.sortOperation(0,range,key,true,false));
});
test('fill uses an explicit bounded range and recognized direction',()=>{
 assert.deepEqual(D.fillOperation(0,'A2:D8','right'),{op:'fill_range',sheet:0,range:'A2:D8',direction:'right'});
 assert.throws(()=>D.fillOperation(0,'A1:A2','sideways'));assert.throws(()=>D.fillOperation(0,'A1:A100001','down'));
});
