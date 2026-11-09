const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function homePage(origin: string, needsKey: boolean, maxMb: string, ttlHours: string): string {
  const mcp = escape(`${origin}/mcp`);
  const keyNote = needsKey
    ? `<p class="note">이 서버는 접근 키가 필요합니다. 연결 주소 뒤에 <code>?key=발급받은키</code>를 붙이세요.</p>`
    : "";
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>HanX 클라우드 연결</title>
<meta name="description" content="ChatGPT, Claude 등 AI 앱에서 HanX로 HWP·DOCX·PPTX·XLSX 파일을 읽고 만들고 변환합니다.">
<link rel="icon" href="https://hanx.io/favicon.svg">
<style>
:root{--ink:#191f28;--muted:#6b7684;--blue:#246bfb;--blue-dark:#1859dc;--soft:#f2f6fc;--line:#e8edf3;--card:#fff;--bg:#fff;--code:#f4f6fa;--code-ink:#33455e;--ok:#278164;--err:#c4322b;--font:"Apple SD Gothic Neo","Malgun Gothic",system-ui,sans-serif;--mono:ui-monospace,SFMono-Regular,Consolas,monospace}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--ink:#e9eef5;--muted:#9aa6b5;--blue:#5b8fff;--blue-dark:#7aa4ff;--soft:#161d28;--line:#273142;--card:#121821;--bg:#0b1017;--code:#1a2230;--code-ink:#c9d6e8;--ok:#5fcf9f;--err:#ff7b72}}
:root[data-theme="dark"]{--ink:#e9eef5;--muted:#9aa6b5;--blue:#5b8fff;--blue-dark:#7aa4ff;--soft:#161d28;--line:#273142;--card:#121821;--bg:#0b1017;--code:#1a2230;--code-ink:#c9d6e8;--ok:#5fcf9f;--err:#ff7b72}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font);line-height:1.7;word-break:keep-all;overflow-wrap:break-word}
a{color:var(--blue)}code{font-family:var(--mono);font-size:.88em}button,input{font:inherit}
.wrap{max-width:880px;margin:auto;padding:0 16px}
header{border-bottom:1px solid var(--line)}header .wrap{display:flex;align-items:center;gap:10px;min-height:64px}
.brand{font-weight:800;font-size:22px;letter-spacing:-.04em;color:var(--ink);text-decoration:none}.tag{font-size:13px;color:var(--muted)}header nav{margin-left:auto;font-size:14px}
.hero{padding:56px 0 32px}.hero h1{font-size:clamp(30px,5vw,44px);line-height:1.3;letter-spacing:-.05em;margin:0}.hero p{color:var(--muted);font-size:17px;margin:16px 0 0}
.url{display:flex;gap:10px;align-items:center;margin-top:26px;background:var(--soft);border:1px solid var(--line);border-radius:14px;padding:12px 12px 12px 18px}
.url code{flex:1;min-width:0;overflow-x:auto;white-space:nowrap;font-size:15px;color:var(--ink)}
.btn{border:0;border-radius:10px;padding:9px 16px;background:var(--blue);color:#fff;font-weight:650;cursor:pointer;white-space:nowrap}.btn:hover{background:var(--blue-dark)}.btn.ghost{background:var(--card);color:var(--ink);border:1px solid var(--line)}
section{padding:28px 0}h2{font-size:22px;letter-spacing:-.04em;margin:0 0 14px}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:20px}.card h3{margin:0 0 8px;font-size:17px}.card ol{margin:0;padding-left:20px;font-size:14px;color:var(--muted)}.card ol b{color:var(--ink);font-weight:650}
pre{margin:8px 0 0;background:var(--code);color:var(--code-ink);border-radius:10px;padding:12px 14px;overflow-x:auto;font-size:13px}
.drop{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;border:2px dashed var(--line);border-radius:16px;padding:34px 16px;text-align:center;color:var(--muted);background:var(--soft);cursor:pointer}
.drop.over{border-color:var(--blue);color:var(--ink)}.drop strong{color:var(--ink)}
.result{margin-top:14px;font-size:14px}.result .id{display:flex;gap:10px;align-items:center;background:var(--code);border-radius:10px;padding:10px 12px}.result .id code{flex:1;min-width:0;overflow-x:auto;font-size:15px}
.ok{color:var(--ok)}.err{color:var(--err)}.note{font-size:13px;color:var(--muted);margin:10px 0 0}
.limits{font-size:14px;color:var(--muted);padding-left:20px;margin:0}
footer{border-top:1px solid var(--line);margin-top:24px;padding:22px 0 40px;font-size:13px;color:var(--muted)}
.keyrow{display:flex;gap:8px;margin-top:12px}.keyrow input{flex:1;min-width:0;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:10px;padding:8px 12px}
@media(max-width:700px){.grid{grid-template-columns:minmax(0,1fr)}.hero{padding-top:36px}}
</style>
</head>
<body>
<header><div class="wrap"><a class="brand" href="https://hanx.io/">HanX</a><span class="tag">클라우드 연결</span><nav><a href="https://hanx.io/">HanX 홈</a></nav></div></header>
<main class="wrap">
  <div class="hero">
    <h1>ChatGPT와 Claude에서<br>HWP·DOCX·PPTX·XLSX를 다루세요</h1>
    <p>아래 주소를 AI 앱에 커넥터(MCP 서버)로 추가하면 한글 문서 작성, 형식 변환, 표·수식 계산을 대화로 요청할 수 있습니다. 설치는 필요 없습니다.</p>
    <div class="url"><code id="mcp-url">${mcp}</code><button class="btn" data-copy="mcp-url">복사</button></div>
    ${keyNote}
  </div>

  <section>
    <h2>연결하기</h2>
    <div class="grid">
      <div class="card"><h3>ChatGPT</h3><ol>
        <li><b>설정 → 앱(Apps &amp; Connectors) → 고급 설정</b>에서 개발자 모드를 켭니다.</li>
        <li><b>앱 만들기</b>에서 이름을 HanX로, MCP 서버 URL에 위 주소를 넣습니다.</li>
        <li>인증은 <b>없음</b>을 선택하고 저장합니다. 대화에서 HanX를 선택해 사용합니다.</li>
      </ol><p class="note">개발자 모드 제공 여부는 요금제에 따라 다릅니다.</p></div>
      <div class="card"><h3>Claude (웹·데스크톱·모바일)</h3><ol>
        <li><b>설정 → 커넥터 → 사용자 지정 커넥터 추가</b>를 엽니다.</li>
        <li>이름은 HanX, URL에 위 주소를 넣고 추가합니다.</li>
        <li>대화창의 도구 메뉴에서 HanX를 켭니다.</li>
      </ol></div>
      <div class="card"><h3>Claude Code</h3><pre>claude mcp add --transport http hanx ${mcp}</pre>
        <p class="note">내 컴퓨터 파일을 직접 다루려면 로컬 <a href="https://github.com/FLOVER124/HanX/tree/main/plugins/hanx">HanX 플러그인</a>이 더 적합합니다.</p></div>
      <div class="card"><h3>Codex 및 기타 MCP 클라이언트</h3><pre>codex mcp add hanx --url ${mcp}</pre>
        <p class="note">Streamable HTTP를 지원하는 클라이언트라면 위 주소로 연결할 수 있습니다.</p></div>
    </div>
  </section>

  <section id="upload">
    <h2>파일 올리기</h2>
    <p class="note" style="margin:0 0 14px">AI 앱에 올린 첨부 파일은 HanX로 전달되지 않습니다. 기존 문서를 다루려면 여기에 올리고, 받은 파일 ID를 대화에 붙여 넣으세요. (예: “hx_… 파일을 읽고 표 합계를 고쳐 줘”)</p>
    <label class="drop" id="drop" tabindex="0">
      <strong>파일을 끌어다 놓거나 눌러서 선택</strong>
      <span>HWP · HWPX · DOCX · PPTX · XLSX · CSV · XML · 최대 ${escape(maxMb)} MB</span>
      <input type="file" id="file" hidden>
    </label>
    ${needsKey ? `<div class="keyrow"><input id="key" type="password" placeholder="접근 키" autocomplete="off"></div>` : ""}
    <div class="result" id="result" aria-live="polite"></div>
  </section>

  <section>
    <h2>알아 두세요</h2>
    <ul class="limits">
      <li>올린 파일과 만든 파일은 ${escape(ttlHours)}시간 뒤 자동으로 삭제됩니다. 다운로드 링크를 아는 사람은 그동안 파일을 받을 수 있으니 민감한 문서는 로컬 HanX를 사용하세요.</li>
      <li>원본은 바뀌지 않습니다. 수정·변환 결과는 항상 새 파일과 다운로드 링크로 돌려줍니다.</li>
      <li>PDF 편집·문자 인식(OCR)·PDF 출력은 <a href="https://hanx.io/">로컬 HanX</a>에서만 제공합니다.</li>
      <li>HanX는 언어 모델을 포함하지 않습니다. 문서 처리는 HanX 엔진이 하고, 대화는 사용하는 AI 앱이 담당합니다.</li>
    </ul>
  </section>
</main>
<footer><div class="wrap">HanX · <a href="https://github.com/FLOVER124/HanX">GitHub</a> · MIT License</div></footer>
<script>
(function(){
  var copy=function(text,button){navigator.clipboard.writeText(text).then(function(){var t=button.textContent;button.textContent="복사됨";setTimeout(function(){button.textContent=t},1400)})};
  document.addEventListener("click",function(e){var b=e.target.closest("[data-copy]");if(b){copy(document.getElementById(b.getAttribute("data-copy")).textContent,b)}});
  var drop=document.getElementById("drop"),input=document.getElementById("file"),out=document.getElementById("result"),keyInput=document.getElementById("key");
  if(keyInput){try{keyInput.value=localStorage.getItem("hanx-key")||""}catch(e){}}
  function show(html){out.innerHTML=html}
  function esc(s){return String(s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}
  function upload(file){
    if(!file)return;
    show('<p>'+esc(file.name)+' 올리는 중…</p>');
    var data=new FormData();data.append("file",file);
    var url="/upload";
    if(keyInput&&keyInput.value){url+="?key="+encodeURIComponent(keyInput.value);try{localStorage.setItem("hanx-key",keyInput.value)}catch(e){}}
    fetch(url,{method:"POST",body:data}).then(function(r){return r.json()}).then(function(r){
      if(!r.ok){show('<p class="err">'+esc(r.error||"올리지 못했습니다.")+'</p>');return}
      show('<p class="ok">'+esc(r.file.name)+' 업로드 완료. 이 ID를 AI 대화에 붙여 넣으세요.</p><div class="id"><code id="file-id">'+esc(r.file.id)+'</code><button class="btn" data-copy="file-id">복사</button></div><p class="note">'+new Date(r.file.expiresAt).toLocaleString("ko-KR")+'에 삭제됩니다.</p>');
    }).catch(function(){show('<p class="err">네트워크 오류로 올리지 못했습니다.</p>')});
  }
  input.addEventListener("change",function(){upload(input.files[0]);input.value=""});
  drop.addEventListener("keydown",function(e){if(e.key==="Enter"||e.key===" "){e.preventDefault();input.click()}});
  ["dragenter","dragover"].forEach(function(n){drop.addEventListener(n,function(e){e.preventDefault();drop.classList.add("over")})});
  ["dragleave","drop"].forEach(function(n){drop.addEventListener(n,function(e){e.preventDefault();drop.classList.remove("over")})});
  drop.addEventListener("drop",function(e){upload(e.dataTransfer.files[0])});
})();
</script>
</body>
</html>`;
}
