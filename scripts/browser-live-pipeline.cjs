// Real Chrome smoke test for the production score/status pipeline.
// All provider responses are deterministic and local; no live API mutations.
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const puppeteer=require('/tmp/arcxi-browser/node_modules/puppeteer-core');
const root=path.resolve('pages');
const mime={'.html':'text/html','.css':'text/css','.js':'application/javascript',
 '.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.ttf':'font/ttf'};
const server=http.createServer((req,res)=>{
 let name;try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400).end();return;}
 const target=path.resolve(root,'.'+(name==='/'?'/index.html':name));
 if(!target.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(target,(err,bytes)=>{if(err){res.writeHead(404).end('Not found');return;}
 res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream'});res.end(bytes);});
});
function todayICT(){
 const dt=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const get=type=>dt.find(x=>x.type===type).value;
 return get('year')+'-'+get('month')+'-'+get('day');
}
async function run(){
 const day=todayICT();
 const kickoff=new Date(Date.now()-14*60000).toISOString();
 const earlier=new Date(Date.now()-4*3600000).toISOString();
 const schedule=[
  {id:'board-live',slateDate:day,competition:'Test League',match:'Club Alpha vs Club Beta',tier:'FOCUS',kickoff},
  {id:'board-unverified',slateDate:day,competition:'Test League',match:'Unknown City vs Missing United',tier:'FOCUS',kickoff:earlier}
 ];
 const chromium=fs.existsSync('/usr/bin/google-chrome')?'/usr/bin/google-chrome':
  fs.existsSync('/usr/bin/google-chrome-stable')?'/usr/bin/google-chrome-stable':'/usr/bin/chromium';
 const browser=await puppeteer.launch({headless:true,executablePath:chromium,
   args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 try{
  const page=await browser.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
  await page.evaluateOnNewDocument(({schedule,kickoff})=>{
   const original=window.fetch.bind(window);
   const event=(status,home,away,minute)=>({
      id:51931,event_date:kickoff,home_team:{id:60,name:'Club Alpha'},
      away_team:{id:61,name:'Club Beta'},league:{id:90,name:'Test League'},
      status,home_score:home,away_score:away,
      time:{status,minute,period:status==='finished'?'FT':'2nd_half'}
   });
   window.__ARCXI_LIVE_SCENE__=0;
   window.__ARCXI_LIVE_REQUESTS__=0;
   const reply=(value,status=200)=>new Response(JSON.stringify(value),
      {status,headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}});
   window.fetch=(input,init)=>{
     const uri=typeof input==='string'?input:input instanceof Request?input.url:String(input);
     if(!uri.startsWith('https://football-v2.acchtt.workers.dev/'))return original(input,init);
     const {pathname}=new URL(uri),scene=window.__ARCXI_LIVE_SCENE__;
     if(pathname==='/api/dashboard-data')return Promise.resolve(reply({ok:true,schedule,picks:[]}));
     if(pathname==='/api/bsd/live'){
       window.__ARCXI_LIVE_REQUESTS__++;
       if(scene===3)return Promise.resolve(reply({ok:false,error:'Simulated provider outage'},503));
       const rows=scene===1?[event('inprogress',1,0,32)]:
         scene===2?[event('inprogress',1,1,61)]:[];
       return Promise.resolve(reply({ok:true,data:{results:rows}}));
     }
     if(pathname==='/api/bsd/events'){
       const rows=scene===4?[event('finished',1,1,90)]:[event('upcoming',0,0,0)];
       return Promise.resolve(reply({ok:true,data:{results:rows}}));
     }
     if(pathname==='/api/soccerway/board')
       return Promise.resolve(reply({ok:true,fixtures:[],count:0}));
     return Promise.resolve(reply({ok:true,data:{results:[]}}));
   };
  },{schedule,kickoff});
  await page.goto('http://127.0.0.1:'+server.address().port+'/index.html#board',
    {waitUntil:'domcontentloaded',timeout:25000});
  await page.waitForFunction(()=>document.querySelectorAll('.scheduleMatchCard').length===2,
    {timeout:25000});
  async function inspect(){
    return page.evaluate(()=>{
      const nodes=[...document.querySelectorAll('.scheduleMatchCard')];
      return nodes.map(node=>({
        label:node.querySelector('.scheduleTeam.home span')?.textContent,
        score:node.querySelector('.scheduleScore strong')?.textContent,
        clock:node.querySelector('.scheduleScore small')?.textContent,
        status:node.querySelector('.fixtureStatus')?.textContent,
        dataset:node.querySelector('.scheduleFixture')?.dataset.matchStatus
      }));
    });
  }
  let initial=await inspect();
  const beforeKickoff=initial.find(row=>row.label==='Club Alpha');
  const unsupported=initial.find(row=>row.label==='Unknown City');
  assert(beforeKickoff && !['LIVE','FT'].includes(beforeKickoff.status),
    'Elapsed kickoff time must not fabricate LIVE or FT: '+JSON.stringify(initial));
  assert.equal(unsupported?.status,'UNVERIFIED',
    'Old unsupported fixture must be UNVERIFIED');
  assert.notEqual(unsupported?.dataset,'finished',
    'Unsupported fixture may not be in confirmed FT lane');
  console.log('INITIAL '+JSON.stringify(initial));
  const next=async(scene,expected)=>{
    const before=await page.evaluate(()=>window.__ARCXI_LIVE_REQUESTS__);
    await page.evaluate(value=>{
      window.__ARCXI_LIVE_SCENE__=value;
      document.dispatchEvent(new Event('visibilitychange'));
    },scene);
    await page.waitForFunction(({count})=>window.__ARCXI_LIVE_REQUESTS__>count,
      {timeout:18000},{count:before});
    await page.waitForFunction(expected,{timeout:18000});
    return inspect();
  };
  let phase=await next(1,()=>{
    const row=[...document.querySelectorAll('.scheduleMatchCard')].find(n=>
      n.querySelector('.scheduleTeam.home span')?.textContent==='Club Alpha');
    return row?.querySelector('.scheduleScore strong')?.textContent==='1–0'&&
      row?.querySelector('.fixtureStatus')?.textContent==='LIVE';
  });
  assert.equal(phase.find(row=>row.label==='Club Alpha')?.status,'LIVE');console.log('LIVE_1_0 '+JSON.stringify(phase));
  await page.click('#boardSearch');
  await page.type('#boardSearch','Alpha',{delay:8});
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelectorAll('.scheduleMatchCard').length===1);
  const phase2=await next(2,()=>document.querySelector('.scheduleScore strong')?.textContent==='1–1');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'boardSearch',
    'Search focus was lost during a live score update');
  assert.equal(await page.evaluate(()=>document.querySelector('#boardSearch')?.value),'Alpha',
    'Search text was lost during a live score update');
  console.log('LIVE_1_1 '+JSON.stringify(phase2));
  const beforeOutage=await page.evaluate(()=>window.__ARCXI_LIVE_REQUESTS__);
  await page.evaluate(()=>{
     window.__ARCXI_LIVE_SCENE__=3;document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(before=>window.__ARCXI_LIVE_REQUESTS__>before,
    {timeout:18000},beforeOutage);
  await page.waitForFunction(()=>Boolean(document.querySelector('.statusBanner')),{timeout:18000});
  assert.equal((await inspect())[0].score,'1–1','Provider outage erased last confirmed score');
  console.log('OUTAGE '+JSON.stringify(await inspect()));
  const prior=await page.evaluate(()=>window.__ARCXI_LIVE_REQUESTS__);
  await page.evaluate(()=>{
    window.__ARCXI_LIVE_SCENE__=4;document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(before=>window.__ARCXI_LIVE_REQUESTS__>before,
    {timeout:18000},prior);
  await page.waitForFunction(()=>document.querySelector('.scheduleMatchCard .fixtureStatus')?.textContent==='FT',
    {timeout:20000});
  const final=await inspect();
  assert.equal(final[0].score,'1–1');
  assert.equal(final[0].status,'FT');
  console.log('PROVIDER_FT '+JSON.stringify(final));
  assert.equal(errors.length,0,'Uncaught page errors: '+errors.join('; '));
  console.log('PASS: real production board 0-0 -> 1-0 -> 1-1 -> outage -> confirmed FT, no synthetic status, search focus retained');
  await page.close();
 }finally{await browser.close();}
}
server.listen(0,'127.0.0.1',()=>{run().then(()=>server.close()).catch(e=>{
  console.error(e);server.close();process.exitCode=1;
});});
