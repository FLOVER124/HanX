'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs/promises');const os=require('node:os');const path=require('node:path');
const {PDFSession}=require('../pdf-session.cjs');
const executable=process.env.HANX_PDF_TEST_CLI,fixture=process.env.HANX_PDF_TEST_FIXTURE;
test('PDF session preserves original, rejects stale edits and restores exact history',{skip:!executable||!fixture},async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hanx-pdf-test-')),source=path.join(dir,'원본 파일.pdf');await fs.copyFile(fixture,source);const original=await fs.readFile(source),s=await new PDFSession(executable,source).init();
 try{
  const before=await s.page(0);assert.equal(before.objects[0].text,'Original text');
  await s.edit({revision:before.revision,operations:[{op:'set_text',page:0,object:0,text:'Edited'}]});
  const edited=await s.page(0);assert.equal(edited.objects[0].text,'Edited');assert.equal(edited.dirty,true);
  await assert.rejects(()=>s.edit({revision:before.revision,operations:[{op:'delete',page:0,object:0}]}),/변경/);
  s.undo();assert.equal((await s.page(0)).objects[0].text,'Original text');assert.equal(s.dirty,false);s.undo(true);
  const destination=path.join(dir,'결과.pdf');await s.save(destination);assert.equal(s.dirty,false);assert.deepEqual(await fs.readFile(source),original);
  const reopened=await new PDFSession(executable,destination).init();try{assert.equal((await reopened.page(0)).objects[0].text,'Edited');}finally{await reopened.close();}
  await assert.rejects(()=>s.edit({operations:[{op:'delete',page:0,object:999}]}));assert.equal(s.dirty,false);
 }finally{await s.close();await fs.rm(dir,{recursive:true,force:true});}
});
