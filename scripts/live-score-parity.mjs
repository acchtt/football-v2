// Pure read-only ARC XI live-score parity comparator.
// Match solely by stable BSD event ID; never fuzzy-match team names.
// Ignore source changes during the observation window rather than inventing lag.
export function parseScore(value){
  const hit=String(value||'').trim().match(/^(\d{1,2})\s*[–-]\s*(\d{1,2})$/);
  return hit ? hit[1]+'–'+hit[2] : null;
}
export function providerRows(payload){
  const rows=Array.isArray(payload?.data?.results)?payload.data.results:
    Array.isArray(payload?.data?.events)?payload.data.events:
    Array.isArray(payload?.results)?payload.results:
    Array.isArray(payload?.events)?payload.events:null;
  if(!rows)throw Error('BSD live endpoint did not return an array');
  return rows;
}
const num=v=>v!==null&&v!==undefined&&v!==''&&Number.isSafeInteger(Number(v))?
  Number(v):null;
export function snapshotProvider(payload){
  const result=new Map();
  for(const event of providerRows(payload)){
    if(!event||typeof event!=='object')continue;
    const id=num(event.id??event.event_id);
    if(id===null||id<=0)continue;
    const nested=event.score||{};
    const home=num(event.home_score??nested.home??nested.home_score);
    const away=num(event.away_score??nested.away??nested.away_score);
    if(home===null||away===null||home<0||away<0||home>99||away>99)continue;
    result.set(String(id),{id:String(id),score:home+'–'+away});
  }
  return result;
}
export function compareStableLive(beforePayload,afterPayload,dom){
  const before=snapshotProvider(beforePayload),after=snapshotProvider(afterPayload);
  const rows=(Array.isArray(dom)?dom:[]).filter(row=>row&&/^[1-9]\d*$/.test(String(row.id||'')));
  const duplicateIds=rows.map(x=>String(x.id)).filter((id,i,ids)=>ids.indexOf(id)!==i);
  const byId=new Map(rows.map(x=>[String(x.id),x]));
  const matched=[],unstable=[],mismatches=[],notShown=[];
  for(const [id,start] of before){
    const end=after.get(id);
    if(!end)continue; // Ended or removed from LIVE: not evidence of an FT bug.
    const visible=byId.get(id);
    if(!visible){notShown.push(id);continue;}
    if(start.score!==end.score){unstable.push({id,before:start.score,after:end.score});continue;}
    const observed=parseScore(visible.score);
    const comparison={id,provider:end.score,display:visible.score||'',status:String(visible.status||'').trim()};
    matched.push(comparison);
    if(observed!==end.score||comparison.status!=='LIVE'){
      mismatches.push(comparison);
    }
  }
  // No comparable DOM-ID match is not a pass. It is explicitly inconclusive.
  return {status:mismatches.length||duplicateIds.length?'FAIL':matched.length?'PASS':'INCONCLUSIVE',
    compared:matched.length,stableProviderRows:[...before.keys()].filter(id=>after.has(id)).length,
    displayRows:rows.length,unstable,notShownCount:notShown.length,
    mismatches,duplicateIds:[...new Set(duplicateIds)]};
}
