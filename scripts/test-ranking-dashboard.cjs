// Public dashboard projection contract: Google Sheets is the private source of truth,
// and only safe schedule/pick fields are exposed through the GitHub Pages feed.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

let source=fs.readFileSync('backend/cloudflare-worker/src/dashboard-entry.js','utf8');
source=source
  .replace(/^import app from .*;\s*/,'const app = {fetch: async () => new Response(null,{status:404})};\n')
  .replace('export default {','const workerHandler = {')
  .replace(/export \{[^}]+\};?\s*$/m,'');
if(/\bexport default\b|^import /m.test(source))throw Error('Worker module extraction changed');

const now=Date.now();
const kickoff=new Date(now+2*3600000).toISOString();
const slateDate=new Intl.DateTimeFormat('en-CA',{
  timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'
}).format(new Date(kickoff));

const feed={
  schemaVersion:'football-v2-public-board-feed-v1',
  sourceStore:'GOOGLE_SHEETS',
  sourceWorkbook:'Football v2 — Active Operations',
  projectionPolicy:'PUBLIC_SAFE_GOOGLE_SHEETS_V1',
  generatedAt:new Date(now-1000).toISOString(),
  schedule:[
    {
      id:'cov-follow',sourceCoverageId:'cov-follow',boardId:'RUN-A',slateDate,
      match:'Follow Home – Follow Away',competition:'Test Competition',kickoff,
      followLane:'FOLLOW',tier:'PASS',cBoardState:'C-FOCUS',cRank:1,cSupportedLine:3.5,grade:'A'
    },
    {
      id:'cov-reserve',sourceCoverageId:'cov-reserve',boardId:'RUN-A',slateDate,
      match:'Reserve Home – Reserve Away',competition:'Test Competition',kickoff,
      followLane:'RESERVE',tier:'FOCUS',cBoardState:'C-FOCUS',cRank:2,cSupportedLine:2.5,grade:'B'
    },
    {
      id:'cov-unfollowed',sourceCoverageId:'cov-unfollowed',boardId:'RUN-A',slateDate,
      match:'Unfollowed Home – Unfollowed Away',competition:'Test Competition',kickoff,
      followLane:'FOCUS_UNFOLLOWED',tier:'PASS',cBoardState:'C-FOCUS',cRank:3,cSupportedLine:2.5,grade:'A'
    },
    {
      id:'cov-stop',sourceCoverageId:'cov-stop',boardId:'RUN-A',slateDate,
      match:'Stop Home – Stop Away',competition:'Test Competition',kickoff,
      followLane:'STOP',tier:'FOCUS',cBoardState:'C-WATCH',cRank:4,cSupportedLine:2.5,grade:'B'
    },
    {id:'bad',match:'Missing kickoff',tier:'FOCUS'}
  ],
  picks:[]
};
const calls=[];
const fetch=async input=>{
  calls.push(String(input));
  return {ok:true,status:200,json:async()=>feed};
};
const context={fetch,Date,Intl,URL,Response,Headers,console};
vm.createContext(context);
vm.runInContext(source+'\nglobalThis.workerTest={dashboardData,officialTier,validateFeed};',context,{filename:'dashboard-entry.js'});

(async()=>{
  const body=await context.workerTest.dashboardData({});
  const cached=await context.workerTest.dashboardData({});
  assert.equal(body.backendMode,'google-sheets-public-projection');
  assert.equal(cached.backendMode,'google-sheets-public-projection');
  assert.equal(body.sync.sourceStore,'GOOGLE_SHEETS');
  assert.equal(body.sync.projectionSchema,'football-v2-public-board-feed-v1');
  assert.equal(body.sync.projectionPolicy,'PUBLIC_SAFE_GOOGLE_SHEETS_V1');
  assert.equal(body.schedule.length,4,'Invalid projection rows must fail closed');
  assert.equal(body.schedule.find(x=>x.id==='cov-follow').tier,'FOCUS');
  assert.equal(body.schedule.find(x=>x.id==='cov-reserve').tier,'WATCHLIST');
  assert.equal(body.schedule.find(x=>x.id==='cov-unfollowed').tier,'QUALIFIED');
  assert.equal(body.schedule.find(x=>x.id==='cov-stop').tier,'PASS');
  assert.equal(body.sync.qualifiedDisplayed,1);
  assert.equal(body.sync.focusUnfollowedDisplayed,0);
  assert.equal(body.sync.stopDisplayed,1);
  assert.equal(body.sync.rankedPublished,4);
  assert.equal(body.schedule.find(x=>x.id==='cov-follow').cSupportedLine,3.5);
  assert(!('c2Rank' in body.schedule[0]),'Retired C2 data must not be republished');
  assert.equal(calls.length,1,'Fresh projection cache must collapse repeated dashboard reads to one source fetch');
  assert(calls[0].includes('/acchtt/football-v2/main/pages/data/board-feed.json'),'Dashboard must read the public-safe projection');

  assert.throws(
    ()=>context.workerTest.validateFeed({...feed,actualBets:[]}),
    /forbidden private field/
  );
  assert.throws(
    ()=>context.workerTest.validateFeed({...feed,sourceStore:'AIRTABLE'}),
    /Google Sheets/
  );
  assert.throws(
    ()=>context.workerTest.validateFeed({...feed,projectionPolicy:'UNVERIFIED'}),
    /public-safe Sheets policy/
  );

  console.log('PASS Google Sheets projection -> public dashboard: qualification/priority semantics preserved, workload lanes retained, C2 retired');
})().catch(error=>{console.error(error);process.exitCode=1;});
