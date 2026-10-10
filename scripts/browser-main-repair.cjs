// Browser audit for actual production schedule source, served locally with deterministic,
// explicitly fake API fixtures. No live endpoints or data are mutated.
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const puppeteer=require('/tmp/arcxi-browser/node_modules/puppeteer-core');
const axeSource=fs.readFileSync('/tmp/arcxi-browser/node_modules/axe-core/axe.min.js','utf8');
const assetRoot=path.resolve('pages');
const results=[];
const contentType={'.html':'text/html','.css':'text/css','.js':'application/javascript',
  '.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp',
  '.ttf':'font/ttf','.ico':'image/x-icon','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
  let pathname;
  try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}
  catch{res.writeHead(400);res.end();return}
  const file=path.resolve(assetRoot,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(assetRoot+path.sep)){res.writeHead(403);res.end();return}
  fs.readFile(file,(err,data)=>{
    if(err){res.writeHead(404);res.end('Not found');return}
    res.writeHead(200,{'Content-Type':contentType[path.extname(file)]||'application/octet-stream'});
    res.end(data);
  });
});
const ictDate=()=>{
  const now=new Date();
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',
    year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const part=n=>parts.find(p=>p.type===n).value;
  return part('year')+'-'+part('month')+'-'+part('day');
};
function fixtures(day){
  const initial=Date.parse(day+'T09:00:00Z');
  return [
    ['A','League A','Club A vs Team One',0],
    ['B','League B','Club B vs Team Two',30],
    ['C','League A','Club C vs Team Three',60]
  ].map(([id,competition,match,offset])=>({
    id:'fixture-'+id,slateDate:day,competition,match,tier:'FOCUS',
    kickoff:new Date(initial+offset*60000).toISOString(),
    coverageNotes:id==='A'?'[FOLLOW: STOP]':'[FOLLOW: RESERVE]'
  }));
}
async function main(){
  const today=ictDate();
  const rows=fixtures(today);
  const binary=fs.existsSync('/usr/bin/google-chrome')?'/usr/bin/google-chrome':
    fs.existsSync('/usr/bin/google-chrome-stable')?'/usr/bin/google-chrome-stable':
    '/usr/bin/chromium';
  const browser=await puppeteer.launch({headless:true,executablePath:binary,
    args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
  await fs.promises.mkdir('audit-screenshots',{recursive:true});
  try{
    for(const view of [{name:'desktop',width:1440,height:900},
      {name:'mobile',width:390,height:844},{name:'narrow',width:320,height:740}]){
      const page=await browser.newPage();
      const errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.setViewport({width:view.width,height:view.height,deviceScaleFactor:1});
      await page.evaluateOnNewDocument((schedule)=>{
        // Override network fetch before config.js captures its native fetch reference.
        const original=window.fetch.bind(window);
        const ok=value=>new Response(JSON.stringify(value),{status:200,headers:{
          'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}});
        window.fetch=(input,init)=>{
          const url=typeof input==='string'?input:input instanceof Request?input.url:String(input);
          if(!url.startsWith('https://football-v2.acchtt.workers.dev/'))return original(input,init);
          const parsed=new URL(url);
          if(parsed.pathname==='/api/dashboard-data')
            return Promise.resolve(ok({ok:true,schedule,picks:[]}));
          if(parsed.pathname==='/api/bsd/events'||parsed.pathname==='/api/bsd/live')
            return Promise.resolve(ok({ok:true,data:{results:[]}}));
          if(parsed.pathname==='/api/bsd/leagues'||parsed.pathname==='/api/bsd/teams')
            return Promise.resolve(ok({ok:true,data:{results:[]}}));
          if(parsed.pathname.includes('soccerway'))return Promise.resolve(ok({ok:true,data:{results:[]}}));
          return Promise.resolve(ok({ok:true,data:{results:[]}}));
        };
      },rows);
      const url='http://127.0.0.1:'+server.address().port+'/index.html#board';
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
      await page.waitForFunction(()=>document.querySelectorAll('.scheduleMatchCard').length===3,
        {timeout:30000});
      const data=await page.evaluate(()=>{
        const headers=[...document.querySelectorAll('.scheduleCompetitionHead strong')].map(n=>n.textContent);
        const matches=[...document.querySelectorAll('.scheduleFixture')].map(n=>n.textContent);
        const dateButtons=[...document.querySelectorAll('.dateBtn')];
        const selected=dateButtons.find(n=>n.getAttribute('aria-pressed')==='true');
        const headings=[...document.querySelectorAll('.scheduleCompetitionHead strong')].map(n=>({
          name:n.textContent,width:n.getBoundingClientRect().width}));
        const doc=document.documentElement;
        return {headers,matches,selected:selected?.dataset.date,dates:dateButtons.map(n=>n.dataset.date),
          disabled:dateButtons.filter(n=>n.disabled).length,
          overflow:doc.scrollWidth-innerWidth,
          headings,hasArtwork:!!document.querySelector('.iveCornerArtwork'),
          mainLandmarks:document.querySelectorAll('main').length,
          hasPageHeading:!!document.querySelector('.scheduleStage h1')};
      });
      assert.deepEqual(data.headers,['League A','League B','League A'],
        'Global kickoff sorting must survive repeated competition headings');
      assert.equal(data.selected,today,'Today should be selected when first opening board');
      assert.equal(data.disabled,0,'Zero-board dates must remain selectable');
      assert(data.overflow<=2,'Horizontal overflow at '+view.name+': '+data.overflow);
      assert(data.headings.every(x=>x.width>100),'League heading has collapsed at '+view.name);
      assert.equal(data.mainLandmarks,1,'Exactly one main landmark');
      assert(data.hasPageHeading&&data.hasArtwork,'Required accessible heading or IVE artwork missing');
      await page.screenshot({path:'audit-screenshots/'+view.name+'.png',fullPage:true});
      // Validate independent keyboard-opened score editor can trap focus.
      await page.evaluate(()=>{
        const trigger=document.querySelector('.scheduleManualScore');
        trigger?.focus();
        trigger?.click();
      });
      await page.waitForSelector('.manualScoreDialog',{timeout:10000});
      await page.evaluate(()=>document.querySelector('.manualScoreSave').focus());
      await page.keyboard.press('Tab');
      const trapped=await page.evaluate(()=>document.activeElement?.classList.contains('manualScoreClose'));
      assert(trapped,'Dialog tab key must wrap to first control on '+view.name);
      await page.keyboard.press('Escape');
      await page.waitForFunction(()=>!document.querySelector('.manualScoreDialog'));
      assert(await page.evaluate(()=>document.activeElement?.classList.contains('scheduleManualScore')),
        'Dialog should restore focus after close');
      if(view.name!=='narrow'){
        await page.evaluate(axeSource);
        const violations=await page.evaluate(async()=>{
          const out=await axe.run(document,{runOnly:{type:'tag',
            values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}});
          return out.violations.map(v=>({id:v.id,impact:v.impact,count:v.nodes.length,
            targets:v.nodes.slice(0,3).map(x=>x.target)}));
        });
        fs.writeFileSync('audit-screenshots/'+view.name+'-axe.json',JSON.stringify(violations,null,2));
        console.log('AXE '+view.name+' '+JSON.stringify(violations));
        assert(!violations.some(x=>x.impact==='serious'||x.impact==='critical'),
          'Serious axe violations at '+view.name+': '+JSON.stringify(violations));
      }
      await page.evaluate(()=>document.querySelector('[data-date-shift="1"]').click());
      await page.waitForFunction(prev=>document.querySelector('.dateBtn.active')?.dataset.date!==prev,
        {timeout:15000},today);
      const shifted=await page.evaluate(()=>({
        current:document.querySelector('.dateBtn.active')?.dataset.date,
        center:document.querySelectorAll('.dateBtn')[2]?.dataset.date,
        anyDisabled:[...document.querySelectorAll('.dateBtn')].some(n=>n.disabled)
      }));
      assert(shifted.current&&shifted.current===shifted.center&&!shifted.anyDisabled,
        'Date navigation must remain centered and enabled: '+JSON.stringify(shifted));
      assert.equal(errors.length,0,'Runtime errors at '+view.name+': '+errors.join('; '));
      console.log('BROWSER '+view.name+' '+JSON.stringify({data,shifted,errors}));
      results.push({viewport:view.name,data,shifted,errors});
      await page.close();
    }
    fs.writeFileSync('audit-screenshots/summary.json',JSON.stringify(results,null,2));
    console.log('PASS: production schedule browser checks at desktop, mobile and 320px');
  }finally{await browser.close()}
}
server.listen(0,'127.0.0.1',()=>{
  main().then(()=>server.close()).catch(e=>{console.error(e);server.close();process.exitCode=1});
});
