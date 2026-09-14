(() => {
  'use strict';

  const app=document.getElementById('app');
  if(!app)return;

  const MQ=window.matchMedia('(min-width:1101px)');
  const DENSITY_KEY='sliptrace.frontDensity.v2';
  const SIGNAL_KEY='sliptrace.frontSignalFilter.v2';
  const DENSITIES=['comfortable','compact','analyst'];
  const SIGNALS=['all','focus','watchlist'];
  let scheduled=false;
  let working=false;

  const $=(selector,root=document)=>root.querySelector(selector);
  const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];

  function route(){
    return (location.hash||'#today').replace(/^#/,'').split('/')[0]||'today';
  }

  function safeGet(key,fallback){
    try{return localStorage.getItem(key)||fallback;}catch{return fallback;}
  }
  function safeSet(key,value){try{localStorage.setItem(key,value);}catch{}}

  function density(){
    const saved=safeGet(DENSITY_KEY,'comfortable');
    return DENSITIES.includes(saved)?saved:'comfortable';
  }
  function signalFilter(){
    const saved=safeGet(SIGNAL_KEY,'all');
    return SIGNALS.includes(saved)?saved:'all';
  }

  function activeDateText(dateStrip){
    const active=$('.dateBtn.active',dateStrip);
    if(!active)return 'Selected matchday · ICT';
    const day=$('small',active)?.textContent?.trim()||'';
    const date=$('strong',active)?.textContent?.trim()||'';
    return `${[day,date].filter(Boolean).join(' · ')} · ICT`;
  }

  function rowTier(row){
    const explicit=String(row.dataset.signalTier||'').toUpperCase();
    if(explicit)return explicit;
    const badge=row.querySelector('.signalBadge');
    const badgeTier=String(badge?.dataset?.tier||'').toUpperCase();
    if(badgeTier)return badgeTier;
    return String(row.querySelector('.matchMeta')?.textContent||'').toUpperCase();
  }

  function rowGrade(row){
    const badge=row.querySelector('.signalBadge');
    return String(badge?.dataset?.grade||'').trim() || String(row.querySelector('.matchMeta .tag')?.textContent||'').split('·')[0].trim() || '—';
  }

  function rowTeams(row){
    const names=$$('.teamLine span',row).map(x=>x.textContent.trim()).filter(Boolean);
    return {home:names[0]||'Home',away:names[1]||'Away'};
  }

  function currentRows(){
    return $$('.matchStatusPane .matchRow');
  }

  function countTier(token){
    return currentRows().filter(row=>rowTier(row).includes(token)).length;
  }

  function statusCount(status){
    const button=$(`.matchStatusTab[data-status-tab="${status}"]`);
    const count=button?.querySelector('b')?.textContent?.trim();
    if(count!==undefined&&count!==null&&count!=='')return count;
    return String($$(`.matchRow[data-match-status="${status}"]`).length);
  }

  function totalCount(){
    const head=$('.mainCol>.panel .panelHead>span');
    return head?.textContent?.trim() || String(currentRows().length);
  }

  function setDensity(next){
    if(!DENSITIES.includes(next))next='comfortable';
    document.body.dataset.frontDensity=next;
    safeSet(DENSITY_KEY,next);
    $$('.frontDensityGroup button').forEach(button=>{
      const active=button.dataset.density===next;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',active?'true':'false');
    });
  }

  function applySignalFilter(){
    const filter=signalFilter();
    currentRows().forEach(row=>{
      const tier=rowTier(row);
      const visible=filter==='all' || (filter==='focus'&&tier.includes('FOCUS')) || (filter==='watchlist'&&tier.includes('WATCHLIST'));
      row.classList.toggle('frontFilteredOut',!visible);
    });
    $$('.frontFilterGroup button').forEach(button=>{
      const active=button.dataset.signalFilter===filter;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',active?'true':'false');
    });
  }

  function setSignalFilter(next){
    if(!SIGNALS.includes(next))next='all';
    safeSet(SIGNAL_KEY,next);
    applySignalFilter();
  }

  function ensurePageHead(){
    const head=$('.shell>.pageHead');
    if(!head)return;
    const first=head.firstElementChild;
    if(first)first.classList.add('frontTitleBlock');
    const dateStrip=$('.frontLeftRail .dateStrip')||$('.shell>.dateStrip');
    let context=$('.frontDateContext',head);
    if(!context&&first){
      context=document.createElement('span');
      context.className='frontDateContext';
      first.appendChild(context);
    }
    if(context&&dateStrip)context.textContent=activeDateText(dateStrip);

    let summary=$('.frontSummary',head);
    if(!summary){
      summary=document.createElement('div');
      summary.className='frontSummary';
      const toolbar=$('.toolbar',head);
      if(toolbar)head.insertBefore(summary,toolbar); else head.appendChild(summary);
    }
    summary.innerHTML=`
      <span class="is-focus"><b>${countTier('FOCUS')}</b>Focus</span>
      <span class="is-watch"><b>${countTier('WATCHLIST')}</b>Watchlist</span>
      <span class="is-live"><b>${statusCount('live')}</b>Live</span>
      <span><b>${totalCount()}</b>Matches</span>`;
  }

  function buildLeftRail(dateStrip){
    const rail=document.createElement('aside');
    rail.className='frontLeftRail';
    rail.setAttribute('aria-label','Matchday controls');

    const dateSection=document.createElement('section');
    dateSection.className='frontRailSection';
    dateSection.innerHTML='<span class="frontRailTitle">Match date</span><strong class="frontRailDate"></strong>';
    dateSection.appendChild(dateStrip);

    const filters=document.createElement('section');
    filters.className='frontRailSection';
    filters.innerHTML=`
      <span class="frontRailTitle">Signal filter</span>
      <div class="frontFilterGroup" role="group" aria-label="Signal filter">
        <button type="button" data-signal-filter="all">All matches</button>
        <button type="button" data-signal-filter="focus">Focus only</button>
        <button type="button" data-signal-filter="watchlist">Watchlist only</button>
      </div>`;

    const densitySection=document.createElement('section');
    densitySection.className='frontRailSection';
    densitySection.innerHTML=`
      <span class="frontRailTitle">Density</span>
      <div class="frontDensityGroup" role="group" aria-label="Fixture density">
        <button type="button" data-density="comfortable">Comfortable</button>
        <button type="button" data-density="compact">Compact</button>
        <button type="button" data-density="analyst">Analyst</button>
      </div>`;

    rail.append(dateSection,filters,densitySection);
    rail.addEventListener('click',event=>{
      const filter=event.target.closest('button[data-signal-filter]');
      if(filter){setSignalFilter(filter.dataset.signalFilter);return;}
      const densityButton=event.target.closest('button[data-density]');
      if(densityButton)setDensity(densityButton.dataset.density);
    });
    return rail;
  }

  function updateLeftRail(){
    const rail=$('.frontLeftRail');
    const dateStrip=$('.dateStrip',rail||document);
    const label=$('.frontRailDate',rail||document);
    if(label&&dateStrip)label.textContent=activeDateText(dateStrip).replace(' · ICT','');
  }

  function syncBoardSignal(){
    const panel=$('.desktopFrontWorkspace .sideCol .panel');
    if(!panel)return;
    const values=$$('.kpi strong',panel);
    if(values[0])values[0].textContent=String(countTier('FOCUS'));
    if(values[1])values[1].textContent=String(statusCount('live'));
    if(values[2])values[2].textContent=String(totalCount());
  }

  function buildTopFocus(){
    const side=$('.desktopFrontWorkspace .sideCol');
    if(!side)return;
    let panel=$('.frontFocusPanel',side);
    if(!panel){
      panel=document.createElement('section');
      panel.className='panel frontFocusPanel';
      const nextPanel=side.children[1]||null;
      side.insertBefore(panel,nextPanel);
    }
    const focusRows=currentRows().filter(row=>rowTier(row).includes('FOCUS')).slice(0,5);
    panel.innerHTML=`<div class="panelHead"><h3>Top focus</h3></div><div class="frontFocusList">${focusRows.length?focusRows.map((row,index)=>{
      const teams=rowTeams(row);
      const grade=rowGrade(row);
      const href=row.getAttribute('href')||'#today';
      const time=row.querySelector('.matchTime')?.childNodes?.[0]?.textContent?.trim()||row.querySelector('.matchTime')?.textContent?.trim()||'';
      return `<a class="frontFocusItem" href="${href}"><span class="frontFocusRank">${String(index+1).padStart(2,'0')}</span><span class="frontFocusTeams"><strong>${escapeHtml(teams.home)} – ${escapeHtml(teams.away)}</strong><small>${escapeHtml(time)}</small></span><b class="frontFocusGrade">${escapeHtml(grade)}</b></a>`;
    }).join(''):'<div class="frontRailEmpty">No focus matches on this slate.</div>'}</div>`;
  }

  function escapeHtml(value){
    return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function mount(){
    const shell=$('.shell');
    if(!shell)return;
    let workspace=$(':scope>.desktopFrontWorkspace',shell);
    if(!workspace){
      const dateStrip=$(':scope>.dateStrip',shell);
      const layout=$(':scope>.layout',shell);
      if(!dateStrip||!layout)return;
      workspace=document.createElement('section');
      workspace.className='desktopFrontWorkspace';
      workspace.setAttribute('aria-label','Football operations workspace');
      shell.insertBefore(workspace,dateStrip);
      const rail=buildLeftRail(dateStrip);
      workspace.append(rail,layout);
    }
    updateLeftRail();
    ensurePageHead();
    setDensity(density());
    applySignalFilter();
    syncBoardSignal();
    buildTopFocus();
  }

  function unmount(){
    const shell=$('.shell');
    const workspace=shell?$(':scope>.desktopFrontWorkspace',shell):null;
    if(!shell||!workspace)return;
    const dateStrip=$('.frontLeftRail .dateStrip',workspace);
    const layout=$(':scope>.layout',workspace);
    if(dateStrip)shell.insertBefore(dateStrip,workspace);
    if(layout)shell.insertBefore(layout,workspace);
    workspace.remove();
    document.body.classList.remove('desktopFrontV2');
    delete document.body.dataset.frontDensity;
    $$('.matchRow.frontFilteredOut').forEach(row=>row.classList.remove('frontFilteredOut'));
  }

  function refresh(){
    scheduled=false;
    if(working)return;
    working=true;
    try{
      const currentRoute=route();
      document.body.dataset.stRoute=currentRoute;
      const active=MQ.matches&&currentRoute==='today';
      document.body.classList.toggle('desktopFrontV2',active);
      if(active)mount(); else unmount();
    }finally{working=false;}
  }

  function schedule(){
    if(scheduled||working)return;
    scheduled=true;
    requestAnimationFrame(refresh);
  }

  const observer=new MutationObserver(records=>{
    if(!records.length||working)return;
    schedule();
  });
  observer.observe(app,{childList:true,subtree:true});

  window.addEventListener('hashchange',schedule);
  window.addEventListener('sliptrace:followed-changed',schedule);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')schedule();});
  if(typeof MQ.addEventListener==='function')MQ.addEventListener('change',schedule);else MQ.addListener?.(schedule);

  schedule();
})();
