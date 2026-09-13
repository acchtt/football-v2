// SlipTrace Match Desk v9 — BSD lineups panel.
(() => {
  'use strict';
  const API=window.SLIPTRACE_API||'https://football-v2.acchtt.workers.dev';
  const matchApp=document.getElementById('matchApp');
  if(!matchApp) return;
  const state={eventId:null,payload:null,error:'',at:0,timer:null,busy:false};

  function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function isObj(v){return Boolean(v&&typeof v==='object'&&!Array.isArray(v));}
  function active(){return /^#match\//.test(location.hash);}
  function eventId(){const t=matchApp.querySelector('.matchTopline>span')?.textContent||'';const m=t.match(/BSD EVENT\s+(\d+)/i);return m?Number(m[1]):null;}
  function teams(){const a=[...matchApp.querySelectorAll('.matchHeroTeam strong')].map(n=>n.textContent.trim());return{home:a[0]||'Home',away:a[1]||'Away'};}
  function key(v){return String(v||'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');}
  function first(obj,names){if(!isObj(obj))return undefined;for(const n of names){if(obj[n]!==undefined)return obj[n];const hit=Object.entries(obj).find(([k])=>key(k)===key(n));if(hit)return hit[1];}return undefined;}
  function sideObject(root,side){
    if(!root)return null;
    const direct=first(root,[side,`${side}_team`,`${side}_lineup`,`${side}Lineup`]); if(isObj(direct))return direct;
    for(const bucket of ['lineups','teams','data','result','results']){const b=root?.[bucket];const d=first(b,[side,`${side}_team`,`${side}_lineup`]);if(isObj(d))return d;}
    const arrays=[];const walk=(v,d=0)=>{if(d>4||!v)return;if(Array.isArray(v))arrays.push(v);else if(isObj(v))Object.values(v).forEach(x=>x&&typeof x==='object'&&walk(x,d+1));};walk(root);
    for(const arr of arrays){for(const item of arr){if(!isObj(item))continue;const s=String(item.side??item.team_side??item.location??item.type??'').toLowerCase();if(s===side)return item;}}
    return null;
  }
  function playerName(v){if(typeof v==='string')return v;if(!isObj(v))return'';const p=isObj(v.player)?v.player:v;return String(p.name??p.full_name??p.short_name??p.player_name??v.player_name??'').trim();}
  function playerId(v){if(!isObj(v))return null;const p=isObj(v.player)?v.player:v;const id=Number(p.id??p.player_id??v.player_id);return Number.isFinite(id)?id:null;}
  function playerNum(v){if(!isObj(v))return'';const p=isObj(v.player)?v.player:v;return String(v.shirt_number??v.jersey_number??v.number??p.shirt_number??p.number??'').trim();}
  function playerPos(v){if(!isObj(v))return'';const p=isObj(v.player)?v.player:v;const raw=v.position??v.pos??p.position??p.position_short??'';return isObj(raw)?String(raw.name??raw.short_name??''):String(raw||'');}
  function isStarter(v){if(!isObj(v))return null;for(const k of ['starter','is_starter','starting','is_starting'])if(v[k]!==undefined)return Boolean(v[k]);const role=String(v.role??v.type??'').toLowerCase();if(role.includes('start'))return true;if(role.includes('sub')||role.includes('bench'))return false;return null;}
  function arraysFrom(side,root,which){
    const starterKeys=['starting_xi','startingXI','starters','starting','lineup','players'];
    const benchKeys=['substitutes','subs','bench','substitute_players'];
    const keys=which==='start'?starterKeys:benchKeys;
    let arr=first(side,keys); if(!Array.isArray(arr)) arr=first(root,keys.map(k=>`${side===sideObject(root,'home')?'home':'away'}_${k}`));
    if(!Array.isArray(arr)&&which==='start'){const all=first(side,['players']);if(Array.isArray(all)&&all.some(x=>isStarter(x)!==null))arr=all.filter(x=>isStarter(x)!==false);}
    if(!Array.isArray(arr)&&which==='bench'){const all=first(side,['players']);if(Array.isArray(all)&&all.some(x=>isStarter(x)!==null))arr=all.filter(x=>isStarter(x)===false);}
    return Array.isArray(arr)?arr.filter(x=>playerName(x)):[];
  }
  function formation(side,root,which){return String(first(side,['formation','formation_name','shape'])??first(root,[`${which}_formation`,`${which}Formation`])??'').trim();}
  function status(root,home,away){
    const vals=[root,home,away].filter(Boolean);
    for(const o of vals){if(first(o,['confirmed','is_confirmed','lineup_confirmed'])===true)return{label:'CONFIRMED',cls:'confirmed'};}
    for(const o of vals){if(first(o,['predicted','is_predicted','ai_predicted'])===true)return{label:'PREDICTED',cls:'predicted'};const s=String(first(o,['source','lineup_type','type'])||'').toLowerCase();if(s.includes('pred'))return{label:'PREDICTED',cls:'predicted'};if(s.includes('confirm')||s.includes('official'))return{label:'CONFIRMED',cls:'confirmed'};}
    return{label:'LINEUP',cls:'neutral'};
  }
  function playerRow(p){const name=playerName(p),num=playerNum(p),pos=playerPos(p),id=playerId(p);return `<div class="xiPlayer">${num?`<b>${esc(num)}</b>`:'<b>·</b>'}<span>${esc(name)}${pos?`<small>${esc(pos)}</small>`:''}</span>${id?`<i data-player-id="${id}"></i>`:''}</div>`;}
  function teamBlock(name,side,root,which){const starters=arraysFrom(side,root,'start').slice(0,11),bench=arraysFrom(side,root,'bench').slice(0,14),form=formation(side,root,which);return `<div class="xiTeam"><header><div><strong>${esc(name)}</strong><span>${esc(form||'Formation —')}</span></div><b>${starters.length||'—'} XI</b></header><div class="xiStarters">${starters.length?starters.map(playerRow).join(''):'<p>Starting XI not available yet.</p>'}</div>${bench.length?`<details class="xiBench"><summary>Substitutes <b>${bench.length}</b></summary><div>${bench.map(playerRow).join('')}</div></details>`:''}</div>`;}
  function mount(){let n=matchApp.querySelector('#bsdLineups');if(n)return n;const anchor=matchApp.querySelector('#bsdLiveCentre')||matchApp.querySelector('.matchGrid');if(!anchor)return null;n=document.createElement('section');n.id='bsdLineups';n.className='matchPanel lineupsPanel';anchor.insertAdjacentElement('afterend',n);return n;}
  function render(){if(!active()||!state.eventId)return;const node=mount();if(!node)return;const t=teams();if(state.error&&!state.payload){node.innerHTML=`<header><span>LINEUPS</span><b class="xiStatus unavailable">UNAVAILABLE</b></header><div class="xiEmpty">${esc(state.error)}</div>`;return;}const root=state.payload?.lineups??state.payload;const home=sideObject(root,'home'),away=sideObject(root,'away'),st=status(root,home,away);const age=state.at?Math.floor((Date.now()-state.at)/1000):0;node.innerHTML=`<header><span>LINEUPS</span><div class="xiHeadMeta"><b class="xiStatus ${st.cls}">${st.label}</b><small>${age}s · BSD</small></div></header><div class="xiGrid">${teamBlock(t.home,home,root,'home')}${teamBlock(t.away,away,root,'away')}</div>${st.cls==='predicted'?'<div class="xiNotice">AI-predicted XI — do not treat as confirmed team news.</div>':''}`;}
  async function fetchLineups(){if(!state.eventId||state.busy||!active()||document.visibilityState==='hidden')return;state.busy=true;const id=state.eventId;try{const res=await fetch(`${API}/api/match-lineups?event_id=${id}&t=${Date.now()}`,{cache:'no-store'});const p=await res.json().catch(()=>null);if(id!==state.eventId)return;if(!res.ok||!p?.ok)throw new Error(p?.error||`HTTP ${res.status}`);state.payload=p;state.error='';state.at=Date.now();render();}catch(e){if(id===state.eventId){state.error=e?.message||'BSD lineups unavailable';render();}}finally{state.busy=false;}}
  function start(id){if(!id)return;if(state.eventId===id){render();return;}clearInterval(state.timer);state.eventId=id;state.payload=null;state.error='';state.at=0;fetchLineups();state.timer=setInterval(fetchLineups,30000);render();}
  function stop(){clearInterval(state.timer);state.timer=null;state.eventId=null;state.payload=null;state.error='';matchApp.querySelector('#bsdLineups')?.remove();}
  function sync(){if(!active()){stop();return;}const id=eventId();if(id)start(id);}
  const obs=new MutationObserver(()=>{clearTimeout(obs._t);obs._t=setTimeout(sync,30);});obs.observe(matchApp,{childList:true,subtree:true,characterData:true});
  window.addEventListener('hashchange',()=>setTimeout(sync,0));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){sync();fetchLineups();}});
  setInterval(()=>{if(active()&&state.eventId)render();},5000);
  sync();
})();
