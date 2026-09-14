(() => {
  'use strict';

  const app=document.getElementById('app');
  let queued=false;

  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];

  function routeName(){
    const raw=(location.hash||'#today').replace(/^#/,'').split('/')[0];
    return raw||'today';
  }

  function boardSignalPanel(){
    return $$('.sideCol .panel').find(panel=>$('.panelHead h3',panel)?.textContent?.trim().toLowerCase()==='board signal')||null;
  }

  function signalItems(panel){
    if(!panel)return [];
    return $$('.kpi',panel).map(kpi=>({
      label:$('span',kpi)?.textContent?.trim()||'',
      value:$('strong',kpi)?.textContent?.trim()||'—'
    })).filter(x=>x.label);
  }

  function updateSignalStrip(){
    const shell=$('.shell');
    const dateStrip=$('.dateStrip');
    const panel=boardSignalPanel();
    let strip=$('.mobileSignalStrip',shell||document);

    if(routeName()!=='today'||!shell||!dateStrip||!panel){
      strip?.remove();
      $$('.mobileSourceBoardSignal').forEach(x=>x.classList.remove('mobileSourceBoardSignal'));
      return;
    }

    panel.classList.add('mobileSourceBoardSignal');
    const items=signalItems(panel);
    if(!items.length)return;

    if(!strip){
      strip=document.createElement('section');
      strip.className='mobileSignalStrip';
      strip.setAttribute('aria-label','Board signal summary');
      dateStrip.insertAdjacentElement('afterend',strip);
    }

    const next=items.map(item=>`<div class="mobileSignalItem" data-signal="${item.label.replace(/"/g,'&quot;')}"><span>${item.label}</span><strong>${item.value}</strong></div>`).join('');
    if(strip.innerHTML!==next)strip.innerHTML=next;
  }

  function markRoute(){
    document.body.dataset.stRoute=routeName();
  }

  function decorate(){
    queued=false;
    markRoute();
    updateSignalStrip();
  }

  function schedule(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(decorate);
  }

  window.addEventListener('hashchange',schedule);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')schedule();});
  if(app)new MutationObserver(schedule).observe(app,{childList:true,subtree:true});
  schedule();
})();
