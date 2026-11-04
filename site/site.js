(() => {
  'use strict';
  const config = window.HANX_SITE || {};
  const unresolved = value => !value || /HANX_/.test(value);
  const repoReady = !unresolved(config.owner) && !unresolved(config.repository);
  const repository = repoReady ? `https://github.com/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repository)}` : null;
  function setLinks(selector, url) {
    if (!url) return;
    document.querySelectorAll(selector).forEach(link => {
      link.href = url;
      link.hidden = false;
    });
  }
  setLinks('[data-guide]', config.guide || './cli/');
  setLinks('[data-repo]', repository);
  setLinks('[data-releases]', repository && `${repository}/releases`);
  setLinks('[data-license]', repository && `${repository}/blob/main/${config.licensePath || 'LICENSE'}`);


  const windows = /^win/i.test(navigator.userAgentData?.platform || navigator.platform);
  const npmInstall = `npm install -g ${config.npm?.package || ''}`;
  const brewInstall = `HOMEBREW_NO_ASK=1 brew install ${config.brew?.formula || ''}`;
  const channels = {
    npm: {
      ready: config.npm?.available && !unresolved(config.npm.package),
      command: windows ? npmInstall : `npm config set prefix "$HOME/.npm-global" &&
${npmInstall} &&
export PATH="$HOME/.npm-global/bin:$PATH"`,
      title: 'npm으로 CLI 설치',
      pending: 'npm 배포 준비 중',
      detail: windows
        ? 'Node.js 18 이상이 필요합니다. 앱도 설치하려면 hanx setup --components all --yes를 실행하세요.'
        : 'Node.js 18 이상이 필요합니다. npm 설치 위치를 사용자 폴더로 설정합니다. 새 터미널에서도 hanx를 쓰려면 마지막 줄을 셸 시작 파일에 추가하세요. 앱도 설치하려면 hanx setup --components all --yes를 실행하세요.'
    },
    brew: {
      ready: config.brew?.available && !unresolved(config.brew.formula),
      command: brewInstall,
      title: 'Homebrew로 CLI 설치',
      pending: 'Homebrew 배포 준비 중',
      detail: 'macOS와 Linux에서 설치 확인 없이 CLI를 설치합니다. 앱도 설치하려면 hanx setup --components all --yes를 실행하세요. Windows에서는 npm 또는 Setup.exe를 사용하세요.'
    },
    pkg: { ready: config.pkg?.available && repoReady && !unresolved(config.pkg.asset), title: '사용 중인 운영체제를 선택하세요', pending: '설치 패키지 배포 준비 중', detail: `최신 GUI 앱은 ${config.version || ''}입니다. 위의 Mac 앱 ZIP, Windows 설치 마법사, Linux AppImage 또는 Debian 패키지를 선택하세요. macOS pkg는 앱과 CLI를 함께 설치합니다.` }
  };
  Object.entries(channels).forEach(([key, channel]) => {
    const status = document.querySelector(`[data-channel-status="${key}"]`);
    status.textContent = channel.ready ? channel.title : channel.pending;
    if (!channel.ready) return;
    document.querySelector(`[data-channel-detail="${key}"]`).textContent = channel.detail;
    if (channel.command) {
      document.getElementById(`command-${key}`).textContent = channel.command;
      document.querySelector(`[data-command-wrap="${key}"]`).hidden = false;
    } else {
      const download = document.getElementById('pkg-download');
      download.href = `${repository}/releases/download/v${encodeURIComponent(config.pkg.version || config.version)}/${encodeURIComponent(config.pkg.asset)}`;
      download.hidden = false;
    }
  });

  document.querySelectorAll('[data-platform-download]').forEach(link => {
    const asset = config.downloads?.[link.dataset.platformDownload];
    if (repository && asset) { link.href = `${repository}/releases/download/v${encodeURIComponent(config.version)}/${encodeURIComponent(asset)}`; link.hidden = false; }
  });

  const tabs = [...document.querySelectorAll('[role="tab"]')];
  function selectTab(tab, focus) {
    tabs.forEach(item => {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
    });
    if (focus) tab.focus();
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab, false));
    tab.addEventListener('keydown', event => {
      let target;
      if (event.key === 'ArrowRight') target = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') target = (index + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') target = 0;
      if (event.key === 'End') target = tabs.length - 1;
      if (target !== undefined) { event.preventDefault(); selectTab(tabs[target], true); }
    });
  });

  let statusTimeout;
  function announce(message) {
    const status = document.getElementById('copy-status');
    clearTimeout(statusTimeout);
    status.textContent = message;
    statusTimeout = setTimeout(() => { status.textContent = ''; }, 3500);
  }
  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(text); return true; } catch (_) { /* Try the selection fallback. */ }
    }
    const previous = document.activeElement;
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('aria-label', '복사할 명령');
    textarea.style.cssText = 'position:fixed;left:-9999px;top:0;';
    document.body.appendChild(textarea);
    textarea.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch (_) { copied = false; }
    textarea.remove();
    previous?.focus();
    return copied;
  }
  document.querySelectorAll('[data-copy]').forEach(button => {
    button.addEventListener('click', async () => {
      const text = document.getElementById(button.dataset.copy)?.textContent;
      if (!text) return;
      const copied = await copyText(text);
      announce(copied ? '클립보드에 복사했습니다.' : '자동으로 복사할 수 없습니다. 명령을 선택해 복사하세요.');
    });
  });

  document.querySelectorAll('.screenshot-frame img').forEach(img => {
    const fallback = () => {
      img.hidden = true;
      const message = img.parentElement.querySelector('.screenshot-fallback');
      if (message) message.hidden = false;
    };
    img.addEventListener('error', fallback);
    if (img.complete && img.naturalWidth === 0) fallback();
  });
})();

// The browser compares a user-entered version; it never inspects local applications.
(() => {
 const configured=window.HANX_SITE?.version;let latest=configured;
 const valid=s=>/^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(s);
 const render=()=>document.querySelectorAll('[data-latest-version]').forEach(n=>n.textContent=latest);
 render();
 const refresh=fetch('https://registry.npmjs.org/@juyoungsuh%2fhanx/latest',{signal:AbortSignal.timeout(5000)}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(p=>{if(!valid(p.version))throw Error();latest=p.version;render();}).catch(()=>{});
 document.getElementById('version-check-form')?.addEventListener('submit',async event=>{
  event.preventDefault();const result=document.getElementById('version-check-result'),input=document.getElementById('installed-version').value.trim().replace(/^v/,'');
  if(!valid(input)){result.textContent='2.11.0처럼 숫자 세 자리로 입력하세요.';return;}
  result.textContent='버전을 확인하고 있습니다.';await refresh;
  if(!valid(latest)){result.textContent='배포 버전을 확인할 수 없습니다. 잠시 후 다시 확인하세요.';return;}
  const a=input.split('.').map(Number),b=latest.split('.').map(Number);let order=0;
  for(let i=0;i<3;i++)if(a[i]!==b[i]){order=Math.sign(a[i]-b[i]);break;}
  result.textContent=order===0?'Up to date — 최신 버전입니다.':order<0?`Update available — ${latest} 버전으로 업데이트하세요.`:'현재 배포보다 새로운 버전입니다.';
 });
})();

(() => {
 const reel=document.querySelector('.format-reel');if(!reel)return;
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');let timer=null,reset=null,index=0;
 function stop(){clearInterval(timer);clearTimeout(reset);timer=null;}
 function start(){stop();index=0;reel.style.transition='none';reel.style.transform='translateY(0)';if(reduced.matches||document.hidden)return;
  timer=setInterval(()=>{index++;reel.style.transition='';reel.style.transform=`translateY(-${index*1.5}em)`;
   if(index===6)reset=setTimeout(()=>{reel.style.transition='none';reel.style.transform='translateY(0)';index=0;},700);
  },1000);
 }
 reduced.addEventListener('change',start);document.addEventListener('visibilitychange',start);window.addEventListener('pagehide',stop);window.addEventListener('pageshow',start);start();
})();
