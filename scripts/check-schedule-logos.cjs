// Run with: node scripts/check-schedule-logos.cjs
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('pages/schedule-logos.js', 'utf8');
let calls = 0;
const storage = {getItem:()=>null, setItem:()=>{}};
const context = {window:{},localStorage:storage,AbortController,setTimeout,clearTimeout,console,
  fetch:async url => {calls++; return {ok:true,json:async()=>({data:{results:url.includes('/leagues?') ? [
    {id:10,name:'Premier Division',country:'Exampleland'},
    {id:11,name:'Second Division',country:'Exampleland'}
  ] : [
    {id:1,name:'Example United U19',short_name:'Example United'},
    {id:2,name:'Example United'}
  ]}})};}};
vm.createContext(context);
vm.runInContext(source.slice(0,source.indexOf("  const root = document.getElementById('app');")) +
  'window.test={selectEntity,resolveLogo};})();',context);
const {selectEntity,resolveLogo} = context.window.test;
assert.equal(selectEntity([{id:1,name:'Bosnia & Herzegovina'},{id:2,name:'Bosnia & Herzegovina U21'}], 'Bosnia and Herzegovina').id,1);
assert.equal(selectEntity([{id:1,name:'FK Dukla Praha B'},{id:2,name:'Dukla Praha'}], 'FK Dukla Praha').id,2);
assert.equal(selectEntity([{id:1,name:'Sweden Women'}], 'Sweden'),null);
assert.equal(selectEntity([{id:1,name:'France U19',short_name:'France'}], 'France'),null);
assert.equal(selectEntity([{id:1,name:'United'},{id:2,name:'United'}], 'United'),null);
assert.equal(selectEntity([{id:'../../invalid',name:'United'}], 'United'),null);
assert.equal(selectEntity([{id:1,name:'Premier League',country:'England',is_women:true}], 'England Premier League','competition'),null);
(async () => {
  const names = ['Belgium','Türkiye','Bosnia and Herzegovina','Sweden','Faroe Islands','Slovakia','Poland','Romania','France','Italy','FK Dukla Praha','FK Jablonec','Helmond Sport','Heracles Almelo'];
  for (const name of names) {
    const path = await resolveLogo('team',name);
    assert(path.startsWith('./media/football/'),name);
    assert(fs.statSync('pages/'+path.slice(2)).size > 0,name);
  }
  for (const name of ['UEFA Nations League','Czech Cup','Netherlands Eerste Divisie']) {
    const path = await resolveLogo('competition',name);
    assert(fs.statSync('pages/'+path.slice(2)).size > 0,name);
  }
  assert.equal(calls,0,'current badges must work even when both score feeds fail');
  const results = await Promise.all([resolveLogo('team','Example United'),resolveLogo('team','Example United')]);
  assert(results.every(url=>url.includes('/team/2/')),'must resolve senior team, not U19 short name');
  assert.equal(calls,1,'duplicate lookups must share one request');
  await resolveLogo('team','Example United');
  assert.equal(calls,1,'resolved metadata must be reused');
  const leagues = await Promise.all([resolveLogo('competition','Exampleland Premier Division'),resolveLogo('competition','Exampleland Second Division')]);
  assert(leagues[0].includes('/league/10/') && leagues[1].includes('/league/11/'));
  assert.equal(calls,2,'competitions must share the working unfiltered collection lookup');
  console.log('Schedule logos: local coverage, strict identity, ambiguity and shared lookup checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
