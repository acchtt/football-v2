(() => {
  'use strict';

  const API = window.SLIPTRACE_API || 'https://football-v2.acchtt.workers.dev';
  const CACHE_KEYS = ['sliptrace.dashboard.compat.v2','sliptrace.dashboard.compat.v1','sliptrace.dashboard.v4'];
  const STOP = new Set(['fc','cf','sc','ac','afc','club','united','city','town','athletic','sporting','football','calcio']);
  let board = null;
  let loading = null;
  let queued = false;
  let busy = false;

  function norm(v='') {
    return String(v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
      .replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  }

  function tokens(v) {
    return norm(v).split(' ').filter(Boolean);
  }

  function meaningful(v) {
    const t=tokens(v).filter(x=>!STOP.has(x));
    return t.length ? t : tokens(v);
  }

  function acronym(v) {
    const t=meaningful(v);
    return t.length >= 2 ? t.map(x=>x[0]).join('') : '';
  }

  function teamScore(a,b) {
    const x=norm(a), y=norm(b);
    if(!x||!y) return 0;
    if(x===y) return 100;

    const ax=meaningful(a), by=meaningful(b);
    const sx=ax.join(' '), sy=by.join(' ');
    if(sx && sy && sx===sy) return 96;

    if(sx.length>=4 && sy.length>=4 && (sx.includes(sy)||sy.includes(sx))) return 91;

    const aa=acronym(a), bb=acronym(b);
    if(aa.length>=3 && (aa===y.replace(/\s/g,'') || bb===x.replace(/\s/g,''))) return 88;

    const A=new Set(ax), B=new Set(by);
    let overlap=0; A.forEach(t=>B.has(t)&&overlap++);
    const ratio=overlap/Math.max(A.size,B.size,1);
    if(overlap>=1 && ratio>=.75) return 86;
    if(overlap>=2 && ratio>=.5) return 82;
    return 0;
  }

  function splitMatch(match='') {
    for(const re of [/\s+vs\.?\s+/i,/\s+v\.?\s+/i,/\s+—\s+/,/\s+–\s+/,/\s+-\s+/]) {
      const p=String(match).split(re).map(x=>x.trim()).filter(Boolean);
      if(p.length===2) return {home:p[0],away:p[1]};
    }
    return {home:String(match),away:''};
  }

  function readCache() {
    for(const key of CACHE_KEYS) {
      try {
        const v=JSON.parse(localStorage.getItem(key)||'null');
        if(v && Array.isArray(v.schedule)) return v;
      } catch {}
    }
    return null;
  }

  async function ensureBoard() {
    if(board?.schedule) return board;
    board=readCache();
    if(board?.schedule) return board;
    if(loading) return loading;
    loading=(async()=>{
      try {
        const r=await fetch(`${API}/api/dashboard-data?strict_guard=${Date.now()}`,{cache:'no-store'});
        const p=await r.json();
        if(r.ok && Array.isArray(p?.schedule)) board=p;
      } catch {}
      return board || {schedule:[]};
    })().finally(()=>{loading=null;});
    return loading;
  }

  function selectedDate() {
    return document.querySelector('.dateBtn.active')?.dataset?.date || '';
  }

  function candidateRows(date) {
    return (board?.schedule||[]).filter(r=>{
      const tier=String(r?.tier||'').toUpperCase();
      return (!date || r?.slateDate===date) && (tier==='FOCUS'||tier==='WATCHLIST');
    });
  }

  function strictMatch(home,away,date) {
    let best=null, bestTotal=-1;
    for(const row of candidateRows(date)) {
      const m=splitMatch(row.match||'');
      const hs=teamScore(home,m.home), as=teamScore(away,m.away);
      // Both sides must independently be strong matches. Generic tokens such as
      // "United" can no longer qualify a fixture on their own.
      if(hs<82 || as<82) continue;
      const total=hs+as;
      if(total>bestTotal){bestTotal=total;best=row;}
    }
    return best;
  }

  function rowTeams(row) {
    const lines=[...row.querySelectorAll('.teamLine')];
    const read=line=>line?.querySelector('span')?.textContent?.trim()||'';
    return {home:read(lines[0]),away:read(lines[1])};
  }

  function applyRow(row,date) {
    const {home,away}=rowTeams(row);
    if(!home||!away) return true;
    const match=strictMatch(home,away,date);
    if(!match) {
      row.remove();
      return false;
    }

    const competition=String(match.competition||'').trim();
    if(competition) {
      const teams=row.querySelector('.teams');
      let label=teams?.querySelector('.matchCompetition');
      if(teams && !label){label=document.createElement('div');label.className='matchCompetition';teams.appendChild(label);}
      if(label) label.textContent=competition;
    }

    const meta=row.querySelector('.matchMeta');
    if(meta) {
      const tier=String(match.tier||'').toUpperCase();
      meta.innerHTML=`<span class="tag ${tier==='FOCUS'?'live':''}">${escapeHtml(match.grade||'—')} · ${escapeHtml(tier)}</span>`;
    }
    row.dataset.strictBoard='1';
    return true;
  }

  function escapeHtml(v='') {
    return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function refreshCounts() {
    document.querySelectorAll('.statusTab').forEach(tab=>{
      const status=tab.dataset.statusTab;
      const count=document.querySelectorAll(`.matchRow[data-match-status="${status}"]`).length;
      const badge=tab.querySelector('b'); if(badge) badge.textContent=String(count);
    });
    document.querySelectorAll('.kpi').forEach(k=>{
      const label=k.querySelector('span')?.textContent?.trim().toLowerCase();
      if(label==='matches') {
        const strong=k.querySelector('strong'); if(strong) strong.textContent=String(document.querySelectorAll('.matchRow[data-strict-board="1"]').length);
      }
    });
  }

  async function run() {
    if(busy) return; busy=true;
    try {
      await ensureBoard();
      const date=selectedDate();
      document.querySelectorAll('.matchRow').forEach(row=>applyRow(row,date));
      refreshCounts();
    } finally {busy=false;}
  }

  function schedule() {
    if(queued) return; queued=true;
    requestAnimationFrame(()=>{queued=false;run();});
  }

  const root=document.getElementById('app');
  new MutationObserver(schedule).observe(root,{childList:true,subtree:true});
  window.addEventListener('hashchange',schedule);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')schedule();});
  schedule();
})();