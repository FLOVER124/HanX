// Run directly with the already-installed Electron; does not build or package.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
app.whenReady().then(async()=>{
 const win=new BrowserWindow({width:800,height:550,show:false,webPreferences:{nodeIntegration:true,contextIsolation:false,backgroundThrottling:false}});
 await win.loadURL('about:blank');
 const execute=code=>win.webContents.executeJavaScript(code);
 await execute(`
  window.P=require(${JSON.stringify(path.resolve(__dirname,'../presentation-playback.js'))});
  window.renderSlide=(s)=>{const n=document.createElement('div');n.dataset.slide=s.name;n.style.background=s.color;n.innerHTML='<div style="font:bold 54px sans-serif;padding:60px;color:white">'+s.name+'</div>';return n;};
  window.model={width:640,height:360,slides:[{name:'BEFORE',color:'#be3050',shapes:[]},{name:'AFTER',color:'#1268ae',shapes:[]}]};
  window.pause=ms=>new Promise(r=>setTimeout(r,ms));void 0;
 `);
 const output=process.env.HANX_PLAYBACK_EVIDENCE||'/tmp/hanx-playback-evidence';fs.mkdirSync(output,{recursive:true});
 const pictures=[];
 for(const kind of ['blinds','checker','comb','randomBar','strips','circle','diamond','plus','wedge','wheel','newsflash']){
  await execute(`model.slides[1].transition={kind:${JSON.stringify(kind)},duration:1};window.play=P.start({model,index:1,renderSlide,preview:true});void 0;`);
  await execute('pause(420)');
  const shot=await win.webContents.capturePage();
  fs.writeFileSync(path.join(output,kind+'.png'),shot.toPNG());
  pictures.push({kind,src:shot.toDataURL()});
  assert.equal(await execute('document.querySelectorAll("dialog").length'),1);
  await execute('play.close()');
 }
 // Interrupt a live transition repeatedly. Only the current slide may survive.
 await execute(`model.slides[1].transition={kind:'checker',duration:1};window.play=P.start({model,index:1,renderSlide,preview:true});play.previous();play.next();play.previous();`);
 assert.equal(await execute('document.querySelectorAll("[data-slide]").length'),1);
 assert.equal(await execute('document.querySelector("[data-slide]").dataset.slide'),'BEFORE');
 await execute('play.close();play.previous();play.next()');
 assert.equal(await execute('document.querySelectorAll("dialog").length'),0);
 // Automatic advance and end-of-deck disposal.
 await execute(`model.slides[0].transition={advanceAfter:.04};model.slides[1].transition={kind:'none',advanceAfter:.04};window.play=P.start({model,renderSlide});pause(180)`);
 assert.equal(await execute('document.querySelectorAll("dialog").length'),0);
 // Disabled pointer advance still permits the keyboard.
 await execute(`model.slides[0].transition={advanceOnClick:false};model.slides[1].transition={kind:'none'};window.play=P.start({model,renderSlide});document.querySelector('[data-slide]').parentNode.parentNode.click();`);
 assert.equal(await execute('document.querySelector("[data-slide]").dataset.slide'),'BEFORE');
 await execute(`play.dialog.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));`);
 assert.equal(await execute('document.querySelector("[data-slide]").dataset.slide'),'AFTER');
 await execute('play.close()');
 // Preview never automatically advances.
 await execute(`model.slides[1].transition={kind:'none',advanceAfter:0};window.play=P.start({model,index:1,renderSlide,preview:true});pause(70)`);
 assert.equal(await execute('document.querySelectorAll("dialog").length'),1);
 await execute('play.close()');
 await execute(`document.body.style.cssText='margin:0;background:#eee;font:18px sans-serif';document.body.innerHTML=${JSON.stringify(pictures.map(({kind,src})=>`<div style="display:inline-block;width:25%;box-sizing:border-box;padding:5px"><b>${kind}</b><img style="width:100%" src="${src}"></div>`).join(''))};`);
 win.setSize(1200,800);await execute('pause(100)');
 fs.writeFileSync(path.join(output,'contact-sheet.png'),(await win.webContents.capturePage()).toPNG());
 console.log('PASS: 11 rendered transitions; interruption cleanup; auto advancement; pointer/keyboard; preview. Evidence: '+output);
 win.destroy();app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
