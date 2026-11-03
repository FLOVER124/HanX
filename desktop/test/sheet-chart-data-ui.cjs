const {app, BrowserWindow} = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');

async function check() {
  await app.whenReady();
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'hanx-chart-ui-'));
  const preload = path.join(folder, 'preload.cjs');
  const chart = {kind:'column',title:'매출',range:'A1:B3',x:32,y:32,width:300,height:180};
  const model = {kind:'spreadsheet',model:{sheets:[{name:'표',charts:[chart],cells:{
    A1:{input:'항목'},B1:{input:'금액'},A2:{input:'가'},B2:{input:'=2*9'},
    A3:{input:'나'},B3:{input:'-3'}
  }}]},calculated:[{B2:{type:'number',value:18,display:'18'}}]};
  await fs.writeFile(preload,`const {contextBridge}=require('electron');const ops=[];const model=${JSON.stringify(model)};
    contextBridge.exposeInMainWorld('recorded',()=>ops);
    contextBridge.exposeInMainWorld('hanx',{initial:async()=>model,edit:async batch=>{ops.push(...batch);return model;},onAction(){},reportError(){}});`);
  const win = new BrowserWindow({show:false,webPreferences:{preload,sandbox:true,contextIsolation:true}});
  const js = code => win.webContents.executeJavaScript(code);
  try {
    await win.loadFile(path.resolve(__dirname,'../index.html'));
    await js('pending');
    assert.equal(await js("document.querySelector('.sheet-chart svg').getAttribute('aria-label')"),'매출');
    assert.match(await js("document.querySelector('.sheet-chart svg').textContent"),/18/);
    for (const [kind, selector] of [['column','rect'], ['bar','rect'], ['line','polyline'], ['area','path'], ['pie','circle']]) {
      const result = await js(`(() => {
        const sheet = state.model.sheets[0];
        const svg = HanXSheetCharts.renderChart({...sheet.charts[0],kind:${JSON.stringify(kind)}},sheet,state.calculated[0]);
        return {hasGeometry:!!svg.querySelector(${JSON.stringify(selector)}),markup:svg.outerHTML};
      })()`);
      assert.ok(result.hasGeometry, kind);
      assert.doesNotMatch(result.markup,/NaN|Infinity/, kind);
    }
    await js("document.querySelector('.sheet-chart').click()");
    await js("document.querySelector('[aria-label=\"차트 제목\"]').value='수정';document.querySelector('.chart-editor form').requestSubmit();pending");
    let edits = await js('recorded()');
    assert.equal(edits.at(-1).op,'update_chart');
    assert.equal(edits.at(-1).value.title,'수정');
    assert.equal(edits.at(-1).index,0);
    await js("ribbonTab='데이터';renderRibbon();document.querySelector('[aria-label=\"데이터 범위\"]').value='A1:B3';document.querySelector('[aria-label=\"정렬 기준 열\"]').value='B';[...document.querySelectorAll('#tools button')].find(b=>b.textContent==='내림차순').click();pending");
    edits = await js('recorded()');
    assert.deepEqual(edits.at(-1),{op:'sort_range',sheet:0,range:'A1:B3',keyColumn:'B',ascending:false,header:false});
    await js("document.querySelector('[aria-label=\"데이터 범위\"]').value='B2:B3';[...document.querySelectorAll('#tools button')].find(b=>b.textContent==='아래로 채우기').click();pending");
    assert.deepEqual((await js('recorded()')).at(-1),{op:'fill_range',sheet:0,range:'B2:B3',direction:'down'});
    for(const [label,op] of [['위에 행 삽입','insert_row'],['행 삭제','delete_row'],['왼쪽에 열 삽입','insert_column'],['열 삭제','delete_column']]) {
      await js(`ribbonTab='데이터';renderRibbon();document.querySelector('[aria-label="기준 셀"]').value='C4';[...document.querySelectorAll('#tools button')].find(b=>b.textContent===${JSON.stringify(label)}).click();pending`);
      assert.deepEqual((await js('recorded()')).at(-1),{op,sheet:0,cell:'C4'});
    }
    console.log('HANX_CHART_AND_RANGE_UI_OK');
  } finally {
    win.destroy();
    await fs.rm(folder,{recursive:true,force:true});
  }
}
check().then(()=>app.quit()).catch(error=>{console.error(error);app.exit(1);});
