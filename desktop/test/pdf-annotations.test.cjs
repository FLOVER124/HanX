const {test}=require('node:test');const assert=require('node:assert/strict');
const {label,interactive,markupRects,noteRect,fieldOperation}=require('../pdf/annotations.js');
const field=(type,extra={})=>({id:3,type:'widget',field:{type,name:'f',...extra}});
test('labels name fields and summarize notes',()=>{
 assert.equal(label(field('text',{label:'이름'})),'입력란 · 이름');assert.equal(label({type:'note',contents:'  확인\n필요 '}),'메모 · 확인 필요');
 assert.equal(label({type:'highlight',contents:''}),'형광펜');assert.equal(label({type:'link',uri:'https://hanx.io'}),'링크 · https://hanx.io');
});
test('only fillable fields and notes are interactive on the page',()=>{
 assert.ok(interactive(field('checkbox')));assert.ok(interactive({type:'note'}));
 assert.ok(!interactive(field('signature')));assert.ok(!interactive({type:'highlight'}));assert.ok(!interactive({type:'note',hidden:true}));
});
test('markup covers text and outline text only',()=>{assert.deepEqual(markupRects([{type:'text',bounds:[1.234,2,3,4]},{type:'path',bounds:[0,0,1,1]},{type:'outline',bounds:[5,6,7,8]}]),[[1.23,2,3,4],[5,6,7,8]]);});
test('notes sit beside the selection or at the unrotated page center',()=>{
 assert.deepEqual(noteRect([10,10,100,50],400,500,0),[104,30,124,50]);assert.deepEqual(noteRect(null,500,400,90),[190,240,210,260]);
 assert.deepEqual(noteRect([10,10,395,500],400,500,0),[380,480,400,500]);
});
test('field operations follow the field type',()=>{
 assert.deepEqual(fieldOperation(field('text'),'홍길동'),{op:'set_field',annotation:3,value:'홍길동'});
 assert.deepEqual(fieldOperation(field('checkbox'),true),{op:'set_field',annotation:3,checked:true});
 assert.deepEqual(fieldOperation(field('listbox'),'A'),{op:'set_field',annotation:3,values:['A']});
 assert.throws(()=>fieldOperation(field('text',{readOnly:true}),'x'));assert.throws(()=>fieldOperation(field('signature'),'x'));
});
