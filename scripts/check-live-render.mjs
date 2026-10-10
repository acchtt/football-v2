// Read-only production Chrome observation. Compares stable BSD LIVE event IDs to
// the rendered ARC XI schedule; never edits matches, scores or model records.
import puppeteer from '/tmp/arcxi-browser/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js';
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
  .find(p=>{try{return !!(process.env.CHROME_BIN===p || requireFile(p));}catch{return false;}});
function requireFile(file){
  // Node in Actions always provides a chrome executable at one of these paths.
  return Boolean((awaitImportPath(file)));
}
function awaitImportPath(file){return file;}
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
  const dom=await page.evaluate(()=>({
    date:document.querySelector('.dateBtn[aria-pressed="true"]')?.dataset.date||null,
    error:document.querySelector('.statusBanner')?.innerText||'',
    boardRows:document.querySelectorAll('.scheduleMatchCard').length,
    fixtures:[...document.querySelectorAll('.scheduleMatchCard .scheduleFixture[data-live-event]')].map(n=>({
      id:n.dataset.liveEvent||'',
      score:n.closest('.scheduleMatchCard')?.querySelector('.scheduleScore strong')?.textContent?.trim()||'',
      status:n.closest('.scheduleMatchCard')?.querySelector('.fixtureStatus')?.textContent?.trim()||''
    }))
  }));
  const after=await getProvider();
  const parity=compareStableLive(before,after,dom.fixtures);
  report={time:new Date().toISOString(),status:parity.status,selectedDateICT:dom.date,
    liveProviderStart:providerRows(before).length,liveProviderEnd:providerRows(after).length,
    boardRows:dom.boardRows,providerMatched:parity.compared,
    stableProviderRows:parity.stableProviderRows,
    changedDuringWindow:parity.unstable.length,
    sourceNotDisplayed:parity.notShownCount,
    duplicateIds:parity.duplicateIds,
    mismatches:parity.mismatches,
    pageWarning:dom.error||null,pageScriptErrors:pageErrors.slice(0,6)};
  await page.screenshot({path:out+'/production-board.png',fullPage:true});
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
  ...Object.entries({status:report.status,sourceLiveRows:report.liveProviderEnd,renderedRows:report.boardRows,
    compared:report.providerMatched,changedDuringWindow:report.changedDuringWindow,
    sourceNotDisplayed:report.sourceNotDisplayed}).map(([k,v])=>'| '+k+' | '+v+' |'),
  '',
  report.status==='INCONCLUSIVE'?
    'No stable provider-ID matches were visible. This is **not** a passing score parity observation.':
    report.status==='PASS'?'Stable LIVE event scores and badges matched the displayed schedule.':
    'Mismatch found. Inspect the attached parity.json artifact.',
  '',
  'This is a point-in-time check, not continuous score verification or full fixture coverage.'
].join('\n');
if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,summary+'\n');
if(report.status==='FAIL')process.exitCode=1;
