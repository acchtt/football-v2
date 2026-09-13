const STYLE_ORIGIN = "https://acchtt.github.io/football-v2";

function clientApp() {
  'use strict';

  const TZ = 'Asia/Ho_Chi_Minh';
  const LIVE_POLL_MS = 1000;
  const FULL_SYNC_MS = 15000;
  const root = document.getElementById('app');

  if (!root) throw new Error('SlipTrace app root is missing');

  const state = {
    day: 0,
    payload: null,
    dashboard: null,
    loading: true,
    error: '',
    lastSync: 0,
    activeStatus: 'live',
    query: '',
    liveTimer: null,
    fullTimer: null,
    liveBusy: false,
    fullBusy: false,
  };

  const esc = (v='') => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const rows = () => Array.isArray(state.payload?.fixtures) ? state.payload.fixtures : [];
  const isLive = f => f?.status === 'live';
  const isFinished = f => f?.status === 'finished';
  const kickoffValue = f => f?.boardKickoff || f?.kickoffUtcSource || (f?.kickoffTimestamp ? new Date(Number(f.kickoffTimestamp)*1000).toISOString() : null);

  function dayKey(offset=0) {
    const d = new Date(Date.now() + offset * 86400000);
    const p = new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
    const get = t => p.find(x=>x.type===t)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  function formatTime(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('en-GB',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hour12:false}).format(d);
  }

  function formatDate(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('en-US',{timeZone:TZ,weekday:'short',month:'short',day:'numeric'}).format(d);
  }

  function statusLabel(f) {
    if (isFinished(f)) return 'FT';
    if (isLive(f)) return f.minute ? `${f.minute}′` : (f.statusText || 'LIVE');
    return formatTime(kickoffValue(f));
  }

  async function fetchJson(url, attempts=3) {
    let last;
    for (let i=0;i<attempts;i++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(()=>controller.abort(), 8000);
        let response;
        try {
          response = await fetch(url,{cache:'no-store',headers:{Accept:'application/json'},signal:controller.signal});
        } finally {
          clearTimeout(timeout);
        }
        const raw = await response.text();
        let payload;
        try { payload = raw ? JSON.parse(raw) : null; }
        catch { throw new Error(`Non-JSON HTTP ${response.status}: ${raw.slice(0,110).replace(/\s+/g,' ')}`); }
        if (!response.ok || payload?.ok === false) throw new Error(payload?.error || `HTTP ${response.status}`);
        return payload;
      } catch (error) {
        last = error;
        if (i < attempts-1) await new Promise(r=>setTimeout(r,350*(i+1)));
      }
    }
    throw last || new Error('Request failed');
  }

  async function loadDashboard() {
    try { state.dashboard = await fetchJson('/api/dashboard-data',2); }
    catch { state.dashboard = state.dashboard || {schedule:[],picks:[]}; }
  }

  async function loadBoard() {
    if (state.fullBusy) return;
    state.fullBusy = true;
    try {
      const payload = await fetchJson(`/api/board?day=${state.day}&t=${Date.now()}`,3);
      state.payload = payload;
      state.lastSync = Date.now();
      state.error = '';
      if (!rows().some(isLive) && state.activeStatus === 'live') state.activeStatus = rows().some(f=>!isLive(f)&&!isFinished(f)) ? 'scheduled' : 'ft';
    } catch (error) {
      state.error = error?.message || String(error);
    } finally {
      state.loading = false;
      state.fullBusy = false;
      render();
    }
  }

  function mergeLive(payload) {
    if (!state.payload) return;
    const map = new Map(rows().map(f=>[f.matchId,f]));
    const previousLive = new Set(rows().filter(isLive).map(f=>f.matchId));
    const nextLive = new Set();
    for (const live of payload.fixtures || []) {
      if (!map.has(live.matchId)) continue;
      nextLive.add(live.matchId);
      map.set(live.matchId,{...map.get(live.matchId),...live});
    }
    const disappeared = [...previousLive].some(id=>!nextLive.has(id));
    const fixtures = [...map.values()];
    state.payload = {...state.payload,fixtures,liveCount:fixtures.filter(isLive).length,generatedAt:payload.generatedAt || new Date().toISOString()};
    state.lastSync = Date.now();
    render();
    if (disappeared) loadBoard();
  }

  async function pollLive() {
    if (document.visibilityState === 'hidden') { scheduleLive(); return; }
    if (state.liveBusy) { scheduleLive(); return; }
    state.liveBusy = true;
    try {
      const p = await fetchJson(`/api/live?day=${state.day}&t=${Date.now()}`,1);
      mergeLive(p);
    } catch {}
    finally { state.liveBusy = false; scheduleLive(); }
  }

  function scheduleLive() {
    clearTimeout(state.liveTimer);
    state.liveTimer = setTimeout(pollLive,LIVE_POLL_MS);
  }

  function restartPolling() {
    clearTimeout(state.liveTimer);
    clearInterval(state.fullTimer);
    state.loading = !state.payload;
    render();
    loadBoard().then(pollLive);
    state.fullTimer = setInterval(()=>{ if(document.visibilityState==='visible') loadBoard(); },FULL_SYNC_MS);
  }

  function routeName() {
    const h = location.hash || '#today';
    if (h.startsWith('#match/')) return 'match';
    if (h.startsWith('#search/')) return 'search';
    return h.slice(1) || 'today';
  }

  function header(route) {
    const active = name => route===name ? 'active' : '';
    const sourceOk = !state.error;
    return `<header class="appHeader"><div class="headerInner">
      <a class="brand" href="#today"><span class="brandMark">ST</span><span>SLIPTRACE</span></a>
      <nav class="topNav"><a class="${active('today')}" href="#today">Matchday</a><a class="${active('board')}" href="#board">Board</a><a class="${active('leagues')}" href="#leagues">Competitions</a><a class="${active('teams')}" href="#teams">Teams</a><a class="${active('picks')}" href="#picks">Picks</a></nav>
      <form class="headerSearch" id="globalSearch"><input aria-label="Search" placeholder="Search board teams…" value="${esc(state.query)}" /></form>
      <div class="systemState"><span><i class="dot ${sourceOk?'live':'warn'}"></i>SOCCERWAY ${sourceOk?'LIVE':'DELAYED'}</span><span>${state.lastSync?new Date(state.lastSync).toLocaleTimeString('en-GB',{hour12:false}):'—'}</span></div>
    </div></header>`;
  }

  function mobileNav(route) {
    const a = n => route===n ? 'active' : '';
    return `<nav class="mobileNav"><a class="${a('today')}" href="#today">Today</a><a class="${a('board')}" href="#board">Board</a><a class="${a('leagues')}" href="#leagues">Leagues</a><a class="${a('teams')}" href="#teams">Teams</a><a class="${a('picks')}" href="#picks">Picks</a></nav>`;
  }

  function dateStrip() {
    return `<div class="dateStrip">${[-3,-2,-1,0,1,2,3].map(o=>{
      const d=dayKey(o);const dt=new Date(`${d}T12:00:00Z`);const label=o===0?'Today':new Intl.DateTimeFormat('en-US',{weekday:'short',timeZone:'UTC'}).format(dt);
      return `<button class="dateBtn ${state.day===o?'active':''}" data-day="${o}"><small>${label}</small><strong>${d.slice(5).replace('-','/')}</strong></button>`;
    }).join('')}</div>`;
  }

  function matchRow(f,boardMode=false) {
    const score = f.homeScore!=null && f.awayScore!=null ? `${f.homeScore}–${f.awayScore}` : '–';
    const cls = isLive(f) ? 'is-live-row' : isFinished(f) ? 'is-ft-row' : '';
    const liveTag = isLive(f) ? '<span class="tag live"><i class="dot bad"></i>LIVE</span>' : esc(formatTime(kickoffValue(f)));
    const tier = `<span class="tag ${f.tier==='FOCUS'?'live':'ws'}">${esc(f.grade||'—')} · ${esc(f.tier||'—')}</span>`;
    const scoreText = boardMode ? esc(f.structure || '—') : score;
    const clock = boardMode ? (f.matchedToSoccerway ? 'SOCCERWAY' : 'BOARD ONLY') : statusLabel(f);
    return `<a class="matchRow ${cls}" href="#match/${encodeURIComponent(f.matchId)}" data-live-event="${esc(f.matchId)}">
      <div class="matchTime">${liveTag}<small>${isLive(f)?esc(f.statusText||'LIVE'):esc(f.region||'')}</small></div>
      <div class="teams"><div class="teamLine"><span></span><span>${esc(f.homeTeam)}</span></div><div class="teamLine"><span></span><span>${esc(f.awayTeam)}</span></div><div class="matchCompetition">${esc(f.competition||'')}</div></div>
      <div class="matchMeta">${tier}</div>
      <div class="matchScore"><strong>${scoreText}</strong><small data-clock>${esc(clock)}</small></div>
    </a>`;
  }

  function filteredRows() {
    const q = state.query.trim().toLowerCase();
    let out = rows();
    if (q) out = out.filter(f=>(`${f.homeTeam} ${f.awayTeam} ${f.competition} ${f.tier} ${f.grade}`).toLowerCase().includes(q));
    return out.slice().sort((a,b)=>(Date.parse(kickoffValue(a))||0)-(Date.parse(kickoffValue(b))||0));
  }

  function statusTabs(list) {
    const buckets = {live:list.filter(isLive),scheduled:list.filter(f=>!isLive(f)&&!isFinished(f)),ft:list.filter(isFinished)};
    const status = state.activeStatus;
    const selected = buckets[status] || [];
    return `<div class="matchStatusTabsHost"><div class="matchStatusTabs" role="tablist">
      ${['live','scheduled','ft'].map(s=>`<button class="matchStatusTab status-${s} ${status===s?'active':''}" data-status-tab="${s}"><span class="statusDot"></span><strong>${s==='ft'?'FT':s.toUpperCase()}</strong><b>${buckets[s].length}</b></button>`).join('')}
      </div><div class="matchStatusTabContent"><div class="matchStatusPane"><div class="chronoMatches">${selected.length?selected.map(f=>matchRow(f)).join(''):`<div class="empty statusEmpty">${status==='live'?'No live board matches.':status==='scheduled'?'No scheduled board matches.':'No finished board matches.'}</div>`}</div></div></div></div>`;
  }

  function nextUp(list) {
    const upcoming=list.filter(f=>!isLive(f)&&!isFinished(f)).slice(0,6);
    return upcoming.map(f=>`<a class="sideItem" href="#match/${encodeURIComponent(f.matchId)}"><div><strong>${esc(f.homeTeam)} – ${esc(f.awayTeam)}</strong><span>${esc(f.competition||'')}</span></div><b>${esc(formatTime(kickoffValue(f)))}</b></a>`).join('') || '<div class="empty">No upcoming matches.</div>';
  }

  function todayPage() {
    const list=filteredRows();
    const live=list.filter(isLive);
    const p=state.payload||{};
    return `${header('today')}<main class="shell"><div class="pageHead"><div><span class="eyebrow">Football operations</span><h1>Matchday</h1><p class="subtle">FOCUS/WATCHLIST board only. Soccerway is the live score and match-state source. Times shown in ICT.</p></div><div class="toolbar"><button class="toolBtn" id="refreshToday">Refresh</button></div></div>
      ${state.error?`<div class="statusBanner error">${esc(state.error)} · retrying automatically.</div>`:''}${dateStrip()}
      <div class="layout"><div class="mainCol"><section class="panel"><div class="panelHead"><h2>${state.day===0?'Today':'Fixtures'}</h2><span>${list.length}</span></div>${statusTabs(list)}</section></div>
      <aside class="sideCol"><section class="panel"><div class="panelHead"><h3>Board signal</h3></div><div class="kpis"><div class="kpi"><span>Focus</span><strong>${p.focusCount||0}</strong></div><div class="kpi"><span>Live</span><strong>${live.length}</strong></div><div class="kpi"><span>Matched</span><strong>${p.matchedCount||0}</strong></div></div></section>
      <section class="panel"><div class="panelHead"><h3>Next up</h3></div><div class="sideList">${nextUp(list)}</div></section></aside></div></main>${mobileNav('today')}`;
  }

  function boardPage() {
    const list=filteredRows();
    return `${header('board')}<main class="shell"><div class="pageHead"><div><span class="eyebrow">Model layer</span><h1>Board</h1><p class="subtle">Airtable FOCUS/WATCHLIST decisions with Soccerway live state merged onto each matched fixture.</p></div></div>${dateStrip()}<section class="panel"><div class="panelHead"><h2>Focus & watchlist</h2><span>${list.length}</span></div>${list.length?`<div class="chronoMatches">${list.map(f=>matchRow(f,true)).join('')}</div>`:'<div class="empty">No board rows for this date.</div>'}</section></main>${mobileNav('board')}`;
  }

  function leaguesPage() {
    const list=filteredRows();const map=new Map();
    for(const f of list){const k=f.competition||'Other';if(!map.has(k))map.set(k,{name:k,count:0,live:0});const x=map.get(k);x.count++;if(isLive(f))x.live++;}
    const cards=[...map.values()].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
    return `${header('leagues')}<main class="shell"><div class="pageHead"><div><span class="eyebrow">Board competitions</span><h1>Competitions</h1><p class="subtle">Competitions currently represented on the selected FOCUS/WATCHLIST slate.</p></div></div>${dateStrip()}<div class="cards">${cards.map(x=>`<div class="entityCard"><div><h3>${esc(x.name)}</h3><p>${x.count} board matches · ${x.live} live</p></div></div>`).join('')||'<div class="empty">No competitions.</div>'}</div></main>${mobileNav('leagues')}`;
  }

  function teamsPage() {
    const list=filteredRows();const map=new Map();
    for(const f of list){for(const name of [f.homeTeam,f.awayTeam]){if(!map.has(name))map.set(name,{name,count:0,live:0});const x=map.get(name);x.count++;if(isLive(f))x.live++;}}
    const cards=[...map.values()].sort((a,b)=>a.name.localeCompare(b.name));
    return `${header('teams')}<main class="shell"><div class="pageHead"><div><span class="eyebrow">Board clubs</span><h1>Teams</h1><p class="subtle">Teams appearing on the current model board.</p></div></div>${dateStrip()}<div class="cards">${cards.map(x=>`<div class="entityCard"><div><h3>${esc(x.name)}</h3><p>${x.count} board appearance${x.count===1?'':'s'}${x.live?` · ${x.live} live`:''}</p></div></div>`).join('')||'<div class="empty">No teams.</div>'}</div></main>${mobileNav('teams')}`;
  }

  function picksPage() {
    const picks=Array.isArray(state.dashboard?.picks)?state.dashboard.picks:[];
    return `${header('picks')}<main class="shell"><div class="pageHead"><div><span class="eyebrow">Decision record</span><h1>Picks</h1><p class="subtle">Official SlipTrace picks from the existing board database.</p></div></div><section class="panel"><div class="panelHead"><h2>All picks</h2><span>${picks.length}</span></div>${picks.length?picks.map(p=>`<div class="matchRow"><div class="matchTime">${esc(formatDate(p.kickoff))}<small>${esc(formatTime(p.kickoff))}</small></div><div class="teams"><div class="teamLine"><span></span><span>${esc(p.match||'Match')}</span></div><div class="matchCompetition">${esc(p.competition||'')}</div></div><div class="matchMeta"><span class="tag">OVER ${esc(p.line||'—')} @ ${esc(p.odds||'—')}</span></div><div class="matchScore"><strong>${esc(p.result||'PENDING')}</strong><small>${p.pl!=null?`${Number(p.pl)>0?'+':''}${Number(p.pl).toFixed(2)}u`:''}</small></div></div>`).join(''):'<div class="empty">No picks.</div>'}</section></main>${mobileNav('picks')}`;
  }

  function matchPage(id) {
    const f=rows().find(x=>String(x.matchId)===id);
    if(!f) return `${header('today')}<main class="shell"><a class="backLink" href="#today">← Matchday</a><div class="statusBanner error">Match is not on the current board view.</div></main>${mobileNav('today')}`;
    const score=f.homeScore!=null&&f.awayScore!=null?`${f.homeScore} – ${f.awayScore}`:formatTime(kickoffValue(f));
    return `${header('today')}<main class="shell"><a class="backLink" href="#today">← Matchday</a><section class="matchHero"><div class="matchHeroMain"><div class="heroTeam"><span>${esc(f.homeTeam)}</span></div><div class="heroScore"><div class="league">${esc(f.competition||'Competition')}</div><div class="score">${esc(score)}</div><span class="clock ${isFinished(f)?'clock-ft':''}">${esc(statusLabel(f))}</span></div><div class="heroTeam away"><span>${esc(f.awayTeam)}</span></div></div><div class="heroFoot"><span>${esc(formatDate(kickoffValue(f)))}</span><span>${esc(formatTime(kickoffValue(f)))} ICT</span><span>${f.matchedToSoccerway?'SOCCERWAY MATCHED':'BOARD ONLY'}</span></div></section>
      <div class="matchColumns"><div class="mainCol"><section class="panel modelPanel"><div class="panelHead"><h3>SlipTrace model</h3><span>Airtable + Soccerway</span></div><div class="modelGrid"><div class="modelCell"><span>PRE grade</span><strong>${esc(f.grade||'—')}</strong></div><div class="modelCell"><span>Tier</span><strong>${esc(f.tier||'—')}</strong></div><div class="modelCell"><span>Structure</span><strong>${esc(f.structure||'—')}</strong></div><div class="modelCell"><span>Score source</span><strong>${f.matchedToSoccerway?'SOCCERWAY':'—'}</strong></div><div class="modelCell"><span>Status</span><strong>${esc((f.status||'scheduled').toUpperCase())}</strong></div><div class="modelCell"><span>Minute</span><strong>${esc(f.minute||'—')}</strong></div></div></section></div><aside class="sideCol"><section class="panel"><div class="panelHead"><h3>Live state</h3><span>${f.matchedToSoccerway?'1s polling':'unmatched'}</span></div><div class="modelGrid"><div class="modelCell"><span>Home</span><strong>${f.homeScore==null?'—':f.homeScore}</strong></div><div class="modelCell"><span>Away</span><strong>${f.awayScore==null?'—':f.awayScore}</strong></div><div class="modelCell"><span>State</span><strong>${esc(statusLabel(f))}</strong></div></div></section></aside></div></main>${mobileNav('today')}`;
  }

  function searchPage(q) { state.query=q; return todayPage(); }

  function skeleton() {
    return `${header(routeName())}<main class="shell"><div class="pageHead"><div><span class="eyebrow">Loading</span><h1>SlipTrace</h1><p class="subtle">Connecting to board and Soccerway…</p></div></div><section class="panel">${Array.from({length:7},()=>'<div class="skeleton"></div>').join('')}</section></main>${mobileNav(routeName())}`;
  }

  function render() {
    if(state.loading && !state.payload){root.innerHTML=skeleton();bind();return;}
    const route=routeName();
    const h=location.hash||'#today';
    if(route==='today')root.innerHTML=todayPage();
    else if(route==='board')root.innerHTML=boardPage();
    else if(route==='leagues')root.innerHTML=leaguesPage();
    else if(route==='teams')root.innerHTML=teamsPage();
    else if(route==='picks')root.innerHTML=picksPage();
    else if(route==='match'){let id='';try{id=decodeURIComponent(h.slice('#match/'.length));}catch{id=h.slice('#match/'.length);}root.innerHTML=matchPage(id);}
    else if(route==='search'){let q='';try{q=decodeURIComponent(h.slice('#search/'.length));}catch{}root.innerHTML=searchPage(q);}
    else {location.hash='#today';return;}
    bind();
  }

  function bind() {
    document.querySelectorAll('[data-day]').forEach(b=>b.addEventListener('click',()=>{state.day=Number(b.dataset.day);state.query='';restartPolling();}));
    document.querySelectorAll('[data-status-tab]').forEach(b=>b.addEventListener('click',()=>{state.activeStatus=b.dataset.statusTab;render();}));
    document.getElementById('refreshToday')?.addEventListener('click',()=>loadBoard());
    const form=document.getElementById('globalSearch');
    if(form)form.addEventListener('submit',e=>{e.preventDefault();const q=form.querySelector('input')?.value.trim()||'';state.query=q;if(q)location.hash=`#search/${encodeURIComponent(q)}`;else{location.hash='#today';render();}});
  }

  window.addEventListener('hashchange',render);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){loadBoard();clearTimeout(state.liveTimer);pollLive();}});

  render();
  Promise.all([loadDashboard(),loadBoard()]).finally(()=>{
    state.loading=false;
    render();
    pollLive();
    state.fullTimer=setInterval(()=>{if(document.visibilityState==='visible')loadBoard();},FULL_SYNC_MS);
  });
}

export function clientScript() {
  return `(${clientApp.toString()})();`;
}

export function renderSiteHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>SlipTrace Football · Soccerway</title>
  <meta name="description" content="SlipTrace FOCUS and WATCHLIST matchday board with near-real-time Soccerway live scores." />
  <meta name="theme-color" content="#090b0f" />
  <link rel="preconnect" href="${STYLE_ORIGIN}" crossorigin />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="${STYLE_ORIGIN}/app-v2.css?v=1" />
  <link rel="stylesheet" href="${STYLE_ORIGIN}/app-polish.css?v=3" />
  <style>
    .source-note{color:var(--cyan)}
    .matchCompetition{display:block}
    .entityCard{min-height:78px}
    .matchHero .heroTeam{justify-content:center;text-align:center}
    .matchHero .heroTeam.away{justify-content:center;text-align:center}
    .matchHero .heroScore .clock{min-width:62px}
    .bootShell{max-width:1420px;margin:0 auto;padding:24px 22px 50px}
    @media(max-width:760px){.matchCompetition{margin-left:0}.headerSearch{width:min(250px,68vw)}}
  </style>
</head>
<body>
  <main id="app" aria-live="polite"><div class="bootShell"><section class="panel"><div class="panelHead"><h2>SlipTrace</h2><span>Soccerway</span></div><div class="empty">Loading FOCUS / WATCHLIST board…</div></section></div></main>
  <script src="/app.js?v=2" defer></script>
</body>
</html>`;
}