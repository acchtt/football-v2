// SlipTrace Realtime v13 — canonical BSD event id for WebSocket subscriptions.
(() => {
  'use strict';

  const API=window.SLIPTRACE_API||'https://football-v2.acchtt.workers.dev';
  const matchApp=document.getElementById('matchApp');
  if(!matchApp)return;
  const state={id:null,socket:null,reconnect:null,blocked:false,source:'',position:null,situation:'',commentary:'',activity:[],coverage:null};

  function active(){return /^#match\//.test(location.hash);}
  function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function eventId(){
    const ctx=window.SLIPTRACE_MATCH_CONTEXT||{};
    const top=matchApp.querySelector('.matchTopline');
    return String(ctx.restId||top?.dataset.restId||ctx.liveId||top?.dataset.liveId||'').trim()||null;
  }
  function wsUrl(){const u=new URL(API);u.protocol=u.protocol==='https:'?'wss:':'ws:';u.pathname='/api/live-centre';u.search='';return u.toString();}
  function label(v){return String(v||'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());}
  function side(v){const s=String(v||'').toLowerCase();return s==='home'||s==='away'?s:'';}
  function setCoverage(text,cls,note){state.coverage={text,cls,note};const p=matchApp.querySelector('#bsdLiveCentre');if(!p)return;const b=p.querySelector('.lcCoverage b'),s=p.querySelector('.lcCoverage small');if(b){b.className=cls||'limited';b.textContent=text;}if(s)s.textContent=note||'';}
  function renderActivity(){const n=matchApp.querySelector('#bsdLiveCentre .lcActivity');if(!n||!state.activity.length)return;n.innerHTML=state.activity.map(r=>`<div><span class="${side(r.side)}">${r.minute!==undefined&&r.minute!==null?`${esc(r.minute)}′`:'•'}</span><p>${esc(r.text)}</p></div>`).join('');}
  function apply(){const p=matchApp.querySelector('#bsdLiveCentre');if(!p)return;if(state.coverage)setCoverage(state.coverage.text,state.coverage.cls,state.coverage.note);const ball=p.querySelector('.lcBall');if(ball&&state.position){let x=Number(state.position.x),y=Number(state.position.y);if(side(state.position.side)==='away')x=100-x;if(Number.isFinite(x)&&Number.isFinite(y)){ball.style.left=`${Math.max(1,Math.min(99,x))}%`;ball.style.top=`${Math.max(2,Math.min(98,y))}%`;ball.classList.add('active');}}const sit=p.querySelector('.lcSituation>span'),txt=p.querySelector('.lcSituation>p');if(sit&&state.situation){sit.textContent=label(state.situation);sit.className=side(state.position?.side);}if(txt&&state.commentary)txt.textContent=state.commentary;renderActivity();}
  function push(item){if(!item?.text)return;state.activity.unshift(item);state.activity=state.activity.slice(0,5);renderActivity();}
  function livedata(f){const pts=Array.isArray(f?.coordinates)?f.coordinates:[];const pt=pts[pts.length-1];if(!pt)return;state.position={x:pt.x,y:pt.y,side:f.side};state.situation=f.situation||'live';state.commentary=f.commentary||`${label(f.situation||'Live')} · ${f.side||''}`;push({side:f.side,text:state.commentary});apply();}
  function action(f){if(!Number.isFinite(Number(f?.x))||!Number.isFinite(Number(f?.y)))return;state.position={x:Number(f.x),y:Number(f.y),side:f.team||f.side};state.situation=f.action_type||'action';state.commentary=`${f.player?.name?`${f.player.name} · `:''}${label(f.action_type||'Action')}`;push({side:f.team||f.side,minute:f.minute,text:state.commentary});apply();}
  function frame(f){
    if(!f||typeof f!=='object')return;
    if(f.event_id!==undefined&&f.event_id!==null&&String(f.event_id)!==String(state.id))return;
    if(f.type==='subscribed'){
      state.source=f.source||'basic';state.blocked=false;
      setCoverage(state.source==='full'?'WS+':'LIVE WS',state.source==='full'?'plus':'live',state.source==='full'?'per-action position':'position ~5s');
      const h=Array.isArray(f.history)?f.history:[],l=Array.isArray(f.livedata)?f.livedata:[];
      if(h.length)action(h[h.length-1]);else if(l.length)livedata(l[l.length-1]);else apply();return;
    }
    if(f.type==='livedata'){setCoverage(state.source==='full'?'WS+':'LIVE WS',state.source==='full'?'plus':'live',state.source==='full'?'per-action position':'position ~5s');livedata(f);return;}
    if(f.type==='action'){state.source='full';setCoverage('WS+','plus','per-action position');action(f);return;}
    if(f.type==='error'){
      const code=String(f.code||''),msg=f.message||code||'WebSocket error';
      if(code==='subscription_required'){state.blocked=true;state.situation='WebSocket addon required';state.commentary='Real pitch animation requires the BSD WebSocket addon. REST stats remain active.';setCoverage('WS ADDON','limited','BSD WebSocket addon required');}
      else if(code==='not_tracked'){state.blocked=true;state.situation='No positional feed';state.commentary='BSD does not provide positional WebSocket coverage for this match.';setCoverage('NO WS','limited','no positional coverage');}
      else if(code==='bad_event_id'){state.blocked=true;state.situation='Event ID unavailable';state.commentary='BSD did not expose a canonical realtime event id for this fixture.';setCoverage('NO WS','limited','canonical event id unavailable');}
      else{state.situation='WebSocket error';state.commentary=msg;setCoverage('WS ERROR','limited',msg);}apply();
    }
  }
  function close(){clearTimeout(state.reconnect);state.reconnect=null;const s=state.socket;state.socket=null;if(s)try{s.close(1000,'match changed');}catch{}}
  function reconnect(id){if(state.blocked||!active())return;clearTimeout(state.reconnect);state.reconnect=setTimeout(()=>{if(String(state.id)===String(id)&&document.visibilityState==='visible')connect();},4000);}
  function connect(){if(!state.id||state.socket||state.blocked||!active()||document.visibilityState==='hidden')return;const id=state.id;setCoverage('CONNECTING','stats','opening BSD live channel');let s;try{s=new WebSocket(wsUrl());}catch(e){setCoverage('WS ERROR','limited',e?.message||'connection failed');reconnect(id);return;}state.socket=s;s.addEventListener('open',()=>{if(String(id)!==String(state.id))return;try{s.send(JSON.stringify({action:'subscribe',event_id:/^\d+$/.test(String(id))?Number(id):id}));}catch{}});s.addEventListener('message',e=>{if(String(id)!==String(state.id))return;let f;try{f=JSON.parse(e.data);}catch{return;}frame(f);});s.addEventListener('close',()=>{if(state.socket===s)state.socket=null;if(String(id)!==String(state.id)||state.blocked)return;setCoverage('RECONNECT','limited','BSD live channel disconnected');reconnect(id);});s.addEventListener('error',()=>{if(String(id)===String(state.id)&&!state.blocked)setCoverage('WS ERROR','limited','live channel unavailable');});}
  function sync(){if(!active()){close();state.id=null;return;}const id=eventId();if(!id)return;if(String(id)!==String(state.id)){close();state.id=id;state.blocked=false;state.source='';state.position=null;state.situation='';state.commentary='';state.activity=[];state.coverage=null;}connect();apply();}

  window.addEventListener('sliptrace:match-context',sync);
  window.addEventListener('sliptrace:live-centre-rendered',apply);
  window.addEventListener('hashchange',()=>setTimeout(sync,0));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')close();else sync();});
  const observer=new MutationObserver(()=>{clearTimeout(observer._t);observer._t=setTimeout(()=>{sync();apply();},30);});
  observer.observe(matchApp,{childList:true,subtree:true,characterData:true});
  sync();
})();
