// Read-only reconciliation of the public dashboard with the Google Sheets projection.
const API='https://football-v2.acchtt.workers.dev';
const FEED_SCHEMA='football-v2-public-board-feed-v1';
const PROJECTION_POLICY='PUBLIC_SAFE_GOOGLE_SHEETS_V1';

const res=await fetch(API+'/api/dashboard-data?source_check='+Date.now(),{
  headers:{Origin:'https://acchtt.github.io',Accept:'application/json'},
  cache:'no-store',signal:AbortSignal.timeout(16000)
});
if(!res.ok){
  const message='Dashboard HTTP '+res.status;
  if(process.env.REQUIRE_GOOGLE_SHEETS_PROJECTION==='1')throw Error(message);
  console.warn('OBSERVATION: '+message+' before the projection Worker is deployed');
  process.exit(0);
}
const data=await res.json();
if(!data.ok||!Array.isArray(data.schedule)||!Array.isArray(data.picks))
  throw Error('Invalid dashboard');

const active=
  data.backendMode==='google-sheets-public-projection' &&
  data.sync?.sourceStore==='GOOGLE_SHEETS' &&
  data.sync?.projectionSchema===FEED_SCHEMA &&
  data.sync?.projectionPolicy===PROJECTION_POLICY;

const invalidTier=data.schedule.filter(row=>!['FOCUS','WATCHLIST','QUALIFIED','PASS'].includes(String(row.tier||'')));
const c2Leak=data.schedule.filter(row=>
  Object.prototype.hasOwnProperty.call(row,'c2Rank') ||
  Object.prototype.hasOwnProperty.call(row,'c2BoardState') ||
  Object.prototype.hasOwnProperty.call(row,'c2SupportedLine')
);

console.log('RANKING_FEED '+JSON.stringify({
  backendMode:data.backendMode||'unverified/legacy',
  sourceStore:data.sync?.sourceStore||'unverified/legacy',
  projectionSchema:data.sync?.projectionSchema||null,
  projectionPolicy:data.sync?.projectionPolicy||null,
  activeSource:active,
  scheduleCount:data.schedule.length,
  picksCount:data.picks.length,
  rankedPublished:data.sync?.rankedPublished,
  qualifiedDisplayed:data.sync?.qualifiedDisplayed,
  stopDisplayed:data.sync?.stopDisplayed,
  invalidTierCount:invalidTier.length,
  retiredC2LeakCount:c2Leak.length
}));

if(invalidTier.length)throw Error('Dashboard contains invalid display tiers');
if(c2Leak.length)throw Error('Retired C2 fields leaked into public projection');

if(process.env.REQUIRE_GOOGLE_SHEETS_PROJECTION==='1'){
  if(!active)throw Error('Worker is not serving the Google Sheets public projection');
  console.log('PASS Google Sheets projection matches website public Worker contract');
}else if(!active){
  console.warn('OBSERVATION: production Worker has not yet deployed the Google Sheets projection');
}
