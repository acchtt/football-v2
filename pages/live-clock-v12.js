// SlipTrace Live Clock v12 — canonical period-aware match clock.
(() => {
  'use strict';

  const matchApp=document.getElementById('matchApp');
  const FINISHED=new Set(['finished','ft','full_time','full time','ended','complete','completed']);
  const PAUSED=new Set(['ht','half time','halftime','break','paused','suspended']);
  let detailAt=0;

  function isObj(v){return Boolean(v&&typeof v==='object'&&!Array.isArray(v));}
  function num(v){if(typeof v==='number'&&Number.isFinite(v))return v;if(typeof v==='string'&&v.trim()&&Number.isFinite(Number(v)))return Number(v);return undefined;}
  function norm(v=''){return String(v).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\b(fc|cf|afc|sc|ac|sk|fk|club)\b/g,' ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
  function splitMatch(match=''){for(const re of [/\s+vs\.?\s+/i,/\s+v\.?\s+/i,/\s+—\s+/,/\s+–\s+/,/\s+-\s+/]){const p=String(match).split(re).map(x=>x.trim()).filter(Boolean);if(p.length===2)return{home:p[0],away:p[1]};}return{home:String(match),away:''};}
  function nameScore(a,b){const x=norm(a),y=norm(b);if(!x||!y)return 0;if(x===y)return 6;if(x.includes(y)||y.includes(x))return 4;const aa=new Set(x.split(' ')),bb=new Set(y.split(' '));let s=0;aa.forEach(t=>bb.has(t)&&s++);const o=s/Math.max(aa.size,bb.size);return o>=.75?4:o>=.5?3:0;}
  function rowKey(row){return `${row?.match||''}|${row?.kickoff||row?.displayKickoff||row?.id||row?.pickId||''}`;}
  function bus(){return window.SLIPTRACE_DATA_BUS||{};}
  function dashboard(){return bus().dashboard||null;}
  function events(){return Array.isArray(bus().live?.events)?bus().live.events:[];}
  function eventFor(match){const t=splitMatch(match||'');return events().map(e=>({e,s:nameScore(t.home,e.home)+nameScore(t.away,e.away)})).filter(x=>x.s>=6).sort((a,b)=>b.s-a.s)[0]?.e||null;}
  function findRow(key,rows){return(rows||[]).find(r=>rowKey(r)===key)||null;}
  function periodNum(v){const p=String(v??'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'');if(['1','1h','half1','1sthalf','firsthalf'].includes(p))return 1;if(['2','2h','half2','2ndhalf','secondhalf'].includes(p))return 2;if(['3','et1','1et','extra1','1stextra','firstextra'].includes(p))return 3;if(['4','et2','2et','extra2','2ndextra','secondextra'].includes(p))return 4;return undefined;}
  function periodLabel(p,status){if(FINISHED.has(String(status||'').toLowerCase()))return'FT';if(p===1)return'1H';if(p===2)return'2H';if(p===3)return'ET1';if(p===4)return'ET2';return String(status||'LIVE').toUpperCase();}

  function unwrapDetail(){
    const raw=window.SLIPTRACE_MATCH_CONTEXT?.detail;
    if(!raw)return null;
    const root=isObj(raw.event)?{...raw.event,...raw}:raw;
    return root;
  }

  function clockSource(source,kickoff,anchorAt){
    if(!source)return null;
    const nested=isObj(source.event)?source.event:null;
    const s=nested?{...nested,...source}:source;
    const time=isObj(s.time)?s.time:{};
    const status=String(s.status??time.status??'').toLowerCase();
    if(FINISHED.has(status))return{label:'FT',status:'FT',finished:true};

    const periodRaw=s.period??s.current_period??s.match_period??time.period;
    let p=periodNum(periodRaw);
    let minute=num(s.minute??s.current_minute??time.minute??time.current_minute);
    let second=num(s.second??s.current_second??time.second??time.current_second);
    const started=num(s.periodStartedAtUts??s.period_started_at_uts??time.period_started_at_uts);

    if(started!==undefined&&p){
      const elapsed=Math.max(0,Math.floor(Date.now()/1000-started));
      const pm=Math.floor(elapsed/60), ps=elapsed%60;
      // Prefer the running period timestamp when the provider's minute is missing or clearly period-relative.
      if(minute===undefined||minute<=45){minute=pm;second=ps;}
    }

    const kickoffMs=Date.parse(kickoff||'')||0;
    const elapsedFromKickoff=kickoffMs?Math.max(0,(Date.now()-kickoffMs)/60000):0;
    if(p===undefined&&minute!==undefined){
      // Compact BSD rows sometimes omit period. A raw minute <=45 more than ~52m after scheduled kickoff
      // is overwhelmingly a second-half period minute, not a first-half match clock.
      if(minute<=45&&elapsedFromKickoff>=52)p=2;
      else if(minute<=45)p=1;
    }

    if(minute===undefined)return null;
    const rawMinute=minute;
    if(p===2&&minute<=45)minute+=45;
    else if(p===3&&minute<=15)minute+=90;
    else if(p===4&&minute<=15)minute+=105;

    if(second===undefined)second=0;
    second=Math.max(0,Math.min(59,Math.floor(second)));
    const paused=PAUSED.has(status)||PAUSED.has(String(periodRaw||'').toLowerCase());
    const age=Math.max(0,Math.min(12,Math.floor((Date.now()-(anchorAt||Date.now()))/1000)));
    if(!paused&&started===undefined)second+=age;
    minute+=Math.floor(second/60);second%=60;
    return{label:`${minute}:${String(second).padStart(2,'0')}`,status:periodLabel(p,status),period:p,rawMinute,finished:false};
  }

  function bestClock(row,event,isCurrentMatch=false){
    if(isCurrentMatch){const detail=unwrapDetail();const c=clockSource(detail,row?.kickoff||row?.displayKickoff,detailAt);if(c)return c;}
    return clockSource(event,row?.kickoff||row?.displayKickoff,Number(bus().liveAt)||Date.now());
  }

  function updateList(){
    const d=dashboard();if(!d)return;
    document.querySelectorAll('details.fixtureRow[data-row-key]').forEach(node=>{
      const row=findRow(node.dataset.rowKey,d.schedule),event=row?eventFor(row.match):null;if(!row||!event)return;
      const c=bestClock(row,event,false),score=node.querySelector('.score');if(!c||!score)return;
      const strong=score.querySelector('strong'),span=score.querySelector('span');
      if(strong&&event.homeScore!==undefined&&event.awayScore!==undefined)strong.textContent=`${event.homeScore}–${event.awayScore}`;
      if(span)span.textContent=c.label;
    });
    document.querySelectorAll('details.pickRow[data-row-key]').forEach(node=>{
      const row=findRow(node.dataset.rowKey,d.picks),event=row?eventFor(row.match):null;if(!row||!event)return;
      const c=bestClock(row,event,false),score=node.querySelector('.score');if(!c||!score)return;
      const strong=score.querySelector('strong'),span=score.querySelector('span');
      if(strong&&event.homeScore!==undefined&&event.awayScore!==undefined)strong.textContent=`${event.homeScore}–${event.awayScore}`;
      if(span)span.textContent=c.label;
    });
  }

  function field(name){return[...document.querySelectorAll('#matchApp .liveData .matchField')].find(n=>n.querySelector('span')?.textContent.trim().toLowerCase()===name.toLowerCase());}
  function setField(name,value){const s=field(name)?.querySelector('strong');if(s)s.textContent=value;}

  function updateMatch(){
    if(!matchApp||matchApp.hidden||!/^#match\//.test(location.hash))return;
    const d=dashboard();if(!d)return;
    let key='';try{key=decodeURIComponent(location.hash.slice('#match/'.length));}catch{return;}
    const row=findRow(key,d.schedule);if(!row)return;
    const event=eventFor(row.match);if(!event)return;
    const c=bestClock(row,event,true);if(!c)return;
    const board=matchApp.querySelector('.matchScoreboard>div');
    if(board&&event.homeScore!==undefined&&event.awayScore!==undefined){const bs=board.querySelectorAll('b');if(bs.length>=2){bs[0].textContent=event.homeScore;bs[1].textContent=event.awayScore;}}
    const hero=matchApp.querySelector('.matchScoreboard>em');if(hero)hero.textContent=c.label;
    setField('Score',`${event.homeScore}–${event.awayScore}`);
    setField('Minute',c.label);
    setField('Status',c.status);
  }

  function tick(){updateList();updateMatch();}
  window.addEventListener('sliptrace:match-detail',()=>{detailAt=Date.now();tick();});
  window.addEventListener('sliptrace:match-context',tick);
  window.addEventListener('sliptrace:live',tick);
  window.addEventListener('hashchange',()=>{detailAt=0;setTimeout(tick,20);});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')tick();});
  setInterval(tick,500);
  tick();
})();
