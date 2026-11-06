// Paragraph editing in the shared PDF editor UI (see browser-harness.cjs).
// Usage: HANX_PDF_PYTHON=<python with Tools/pdf/requirements.txt> node Tests/PDFEditor/paragraph-ui.cjs
const assert=require('node:assert/strict');const {openEditor}=require('./browser-harness.cjs');
const MAKE=`import sys, pypdfium2 as pdf, pypdfium2.raw as raw, ctypes as c
d=pdf.PdfDocument.new();p=d.new_page(400,500)
for i,(t,x,y) in enumerate([('The quick brown fox jumps',50,400),('over the lazy dog and keeps',50,385),('running to the end.',50,370),('Footer note',50,100)]):
    o=pdf.PdfObject(raw.FPDFPageObj_NewTextObj(d,b'Helvetica',12),pdf=d)
    raw.FPDFText_SetText(o,c.cast(c.create_string_buffer(t.encode('utf-16-le')+b'\\0\\0'),c.POINTER(c.c_ushort)))
    o.transform(pdf.PdfMatrix(1,0,0,1,x,y));p.insert_obj(o)
p.gen_content();d.save(sys.argv[1])`;
(async()=>{const h=await openEditor({make:MAKE,files:['paragraph.pdf']});const ui=h.ui;
 const lines=()=>h.inspect().objects.filter(o=>o.type==='text'&&o.text!=='Footer note');
 await ui.click('#objects [data-id="1"]');assert.equal(await ui.isDisabled('#editParagraph'),false);
 await ui.click('#editParagraph');
 assert.equal(await ui.inputValue('#dialogBody textarea'),'The quick brown fox jumps over the lazy dog and keeps running to the end.');
 assert.match(await ui.textContent('#dialogBody .hint'),/^3줄/);
 assert.equal(await ui.locator('#objects .selected').count(),3);
 const text='The quick brown fox jumps over the lazy dog and keeps running all the way to the river.\nThe end.';
 await ui.fill('#dialogBody textarea',text);await ui.click('#confirm');await h.edited(1);
 const after=lines();assert.ok(after.length>=4,JSON.stringify(after.map(o=>o.text)));
 assert.equal(after.at(-1).text,'The end.');assert.deepEqual(after.map(o=>o.matrix[5]),after.map((_,i)=>400-15*i));
 assert.deepEqual(h.requests.at(-1),[{op:'set_paragraph',objects:[0,1,2],text,page:0}]);
 // Context menu offers paragraph editing; a newline typed into the single-line editor reflows that object.
 await ui.click('#objects [data-id="0"]',{button:'right'});assert.equal(await ui.locator('#contextMenu [data-action="editParagraph"]').count(),1);await ui.keyboard.press('Escape');
 const footer=h.inspect().objects.find(o=>o.text==='Footer note');await ui.click(`#objects [data-id="${footer.id}"]`);await ui.click('#editText');
 await ui.fill('#dialogBody textarea','Footer\nsecond line');await ui.click('#confirm');await h.edited(2);
 const texts=h.inspect().objects.map(o=>o.text);assert.ok(texts.includes('Footer')&&texts.includes('second line'),JSON.stringify(texts));
 await ui.click('#undo');await h.ready();await ui.click('#undo');await h.ready();
 assert.deepEqual(lines().map(o=>o.text),['The quick brown fox jumps','over the lazy dog and keeps','running to the end.']);
 assert.ok(h.unchanged());assert.deepEqual(h.errors,[]);await h.close();console.log('paragraph UI ok');
})().catch(e=>{console.error(e);process.exit(1);});
