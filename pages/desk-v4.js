// SlipTrace Matchday Desk v4 — resilient data controller + premium football operations UI.
(() => {
  'use strict';

  const API = window.SLIPTRACE_API || 'https://football-v2.acchtt.workers.dev';
  const ZONE = 'Asia/Ho_Chi_Minh';
  const app = document.getElementById('app');
  const CACHE_KEY = 'sliptrace.dashboard.v4';
  const UI_KEY = 'sliptrace.ui.v4';
  const FINISHED = new Set(['finished','ft','full time','full_time','fulltime','ended','complete','completed']);
  const LIVE = new Set(['live','inplay','in play','1h','2h','ht','halftime','half time']);

  const state = {
    data: { schedule: [], picks: [] },
    liveEvents: [],
    dashboardReady: false,
    cached: false,
    dashboardError: '',
    liveError: '',
    lastDashboardAt: 0,
    lastLiveAt: 0,
    dashboardBusy: false,
    liveBusy: false,
    retryTimer: null,
    ui: loadUi(),
  };

  function loadUi() {
    const fallback = {
      scheduleBucket: 'upcoming',
      picksBucket: 'active',
      scheduleFilters: { q:'', tier:'ALL', grade:'ALL', competition:'ALL' },
      picksFilters: { q:'', date:'', model:'ALL', competition:'ALL' },
    };
    try {
      const raw = JSON.parse(sessionStorage.getItem(UI_KEY) || '{}');
      return {
        ...fallback,
        ...raw,
        scheduleFilters: { ...fallback.scheduleFilters, ...(raw.scheduleFilters || {}) },
        picksFilters: { ...fallback.picksFilters, ...(raw.picksFilters || {}) },
      };
    } catch { return fallback; }
  }
  function saveUi(){ try { sessionStorage.setItem(UI_KEY, JSON.stringify(state.ui)); } catch {} }

  function esc(v='') { return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
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
  function nameScore(a,b) {
    const x=norm(a),y=norm(b); if(!x||!y) return 0;
    if(x===y) return 6; if(x.includes(y)||y.includes(x)) return 4;
    const aa=new Set(x.split(' ')),bb=new Set(y.split(' ')); let s=0;
    aa.forEach(t=>bb.has(t)&&s++);
    const o=s/Math.max(aa.size,bb.size);
    return o>=.75?4:o>=.5?3:0;
  }
  function liveEvent(match) {
    const t=splitMatch(match);
    return state.liveEvents.map(e=>({e,s:nameScore(t.home,e.home)+nameScore(t.away,e.away)}))
      .filter(x=>x.s>=6).sort((a,b)=>b.s-a.s)[0]?.e || null;
  }

  function fmtTime(v) {
    const d=new Date(v); if(Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('en-GB',{timeZone:ZONE,hour:'2-digit',minute:'2-digit',hour12:false}).format(d);
  }
  function fmtClock() {
    return new Intl.DateTimeFormat('en-GB',{timeZone:ZONE,hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date());
  }
  function dateKey(v) {
    const d=new Date(v); if(Number.isNaN(d.getTime())) return '';
    const p=new Intl.DateTimeFormat('en-CA',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
    const g=t=>p.find(x=>x.type===t)?.value||'';
    return `${g('year')}-${g('month')}-${g('day')}`;
  }
  function todayKey(){ return dateKey(new Date()); }
  function fmtDate(key) {
    if(!key) return '';
    return new Intl.DateTimeFormat('en-US',{timeZone:ZONE,weekday:'long',month:'long',day:'numeric',year:'numeric'})
      .format(new Date(`${key}T12:00:00+07:00`));
  }
  function fmtDateTime(v) {
    const d=new Date(v); if(Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('en-GB',{timeZone:ZONE,day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',hour12:false}).format(d);
  }
  function units(v) {
    if(v===undefined||v===null||v==='') return '—';
    const n=Number(v); if(!Number.isFinite(n)) return '—';
    return `${n>0?'+':''}${n.toFixed(2)}u`;
  }
  function kickoffMs(row){ return Date.parse(row?.displayKickoff||row?.kickoff||0)||0; }
  function rowKey(row){ return `${row?.match||''}|${row?.kickoff||row?.displayKickoff||row?.id||row?.pickId||''}`; }
  function currentTab(){ return location.hash==='#picks'?'picks':'schedule'; }

  function eventStatus(row) {
    const live=liveEvent(row?.match||'');
    return String(live?.status||row?.bsd?.status||'').trim().toLowerCase();
  }
  function matchState(row) {
    if(row?.manualScore) return 'ended';
    const event=liveEvent(row?.match||''), s=eventStatus(row);
    if(FINISHED.has(s)) return 'ended';
    if(LIVE.has(s)) return 'live';
    if(event && (event.currentMinute!==undefined||event.minute!==undefined) && event.homeScore!==undefined) return 'live';
    return 'upcoming';
  }
  function resolvedScore(row) {
    if(row?.manualScore && Number.isFinite(Number(row.manualScore.home)) && Number.isFinite(Number(row.manualScore.away))) {
      return {home:Number(row.manualScore.home),away:Number(row.manualScore.away),label:'MANUAL',kind:'manual'};
    }
    const event=liveEvent(row?.match||'');
    if(event && event.homeScore!==undefined && event.awayScore!==undefined) {
      const s=String(event.status||'').toLowerCase(), ended=FINISHED.has(s);
      const label=ended?'FT':event.minute!==undefined?`${event.minute}′`:event.currentMinute!==undefined?`${event.currentMinute}′`:event.period?String(event.period).toUpperCase():'LIVE';
      return {home:Number(event.homeScore),away:Number(event.awayScore),label,kind:ended?'final':'live'};
    }
    if(row?.bsd && row.bsd.home!==undefined && row.bsd.away!==undefined) {
      const s=String(row.bsd.status||'').toLowerCase(), ended=FINISHED.has(s);
      const label=ended?'FT':row.bsd.minute!==undefined?`${row.bsd.minute}′`:row.bsd.period?String(row.bsd.period).toUpperCase():'LIVE';
      return {home:Number(row.bsd.home),away:Number(row.bsd.away),label,kind:ended?'final':'live'};
    }
    return null;
  }

  function settleLeg(total,line){ return total>line?'WIN':total<line?'LOSS':'PUSH'; }
  function autoSettle(row) {
    const current=String(row?.result||'PENDING').trim().toUpperCase();
    if(current!=='PENDING') return {...row,result:current};
    const score=resolvedScore(row);
    if(!score || matchState(row)!=='ended') return {...row,result:'PENDING'};
    const line=Number(row.line); if(!Number.isFinite(line)) return {...row,result:'PENDING'};
    const total=score.home+score.away;
    const fraction=((Math.round(line*100)%100)+100)%100;
    const legs=(fraction===25||fraction===75)?[line-.25,line+.25]:[line];
    const outcomes=legs.map(l=>settleLeg(total,l));
    let result='PENDING';
    if(outcomes.every(x=>x==='WIN')) result='WIN';
    else if(outcomes.every(x=>x==='LOSS')) result='LOSS';
    else if(outcomes.every(x=>x==='PUSH')) result='PUSH';
    else if(outcomes.includes('WIN')&&outcomes.includes('PUSH')) result='HALF WIN';
    else if(outcomes.includes('LOSS')&&outcomes.includes('PUSH')) result='HALF LOSS';
    const stake=Number.isFinite(Number(row.stake))?Number(row.stake):1;
    const odds=Number(row.odds); let pl=row.pl;
    if(Number.isFinite(odds)&&result!=='PENDING') {
      const legStake=stake/legs.length;
      pl=outcomes.reduce((sum,o)=>sum+(o==='WIN'?legStake*(odds-1):o==='LOSS'?-legStake:0),0);
      pl=Math.round(pl*1000)/1000;
    }
    return {...row,result,pl,autoSettled:result!=='PENDING'};
  }
  function currentPicks(){ return (state.data.picks||[]).map(autoSettle); }

  function initials(name='') {
    const stop=new Set(['fc','cf','afc','sc','ac','club','sv','fk','if','bk']);
    const parts=String(name).replace(/[^\p{L}\p{N} ]/gu,' ').split(/\s+/).filter(Boolean).filter(p=>!stop.has(p.toLowerCase()));
    const src=parts.length?parts:String(name).split(/\s+/).filter(Boolean);
    return (src.slice(0,2).map(p=>p[0]).join('')||'?').toUpperCase();
  }
  function crestUrl(row,side) {
    const cap=side==='home'?'Home':'Away', low=side;
    const candidates=[
      row?.[`${low}Logo`],row?.[`${low}Crest`],row?.[`${low}_logo`],row?.[`${low}_crest`],
      row?.bsd?.[`${low}Logo`],row?.bsd?.[`${low}Crest`],row?.bsd?.[`${low}_logo`],
      row?.bsd?.[`${low}Team`]?.logo,row?.bsd?.[`${low}Team`]?.crest,row?.bsd?.[`${low}Team`]?.image,
      row?.[`${cap}Logo`],row?.[`${cap}Crest`]
    ];
    return candidates.find(v=>typeof v==='string'&&/^https?:\/\//i.test(v))||'';
  }
  function crest(team,url='') {
    const mono=esc(initials(team));
    return `<span class="crest ${url?'hasImage':''}">${url?`<img src="${esc(url)}" alt="" loading="lazy" onerror="this.remove();this.parentElement.classList.remove('hasImage')">`:''}<span>${mono}</span></span>`;
  }

  function loadCache() {
    try {
      const cached=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');
      if(!cached?.payload||!Array.isArray(cached.payload.schedule)||!Array.isArray(cached.payload.picks)) return false;
      state.data=cached.payload; state.dashboardReady=true; state.cached=true; state.lastDashboardAt=Number(cached.savedAt)||0;
      return true;
    } catch { return false; }
  }
  function saveCache(payload){ try { localStorage.setItem(CACHE_KEY,JSON.stringify({savedAt:Date.now(),payload})); } catch {} }

  async function fetchJson(url,timeoutMs=9000) {
    const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),timeoutMs);
    try {
      const res=await fetch(url,{cache:'no-store',signal:controller.signal});
      const body=await res.json().catch(()=>null);
      if(!res.ok||!body?.ok) throw new Error(body?.error||`HTTP ${res.status}`);
      return body;
    } finally { clearTimeout(timer); }
  }
  async function withRetry(fn,attempts=3) {
    let last;
    for(let i=0;i<attempts;i++) {
      try{return await fn();}catch(err){last=err;if(i<attempts-1) await new Promise(r=>setTimeout(r,[700,1800,3500][i]||2500));}
    }
    throw last;
  }
  function dataSignature(payload) {
    const s=(payload?.schedule||[]).map(r=>`${r.match}|${r.slateDate}|${r.tier}|${r.grade}|${r.manualScore?.home??''}-${r.manualScore?.away??''}`).join('\n');
    const p=(payload?.picks||[]).map(r=>`${r.id||r.pickId||r.match}|${r.result}|${r.pl??''}|${r.recordedAt||''}`).join('\n');
    return `${s}\n--\n${p}`;
  }
  function validateDashboard(payload) {
    if(!Array.isArray(payload?.schedule)||!Array.isArray(payload?.picks)) throw new Error('Invalid dashboard payload');
    if(payload.schedule.length===0&&payload.picks.length===0) throw new Error('Empty dashboard payload rejected');
  }

  async function refreshDashboard({silent=false}={}) {
    if(state.dashboardBusy) return;
    state.dashboardBusy=true;
    try {
      const before=dataSignature(state.data);
      const payload=await withRetry(()=>fetchJson(`${API}/api/dashboard-data?t=${Date.now()}`,10000),3);
      validateDashboard(payload);
      const next={schedule:payload.schedule,picks:payload.picks};
      state.data=next; state.dashboardReady=true; state.cached=false; state.dashboardError=''; state.lastDashboardAt=Date.now();
      saveCache(next);
      if(before!==dataSignature(next)||!silent) renderCurrent(true); else renderStatus();
    } catch(err) {
      state.dashboardError=err?.message||'Airtable sync failed';
      if(!state.dashboardReady) renderUnavailable(); else {state.cached=true;renderCurrent(true);}
      scheduleRetry();
    } finally { state.dashboardBusy=false; }
  }
  async function refreshLive() {
    if(state.liveBusy) return;
    state.liveBusy=true;
    try {
      const payload=await fetchJson(`${API}/api/live-scores?t=${Date.now()}`,7000);
      const before=JSON.stringify(state.liveEvents.map(e=>[e.id,e.eventId,e.homeScore,e.awayScore,e.status,e.minute,e.currentMinute]));
      state.liveEvents=Array.isArray(payload.events)?payload.events:[]; state.liveError=''; state.lastLiveAt=Date.now();
      const after=JSON.stringify(state.liveEvents.map(e=>[e.id,e.eventId,e.homeScore,e.awayScore,e.status,e.minute,e.currentMinute]));
      if(state.dashboardReady&&before!==after) renderCurrent(true); else renderStatus();
    } catch(err) { state.liveError=err?.message||'BSD live scores unavailable'; renderStatus(); }
    finally { state.liveBusy=false; }
  }
  function scheduleRetry(){ if(!state.retryTimer) state.retryTimer=setTimeout(()=>{state.retryTimer=null;refreshDashboard({silent:false});},5000); }

  function relativeAge(ts) {
    if(!ts) return 'waiting';
    const sec=Math.max(0,Math.floor((Date.now()-ts)/1000));
    if(sec<5) return 'now'; if(sec<60) return `${sec}s`; if(sec<3600) return `${Math.floor(sec/60)}m`; return `${Math.floor(sec/3600)}h`;
  }
  function topNav() {
    const active=currentTab();
    return `<header class="topbar"><div class="topbarIn"><a href="#schedule" class="brand"><span class="brandMark">ST</span><b>SLIPTRACE</b></a><nav><a href="#schedule" class="${active==='schedule'?'active':''}">Schedule</a><a href="#picks" class="${active==='picks'?'active':''}">Picks</a></nav><div id="systemStatus" class="systemStatus" aria-live="polite"></div></div></header>`;
  }
  function ensureChrome() {
    let chrome=document.getElementById('appChrome');
    if(!chrome){chrome=document.createElement('div');chrome.id='appChrome';document.body.insertBefore(chrome,app);}
    chrome.innerHTML=topNav(); renderStatus();
  }
  function renderStatus() {
    const node=document.getElementById('systemStatus'); if(!node) return;
    const dashFresh=state.lastDashboardAt&&Date.now()-state.lastDashboardAt<90000&&!state.cached;
    const airClass=state.dashboardError?'bad':dashFresh?'ok':state.dashboardReady?'warn':'idle';
    const airText=state.dashboardError?(state.dashboardReady?'STALE':'ERROR'):dashFresh?'SYNCED':state.dashboardReady?'CACHED':'CONNECTING';
    const bsdFresh=state.lastLiveAt&&Date.now()-state.lastLiveAt<45000&&!state.liveError;
    const bsdClass=state.liveError?'bad':bsdFresh?'ok':'idle';
    const bsdText=state.liveError?'DELAYED':bsdFresh?'LIVE':'CONNECTING';
    node.innerHTML=`<span class="sys ${bsdClass}"><i></i>BSD <b>${bsdText}</b></span><span class="sys ${airClass}"><i></i>AIRTABLE <b>${airText}</b></span><time class="systemClock">${fmtClock()}</time>`;
  }
  function banners() {
    let out='';
    if(state.dashboardError&&state.dashboardReady) out+=`<div class="dataBanner stale"><b>DATA DELAY</b><span>Showing the last synced board · ${relativeAge(state.lastDashboardAt)} old</span><button data-retry-dashboard>Retry</button></div>`;
    if(state.liveError) out+=`<div class="dataBanner scores"><b>BSD SCORES DELAYED</b><span>Fixtures remain current; live/final scores may be stale.</span></div>`;
    return out;
  }

  function openKeys(){return [...document.querySelectorAll('details[data-row-key][open]')].map(d=>d.dataset.rowKey);}
  function restoreOpen(keys){document.querySelectorAll('details[data-row-key]').forEach(d=>{if(keys?.includes(d.dataset.rowKey))d.open=true;});}
  function gradeClass(g){const s=String(g||'');return s.startsWith('A')?'a':s.startsWith('B')?'b':'n';}

  function teamLine(row,side,name) {
    return `<div class="teamLine">${crest(name,crestUrl(row,side))}<strong>${esc(name)}</strong></div>`;
  }
  function scheduleRow(row) {
    const teams=splitMatch(row.match||''), status=matchState(row), score=resolvedScore(row);
    return `<details class="fixtureRow ${row.tier==='FOCUS'?'focus':''} ${status==='live'?'live':''}" data-row-key="${esc(rowKey(row))}">
      <summary>
        <div class="kick"><strong>${esc(fmtTime(row.displayKickoff||row.kickoff))}</strong><span>ICT</span></div>
        <div class="fixtureTeams">${teamLine(row,'home',teams.home)}${teamLine(row,'away',teams.away)}<small>${esc(row.competition||'')}${status==='live'?`<em class="inlineLive"><i></i>LIVE</em>`:''}</small></div>
        <div class="signal"><span class="grade ${gradeClass(row.grade)}">${esc(row.grade||'—')}</span><span class="tier ${row.tier==='FOCUS'?'focusText':'watchText'}">${esc(row.tier==='WATCHLIST'?'WATCH':row.tier||'—')}</span></div>
        <div class="score ${score?.kind||'pending'}"><strong>${score?`${score.home}–${score.away}`:'—'}</strong><span>${esc(score?.label||'')}</span></div><span class="chev">⌄</span>
      </summary>${scheduleDetail(row)}
    </details>`;
  }
  function scheduleDetail(row) {
    const cells=[['Structure',row.structure||'—'],['XI',row.xiStatus||'—'],['Market',row.marketStatus||'—'],['Coverage',row.coverageStatus||'—']];
    return `<div class="rowDetail"><dl>${cells.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>${row.frozenPreSummary?`<div class="note"><b>PRE</b><p>${esc(row.frozenPreSummary)}</p></div>`:''}${row.coverageNotes?`<div class="note"><b>Notes</b><p>${esc(row.coverageNotes)}</p></div>`:''}${manualEditor(row)}</div>`;
  }
  function pickRow(raw) {
    const row=autoSettle(raw), teams=splitMatch(row.match||''), score=resolvedScore(row), result=String(row.result||'PENDING').toUpperCase();
    const cls=['WIN','HALF WIN'].includes(result)?'win':['LOSS','HALF LOSS'].includes(result)?'loss':['PUSH','VOID'].includes(result)?'push':'pending';
    return `<details class="pickRow ${cls}" data-row-key="${esc(rowKey(row))}"><summary>
      <div class="pickWhen"><strong>${esc(fmtTime(row.displayKickoff||row.kickoff))}</strong><span>${esc(dateKey(row.kickoff))}</span></div>
      <div class="fixtureTeams">${teamLine(row,'home',teams.home)}${teamLine(row,'away',teams.away)}<small>${esc(row.competition||'')}</small></div>
      <div class="selection"><span>OVER ${esc(row.line??'—')}</span><strong>@ ${esc(row.odds??'—')} · ${esc(row.stake??'—')}u</strong></div>
      <div class="score ${score?.kind||'pending'}"><strong>${score?`${score.home}–${score.away}`:'—'}</strong><span>${esc(score?.label||'')}</span></div>
      <div class="result"><strong>${esc(result)}</strong><span>${units(row.pl)}</span></div><span class="chev">⌄</span>
    </summary>${pickDetail(row)}</details>`;
  }
  function pickDetail(row) {
    const cells=[['Stake',`${row.stake??'—'}u`],['Recorded',fmtDateTime(row.recordedAt||row.kickoff)],['Model',row.modelVersion||'—'],['Source',row.source||'—']];
    return `<div class="rowDetail"><dl>${cells.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>${row.reason?`<div class="note"><b>Decision</b><p>${esc(row.reason)}</p></div>`:''}${manualEditor(row)}</div>`;
  }
  function manualEditor(row) {
    const teams=splitMatch(row.match||''), seed=row.manualScore||null;
    return `<div class="manual"><div><b>Manual final score</b><span>Overrides BSD everywhere</span></div><form class="manualForm" data-match="${esc(row.match||'')}" data-kickoff="${esc(row.kickoff||row.displayKickoff||'')}"><label>${esc(teams.home||'Home')}<input name="home" type="number" min="0" max="99" value="${seed?.home??''}" required></label><label>${esc(teams.away||'Away')}<input name="away" type="number" min="0" max="99" value="${seed?.away??''}" required></label><button type="submit">Save</button>${row.manualScore?'<button type="button" class="clearManual">Use BSD</button>':''}</form></div>`;
  }
  function bindManual() {
    document.querySelectorAll('.manualForm').forEach(form=>{
      form.addEventListener('submit',async e=>{e.preventDefault();const b=form.querySelector('button[type="submit"]');b.disabled=true;b.textContent='Saving…';try{const fd=new FormData(form);await postScore({match:form.dataset.match,kickoff:form.dataset.kickoff,home:Number(fd.get('home')),away:Number(fd.get('away')),action:'save'});}catch(err){alert(`Manual score could not be saved.\n\n${err.message}`);}finally{b.disabled=false;b.textContent='Save';}});
      form.querySelector('.clearManual')?.addEventListener('click',async e=>{const b=e.currentTarget;b.disabled=true;b.textContent='Clearing…';try{await postScore({match:form.dataset.match,kickoff:form.dataset.kickoff,action:'clear'});}catch(err){alert(`Manual score could not be cleared.\n\n${err.message}`);}finally{b.disabled=false;b.textContent='Use BSD';}});
    });
  }
  async function postScore(body) {
    const res=await fetch(`${API}/api/manual-score`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const j=await res.json().catch(()=>null); if(!res.ok||!j?.ok) throw new Error(j?.error||`HTTP ${res.status}`);
    await refreshDashboard({silent:false});
  }

  function unique(rows,field){return [...new Set(rows.map(r=>r?.[field]).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b)));}
  function searchField(name,value,placeholder){return `<label class="searchBox"><span aria-hidden="true">⌕</span><input name="${name}" type="search" placeholder="${esc(placeholder)}" value="${esc(value||'')}"></label>`;}
  function scheduleToolbar(rows,f) {
    return `<form class="toolbar" id="scheduleToolbar">${searchField('q',f.q,'Search team or competition…')}<select name="tier" aria-label="Tier"><option value="ALL">Tier · All</option><option value="FOCUS" ${f.tier==='FOCUS'?'selected':''}>Focus</option><option value="WATCHLIST" ${f.tier==='WATCHLIST'?'selected':''}>Watchlist</option></select><select name="grade" aria-label="Grade"><option value="ALL">Grade · All</option>${unique(rows,'grade').map(v=>`<option value="${esc(v)}" ${f.grade===v?'selected':''}>${esc(v)}</option>`).join('')}</select><select name="competition" aria-label="Competition"><option value="ALL">Competition · All</option>${unique(rows,'competition').map(v=>`<option value="${esc(v)}" ${f.competition===v?'selected':''}>${esc(v)}</option>`).join('')}</select><button type="button" class="reset">Reset</button></form>`;
  }
  function picksToolbar(rows,f) {
    return `<form class="toolbar pickTools" id="picksToolbar">${searchField('q',f.q,'Search match or competition…')}<input name="date" type="date" value="${esc(f.date||'')}" aria-label="Match date"><select name="model" aria-label="Model"><option value="ALL">Model · All</option>${unique(rows,'modelVersion').reverse().map(v=>`<option value="${esc(v)}" ${f.model===v?'selected':''}>${esc(v)}</option>`).join('')}</select><select name="competition" aria-label="Competition"><option value="ALL">Competition · All</option>${unique(rows,'competition').map(v=>`<option value="${esc(v)}" ${f.competition===v?'selected':''}>${esc(v)}</option>`).join('')}</select><button type="button" class="reset">Reset</button></form>`;
  }
  function applyScheduleFilters(rows,f) {const q=norm(f.q||'');return rows.filter(r=>(f.tier==='ALL'||r.tier===f.tier)&&(f.grade==='ALL'||r.grade===f.grade)&&(f.competition==='ALL'||r.competition===f.competition)&&(!q||norm(`${r.match} ${r.competition}`).includes(q)));}
  function applyPickFilters(rows,f) {const q=norm(f.q||'');return rows.filter(r=>(!f.date||dateKey(r.kickoff)===f.date)&&(f.model==='ALL'||r.modelVersion===f.model)&&(f.competition==='ALL'||r.competition===f.competition)&&(!q||norm(`${r.match} ${r.competition} ${r.reason||''}`).includes(q)));}
  function bindToolbar(form,filters,type,draw) {
    if(!form)return;
    form.addEventListener('input',()=>{const fd=new FormData(form);filters.q=String(fd.get('q')||'');filters.competition=String(fd.get('competition')||'ALL');if(type==='schedule'){filters.tier=String(fd.get('tier')||'ALL');filters.grade=String(fd.get('grade')||'ALL');}else{filters.date=String(fd.get('date')||'');filters.model=String(fd.get('model')||'ALL');}saveUi();draw();});
    form.querySelector('.reset')?.addEventListener('click',()=>{if(type==='schedule')Object.assign(filters,{q:'',tier:'ALL',grade:'ALL',competition:'ALL'});else Object.assign(filters,{q:'',date:'',model:'ALL',competition:'ALL'});saveUi();renderCurrent(true);});
  }

  function group(title,rows,cls='') {if(!rows.length)return'';return `<section class="matchGroup ${cls}"><header><span>${esc(title)}</span><b>${rows.length}</b></header><div class="rows">${rows.map(scheduleRow).join('')}</div></section>`;}
  function miniFixture(row,showScore=false) {
    const t=splitMatch(row.match||''), score=resolvedScore(row);
    return `<li><time>${esc(fmtTime(row.kickoff||row.displayKickoff))}</time><span class="railCrest">${crest(t.home,crestUrl(row,'home'))}</span><span class="railTeams"><b>${esc(t.home)}</b><small>${esc(t.away)}</small></span>${showScore&&score?`<strong class="railScore">${score.home}–${score.away}</strong>`:''}</li>`;
  }
  function scheduleRail(todayRows) {
    const live=todayRows.filter(r=>matchState(r)==='live').slice(0,4);
    const next=todayRows.filter(r=>matchState(r)==='upcoming'&&kickoffMs(r)>=Date.now()-15*60*1000).sort((a,b)=>kickoffMs(a)-kickoffMs(b)).slice(0,4);
    const pending=currentPicks().filter(r=>String(r.result||'PENDING').toUpperCase()==='PENDING');
    const exposure=pending.reduce((s,r)=>s+(Number(r.stake)||0),0);
    return `<aside class="rightRail"><section><h3><i class="railDot liveDot"></i>Live</h3>${live.length?`<ul>${live.map(r=>miniFixture(r,true)).join('')}</ul>`:'<p>None right now</p>'}</section><section><h3>Next</h3>${next.length?`<ul>${next.map(r=>miniFixture(r,false)).join('')}</ul>`:'<p>No more fixtures</p>'}</section><section><h3>Active bets</h3><strong class="railBig">${pending.length}</strong><p>${exposure.toFixed(2)}u open exposure</p></section></aside>`;
  }
  function picksRail(rows) {
    const pending=rows.filter(r=>String(r.result||'PENDING').toUpperCase()==='PENDING'),settled=rows.filter(r=>String(r.result||'PENDING').toUpperCase()!=='PENDING');
    const stake=settled.reduce((s,r)=>s+(Number(r.stake)||0),0),pl=settled.reduce((s,r)=>s+(Number(r.pl)||0),0),roi=stake?pl/stake*100:0;
    return `<aside class="rightRail"><section><h3>Active exposure</h3><strong class="railBig">${pending.length}</strong><p>${pending.reduce((s,r)=>s+(Number(r.stake)||0),0).toFixed(2)}u open</p></section><section><h3>Performance</h3><strong class="railBig ${pl<0?'negative':'positive'}">${units(pl)}</strong><p>${roi>=0?'+':''}${roi.toFixed(1)}% ROI</p></section><section><h3>Settled</h3><strong class="railBig">${settled.length}</strong><p>${rows.length} total picks</p></section></aside>`;
  }

  function renderSchedule() {
    const open=openKeys(), today=todayKey(), all=(state.data.schedule||[]).filter(r=>r.slateDate===today).sort((a,b)=>kickoffMs(a)-kickoffMs(b));
    const f=state.ui.scheduleFilters,bucket=state.ui.scheduleBucket;
    const focus=all.filter(r=>r.tier==='FOCUS').length,watch=all.filter(r=>r.tier==='WATCHLIST').length,live=all.filter(r=>matchState(r)==='live').length;
    const upcomingCount=all.filter(r=>matchState(r)!=='ended').length,endedCount=all.filter(r=>matchState(r)==='ended').length;
    app.innerHTML=`${banners()}<div class="deskLayout"><main class="mainDesk"><header class="pageHead"><div><span class="kicker">MATCHDAY DESK</span><h1>Schedule</h1><p>${esc(fmtDate(today))} · ICT</p></div><div class="summaryStats"><span><b class="redNum">${focus}</b> Focus</span><span><b>${watch}</b> Watch</span><span class="liveStat"><b>${live}</b> Live</span></div></header><div class="subnav" role="tablist"><button data-schedule-bucket="upcoming" class="${bucket==='upcoming'?'active':''}">Upcoming / Live <span>${upcomingCount}</span></button><button data-schedule-bucket="ended" class="${bucket==='ended'?'active':''}">Ended <span>${endedCount}</span></button></div>${scheduleToolbar(all,f)}<div id="scheduleList"></div></main>${scheduleRail(all)}</div>`;
    const list=document.getElementById('scheduleList');
    const draw=()=>{
      const filtered=applyScheduleFilters(all,f).sort((a,b)=>kickoffMs(a)-kickoffMs(b)), now=Date.now();
      let visible=[],html='';
      if(state.ui.scheduleBucket==='upcoming') {
        visible=filtered.filter(r=>matchState(r)!=='ended');
        const liveRows=visible.filter(r=>matchState(r)==='live');
        const near=visible.filter(r=>matchState(r)==='upcoming'&&kickoffMs(r)>=now-15*60*1000&&kickoffMs(r)<=now+60*60*1000);
        const later=visible.filter(r=>matchState(r)==='upcoming'&&kickoffMs(r)>now+60*60*1000);
        const awaiting=visible.filter(r=>matchState(r)==='upcoming'&&kickoffMs(r)<now-15*60*1000);
        html=group('Live now',liveRows,'liveGroup')+group('Next 60 minutes',near,'nextGroup')+group('Later today',later,'laterGroup')+group('Awaiting status',awaiting,'awaitingGroup');
      } else {
        visible=filtered.filter(r=>matchState(r)==='ended');
        const recent=visible.filter(r=>now-kickoffMs(r)<=4*60*60*1000),earlier=visible.filter(r=>now-kickoffMs(r)>4*60*60*1000);
        html=group('Just finished',recent,'finishedGroup')+group('Earlier today',earlier,'earlierGroup');
      }
      list.innerHTML=`<div class="resultCount">${visible.length} ${visible.length===1?'match':'matches'}</div>${html||(all.length===0?'<div class="trueEmpty"><b>NO FIXTURES ON TODAY\'S BOARD</b><span>The latest Airtable sync completed successfully.</span></div>':'<div class="trueEmpty"><b>NO MATCHES IN THIS VIEW</b><span>Try clearing the current filters.</span></div>')}`;
      bindManual(); restoreOpen(open);
    };
    document.querySelectorAll('[data-schedule-bucket]').forEach(btn=>btn.addEventListener('click',()=>{state.ui.scheduleBucket=btn.dataset.scheduleBucket;saveUi();renderSchedule();}));
    bindToolbar(document.getElementById('scheduleToolbar'),f,'schedule',draw); bindRetry(); draw();
  }

  function renderPicks() {
    const open=openKeys(),rows=currentPicks().slice().sort((a,b)=>(Date.parse(b.recordedAt||b.kickoff)||0)-(Date.parse(a.recordedAt||a.kickoff)||0)),f=state.ui.picksFilters;
    const pending=rows.filter(r=>String(r.result||'PENDING').toUpperCase()==='PENDING'),settled=rows.filter(r=>String(r.result||'PENDING').toUpperCase()!=='PENDING');
    let bucket=state.ui.picksBucket;if(!['active','settled','all'].includes(bucket))bucket=pending.length?'active':'settled';state.ui.picksBucket=bucket;
    const stake=settled.reduce((s,r)=>s+(Number(r.stake)||0),0),pl=settled.reduce((s,r)=>s+(Number(r.pl)||0),0),roi=stake?pl/stake*100:0;
    app.innerHTML=`${banners()}<div class="deskLayout"><main class="mainDesk"><header class="pageHead"><div><span class="kicker">OFFICIAL EXPOSURE</span><h1>Picks</h1><p>Active exposure first · settled performance second</p></div><div class="summaryStats pickStats"><span><b class="${pl<0?'lossNum':'winNum'}">${units(pl)}</b> P/L</span><span><b>${roi>=0?'+':''}${roi.toFixed(1)}%</b> ROI</span><span><b>${pending.length}</b> Pending</span></div></header><div class="subnav" role="tablist"><button data-pick-bucket="active" class="${bucket==='active'?'active':''}">Active <span>${pending.length}</span></button><button data-pick-bucket="settled" class="${bucket==='settled'?'active':''}">Settled <span>${settled.length}</span></button><button data-pick-bucket="all" class="${bucket==='all'?'active':''}">All <span>${rows.length}</span></button></div>${picksToolbar(rows,f)}<div id="pickList"></div></main>${picksRail(rows)}</div>`;
    const list=document.getElementById('pickList');
    const draw=()=>{const filtered=applyPickFilters(rows,f);let visible=filtered;if(state.ui.picksBucket==='active')visible=filtered.filter(r=>String(r.result||'PENDING').toUpperCase()==='PENDING');if(state.ui.picksBucket==='settled')visible=filtered.filter(r=>String(r.result||'PENDING').toUpperCase()!=='PENDING');list.innerHTML=`<div class="resultCount">${visible.length} ${visible.length===1?'pick':'picks'}</div>${visible.length?`<div class="pickRows">${visible.map(pickRow).join('')}</div>`:'<div class="trueEmpty"><b>NO PICKS IN THIS VIEW</b><span>Try changing the selected tab or filters.</span></div>'}`;bindManual();restoreOpen(open);};
    document.querySelectorAll('[data-pick-bucket]').forEach(btn=>btn.addEventListener('click',()=>{state.ui.picksBucket=btn.dataset.pickBucket;saveUi();renderPicks();}));
    bindToolbar(document.getElementById('picksToolbar'),f,'picks',draw);bindRetry();draw();
  }

  function bindRetry(){document.querySelector('[data-retry-dashboard]')?.addEventListener('click',()=>refreshDashboard({silent:false}));}
  function renderCurrent(preserve=false){if(!state.dashboardReady)return renderLoading();ensureChrome();currentTab()==='picks'?renderPicks():renderSchedule();renderStatus();}
  function renderLoading(){ensureChrome();app.innerHTML=`<div class="loadingState"><span class="kicker">MATCHDAY DESK</span><h1>Loading today’s board</h1><p>Connecting to Airtable and BSD. The fixture list will appear as soon as the latest board is confirmed.</p><div class="skeletonSet">${Array.from({length:6},()=>'<div class="skeleton"><span></span><b></b><i></i></div>').join('')}</div></div>`;}
  function renderUnavailable(){ensureChrome();app.innerHTML=`<div class="offlineState"><span class="kicker">CONNECTION</span><h1>Board temporarily unavailable</h1><p>${esc(state.dashboardError||'The Airtable board could not be loaded.')}</p><p>The site will retry automatically. A zero-match board will never be shown unless Airtable returns a valid current slate.</p><button id="retryNow">Retry now</button></div>`;document.getElementById('retryNow')?.addEventListener('click',()=>refreshDashboard({silent:false}));}

  window.addEventListener('hashchange',()=>{ensureChrome();if(state.dashboardReady)renderCurrent(true);});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){refreshDashboard({silent:true});refreshLive();}});
  setInterval(()=>{if(document.visibilityState==='visible')refreshLive();},15000);
  setInterval(()=>{if(document.visibilityState==='visible')refreshDashboard({silent:true});},30000);
  setInterval(renderStatus,1000);

  const cached=loadCache(); ensureChrome(); cached?renderCurrent(true):renderLoading();
  refreshDashboard({silent:false}); refreshLive();
})();
