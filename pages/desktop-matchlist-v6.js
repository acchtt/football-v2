(() => {
  'use strict';

  const app=document.getElementById('app');
  if(!app)return;

  const mq=window.matchMedia('(min-width:1101px)');
  let queued=false;
  let working=false;

  const $=(s,r=document)=>r.querySelector(s);

  function routeName(){
    return (location.hash||'#today').replace(/^#/,'').split('/')[0]||'today';
  }

  function formatDate(value){
    if(!value)return '';
    const d=new Date(`${value}T12:00:00Z`);
    if(Number.isNaN(d.getTime()))return value;
    return new Intl.DateTimeFormat('en-US',{weekday:'long',day:'2-digit',month:'short',timeZone:'UTC'}).format(d).toUpperCase();
  }

  function selectedDate(){
    const btn=$('.desktopLeftRail .dateBtn.active')||$('.dateStrip .dateBtn.active');
    return btn?.dataset?.date||'';
  }

  function primaryPanel(){
    const main=$('.desktopOpsWorkspace .mainCol')||$('.shell .layout .mainCol');
    if(!main)return null;
    return [...main.querySelectorAll(':scope > .panel')].find(panel=>/^(today|fixtures)$/i.test($('.panelHead h2',panel)?.textContent?.trim()||''))||null;
  }

  function decoratePanel(panel){
    panel.classList.add('desktopMatchListV6');
    const head=$(':scope > .panelHead',panel);
    if(!head)return;

    let date=$('.desktopPanelDateV6',head);
    if(!date){
      date=document.createElement('span');
      date.className='desktopPanelDateV6';
      const h2=$('h2',head);
      h2?.insertAdjacentElement('afterend',date);
    }
    const dateValue=selectedDate();
    date.textContent=dateValue?`${formatDate(dateValue)} · ICT`:'ICT MATCHDAY';

    let order=$('.desktopOrderV6',head);
    if(!order){
      order=document.createElement('span');
      order.className='desktopOrderV6';
      order.textContent='Kickoff order';
      const count=head.querySelector(':scope > span:not(.desktopPanelDateV6):not(.desktopOrderV6)');
      if(count)head.insertBefore(order,count);else head.appendChild(order);
    }
  }

  function cleanup(){
    document.querySelectorAll('.desktopMatchListV6').forEach(panel=>{
      panel.classList.remove('desktopMatchListV6');
      panel.querySelectorAll('.desktopPanelDateV6,.desktopOrderV6').forEach(node=>node.remove());
    });
  }

  function decorate(){
    queued=false;
    if(working)return;
    working=true;
    try{
      const active=mq.matches&&routeName()==='today';
      if(!active){cleanup();return;}
      const panel=primaryPanel();
      if(panel)decoratePanel(panel);
    }finally{working=false;}
  }

  function schedule(){
    if(queued||working)return;
    queued=true;
    requestAnimationFrame(decorate);
  }

  new MutationObserver(records=>{if(records.length)schedule();}).observe(app,{childList:true,subtree:true});
  window.addEventListener('hashchange',schedule);
  window.addEventListener('sliptrace:status-updated',schedule);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')schedule();});
  if(typeof mq.addEventListener==='function')mq.addEventListener('change',schedule);else mq.addListener?.(schedule);
  schedule();
})();
