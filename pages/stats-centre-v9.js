// SlipTrace Live Centre v9 — resilient BSD stats/momentum/shotmap mode.
// WebSocket transport is intentionally handled by realtime-v10.js.
(() => {
  'use strict';

  const API = window.SLIPTRACE_API || 'https://football-v2.acchtt.workers.dev';
  const matchApp = document.getElementById('matchApp');
  if (!matchApp) return;

  const state = { eventId: null, payload: null, at: 0, error: '', timer: null, renderTimer: null };
  const metricSpecs = [
    ['Possession', ['possession','ball_possession','possession_percent'], '%'],
    ['Shots', ['shots_total','total_shots','shots','shot_total'], ''],
    ['On target', ['shots_on_target','shots_ontarget','shots_on_goal','on_target'], ''],
    ['Corners', ['corners','corner_kicks','corner'], ''],
    ['xG', ['xg','expected_goals','expected_goal'], ''],
    ['Dangerous', ['dangerous_attacks','dangerous_attack'], ''],
    ['Big chances', ['big_chances','big_chances_created'], ''],
    ['Saves', ['saves','goalkeeper_saves'], ''],
  ];

  function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function isRecord(v){return Boolean(v&&typeof v==='object'&&!Array.isArray(v));}
  function routeActive(){return /^#match\//.test(location.hash);}
  function domEventId(){const t=matchApp.querySelector('.matchTopline > span')?.textContent||'';const m=t.match(/BSD EVENT\s+([A-Za-z0-9_-]+)/i);return m?m[1]:null;}
  function teamNames(){const t=[...matchApp.querySelectorAll('.matchHeroTeam strong')].map(n=>n.textContent.trim());return{home:t[0]||'HOME',away:t[1]||'AWAY'};}
  function key(v){return String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');}
  function num(v){if(typeof v==='number'&&Number.isFinite(v))return v;if(typeof v==='string'){const n=Number(v.replace(/%/g,'').trim());return Number.isFinite(n)?n:null;}if(isRecord(v)){for(const k of ['value','total','count','stat']){const n=num(v[k]);if(n!==null)return n;}}return null;}

  function readMetric(obj,aliases){
    if(Array.isArray(obj)){
      for(const item of obj){if(!isRecord(item))continue;const n=key(item.name??item.label??item.type??item.key);if(aliases.some(a=>key(a)===n)){const v=num(item.value??item.stat??item.total??item.count);if(v!==null)return v;}}
      return null;
    }
    if(!isRecord(obj))return null;
    const map=new Map(Object.entries(obj).map(([k,v])=>[key(k),v]));
    for(const a of aliases){const v=num(map.get(key(a)));if(v!==null)return v;}
    return null;
  }

  function metricHits(obj){return metricSpecs.reduce((s,[,a])=>s+(readMetric(obj,a)!==null?1:0),0);}
  function findStatsPair(root,depth=0,seen=new Set()){
    if(!root||depth>5||seen.has(root))return null;if(typeof root==='object')seen.add(root);
    if(isRecord(root)){
      const home=root.home??root.home_stats??root.homeStats, away=root.away??root.away_stats??root.awayStats;
      if((isRecord(home)||Array.isArray(home))&&(isRecord(away)||Array.isArray(away))&&metricHits(home)+metricHits(away)>=2)return{home,away};
      for(const k of ['stats','statistics','match_stats','matchStats','data','result','results']){if(root[k]){const f=findStatsPair(root[k],depth+1,seen);if(f)return f;}}
      for(const v of Object.values(root)){if(v&&typeof v==='object'){const f=findStatsPair(v,depth+1,seen);if(f)return f;}}
    } else if(Array.isArray(root)){for(const v of root){const f=findStatsPair(v,depth+1,seen);if(f)return f;}}
    return null;
  }

  function findNamed(root,names,depth=0,seen=new Set()){
    if(!root||depth>5||seen.has(root))return null;if(typeof root==='object')seen.add(root);
    if(isRecord(root)){
      for(const [k,v] of Object.entries(root))if(names.includes(key(k)))return v;
      for(const v of Object.values(root)){if(v&&typeof v==='object'){const f=findNamed(v,names,depth+1,seen);if(f!==null)return f;}}
    } else if(Array.isArray(root)){for(const v of root){const f=findNamed(v,names,depth+1,seen);if(f!==null)return f;}}
    return null;
  }

  function statsRoot(){return state.payload?.stats??state.payload;}
  function statsPair(){return findStatsPair(statsRoot());}
  function format(v,suffix){if(v===null)return'—';if(suffix==='%')return`${Math.round(v)}%`;if(Math.abs(v)<10&&!Number.isInteger(v))return v.toFixed(2);return String(Math.round(v*100)/100);}

  function momentum(){
    const raw=findNamed(statsRoot(),['momentum','match_momentum','momentum_data']);if(!Array.isArray(raw))return[];const out=[];
    for(const item of raw.slice(-30)){
      if(typeof item==='number'){out.push(Math.max(-100,Math.min(100,item)));continue;}
      if(!isRecord(item))continue;
      const h=num(item.home??item.home_value??item.homeValue),a=num(item.away??item.away_value??item.awayValue),v=num(item.value??item.momentum??item.pressure),side=String(item.side??item.team??'').toLowerCase();
      if(h!==null||a!==null)out.push(Math.max(-100,Math.min(100,(h||0)-(a||0))));else if(v!==null)out.push(Math.max(-100,Math.min(100,side==='away'?-Math.abs(v):side==='home'?Math.abs(v):v)));
    }
    return out;
  }

  function shots(){
    const raw=findNamed(statsRoot(),['shotmap','shot_map','shots_map','shots']);if(!Array.isArray(raw))return[];
    return raw.filter(isRecord).map(s=>({
      x:num(s.x??s.coordinate_x??s.position_x),y:num(s.y??s.coordinate_y??s.position_y),
      side:String(s.side??s.team_side??s.team??'').toLowerCase(),minute:num(s.minute??s.time),
      type:String(s.result??s.outcome??s.type??s.event??'shot'),player:String(s.player_name??s.player??''),
    })).filter(s=>s.x!==null&&s.y!==null).slice(-12);
  }

  function mount(){
    if(!routeActive()||!state.eventId)return null;
    let n=matchApp.querySelector('#bsdLiveCentre');if(n)return n;
    const grid=matchApp.querySelector('.matchGrid');if(!grid)return null;
    n=document.createElement('section');n.id='bsdLiveCentre';n.className='matchPanel liveCentrePanel';grid.insertAdjacentElement('afterend',n);return n;
  }

  function render(){
    const node=mount();if(!node)return;
    const teams=teamNames(),pair=statsPair(),mom=momentum(),shotRows=shots(),latest=shotRows[shotRows.length-1]||null;
    const metrics=metricSpecs.map(([name,aliases,suffix])=>{
      const h=pair?readMetric(pair.home,aliases):null,a=pair?readMetric(pair.away,aliases):null;if(h===null&&a===null)return'';
      const total=Math.max(1,Math.abs(h||0)+Math.abs(a||0));const hp=Math.max(3,Math.min(97,Math.abs(h||0)/total*100));
      return `<div class="lcStat"><strong>${esc(format(h,suffix))}</strong><div><span>${esc(name)}</span><i style="--home:${hp}%"></i></div><strong>${esc(format(a,suffix))}</strong></div>`;
    }).filter(Boolean).join('');
    const age=state.at?Math.max(0,Math.floor((Date.now()-state.at)/1000)):null;
    const shotText=latest?`${latest.minute!==null?`${latest.minute}′ · `:''}${latest.player?`${latest.player} · `:''}${latest.type.replace(/_/g,' ')}`:'No recent shot coordinates from BSD.';
    node.innerHTML=`<header><span>LIVE CENTRE</span><div class="lcCoverage"><b class="stats">STATS</b><small>BSD REST · resilient mode</small></div></header>
      <div class="lcBody">
        <div class="lcPitchColumn">
          <div class="lcPitch" aria-label="BSD shot position"><span class="lcTeamLabel home">${esc(teams.home)}</span><span class="lcTeamLabel away">${esc(teams.away)}</span><i class="lcHalf"></i><i class="lcCircle"></i><i class="lcBox left"></i><i class="lcBox right"></i>${latest?`<span class="lcBall active" style="left:${Math.max(1,Math.min(99,latest.side==='away'?100-latest.x:latest.x))}%;top:${Math.max(2,Math.min(98,latest.y))}%"></span>`:'<span class="lcBall" style="left:50%;top:50%"></span>'}</div>
          <div class="lcSituation"><span>${latest?'LATEST SHOT':'STATS MODE'}</span><p>${esc(state.error||shotText)}</p></div>
          <div class="lcActivity">${shotRows.length?shotRows.slice(-5).reverse().map(s=>`<div><span class="${esc(s.side)}">${s.minute!==null?`${esc(s.minute)}′`:'•'}</span><p>${esc(`${s.player?`${s.player} · `:''}${s.type.replace(/_/g,' ')}`)}</p></div>`).join(''):'<div class="empty"><p>Shotmap events will appear when BSD supplies them.</p></div>'}</div>
        </div>
        <div class="lcStatsColumn">
          <div class="lcStatsHead"><span>${esc(teams.home)}</span><b>LIVE STATS</b><span>${esc(teams.away)}</span></div>
          <div class="lcStats">${metrics||`<div class="lcStatsEmpty">${esc(state.error||'Waiting for BSD match statistics…')}</div>`}</div>
          <div class="lcMomentum"><header><span>MOMENTUM</span><small>${mom.length?'latest pressure':'awaiting data'}</small></header><div>${mom.length?mom.map(v=>`<i class="${v>=0?'home':'away'}" style="--m:${Math.max(8,Math.min(100,Math.abs(v)))}%"></i>`).join(''):Array.from({length:18},()=>'<i class="idle"></i>').join('')}</div></div>
          <div class="lcFreshness"><span>STATS ${age===null?'—':`${age}s`}</span><span>EVENT ${esc(String(state.eventId))}</span></div>
        </div>
      </div>`;
    window.dispatchEvent(new CustomEvent('sliptrace:live-centre-rendered'));
  }

  async function fetchStats(){
    if(!state.eventId||!routeActive()||document.visibilityState==='hidden')return;const id=state.eventId;
    try{
      const res=await fetch(`${API}/api/match-stats?event_id=${encodeURIComponent(id)}&t=${Date.now()}`,{cache:'no-store'});const payload=await res.json().catch(()=>null);
      if(id!==state.eventId)return;if(!res.ok||!payload?.ok)throw new Error(payload?.error||`HTTP ${res.status}`);
      state.payload=payload;state.at=Date.now();state.error='';render();
    }catch(e){if(id!==state.eventId)return;state.error=e?.message||'BSD stats unavailable';render();}
  }

  function stop(){clearInterval(state.timer);state.timer=null;state.eventId=null;state.payload=null;state.error='';matchApp.querySelector('#bsdLiveCentre')?.remove();}
  function start(id){if(!id)return;if(state.eventId===id){render();return;}clearInterval(state.timer);state.eventId=id;state.payload=null;state.at=0;state.error='';fetchStats();state.timer=setInterval(fetchStats,6000);render();}
  function sync(){if(!routeActive()){stop();return;}const id=domEventId();if(id)start(id);}

  const observer=new MutationObserver(()=>{clearTimeout(observer._t);observer._t=setTimeout(sync,20);});
  observer.observe(matchApp,{childList:true,subtree:true});
  window.addEventListener('hashchange',()=>setTimeout(sync,0));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){sync();if(state.eventId)fetchStats();}});
  setInterval(()=>{if(routeActive()&&state.eventId)render();},1000);
  sync();
})();
