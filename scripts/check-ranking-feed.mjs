// Read-only production board/ranking reconciliation. Public dashboard only.
const BASE='https://football-v2.acchtt.workers.dev';
const expected20261011=[
  'Real Madrid vs Villarreal',
  'Ajax vs NEC Nijmegen',
  'Paris Saint-Germain vs Le Mans FC',
  'KRC Genk vs KV Kortrijk',
  'FC Lorient vs Paris FC',
  'Napoli vs Frosinone',
  'AS Monaco vs Toulouse FC',
  'Stade Brestois vs Angers SCO',
  'Zulte Waregem vs KAA Gent'
];
const response=await fetch(BASE+'/api/dashboard-data?rank_diag='+Date.now(),{
  headers:{Origin:'https://acchtt.github.io',Accept:'application/json'},
  cache:'no-store',signal:AbortSignal.timeout(15000)
});
if(!response.ok)throw Error('Dashboard HTTP '+response.status);
const data=await response.json();
if(!data?.ok||!Array.isArray(data.schedule))throw Error('No valid ranking schedule');
const names=new Set(data.schedule.map(row=>String(row.match||'').trim()));
const matched=expected20261011.filter(name=>names.has(name));
const missing=expected20261011.filter(name=>!names.has(name));
const byDay={};
for(const row of data.schedule)byDay[row.slateDate]=(byDay[row.slateDate]||0)+1;
const diagnostic={schedule:data.schedule.length,ranked20261011:matched.length,
  missing20261011:missing,byDay,backendMode:data.backendMode,
  sync:data.sync||null};
console.log('RANKING_FEED '+JSON.stringify(diagnostic));
if(data.sync?.missingRankedCount>0){
  throw Error('Worker dropped '+data.sync.missingRankedCount+' official ranked fixture(s): '+
    JSON.stringify(data.sync.missingRankedKeys||[]));
}
// The pinned 11 October reconciliation is observational before new Worker deploy.
// Keep it visible in PR checks without pretending the old Worker passed it.
if(missing.length)console.warn('RANKING_DRIFT: historical Airtable ranked fixtures absent from production feed');
else console.log('PASS October 11 Airtable ranking snapshot is represented in production dashboard');
