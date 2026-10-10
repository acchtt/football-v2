// ARC XI production feed canary: public GET-only, no credentials or score writes.
// Checks actual deployed page and Worker responses, not mocked fixtures.
// Empty LIVE/event lists are valid. Never infer a match state from wall-clock time.
import { appendFile } from 'node:fs/promises';

const SITE = 'https://acchtt.github.io/football-v2/';
const API = 'https://football-v2.acchtt.workers.dev';
const ORIGIN = new URL(SITE).origin;
const MAX_BYTES = 4 * 1024 * 1024;
const attempts = 3;
const issues = [];
const warnings = [];
const results = [];

const ictDate = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(new Date());
  const v = kind => parts.find(x => x.type === kind)?.value || '';
  return [v('year'),v('month'),v('day')].join('-');
};
const pause = ms => new Promise(done => setTimeout(done,ms));
const isRecord = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const getRows = payload => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  for (const x of [payload?.data?.results,payload?.data?.events,payload?.data?.live,
    payload?.results,payload?.events,payload?.live]) if (Array.isArray(x)) return x;
  return null;
};
async function request(url,{api=false,json=true}={}){
  let last;
  for(let attempt=1;attempt<=attempts;attempt++){
    try{
      const response=await fetch(url,{
        signal:AbortSignal.timeout(14000),
        cache:'no-store',redirect:'follow',
        headers:{
          'Accept':json?'application/json':'text/html',
          ...(api?{'Origin':ORIGIN}:{})
        }
      });
      const contentLength=Number(response.headers.get('content-length')||0);
      if(contentLength>MAX_BYTES)throw Error('Oversized response: '+contentLength+' bytes');
      if(!response.ok)throw Error('HTTP '+response.status);
      if(api){
        const allowed=response.headers.get('access-control-allow-origin');
        if(allowed!==ORIGIN&&allowed!=='*'){
          throw Error('Missing production CORS permission for '+ORIGIN);
        }
      }
      const contentType=response.headers.get('content-type')||'';
      if(json&&!contentType.includes('json'))throw Error('Expected JSON, got '+contentType);
      const raw=await response.text();
      if(raw.length>MAX_BYTES)throw Error('Response exceeded 4MiB budget');
      const value=json?JSON.parse(raw):raw;
      if(json && value?.ok===false)throw Error('Source returned ok:false');
      return {value,status:response.status,latencyMs:0};
    }catch(error){
      last=error;
      if(attempt<attempts)await pause(attempt*1100);
    }
  }
  throw Error(last instanceof Error ? last.message : String(last));
}
async function check(name,task){
  try {
    const info=await task();
    results.push({name,status:'PASS',...info});
    console.log('PASS '+name+' '+JSON.stringify(info));
    return info;
  } catch(error){
    const message=error instanceof Error?error.message:String(error);
    issues.push(name+': '+message);
    results.push({name,status:'FAIL',error:message});
    console.error('FAIL '+name+' '+message);
    return null;
  }
}
const timeZoneDate=ictDate();
const page=await check('deployed page',async()=>{
  const {value:html}=await request(SITE,{json:false});
  if(!html.includes('app-v2.js?v=68'))throw Error('Expected live-score repair app asset is not deployed');
  if(!html.includes('config.js?v=14'))throw Error('Expected runtime guard is not deployed');
  if(html.includes('matchday-behavior.js?v=3') || html.includes('status-sync.js?v=4')){
    throw Error('Legacy synthetic clock or DOM updater is still loaded');
  }
  const script=await request(new URL('app-v2.js?v=68',SITE).href,{json:false});
  if(!script.value.includes('boardLiveSignature()'))throw Error('Provider-owned score renderer missing');
  return {asset:'app-v2.js?v=68',bytes:script.value.length};
});
const dashboard=await check('public dashboard',async()=>{
  const {value}=await request(API+'/api/dashboard-data',{api:true});
  if(!isRecord(value)||!Array.isArray(value.schedule)||!Array.isArray(value.picks)){
    throw Error('Invalid board structure (requires schedule[] and picks[])');
  }
  if(value.cached===true||value.degraded===true){
    const age=Number(value.staleAgeMs);
    warnings.push('Dashboard using '+(value.cacheSource||'cached')+
      ' data'+(Number.isFinite(age)?' ('+Math.round(age/1000)+'s old)':''));
    if(!Number.isFinite(age)||age<0)throw Error('Degraded dashboard has no verifiable freshness age');
    if(age>300000)throw Error('Dashboard stale for more than five minutes');
  }
  return {schedule:value.schedule.length,picks:value.picks.length,
    cached:value.cached===true,degraded:value.degraded===true,
    cacheSource:value.cacheSource||'not specified'};
});
const live=await check('public BSD live',async()=>{
  const {value}=await request(API+'/api/bsd/live',{api:true});
  const rows=getRows(value);
  if(!rows)throw Error('Expected an array at data.results or equivalent');
  if(rows.some(x=>!isRecord(x)))throw Error('Live list contains invalid events');
  // 0 live matches is a healthy response; do not manufacture game expectations.
  return {activeEvents:rows.length,emptyIsNormal:rows.length===0};
});
await check('public BSD day-feed',async()=>{
  const params=new URLSearchParams({date_from:timeZoneDate,date_to:timeZoneDate,limit:'100'});
  const {value}=await request(API+'/api/bsd/events?'+params.toString(),{api:true});
  const rows=getRows(value);
  if(!rows)throw Error('Expected an event array at data.results or equivalent');
  if(rows.some(x=>!isRecord(x)))throw Error('Day feed contains invalid event');
  return {dateICT:timeZoneDate,sampleEvents:rows.length,limit:100,
    note:'This is a source sample, not exhaustive ICT fixture coverage'};
});
const summary = [
  '## ARC XI production feed health — '+new Date().toISOString(),
  '',
  'Read-only checks of public production endpoints. No bets, scores or fixture records were changed.',
  '',
  '| Check | Result |',
  '|---|---|',
  ...results.map(x=>'| '+x.name+' | '+x.status+
    (x.status==='FAIL'?' ('+x.error.replace(/\|/g,'/')+')':'')+' |'),
  '',
  '### Source warnings',
  warnings.length?warnings.map(s=>'- '+s).join('\n'):'No degraded/cache warnings detected.',
  '',
  '**Reminder:** An empty LIVE list is normal. This canary validates endpoint availability and shape; it cannot prove match-by-match score accuracy or detect outages between checks.',
  ''
].join('\n');
if(process.env.GITHUB_STEP_SUMMARY){
  await appendFile(process.env.GITHUB_STEP_SUMMARY,summary+'\n');
}
if(issues.length) {
  console.error('CANARY FAILED: '+issues.join('; '));
  process.exitCode=1;
} else {
  console.log('CANARY PASSED: all endpoints responded with valid read-only public data; '+warnings.length+' warnings');
}
