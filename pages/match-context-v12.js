// SlipTrace Match Context v12 — separates BSD REST and live-feed identifiers.
(() => {
  'use strict';

  const API = window.SLIPTRACE_API || 'https://football-v2.acchtt.workers.dev';
  const CACHE_KEY = 'sliptrace.dashboard.v4';
  const matchApp = document.getElementById('matchApp');
  if (!matchApp) return;

  const state = window.SLIPTRACE_MATCH_CONTEXT = window.SLIPTRACE_MATCH_CONTEXT || {
    key: '', restId: null, liveId: null, asset: null, liveEvent: null, detail: null,
  };
  let resolving = false;
  let lastResolveKey = '';

  function norm(v='') {
    return String(v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
      .replace(/\b(fc|cf|afc|sc|ac|sk|fk|club)\b/g,' ')
      .replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  }
  function splitMatch(match='') {
    for (const re of [/\s+vs\.?\s+/i,/\s+v\.?\s+/i,/\s+—\s+/,/\s+–\s+/,/\s+-\s+/]) {
      const p=String(match).split(re).map(x=>x.trim()).filter(Boolean);
      if (p.length===2) return {home:p[0],away:p[1]};
    }
    return {home:String(match),away:''};
  }
  function nameScore(a,b) {
    const x=norm(a),y=norm(b); if(!x||!y)return 0;
    if(x===y)return 6; if(x.includes(y)||y.includes(x))return 4;
    const aa=new Set(x.split(' ')),bb=new Set(y.split(' ')); let shared=0;
    aa.forEach(t=>bb.has(t)&&shared++);
    const overlap=shared/Math.max(aa.size,bb.size);
    return overlap>=.75?4:overlap>=.5?3:0;
  }
  function rowKey(row){return `${row?.match||''}|${row?.kickoff||row?.displayKickoff||row?.id||row?.pickId||''}`;}
  function routeKey(){
    const m=location.hash.match(/^#match\/(.+)$/); if(!m)return'';
    try{return decodeURIComponent(m[1]);}catch{return'';}
  }
  function dashboard(){
    const b=window.SLIPTRACE_DATA_BUS?.dashboard;
    if(b?.ok&&Array.isArray(b.schedule))return b;
    try{const c=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');if(c?.payload&&Array.isArray(c.payload.schedule))return{ok:true,...c.payload};}catch{}
    return null;
  }
  function currentRow(){
    const d=dashboard(), key=routeKey();
    return d?.schedule?.find(r=>rowKey(r)===key)||null;
  }
  function liveEvents(){return Array.isArray(window.SLIPTRACE_DATA_BUS?.live?.events)?window.SLIPTRACE_DATA_BUS.live.events:[];}
  function matchLive(row){
    const t=splitMatch(row?.match||'');
    return liveEvents().map(e=>({e,s:nameScore(t.home,e.home)+nameScore(t.away,e.away)}))
      .filter(x=>x.s>=6).sort((a,b)=>b.s-a.s)[0]?.e||null;
  }
  function applyContext(){
    const top=matchApp.querySelector('.matchTopline');
    const span=top?.querySelector(':scope > span');
    if(!top||!span)return;
    if(state.restId) top.dataset.restId=String(state.restId); else delete top.dataset.restId;
    if(state.liveId) top.dataset.liveId=String(state.liveId); else delete top.dataset.liveId;
    const shown=state.restId||state.liveId||'—';
    span.textContent=`BSD EVENT ${shown}`;
    span.title=state.restId&&state.liveId&&String(state.restId)!==String(state.liveId)
      ? `REST ${state.restId} · LIVE ${state.liveId}` : '';
    window.dispatchEvent(new CustomEvent('sliptrace:match-context',{detail:{...state}}));
  }
  async function resolve(){
    if(!/^#match\//.test(location.hash)||resolving)return;
    const row=currentRow(); if(!row)return;
    const key=rowKey(row), live=matchLive(row);
    state.key=key; state.liveEvent=live;
    state.liveId=live?.liveId||live?.id||live?.eventId||state.liveId||null;
    state.restId=live?.restId||state.restId||null;
    applyContext();

    if(lastResolveKey===key&&state.restId)return;
    resolving=true; lastResolveKey=key;
    try{
      const day=row.slateDate||String(row.kickoff||row.displayKickoff||'').slice(0,10);
      if(!day)return;
      const res=await fetch(`${API}/api/fixture-assets?date_from=${encodeURIComponent(day)}&date_to=${encodeURIComponent(day)}&t=${Date.now()}`,{cache:'no-store'});
      const payload=await res.json().catch(()=>null);
      if(!res.ok||!payload?.ok||!Array.isArray(payload.events))return;
      const teams=splitMatch(row.match||'');
      const best=payload.events.map(event=>({event,score:nameScore(teams.home,event.home)+nameScore(teams.away,event.away)}))
        .filter(x=>x.score>=6).sort((a,b)=>b.score-a.score)[0]?.event;
      if(!best)return;
      state.asset=best;
      state.restId=best.restId??best.id??state.restId??null;
      state.liveId=best.liveId??state.liveId??null;
      applyContext();
    }catch{}
    finally{resolving=false;}
  }

  // Capture the canonical BSD event detail already returned alongside match stats.
  const previousFetch=window.fetch.bind(window);
  window.fetch=async function sliptraceMatchContextFetch(input,init){
    const response=await previousFetch(input,init);
    const url=typeof input==='string'?input:(input?.url||'');
    if(response.ok&&url.includes('/api/match-stats')){
      response.clone().json().then(payload=>{
        if(!payload?.ok)return;
        state.detail=payload.event||null;
        window.dispatchEvent(new CustomEvent('sliptrace:match-detail',{detail:payload}));
      }).catch(()=>{});
    }
    return response;
  };

  const observer=new MutationObserver(()=>{clearTimeout(observer._t);observer._t=setTimeout(resolve,30);});
  observer.observe(matchApp,{childList:true,subtree:true,characterData:true});
  window.addEventListener('hashchange',()=>{lastResolveKey='';state.restId=null;state.liveId=null;state.asset=null;state.detail=null;setTimeout(resolve,0);});
  window.addEventListener('sliptrace:live',resolve);
  window.addEventListener('sliptrace:dashboard',resolve);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')resolve();});
  resolve();
})();
