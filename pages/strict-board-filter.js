(() => {
  'use strict';

  const API = window.SLIPTRACE_API || 'https://football-v2.acchtt.workers.dev';
  const previousFetch = window.fetch.bind(window);
  const STOP = new Set(['fc','cf','sc','ac','afc','club','united','city','town','athletic','sporting','football','calcio']);
  const CACHE_KEYS = ['sliptrace.dashboard.compat.v2','sliptrace.dashboard.compat.v1','sliptrace.dashboard.v4'];
  const BOARD_TTL = 12_000;
  let board = null;
  let boardAt = 0;
  let boardPromise = null;

  const clean=v=>String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/\butd\b/g,'united').replace(/\bst\.?\b/g,'saint').replace(/\bdep\.?\b/g,'deportivo')
    .replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  const tokens=v=>clean(v).split(' ').filter(Boolean);
  const meaningful=v=>tokens(v).filter(x=>!STOP.has(x));
  const acronym=v=>{const t=tokens(v).filter(x=>!['fc','cf','sc','ac','afc','club'].includes(x));return t.length>=2?t.map(x=>x[0]).join(''):'';};

  function tokenClose(a,b){
    if(a===b)return true;
    if(a.length>=4&&b.length>=4&&(a.startsWith(b)||b.startsWith(a)))return true;
    return false;
  }

  function score(a,b){
    const x=clean(a),y=clean(b); if(!x||!y)return 0; if(x===y)return 100;
    const ax=meaningful(a),by=meaningful(b);
    const sx=ax.join(' '),sy=by.join(' ');
    if(sx&&sy&&sx===sy)return 97;
    if(sx.length>=4&&sy.length>=4&&(sx.includes(sy)||sy.includes(sx)))return 93;

    const aa=acronym(a),bb=acronym(b),xc=x.replace(/\s/g,''),yc=y.replace(/\s/g,'');
    if(aa.length>=2&&(aa===yc||bb===xc))return 91;

    // One side may be a common short club name (PSV, Benfica, Inter, Arsenal).
    if(x.length>=3&&tokens(b).includes(x))return 90;
    if(y.length>=3&&tokens(a).includes(y))return 90;

    if(!ax.length||!by.length)return 0; // generic-only names such as "United" never qualify alone.
    let matched=0;
    const used=new Set();
    for(const ta of ax){
      const i=by.findIndex((tb,idx)=>!used.has(idx)&&tokenClose(ta,tb));
      if(i>=0){matched++;used.add(i);}
    }
    const ratio=matched/Math.max(ax.length,by.length,1);
    if(matched>=2&&ratio>=.5)return 88;
    if(matched>=1&&ratio>=.75)return 86;
    if(matched===1&&ax.length<=2&&by.length<=2&&Math.max(ax[0]?.length||0,by[0]?.length||0)>=5)return 78;
    return 0;
  }

  function splitMatch(match=''){
    for(const re of [/\s+vs\.?\s+/i,/\s+v\.?\s+/i,/\s+—\s+/,/\s+–\s+/,/\s+-\s+/]){const p=String(match).split(re).map(x=>x.trim()).filter(Boolean);if(p.length===2)return{home:p[0],away:p[1]};}
    return{home:String(match),away:''};
  }

  function teamName(event,side){
    const t=event?.[`${side}_team`]||event?.[side]||event?.teams?.[side]||{};
    return t?.name||t?.team_name||t?.display_name||event?.[`${side}_team_name`]||event?.[`${side}_name`]||(typeof t==='string'?t:'');
  }

  function readCache(){for(const k of CACHE_KEYS){try{const v=JSON.parse(localStorage.getItem(k)||'null');if(v&&Array.isArray(v.schedule))return v;}catch{}}return null;}
  async function getBoard(force=false){
    if(!force&&board?.schedule&&Date.now()-boardAt<BOARD_TTL)return board;
    if(boardPromise)return boardPromise;
    boardPromise=(async()=>{
      try{
        const r=await previousFetch(`${API}/api/dashboard-data?strict=${Date.now()}`,{cache:'no-store'});
        const p=await r.json();
        if(r.ok&&Array.isArray(p?.schedule)){board=p;boardAt=Date.now();return board;}
      }catch{}
      if(!board?.schedule)board=readCache();
      if(board?.schedule&&!boardAt)boardAt=Date.now()-BOARD_TTL;
      return board||{schedule:[]};
    })().finally(()=>{boardPromise=null;});
    return boardPromise;
  }

  function matchEvent(event,rows){
    const home=teamName(event,'home'),away=teamName(event,'away');
    return rows.some(row=>{
      const m=splitMatch(row.match||'');
      const hs=score(home,m.home),as=score(away,m.away);
      // Both sides must independently match. This keeps "United vs United" false positives out,
      // while allowing real aliases/short names down to a controlled 78 score.
      return hs>=78&&as>=78&&(hs+as)>=164;
    });
  }

  window.fetch=async function strictBoardFetch(input,init){
    const response=await previousFetch(input,init);
    let url;try{url=new URL(typeof input==='string'?input:input.url,location.href);}catch{return response;}
    if(url.origin!==API||url.pathname!=='/api/bsd/events'||!response.ok)return response;
    const from=url.searchParams.get('date_from'),to=url.searchParams.get('date_to');
    if(!from||from!==to)return response;

    try{
      const payload=await response.clone().json();
      const data=payload?.data;
      const source=Array.isArray(data?.results)?data.results:Array.isArray(data?.events)?data.events:null;
      if(!source)return response;
      const dashboard=await getBoard();
      const rows=(dashboard.schedule||[]).filter(r=>{
        const tier=String(r?.tier||'').toUpperCase();
        return r?.slateDate===from&&(tier==='FOCUS'||tier==='WATCHLIST');
      });
      const filtered=source.filter(event=>matchEvent(event,rows));
      const out={...payload,data:{...data,results:filtered,events:filtered,count:filtered.length,next:null,previous:null},strictBoardOnly:true,boardRows:rows.length};
      const headers=new Headers(response.headers);headers.set('Content-Type','application/json; charset=utf-8');headers.set('Cache-Control','no-store');
      return new Response(JSON.stringify(out),{status:response.status,statusText:response.statusText,headers});
    }catch{return response;}
  };
})();