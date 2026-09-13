// SlipTrace Match Desk v9 stability layer.
// Prevent full Match Desk redraws on every live poll; update only live DOM nodes in place.
(() => {
  'use strict';

  let dashboardSignature = '';

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
  function nameScore(a,b) {
    const x=norm(a),y=norm(b); if(!x||!y) return 0;
    if(x===y) return 6; if(x.includes(y)||y.includes(x)) return 4;
    const aa=new Set(x.split(' ')),bb=new Set(y.split(' ')); let s=0;
    aa.forEach(t=>bb.has(t)&&s++);
    const o=s/Math.max(aa.size,bb.size);
    return o>=.75?4:o>=.5?3:0;
  }
  function routeKey() {
    const m=location.hash.match(/^#match\/(.+)$/); if(!m) return '';
    try{return decodeURIComponent(m[1]);}catch{return '';}
  }
  function rowKey(row){return `${row?.match||''}|${row?.kickoff||row?.displayKickoff||row?.id||row?.pickId||''}`;}
  function dashboard(){return window.SLIPTRACE_DATA_BUS?.dashboard||null;}
  function liveRows(){return Array.isArray(window.SLIPTRACE_DATA_BUS?.live?.events)?window.SLIPTRACE_DATA_BUS.live.events:[];}
  function currentRow(payload=dashboard()) {
    const key=routeKey();
    return payload?.schedule?.find?.(r=>rowKey(r)===key)||null;
  }
  function currentEvent(row) {
    if(!row) return null;
    const t=splitMatch(row.match||'');
    return liveRows().map(e=>({e,s:nameScore(t.home,e.home)+nameScore(t.away,e.away)}))
      .filter(x=>x.s>=6).sort((a,b)=>b.s-a.s)[0]?.e||null;
  }
  function scoreState(row,event) {
    if(row?.manualScore && Number.isFinite(Number(row.manualScore.home)) && Number.isFinite(Number(row.manualScore.away))) {
      return {home:Number(row.manualScore.home),away:Number(row.manualScore.away),label:'MANUAL',kind:'manual',minute:'—'};
    }
    if(event && event.homeScore!==undefined && event.awayScore!==undefined) {
      const s=String(event.status||'').toLowerCase();
      const ended=['finished','ft','full_time','full time','ended','complete','completed'].includes(s);
      const minute=event.minute!==undefined?`${event.minute}′`:event.currentMinute!==undefined?`${event.currentMinute}′`:'—';
      const label=ended?'FT':minute!=='—'?minute:event.period?String(event.period).toUpperCase():'LIVE';
      return {home:Number(event.homeScore),away:Number(event.awayScore),label,kind:ended?'final':'live',minute};
    }
    return null;
  }
  function field(label) {
    return [...document.querySelectorAll('#matchApp .liveData .matchField')].find(n=>n.querySelector('span')?.textContent.trim().toLowerCase()===label.toLowerCase());
  }
  function setField(label,value) {
    const node=field(label)?.querySelector('strong'); if(node) node.textContent=value;
  }
  function updateLiveDom() {
    if(!routeKey()) return;
    const matchApp=document.getElementById('matchApp');
    if(!matchApp||matchApp.hidden) return;
    const row=currentRow(); if(!row) return;
    const event=currentEvent(row), score=scoreState(row,event);
    const hero=matchApp.querySelector('.matchHero');
    if(hero){hero.classList.remove('live','final','manual','prematch');hero.classList.add(score?.kind||'prematch');}
    const board=matchApp.querySelector('.matchScoreboard>div');
    if(board&&score) board.innerHTML=`<b>${score.home}</b><i>–</i><b>${score.away}</b>`;
    const status=matchApp.querySelector('.matchScoreboard>em'); if(status&&score) status.textContent=score.label;
    setField('Score',score?`${score.home}–${score.away}`:'—');
    setField('Status',score?.label||'AWAITING STATUS');
    setField('Minute',score?.minute||'—');
    const eventId=event?.id??event?.eventId;
    if(eventId){
      setField('BSD Event',String(eventId));
      const top=matchApp.querySelector('.matchTopline>span'); if(top) top.textContent=`BSD EVENT ${eventId}`;
    }
    const dot=matchApp.querySelector('.liveData>header i'); if(dot) dot.classList.toggle('on',score?.kind==='live');
  }
  function signature(payload) {
    const row=currentRow(payload); if(!row) return '';
    const picks=(payload?.picks||[]).filter(p=>nameScore(splitMatch(row.match).home,splitMatch(p.match).home)+nameScore(splitMatch(row.match).away,splitMatch(p.match).away)>=6);
    return JSON.stringify({row,picks});
  }

  // This file is loaded before match-page-v7.js. Capture listeners run first and can suppress its anonymous full-render handlers.
  window.addEventListener('sliptrace:live',(event)=>{
    if(!routeKey()) return;
    event.stopImmediatePropagation();
    requestAnimationFrame(updateLiveDom);
  },true);

  window.addEventListener('sliptrace:dashboard',(event)=>{
    if(!routeKey()) return;
    const next=signature(event.detail||dashboard());
    const hasPage=Boolean(document.querySelector('#matchApp .matchHero'));
    if(hasPage && next && (!dashboardSignature || next===dashboardSignature)) {
      dashboardSignature=next;
      event.stopImmediatePropagation();
      requestAnimationFrame(updateLiveDom);
      return;
    }
    dashboardSignature=next;
  },true);

  window.addEventListener('hashchange',()=>{dashboardSignature='';setTimeout(updateLiveDom,30);});
})();
