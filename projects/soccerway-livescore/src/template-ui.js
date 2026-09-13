const STYLE_ORIGIN = "https://acchtt.github.io/football-v2";
const TZ = "Asia/Ho_Chi_Minh";

function escHtml(v = "") {
  return String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function kickoffValue(f) {
  return f?.boardKickoff || f?.kickoffUtcSource || (f?.kickoffTimestamp ? new Date(Number(f.kickoffTimestamp) * 1000).toISOString() : null);
}

function formatTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

function dayKey(offset = 0) {
  const d = new Date(Date.now() + offset * 86400000);
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t) => p.find((x) => x.type === t)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function isLive(f) { return f?.status === "live"; }
function isFinished(f) { return f?.status === "finished"; }

function statusLabel(f) {
  if (isFinished(f)) return "FT";
  if (isLive(f)) return f?.minute ? `${f.minute}′` : (f?.statusText || "LIVE");
  return formatTime(kickoffValue(f));
}

function ssrDateStrip(activeDay = 0) {
  return `<div class="dateStrip">${[-3,-2,-1,0,1,2,3].map((o) => {
    const d = dayKey(o);
    const dt = new Date(`${d}T12:00:00Z`);
    const label = o === 0 ? "Today" : new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(dt);
    return `<button class="dateBtn ${activeDay === o ? "active" : ""}" data-day="${o}"><small>${label}</small><strong>${d.slice(5).replace("-", "/")}</strong></button>`;
  }).join("")}</div>`;
}

function ssrMatchRow(f) {
  const score = f?.homeScore != null && f?.awayScore != null ? `${f.homeScore}–${f.awayScore}` : "–";
  const cls = isLive(f) ? "is-live-row" : isFinished(f) ? "is-ft-row" : "";
  const time = isLive(f)
    ? '<span class="tag live"><i class="dot bad"></i>LIVE</span>'
    : escHtml(formatTime(kickoffValue(f)));
  const tierClass = f?.tier === "FOCUS" ? "live" : "ws";
  return `<a class="matchRow ${cls}" href="#match/${encodeURIComponent(f?.matchId || "")}" data-live-event="${escHtml(f?.matchId || "")}">
    <div class="matchTime">${time}<small>${isLive(f) ? escHtml(f?.statusText || "LIVE") : escHtml(f?.region || "")}</small></div>
    <div class="teams"><div class="teamLine"><span></span><span>${escHtml(f?.homeTeam || "")}</span></div><div class="teamLine"><span></span><span>${escHtml(f?.awayTeam || "")}</span></div><div class="matchCompetition">${escHtml(f?.competition || "")}</div></div>
    <div class="matchMeta"><span class="tag ${tierClass}">${escHtml(f?.grade || "—")} · ${escHtml(f?.tier || "—")}</span></div>
    <div class="matchScore"><strong>${escHtml(score)}</strong><small data-clock>${escHtml(statusLabel(f))}</small></div>
  </a>`;
}

function ssrStatusTabs(list) {
  const buckets = {
    live: list.filter(isLive),
    scheduled: list.filter((f) => !isLive(f) && !isFinished(f)),
    ft: list.filter(isFinished),
  };
  const active = buckets.live.length ? "live" : buckets.scheduled.length ? "scheduled" : "ft";
  const selected = buckets[active];
  return `<div class="matchStatusTabsHost"><div class="matchStatusTabs" role="tablist">
    ${["live","scheduled","ft"].map((s) => `<button class="matchStatusTab status-${s} ${active === s ? "active" : ""}" data-status-tab="${s}"><span class="statusDot"></span><strong>${s === "ft" ? "FT" : s.toUpperCase()}</strong><b>${buckets[s].length}</b></button>`).join("")}
  </div><div class="matchStatusTabContent"><div class="matchStatusPane"><div class="chronoMatches">${selected.length ? selected.map(ssrMatchRow).join("") : `<div class="empty statusEmpty">No ${active === "ft" ? "finished" : active} board matches.</div>`}</div></div></div></div>`;
}

function ssrHeader() {
  return `<header class="appHeader"><div class="headerInner">
    <a class="brand" href="#today"><span class="brandMark">ST</span><span>SLIPTRACE</span></a>
    <nav class="topNav"><a class="active" href="#today">Matchday</a><a href="#board">Board</a><a href="#leagues">Competitions</a><a href="#teams">Teams</a><a href="#picks">Picks</a></nav>
    <form class="headerSearch" id="globalSearch"><input aria-label="Search" placeholder="Search board teams…" /></form>
    <div class="systemState"><span><i class="dot live"></i>SOCCERWAY LIVE</span><span>SERVER RENDER</span></div>
  </div></header>`;
}

function ssrBody(initial) {
  const list = Array.isArray(initial?.fixtures) ? initial.fixtures.slice().sort((a,b) => (Date.parse(kickoffValue(a)) || 0) - (Date.parse(kickoffValue(b)) || 0)) : [];
  const live = list.filter(isLive);
  const upcoming = list.filter((f) => !isLive(f) && !isFinished(f)).slice(0, 6);
  const nextUp = upcoming.map((f) => `<a class="sideItem" href="#match/${encodeURIComponent(f?.matchId || "")}"><div><strong>${escHtml(f?.homeTeam || "")} – ${escHtml(f?.awayTeam || "")}</strong><span>${escHtml(f?.competition || "")}</span></div><b>${escHtml(formatTime(kickoffValue(f)))}</b></a>`).join("") || '<div class="empty">No upcoming matches.</div>';
  return `${ssrHeader()}<main class="shell"><div class="pageHead"><div><span class="eyebrow">Football operations</span><h1>Matchday</h1><p class="subtle">FOCUS/WATCHLIST board only. Soccerway is the live score and match-state source. Times shown in ICT.</p></div><div class="toolbar"><button class="toolBtn" id="refreshToday">Refresh</button></div></div>
    ${ssrDateStrip(0)}
    <div class="layout"><div class="mainCol"><section class="panel"><div class="panelHead"><h2>Today</h2><span>${list.length}</span></div>${ssrStatusTabs(list)}</section></div>
    <aside class="sideCol"><section class="panel"><div class="panelHead"><h3>Board signal</h3></div><div class="kpis"><div class="kpi"><span>Focus</span><strong>${Number(initial?.focusCount || 0)}</strong></div><div class="kpi"><span>Live</span><strong>${live.length}</strong></div><div class="kpi"><span>Matched</span><strong>${Number(initial?.matchedCount || 0)}</strong></div></div></section>
    <section class="panel"><div class="panelHead"><h3>Next up</h3></div><div class="sideList">${nextUp}</div></section></aside></div></main>
    <nav class="mobileNav"><a class="active" href="#today">Today</a><a href="#board">Board</a><a href="#leagues">Leagues</a><a href="#teams">Teams</a><a href="#picks">Picks</a></nav>`;
}

function clientApp() {
  'use strict';

  const TZ = 'Asia/Ho_Chi_Minh';
  const LIVE_POLL_MS = 1000;
  const FULL_SYNC_MS = 15000;
  const root = document.getElementById('app');
  if (!root) return;

  document.documentElement.dataset.appBooted = '1';

  const initial = window.__SLIPTRACE_INITIAL__ && typeof window.__SLIPTRACE_INITIAL__ === 'object'
    ? window.__SLIPTRACE_INITIAL__
    : null;

  const state = {
    day: Number(initial?.day || 0),
    payload: initial,
    dashboard: null,
    loading: !initial,
    error: '',
    lastSync: initial?.generatedAt ? Date.parse(initial.generatedAt) || Date.now() : Date.now(),
    activeStatus: initial?.fixtures?.some((f) => f?.status === 'live') ? 'live' : 'scheduled',
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
  const kickoff = f => f?.boardKickoff || f?.kickoffUtcSource || (f?.kickoffTimestamp ? new Date(Number(f.kickoffTimestamp)*1000).toISOString() : null);

  function dayKey(offset=0){const d=new Date(Date.now()+offset*86400000);const p=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);const get=t=>p.find(x=>x.type===t)?.value||'';return `${get('year')}-${get('month')}-${get('day')}`;}
  function fmtTime(value){const d=new Date(value);if(Number.isNaN(d.getTime()))return'—';return new Intl.DateTimeFormat('en-GB',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hour12:false}).format(d);}
  function fmtDate(value){const d=new Date(value);if(Number.isNaN(d.getTime()))return'—';return new Intl.DateTimeFormat('en-US',{timeZone:TZ,weekday:'short',month:'short',day:'numeric'}).format(d);}
  function label(f){if(isFinished(f))return'FT';if(isLive(f))return f.minute?`${f.minute}′`:(f.statusText||'LIVE');return fmtTime(kickoff(f));}

  async function fetchJson(url,attempts=2){let last;for(let i=0;i<attempts;i++){try{const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),7000);let response;try{response=await fetch(url,{cache:'no-store',headers:{Accept:'application/json'},signal:controller.signal});}finally{clearTimeout(timeout);}const raw=await response.text();let payload;try{payload=raw?JSON.parse(raw):null;}catch{throw new Error(`Non-JSON HTTP ${response.status}`);}if(!response.ok||payload?.ok===false)throw new Error(payload?.error||`HTTP ${response.status}`);return payload;}catch(error){last=error;if(i<attempts-1)await new Promise(r=>setTimeout(r,300));}}throw last||new Error('Request failed');}

  async function loadDashboard(){try{state.dashboard=await fetchJson('/api/dashboard-data',1);}catch{state.dashboard=state.dashboard||{schedule:[],picks:[]};}}
  async function loadBoard(){if(state.fullBusy)return;state.fullBusy=true;try{const p=await fetchJson(`/api/board?day=${state.day}&t=${Date.now()}`,2);state.payload=p;state.lastSync=Date.now();state.error='';if(!rows().some(isLive)&&state.activeStatus==='live')state.activeStatus=rows().some(f=>!isLive(f)&&!isFinished(f))?'scheduled':'ft';}catch(e){state.error=e?.message||String(e);}finally{state.loading=false;state.fullBusy=false;render();}}

  function mergeLive(p){if(!state.payload)return;const map=new Map(rows().map(f=>[f.matchId,f]));const before=new Set(rows().filter(isLive).map(f=>f.matchId));const next=new Set();for(const live of p.fixtures||[]){if(!map.has(live.matchId))continue;next.add(live.matchId);map.set(live.matchId,{...map.get(live.matchId),...live});}const disappeared=[...before].some(id=>!next.has(id));const fixtures=[...map.values()];state.payload={...state.payload,fixtures,liveCount:fixtures.filter(isLive).length,generatedAt:p.generatedAt||new Date().toISOString()};state.lastSync=Date.now();render();if(disappeared)loadBoard();}
  async function pollLive(){if(document.visibilityState==='hidden'){scheduleLive();return;}if(state.liveBusy){scheduleLive();return;}state.liveBusy=true;try{mergeLive(await fetchJson(`/api/live?day=${state.day}&t=${Date.now()}`,1));}catch{}finally{state.liveBusy=false;scheduleLive();}}
  function scheduleLive(){clearTimeout(state.liveTimer);state.liveTimer=setTimeout(pollLive,LIVE_POLL_MS);}
  function restart(){clearTimeout(state.liveTimer);clearInterval(state.fullTimer);loadBoard().then(pollLive);state.fullTimer=setInterval(()=>{if(document.visibilityState==='visible')loadBoard();},FULL_SYNC_MS);}

  function route(){const h=location.hash||'#today';if(h.startsWith('#match/'))return'match';if(h.startsWith('#search/'))return'search';return h.slice(1)||'today';}
  function header(active){const a=n=>active===n?'active':'';return `<header class="appHeader"><div class="headerInner"><a class="brand" href="#today"><span class="brandMark">ST</span><span>SLIPTRACE</span></a><nav class="topNav"><a class="${a('today')}" href="#today">Matchday</a><a class="${a('board')}" href="#board">Board</a><a class="${a('leagues')}" href="#leagues">Competitions</a><a class="${a('teams')}" href="#teams">Teams</a><a class="${a('picks')}" href="#picks">Picks</a></nav><form class="headerSearch" id="globalSearch"><input aria-label="Search" placeholder="Search board teams…" value="${esc(state.query)}" /></form><div class="systemState"><span><i class="dot ${state.error?'warn':'live'}"></i>SOCCERWAY ${state.error?'DELAYED':'LIVE'}</span><span>${new Date(state.lastSync||Date.now()).toLocaleTimeString('en-GB',{hour12:false})}</span></div></div></header>`;}
  function mobile(active){const a=n=>active===n?'active':'';return `<nav class="mobileNav"><a class="${a('today')}" href="#today">Today</a><a class="${a('board')}" href="#board">Board</a><a class="${a('leagues')}" href="#leagues">Leagues</a><a class="${a('teams')}" href="#teams">Teams</a><a class="${a('picks')}" href="#picks">Picks</a></nav>`;}
  function dateStrip(){return `<div class="dateStrip">${[-3,-2,-1,0,1,2,3].map(o=>{const d=dayKey(o);const dt=new Date(`${d}T12:00:00Z`);const name=o===0?'Today':new Intl.DateTimeFormat('en-US',{weekday:'short',timeZone:'UTC'}).format(dt);return `<button class="dateBtn ${state.day===o?'active':''}" data-day="${o}"><small>${name}</small><strong>${d.slice(5).replace('-','/')}</strong></button>`;}).join('')}</div>`;}
  function row(f,boardMode=false){const score=f.homeScore!=null&&f.awayScore!=null?`${f.homeScore}–${f.awayScore}`:'–';const cls=isLive(f)?'is-live-row':isFinished(f)?'is-ft-row':'';const time=isLive(f)?'<span class="tag live"><i class="dot bad"></i>LIVE</span>':esc(fmtTime(kickoff(f)));const tier=`<span class="tag ${f.tier==='FOCUS'?'live':'ws'}">${esc(f.grade||'—')} · ${esc(f.tier||'—')}</span>`;return `<a class="matchRow ${cls}" href="#match/${encodeURIComponent(f.matchId)}"><div class="matchTime">${time}<small>${isLive(f)?esc(f.statusText||'LIVE'):esc(f.region||'')}</small></div><div class="teams"><div class="teamLine"><span></span><span>${esc(f.homeTeam)}</span></div><div class="teamLine"><span></span><span>${esc(f.awayTeam)}</span></div><div class="matchCompetition">${esc(f.competition||'')}</div></div><div class="matchMeta">${tier}</div><div class="matchScore"><strong>${boardMode?esc(f.structure||'—'):esc(score)}</strong><small>${boardMode?(f.matchedToSoccerway?'SOCCERWAY':'BOARD ONLY'):esc(label(f))}</small></div></a>`;}
  function filtered(){const q=state.query.trim().toLowerCase();let out=rows();if(q)out=out.filter(f=>(`${f.homeTeam} ${f.awayTeam} ${f.competition} ${f.tier} ${f.grade}`).toLowerCase().includes(q));return out.slice().sort((a,b)=>(Date.parse(kickoff(a))||0)-(Date.parse(kickoff(b))||0));}
  function tabs(list){const b={live:list.filter(isLive),scheduled:list.filter(f=>!isLive(f)&&!isFinished(f)),ft:list.filter(isFinished)};const s=state.activeStatus;const selected=b[s]||[];return `<div class="matchStatusTabsHost"><div class="matchStatusTabs">${['live','scheduled','ft'].map(x=>`<button class="matchStatusTab status-${x} ${s===x?'active':''}" data-status-tab="${x}"><span class="statusDot"></span><strong>${x==='ft'?'FT':x.toUpperCase()}</strong><b>${b[x].length}</b></button>`).join('')}</div><div class="matchStatusTabContent"><div class="chronoMatches">${selected.length?selected.map(f=>row(f)).join(''):`<div class="empty statusEmpty">No ${s} board matches.</div>`}</div></div></div>`;}

  function today(){const list=filtered();const p=state.payload||{};const upcoming=list.filter(f=>!isLive(f)&&!isFinished(f)).slice(0,6);return `${header('today')}<main class="shell"><div class="pageHead"><div><span class="eyebrow">Football operations</span><h1>Matchday</h1><p class="subtle">FOCUS/WATCHLIST board only. Soccerway is the live score and match-state source. Times shown in ICT.</p></div><div class="toolbar"><button class="toolBtn" id="refreshToday">Refresh</button></div></div>${state.error?`<div class="statusBanner error">${esc(state.error)} · retrying automatically.</div>`:''}${dateStrip()}<div class="layout"><div class="mainCol"><section class="panel"><div class="panelHead"><h2>${state.day===0?'Today':'Fixtures'}</h2><span>${list.length}</span></div>${tabs(list)}</section></div><aside class="sideCol"><section class="panel"><div class="panelHead"><h3>Board signal</h3></div><div class="kpis"><div class="kpi"><span>Focus</span><strong>${p.focusCount||0}</strong></div><div class="kpi"><span>Live</span><strong>${list.filter(isLive).length}</strong></div><div class="kpi"><span>Matched</span><strong>${p.matchedCount||0}</strong></div></div></section><section class="panel"><div class="panelHead"><h3>Next up</h3></div><div class="sideList">${upcoming.map(f=>`<a class="sideItem" href="#match/${encodeURIComponent(f.matchId)}"><div><strong>${esc(f.homeTeam)} – ${esc(f.awayTeam)}</strong><span>${esc(f.competition||'')}</span></div><b>${esc(fmtTime(kickoff(f)))}</b></a>`).join('')||'<div class="empty">No upcoming matches.</div>'}</div></section></aside></div></main>${mobile('today')}`;}
  function board(){const list=filtered();return `${header('board')}<main class="shell"><div class="pageHead"><div><span class="eyebrow">Model layer</span><h1>Board</h1><p class="subtle">Airtable FOCUS/WATCHLIST decisions with Soccerway live state.</p></div></div>${dateStrip()}<section class="panel"><div class="panelHead"><h2>Focus & watchlist</h2><span>${list.length}</span></div><div class="chronoMatches">${list.map(f=>row(f,true)).join('')||'<div class="empty">No board rows.</div>'}</div></section></main>${mobile('board')}`;}
  function leagues(){const list=filtered();const map=new Map();for(const f of list){const k=f.competition||'Other';if(!map.has(k))map.set(k,{name:k,count:0,live:0});const x=map.get(k);x.count++;if(isLive(f))x.live++;}return `${header('leagues')}<main class="shell"><div class="pageHead"><div><span class="eyebrow">Board competitions</span><h1>Competitions</h1></div></div>${dateStrip()}<div class="cards">${[...map.values()].map(x=>`<div class="entityCard"><div><h3>${esc(x.name)}</h3><p>${x.count} matches · ${x.live} live</p></div></div>`).join('')||'<div class="empty">No competitions.</div>'}</div></main>${mobile('leagues')}`;}
  function teams(){const list=filtered();const map=new Map();for(const f of list){for(const name of[f.homeTeam,f.awayTeam]){if(!map.has(name))map.set(name,{name,count:0});map.get(name).count++;}}return `${header('teams')}<main class="shell"><div class="pageHead"><div><span class="eyebrow">Board clubs</span><h1>Teams</h1></div></div>${dateStrip()}<div class="cards">${[...map.values()].sort((a,b)=>a.name.localeCompare(b.name)).map(x=>`<div class="entityCard"><div><h3>${esc(x.name)}</h3><p>${x.count} board appearance${x.count===1?'':'s'}</p></div></div>`).join('')||'<div class="empty">No teams.</div>'}</div></main>${mobile('teams')}`;}
  function picks(){const ps=Array.isArray(state.dashboard?.picks)?state.dashboard.picks:[];return `${header('picks')}<main class="shell"><div class="pageHead"><div><span class="eyebrow">Decision record</span><h1>Picks</h1></div></div><section class="panel"><div class="panelHead"><h2>All picks</h2><span>${ps.length}</span></div>${ps.map(p=>`<div class="matchRow"><div class="matchTime">${esc(fmtDate(p.kickoff))}<small>${esc(fmtTime(p.kickoff))}</small></div><div class="teams"><div class="teamLine"><span></span><span>${esc(p.match||'Match')}</span></div><div class="matchCompetition">${esc(p.competition||'')}</div></div><div class="matchMeta"><span class="tag">OVER ${esc(p.line||'—')} @ ${esc(p.odds||'—')}</span></div><div class="matchScore"><strong>${esc(p.result||'PENDING')}</strong></div></div>`).join('')||'<div class="empty">No picks.</div>'}</section></main>${mobile('picks')}`;}
  function match(id){const f=rows().find(x=>String(x.matchId)===id);if(!f)return `${header('today')}<main class="shell"><div class="statusBanner error">Match not on current board.</div></main>${mobile('today')}`;const score=f.homeScore!=null&&f.awayScore!=null?`${f.homeScore} – ${f.awayScore}`:fmtTime(kickoff(f));return `${header('today')}<main class="shell"><a class="backLink" href="#today">← Matchday</a><section class="matchHero"><div class="matchHeroMain"><div class="heroTeam"><span>${esc(f.homeTeam)}</span></div><div class="heroScore"><div class="league">${esc(f.competition||'Competition')}</div><div class="score">${esc(score)}</div><span class="clock ${isFinished(f)?'clock-ft':''}">${esc(label(f))}</span></div><div class="heroTeam away"><span>${esc(f.awayTeam)}</span></div></div><div class="heroFoot"><span>${esc(fmtDate(kickoff(f)))}</span><span>${esc(fmtTime(kickoff(f)))} ICT</span><span>${f.matchedToSoccerway?'SOCCERWAY MATCHED':'BOARD ONLY'}</span></div></section><section class="panel modelPanel"><div class="panelHead"><h3>SlipTrace model</h3><span>Airtable + Soccerway</span></div><div class="modelGrid"><div class="modelCell"><span>PRE grade</span><strong>${esc(f.grade||'—')}</strong></div><div class="modelCell"><span>Tier</span><strong>${esc(f.tier||'—')}</strong></div><div class="modelCell"><span>Structure</span><strong>${esc(f.structure||'—')}</strong></div><div class="modelCell"><span>Status</span><strong>${esc((f.status||'scheduled').toUpperCase())}</strong></div><div class="modelCell"><span>Minute</span><strong>${esc(f.minute||'—')}</strong></div></div></section></main>${mobile('today')}`;}

  function render(){const r=route();const h=location.hash||'#today';if(r==='today')root.innerHTML=today();else if(r==='board')root.innerHTML=board();else if(r==='leagues')root.innerHTML=leagues();else if(r==='teams')root.innerHTML=teams();else if(r==='picks')root.innerHTML=picks();else if(r==='match'){let id='';try{id=decodeURIComponent(h.slice(7));}catch{id=h.slice(7);}root.innerHTML=match(id);}else if(r==='search'){let q='';try{q=decodeURIComponent(h.slice(8));}catch{}state.query=q;root.innerHTML=today();}else{location.hash='#today';return;}bind();}
  function bind(){document.querySelectorAll('[data-day]').forEach(b=>b.addEventListener('click',()=>{state.day=Number(b.dataset.day);state.query='';restart();}));document.querySelectorAll('[data-status-tab]').forEach(b=>b.addEventListener('click',()=>{state.activeStatus=b.dataset.statusTab;render();}));document.getElementById('refreshToday')?.addEventListener('click',loadBoard);const form=document.getElementById('globalSearch');if(form)form.addEventListener('submit',e=>{e.preventDefault();const q=form.querySelector('input')?.value.trim()||'';state.query=q;location.hash=q?`#search/${encodeURIComponent(q)}`:'#today';render();});}

  window.addEventListener('hashchange',render);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){loadBoard();clearTimeout(state.liveTimer);pollLive();}});

  render();
  loadDashboard();
  loadBoard().finally(()=>{pollLive();state.fullTimer=setInterval(()=>{if(document.visibilityState==='visible')loadBoard();},FULL_SYNC_MS);});
}

export function clientScript() {
  return `(${clientApp.toString()})();`;
}

export function renderSiteHtml(initial = null) {
  const safeInitial = initial && typeof initial === "object" ? initial : { ok: true, day: 0, fixtures: [], focusCount: 0, matchedCount: 0, generatedAt: new Date().toISOString() };
  const initialJson = JSON.stringify(safeInitial).replace(/</g, "\\u003c");
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
  <style>.source-note{color:var(--cyan)}.matchCompetition{display:block}.entityCard{min-height:78px}.matchHero .heroTeam,.matchHero .heroTeam.away{justify-content:center;text-align:center}.matchHero .heroScore .clock{min-width:62px}@media(max-width:760px){.matchCompetition{margin-left:0}.headerSearch{width:min(250px,68vw)}}</style>
</head>
<body>
  <main id="app" aria-live="polite">${ssrBody(safeInitial)}</main>
  <script>window.__SLIPTRACE_INITIAL__=${initialJson};</script>
  <script src="/sliptrace-client-v3.js" defer></script>
</body>
</html>`;
}
