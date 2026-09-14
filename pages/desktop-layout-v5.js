(() => {
  'use strict';

  const app=document.getElementById('app');
  if(!app)return;

  const BREAKPOINT='(min-width:1101px)';
  const DENSITY_KEY='sliptrace.desktopDensity.v1';
  const VALID_DENSITIES=['comfortable','compact','analyst'];
  const mq=window.matchMedia(BREAKPOINT);
  let scheduled=false;
  let working=false;

  const $=(s,r=document)=>r.querySelector(s);
  const $$=(s,r=document)=>[...r.querySelectorAll(s)];

  function routeName(){
    const raw=(location.hash||'#today').replace(/^#/,'').split('/')[0];
    return raw||'today';
  }

  function readDensity(){
    try{
      const saved=localStorage.getItem(DENSITY_KEY);
      return VALID_DENSITIES.includes(saved)?saved:'comfortable';
    }catch{return 'comfortable';}
  }

  function setDensity(value){
    const next=VALID_DENSITIES.includes(value)?value:'comfortable';
    document.body.dataset.desktopDensity=next;
    try{localStorage.setItem(DENSITY_KEY,next);}catch{}
    $$('.desktopDensity button').forEach(button=>{
      const active=button.dataset.density===next;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',active?'true':'false');
    });
  }

  function selectedDateLabel(dateStrip){
    const active=$('.dateBtn.active',dateStrip);
    if(!active)return 'Selected matchday';
    const day=$('small',active)?.textContent?.trim()||'';
    const date=$('strong',active)?.textContent?.trim()||'';
    return [day,date].filter(Boolean).join(' · ');
  }

  function fixtureCount(layout){
    const head=$('.mainCol>.panel .panelHead>span',layout);
    return head?.textContent?.trim()||'—';
  }

  function buildLeftRail(dateStrip,layout){
    const rail=document.createElement('aside');
    rail.className='desktopLeftRail';
    rail.setAttribute('aria-label','Matchday controls');

    const inner=document.createElement('div');
    inner.className='desktopLeftRailInner';

    const heading=document.createElement('div');
    heading.className='desktopRailBlock';
    heading.innerHTML=`<span class="desktopRailLabel">Match date</span><strong class="desktopRailTitle"></strong><span class="desktopRailMeta"></span>`;

    const density=document.createElement('div');
    density.className='desktopDensity';
    density.setAttribute('role','group');
    density.setAttribute('aria-label','Fixture density');
    density.innerHTML=`<button type="button" data-density="comfortable">Comfort</button><button type="button" data-density="compact">Compact</button><button type="button" data-density="analyst">Analyst</button>`;
    density.addEventListener('click',event=>{
      const button=event.target.closest('button[data-density]');
      if(!button)return;
      setDensity(button.dataset.density);
    });

    inner.append(heading,dateStrip,density);
    rail.appendChild(inner);
    updateRail(rail,dateStrip,layout);
    return rail;
  }

  function updateRail(rail,dateStrip,layout){
    const title=$('.desktopRailTitle',rail);
    const meta=$('.desktopRailMeta',rail);
    if(title)title.textContent=selectedDateLabel(dateStrip);
    if(meta)meta.textContent=`${fixtureCount(layout)} fixtures · ICT`;
  }

  function mountWorkspace(){
    const shell=$('.shell');
    if(!shell)return;

    let workspace=$(':scope > .desktopOpsWorkspace',shell);
    if(workspace){
      const rail=$('.desktopLeftRail',workspace);
      const dateStrip=$('.dateStrip',rail||workspace);
      const layout=$(':scope > .layout',workspace);
      if(rail&&dateStrip&&layout)updateRail(rail,dateStrip,layout);
      return;
    }

    const dateStrip=$(':scope > .dateStrip',shell);
    const layout=$(':scope > .layout',shell);
    if(!dateStrip||!layout)return;

    workspace=document.createElement('section');
    workspace.className='desktopOpsWorkspace';
    workspace.setAttribute('aria-label','Matchday operations workspace');
    shell.insertBefore(workspace,dateStrip);

    const rail=buildLeftRail(dateStrip,layout);
    workspace.append(rail,layout);
  }

  function unmountWorkspace(){
    const shell=$('.shell');
    const workspace=shell?$(':scope > .desktopOpsWorkspace',shell):null;
    if(!shell||!workspace)return;
    const dateStrip=$('.desktopLeftRail .dateStrip',workspace);
    const layout=$(':scope > .layout',workspace);
    if(dateStrip)shell.insertBefore(dateStrip,workspace);
    if(layout)shell.insertBefore(layout,workspace);
    workspace.remove();
  }

  function decorate(){
    scheduled=false;
    if(working)return;
    working=true;
    try{
      const route=routeName();
      document.body.dataset.stRoute=route;
      setDensity(readDensity());
      const active=mq.matches&&route==='today';
      document.body.classList.toggle('desktopOpsActive',active);
      if(active)mountWorkspace(); else unmountWorkspace();
    }finally{working=false;}
  }

  function schedule(){
    if(scheduled||working)return;
    scheduled=true;
    requestAnimationFrame(decorate);
  }

  const observer=new MutationObserver(records=>{
    if(!records.length||working)return;
    schedule();
  });
  observer.observe(app,{childList:true,subtree:true});

  window.addEventListener('hashchange',schedule);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')schedule();});
  if(typeof mq.addEventListener==='function')mq.addEventListener('change',schedule);else mq.addListener?.(schedule);

  setDensity(readDensity());
  schedule();
})();
