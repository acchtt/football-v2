import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseScore,snapshotProvider,compareStableLive,providerRows} from './live-score-parity.mjs';
const live=(rows)=>({ok:true,data:{results:rows}});
const e=(id,home,away)=>({id,home_score:home,away_score:away,status:'inprogress'});
test('normalize en dash, refuse unavailable and partial scores',()=>{
 assert.equal(parseScore('1–2'),'1–2');assert.equal(parseScore('1-2'),'1–2');
 assert.equal(parseScore('VS'),null);assert.equal(parseScore('—'),null);
 assert.equal(snapshotProvider(live([e(5,0,0)])).get('5').score,'0–0');
 assert.equal(snapshotProvider(live([{id:6,home_score:null,away_score:0}])).size,0);
});
test('stable, same-ID displayed live scores pass',()=>{
 const v=live([e(51,1,0)]);
 const c=compareStableLive(v,v,[{id:'51',score:'1–0',status:'LIVE'}]);
 assert.equal(c.status,'PASS');assert.equal(c.compared,1);assert.equal(c.mismatches.length,0);
});
test('stale displayed score fails only when source is stable',()=>{
 const p=live([e(51,1,0)]);
 const c=compareStableLive(p,p,[{id:'51',score:'0–0',status:'LIVE'}]);
 assert.equal(c.status,'FAIL');assert.equal(c.mismatches.length,1);
});
test('displayed PRE while source live is a valid failure',()=>{
 const p=live([e(51,1,0)]);
 assert.equal(compareStableLive(p,p,[{id:'51',score:'1–0',status:'PRE'}]).status,'FAIL');
});
test('changes between provider samples are excluded',()=>{
 const before=live([e(51,1,0)]),after=live([e(51,1,1)]);
 const c=compareStableLive(before,after,[{id:'51',score:'1–0',status:'LIVE'}]);
 assert.equal(c.status,'INCONCLUSIVE');assert.equal(c.unstable.length,1);
});
test('no eligible rendered matches is inconclusive, never a pass',()=>{
 const p=live([e(51,1,0)]);
 const c=compareStableLive(p,p,[{id:'52',score:'1–0',status:'LIVE'}]);
 assert.equal(c.status,'INCONCLUSIVE');assert.equal(c.notShownCount,1);
});
test('no active fixtures is a normal inconclusive observation',()=>{
 const c=compareStableLive(live([]),live([]),[]);
 assert.equal(c.status,'INCONCLUSIVE');assert.equal(c.mismatches.length,0);
});
test('duplicate rendered ID is a failure',()=>{
 const p=live([e(51,1,0)]);
 const c=compareStableLive(p,p,[{id:'51',score:'1–0',status:'LIVE'},{id:'51',score:'1–0',status:'LIVE'}]);
 assert.equal(c.status,'FAIL');assert.deepEqual(c.duplicateIds,['51']);
});
test('invalid source shape fails closed',()=>{
 assert.throws(()=>providerRows({ok:true,data:{results:null}}),/did not return an array/);
});
