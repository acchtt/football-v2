(() => {
  'use strict';

  const API = window.SLIPTRACE_API || 'https://football-v2.acchtt.workers.dev';
  const CACHE_KEYS = ['sliptrace.dashboard.compat.v2','sliptrace.dashboard.compat.v1','sliptrace.dashboard.v4'];
  const STOP = new Set(['fc','cf','sc','ac','afc','club','united','city','town','athletic','sporting','football','calcio']);
  const BOARD_TTL = 12_000;
  let board = null;
  let boardAt = 0;
  let loading = null;
  let queued = false;
  let busy = false;

  function norm(v='') {
    return String(v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
      .replace(/\butd\b/g,'united').replace(/\bst\.?\b/g,'saint').replace(/\bdep\.?\b/g,'deportivo')
      .replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  }
  function tokens(v){return norm(v).split(' ').filter(Boolean);}
  function meaningful(v){return tokens(v).filter(x=>!STOP.has(x));}
  function acronym(v){const t=tokens(v).filter(x=>!['fc','cf','sc','ac','afc','club'].includes(x));return t.length>=2?t.map(x=>x[0]).join(''):'';}
  function tokenClose(a,b){return a===b||(a.length>=4&&b.length>=4&&(a.startsWith(b)||b.startsWith(a)));}

  function teamScore(a,b) {
    const x=norm(a),y=norm(b); if(!x||!y)return 0; if(x===y)return 100;
    const ax=meaningful(a),by=meaningful(b),sx=ax.join(' '),sy=by.join(' ');
    if(sx&&sy&&sx===sy)return 97;
    if(sx.length>=4&&sy.length>=4&&(sx.includes(sy)||sy.includes(sx)))return 93;
    const aa=acronym(a),bb=acronym(b),xc=x.replace(/\s/g,''),yc=y.replace(/\s/g,'');
    if(aa.length>=2&&(aa===yc||bb===xc))return 91;
    if(x.length>=3&&tokens(b).includes(x))return 90;
    if(y.length>=3&&tokens(a).includes(y))return 90;
    if(!ax.length||!by.length)return 0;
    let matched=0;const used=new Set();
    for(const ta of ax){const i=by.findIndex((tb,idx)=>!used.has(idx)&&tokenClose(ta,tb));if(i>=0){matched++;used.add(i);}}
    const ratio=matched/Math.max(ax.length,by.length,1);
    if(matched>=2&&ratio>=.5)return 88;
    if(matched>=1&&ratio>=.75)return 86;
    if(matched===1&&ax.length<=2&&by.length<=2&&Math.max(ax[0]?.length||0,by[0]?.length||0)>=5)return 78;
    return 0;
  }

  function splitMatch(match='') {
    for(const re of [/\s+vs\.?\s+/i,/\s+v\.?\s+/i,/\s+—\s+/,/\s+–\s+/,/\s+-\s+/]) {
      const p=String(match).split(re).map(x=>x.trim()).filter(Boolean);
      if(p.length===2)return{home:p[0],away:p[1]};
    }
    return{home:String(match),away:''};
  }

  function readCache(){for(const key of CACHE_KEYS){try{const v=JSON.parse(localStorage.getItem(key)||'null');if(v&&Array.isArray(v.schedule))return v;}catch{}}return null;}

  async function ensureBoard(force=false) {
    if(!force&&board?.schedule&&Date.now()-boardAt<BOARD_TTL)return board;
    if(loading)return loading;
    loading=(async()=>{
      try{
        const r=await fetch(`${API}/api/dashboard-data?strict_guard=${Date.now()}`,{cache:'no-store'});
        const p=await r.json();
        if(r.ok&&Array.isArray(p?.schedule)){board=p;boardAt=Date.now();return board;}
      }catch{}
      if(!board?.schedule)board=readCache();
      if(board?.schedule&&!boardAt)boardAt=Date.now()-BOARD_TTL;
      return board||{schedule:[]};
    })().finally(()=>{loading=null;});
    return loading;
  }

  function selectedDate(){return document.querySelector('.dateBtn.active')?.dataset?.date||'';}
  function candidateRows(date){return(board?.schedule||[]).filter(r=>{const tier=String(r?.tier||'').toUpperCase();return(!date||r?.slateDate===date)&&(tier==='FOCUS'||tier==='WATCHLIST');});}

  function strictMatch(home,away,date) {
    let best=null,bestTotal=-1;
    for(const row of candidateRows(date)) {
      const m=splitMatch(row.match||''),hs=teamScore(home,m.home),as=teamScore(away,m.away);
      if(hs<78||as<78||(hs+as)<164)continue;
      const total=hs+as;if(total>bestTotal){bestTotal=total;best=row;}
    }
    return best;
  }

  function rowTeams(row){const lines=[...row.querySelectorAll('.teamLine')];const read=line=>line?.querySelector('span')?.textContent?.trim()||'';return{home:read(lines[0]),away:read(lines[1])};}

  function applyRow(row,date) {
    const{home,away}=rowTeams(row);if(!home||!away)return true;
    const match=strictMatch(home,away,date);
    if(!match){row.remove();return false;}
    const competition=String(match.competition||'').trim();
    if(competition){const teams=row.querySelector('.teams');let label=teams?.querySelector('.matchCompetition');if(teams&&!label){label=document.createElement('div');label.className='matchCompetition';teams.appendChild(label);}if(label)label.textContent=competition;}
    const meta=row.querySelector('.matchMeta');if(meta){const tier=String(match.tier||'').toUpperCase();meta.innerHTML=`<span class="tag ${tier==='FOCUS'?'live':''}">${escapeHtml(match.grade||'—')} · ${escapeHtml(tier)}</span>`;}
    row.dataset.strictBoard='1';return true;
  }

  function escapeHtml(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function refreshCounts(){document.querySelectorAll('.statusTab').forEach(tab=>{const status=tab.dataset.statusTab;const count=document.querySelectorAll(`.matchRow[data-match-status="${status}"]`).length;const badge=tab.querySelector('b');if(badge)badge.textContent=String(count);});document.querySelectorAll('.kpi').forEach(k=>{const label=k.querySelector('span')?.textContent?.trim().toLowerCase();if(label==='matches'){const strong=k.querySelector('strong');if(strong)strong.textContent=String(document.querySelectorAll('.matchRow[data-strict-board="1"]').length);}});}

  async function run(force=false){if(busy)return;busy=true;try{await ensureBoard(force);const date=selectedDate();document.querySelectorAll('.matchRow').forEach(row=>applyRow(row,date));refreshCounts();}finally{busy=false;}}
  function schedule(force=false){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;run(force);});}

  const root=document.getElementById('app');
  new MutationObserver(()=>schedule(false)).observe(root,{childList:true,subtree:true});
  window.addEventListener('hashchange',()=>schedule(true));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')schedule(true);});
  setInterval(()=>{if(document.visibilityState==='visible')schedule(true);},15_000);
  schedule(true);
})();