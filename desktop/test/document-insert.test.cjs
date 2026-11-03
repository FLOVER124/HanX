const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {Session}=require('../engine.cjs');
const executable=process.env.HANX_CLI_PATH||path.resolve(__dirname,'../../build/hanx-cli');

test('page break, horizontal rule and footer survive DOCX reopen',async()=>{
 const session=await new Session(executable).init();
 try{
  await session.create('document');
  await session.edit([
   {op:'set_paragraph',section:0,block:0,text:'첫 장'},
   {op:'append_paragraph',section:0,text:'둘째 장'},
   {op:'insert_page_break',section:0,block:1},
   {op:'insert_divider',section:0,block:2},
   {op:'set_section_text',section:0,part:'footer',text:'문서 아래\n둘째 줄'}
  ]);
  const file=path.join(session.directory,'pages.docx');await session.save(file);
  const state=await session.open(file),section=state.model.sections[0];
  assert.equal(section.blocks[1].paragraph._0.props.pageBreakBefore,true);
  assert.equal(section.blocks[2].paragraph._0.props.bottomBorder.style,'solid');
  assert.deepEqual(section.footer.map(b=>b.paragraph._0.inlines[0].text._0),['문서 아래','둘째 줄']);
  await session.edit([{op:'set_section_text',section:0,part:'footer',text:''}]);
  assert.equal((await session.read()).model.sections[0].footer,undefined);
 }finally{await session.close();}
});
