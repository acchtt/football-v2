// Read-only public dashboard / active Airtable source reconciliation.
// In PR verification the old production Worker may still serve legacy data;
// set REQUIRE_ACTIVE_BASE=1 only after deploying the new Worker.
const API='https://football-v2.acchtt.workers.dev';
const ACTIVE_BASE='appbzxqXYf0lKfD4P';
const currentBoard={
  'Gwangju FC vs Ulsan HD':{rank:1,tier:'FOCUS'},
  'Suwon Samsung Bluewings vs Ansan Greeners':{rank:2,tier:'FOCUS'},
  'JEF United Chiba vs V-Varen Nagasaki':{rank:3,tier:'WATCHLIST'},
  'Montedio Yamagata vs Vegalta Sendai':{rank:4,tier:'WATCHLIST'}
};
const res=await fetch(API+'/api/dashboard-data?source_check='+Date.now(),{
  headers:{Origin:'https://acchtt.github.io',Accept:'application/json'},
  cache:'no-store',signal:AbortSignal.timeout(16000)
});
if(!res.ok)throw Error('Dashboard HTTP '+res.status);
const data=await res.json();
if(!data.ok||!Array.isArray(data.schedule))throw Error('Invalid dashboard');
const active=data.sync?.sourceBaseId===ACTIVE_BASE;
const rows=new Map(data.schedule.map(row=>[row.match,row]));
const missing=Object.keys(currentBoard).filter(name=>!rows.has(name));
const mismatch=Object.entries(currentBoard).flatMap(([name,expected])=>{
  const row=rows.get(name);
  return row&&((row.cRank!==expected.rank)||(row.tier!==expected.tier)) ?
    [{match:name,receivedRank:row.cRank,receivedTier:row.tier,expected}]:[];
});
console.log('RANKING_FEED '+JSON.stringify({
  sourceBaseId:data.sync?.sourceBaseId||'unverified/legacy',
  expectedActiveBase:ACTIVE_BASE,activeSource:active,
  scheduleCount:data.schedule.length,picksCount:data.picks?.length,
  currentBoardPresent:4-missing.length,missing,mismatch,
  rankedPublished:data.sync?.rankedPublished,
  missingRankedCount:data.sync?.missingRankedCount
}));
if(data.sync?.missingRankedCount>0)
  throw Error('Worker lost '+data.sync.missingRankedCount+' ranked fixture(s)');
if(process.env.REQUIRE_ACTIVE_BASE==='1'){
  if(!active)throw Error('Worker still serves wrong Airtable base');
  if(missing.length||mismatch.length)throw Error('Latest ranked board not fully published');
  console.log('PASS active Airtable ranking matches website public Worker');
}else if(!active){
  console.warn('OBSERVATION: production Worker is not yet deployed with Active Operations source');
}else if(missing.length||mismatch.length){
  throw Error('Active Worker does not include expected ranked fixtures');
}
