// Demo-only, deterministic synthetic fixtures. This script is injected only into
// the isolated preview build. It never contacts Airtable or writes production data.
(()=>{
  const format=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'});
  const pieces=format.formatToParts(new Date());
  const part=key=>pieces.find(x=>x.type===key).value;
  const today=part('year')+'-'+part('month')+'-'+part('day');
  const base=new Date(today+'T12:00:00Z');
  const teams=[
    ['Horizon Athletic','Aurora FC','Champions Exhibition','FOCUS',1,'FOLLOW'],
    ['North Star Women','Solis United Women','Women’s Showcase','WATCHLIST',2,'RESERVE'],
    ['Phoenix Wanderers','Lunar City','Elite Demonstration League','FOCUS',3,'RESERVE'],
    ['Comet SC','Atlas Football Club','Continental Friendly Exhibition','PASS',4,'STOP']
  ];
  const schedule=[];
  for(let offset=-3;offset<=4;offset++){
    const d=new Date(base);d.setUTCDate(d.getUTCDate()+offset);
    const slateDate=d.toISOString().slice(0,10);
    teams.forEach(([home,away,competition,tier,cRank,lane],index)=>{
      const kickoff= offset===0?new Date(Date.now()+((index+1)*65)*60000):
        new Date(Date.parse(slateDate+'T14:00:00Z')+index*55*60000);
      schedule.push({id:'synthetic-'+offset+'-'+index,slateDate,match:home+' vs '+away,competition,tier,cRank,
        kickoff:kickoff.toISOString(),cBoardState:tier==='FOCUS'?'C-FOCUS':tier==='WATCHLIST'?'C-WATCH':'C-PASS',
        coverageNotes:'[FOLLOW: '+lane+']',followLane:lane,grade:tier==='FOCUS'?'A':'B'});
    });
  }
  window.__ARCXI_SAMPLE_DATA_ONLY__=true;
  const old=window.fetch.bind(window);
  const ok=data=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}});
  window.fetch=(req,opts)=>{
    const url=typeof req==='string'?req:(req&&req.url)||String(req);
    if(!url.startsWith('https://football-v2.acchtt.workers.dev/'))return old(req,opts);
    const p=new URL(url).pathname;
    if(p==='/api/dashboard-data')return Promise.resolve(ok({ok:true,schedule,picks:[],sync:{sourceBaseId:'SYNTHETIC_DEMO'}}));
    if(p.includes('/soccerway/'))return Promise.resolve(ok({ok:true,fixtures:[],data:{results:[]}}));
    return Promise.resolve(ok({ok:true,data:{results:[]},fixtures:[]}));
  };
})();
