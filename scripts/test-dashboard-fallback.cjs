// Deterministic browser-compatible dashboard outage tests. No external requests.
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('pages/config.js','utf8');
const store=new Map();
const native=async()=>{throw Error('simulated dashboard outage');};
const context={
  window:{fetch:native,setInterval:()=>0,addEventListener:()=>{}},
  document:{addEventListener:()=>{},visibilityState:'hidden',getElementById:()=>null},
  localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
  location:{href:'https://acchtt.github.io/football-v2/'},
  Response,Headers,AbortController,Request,URL,Date,Intl,console,
  setTimeout:()=>0,clearTimeout:()=>{},CustomEvent:class {}
};
vm.createContext(context);
vm.runInContext(source,context,{filename:'config.js'});
const endpoint='https://football-v2.acchtt.workers.dev/api/dashboard-data';
(async()=>{
  let response=await context.window.fetch(endpoint);
  assert.equal(response.status,503,'Cold-start dashboard failure must not look healthy');
  let payload=await response.json();
  assert.equal(payload.ok,false);
  assert.equal(payload.cached,false);
  assert.equal(payload.degraded,true);
  assert(Array.isArray(payload.schedule)&&payload.schedule.length===0);
  const lastConfirmed=Date.now()-360000;
  store.set('sliptrace.dashboard.compat.v4',JSON.stringify({
    ok:true,_arcxiConfirmedAt:lastConfirmed,
    schedule:[{id:'stored',match:'Arsenal vs Chelsea',kickoff:'2026-10-10T13:00:00Z'}],picks:[]
  }));
  response=await context.window.fetch(endpoint);
  assert.equal(response.status,200,'Known cache can preserve availability');
  payload=await response.json();
  assert.equal(payload.cached,true);
  assert.equal(payload.degraded,true);
  assert.equal(payload.cacheSource,'browser');
  assert(payload.staleAgeMs>=360000,'Browser cache age must be retained');
  assert.equal(payload.schedule.length,1);
  store.set('sliptrace.dashboard.compat.v4',JSON.stringify({
    ok:true,_arcxiConfirmedAt:Date.now()-7*3600000,
    schedule:[{id:'expired'}],picks:[]}));
  response=await context.window.fetch(endpoint);
  payload=await response.json();
  assert.equal(response.status,503,'Expired six-hour snapshot must fail closed');
  assert.equal(payload.ok,false);
  store.set('sliptrace.dashboard.compat.v4',JSON.stringify({
    ok:true,schedule:[{id:'old'}],picks:[]}));
  response=await context.window.fetch(endpoint);
  payload=await response.json();
  assert.equal(response.status,503,'Legacy cache without confirmed time must fail closed');
  assert.equal(payload.cached,false);
  console.log('PASS dashboard cold outage, recent fallback, expired cache and unknown age rejection');
})().catch(error=>{console.error(error);process.exitCode=1;});
