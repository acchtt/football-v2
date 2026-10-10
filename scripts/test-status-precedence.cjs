// Canonical live/day normalization must not promote stopped events from stale clocks.
'use strict';
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const src=fs.readFileSync('pages/canonical-live-source.js','utf8');
const annotated=src.replace(/\}\)\(\);\s*$/, 'window.__canonicalTest={normalizedStatus};})();');
if(annotated===src)throw Error('Canonical script export point changed');
const ctx={window:{fetch:async()=>new Response('{}',{status:200})},URL,Response,Headers,Date,
  location:{href:'https://acchtt.github.io/football-v2/'},console};
vm.createContext(ctx);
vm.runInContext(annotated,ctx,{filename:'canonical-live-source.js'});
const status=ctx.window.__canonicalTest.normalizedStatus;
assert.equal(status({status:'live',time:{status:'suspended',period:'first_half'}}),'stopped');
assert.equal(status({status:'inprogress',time:{status:'abandoned',period:'second_half'}}),'stopped');
assert.equal(status({status:'finished',time:{period:'second_half'}}),'finished');
assert.equal(status({status:'inprogress',time:{period:'ht'}}),'live');
assert.equal(status({status:'postponed',time:{period:'first_half'}}),'stopped');
assert.equal(status({status:'finished',time:{status:'suspended',period:'ft'}}),'stopped',
  'Explicit suspension must override contradictory FT marker');
assert.equal(status({status:'cancelled',time:{status:'finished',period:'ft'}}),'stopped',
  'Cancelled match must not enter confirmed final lane');
assert.equal(status({status:'upcoming',time:{period:'second_half'}}),'upcoming',
  'Scheduled match must not be made live by leftover second-half period');
assert.equal(status({status:'scheduled',time:{period:'ft'}}),'upcoming',
  'Scheduled match must not become FT from stale period');
assert.equal(status({time:{period:'ht'}}),'live');
assert.equal(status({time:{period:'ft'}}),'finished');

console.log('PASS canonical: stopped precedence, confirmed FT and half-time lifecycle');
