(() => {
  'use strict';

  const API = window.SLIPTRACE_API || 'https://football-v2.acchtt.workers.dev';
  const CACHE_KEYS = ['sliptrace.dashboard.compat.v2','sliptrace.dashboard.compat.v1','sliptrace.dashboard.v4'];
  let board = null;
  let scheduled = false;
  let working = false;

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

  function decorateRow(row,groupName) {
    const br=boardRowFor(row);
    addCompetition(row,br,groupName);
    const fallback=row.querySelector('.matchTime')?.textContent||'';
    row.dataset.kickoffSort=String(parseKickoff(br?.kickoff||br?.displayKickoff||br?.kickoffICT,fallback));
    const clock=row.querySelector('.matchScore [data-clock]');
    const clockText=(clock?.textContent||'').trim().toUpperCase();
    row.classList.toggle('is-ft-row',/^FT\b/.test(clockText));
    row.classList.toggle('is-live-row',!!row.querySelector('.tag.live')&&!row.classList.contains('is-ft-row'));
  }

  function flattenPanel(panel) {
    const groups=[...panel.querySelectorAll(':scope > .leagueGroup')];
    if(!groups.length) return;
    const items=[];
    for(const group of groups){
      const groupName=group.querySelector('.leagueTitle strong')?.textContent?.trim()||'';
      for(const row of group.querySelectorAll(':scope > .matchRow')){
        decorateRow(row,groupName);
        items.push(row);
      }
    }
    items.sort((a,b)=>Number(a.dataset.kickoffSort)-Number(b.dataset.kickoffSort));
    let list=panel.querySelector(':scope > .chronoMatches');
    if(!list){list=document.createElement('div');list.className='chronoMatches';}
    for(const row of items) list.appendChild(row);
    groups.forEach(g=>g.remove());
    panel.appendChild(list);
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
    document.querySelectorAll('.matchRow').forEach(row=>{
      if(row.closest('.chronoMatches')) decorateRow(row,row.querySelector('.matchCompetition')?.textContent||'');
    });
    decorateHero();
    decorateSideRail();
  }

  async function polish() {
    if(working)return; working=true;
    try {
      await ensureBoard();
      document.querySelectorAll('.mainCol > .panel').forEach(flattenPanel);
      decorateExistingRows();
    } finally {working=false;}
  }

  function schedule() {
    if(scheduled)return; scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;polish();});
  }

  const observer=new MutationObserver(schedule);
  observer.observe(document.getElementById('app'),{childList:true,subtree:true});
  window.addEventListener('hashchange',schedule);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')schedule();});
  schedule();
})();