const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const A=require('../advanced-ribbon.js');
const {Session}=require('../engine.cjs');
const executable=process.env.HANX_CLI_PATH||path.resolve(__dirname,'../../build/hanx-cli');
test('advanced operations reject malformed cell addresses and destructive oversized fills',()=>{
 for(const value of ['A0','XFE1','A1048577','A1:B2:C3'])assert.throws(()=>A.range(value));
 assert.throws(()=>A.fillFormula(0,'A1:XFD100','=A1'));
 assert.throws(()=>A.fillFormula(0,'A1:B2','A1'));
 assert.throws(()=>A.rowHeight(0,0,20));assert.throws(()=>A.columnWidth(0,'A',NaN));assert.throws(()=>A.freeze(0,1.5,0));
 assert.equal(A.range('$b$2:$a$1'),'B2:A1');
});
test('grid offsets respect customized dimensions and clamp freeze to rendered cells',()=>{
 const metrics=A.gridMetrics({columnWidths:{A:90,C:50},rowHeights:{2:30},frozenRows:10,frozenCols:2},3,3);
 assert.deepEqual(metrics.widths,[90,64,50]);assert.deepEqual(metrics.left,[0,90,154]);assert.deepEqual(metrics.top,[0,20,50]);assert.equal(metrics.frozenRows,3);assert.equal(metrics.frozenColumns,2);
});
test('page margins and orientation survive DOCX save and reopen',async()=>{
 const session=await new Session(executable).init();try{let state=await session.create('document');const page=state.model.sections[0].page;await session.edit([A.pageOrientation(0,page,'landscape'),A.pageMargin(0,'marginLeft',36),A.pageMargin(0,'marginTop',48)]);const file=path.join(session.directory,'layout.docx');await session.save(file);state=await session.open(file);const actual=state.model.sections[0].page;assert.ok(actual.width>actual.height);assert.equal(actual.marginLeft,36);assert.equal(actual.marginTop,48);}finally{await session.close();}
});
test('sheet sizing, freeze and relative formula fills survive XLSX save and reopen',async()=>{
 const session=await new Session(executable).init();try{await session.create('spreadsheet');await session.edit([A.rowHeight(0,2,32),A.columnWidth(0,'B',88),A.freeze(0,2,1),A.fillFormula(0,'B2:C3','=A1+$A$1')]);const file=path.join(session.directory,'advanced.xlsx');await session.save(file);const state=await session.open(file),sheet=state.model.sheets[0];assert.ok(Math.abs(sheet.columnWidths.B-88)<1);assert.equal(sheet.rowHeights[2],32);assert.equal(sheet.frozenRows,2);assert.equal(sheet.frozenCols,1);assert.equal(sheet.cells.B2.input,'=A1+$A$1');assert.equal(sheet.cells.C3.input,'=B2+$A$1');await session.edit([A.freeze(0,0,0)]);const next=await session.read();assert.equal(next.model.sheets[0].frozenRows,0);assert.equal(next.model.sheets[0].frozenCols,0);}finally{await session.close();}
});
