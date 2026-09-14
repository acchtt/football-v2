(() => {
  'use strict';

  const STORE='sliptrace.followedMatches.v1';
  let installPrompt=null;
  let toastTimer=null;

  function followed(){
    try{return JSON.parse(localStorage.getItem(STORE)||'{}')||{};}catch{return {};}
  }
  function save(value){
    try{localStorage.setItem(STORE,JSON.stringify(value));}catch{}
    window.dispatchEvent(new CustomEvent('sliptrace:followed-changed',{detail:value}));
  }
  function matchTitle(row){
    const names=[...row.querySelectorAll('.teamLine span')].map(x=>x.textContent.trim()).filter(Boolean);
    return names.length>=2?`${names[0]} vs ${names[1]}`:(names[0]||'Selected match');
  }
  function toast(message){
    let el=document.querySelector('.stToast');
    if(!el){el=document.createElement('div');el.className='stToast';document.body.appendChild(el);}
    el.textContent=message;el.classList.add('show');
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3200);
  }
  function isStandalone(){return matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;}
  function isiOS(){return /iphone|ipad|ipod/i.test(navigator.userAgent);}

  async function ensurePermission(){
    if(!('Notification' in window))return 'unsupported';
    if(Notification.permission==='granted')return 'granted';
    if(Notification.permission==='denied')return 'denied';
    try{return await Notification.requestPermission();}catch{return 'default';}
  }

  async function toggleFollow(id,title,href,button){
    if(!id)return;
    const all=followed();
    if(all[id]){
      delete all[id];save(all);decorate();toast('Removed from selected match alerts.');return;
    }

    const permission=await ensurePermission();
    all[id]={id:String(id),title,href:href||`#match/${id}`,selectedAt:Date.now()};
    save(all);decorate();
    if(permission==='granted') toast('Match selected. Push permission is ready for server sync.');
    else if(permission==='denied') toast('Match selected, but browser notifications are blocked.');
    else toast('Match selected. Background push will activate when server sync is connected.');
    button?.blur?.();
  }

  function addRowToggle(row){
    if(row.querySelector(':scope > .notifyToggle'))return;
    const id=row.dataset.liveEvent||String(row.getAttribute('href')||'').match(/#match\/(\d+)/)?.[1];
    if(!id)return;
    const btn=document.createElement('button');
    btn.type='button';btn.className='notifyToggle';btn.dataset.notifyId=id;
    btn.setAttribute('aria-label','Follow match for notifications');
    btn.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();
      toggleFollow(id,matchTitle(row),row.getAttribute('href')||`#match/${id}`,btn);
    });
    row.appendChild(btn);
  }

  function addHeroToggle(){
    const foot=document.querySelector('.matchHero .heroFoot');
    if(!foot||foot.querySelector('.heroNotify'))return;
    const id=location.hash.match(/^#match\/(\d+)/)?.[1];if(!id)return;
    const teams=[...document.querySelectorAll('.matchHero .heroTeam span')].map(x=>x.textContent.trim()).filter(Boolean);
    const title=teams.length>=2?`${teams[0]} vs ${teams[1]}`:'Selected match';
    const btn=document.createElement('button');btn.type='button';btn.className='notifyToggle heroNotify';btn.dataset.notifyId=id;
    btn.setAttribute('aria-label','Follow match for notifications');
    btn.addEventListener('click',()=>toggleFollow(id,title,`#match/${id}`,btn));
    foot.appendChild(btn);
  }

  function decorate(){
    document.querySelectorAll('.matchRow').forEach(addRowToggle);
    addHeroToggle();
    const all=followed();
    document.querySelectorAll('.notifyToggle[data-notify-id]').forEach(btn=>{
      const selected=!!all[btn.dataset.notifyId];
      btn.classList.toggle('selected',selected);
      btn.setAttribute('aria-pressed',selected?'true':'false');
      btn.title=selected?'Following this match':'Follow this match';
    });
    injectInstallButton();
  }

  function iosSheet(){
    let sheet=document.querySelector('.iosInstallSheet');
    if(sheet)return sheet;
    sheet=document.createElement('div');sheet.className='iosInstallSheet hidden';
    sheet.innerHTML='<div class="iosInstallCard"><h3>Install SlipTrace</h3><p>In Safari, tap Share, then choose <b>Add to Home Screen</b>. SlipTrace will open like an app.</p><button type="button">Got it</button></div>';
    sheet.addEventListener('click',e=>{if(e.target===sheet||e.target.closest('button'))sheet.classList.add('hidden');});
    document.body.appendChild(sheet);return sheet;
  }

  function injectInstallButton(){
    const host=document.querySelector('.headerInner');if(!host)return;
    let btn=host.querySelector('.pwaInstallBtn');
    if(!btn){
      btn=document.createElement('button');btn.type='button';btn.className='pwaInstallBtn';btn.textContent='Install';
      btn.addEventListener('click',async()=>{
        if(installPrompt){
          installPrompt.prompt();
          try{await installPrompt.userChoice;}catch{}
          installPrompt=null;btn.classList.remove('show');return;
        }
        if(isiOS()&&!isStandalone())iosSheet().classList.remove('hidden');
      });
      host.appendChild(btn);
    }
    btn.classList.toggle('show',!isStandalone()&&(!!installPrompt||isiOS()));
  }

  async function registerSW(){
    if(!('serviceWorker' in navigator))return;
    try{
      const reg=await navigator.serviceWorker.register('./sw.js',{scope:'./'});
      window.SlipTracePWA=Object.assign(window.SlipTracePWA||{}, {
        registration:reg,
        getSelectedMatches:()=>Object.values(followed()),
        getNotificationPermission:()=>('Notification'in window?Notification.permission:'unsupported')
      });
    }catch(err){console.warn('SlipTrace service worker registration failed',err);}
  }

  window.addEventListener('beforeinstallprompt',event=>{
    event.preventDefault();installPrompt=event;injectInstallButton();
  });
  window.addEventListener('appinstalled',()=>{installPrompt=null;injectInstallButton();toast('SlipTrace installed.');});
  window.addEventListener('hashchange',()=>requestAnimationFrame(decorate));
  window.addEventListener('sliptrace:followed-changed',()=>requestAnimationFrame(decorate));

  const app=document.getElementById('app');
  if(app){
    const observer=new MutationObserver(()=>requestAnimationFrame(decorate));
    observer.observe(app,{childList:true,subtree:true});
  }

  registerSW();
  requestAnimationFrame(decorate);
})();
