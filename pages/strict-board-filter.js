(() => {
  'use strict';

  const API = window.SLIPTRACE_API || 'https://football-v2.acchtt.workers.dev';
  const previousFetch = window.fetch.bind(window);
  const STOP = new Set(['fc','cf','sc','ac','afc','club','united','city','town','athletic','sporting','football','calcio']);
  const CACHE_KEYS = ['sliptrace.dashboard.compat.v2','sliptrace.dashboard.compat.v1','sliptrace.dashboard.v4'];
  let board = null;
  let boardPromise = null;

  const norm=v=>String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  const tokens=v=>norm(v).split(' ').filter(Boolean);
  const meaningful=v=>{const t=tokens(v).filter(x=>!STOP.has(x));return t.length?t:tokens(v);};
  const acronym=v=>{const t=meaningful(v);return t.length>=2?t.map(x=>x[0]).join(''):'';};

  function score(a,b){
    const x=norm(a),y=norm(b); if(!x||!y)return 0; if(x===y)return 100;
    const ax=meaningful(a),by=meaningful(b),sx=ax.join(' '),sy=by.join(' ');
    if(sx&&sy&&sx===sy)return 96;
    if(sx.length>=4&&sy.length>=4&&(sx.includes(sy)||sy.includes(sx)))return 91;
    const aa=acronym(a),bb=acronym(b);
    if(aa.length>=3&&(aa===y.replace(/\s/g,'')||bb===x.replace(/\s/g,'')))return 88;
    const A=new Set(ax),B=new Set(by);let o=0;A.forEach(t=>B.has(t)&&o++);
    const r=o/Math.max(A.size,B.size,1);
    if(o>=1&&r>=.75)return 86;if(o>=2&&r>=.5)return 82;return 0;
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
  async function getBoard(){
    if(board?.schedule)return board;board=readCache();if(board?.schedule)return board;if(boardPromise)return boardPromise;
    boardPromise=(async()=>{try{const r=await previousFetch(`${API}/api/dashboard-data?strict=${Date.now()}`,{cache:'no-store'});const p=await r.json();if(r.ok&&Array.isArray(p?.schedule))board=p;}catch{}return board||{schedule:[]};})().finally(()=>{boardPromise=null;});
    return boardPromise;
  }

  function matchEvent(event,rows){
    const home=teamName(event,'home'),away=teamName(event,'away');
    return rows.some(row=>{const m=splitMatch(row.match||'');return score(home,m.home)>=82&&score(away,m.away)>=82;});
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
      const out={...payload,data:{...data,results:filtered,events:filtered,count:filtered.length,next:null,previous:null},strictBoardOnly:true};
      const headers=new Headers(response.headers);headers.set('Content-Type','application/json; charset=utf-8');headers.set('Cache-Control','no-store');
      return new Response(JSON.stringify(out),{status:response.status,statusText:response.statusText,headers});
    }catch{return response;}
  };
})();