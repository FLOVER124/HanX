// Image insertion in the shared PDF editor UI: raster formats go to the engine as files,
// SVG is drawn by the editor page and staged as PNG (see browser-harness.cjs).
// Usage: HANX_PDF_PYTHON=<python with Tools/pdf/requirements.txt> node Tests/PDFEditor/images-ui.cjs
const assert=require('node:assert/strict');const {openEditor}=require('./browser-harness.cjs');
const MAKE=`import sys, pypdfium2 as pdf
from PIL import Image
d=pdf.PdfDocument.new();d.new_page(400,500);d.save(sys.argv[1])
Image.new('RGB',(90,60),'orange').save(sys.argv[2],'WEBP')
open(sys.argv[3],'w').write('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><rect width="64" height="32" fill="red"/></svg>')`;
(async()=>{
 for(const [file,expected] of [['photo.webp',[90,60]],['icon.svg',[2048,1024]]]){
  const h=await openEditor({make:MAKE,files:['blank.pdf','photo.webp','icon.svg'],choose:{chooseImage:file}});
  await h.ui.click('#addImage');await h.edited(1);
  const op=h.requests[0][0];assert.equal(op.op,'add_image');assert.ok(op.image.endsWith(file.endsWith('.svg')?'.png':file),op.image);
  const size=h.call({action:'inspect',input:h.current(),page:0}).objects.filter(o=>o.type==='image');assert.equal(size.length,1);
  const px=require('node:child_process').spawnSync(process.env.HANX_PDF_PYTHON||'python3',['-c','import sys,pypdfium2 as p;d=p.PdfDocument(sys.argv[1]);print(*next(o for o in d[0].get_objects() if o.type==3).get_px_size())',h.current()],{encoding:'utf8'}).stdout.trim().split(' ').map(Number);
  assert.deepEqual(px,expected,file);assert.ok(h.unchanged());assert.deepEqual(h.errors,[]);await h.close();
 }
 console.log('image UI ok');
})().catch(e=>{console.error(e);process.exit(1);});
