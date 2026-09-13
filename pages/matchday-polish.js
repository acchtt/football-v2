(() => {
  'use strict';

  const API = window.SLIPTRACE_API || 'https://football-v2.acchtt.workers.dev';
  const CACHE_KEYS = ['sliptrace.dashboard.compat.v2','sliptrace.dashboard.compat.v1','sliptrace.dashboard.v4'];
  const STATUS_ORDER = ['live','scheduled','ft'];
  const STATUS_LABEL = {live:'LIVE',scheduled:'SCHEDULED',ft:'FT'};
  const TAB_KEY = 'sliptrace.matchday.statusTab';

  let board = null;
  let scheduled = false;
  let working = false;
  let activeStatus = (() => {
    try {
      const saved = sessionStorage.getItem(TAB_KEY);
      return STATUS_ORDER.includes(saved) ? saved : 'live';
    } catch { return 'live'; }
  })();

  function norm(v='') {
    return String(v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
      .replace(/\b(fc|cf|afc|sc|ac|sk|fk|club)\b/g,' ')
      .replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  }

  function splitMatch(match='') {
    for (const re of [/\s+vs\.?\s+/i,/\s+v\.?\s+/i,/\s+—\s+/,/\s+–\s+/,/\s+-\s+/]) {
      const p=String(match).split(re).map(x=>x.trim()).filter(Boolean);
      if(p.length===2) return {home:p[0],away:p[1]};
    }
    return {home:String(match),away:''};
  }

  function scoreName(a,b) {
    const x=norm(a),y=norm(b); if(!x||!y)return 0;
    if(x===y)return 6; if(x.includes(y)||y.includes(x))return 4;
    const aa=new Set(x.split(' ')),bb=new Set(y.split(' ')); let s=0;
    aa.forEach(t=>bb.has(t)&&s++);
    const ratio=s/Math.max(aa.size,bb.size);
    return ratio>=.75?4:ratio>=.5?3:0;
  }

  function loadCachedBoard() {
    for (const key of CACHE_KEYS) {
      try {
        const value=JSON.parse(localStorage.getItem(key)||'null');
        if(value && Array.isArray(value.schedule)) return value;
      } catch {}
    }
    return null;
  }

  async function ensureBoard() {
    if (board && Array.isArray(board.schedule)) return board;
    board=loadCachedBoard();
    if(board) return board;
    try {
      const r=await fetch(`${API}/api/dashboard-data?polish=${Date.now()}`,{cache:'no-store'});
      const p=await r.json();
      if(r.ok && Array.isArray(p?.schedule)){board=p;return board;}
    } catch {}
    return {schedule:[]};
  }

  function bestBoardRow(home,away) {
    if(!home||!away||!board?.schedule) return null;
    let best=null,bestScore=0;
    for(const candidate of board.schedule){
      const m=splitMatch(candidate.match||'');
      const s=scoreName(home,m.home)+scoreName(away,m.away);
      if(s>bestScore){bestScore=s;best=candidate;}
    }
    return bestScore>=6?best:null;
  }

  function rowTeams(row) {
    const names=[...row.querySelectorAll('.teamLine span')].map(x=>x.textContent.trim()).filter(Boolean);
    return {home:names[0]||'',away:names[1]||''};
  }

  function boardRowFor(row) {
    const {home,away}=rowTeams(row);
    return bestBoardRow(home,away);
  }

  function parseKickoff(value,fallback='') {
    if(value){
      const ms=Date.parse(value);
      if(Number.isFinite(ms)) return ms;
    }
    const m=String(fallback).match(/\b(\d{1,2}):(\d{2})\b/);
    if(m) return Number(m[1])*60+Number(m[2]);
    return Number.MAX_SAFE_INTEGER;
  }

  function addCompetition(row,boardRow,groupName) {
    const teams=row.querySelector('.teams'); if(!teams)return;
    let label=teams.querySelector('.matchCompetition');
    const name=String(boardRow?.competition||groupName||'').trim();
    if(!name || /^competition$/i.test(name)) return;
    if(!label){label=document.createElement('div');label.className='matchCompetition';teams.appendChild(label);}
    label.textContent=name;
  }

  function rowStatus(row) {
    const clockText=(row.querySelector('.matchScore [data-clock]')?.textContent||'').trim().toUpperCase();
    if(/^FT\b/.test(clockText) || row.classList.contains('is-ft-row')) return 'ft';
    if(row.querySelector('.tag.live') || row.classList.contains('is-live-row')) return 'live';
    return 'scheduled';
  }

  function decorateRow(row,groupName) {
    const br=boardRowFor(row);
    addCompetition(row,br,groupName);
    const fallback=row.querySelector('.matchTime')?.textContent||'';
    row.dataset.kickoffSort=String(parseKickoff(br?.kickoff||br?.displayKickoff||br?.kickoffICT,fallback));
    const status=rowStatus(row);
    row.classList.toggle('is-ft-row',status==='ft');
    row.classList.toggle('is-live-row',status==='live');
    row.dataset.matchStatus=status;
  }

  function rowKey(row) {
    return row.dataset.liveEvent || row.getAttribute('href') || `${rowTeams(row).home}|${rowTeams(row).away}`;
  }

  function findPrimaryMatchdayPanel(mainCol) {
    const panels=[...mainCol.querySelectorAll(':scope > .panel')];
    return panels.find(panel=>/^(today|fixtures)$/i.test(panel.querySelector('.panelHead h2')?.textContent?.trim()||'')) || panels.at(-1) || null;
  }

  function groupNameFor(row) {
    const group=row.closest('.leagueGroup');
    if(group) return group.querySelector('.leagueTitle strong')?.textContent?.trim()||'';
    return row.querySelector('.matchCompetition')?.textContent?.trim()||'';
  }

  function sortRows(rows) {
    return rows.sort((a,b)=>Number(a.dataset.kickoffSort)-Number(b.dataset.kickoffSort));
  }

  function chooseActiveStatus(buckets, hasExistingTabs) {
    if (hasExistingTabs && STATUS_ORDER.includes(activeStatus)) return activeStatus;
    if (buckets.live.length) return 'live';
    if (buckets.scheduled.length) return 'scheduled';
    return 'ft';
  }

  function setActiveTab(root,status) {
    activeStatus=STATUS_ORDER.includes(status)?status:'live';
    try{sessionStorage.setItem(TAB_KEY,activeStatus);}catch{}
    root.querySelectorAll('[data-status-tab]').forEach(btn=>{
      const active=btn.dataset.statusTab===activeStatus;
      btn.classList.toggle('active',active);
      btn.setAttribute('aria-selected',active?'true':'false');
      btn.tabIndex=active?0:-1;
    });
    root.querySelectorAll('[data-status-pane]').forEach(pane=>{
      pane.classList.toggle('hidden',pane.dataset.statusPane!==activeStatus);
    });
  }

  function buildTabs(primary,buckets) {
    const host=document.createElement('div');
    host.className='matchStatusTabsHost';

    const tabs=document.createElement('div');
    tabs.className='matchStatusTabs';
    tabs.setAttribute('role','tablist');
    tabs.setAttribute('aria-label','Match status');

    for(const status of STATUS_ORDER){
      const btn=document.createElement('button');
      btn.type='button';
      btn.className=`matchStatusTab status-${status}`;
      btn.dataset.statusTab=status;
      btn.setAttribute('role','tab');
      btn.innerHTML=`<span class="statusDot"></span><strong>${STATUS_LABEL[status]}</strong><b>${buckets[status].length}</b>`;
      btn.addEventListener('click',()=>setActiveTab(host,status));
      tabs.appendChild(btn);
    }

    const content=document.createElement('div');
    content.className='matchStatusTabContent';
    for(const status of STATUS_ORDER){
      const pane=document.createElement('div');
      pane.className=`matchStatusPane status-${status}`;
      pane.dataset.statusPane=status;
      pane.setAttribute('role','tabpanel');

      const rows=sortRows(buckets[status]);
      if(rows.length){
        const list=document.createElement('div');
        list.className='chronoMatches';
        rows.forEach(row=>list.appendChild(row));
        pane.appendChild(list);
      } else {
        const empty=document.createElement('div');
        empty.className='empty statusEmpty';
        empty.textContent=status==='live'?'No live matches.':status==='scheduled'?'No scheduled matches.':'No finished matches.';
        pane.appendChild(empty);
      }
      content.appendChild(pane);
    }

    host.append(tabs,content);
    return host;
  }

  function needsRebuild(primary,mainCol,buckets) {
    const host=primary.querySelector(':scope > .matchStatusTabsHost');
    if(!host) return true;
    if(primary.querySelector(':scope > .leagueGroup,:scope > .chronoMatches,:scope > .matchStatusSection')) return true;
    if([...mainCol.querySelectorAll(':scope > .panel')].some(p=>/^live now$/i.test(p.querySelector('.panelHead h2')?.textContent?.trim()||''))) return true;

    for(const status of STATUS_ORDER){
      const pane=host.querySelector(`[data-status-pane="${status}"]`);
      const rows=pane?[...pane.querySelectorAll('.matchRow')]:[];
      if(rows.length!==buckets[status].length) return true;
      if(rows.some(row=>rowStatus(row)!==status)) return true;
      const keys=rows.map(rowKey).join('|');
      const target=sortRows([...buckets[status]]).map(rowKey).join('|');
      if(keys!==target) return true;
    }
    return false;
  }

  function organizeMatchday(mainCol) {
    const primary=findPrimaryMatchdayPanel(mainCol);
    if(!primary) return;

    const candidates=[...primary.querySelectorAll('.matchRow')];
    const unique=new Map();
    for(const row of candidates){
      decorateRow(row,groupNameFor(row));
      const key=rowKey(row);
      if(!unique.has(key)) unique.set(key,row);
    }

    const buckets={live:[],scheduled:[],ft:[]};
    for(const row of unique.values()) buckets[rowStatus(row)].push(row);

    const hadTabs=!!primary.querySelector(':scope > .matchStatusTabsHost');
    if(needsRebuild(primary,mainCol,buckets)){
      activeStatus=chooseActiveStatus(buckets,hadTabs);
      primary.querySelectorAll(':scope > .leagueGroup,:scope > .chronoMatches,:scope > .matchStatusSection,:scope > .matchStatusTabsHost').forEach(node=>node.remove());
      const host=buildTabs(primary,buckets);
      primary.appendChild(host);
      setActiveTab(host,activeStatus);
    }

    const headCount=primary.querySelector('.panelHead > span');
    if(headCount) headCount.textContent=String(unique.size);

    [...mainCol.querySelectorAll(':scope > .panel')].forEach(panel=>{
      if(panel!==primary && /^live now$/i.test(panel.querySelector('.panelHead h2')?.textContent?.trim()||'')) panel.remove();
    });
  }

  function decorateHero() {
    const hero=document.querySelector('.matchHero');
    if(!hero)return;
    const names=[...hero.querySelectorAll('.heroTeam span')].map(x=>x.textContent.trim()).filter(Boolean);
    const br=bestBoardRow(names[0]||'',names[1]||'');
    const league=hero.querySelector('.heroScore .league');
    if(league && br?.competition && (!league.textContent.trim() || /^competition$/i.test(league.textContent.trim()))) league.textContent=br.competition;
    const clock=document.getElementById('heroClock');
    if(clock) clock.classList.toggle('clock-ft',/^FT\b/i.test(clock.textContent.trim()));
  }

  function decorateSideRail() {
    document.querySelectorAll('.sideList .sideItem').forEach(item=>{
      const strong=item.querySelector('strong');
      const label=item.querySelector('span');
      if(!strong||!label)return;
      const teams=splitMatch(strong.textContent.trim());
      const br=bestBoardRow(teams.home,teams.away);
      if(br?.competition && (!label.textContent.trim() || /^competition$/i.test(label.textContent.trim()))) label.textContent=br.competition;
    });
  }

  function decorateExistingRows() {
    document.querySelectorAll('.matchRow').forEach(row=>decorateRow(row,groupNameFor(row)));
    decorateHero();
    decorateSideRail();
  }

  async function polish() {
    if(working)return; working=true;
    try {
      await ensureBoard();
      const mainCol=document.querySelector('.shell .layout > .mainCol');
      if(mainCol) organizeMatchday(mainCol);
      decorateExistingRows();
    } finally {working=false;}
  }

  function schedule() {
    if(scheduled)return; scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;polish();});
  }

  const observer=new MutationObserver(schedule);
  observer.observe(document.getElementById('app'),{childList:true,subtree:true,characterData:true});
  window.addEventListener('hashchange',schedule);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')schedule();});
  schedule();
})();