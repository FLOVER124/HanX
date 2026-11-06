// Page operations in the shared PDF editor UI, without Electron or a compiled CLI.
// Loads desktop/pdf/index.html in Playwright's Chromium with a host bridge that sends
// the same requests as the CLI to the real worker. Fixtures are generated locally.
// Usage: HANX_PDF_PYTHON=<python with Tools/pdf/requirements.txt> node Tests/PDFEditor/pages-ui.cjs
const assert=require('node:assert/strict');const {openEditor}=require('./browser-harness.cjs');
const MAKE="import sys, pypdfium2 as pdf, pypdfium2.raw as raw, ctypes as c\ndef doc(path,widths,label):\n    d=pdf.PdfDocument.new()\n    for i,w in enumerate(widths):\n        p=d.new_page(w,400)\n        o=pdf.PdfObject(raw.FPDFPageObj_NewTextObj(d,b'Helvetica',28),pdf=d)\n        raw.FPDFText_SetText(o,c.cast(c.create_string_buffer(f'{label} {i+1}'.encode('utf-16-le')+b'\\0\\0'),c.POINTER(c.c_ushort)))\n        o.transform(pdf.PdfMatrix(1,0,0,1,30,300));p.insert_obj(o);p.gen_content()\n    d.save(path)\ndoc(sys.argv[1],[300,300,300],'Page'); doc(sys.argv[2],[250,250],'Extra')\n";
(async()=>{const h=await openEditor({make:MAKE,files:['source.pdf','extra.pdf'],choose:{choosePDF:'extra.pdf'},viewport:{width:1250,height:1600}});
 const pageUI=h.ui,ready=h.ready,count=()=>h.inspect().pageCount;
 const sizes=()=>{const out=[];for(let i=0;i<count();i++){const d=h.inspect(i);out.push(`${Math.round(d.width)}/${d.rotation}/${d.objects.map(o=>o.text).join('')}`);}return out;};
 const menu=async(index,id)=>{await pageUI.click(`#pages button[data-page="${index}"]`,{button:'right'});await pageUI.click(`#contextMenu [data-action="${id}"]`);await ready();};
 assert.equal(await pageUI.locator('#pages button').count(),3);
 await menu(1,'rotatePageRight');assert.deepEqual(sizes(),['300/0/Page 1','400/90/Page 2','300/0/Page 3']);
 assert.equal(await pageUI.inputValue('#pageNumber'),'2');
 await menu(0,'duplicatePage');assert.equal(await pageUI.locator('#pages button').count(),4);assert.equal(await pageUI.inputValue('#pageNumber'),'2');
 await menu(3,'importPages');assert.deepEqual(sizes().map(s=>s.split('/')[2]),['Page 1','Page 1','Page 2','Page 3','Extra 1','Extra 2']);assert.equal(await pageUI.inputValue('#pageNumber'),'5');
 // Drag page 6 ("Extra 2") above page 1.
 const from=pageUI.locator('#pages button[data-page="5"]'),to=pageUI.locator('#pages button[data-page="0"]');await to.scrollIntoViewIfNeeded();
 await from.dragTo(to,{targetPosition:{x:20,y:5}});await ready();
 assert.equal(sizes()[0].split('/')[2],'Extra 2');
 await menu(0,'deletePage');assert.equal(sizes().length,5);assert.equal(sizes()[0].split('/')[2],'Page 1');
 // Undo past the page count change, then redo.
 await pageUI.click('#pages button[data-page="4"]');await ready();
 await pageUI.click('#undo');await ready();assert.equal(await pageUI.inputValue('#pageNumber'),'5');
 assert.equal(count(),6);await pageUI.click('#redo');await ready();assert.equal(count(),5);
 await menu(4,'insertAfter');assert.equal(count(),6);assert.equal(await pageUI.inputValue('#pageNumber'),'6');assert.equal(sizes()[5],'250/0/');
 // Last page: no "move down"; single page cannot be deleted from the menu.
 await pageUI.click('#pages button[data-page="5"]',{button:'right'});assert.equal(await pageUI.locator('#contextMenu [data-action="movePageDown"]').count(),0);await pageUI.keyboard.press('Escape');
 await pageUI.focus('#pages button[data-page="2"]');await pageUI.keyboard.press('Shift+F10');assert.equal(await pageUI.isVisible('#contextMenu'),true);
 assert.equal(await pageUI.getAttribute('#contextMenu','aria-label'),'3페이지 메뉴');await pageUI.keyboard.press('Escape');
 assert.ok(h.unchanged());assert.deepEqual(h.errors,[]);await h.close();console.log('page UI ok');
})().catch(e=>{console.error(e);process.exit(1);});
