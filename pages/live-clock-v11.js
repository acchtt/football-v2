// SlipTrace v11 — authoritative BSD match clock.
// Uses BSD minute + second as the anchor, ticks locally between polls, and re-syncs on every response.
(() => {
  'use strict';

  const FINISHED = new Set(['finished','ft','full_time','full time','ended','complete','completed']);
  const PAUSED = new Set(['ht','half time','halftime','break','paused','suspended']);

  function norm(v='') {
    return String(v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
      .replace(/\b(fc|cf|afc|sc|ac|sk|fk|club)\b/g,' ')
      .replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  }

  function splitMatch(match='') {
    for (const re of [/\s+vs\.?\s+/i,/\s+v\.?\s+/i,/\s+—\s+/,/\s+–\s+/,/\s+-\s+/]) {
      const parts = String(match).split(re).map(x=>x.trim()).filter(Boolean);
      if (parts.length === 2) return { home: parts[0], away: parts[1] };
    }
    return { home: String(match), away: '' };
  }

  function nameScore(a,b) {
    const x=norm(a), y=norm(b);
    if (!x || !y) return 0;
    if (x === y) return 6;
    if (x.includes(y) || y.includes(x)) return 4;
    const aa=new Set(x.split(' ')), bb=new Set(y.split(' '));
    let shared=0; aa.forEach(t=>bb.has(t)&&shared++);
    const overlap=shared/Math.max(aa.size,bb.size);
    return overlap>=.75?4:overlap>=.5?3:0;
  }

  function rowKey(row) {
    return `${row?.match||''}|${row?.kickoff||row?.displayKickoff||row?.id||row?.pickId||''}`;
  }

  function bus() {
    return window.SLIPTRACE_DATA_BUS || {};
  }

  function events() {
    const rows = bus().live?.events;
    return Array.isArray(rows) ? rows : [];
  }

  function dashboard() {
    return bus().dashboard || null;
  }

  function currentEvent(match) {
    const teams=splitMatch(match||'');
    return events().map(event=>({
      event,
      score:nameScore(teams.home,event.home)+nameScore(teams.away,event.away),
    })).filter(x=>x.score>=6).sort((a,b)=>b.score-a.score)[0]?.event || null;
  }

  function paused(event) {
    const status=String(event?.status||'').toLowerCase();
    const period=String(event?.period||'').toLowerCase();
    const display=String(event?.display||'').toLowerCase();
    if (FINISHED.has(status)) return true;
    return PAUSED.has(status) || PAUSED.has(period) || PAUSED.has(display);
  }

  function label(event) {
    if (!event) return '';
    const status=String(event.status||'').toLowerCase();
    if (FINISHED.has(status)) return 'FT';

    const minute=Number(event.minute);
    if (!Number.isFinite(minute)) return event.display || (event.period ? String(event.period).toUpperCase() : 'LIVE');

    let second=Number(event.second);
    if (!Number.isFinite(second)) second=0;
    second=Math.max(0,Math.min(59,Math.floor(second)));

    // Only extrapolate briefly between successful BSD polls. Never let a stale feed invent minutes.
    const liveAt=Number(bus().liveAt)||Date.now();
    const ageSeconds=Math.max(0,Math.min(12,Math.floor((Date.now()-liveAt)/1000)));
    const advance=paused(event)?0:ageSeconds;
    const total=Math.max(0,Math.floor(minute)*60+second+advance);
    const mm=Math.floor(total/60);
    const ss=String(total%60).padStart(2,'0');
    return `${mm}:${ss}`;
  }

  function findRow(key, collection) {
    return (collection||[]).find(row=>rowKey(row)===key) || null;
  }

  function updateListRows() {
    const data=dashboard();
    if (!data) return;

    document.querySelectorAll('details.fixtureRow[data-row-key]').forEach(node=>{
      const row=findRow(node.dataset.rowKey,data.schedule);
      const event=row?currentEvent(row.match):null;
      if (!event) return;
      const score=node.querySelector('.score');
      const strong=score?.querySelector('strong');
      const clock=score?.querySelector('span');
      if (strong && event.homeScore!==undefined && event.awayScore!==undefined) strong.textContent=`${event.homeScore}–${event.awayScore}`;
      if (clock) clock.textContent=label(event);
      if (score) {
        score.classList.toggle('live',!FINISHED.has(String(event.status||'').toLowerCase()));
        score.classList.toggle('final',FINISHED.has(String(event.status||'').toLowerCase()));
      }
    });

    document.querySelectorAll('details.pickRow[data-row-key]').forEach(node=>{
      const row=findRow(node.dataset.rowKey,data.picks);
      const event=row?currentEvent(row.match):null;
      if (!event) return;
      const score=node.querySelector('.score');
      const strong=score?.querySelector('strong');
      const clock=score?.querySelector('span');
      if (strong && event.homeScore!==undefined && event.awayScore!==undefined) strong.textContent=`${event.homeScore}–${event.awayScore}`;
      if (clock) clock.textContent=label(event);
    });
  }

  function field(name) {
    return [...document.querySelectorAll('#matchApp .liveData .matchField')]
      .find(node=>node.querySelector('span')?.textContent.trim().toLowerCase()===name.toLowerCase());
  }

  function setField(name,value) {
    const strong=field(name)?.querySelector('strong');
    if (strong) strong.textContent=value;
  }

  function updateMatchDesk() {
    const matchApp=document.getElementById('matchApp');
    if (!matchApp || matchApp.hidden || !/^#match\//.test(location.hash)) return;
    const data=dashboard();
    if (!data) return;

    let key='';
    try { key=decodeURIComponent(location.hash.slice('#match/'.length)); } catch { return; }
    const row=findRow(key,data.schedule);
    if (!row) return;
    const event=currentEvent(row.match);
    if (!event) return;

    const clock=label(event);
    const scoreBoard=matchApp.querySelector('.matchScoreboard>div');
    if (scoreBoard && event.homeScore!==undefined && event.awayScore!==undefined) {
      const bs=scoreBoard.querySelectorAll('b');
      if (bs.length>=2) { bs[0].textContent=event.homeScore; bs[1].textContent=event.awayScore; }
    }
    const heroClock=matchApp.querySelector('.matchScoreboard>em');
    if (heroClock) heroClock.textContent=clock;
    setField('Score',`${event.homeScore}–${event.awayScore}`);
    setField('Minute',clock);
    if (event.period!==undefined && event.period!==null) {
      const period=String(event.period);
      setField('Status',period==='1'?'1H':period==='2'?'2H':period==='3'?'ET1':period==='4'?'ET2':period.toUpperCase());
    }
  }

  function tick() {
    updateListRows();
    updateMatchDesk();
  }

  setInterval(tick,500);
  window.addEventListener('hashchange',()=>setTimeout(tick,20));
  document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible') tick(); });
  tick();
})();
