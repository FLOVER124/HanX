const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {Session,formats}=require('../engine.cjs');
const exe=process.env.HANX_CLI_PATH||path.resolve(__dirname,'../../build/hanx-cli');
test('HanX files identify their editor and preserve edited content',async()=>{
 const session=await new Session(exe).init();
 try{
  const ops={document:{op:'append_paragraph',section:0,text:'한글 문서'},
   presentation:{op:'set_notes',slide:0,text:'발표 메모'},
   spreadsheet:{op:'set_cell',sheet:0,cell:'A1',input:'=1+2'}};
  for(const kind of Object.keys(ops)){
   assert.equal(formats[kind][0],'hanx');await session.create(kind);
   await session.edit([ops[kind]]);
   const target=path.join(session.directory,kind+' 한글.hanx');
   await session.save(target);const reopened=await session.open(target);
   assert.equal(reopened.kind,kind);
   if(kind==='document')assert.match(reopened.text,/한글 문서/);
   if(kind==='presentation')assert.equal(reopened.model.slides[0].notes,'발표 메모');
   if(kind==='spreadsheet')assert.equal(reopened.model.sheets[0].cells.A1.input,'=1+2');
  }
  const data=await fs.readFile(path.join(session.directory,'presentation 한글.hanx'));
  for(const header of ['HanX/2\npresentation\n','HanX/1\ndocument\n']){
   const target=path.join(session.directory,'잘못된 파일.hanx');
   await fs.writeFile(target,Buffer.concat([Buffer.from(header),data.subarray(Buffer.byteLength('HanX/1\npresentation\n'))]));
   await assert.rejects(()=>session.open(target));
   assert.equal((await session.read()).kind,'spreadsheet');
  }
 }finally{await session.close();}
});
