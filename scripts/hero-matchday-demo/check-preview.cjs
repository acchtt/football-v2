'use strict';
const fs=require('node:fs'),http=require('node:http'),path=require('node:path');
const puppeteer=require('/tmp/hero-matchday-qa/node_modules/puppeteer-core');
const root=path.resolve('production/pages'),out=path.resolve('preview-proof');
fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html;charset=utf-8','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.ttf':'font/ttf','.png':'image/png','.json':'application/json'};
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');
 let name=decodeURIComponent(u.pathname);if(name.endsWith('/'))name+='index.html';
 const file=path.resolve(root,'.'+name);
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return}
 fs.readFile(file,(err,bytes)=>{if(err){res.writeHead(404).end('missing '+name);return}res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-store'});res.end(bytes)});
});
async function test(){
 await new Promise(ok=>server.listen(8765,'127.0.0.1',ok));
 const browser=await puppeteer.launch({executablePath:['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(fs.existsSync),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
   const report=[];
   for(const [name,width,height] of [['desktop',1440,900],['tablet',768,1024],['mobile',390,844],['narrow',320,720]]){
    const page=await browser.newPage();
    await page.setViewport({width,height,deviceScaleFactor:1});
    const failed=[],errors=[];
    page.on('pageerror',e=>errors.push(String(e)));
    page.on('response',r=>{if(r.status()>=400 && /hero-matchday-demo|media\/ive|media\/arcxi/.test(r.url()))failed.push({url:r.url(),status:r.status()})});
    const res=await page.goto('http://127.0.0.1:8765/hero-matchday-demo/',{waitUntil:'networkidle0'});
    await page.evaluate(()=>document.fonts.ready);
    const initial=await page.evaluate(()=>({
     overflow:document.documentElement.scrollWidth>innerWidth,
     rows:document.querySelectorAll('[data-match]').length,
     selected:document.querySelector('.date-selected')?.dataset.date,
     fontLoaded:[...document.fonts].filter(f=>f.family==='HERO Condensed').some(f=>f.status==='loaded'),
     artLoaded:document.querySelector('.hero-ive-art')?.naturalWidth>0,
     scores:[...document.querySelectorAll('.result')].filter(x=>x.textContent.includes(':')).length
    }));
    if(res.status()!==200||initial.rows!==7||initial.selected!=='2026-10-22'||!initial.fontLoaded||!initial.artLoaded||initial.overflow||failed.length||errors.length)
     throw Error(name+' initial check '+JSON.stringify({status:res.status(),initial,failed,errors}));
    await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});
    await page.click('[data-lane="FOLLOW"]');
    let follow=await page.$$eval('[data-match]',nodes=>nodes.length);
    await page.click('[data-lane="ALL"]');
    await page.type('#fixture-search','Liverpool');
    let search=await page.$$eval('[data-match]',nodes=>nodes.length);
    await page.click('#clear-filters');
    const select=await page.$('select#competition-filter');
    await select.select('Premier League');
    const leagueRows=await page.$$eval('[data-match]',nodes=>nodes.length);
    await select.select('ALL');
    await page.click('#next-day');
    const changed=await page.$eval('.date-selected',n=>n.dataset.date);
    await page.click('#previous-day');
    await page.click('[data-match]');
    const expanded=await page.$$eval('.fixture.expanded',nodes=>nodes.length);
    if(follow!==3||search!==1||leagueRows!==2||changed!=='2026-10-23'||expanded!==1)
      throw Error(name+' controls '+JSON.stringify({follow,search,leagueRows,changed,expanded}));
    report.push({viewport:name,rows:initial.rows,overflows:false,artLoaded:true,fontLoaded:true,filters:true,search:true,dates:true,expand:true});
    await page.close();
   }
   fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));
   console.log('HERO_MATCHDAY_DEMO_QA_PASS',JSON.stringify(report));
 }finally{await browser.close()}
}
test().catch(e=>{console.error('DEMO_QA_FAIL',e);process.exitCode=1}).finally(()=>server.close());
