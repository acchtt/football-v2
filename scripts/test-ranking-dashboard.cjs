// Worker Airtable schedule contract: official C rank is sufficient for publication.
// Exercises the actual dashboardData with mock API responses; no network writes.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
let source=fs.readFileSync('backend/cloudflare-worker/src/dashboard-entry.js','utf8');
source=source.replace(/^import app from .*;\s*/,'const app = {fetch: async () => new Response(null,{status:404})};\n')
  .replace('export default {','const workerHandler = {');
if(/\bexport default\b|^import /m.test(source))throw Error('Worker module extraction changed');
const now=Date.now(),kickoff=new Date(now+2*3600000).toISOString();
const row=(id,match,tier,state,rank)=>({
 id,createdTime:new Date(now-3*3600000).toISOString(),
 fields:{'Coverage ID':id,'Slate Date':new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(kickoff)),
  Match:match,Competition:'Test Competition','Kickoff ICT':kickoff,
  'Screened At':new Date(now-3600000).toISOString(),
  'Board Tier':tier,'C Board State':state,'C Rank':rank}
});
const focus=row('recFocus','Ranked Home vs Ranked Away','UNRESOLVED','C-FOCUS',1);
const watch=row('recWatch','Ranked Ajax vs Ranked NEC',null,'C-WATCH',2);
const pass=row('recPass','Ranked Three vs Ranked Four','PASS','C-PASS',3);
const legacy=row('recLegacy','Legacy Home vs Legacy Away','WATCHLIST',null,null);
const excluded=row('recExcluded','Unranked Home vs Unranked Away','UNRESOLVED',null,null);
const calls=[];
const fetch=async input=>{
 const url=new URL(input);calls.push(url);
 const ranked=url.searchParams.get('filterByFormula')?.startsWith('AND(AND({C Rank}>0');
 const table=url.pathname.split('/').at(-1);
 const rows=table==='tbl20jBW5dfgNnTV6'?
   (ranked?[focus,watch,pass]:[focus,legacy,excluded]):[];
 return {ok:true,json:async()=>({records:rows})};
};
const context={fetch,Date,Intl,URL,Response,Headers,console};
vm.createContext(context);
vm.runInContext(source+'\nglobalThis.workerTest={dashboardData,officialTier};',context,{filename:'dashboard-entry.js'});
(async()=>{
 const body=await context.workerTest.dashboardData({AIRTABLE_TOKEN:'unit-token'});
 const fixtures=body.schedule.map(x=>x.match);
 assert.equal(fixtures.length,4,'Ranked fixtures and legacy display tiers must both publish');
 assert(fixtures.includes(focus.fields.Match),'C-FOCUS rank missing when Board Tier unresolved');
 assert(fixtures.includes(watch.fields.Match),'C-WATCH rank missing when Board Tier blank');
 assert(fixtures.includes(pass.fields.Match),'Official PASS lane missing');
 assert(fixtures.includes(legacy.fields.Match),'Legacy WATCHLIST must remain visible');
 assert(!fixtures.includes(excluded.fields.Match),'Unranked/unresolved coverage is not schedule');
 assert.equal(body.schedule.find(x=>x.id==='recFocus').tier,'FOCUS');
 assert.equal(body.schedule.find(x=>x.id==='recWatch').tier,'WATCHLIST');
 assert.equal(body.schedule.find(x=>x.id==='recWatch').cRank,2);
 assert.equal(body.schedule.find(x=>x.id==='recPass').tier,'PASS');
 assert.equal(body.sync.sourceBaseId,'appbzxqXYf0lKfD4P');
 assert(calls.every(url=>url.pathname.includes('/appbzxqXYf0lKfD4P/')),
   'Every Airtable table read must come from Active Operations');
 assert.equal(body.sync.rankedSourceRecords,3);
 assert.equal(body.sync.rankedPublished,3);
 assert.equal(new Set(body.schedule.map(x=>x.id)).size,4,'Duplicate coverage and rank queries cannot duplicate fixtures');
 assert(calls.some(url=>url.pathname.endsWith('/tbl20jBW5dfgNnTV6')&&
   url.searchParams.get('filterByFormula')?.includes('C Rank')),
   'Worker must explicitly query official C ranking, not infer it from pick records');
 console.log('PASS rank->dashboard: C FOCUS/WATCH/PASS, legacy tiers, dedupe, unresolved excluded');
})().catch(error=>{console.error(error);process.exitCode=1;});
