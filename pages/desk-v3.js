// SlipTrace Matchday Desk v3 — resilient, single-controller frontend.
(() => {
  'use strict';

  const API = window.SLIPTRACE_API || 'https://football-v2.acchtt.workers.dev';
  const ZONE = 'Asia/Ho_Chi_Minh';
  const app = document.getElementById('app');
  const CACHE_KEY = 'sliptrace.dashboard.v3';
  const UI_KEY = 'sliptrace.ui.v3';
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
    try {
      return Object.assign({
        scheduleBucket: 'upcoming',
        picksBucket: 'active',
        scheduleFilters: { q:'', tier:'ALL', grade:'ALL', competition:'ALL' },
        picksFilters: { q:'', date:'', model:'ALL', competition:'ALL' },
      }, JSON.parse(sessionStorage.getItem(UI_KEY) || '{}'));
    } catch {
      return {
        scheduleBucket: 'upcoming', picksBucket: 'active',
        scheduleFilters: { q:'', tier:'ALL', grade:'ALL', competition:'ALL' },
        picksFilters: { q:'', date:'', model:'ALL', competition:'ALL' },
      };
    }
  }
  function saveUi(){ try { sessionStorage.setItem(UI_KEY, JSON.stringify(state.ui)); } catch {} }

  function esc(v='') {
    return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function norm(v='') {
    return String(v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
      .replace(/\b(fc|cf|afc|sc|ac|sk|fk|club)\b/g,' ')
      .replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  }
  function splitMatch(match='') {
    for (const re of [/\s+vs\.?\s+/i,/\s+v\.?\s+/i,/\s+—\s+/,/\s+–\s+/,/\s+-\s+/]) {
      const p = String(match).split(re).map(x=>x.trim()).filter(Boolean);
      if (p.length === 2) return { home:p[0], away:p[1] };
    }
    return { home:String(match), away:'' };
  }
  function nameScore(a,b) {
    const x=norm(a), y=norm(b); if(!x||!y) return 0;
    if(x===y) return 6; if(x.includes(y)||y.includes(x)) return 4;
    const aa=new Set(x.split(' ')), bb=new Set(y.split(' ')); let shared=0;
    aa.forEach(t=>bb.has(t)&&shared++);
    const overlap=shared/Math.max(aa.size,bb.size);
    return overlap>=.75?4:overlap>=.5?3:0;
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
  function keyFor(row){ return `${row?.match||''}|${row?.kickoff||row?.displayKickoff||row?.id||''}`; }
  function currentTab(){ return location.hash==='#picks'?'picks':'schedule'; }

  function eventStatus(row) {
    const live=liveEvent(row?.match||'');
    return String(live?.status||row?.bsd?.status||'').trim().toLowerCase();
  }
  function matchState(row) {
    if(row?.manualScore) return 'ended';
    const event=liveEvent(row?.match||'');
    const s=eventStatus(row);
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
      const status=String(event.status||'').toLowerCase();
      const ended=FINISHED.has(status);
      const label=ended?'FT':event.minute!==undefined?`${event.minute}′`:event.currentMinute!==undefined?`${event.currentMinute}′`:event.period?String(event.period).toUpperCase():'LIVE';
      return {home:Number(event.homeScore),away:Number(event.awayScore),label,kind:ended?'final':'live'};
    }
    if(row?.bsd && row.bsd.home!==undefined && row.bsd.away!==undefined) {
      const status=String(row.bsd.status||'').toLowerCase();
      const ended=FINISHED.has(status);
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
    if(Number.isFinite(odds) && result!=='PENDING') {
      const legStake=stake/legs.length;
      pl=outcomes.reduce((sum,o)=>sum+(o==='WIN'?legStake*(odds-1):o==='LOSS'?-legStake:0),0);
      pl=Math.round(pl*1000)/1000;
    }
    return {...row,result,pl,autoSettled:result!=='PENDING'};
  }
  function picks(){ return (state.data.picks||[]).map(autoSettle); }

  function loadCache() {
    try {
      const cached=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');
      if(!cached?.payload || !Array.isArray(cached.payload.schedule) || !Array.isArray(cached.payload.picks)) return false;
      state.data=cached.payload;
      state.dashboardReady=true;
      state.cached=true;
      state.lastDashboardAt=Number(cached.savedAt)||0;
      return true;
    } catch { return false; }
  }
  function saveCache(payload) {
    try { localStorage.setItem(CACHE_KEY,JSON.stringify({savedAt:Date.now(),payload})); } catch {}
  }

  async function fetchJson(url, timeoutMs=9000) {
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try {
      const res=await fetch(url,{cache:'no-store',signal:controller.signal});
      const body=await res.json().catch(()=>null);
      if(!res.ok || !body?.ok) throw new Error(body?.error||`HTTP ${res.status}`);
      return body;
    } finally { clearTimeout(timer); }
  }
  async function withRetry(fn, attempts=3) {
    let last;
    for(let i=0;i<attempts;i++) {
      try { return await fn(); } catch(err) {
        last=err;
        if(i<attempts-1) await new Promise(r=>setTimeout(r,[700,1800,3500][i]||2500));
      }
    }
    throw last;
  }
  function dataSignature(payload) {
    const s=(payload?.schedule||[]).map(r=>`${r.match}|${r.slateDate}|${r.tier}|${r.grade}|${r.manualScore?.home??''}-${r.manualScore?.away??''}`).join('\n');
    const p=(payload?.picks||[]).map(r=>`${r.id||r.pickId||r.match}|${r.result}|${r.pl??''}|${r.recordedAt||''}`).join('\n');
    return `${s}\n--\n${p}`;
  }

  async function refreshDashboard({silent=false}={}) {
    if(state.dashboardBusy) return;
    state.dashboardBusy=true;
    try {
      const before=dataSignature(state.data);
      const payload=await withRetry(()=>fetchJson(`${API}/api/dashboard-data?t=${Date.now()}`,10000),3);
      const next={schedule:Array.isArray(payload.schedule)?payload.schedule:[],picks:Array.isArray(payload.picks)?payload.picks:[]};
      state.data=next;
      state.dashboardReady=true;
      state.cached=false;
      state.dashboardError='';
      state.lastDashboardAt=Date.now();
      saveCache(next);
      const changed=before!==dataSignature(next);
      if(changed || !silent) renderCurrent(true);
      else renderStatus();
    } catch(err) {
      state.dashboardError=err?.message||'Airtable sync failed';
      if(!state.dashboardReady) renderUnavailable();
      else { state.cached=true; renderCurrent(true); }
      scheduleRetry();
    } finally { state.dashboardBusy=false; }
  }
  async function refreshLive() {
    if(state.liveBusy) return;
    state.liveBusy=true;
    try {
      const payload=await fetchJson(`${API}/api/live-scores?t=${Date.now()}`,7000);
      const before=JSON.stringify(state.liveEvents.map(e=>[e.id,e.eventId,e.homeScore,e.awayScore,e.status,e.minute,e.currentMinute]));
      state.liveEvents=Array.isArray(payload.events)?payload.events:[];
      state.liveError='';
      state.lastLiveAt=Date.now();
      const after=JSON.stringify(state.liveEvents.map(e=>[e.id,e.eventId,e.homeScore,e.awayScore,e.status,e.minute,e.currentMinute]));
      if(state.dashboardReady && before!==after) renderCurrent(true); else renderStatus();
    } catch(err) {
      state.liveError=err?.message||'BSD live scores unavailable';
      renderStatus();
    } finally { state.liveBusy=false; }
  }
  function scheduleRetry() {
    if(state.retryTimer) return;
    state.retryTimer=setTimeout(()=>{ state.retryTimer=null; refreshDashboard({silent:false}); },5000);
  }

  function relativeAge(ts) {
    if(!ts) return 'waiting';
    const sec=Math.max(0,Math.floor((Date.now()-ts)/1000));
    if(sec<5) return 'now';
    if(sec<60) return `${sec}s`;
    if(sec<3600) return `${Math.floor(sec/60)}m`;
    return `${Math.floor(sec/3600)}h`;
  }
  function renderStatus() {
    const node=document.getElementById('systemStatus'); if(!node) return;
    const dashFresh=state.lastDashboardAt && Date.now()-state.lastDashboardAt<90000 && !state.cached;
    const airClass=state.dashboardError?'bad':dashFresh?'ok':state.dashboardReady?'warn':'idle';
    const airText=state.dashboardError?(state.dashboardReady?'STALE':'ERROR'):dashFresh?'SYNCED':state.dashboardReady?'CACHED':'CONNECTING';
    const bsdFresh=state.lastLiveAt && Date.now()-state.lastLiveAt<45000 && !state.liveError;
    const bsdClass=state.liveError?'bad':bsdFresh?'ok':'idle';
    const bsdText=state.liveError?'OFFLINE':bsdFresh?'LIVE':'CONNECTING';
    const updated=Math.max(state.lastDashboardAt||0,state.lastLiveAt||0);
    node.innerHTML=`<span class="sys ${bsdClass}"><i></i>BSD ${bsdText}</span><span class="sys ${airClass}"><i></i>Airtable ${airText}</span><span class="sysAge">Updated ${relativeAge(updated)} ago</span>`;
  }

  function topNav() {
    const active=currentTab();
    return `<header class="topbar"><div class="topbarIn"><a href="#schedule" class="brand"><span class="brandMark">ST</span><b>SLIPTRACE</b></a><div id="systemStatus" class="systemStatus" aria-live="polite"></div><nav><a href="#schedule" class="${active==='schedule'?'active':''}">Schedule</a><a href="#picks" class="${active==='picks'?'active':''}">Picks</a></nav></div></header>`;
  }
  function ensureChrome() {
    let top=document.getElementById('appChrome');
    if(!top){ top=document.createElement('div'); top.id='appChrome'; document.body.insertBefore(top,app); }
    top.innerHTML=topNav(); renderStatus();
  }

  function openKeys() {
    return [...document.querySelectorAll('details[data-row-key][open]')].map(d=>d.dataset.rowKey);
  }
  function restoreOpen(keys) {
    if(!keys?.length) return;
    document.querySelectorAll('details[data-row-key]').forEach(d=>{ if(keys.includes(d.dataset.rowKey)) d.open=true; });
  }

  function gradeClass(g){ const s=String(g||''); return s.startsWith('A')?'a':s.startsWith('B')?'b':'n'; }
  function scheduleRow(row) {
    const teams=splitMatch(row.match||'');
    const status=matchState(row);
    const score=resolvedScore(row);
    return `<details class="fixtureRow ${row.tier==='FOCUS'?'focus':''} ${status==='live'?'live':''}" data-row-key="${esc(keyFor(row))}">
      <summary>
        <div class="kick"><strong>${esc(fmtTime(row.displayKickoff||row.kickoff))}</strong><span>ICT</span></div>
        <div class="fixtureTeams"><div>${esc(teams.home)}</div><div>${esc(teams.away)}</div><small>${esc(row.competition||'')}</small></div>
        <div class="signal"><span class="grade ${gradeClass(row.grade)}">${esc(row.grade||'—')}</span><span class="tier ${row.tier==='FOCUS'?'focusText':'watchText'}">${esc(row.tier==='WATCHLIST'?'WATCH':row.tier||'—')}</span></div>
        <div class="score"><strong>${score?`${score.home}–${score.away}`:'—'}</strong><span>${esc(score?.label||'')}</span></div>
        <span class="chev">⌄</span>
      </summary>
      ${scheduleDetail(row)}
    </details>`;
  }
  function scheduleDetail(row) {
    const cells=[['Structure',row.structure||'—'],['XI',row.xiStatus||'—'],['Market',row.marketStatus||'—'],['Coverage',row.coverageStatus||'—']];
    return `<div class="rowDetail"><dl>${cells.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>${row.frozenPreSummary?`<div class="note"><b>PRE</b><p>${esc(row.frozenPreSummary)}</p></div>`:''}${row.coverageNotes?`<div class="note"><b>Notes</b><p>${esc(row.coverageNotes)}</p></div>`:''}${manualEditor(row)}</div>`;
  }
  function pickRow(raw) {
    const row=autoSettle(raw), teams=splitMatch(row.match||''), score=resolvedScore(row);
    const result=String(row.result||'PENDING').toUpperCase();
    const cls=['WIN','HALF WIN'].includes(result)?'win':['LOSS','HALF LOSS'].includes(result)?'loss':['PUSH','VOID'].includes(result)?'push':'pending';
    return `<details class="pickRow ${cls}" data-row-key="${esc(keyFor(row))}">
      <summary>
        <div class="pickWhen"><strong>${esc(fmtTime(row.displayKickoff||row.kickoff))}</strong><span>${esc(dateKey(row.kickoff))}</span></div>
        <div class="fixtureTeams"><div>${esc(teams.home)}</div><div>${esc(teams.away)}</div><small>${esc(row.competition||'')}</small></div>
        <div class="selection"><span>Over ${esc(row.line??'—')}</span><strong>@ ${esc(row.odds??'—')}</strong></div>
        <div class="score"><strong>${score?`${score.home}–${score.away}`:'—'}</strong><span>${esc(score?.label||'')}</span></div>
        <div class="result"><strong>${esc(result)}</strong><span>${units(row.pl)}</span></div><span class="chev">⌄</span>
      </summary>
      ${pickDetail(row)}
    </details>`;
  }
  function pickDetail(row) {
    const cells=[['Stake',`${row.stake??'—'}u`],['Recorded',fmtDateTime(row.recordedAt||row.kickoff)],['Model',row.modelVersion||'—'],['Source',row.source||'—']];
    return `<div class="rowDetail"><dl>${cells.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>${row.reason?`<div class="note"><b>Decision</b><p>${esc(row.reason)}</p></div>`:''}${manualEditor(row)}</div>`;
  }

  function manualEditor(row) {
    const teams=splitMatch(row.match||'');
    const seed=row.manualScore||null;
    return `<div class="manual"><div><b>Manual final score</b><span>Overrides BSD</span></div><form class="manualForm" data-match="${esc(row.match||'')}" data-kickoff="${esc(row.kickoff||row.displayKickoff||'')}"><label>${esc(teams.home||'Home')}<input name="home" type="number" min="0" max="99" value="${seed?.home??''}" required></label><label>${esc(teams.away||'Away')}<input name="away" type="number" min="0" max="99" value="${seed?.away??''}" required></label><button type="submit">Save</button>${row.manualScore?'<button type="button" class="clearManual">Use BSD</button>':''}</form></div>`;
  }
  function bindManual() {
    document.querySelectorAll('.manualForm').forEach(form=>{
      form.addEventListener('submit',async e=>{
        e.preventDefault(); const button=form.querySelector('button[type="submit"]'); button.disabled=true; button.textContent='Saving…';
        try {
          const fd=new FormData(form);
          await postScore({match:form.dataset.match,kickoff:form.dataset.kickoff,home:Number(fd.get('home')),away:Number(fd.get('away')),action:'save'});
        } catch(err){ alert(`Manual score could not be saved.\n\n${err.message}`); }
        finally { button.disabled=false; button.textContent='Save'; }
      });
      form.querySelector('.clearManual')?.addEventListener('click',async e=>{
        const b=e.currentTarget; b.disabled=true; b.textContent='Clearing…';
        try { await postScore({match:form.dataset.match,kickoff:form.dataset.kickoff,action:'clear'}); }
        catch(err){ alert(`Manual score could not be cleared.\n\n${err.message}`); }
        finally { b.disabled=false; b.textContent='Use BSD'; }
      });
    });
  }
  async function postScore(body) {
    const res=await fetch(`${API}/api/manual-score`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const j=await res.json().catch(()=>null); if(!res.ok||!j?.ok) throw new Error(j?.error||`HTTP ${res.status}`);
    await refreshDashboard({silent:false});
  }

  function unique(rows,field){ return [...new Set(rows.map(r=>r?.[field]).filter(Boolean))].sort((a,b)=>String(a).localeCompare(String(b))); }
  function scheduleToolbar(rows,f) {
    return `<form class="toolbar" id="scheduleToolbar"><input name="q" type="search" placeholder="Search team or competition…" value="${esc(f.q||'')}" aria-label="Search matches"><select name="tier" aria-label="Tier"><option value="ALL">Tier · All</option><option value="FOCUS" ${f.tier==='FOCUS'?'selected':''}>Focus</option><option value="WATCHLIST" ${f.tier==='WATCHLIST'?'selected':''}>Watchlist</option></select><select name="grade" aria-label="Grade"><option value="ALL">Grade · All</option>${unique(rows,'grade').map(v=>`<option value="${esc(v)}" ${f.grade===v?'selected':''}>${esc(v)}</option>`).join('')}</select><select name="competition" aria-label="Competition"><option value="ALL">Competition · All</option>${unique(rows,'competition').map(v=>`<option value="${esc(v)}" ${f.competition===v?'selected':''}>${esc(v)}</option>`).join('')}</select><button type="button" class="reset">Reset</button></form>`;
  }
  function picksToolbar(rows,f) {
    return `<form class="toolbar pickTools" id="picksToolbar"><input name="q" type="search" placeholder="Search match or competition…" value="${esc(f.q||'')}" aria-label="Search picks"><input name="date" type="date" value="${esc(f.date||'')}" aria-label="Match date"><select name="model" aria-label="Model"><option value="ALL">Model · All</option>${unique(rows,'modelVersion').reverse().map(v=>`<option value="${esc(v)}" ${f.model===v?'selected':''}>${esc(v)}</option>`).join('')}</select><select name="competition" aria-label="Competition"><option value="ALL">Competition · All</option>${unique(rows,'competition').map(v=>`<option value="${esc(v)}" ${f.competition===v?'selected':''}>${esc(v)}</option>`).join('')}</select><button type="button" class="reset">Reset</button></form>`;
  }
  function applyScheduleFilters(rows,f) {
    const q=norm(f.q||'');
    return rows.filter(r=>(f.tier==='ALL'||r.tier===f.tier)&&(f.grade==='ALL'||r.grade===f.grade)&&(f.competition==='ALL'||r.competition===f.competition)&&(!q||norm(`${r.match} ${r.competition}`).includes(q)));
  }
  function applyPickFilters(rows,f) {
    const q=norm(f.q||'');
    return rows.filter(r=>(!f.date||dateKey(r.kickoff)===f.date)&&(f.model==='ALL'||r.modelVersion===f.model)&&(f.competition==='ALL'||r.competition===f.competition)&&(!q||norm(`${r.match} ${r.competition} ${r.reason||''}`).includes(q)));
  }
  function bindToolbar(form,filters,type,draw) {
    if(!form) return;
    form.addEventListener('input',()=>{
      const fd=new FormData(form); filters.q=String(fd.get('q')||''); filters.competition=String(fd.get('competition')||'ALL');
      if(type==='schedule'){ filters.tier=String(fd.get('tier')||'ALL'); filters.grade=String(fd.get('grade')||'ALL'); }
      else { filters.date=String(fd.get('date')||''); filters.model=String(fd.get('model')||'ALL'); }
      saveUi(); draw();
    });
    form.querySelector('.reset')?.addEventListener('click',()=>{
      if(type==='schedule') Object.assign(filters,{q:'',tier:'ALL',grade:'ALL',competition:'ALL'});
      else Object.assign(filters,{q:'',date:'',model:'ALL',competition:'ALL'});
      saveUi(); renderCurrent(true);
    });
  }

  function section(title,rows,kind='') {
    if(!rows.length) return '';
    return `<section class="matchGroup ${kind}"><header><span>${esc(title)}</span><b>${rows.length}</b></header><div class="rows">${rows.map(scheduleRow).join('')}</div></section>`;
  }
  function scheduleRail(todayRows) {
    const live=todayRows.filter(r=>matchState(r)==='live').slice(0,4);
    const next=todayRows.filter(r=>matchState(r)==='upcoming').sort((a,b)=>kickoffMs(a)-kickoffMs(b)).slice(0,4);
    const pending=picks().filter(r=>String(r.result||'PENDING').toUpperCase()==='PENDING').slice(0,4);
    const mini=r=>{const t=splitMatch(r.match||'');return `<li><time>${esc(fmtTime(r.kickoff||r.displayKickoff))}</time><span>${esc(t.home)}<br>${esc(t.away)}</span></li>`;};
    return `<aside class="rightRail"><section><h3><i class="dot red"></i>Live now</h3>${live.length?`<ul>${live.map(mini).join('')}</ul>`:'<p>None right now</p>'}</section><section><h3>Next</h3>${next.length?`<ul>${next.map(mini).join('')}</ul>`:'<p>No more fixtures</p>'}</section><section><h3>Active bets</h3><strong class="railBig">${pending.length}</strong><p>${pending.length?`${esc(splitMatch(pending[0].match).home)}${pending.length>1?` +${pending.length-1} more`:''}`:'No pending exposure'}</p></section></aside>`;
  }
  function picksRail(all) {
    const pending=all.filter(r=>String(r.result||'PENDING').toUpperCase()==='PENDING');
    const settled=all.filter(r=>String(r.result||'PENDING').toUpperCase()!=='PENDING');
    const pl=settled.reduce((s,r)=>s+(Number(r.pl)||0),0), stake=settled.reduce((s,r)=>s+(Number(r.stake)||0),0), roi=stake?pl/stake*100:0;
    return `<aside class="rightRail"><section><h3>Active exposure</h3><strong class="railBig">${pending.length}</strong><p>pending bets</p></section><section><h3>Performance</h3><strong class="railBig ${pl<0?'negative':'positive'}">${units(pl)}</strong><p>${roi>=0?'+':''}${roi.toFixed(1)}% ROI</p></section><section><h3>Settled</h3><strong class="railBig">${settled.length}</strong><p>${all.length} total picks</p></section></aside>`;
  }

  function dataBanner() {
    if(!state.dashboardError && !state.cached) return '';
    return `<div class="dataBanner"><b>${state.dashboardError?'Airtable connection interrupted':'Using cached board'}</b><span>${state.dashboardReady?'Showing the last good board while reconnecting.':'Reconnecting…'}</span><button id="retryNow" type="button">Retry now</button></div>`;
  }

  function renderSchedule(preserve=false) {
    const open=preserve?openKeys():[];
    const today=todayKey();
    const rows=(state.data.schedule||[]).filter(r=>r.slateDate===today).sort((a,b)=>kickoffMs(a)-kickoffMs(b));
    const focus=rows.filter(r=>r.tier==='FOCUS').length, watch=rows.filter(r=>r.tier==='WATCHLIST').length, live=rows.filter(r=>matchState(r)==='live').length;
    const upcoming=rows.filter(r=>matchState(r)!=='ended').length, ended=rows.filter(r=>matchState(r)==='ended').length;
    let bucket=state.ui.scheduleBucket; if(!['upcoming','ended'].includes(bucket)) bucket='upcoming';
    app.innerHTML=`${dataBanner()}<div class="deskLayout"><main class="mainDesk"><header class="pageHead"><div><span class="kicker">MATCHDAY</span><h1>Schedule</h1><p>${esc(fmtDate(today))} · ICT</p></div><div class="summaryStats"><span><b>${focus}</b>Focus</span><span><b>${watch}</b>Watch</span><span class="liveStat"><b>${live}</b>Live</span></div></header><div class="subnav"><button class="${bucket==='upcoming'?'active':''}" data-bucket="upcoming">Upcoming / Live <span>${upcoming}</span></button><button class="${bucket==='ended'?'active':''}" data-bucket="ended">Ended <span>${ended}</span></button></div>${scheduleToolbar(rows,state.ui.scheduleFilters)}<div id="scheduleList"></div></main>${scheduleRail(rows)}</div>`;
    const list=document.getElementById('scheduleList');
    const draw=()=>{
      const filtered=applyScheduleFilters(rows,state.ui.scheduleFilters).sort((a,b)=>kickoffMs(a)-kickoffMs(b));
      const now=Date.now(); let visible=[]; let html='';
      if(bucket==='upcoming') {
        visible=filtered.filter(r=>matchState(r)!=='ended');
        const liveRows=visible.filter(r=>matchState(r)==='live');
        const near=visible.filter(r=>matchState(r)==='upcoming'&&kickoffMs(r)<=now+60*60*1000);
        const later=visible.filter(r=>matchState(r)==='upcoming'&&kickoffMs(r)>now+60*60*1000);
        html=section('Live now',liveRows,'liveGroup')+section('Next 60 minutes',near,'nextGroup')+section('Later today',later,'laterGroup');
      } else {
        visible=filtered.filter(r=>matchState(r)==='ended');
        const recent=visible.filter(r=>now-kickoffMs(r)<=5*60*60*1000);
        const earlier=visible.filter(r=>now-kickoffMs(r)>5*60*60*1000);
        html=section('Just finished',recent,'endedGroup')+section('Earlier today',earlier,'endedGroup');
      }
      list.innerHTML=`<div class="resultCount">${visible.length} matches${filtered.length!==rows.length?` · ${filtered.length} matched by filters`:''}</div>${html||'<div class="trueEmpty">No matches in this view.</div>'}`;
      bindManual(); restoreOpen(open);
    };
    document.querySelectorAll('[data-bucket]').forEach(b=>b.addEventListener('click',()=>{state.ui.scheduleBucket=b.dataset.bucket;saveUi();renderSchedule(true);}));
    bindToolbar(document.getElementById('scheduleToolbar'),state.ui.scheduleFilters,'schedule',draw);
    document.getElementById('retryNow')?.addEventListener('click',()=>refreshDashboard({silent:false}));
    draw();
  }

  function renderPicks(preserve=false) {
    const open=preserve?openKeys():[];
    const all=picks().slice().sort((a,b)=>(Date.parse(b.recordedAt||b.kickoff)||0)-(Date.parse(a.recordedAt||a.kickoff)||0));
    const pending=all.filter(r=>String(r.result||'PENDING').toUpperCase()==='PENDING'), settled=all.filter(r=>String(r.result||'PENDING').toUpperCase()!=='PENDING');
    let bucket=state.ui.picksBucket; if(!['active','settled','all'].includes(bucket)) bucket=pending.length?'active':'settled'; if(bucket==='active'&&!pending.length&&settled.length) bucket='settled';
    app.innerHTML=`${dataBanner()}<div class="deskLayout"><main class="mainDesk"><header class="pageHead"><div><span class="kicker">BET LEDGER</span><h1>Picks</h1><p>Official exposure and settled results</p></div></header><div class="subnav"><button class="${bucket==='active'?'active':''}" data-pick-bucket="active">Active <span>${pending.length}</span></button><button class="${bucket==='settled'?'active':''}" data-pick-bucket="settled">Settled <span>${settled.length}</span></button><button class="${bucket==='all'?'active':''}" data-pick-bucket="all">All <span>${all.length}</span></button></div>${picksToolbar(all,state.ui.picksFilters)}<div id="picksList"></div></main>${picksRail(all)}</div>`;
    const list=document.getElementById('picksList');
    const draw=()=>{
      const filtered=applyPickFilters(all,state.ui.picksFilters); let visible=filtered;
      if(bucket==='active') visible=filtered.filter(r=>String(r.result||'PENDING').toUpperCase()==='PENDING');
      if(bucket==='settled') visible=filtered.filter(r=>String(r.result||'PENDING').toUpperCase()!=='PENDING');
      list.innerHTML=`<div class="resultCount">${visible.length} picks${filtered.length!==all.length?` · ${filtered.length} matched by filters`:''}</div>${visible.length?`<div class="pickRows">${visible.map(pickRow).join('')}</div>`:'<div class="trueEmpty">No picks in this view.</div>'}`;
      bindManual(); restoreOpen(open);
    };
    document.querySelectorAll('[data-pick-bucket]').forEach(b=>b.addEventListener('click',()=>{state.ui.picksBucket=b.dataset.pickBucket;saveUi();renderPicks(true);}));
    bindToolbar(document.getElementById('picksToolbar'),state.ui.picksFilters,'picks',draw);
    document.getElementById('retryNow')?.addEventListener('click',()=>refreshDashboard({silent:false}));
    draw();
  }

  function renderCurrent(preserve=false) {
    if(!state.dashboardReady) return renderLoading();
    ensureChrome();
    currentTab()==='picks'?renderPicks(preserve):renderSchedule(preserve);
    renderStatus();
  }
  function renderLoading() {
    ensureChrome();
    app.innerHTML=`<div class="loadingState"><span class="kicker">CONNECTING</span><h1>Loading matchday board</h1><p>Airtable data is being fetched. The board will not show a false zero state.</p><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>`;
    renderStatus();
  }
  function renderUnavailable() {
    ensureChrome();
    app.innerHTML=`<div class="offlineState"><span class="kicker">DATA UNAVAILABLE</span><h1>Matchday board is reconnecting</h1><p>${esc(state.dashboardError||'Airtable could not be reached.')}</p><p>No empty board is being shown because the current data could not be verified.</p><button id="retryFull" type="button">Retry now</button></div>`;
    document.getElementById('retryFull')?.addEventListener('click',()=>refreshDashboard({silent:false})); renderStatus();
  }

  window.addEventListener('hashchange',()=>renderCurrent(false));
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible'){ refreshDashboard({silent:true}); refreshLive(); }
  });

  const hadCache=loadCache();
  ensureChrome();
  if(hadCache) renderCurrent(false); else renderLoading();
  refreshDashboard({silent:hadCache});
  refreshLive();
  setInterval(()=>{ if(document.visibilityState==='visible') refreshLive(); },15000);
  setInterval(()=>{ if(document.visibilityState==='visible') refreshDashboard({silent:true}); },30000);
  setInterval(renderStatus,1000);
})();
