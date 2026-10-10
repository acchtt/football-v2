// Read-only production Chrome observation. Compares stable BSD LIVE event IDs to
// the rendered ARC XI schedule; never edits matches, scores or model records.
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
const require=createRequire(import.meta.url);
const puppeteer=require('/tmp/arcxi-browser/node_modules/puppeteer-core');
import {mkdir,writeFile,appendFile} from 'node:fs/promises';
import {compareStableLive,providerRows} from './live-score-parity.mjs';

const SITE='https://acchtt.github.io/football-v2/';
const API='https://football-v2.acchtt.workers.dev/api/bsd/live';
const ORIGIN='https://acchtt.github.io';
const out='audit-live';
await mkdir(out,{recursive:true});
const getProvider=async()=>{
  let last;
  for(let attempt=0;attempt<2;attempt++){
    try{
      const response=await fetch(API+'?render_probe='+Date.now(),{
        cache:'no-store',headers:{Origin:ORIGIN,Accept:'application/json'},
        signal:AbortSignal.timeout(14000)
      });
      if(!response.ok)throw Error('BSD LIVE HTTP '+response.status);
      const payload=await response.json();
      if(payload?.ok===false)throw Error('BSD LIVE returned ok:false');
      providerRows(payload);
      return payload;
    }catch(error){last=error;if(attempt===0)await new Promise(ok=>setTimeout(ok,1500));}
  }
  throw last;
};
const binary=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium']
  .find(existsSync);
// Avoid treating unavailable browser as success.
const browser=await puppeteer.launch({executablePath:process.env.CHROME_BIN||binary||'/usr/bin/google-chrome',
  headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
let report;
try{
  const page=await browser.newPage();
  const pageErrors=[];
  page.on('pageerror',err=>pageErrors.push(err.message));
  await page.setViewport({width:1440,height:900,deviceScaleFactor:1});
  await page.goto(SITE+'#board',{waitUntil:'domcontentloaded',timeout:40000});
  await page.waitForSelector('.scheduleStage',{timeout:30000});
  await page.waitForFunction(()=>document.querySelector('.scheduleStage')?.getAttribute('aria-busy')==='false',
    {timeout:30000});
  await page.evaluate(()=>{
    const all=document.querySelector('[data-status-filter="all"]');
    if(all && all.getAttribute('aria-pressed')!=='true')all.click();
  });
  await new Promise(ok=>setTimeout(ok,1200));
  const before=await getProvider();
  // Use the normal production refresh trigger; then wait at least one real timer cycle.
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await new Promise(ok=>setTimeout(ok,13500));
  // Observe the selected day plus adjacent ranked-board days when present.
  // The provider LIVE endpoint is global, while the UI is date-scoped. Only
  // compare fixtures actually rendered on the public website; never inject
  // synthetic rows or turn absence of shared IDs into a parity PASS.
  const snapshot=()=>page.evaluate(()=>({
    date:document.querySelector('.dateBtn[aria-pressed="true"]')?.dataset.date||null,
    error:document.querySelector('.statusBanner')?.innerText||'',
    boardRows:document.querySelectorAll('.scheduleMatchCard').length,
    fixtures:[...document.querySelectorAll('.scheduleMatchCard .scheduleFixture[data-live-event]')].map(n=>({
      id:n.dataset.liveEvent||'',
      score:n.closest('.scheduleMatchCard')?.querySelector('.scheduleScore strong')?.textContent?.trim()||'',
      status:n.closest('.scheduleMatchCard')?.querySelector('.fixtureStatus')?.textContent?.trim()||''
    }))
  }));
  const snapshots=[await snapshot()];
  const neighbours=await page.evaluate(()=>{
    const buttons=[...document.querySelectorAll('.dateBtn')];
    const current=buttons.findIndex(b=>b.getAttribute('aria-pressed')==='true');
    return [current-1,current+1].filter(i=>i>=0&&i<buttons.length)
      .map(i=>({date:buttons[i].dataset.date,
        count:Number((buttons[i].querySelector('.srOnly')?.textContent||'').match(/(\\d+) board matches/)?.[1]||0)}))
      .filter(item=>item.count>0);
  });
  // Capture the selected-date production board before navigation.
  await page.screenshot({path:out+'/production-board.png',fullPage:true});
  for(const neighbour of neighbours){
    await page.evaluate(date=>document.querySelector('.dateBtn[data-date="'+date+'"]')?.click(),neighbour.date);
    await page.waitForFunction(date=>document.querySelector('.dateBtn.active')?.dataset.date===date,
      {timeout:12000},neighbour.date);
    // Past dates select FT by default; inspect All to avoid hiding live IDs.
    await page.evaluate(()=>{
      const all=document.querySelector('[data-status-filter="all"]');
      if(all?.getAttribute('aria-pressed')!=='true')all?.click();
    });
    await page.waitForFunction(()=>document.querySelector('.scheduleStage')?.getAttribute('aria-busy')==='false',
      {timeout:12000});
    await new Promise(ok=>setTimeout(ok,1100));
    snapshots.push(await snapshot());
  }
  const dom={date:snapshots[0].date,error:snapshots.map(x=>x.error).filter(Boolean).join('; '),
    boardRows:snapshots.reduce((n,x)=>n+x.boardRows,0),
    fixtures:snapshots.flatMap(x=>x.fixtures)};
  const after=await getProvider();
  const parity=compareStableLive(before,after,dom.fixtures);
  // A browser exception is not a passing comparison even if displayed scores match.
  const observedStatus = pageErrors.length ? 'FAIL' : parity.status;
  report={time:new Date().toISOString(),status:observedStatus,selectedDateICT:dom.date,
    liveProviderStart:providerRows(before).length,liveProviderEnd:providerRows(after).length,
    boardRows:dom.boardRows,datesInspected:snapshots.map(x=>x.date),
    rowsByDate:snapshots.map(x=>({date:x.date,rows:x.boardRows})),
    providerMatched:parity.compared,
    stableProviderRows:parity.stableProviderRows,
    changedDuringWindow:parity.unstable.length,
    sourceNotDisplayed:parity.notShownCount,
    duplicateIds:parity.duplicateIds,
    mismatches:parity.mismatches,
    pageWarning:dom.error||null,pageScriptErrors:pageErrors.slice(0,6)};
  console.log('RENDER_PARITY '+JSON.stringify(report));
  if(report.status==='INCONCLUSIVE'){
    console.log('INCONCLUSIVE: no stable live provider-ID matches visible on selected date; no false pass recorded.');
  }
  await page.close();
}finally{await browser.close();}
if(!report)throw Error('Production browser did not produce a parity result');
await writeFile(out+'/parity.json',JSON.stringify(report,null,2));
const summary=[
  '## Production ARC XI LIVE score/display parity',
  '',
  'Read-only Chrome check against the real production website and public BSD LIVE source.',
  '',
  '| Metric | Value |',
  '|---|---|',
  ...Object.entries({status:report.status,datesInspected:report.datesInspected.join(', '),
    sourceLiveRows:report.liveProviderEnd,renderedRows:report.boardRows,
    compared:report.providerMatched,changedDuringWindow:report.changedDuringWindow,
    sourceNotDisplayed:report.sourceNotDisplayed}).map(([k,v])=>'| '+k+' | '+v+' |'),
  '',
  report.status==='INCONCLUSIVE'?
    'No stable provider-ID matches were visible on the sampled board dates. This is **not** a passing score parity observation.':
    report.status==='PASS'?'Stable LIVE event scores and badges matched the displayed schedule.':
    'Mismatch found. Inspect the attached parity.json artifact.',
  '',
  'This is a point-in-time check, not continuous score verification or full fixture coverage.'
].join('\n');
if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,summary+'\n');
if(report.status==='FAIL')process.exitCode=1;
