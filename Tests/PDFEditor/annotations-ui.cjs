// Annotations and form fields in the shared PDF editor UI (see browser-harness.cjs).
// Usage: HANX_PDF_PYTHON=<python with Tools/pdf/requirements.txt> node Tests/PDFEditor/annotations-ui.cjs
const assert=require('node:assert/strict');const {openEditor}=require('./browser-harness.cjs');
const MAKE=`import sys; sys.path.insert(0, ${JSON.stringify(__dirname)}); from test_annotations import build_form; build_form(sys.argv[1])`;
(async()=>{const h=await openEditor({make:MAKE,files:['양식.pdf']});const ui=h.ui;
 const annots=()=>h.inspect().annotations;let edits=0;const done=()=>h.edited(++edits);
 assert.equal(await ui.isVisible('#annotationHeading'),true);assert.equal(await ui.locator('#annotationList button').count(),5);
 // Text field: click on the page, type and press Enter.
 await ui.click('#annotationLayer [data-annot="0"]');assert.equal(await ui.inputValue('#annotInspector input'),'Kim');
 await ui.fill('#annotInspector input','홍길동');await ui.press('#annotInspector input','Enter');await done();
 assert.equal(annots()[0].field.value,'홍길동');assert.equal(await ui.inputValue('#annotInspector input'),'홍길동');
 // Checkbox and choice list from the side list.
 await ui.click('#annotationList [data-annot="1"]');await ui.check('#annotInspector input[type=checkbox]');await done();assert.equal(annots()[1].field.checked,true);
 await ui.click('#annotationList [data-annot="2"]');await ui.selectOption('#annotInspector select','Blue');await done();assert.equal(annots()[2].field.value,'Blue');
 await ui.click('#annotationList [data-annot="3"]');assert.match(await ui.textContent('#annotInspector .hint'),/읽기 전용/);
 // Note contents and colour.
 await ui.click('#annotationList [data-annot="4"]');assert.equal(await ui.inputValue('#annotInspector textarea'),'Check this');
 await ui.fill('#annotInspector textarea','확인 완료');await ui.fill('#annotInspector input[type=color]','#2874ef');await ui.click('#annotInspector button:not(.danger)');await done();
 assert.deepEqual([annots()[4].contents,annots()[4].color],['확인 완료','#2874ef']);
 // Highlight the title text, then add and delete a note.
 const title=h.inspect().objects.find(o=>o.text==='Form fixture');await ui.click(`#objects [data-id="${title.id}"]`);
 assert.equal(await ui.isVisible('#annotInspector'),false);await ui.click('#highlight');await done();
 const highlight=annots().find(a=>a.type==='highlight');assert.deepEqual(highlight.bounds.map(Math.round),title.bounds.map(Math.round));
 await ui.click('#objects',{position:{x:5,y:5}}).catch(()=>{});await ui.keyboard.press('Escape');
 await ui.click('#addNote');await ui.fill('#dialogBody textarea','새 메모');await ui.click('#confirm');await done();
 const note=annots().find(a=>a.contents==='새 메모');assert.ok(note);assert.equal(await ui.inputValue('#annotInspector textarea'),'새 메모');
 await ui.focus('#paper');await ui.keyboard.press('Delete');await done();assert.ok(!annots().some(a=>a.contents==='새 메모'));
 // Undo restores it; the original file never changes.
 await ui.click('#undo');await h.ready();assert.ok(annots().some(a=>a.contents==='새 메모'));
 assert.ok(h.unchanged());assert.deepEqual(h.errors,[]);await h.close();console.log('annotation UI ok');
})().catch(e=>{console.error(e);process.exit(1);});
