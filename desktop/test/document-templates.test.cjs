const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {Session}=require('../engine.cjs');
test('new letter and label templates remain editable after DOCX save',async()=>{
 const engine=process.env.HANX_CLI_PATH||path.resolve(__dirname,'../../build/hanx-cli');
 const session=await new Session(engine).init();
 try{
  for(const template of ['letter','labels']){
   await session.create('document',template);
   const file=path.join(session.directory,template+'.docx');
   await session.save(file);const {model}=await session.open(file),section=model.sections[0];
   if(template==='letter'){
    assert.ok(section.header.length&&section.footer.length);
    assert.equal(section.header[0].paragraph._0.props.bottomBorder.style,'solid');
   }else{
    const table=section.blocks[0].table._0;
    assert.equal(table.rows.length,7);assert.equal(table.columnWidths.length,2);
    assert.equal(table.rows[0][0].height,100);
    await session.edit([{op:'set_cell',section:0,block:0,row:0,column:0,text:'서울시'}]);
   }
  }
 }finally{await session.close();}
});
