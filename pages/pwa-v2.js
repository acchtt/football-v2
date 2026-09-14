(() => {
  'use strict';

  const API=window.SLIPTRACE_API||'https://football-v2.acchtt.workers.dev';
  const STORE='sliptrace.followedMatches.v2';
  const LEGACY_STORE='sliptrace.followedMatches.v1';
  const SETTINGS_STORE='sliptrace.pushSettings.v1';
  const DEFAULT_SETTINGS={kickoff:true,goal:true,ht:true,ft:true};
  let installPrompt=null;
  let toastTimer=null;
  let swPromise=null;
  let pushConfigPromise=null;
  let decorating=false;

  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const isStandalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const isiOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent);
  const isAndroid=()=>/android/i.test(navigator.userAgent);
  const isLikelyWebView=()=>/; wv\)|\bwv\b|version\/\d+(?:\.\d+)*.*chrome/i.test(navigator.userAgent);
  const isChromeAndroid=()=>isAndroid()&&/(?:Chrome|Chromium)\//i.test(navigator.userAgent)&&!/EdgA|OPR|SamsungBrowser/i.test(navigator.userAgent);
  const supportsPush=()=>('serviceWorker' in navigator)&&('PushManager' in window)&&('Notification' in window);

  function followed(){
    try{
      const current=localStorage.getItem(STORE);
      if(current)return JSON.parse(current)||{};
      const legacy=localStorage.getItem(LEGACY_STORE);
      if(legacy){const parsed=JSON.parse(legacy)||{};localStorage.setItem(STORE,JSON.stringify(parsed));return parsed;}
    }catch{}
    return {};
  }
  function pushSettings(){
    try{return {...DEFAULT_SETTINGS,...(JSON.parse(localStorage.getItem(SETTINGS_STORE)||'{}')||{})};}
    catch{return {...DEFAULT_SETTINGS};}
  }
  function save(value){
    try{localStorage.setItem(STORE,JSON.stringify(value));}catch{}
    window.dispatchEvent(new CustomEvent('sliptrace:followed-changed',{detail:value}));
  }
  function selectedIds(){return Object.keys(followed()).filter(id=>/^\d+$/.test(id));}
  function matchTitle(row){
    const names=$$('.teamLine span',row).map(x=>x.textContent.trim()).filter(Boolean);
    return names.length>=2?`${names[0]} vs ${names[1]}`:(names[0]||'Selected match');
  }
  function toast(message){
    let el=$('.stToast');
    if(!el){el=document.createElement('div');el.className='stToast';el.setAttribute('role','status');el.setAttribute('aria-live','polite');document.body.appendChild(el);}
    el.textContent=message;el.classList.add('show');
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3400);
  }
  async function api(path,options={}){
    const res=await fetch(`${API}${path}`,{cache:'no-store',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
    const body=await res.json().catch(()=>null);
    if(!res.ok||body?.ok===false)throw new Error(body?.error||body?.detail||`HTTP ${res.status}`);
    return body;
  }
  function base64ToBytes(value){
    const pad='='.repeat((4-value.length%4)%4);
    const raw=atob((value+pad).replace(/-/g,'+').replace(/_/g,'/'));
    return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
  }

  async function registerSW(){
    if(!('serviceWorker' in navigator))throw new Error('Service workers are unavailable in this browser.');
    if(!swPromise){
      swPromise=(async()=>{
        const reg=await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});
        try{await reg.update();}catch{}
        await navigator.serviceWorker.ready;
        return reg;
      })();
    }
    return swPromise;
  }
  function getPushConfig(force=false){
    if(force||!pushConfigPromise){
      pushConfigPromise=api('/api/push/config').catch(error=>({ok:false,enabled:false,error:error.message}));
    }
    return pushConfigPromise;
  }
  async function existingSubscription(){
    try{return (await registerSW()).pushManager.getSubscription();}catch{return null;}
  }
  async function postSubscription(path,sub,extra={}){
    if(!sub)return null;
    return api(path,{method:'POST',body:JSON.stringify({
      subscription:sub.toJSON?sub.toJSON():sub,
      matches:selectedIds(),
      settings:pushSettings(),
      ...extra
    })});
  }

  async function enablePushFromGesture(){
    if(isiOS()&&!isStandalone())return {ok:false,reason:'ios-install'};
    if(!supportsPush())return {ok:false,reason:'unsupported'};
    const config=await getPushConfig(true);
    if(!config?.enabled||!config?.vapidPublicKey)return {ok:false,reason:'backend',detail:config?.error||'Push backend is not ready.'};
    let permission=Notification.permission;
    if(permission==='default')permission=await Notification.requestPermission();
    if(permission!=='granted')return {ok:false,reason:permission==='denied'?'denied':'permission'};
    const reg=await registerSW();
    let sub=await reg.pushManager.getSubscription();
    if(!sub){
      sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:base64ToBytes(config.vapidPublicKey)});
    }
    await postSubscription('/api/push/subscribe',sub,{client:{platform:navigator.platform||'',userAgent:navigator.userAgent.slice(0,220)}});
    return {ok:true,subscription:sub};
  }

  async function syncPushSelection(){
    const sub=await existingSubscription();
    if(!sub)return {ok:false,reason:'no-subscription'};
    const ids=selectedIds();
    try{
      if(ids.length){await postSubscription('/api/push/sync',sub);return {ok:true,matches:ids.length};}
      await api('/api/push/unsubscribe',{method:'POST',body:JSON.stringify({endpoint:sub.endpoint})});
      await sub.unsubscribe().catch(()=>false);
      return {ok:true,unsubscribed:true};
    }catch(error){console.warn('Slate XI push sync failed',error);return {ok:false,reason:'sync',error};}
  }

  async function toggleFollow(id,title,href,button){
    if(!id)return;
    button?.setAttribute('aria-busy','true');
    const all=followed();
    if(all[id]){
      delete all[id];save(all);await syncPushSelection();toast('Match alerts removed.');button?.removeAttribute('aria-busy');return;
    }
    all[id]={id:String(id),title,href:href||`#match/${id}`,selectedAt:Date.now()};save(all);
    try{
      const result=await enablePushFromGesture();
      if(result.ok)toast('Match alerts enabled.');
      else if(result.reason==='ios-install')toast('Match saved. Install Slate XI to Home Screen before enabling iPhone push.');
      else if(result.reason==='denied')toast('Match saved, but notification permission is blocked.');
      else if(result.reason==='unsupported')toast('Match saved. This browser does not support Web Push.');
      else toast('Match saved. Push service is not ready yet.');
    }catch(error){console.warn('Slate XI push enable failed',error);toast('Match saved, but push setup failed. Open PWA status for details.');}
    button?.removeAttribute('aria-busy');decorate();
  }

  function addRowToggle(row){
    if(row.querySelector(':scope > .notifyToggle'))return;
    const id=row.dataset.liveEvent||String(row.getAttribute('href')||'').match(/#match\/(\d+)/)?.[1];
    if(!id)return;
    const title=matchTitle(row);
    const btn=document.createElement('button');
    btn.type='button';btn.className='notifyToggle';btn.dataset.notifyId=id;
    btn.setAttribute('aria-label',`Enable alerts for ${title}`);
    btn.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();toggleFollow(id,title,row.getAttribute('href')||`#match/${id}`,btn);});
    row.appendChild(btn);
  }
  function addHeroToggle(){
    const foot=$('.matchHero .heroFoot');if(!foot||$('.heroNotify',foot))return;
    const id=location.hash.match(/^#match\/(\d+)/)?.[1];if(!id)return;
    const teams=$$('.matchHero .heroTeam span').map(x=>x.textContent.trim()).filter(Boolean);
    const title=teams.length>=2?`${teams[0]} vs ${teams[1]}`:'Selected match';
    const btn=document.createElement('button');btn.type='button';btn.className='notifyToggle heroNotify';btn.dataset.notifyId=id;
    btn.addEventListener('click',()=>toggleFollow(id,title,`#match/${id}`,btn));
    foot.appendChild(btn);
  }
  function enhanceSemantics(){
    const nav=$('.mobileNav');if(nav){nav.setAttribute('aria-label','Primary navigation');$$('a',nav).forEach(link=>{if(link.classList.contains('active'))link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});}
    const strip=$('.dateStrip');if(strip){strip.setAttribute('aria-label','Match date');$$('.dateBtn',strip).forEach(btn=>btn.setAttribute('aria-pressed',btn.classList.contains('active')?'true':'false'));}
    $$('.matchRow').forEach(row=>{const title=matchTitle(row);const clock=$('[data-clock]',row)?.textContent?.trim()||$('.matchTime',row)?.textContent?.trim()||'';row.setAttribute('aria-label',`${title}${clock?`, ${clock}`:''}`);});
  }

  async function probePwaAssets(){
    const out={manifest:false,icon192:false,icon512:false,manifestUrl:'',error:''};
    try{
      const link=$('link[rel="manifest"]');
      if(!link){out.error='Manifest link missing';return out;}
      out.manifestUrl=link.href;
      const response=await fetch(link.href,{cache:'no-store'});
      if(!response.ok){out.error=`Manifest HTTP ${response.status}`;return out;}
      const manifest=await response.json();
      const display=String(manifest.display||manifest.display_override?.[0]||'');
      out.manifest=!!((manifest.name||manifest.short_name)&&manifest.start_url&&['standalone','fullscreen','minimal-ui'].includes(display));
      const icons=Array.isArray(manifest.icons)?manifest.icons:[];
      const findIcon=size=>icons.find(icon=>String(icon.sizes||'').split(/\s+/).includes(size));
      const probeIcon=async icon=>{
        if(!icon?.src)return false;
        try{return (await fetch(new URL(icon.src,link.href).href,{cache:'no-store'})).ok;}catch{return false;}
      };
      [out.icon192,out.icon512]=await Promise.all([probeIcon(findIcon('192x192')),probeIcon(findIcon('512x512'))]);
      if(!out.manifest&&!out.error)out.error='Manifest fields incomplete';
    }catch(error){out.error=error?.message||String(error);}
    return out;
  }

  async function diagnostics(){
    let sw='unsupported',subscription=false,config={enabled:false};
    try{const reg=await registerSW();sw=reg.active||reg.waiting||reg.installing?'ready':'registered';subscription=!!(await reg.pushManager?.getSubscription?.());}catch(error){sw=error.message||'failed';}
    try{config=await getPushConfig(true);}catch{}
    const assets=await probePwaAssets();
    return {
      secureContext:window.isSecureContext,
      standalone:isStandalone(),
      serviceWorker:sw,
      manifest:assets.manifest,
      icon192:assets.icon192,
      icon512:assets.icon512,
      manifestError:assets.error,
      pushApi:supportsPush(),
      notificationPermission:('Notification' in window?Notification.permission:'unsupported'),
      subscription,
      backend:!!config?.enabled,
      installPrompt:!!installPrompt,
      webView:isLikelyWebView(),
      chromeAndroid:isChromeAndroid(),
      userAgent:navigator.userAgent
    };
  }
  function checkRow(label,value,state){return `<div class="pwaCheck"><span>${label}</span><b class="${state}">${value}</b></div>`;}
  async function showPwaSheet(mode='install'){
    let sheet=$('.pwaSheet');if(!sheet){sheet=document.createElement('div');sheet.className='pwaSheet hidden';document.body.appendChild(sheet);}
    const d=await diagnostics();
    let instructions='';
    if(isStandalone())instructions='Slate XI is already running as an installed web app.';
    else if(isiOS())instructions='On iPhone/iPad, open the site in Safari (or another browser on iOS 16.4+), tap Share, then choose Add to Home Screen. Open the new Home Screen app before enabling push.';
    else if(isAndroid()&&isLikelyWebView())instructions='This appears to be an in-app browser. Open the page in the full Chrome app first; PWA installation is commonly disabled inside embedded browsers.';
    else if(isAndroid())instructions='Open Slate XI in the full Chrome app, then use Chrome menu → Install and create shortcut → Install app. If the native prompt is available, the Install button above can trigger the same browser installer.';
    else instructions='Use your browser’s install or add-to-home-screen command. Installation support varies by desktop browser.';
    const androidHelp=isAndroid()?`<div class="pwaTrouble"><strong>Android / Xiaomi install check</strong><ol><li>Make sure this page is open in the full Chrome app, not the ChatGPT in-app browser.</li><li>On Xiaomi / HyperOS: Settings → Apps → Manage apps → Chrome → Other permissions → <b>Home screen shortcuts</b> → Allow.</li><li>Return to Chrome and use ⋮ → Install and create shortcut → Install app.</li><li>If Chrome explicitly reports a WebAPK install failure, verify Google Play Store / Google Play services are signed in and working, then retry.</li></ol></div>`:'';
    sheet.innerHTML=`<div class="pwaSheetCard" role="dialog" aria-modal="true" aria-labelledby="pwaSheetTitle"><h3 id="pwaSheetTitle">${mode==='push'?'Push notification status':'Install Slate XI'}</h3><p>${instructions}</p><div class="pwaChecks">${checkRow('Secure HTTPS',d.secureContext?'Ready':'Unavailable',d.secureContext?'ok':'bad')}${checkRow('Web app manifest',d.manifest?'Ready':'Issue',d.manifest?'ok':'bad')}${checkRow('192×192 icon',d.icon192?'Ready':'Issue',d.icon192?'ok':'bad')}${checkRow('512×512 icon',d.icon512?'Ready':'Issue',d.icon512?'ok':'bad')}${checkRow('Service worker',d.serviceWorker==='ready'||d.serviceWorker==='registered'?'Ready':'Issue',d.serviceWorker==='ready'||d.serviceWorker==='registered'?'ok':'bad')}${checkRow('Browser context',d.webView?'In-app browser':'Full browser',d.webView?'warn':'ok')}${checkRow('Native install prompt',d.installPrompt?'Available':'Not offered',d.installPrompt?'ok':'warn')}${checkRow('Web Push API',d.pushApi?'Supported':'Unsupported',d.pushApi?'ok':'warn')}${checkRow('Notification permission',d.notificationPermission,d.notificationPermission==='granted'?'ok':d.notificationPermission==='denied'?'bad':'warn')}${checkRow('Push subscription',d.subscription?'Active':'Not active',d.subscription?'ok':'warn')}${checkRow('Push backend',d.backend?'Ready':'Unavailable',d.backend?'ok':'bad')}</div>${d.manifestError?`<p class="pwaDiagError">Manifest check: ${String(d.manifestError).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</p>`:''}${androidHelp}<div class="pwaSheetActions"><button type="button" data-copy>Copy link</button><button type="button" data-copy-diag>Copy diagnostics</button><button type="button" class="primary" data-test ${d.subscription&&d.backend?'':'disabled'}>Send test push</button><button type="button" data-close>Close</button></div></div>`;
    sheet.addEventListener('click',e=>{if(e.target===sheet||e.target.closest('[data-close]'))sheet.classList.add('hidden');},{once:false});
    $('[data-copy]',sheet)?.addEventListener('click',async e=>{try{await navigator.clipboard.writeText(location.href);e.currentTarget.textContent='Copied';}catch{toast('Could not copy the link.');}});
    $('[data-copy-diag]',sheet)?.addEventListener('click',async e=>{try{const report={...d,url:location.href,userAgent:navigator.userAgent,timestamp:new Date().toISOString()};await navigator.clipboard.writeText(JSON.stringify(report,null,2));e.currentTarget.textContent='Diagnostics copied';}catch{toast('Could not copy diagnostics.');}});
    $('[data-test]',sheet)?.addEventListener('click',async e=>{e.currentTarget.disabled=true;e.currentTarget.textContent='Sending…';try{await sendTestNotification();e.currentTarget.textContent='Test sent';}catch(error){e.currentTarget.textContent='Test failed';toast(error.message||'Test push failed.');}});
    sheet.classList.remove('hidden');
  }

  async function sendTestNotification(){
    const sub=await existingSubscription();if(!sub)throw new Error('No active push subscription.');
    return api('/api/push/test',{method:'POST',body:JSON.stringify({endpoint:sub.endpoint})});
  }

  function injectInstallButton(){
    const host=$('.headerInner');if(!host)return;
    let btn=$('.pwaInstallBtn',host);
    if(!btn){
      btn=document.createElement('button');btn.type='button';btn.className='pwaInstallBtn';btn.textContent='Install';btn.setAttribute('aria-label','Install Slate XI web app');
      btn.addEventListener('click',async()=>{
        if(isStandalone()){toast('Slate XI is already installed.');return;}
        if(installPrompt){
          const prompt=installPrompt;installPrompt=null;
          try{await prompt.prompt();const choice=await prompt.userChoice;if(choice?.outcome==='accepted')toast('Installing Slate XI…');else showPwaSheet('install');}
          catch(error){console.warn('Install prompt failed',error);showPwaSheet('install');}
          injectInstallButton();return;
        }
        showPwaSheet('install');
      });
      host.appendChild(btn);
    }
    btn.classList.toggle('show',!isStandalone()&&(!!installPrompt||isiOS()||isAndroid()));
  }

  function decorate(){
    if(decorating)return;decorating=true;
    try{
      $$('.matchRow').forEach(addRowToggle);addHeroToggle();
      const all=followed();
      $$('.notifyToggle[data-notify-id]').forEach(btn=>{const selected=!!all[btn.dataset.notifyId];btn.classList.toggle('selected',selected);btn.setAttribute('aria-pressed',selected?'true':'false');const row=btn.closest('.matchRow');const title=row?matchTitle(row):'this match';btn.setAttribute('aria-label',selected?`Disable alerts for ${title}`:`Enable alerts for ${title}`);btn.title=selected?'Following this match':'Enable match alerts';});
      enhanceSemantics();injectInstallButton();
    }finally{decorating=false;}
  }

  window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;injectInstallButton();});
  window.addEventListener('appinstalled',()=>{installPrompt=null;injectInstallButton();toast('Slate XI installed.');});
  window.addEventListener('hashchange',()=>requestAnimationFrame(decorate));
  window.addEventListener('sliptrace:followed-changed',()=>{requestAnimationFrame(decorate);syncPushSelection();});
  window.addEventListener('sliptrace:alert-settings-changed',()=>syncPushSelection());
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){registerSW().catch(()=>{});syncPushSelection();requestAnimationFrame(decorate);}});

  const app=document.getElementById('app');
  if(app)new MutationObserver(()=>requestAnimationFrame(decorate)).observe(app,{childList:true,subtree:true});

  registerSW().then(()=>syncPushSelection()).catch(error=>console.warn('Slate XI service worker registration failed',error));
  getPushConfig(true);
  window.SlipTracePWA={
    diagnostics,
    showStatus:()=>showPwaSheet('push'),
    sendTestNotification,
    enablePush:enablePushFromGesture,
    syncPushSelection,
    refreshPushConfig:()=>getPushConfig(true),
    getSelectedMatches:()=>Object.values(followed()),
    getSubscription:existingSubscription
  };
  requestAnimationFrame(decorate);
})();