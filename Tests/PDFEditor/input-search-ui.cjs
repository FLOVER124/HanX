const {app,dialog}=require('electron');const assert=require('node:assert/strict');const path=require('node:path');
app.whenReady().then(async()=>{let win;try{win=await require(path.resolve(__dirname,'../../desktop/pdf-window.cjs')).openPDF(process.env.HANX_PDF_TEST_CLI,process.env.HANX_PDF_TEST_FIXTURE);const js=s=>win.webContents.executeJavaScript(s);const wait=async s=>{for(let i=0;i<250;i++){if(await js(s))return;await new Promise(r=>setTimeout(r,100));}throw Error('Timeout '+s);};await wait('typeof state!=="undefined"&&state&&!busy');
 dialog.showSaveDialog=async()=>({canceled:false,filePath:'/tmp/hanx-pdf-input-save.pdf'});
 await js("select(0);inlineText(selected());$('inlineText').value='Saved draft';window.hanxPDFAction('save')");
 await wait('!busy&&!state.dirty');assert.equal(await js('state.objects[0].text'),'Saved draft');
 await js("$('find').click();$('findQuery').value='saved';$('findQuery').dispatchEvent(new Event('input'))");assert.equal(await js("$('findCount').textContent"),'1개');await js("$('findNext').click()");assert.equal(await js('selection'),0);
 await js("$('objectType').value='image';$('objectType').dispatchEvent(new Event('change'))");assert.equal(await js("[...$('objectList').children].filter(e=>!e.hidden).length"),1);
 // Reject one edit to verify the draft survives the error popup.
 await js("window.originalRequest=request;window.request=(action,args)=>action==='edit'?Promise.reject(Error('test rejection')):window.originalRequest(action,args);select(0);inlineText(selected());$('inlineText').value='Keep this draft';$('inlineText').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");await wait("$('dialog').open");await js("$('confirm').click()");await wait("!!$('inlineText')&&!busy");assert.equal(await js("$('inlineText').value"),'Keep this draft');await js("request=window.originalRequest;$('inlineText').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
 let closePrompt=false;dialog.showMessageBox=async()=>{closePrompt=true;return {response:0};};
 await js("inlineText(selected());$('inlineText').value='Uncommitted';$('inlineText').dispatchEvent(new Event('input'));request('draft',{active:true})");win.close();for(let i=0;i<100&&!closePrompt;i++)await new Promise(r=>setTimeout(r,50));assert.ok(closePrompt);assert.ok(!win.isDestroyed());
 console.log('PASS pending text saved before native save, case-insensitive page find, match selection, object filter');win.destroy();app.exit(0);
 }catch(e){console.error(e);win?.destroy();app.exit(1);}});
