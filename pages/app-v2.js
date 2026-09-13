(() => {
  'use strict';

  const API = window.SLIPTRACE_API || 'https://football-v2.acchtt.workers.dev';
  const TZ = window.SLIPTRACE_TIME_ZONE || 'Asia/Ho_Chi_Minh';
  const root = document.getElementById('app');

  const state = {
    route: '', live: [], today: [], date: todayKey(), board: null,
    loading: false, error: '', lastSync: 0, liveTimer: null, clockTimer: null,
    matchClockAnchor: new Map(),
  };

  function esc(v='') { return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function arr(v) { return Array.isArray(v) ? v : Array.isArray(v?.results) ? v.results : []; }
  function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
  function num(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  function pick(...v) { return v.find(x => x !== undefined && x !== null && x !== '') ?? null; }
  function statusText(v='') { return String(v).toLowerCase().replace(/_/g,' '); }
  function todayKey(offset=0) {
    const d = new Date(Date.now() + offset * 86400000);
    const p = new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
    const g = t => p.find(x=>x.type===t)?.value || '';
    return `${g('year')}-${g('month')}-${g('day')}`;
  }
  function formatTime(v) {
    const d = new Date(v); if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('en-GB',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hour12:false}).format(d);
  }
  function formatDate(v) {
    const d = new Date(v); if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('en-US',{timeZone:TZ,weekday:'short',month:'short',day:'numeric'}).format(d);
  }
  function teamObj(event, side) {
    const v = event?.[`${side}_team`] ?? event?.[side];
    return obj(v);
  }
  function teamName(event, side) {
    const t = teamObj(event, side);
    return pick(t.name,t.short_name,event?.[`${side}_team_name`],event?.[`${side}_name`],typeof event?.[side]==='string'?event[side]:null,side.toUpperCase());
  }
  function teamId(event, side) {
    const t = teamObj(event, side);
    return num(pick(t.id,event?.[`${side}_team_id`],event?.[`${side}_id`]));
  }
  function eventId(event) { return num(pick(event?.id,event?.event_id)); }
  function leagueObj(event) { return obj(event?.league); }
  function leagueId(event) { return num(pick(event?.league_id,leagueObj(event).id)); }
  function leagueName(event) { return pick(leagueObj(event).name,event?.league_name,event?.competition_name,'Competition'); }
  function eventKickoff(event) { return pick(event?.event_date,event?.kickoff,event?.kickoff_at,event?.date,event?.time?.kickoff_at); }
  function score(event) {
    const s = obj(event?.score);
    return {home:num(pick(event?.home_score,s.home,s.home_score)),away:num(pick(event?.away_score,s.away,s.away_score))};
  }
  function eventTime(event) { return obj(event?.time); }
  function eventStatus(event) { return String(pick(event?.status,eventTime(event).status,'upcoming')).toLowerCase(); }
  function isLive(event) { return eventStatus(event) === 'live'; }
  function isFinished(event) { return ['finished','ft','ended','complete','completed'].includes(eventStatus(event)); }
  function image(type,id,transparent=true) { return id ? `https://sports.bzzoiro.com/img/${type}/${id}/${transparent?'?bg=transparent':''}` : ''; }

  async function api(path, options={}) {
    const res = await fetch(`${API}${path}`, {cache:'no-store', ...options});
    const payload = await res.json().catch(()=>null);
    if (!res.ok || payload?.ok === false) throw new Error(payload?.error || payload?.detail || `HTTP ${res.status}`);
    return payload;
  }
  async function loadBoard() {
    try { const p = await api('/api/dashboard-data'); state.board = p; return p; } catch { return null; }
  }

  function norm(v='') { return String(v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\b(fc|cf|afc|sc|ac|sk|fk|club)\b/g,' ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim(); }
  function splitMatch(match='') {
    for (const re of [/\s+vs\.?\s+/i,/\s+v\.?\s+/i,/\s+—\s+/,/\s+–\s+/,/\s+-\s+/]) {
      const p=String(match).split(re).map(x=>x.trim()).filter(Boolean); if(p.length===2) return {home:p[0],away:p[1]};
    }
    return {home:String(match),away:''};
  }
  function nameScore(a,b) {
    const x=norm(a),y=norm(b); if(!x||!y)return 0; if(x===y)return 6; if(x.includes(y)||y.includes(x))return 4;
    const aa=new Set(x.split(' ')),bb=new Set(y.split(' ')); let s=0; aa.forEach(t=>bb.has(t)&&s++); const o=s/Math.max(aa.size,bb.size); return o>=.75?4:o>=.5?3:0;
  }
  function boardRowFor(event) {
    const rows = state.board?.schedule || [];
    return rows.map(row=>{const t=splitMatch(row.match||'');return{row,score:nameScore(t.home,teamName(event,'home'))+nameScore(t.away,teamName(event,'away'))};})
      .filter(x=>x.score>=6).sort((a,b)=>b.score-a.score)[0]?.row || null;
  }
  function picksFor(event) {
    const rows=state.board?.picks||[];
    return rows.filter(row=>{const t=splitMatch(row.match||'');return nameScore(t.home,teamName(event,'home'))+nameScore(t.away,teamName(event,'away'))>=6;});
  }

  function unwrapData(payload) { return payload?.data ?? payload; }
  function liveRows(payload) { return arr(unwrapData(payload)); }
  function eventRows(payload) { return arr(unwrapData(payload)); }

  function statusLabel(event) {
    if (isFinished(event)) return 'FT';
    const time=eventTime(event);
    if (isLive(event)) return pick(time.display, time.minute!==undefined?`${time.minute}′`:null, event?.display, event?.minute!==undefined?`${event.minute}′`:null,'LIVE');
    const s=eventStatus(event);
    if(s==='postponed') return 'PP'; if(s==='cancelled') return 'CANC'; return formatTime(eventKickoff(event));
  }

  function anchorClock(event) {
    const id=eventId(event); if(!id) return null;
    const time=eventTime(event); const minute=num(pick(time.minute,event?.minute,event?.current_minute)); const second=num(pick(time.second,event?.second,event?.current_second)) ?? 0;
    if(minute===null) return null;
    const key=String(id), current=state.matchClockAnchor.get(key);
    const signature=`${minute}:${second}:${eventStatus(event)}:${pick(time.period,event?.period,'')}`;
    if(!current || current.signature!==signature) state.matchClockAnchor.set(key,{minute,second,at:Date.now(),signature,status:eventStatus(event)});
    return state.matchClockAnchor.get(key);
  }
  function liveClock(event) {
    if(!isLive(event)) return statusLabel(event);
    const a=anchorClock(event); if(!a) return statusLabel(event);
    const paused=['ht','halftime','paused','suspended'].includes(eventStatus(event));
    const extra=paused?0:Math.max(0,Math.floor((Date.now()-a.at)/1000));
    const total=a.minute*60+a.second+extra;
    return `${Math.floor(total/60)}:${String(total%60).padStart(2,'0')}`;
  }

  function header(route) {
    const active = name => route===name?'active':'';
    return `<header class="appHeader"><div class="headerInner">
      <a class="brand" href="#today"><span class="brandMark">ST</span><span>SLIPTRACE</span></a>
      <nav class="topNav"><a class="${active('today')}" href="#today">Matchday</a><a class="${active('board')}" href="#board">Board</a><a class="${active('leagues')}" href="#leagues">Competitions</a><a class="${active('teams')}" href="#teams">Teams</a><a class="${active('picks')}" href="#picks">Picks</a></nav>
      <form class="headerSearch" id="globalSearch"><input aria-label="Search" placeholder="Search teams or players…" /></form>
      <div class="systemState"><span><i class="dot ${state.error?'warn':'live'}"></i>BSD ${state.error?'DELAYED':'LIVE'}</span><span>${state.lastSync?new Date(state.lastSync).toLocaleTimeString('en-GB',{hour12:false}):'—'}</span></div>
    </div></header>`;
  }
  function mobileNav(route) {
    const a=n=>route===n?'active':'';
    return `<nav class="mobileNav"><a class="${a('today')}" href="#today">Today</a><a class="${a('board')}" href="#board">Board</a><a class="${a('leagues')}" href="#leagues">Leagues</a><a class="${a('teams')}" href="#teams">Teams</a><a class="${a('picks')}" href="#picks">Picks</a></nav>`;
  }

  function leagueHeader(event, count) {
    const lid=leagueId(event); return `<div class="leagueTitle">${lid?`<img src="${image('league',lid)}" alt="">`:''}<strong>${esc(leagueName(event))}</strong><span>${count} match${count===1?'':'es'}</span>${lid?`<a href="#league/${lid}">Table →</a>`:''}</div>`;
  }
  function matchRow(event) {
    const id=eventId(event), sc=score(event), row=boardRowFor(event), time=eventTime(event);
    const clock=isLive(event)?liveClock(event):statusLabel(event);
    return `<a class="matchRow" href="${id?`#match/${id}`:'#today'}" data-live-event="${id||''}">
      <div class="matchTime">${isLive(event)?'<span class="tag live"><i class="dot bad"></i>LIVE</span>':esc(formatTime(eventKickoff(event)))}<small>${esc(pick(time.period,event?.round_label,''))}</small></div>
      <div class="teams"><div class="teamLine">${teamId(event,'home')?`<img src="${image('team',teamId(event,'home'))}" alt="">`:''}<span>${esc(teamName(event,'home'))}</span></div><div class="teamLine">${teamId(event,'away')?`<img src="${image('team',teamId(event,'away'))}" alt="">`:''}<span>${esc(teamName(event,'away'))}</span></div></div>
      <div class="matchMeta">${row?`<span class="tag ${row.tier==='FOCUS'?'live':''}">${esc(row.grade||'—')} · ${esc(row.tier||'')}</span>`:(event?.websocket_plus?'<span class="tag ws">WS+</span>':'')}</div>
      <div class="matchScore"><strong>${sc.home!==null&&sc.away!==null?`${sc.home}–${sc.away}`:'–'}</strong><small data-clock>${esc(clock)}</small></div>
    </a>`;
  }
  function groupedMatches(events) {
    const groups=new Map(); for(const e of events){const key=`${leagueId(e)||0}:${leagueName(e)}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e);}
    return [...groups.values()].map(g=>`<section class="leagueGroup">${leagueHeader(g[0],g.length)}${g.map(matchRow).join('')}</section>`).join('');
  }

  function dateStrip() {
    return `<div class="dateStrip">${[-3,-2,-1,0,1,2,3].map(o=>{const d=todayKey(o);const dt=new Date(`${d}T12:00:00Z`);const label=o===0?'Today':new Intl.DateTimeFormat('en-US',{weekday:'short',timeZone:'UTC'}).format(dt);return `<button class="dateBtn ${state.date===d?'active':''}" data-date="${d}"><small>${label}</small><strong>${d.slice(5).replace('-','/')}</strong></button>`;}).join('')}</div>`;
  }

  async function loadMatchday(date=state.date) {
    state.loading=true;state.error=''; renderSkeleton('today');
    try {
      const [eventsPayload, livePayload] = await Promise.all([
        api(`/api/bsd/events?date_from=${date}&date_to=${date}&limit=200`),
        api('/api/bsd/live'),
        loadBoard(),
      ]);
      state.today=eventRows(eventsPayload);state.live=liveRows(livePayload);state.lastSync=Date.now();state.error='';
    } catch(e){state.error=e.message||String(e);} finally {state.loading=false;render();}
  }

  function todayPage() {
    const events=state.today.slice().sort((a,b)=>(Date.parse(eventKickoff(a))||0)-(Date.parse(eventKickoff(b))||0));
    const live=events.filter(isLive), upcoming=events.filter(e=>!isLive(e)&&!isFinished(e)), finished=events.filter(isFinished);
    const focus=(state.board?.schedule||[]).filter(r=>r.slateDate===state.date&&r.tier==='FOCUS').length;
    return `${header('today')}<main class="shell"><div class="pageHead"><div><span class="eyebrow">Football operations</span><h1>Matchday</h1><p class="subtle">BSD is the canonical fixture, score and identity source. Times shown in ICT.</p></div><div class="toolbar"><button class="toolBtn" id="refreshToday">Refresh</button></div></div>${state.error?`<div class="statusBanner error">${esc(state.error)} · showing the last good view where available.</div>`:''}${dateStrip()}<div class="layout"><div class="mainCol">
      ${live.length?`<section class="panel"><div class="panelHead"><h2>Live now</h2><span>${live.length}</span></div>${groupedMatches(live)}</section>`:''}
      <section class="panel"><div class="panelHead"><h2>${state.date===todayKey()?'Today':'Fixtures'}</h2><span>${events.length}</span></div>${events.length?groupedMatches([...live,...upcoming,...finished].filter((v,i,a)=>a.indexOf(v)===i)):'<div class="empty">No fixtures returned for this date.</div>'}</section>
    </div><aside class="sideCol"><section class="panel"><div class="panelHead"><h3>Board signal</h3></div><div class="kpis"><div class="kpi"><span>Focus</span><strong>${focus}</strong></div><div class="kpi"><span>Live</span><strong>${live.length}</strong></div><div class="kpi"><span>Matches</span><strong>${events.length}</strong></div></div></section><section class="panel"><div class="panelHead"><h3>Next up</h3></div><div class="sideList">${upcoming.slice(0,6).map(e=>`<a class="sideItem" href="#match/${eventId(e)}"><div><strong>${esc(teamName(e,'home'))} – ${esc(teamName(e,'away'))}</strong><span>${esc(leagueName(e))}</span></div><b>${esc(formatTime(eventKickoff(e)))}</b></a>`).join('')||'<div class="empty">No upcoming matches.</div>'}</div></section></aside></div></main>${mobileNav('today')}`;
  }

  function skeletonRows(){return Array.from({length:7},()=>'<div class="skeleton"></div>').join('');}
  function renderSkeleton(route){root.innerHTML=`${header(route)}<main class="shell"><div class="pageHead"><div><span class="eyebrow">Loading</span><h1>SlipTrace</h1></div></div><section class="panel">${skeletonRows()}</section></main>${mobileNav(route)}`;bindGlobal();}

  function parseStats(raw) {
    const root=obj(raw); let home=obj(root.home||root.home_stats),away=obj(root.away||root.away_stats);
    if(!Object.keys(home).length && obj(root.stats).home){home=obj(root.stats.home);away=obj(root.stats.away);}
    return {home,away};
  }
  const statDefs=[['Possession',['possession','ball_possession'],'%'],['Shots',['shots_total','total_shots','shots'],''],['On target',['shots_on_target','shots_ontarget','shots_on_goal'],''],['Corners',['corners','corner_kicks'],''],['xG',['xg','expected_goals'],''],['Dangerous attacks',['dangerous_attacks'],'']];
  function valueFor(o,aliases){for(const a of aliases){if(o?.[a]!==undefined&&o?.[a]!==null)return num(String(o[a]).replace('%',''));}return null;}
  function statsHtml(raw){const {home,away}=parseStats(raw);const rows=statDefs.map(([label,aliases,suffix])=>{const h=valueFor(home,aliases),a=valueFor(away,aliases);if(h===null&&a===null)return'';const total=Math.max(1,(h||0)+(a||0)),p=((h||0)/total*100);return `<div class="statLabel">${esc(label)}</div><div class="statRow"><strong>${h===null?'—':`${h}${suffix}`}</strong><div class="statBar"><i style="--p:${p}%"></i></div><strong>${a===null?'—':`${a}${suffix}`}</strong></div>`;}).join('');return rows||'<div class="empty">BSD has not published match statistics for this fixture.</div>';}

  function normalizePlayers(side) {
    if(!side)return {starters:[],subs:[],formation:''};
    const s=obj(side), all=arr(s.players||s.lineup||s.squad); let starters=arr(s.starting_xi||s.starters||s.starting),subs=arr(s.substitutes||s.subs||s.bench);
    if(!starters.length&&all.length){starters=all.filter(p=>p.starter!==false).slice(0,11);subs=all.filter(p=>p.starter===false);if(!subs.length)subs=all.slice(11);}
    return {starters,subs,formation:pick(s.formation,s.formation_name,s.shape,'')};
  }
  function findLineupSides(raw) {
    const r=obj(raw); return {home:normalizePlayers(r.home||r.home_team||r.home_lineup||r.lineups?.home),away:normalizePlayers(r.away||r.away_team||r.away_lineup||r.lineups?.away),status:pick(r.status,r.lineup_type,'')};
  }
  function playerName(p){const x=obj(p.player||p);return pick(x.name,x.full_name,x.short_name,p.player_name,p.name,'Unknown');}
  function playerRow(p){const x=obj(p.player||p);return `<div class="player"><b>${esc(pick(p.number,p.shirt_number,x.number,x.shirt_number,'·'))}</b><span>${esc(playerName(p))}</span><small>${esc(pick(p.position,x.position,''))}</small></div>`;}
  function lineupsHtml(raw,event){const l=findLineupSides(raw);const side=(name,data)=>`<div class="lineupTeam"><div class="lineupHead"><strong>${esc(name)}</strong><span>${esc(data.formation||'—')}</span></div>${data.starters.length?data.starters.map(playerRow).join(''):'<div class="empty">No XI published.</div>'}${data.subs.length?`<details><summary>Substitutes (${data.subs.length})</summary>${data.subs.map(playerRow).join('')}</details>`:''}</div>`;return `<div class="lineups">${side(teamName(event,'home'),l.home)}${side(teamName(event,'away'),l.away)}</div>`;}

  function incidentsHtml(raw){const rows=arr(raw);if(!rows.length)return'<div class="empty">No incidents available.</div>';return rows.slice().sort((a,b)=>(num(a.minute)||0)-(num(b.minute)||0)).map(x=>`<div class="incident"><time>${esc(pick(x.minute,x.time,'•'))}${x.minute!==undefined?'′':''}</time><div><strong>${esc(pick(x.type,x.incident_type,x.name,'Event').replace(/_/g,' '))}</strong><div class="subtle">${esc(pick(x.player?.name,x.player_name,x.team?.name,x.team_name,''))}</div></div></div>`).join('');}
  function oddsHtml(raw){const rows=arr(raw);if(!rows.length&&raw&&typeof raw==='object'){const out=[];for(const [market,v] of Object.entries(raw)){if(v&&typeof v==='object')for(const [outcome,price] of Object.entries(v))if(typeof price==='number')out.push({market,outcome,decimal_odds:price});}return oddsHtml(out);}if(!rows.length)return'<div class="empty">No current odds returned by BSD.</div>';return `<div class="oddsGrid">${rows.slice(0,18).map(o=>`<div class="odd"><span>${esc(pick(o.market,'Market'))} · ${esc(pick(o.outcome_name,o.outcome,''))}</span><strong>${esc(pick(o.decimal_odds,o.odds,'—'))}</strong><small class="subtle">${esc(pick(o.bookmaker_name,o.bookmaker_slug,'Consensus'))}</small></div>`).join('')}</div>`;}
  function h2hHtml(raw){const rows=arr(raw);return rows.length?groupedMatches(rows.slice(0,10)):'<div class="empty">No head-to-head history returned.</div>';}

  function modelHtml(event){const row=boardRowFor(event);const picks=picksFor(event);if(!row&&!picks.length)return'';return `<section class="panel modelPanel"><div class="panelHead"><h3>SlipTrace model</h3><span>Airtable overlay</span></div>${row?`<div class="modelGrid"><div class="modelCell"><span>PRE grade</span><strong>${esc(row.grade||'—')}</strong></div><div class="modelCell"><span>Tier</span><strong>${esc(row.tier||'—')}</strong></div><div class="modelCell"><span>Structure</span><strong>${esc(row.structure||'—')}</strong></div><div class="modelCell"><span>XI</span><strong>${esc(row.xiStatus||'—')}</strong></div><div class="modelCell"><span>Market</span><strong>${esc(row.marketStatus||'—')}</strong></div><div class="modelCell"><span>Coverage</span><strong>${esc(row.coverageStatus||'—')}</strong></div></div>${row.frozenPreSummary?`<div class="prose"><b>Frozen PRE</b><br>${esc(row.frozenPreSummary)}</div>`:''}`:''}${picks.length?`<div class="prose"><b>Official picks</b><br>${picks.map(p=>`Over ${esc(p.line||'—')} @ ${esc(p.odds||'—')} · ${esc(p.result||'PENDING')}`).join('<br>')}</div>`:''}</section>`;}

  async function matchPage(id) {
    renderSkeleton('today'); state.error='';
    try {
      const [payload] = await Promise.all([api(`/api/bsd/match/${id}`),loadBoard()]);
      const data=unwrapData(payload),event=data.event; state.lastSync=Date.now();
      renderMatch(event,data);
    } catch(e){root.innerHTML=`${header('today')}<main class="shell"><a class="backLink" href="#today">← Matchday</a><div class="statusBanner error">${esc(e.message||String(e))}</div></main>${mobileNav('today')}`;bindGlobal();}
  }
  function renderMatch(event,data){
    const id=eventId(event),sc=score(event),t=eventTime(event);anchorClock(event);
    const unavailable = section => section?.ok===false ? `<div class="empty">${esc(section.error||'Not available for this match.')}</div>` : '';
    root.innerHTML=`${header('today')}<main class="shell"><a class="backLink" href="#today">← Matchday</a>
      <section class="matchHero"><div class="matchHeroMain"><div class="heroTeam"><img src="${image('team',teamId(event,'home'))}" alt=""><span>${esc(teamName(event,'home'))}</span></div><div class="heroScore"><div class="league">${esc(leagueName(event))}</div><div class="score">${sc.home!==null&&sc.away!==null?`${sc.home} – ${sc.away}`:formatTime(eventKickoff(event))}</div><span class="clock" id="heroClock">${esc(liveClock(event))}</span></div><div class="heroTeam away"><span>${esc(teamName(event,'away'))}</span><img src="${image('team',teamId(event,'away'))}" alt=""></div></div><div class="heroFoot"><span>${esc(formatDate(eventKickoff(event)))}</span><span>${esc(formatTime(eventKickoff(event)))} ICT</span><span>${esc(pick(event?.round_label,event?.stage_name,''))}</span><span>BSD #${id}</span></div></section>
      <div class="matchColumns"><div class="mainCol"><section class="panel"><div class="tabs"><button class="tabBtn active" data-tab="overview">Overview</button><button class="tabBtn" data-tab="stats">Stats</button><button class="tabBtn" data-tab="lineups">Lineups</button><button class="tabBtn" data-tab="odds">Odds</button><button class="tabBtn" data-tab="h2h">H2H</button></div><div class="tabBody" id="matchTab">
        <div data-pane="overview">${data.incidents?.ok?incidentsHtml(data.incidents.data):unavailable(data.incidents)}</div>
        <div class="hidden" data-pane="stats">${data.stats?.ok?statsHtml(data.stats.data):unavailable(data.stats)}</div>
        <div class="hidden" data-pane="lineups">${data.lineups?.ok?lineupsHtml(data.lineups.data,event):unavailable(data.lineups)}</div>
        <div class="hidden" data-pane="odds">${data.odds?.ok?oddsHtml(data.odds.data):unavailable(data.odds)}</div>
        <div class="hidden" data-pane="h2h">${data.h2h?.ok?h2hHtml(data.h2h.data):unavailable(data.h2h)}</div>
      </div></section>${modelHtml(event)}</div><aside class="sideCol"><section class="panel"><div class="panelHead"><h3>Match state</h3><span>${isLive(event)?'REST live':'BSD'}</span></div><div class="modelGrid"><div class="modelCell"><span>Status</span><strong>${esc(statusText(eventStatus(event)).toUpperCase())}</strong></div><div class="modelCell"><span>Period</span><strong>${esc(pick(t.period,'—'))}</strong></div><div class="modelCell"><span>Clock</span><strong id="sideClock">${esc(liveClock(event))}</strong></div><div class="modelCell"><span>Venue</span><strong>${esc(pick(event?.venue?.name,event?.venue_name,'—'))}</strong></div><div class="modelCell"><span>Referee</span><strong>${esc(pick(event?.referee?.name,event?.referee_name,'—'))}</strong></div><div class="modelCell"><span>WS+</span><strong>${event?.websocket_plus?'YES':'NO'}</strong></div></div></section>${data.prediction?.ok?`<section class="panel"><div class="panelHead"><h3>BSD prediction</h3></div><div class="prose">${predictionHtml(data.prediction.data)}</div></section>`:''}</aside></div></main>${mobileNav('today')}`;
    bindGlobal();bindMatchTabs();startMatchClock(event);
  }
  function predictionHtml(raw){const r=obj(raw),m=obj(r.markets);const res=obj(m.match_result),ou=obj(m.over_under),xg=obj(m.expected_goals);return `Result: ${esc(pick(res.predicted,'—'))}<br>Home ${esc(pick(res.prob_home,'—'))}% · Draw ${esc(pick(res.prob_draw,'—'))}% · Away ${esc(pick(res.prob_away,'—'))}%<br>xG ${esc(pick(xg.home,'—'))} – ${esc(pick(xg.away,'—'))}<br>Over 2.5 ${esc(pick(ou.prob_over_25,'—'))}%`;}
  function startMatchClock(event){clearInterval(state.clockTimer);state.clockTimer=setInterval(()=>{const text=liveClock(event);const a=document.getElementById('heroClock'),b=document.getElementById('sideClock');if(a)a.textContent=text;if(b)b.textContent=text;},500);}
  function bindMatchTabs(){document.querySelectorAll('.tabBtn').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.tabBtn').forEach(x=>x.classList.remove('active'));btn.classList.add('active');document.querySelectorAll('[data-pane]').forEach(x=>x.classList.toggle('hidden',x.dataset.pane!==btn.dataset.tab));}));}

  async function leaguesPage(){renderSkeleton('leagues');try{const p=await api('/api/bsd/leagues?limit=200');const rows=arr(unwrapData(p));root.innerHTML=`${header('leagues')}<main class="shell"><div class="pageHead"><div><span class="eyebrow">Competitions</span><h1>Leagues</h1><p class="subtle">Standings, fixtures, seasons and leaders from BSD.</p></div></div><div class="cards">${rows.map(l=>`<a class="entityCard" href="#league/${l.id}"><img src="${image('league',l.id)}" alt=""><div><h3>${esc(l.name||'League')}</h3><p>${esc(pick(l.country?.name,l.country_name,l.country_code,''))}</p></div></a>`).join('')}</div></main>${mobileNav('leagues')}`;bindGlobal();}catch(e){renderError('leagues',e);}}
  async function leaguePage(id){renderSkeleton('leagues');try{let first=await api(`/api/bsd/league/${id}`);let d=unwrapData(first),league=d.league?.data||{},seasons=arr(d.seasons?.data);const season=pick(league.current_season?.id,league.current_season_id,seasons[0]?.id);if(season){first=await api(`/api/bsd/league/${id}?season_id=${season}`);d=unwrapData(first);}
    const standings=arr(d.standings?.data),events=arr(d.events?.data),scorers=arr(d.scorers?.data);
    root.innerHTML=`${header('leagues')}<main class="shell"><a class="backLink" href="#leagues">← Competitions</a><section class="panel"><div class="profileHead"><img src="${image('league',id)}" alt=""><div><h1>${esc(pick(league.name,'Competition'))}</h1><p>${esc(pick(league.country?.name,league.country_name,''))}</p></div></div></section><div class="layout"><div class="mainCol"><section class="panel"><div class="panelHead"><h2>Standings</h2><span>${esc(pick(season,'current'))}</span></div>${standingsTable(standings)}</section><section class="panel"><div class="panelHead"><h2>Fixtures & results</h2><span>${events.length}</span></div>${events.length?groupedMatches(events.slice(0,30)):'<div class="empty">No fixtures.</div>'}</section></div><aside class="sideCol"><section class="panel"><div class="panelHead"><h3>Top scorers</h3></div><div class="sideList">${scorers.slice(0,10).map((s,i)=>`<div class="sideItem"><div><strong>${i+1}. ${esc(pick(s.player?.name,s.player_name,'Player'))}</strong><span>${esc(pick(s.team?.name,s.team_name,''))}</span></div><b>${esc(pick(s.goals,s.value,'—'))}</b></div>`).join('')||'<div class="empty">No leaderboard data.</div>'}</div></section></aside></div></main>${mobileNav('leagues')}`;bindGlobal();}catch(e){renderError('leagues',e);}}
  function standingsTable(rows){if(!rows.length)return'<div class="empty">No standings returned for this season.</div>';return `<div class="tableWrap"><table class="dataTable"><thead><tr><th class="rank">#</th><th>Team</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th></tr></thead><tbody>${rows.map((r,i)=>{const team=obj(r.team);const tid=num(pick(team.id,r.team_id));return `<tr><td class="rank">${esc(pick(r.position,r.rank,i+1))}</td><td><a class="teamCell" href="${tid?`#team/${tid}`:'#'}">${tid?`<img src="${image('team',tid)}" alt="">`:''}<span>${esc(pick(team.name,r.team_name,'Team'))}</span></a></td><td>${esc(pick(r.played,r.matches_played,'—'))}</td><td>${esc(pick(r.won,r.wins,'—'))}</td><td>${esc(pick(r.drawn,r.draws,'—'))}</td><td>${esc(pick(r.lost,r.losses,'—'))}</td><td>${esc(pick(r.goals_for,r.gf,'—'))}</td><td>${esc(pick(r.goals_against,r.ga,'—'))}</td><td>${esc(pick(r.goal_difference,r.gd,'—'))}</td><td><b>${esc(pick(r.points,'—'))}</b></td></tr>`;}).join('')}</tbody></table></div>`;}

  async function teamsPage(){renderSkeleton('teams');try{const p=await api('/api/bsd/teams?limit=60');const rows=arr(unwrapData(p));root.innerHTML=`${header('teams')}<main class="shell"><div class="pageHead"><div><span class="eyebrow">Clubs</span><h1>Teams</h1><p class="subtle">Search above for any club or player. Showing a sample of BSD teams.</p></div></div><div class="cards">${rows.map(t=>teamCard(t)).join('')}</div></main>${mobileNav('teams')}`;bindGlobal();}catch(e){renderError('teams',e);}}
  function teamCard(t){return `<a class="entityCard" href="#team/${t.id}"><img src="${image('team',t.id)}" alt=""><div><h3>${esc(t.name||'Team')}</h3><p>${esc(pick(t.country?.name,t.country_name,t.country_code,''))}</p></div></a>`;}
  async function teamPage(id){renderSkeleton('teams');try{const p=await api(`/api/bsd/team/${id}`),d=unwrapData(p),team=d.team?.data||{},squad=arr(d.squad?.data),fixtures=arr(d.fixtures?.data),transfers=arr(d.transfers?.data);root.innerHTML=`${header('teams')}<main class="shell"><a class="backLink" href="#teams">← Teams</a><section class="panel"><div class="profileHead"><img src="${image('team',id)}" alt=""><div><h1>${esc(pick(team.name,'Team'))}</h1><p>${esc(pick(team.country?.name,team.country_name,''))} ${team.venue?.name?`· ${esc(team.venue.name)}`:''}</p></div></div></section><div class="layout"><div class="mainCol"><section class="panel"><div class="panelHead"><h2>Fixtures</h2><span>${fixtures.length}</span></div>${fixtures.length?groupedMatches(fixtures.slice(0,25)):'<div class="empty">No fixtures returned.</div>'}</section><section class="panel"><div class="panelHead"><h2>Squad</h2><span>${squad.length}</span></div><div class="cards" style="padding:12px">${squad.map(p=>{const x=obj(p.player||p),pid=num(pick(x.id,p.player_id));return `<div class="entityCard">${pid?`<img src="${image('player',pid,false)}" alt="">`:''}<div><h3>${esc(playerName(p))}</h3><p>${esc(pick(p.position,x.position,''))}</p></div></div>`;}).join('')||'<div class="empty">No squad data.</div>'}</div></section></div><aside class="sideCol"><section class="panel"><div class="panelHead"><h3>Recent transfers</h3></div><div class="sideList">${transfers.slice(0,12).map(x=>`<div class="sideItem"><div><strong>${esc(pick(x.player?.name,x.player_name,'Player'))}</strong><span>${esc(pick(x.from_team?.name,x.from_team_name,'?'))} → ${esc(pick(x.to_team?.name,x.to_team_name,'?'))}</span></div><b>${esc(pick(x.fee,x.transfer_fee,''))}</b></div>`).join('')||'<div class="empty">No transfers.</div>'}</div></section></aside></div></main>${mobileNav('teams')}`;bindGlobal();}catch(e){renderError('teams',e);}}

  async function searchPage(q){renderSkeleton('teams');try{const p=await api(`/api/bsd/search?q=${encodeURIComponent(q)}`),d=unwrapData(p),teams=arr(d.teams?.data),players=arr(d.players?.data);root.innerHTML=`${header('teams')}<main class="shell searchPage"><div class="pageHead"><div><span class="eyebrow">Search</span><h1>${esc(q)}</h1></div></div><h2 class="sectionTitle">Teams</h2><div class="cards">${teams.map(teamCard).join('')||'<div class="empty">No teams found.</div>'}</div><h2 class="sectionTitle">Players</h2><div class="cards">${players.map(p=>`<div class="entityCard">${p.id?`<img src="${image('player',p.id,false)}" alt="">`:''}<div><h3>${esc(p.name||'Player')}</h3><p>${esc(pick(p.team?.name,p.team_name,p.nationality_name,''))}</p></div></div>`).join('')||'<div class="empty">No players found.</div>'}</div></main>${mobileNav('teams')}`;bindGlobal();}catch(e){renderError('teams',e);}}

  function boardPage(){const rows=(state.board?.schedule||[]).filter(r=>r.slateDate===state.date);root.innerHTML=`${header('board')}<main class="shell"><div class="pageHead"><div><span class="eyebrow">Model layer</span><h1>Board</h1><p class="subtle">Airtable decision control, separate from BSD match identity and live data.</p></div></div>${dateStrip()}<section class="panel"><div class="panelHead"><h2>Focus & watchlist</h2><span>${rows.length}</span></div>${rows.length?rows.map(r=>`<div class="matchRow"><div class="matchTime">${esc(formatTime(r.kickoff||r.displayKickoff))}<small>ICT</small></div><div class="teams"><div class="teamLine"><span></span><span>${esc(r.match||'Match')}</span></div><span class="subtle">${esc(r.competition||'')}</span></div><div class="matchMeta"><span class="tag ${r.tier==='FOCUS'?'live':''}">${esc(r.grade||'—')} · ${esc(r.tier||'—')}</span></div><div class="matchScore"><strong>${esc(r.structure||'—')}</strong><small>${esc(r.xiStatus||'')}</small></div></div>`).join(''):'<div class="empty">No board rows for this date.</div>'}</section></main>${mobileNav('board')}`;bindGlobal();bindDateButtons();}
  function picksPage(){const rows=state.board?.picks||[];root.innerHTML=`${header('picks')}<main class="shell"><div class="pageHead"><div><span class="eyebrow">Decision record</span><h1>Picks</h1><p class="subtle">Official model picks and settlement history.</p></div></div><section class="panel"><div class="panelHead"><h2>All picks</h2><span>${rows.length}</span></div>${rows.length?rows.map(p=>`<div class="matchRow"><div class="matchTime">${esc(formatDate(p.kickoff))}<small>${esc(formatTime(p.kickoff))}</small></div><div class="teams"><div class="teamLine"><span></span><span>${esc(p.match||'Match')}</span></div><span class="subtle">${esc(p.competition||'')}</span></div><div class="matchMeta"><span class="tag">OVER ${esc(p.line||'—')} @ ${esc(p.odds||'—')}</span></div><div class="matchScore"><strong>${esc(p.result||'PENDING')}</strong><small>${p.pl!==undefined&&p.pl!==null?`${Number(p.pl)>0?'+':''}${Number(p.pl).toFixed(2)}u`:''}</small></div></div>`).join(''):'<div class="empty">No picks.</div>'}</section></main>${mobileNav('picks')}`;bindGlobal();}

  function renderError(route,e){root.innerHTML=`${header(route)}<main class="shell"><div class="statusBanner error">${esc(e.message||String(e))}</div><button class="toolBtn" onclick="location.reload()">Retry</button></main>${mobileNav(route)}`;bindGlobal();}
  function bindGlobal(){const f=document.getElementById('globalSearch');if(f)f.addEventListener('submit',e=>{e.preventDefault();const q=f.querySelector('input').value.trim();if(q.length>=2)location.hash=`#search/${encodeURIComponent(q)}`;});document.getElementById('refreshToday')?.addEventListener('click',()=>loadMatchday(state.date));bindDateButtons();}
  function bindDateButtons(){document.querySelectorAll('[data-date]').forEach(b=>b.addEventListener('click',()=>{state.date=b.dataset.date;if(routeName()==='board'){boardPage();}else loadMatchday(state.date);}));}
  function routeName(){const h=location.hash||'#today';if(h.startsWith('#match/'))return'match';if(h.startsWith('#league/'))return'league';if(h.startsWith('#team/'))return'team';if(h.startsWith('#search/'))return'search';return h.slice(1)||'today';}

  async function render(){clearInterval(state.clockTimer);const h=location.hash||'#today';state.route=routeName();
    if(h==='#schedule'){location.hash='#today';return;}
    if(h==='#today'||h==='#'){root.innerHTML=todayPage();bindGlobal();bindDateButtons();return;}
    if(h==='#board'){if(!state.board)await loadBoard();boardPage();return;}
    if(h==='#picks'){if(!state.board)await loadBoard();picksPage();return;}
    if(h==='#leagues'){return leaguesPage();}
    if(h==='#teams'){return teamsPage();}
    let m=h.match(/^#match\/(\d+)$/);if(m)return matchPage(m[1]);
    m=h.match(/^#league\/(\d+)$/);if(m)return leaguePage(m[1]);
    m=h.match(/^#team\/(\d+)$/);if(m)return teamPage(m[1]);
    m=h.match(/^#search\/(.+)$/);if(m){let q='';try{q=decodeURIComponent(m[1]);}catch{}return searchPage(q);}
    location.hash='#today';
  }

  async function refreshLive(){
    if(document.visibilityState==='hidden')return;
    try{const p=await api('/api/bsd/live');state.live=liveRows(p);state.lastSync=Date.now();state.error='';
      if(routeName()==='today'&&state.date===todayKey()) await loadMatchday(state.date);
    }catch(e){state.error=e.message||String(e);}
  }

  window.addEventListener('hashchange',render);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){refreshLive();}});
  state.liveTimer=setInterval(refreshLive,10_000); // BSD docs recommend no faster than 10s REST polling.
  Promise.all([loadBoard(),loadMatchday(state.date)]).catch(()=>render());
})();
