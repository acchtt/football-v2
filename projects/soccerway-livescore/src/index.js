const SOCCERWAY_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153.0.0.0 Safari/537.36",
  Accept: "*/*",
  "Accept-Language": "en-GB,en;q=0.9",
  Referer: "https://www.soccerway.com/",
  Origin: "https://www.soccerway.com",
  "x-fsign": "SW9D1eZo",
};

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store, max-age=0",
      ...headers,
    },
  });
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function unixIso(value) {
  const n = numberOrNull(value);
  if (n === null) return null;
  const d = new Date(n * 1000);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function deriveStatus(row) {
  const code = String(row.AB || "");
  const text = String(row.AC || row.AW || "").trim();
  if (code === "2") return { key: "live", text: text || "LIVE" };
  if (code === "3") return { key: "finished", text: text || "FT" };
  if (code === "1") return { key: "scheduled", text: text || "Scheduled" };
  const lower = text.toLowerCase();
  if (/half|live|period|extra time|pen/.test(lower)) return { key: "live", text };
  if (/finish|ended|full time|after penalties/.test(lower)) return { key: "finished", text };
  if (/postpon|cancel|abandon/.test(lower)) return { key: "interrupted", text };
  return { key: "other", text: text || code || "Unknown" };
}

function parseMinute(row) {
  const candidates = [row.BX, row.AC, row.AW];
  for (const value of candidates) {
    const m = String(value || "").match(/(\d{1,3})(?:\+(\d{1,2}))?\s*['’]?/);
    if (m) return m[2] ? `${m[1]}+${m[2]}` : m[1];
  }
  return null;
}

function parseFeed(raw) {
  const fixtures = [];
  let competition = {};
  let current = null;

  const flush = () => {
    if (!current?.AA || !current?.AE || !current?.AF) {
      current = null;
      return;
    }
    const status = deriveStatus(current);
    fixtures.push({
      matchId: current.AA,
      competition: current._competition?.ZA || "Unknown competition",
      competitionId: current._competition?.ZEE || current._competition?.ZC || "",
      region: current._competition?.ZY || "",
      kickoffTimestamp: numberOrNull(current.AD),
      kickoffUtcSource: unixIso(current.AD),
      homeTeam: current.AE,
      awayTeam: current.AF,
      homeScore: numberOrNull(current.AG),
      awayScore: numberOrNull(current.AH),
      status: status.key,
      statusText: status.text,
      minute: status.key === "live" ? parseMinute(current) : null,
      source: "Soccerway",
      rawStatusCode: String(current.AB || ""),
    });
    current = null;
  };

  for (let token of String(raw || "").split("¬")) {
    if (!token) continue;
    if (token.startsWith("~")) token = token.slice(1);
    const divider = token.indexOf("÷");
    if (divider < 0) continue;
    const key = token.slice(0, divider);
    const value = token.slice(divider + 1);

    if (key === "ZA") {
      flush();
      competition = { ZA: value };
      continue;
    }
    if (key.startsWith("Z")) {
      competition[key] = value;
      continue;
    }
    if (key === "AA") {
      flush();
      current = { AA: value, _competition: { ...competition } };
      continue;
    }
    if (current) current[key] = value;
  }
  flush();
  return fixtures;
}

function parseDay(url) {
  const raw = url.searchParams.get("day") ?? "0";
  const day = Number(raw);
  if (!Number.isInteger(day) || day < -7 || day > 7) return null;
  return day;
}

async function fetchSoccerway(day, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(`https://soccerway-livescore.local/feed/${day}`);
  const cached = await cache.match(cacheKey);
  if (cached) {
    return { body: await cached.text(), cached: true, status: 200 };
  }

  const upstreamUrl = `https://www.soccerway.com/x/feed/f_1_${day}_3_en_1`;
  const response = await fetch(upstreamUrl, {
    headers: SOCCERWAY_HEADERS,
    redirect: "follow",
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Soccerway HTTP ${response.status}: ${body.slice(0, 180)}`);
  }

  const cacheResponse = new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=1",
    },
  });
  ctx.waitUntil(cache.put(cacheKey, cacheResponse));
  return { body, cached: false, status: response.status };
}

async function fixturesApi(url, ctx) {
  const day = parseDay(url);
  if (day === null) return json({ ok: false, error: "day must be an integer from -7 to 7" }, 400);
  const view = url.searchParams.get("view") || "all";
  const upstream = await fetchSoccerway(day, ctx);
  let fixtures = parseFeed(upstream.body);

  if (view === "live") fixtures = fixtures.filter((f) => f.status === "live");
  else if (view === "finished") fixtures = fixtures.filter((f) => f.status === "finished");
  else if (view === "scheduled") fixtures = fixtures.filter((f) => f.status === "scheduled");

  return json({
    ok: true,
    source: "Soccerway",
    project: "soccerway-livescore",
    day,
    view,
    cached: upstream.cached,
    count: fixtures.length,
    liveCount: fixtures.filter((f) => f.status === "live").length,
    fixtures,
    generatedAt: new Date().toISOString(),
  });
}

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Soccerway Live</title>
<style>
:root{color-scheme:dark;--bg:#0b0d10;--card:#13171c;--line:#242b33;--text:#f5f7fa;--muted:#8f9aa6;--accent:#7cf58b;--live:#ff4d67;--chip:#1d242b}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif}.wrap{max-width:980px;margin:0 auto;padding:20px}.top{position:sticky;top:0;z-index:5;background:rgba(11,13,16,.96);backdrop-filter:blur(12px);padding:16px 0 12px}.title{display:flex;align-items:center;gap:10px;font-weight:800;font-size:26px}.dot{width:11px;height:11px;border-radius:50%;background:var(--live);box-shadow:0 0 18px var(--live)}.sub{color:var(--muted);font-size:13px;margin-top:3px}.controls{display:grid;grid-template-columns:auto auto auto 1fr auto;gap:8px;margin-top:14px}.controls button,.controls input{border:1px solid var(--line);background:var(--card);color:var(--text);border-radius:10px;padding:10px 12px;font:inherit}.controls button{cursor:pointer}.controls button.active{border-color:var(--accent);color:var(--accent)}.liveToggle{display:flex;align-items:center;gap:7px;border:1px solid var(--line);background:var(--card);border-radius:10px;padding:0 12px;font-size:14px}.meta{display:flex;justify-content:space-between;color:var(--muted);font-size:12px;margin:12px 2px}.league{margin:14px 0 0;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--card)}.leagueHead{padding:11px 14px;background:#11151a;color:#c8d0d8;font-size:13px;font-weight:750;border-bottom:1px solid var(--line)}.match{display:grid;grid-template-columns:74px 1fr 44px;gap:12px;align-items:center;padding:11px 14px;border-bottom:1px solid var(--line)}.match:last-child{border-bottom:0}.time{font-size:12px;color:var(--muted)}.status.live{color:var(--live);font-weight:800}.teams{min-width:0}.team{display:flex;justify-content:space-between;gap:12px;line-height:1.7}.name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.score{font-weight:800;font-variant-numeric:tabular-nums}.right{text-align:right}.matchId{font-size:10px;color:#56616d;margin-top:4px}.empty{padding:42px 16px;text-align:center;color:var(--muted)}@media(max-width:650px){.wrap{padding:12px}.controls{grid-template-columns:repeat(3,1fr)}.controls input{grid-column:1/-1}.liveToggle{grid-column:1/-1;height:42px}.match{grid-template-columns:60px 1fr 38px;padding:10px}.title{font-size:22px}}
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <div class="title"><span class="dot"></span>Soccerway Live</div>
    <div class="sub">Near-real-time mode · live scores poll every ~1 second</div>
    <div class="controls">
      <button data-day="-1">Yesterday</button>
      <button data-day="0" class="active">Today</button>
      <button data-day="1">Tomorrow</button>
      <input id="search" placeholder="Search team or competition" />
      <label class="liveToggle"><input id="liveOnly" type="checkbox" /> Live only</label>
    </div>
    <div class="meta"><span id="count">Loading…</span><span id="updated"></span></div>
  </div>
  <div id="list"></div>
</div>
<script>
let day=0,lastPayload=null,previousLiveIds=new Set(),liveTimer=null,fullTimer=null;
let liveBusy=false,fullBusy=false;
const LIVE_POLL_MS=1000,FULL_RESYNC_MS=15000;
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
function localTime(iso){if(!iso)return '—';const d=new Date(iso);return isNaN(d)?'—':d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});}
function statusText(f){if(f.status==='live')return f.minute?f.minute+"'":(f.statusText||'LIVE');if(f.status==='finished')return 'FT';return localTime(f.kickoffUtcSource);}
function render(){
  if(!lastPayload)return;
  const q=$('#search').value.trim().toLowerCase();
  const liveOnly=$('#liveOnly').checked;
  let rows=lastPayload.fixtures||[];
  if(liveOnly)rows=rows.filter(f=>f.status==='live');
  if(q)rows=rows.filter(f=>(f.homeTeam+' '+f.awayTeam+' '+f.competition).toLowerCase().includes(q));
  const groups=new Map();
  for(const f of rows){const key=f.competition||'Other';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(f);}
  $('#count').textContent=rows.length+' matches · '+(lastPayload.liveCount||0)+' live';
  $('#updated').textContent='Updated '+new Date(lastPayload.generatedAt).toLocaleTimeString();
  if(!rows.length){$('#list').innerHTML='<div class="empty">No matches found.</div>';return;}
  $('#list').innerHTML=[...groups.entries()].map(([league,items])=>'<section class="league"><div class="leagueHead">'+esc(league)+'</div>'+items.map(f=>{
    const scoreA=f.homeScore==null?'':f.homeScore,scoreB=f.awayScore==null?'':f.awayScore;
    return '<div class="match"><div><div class="time '+(f.status==='live'?'status live':'')+'">'+esc(statusText(f))+'</div></div><div class="teams"><div class="team"><span class="name">'+esc(f.homeTeam)+'</span><span class="score">'+esc(scoreA)+'</span></div><div class="team"><span class="name">'+esc(f.awayTeam)+'</span><span class="score">'+esc(scoreB)+'</span></div><div class="matchId">'+esc(f.matchId)+'</div></div><div class="right">'+(f.status==='live'?'<span class="status live">LIVE</span>':'')+'</div></div>';
  }).join('')+'</section>').join('');
}
function mergeLive(p){
  if(!lastPayload){lastPayload=p;render();return false;}
  const map=new Map((lastPayload.fixtures||[]).map(f=>[f.matchId,f]));
  const nextLiveIds=new Set();
  for(const live of p.fixtures||[]){
    nextLiveIds.add(live.matchId);
    const old=map.get(live.matchId);
    map.set(live.matchId,old?{...old,...live}:live);
  }
  let disappeared=false;
  for(const id of previousLiveIds){if(!nextLiveIds.has(id)){disappeared=true;break;}}
  previousLiveIds=nextLiveIds;
  lastPayload={...lastPayload,fixtures:[...map.values()],liveCount:p.liveCount,generatedAt:p.generatedAt};
  render();
  return disappeared;
}
async function loadFull(){
  if(fullBusy)return;
  fullBusy=true;
  try{
    const r=await fetch('/api/fixtures?day='+day,{cache:'no-store'});const p=await r.json();if(!p.ok)throw new Error(p.error||'Feed failed');
    lastPayload=p;previousLiveIds=new Set((p.fixtures||[]).filter(f=>f.status==='live').map(f=>f.matchId));render();
  }catch(e){$('#count').textContent='Feed error';$('#list').innerHTML='<div class="empty">'+esc(e.message)+'</div>';}
  finally{fullBusy=false;}
}
async function pollLive(){
  if(liveBusy){scheduleLive();return;}
  liveBusy=true;
  try{
    const r=await fetch('/api/live?day='+day,{cache:'no-store'});const p=await r.json();if(!p.ok)throw new Error(p.error||'Live feed failed');
    const disappeared=mergeLive(p);
    if(disappeared)loadFull();
  }catch(e){}
  finally{liveBusy=false;scheduleLive();}
}
function scheduleLive(){clearTimeout(liveTimer);liveTimer=setTimeout(pollLive,LIVE_POLL_MS);}
function scheduleFull(){clearInterval(fullTimer);fullTimer=setInterval(()=>{if(document.visibilityState==='visible')loadFull();},FULL_RESYNC_MS);}
function restart(){clearTimeout(liveTimer);clearInterval(fullTimer);previousLiveIds=new Set();loadFull().then(()=>pollLive());scheduleFull();}
document.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{day=Number(b.dataset.day);document.querySelectorAll('[data-day]').forEach(x=>x.classList.toggle('active',x===b));restart();});
$('#search').addEventListener('input',render);$('#liveOnly').addEventListener('change',render);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){loadFull();clearTimeout(liveTimer);pollLive();}});
restart();
</script>
</body></html>`;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,OPTIONS" } });
    try {
      if (request.method === "GET" && url.pathname === "/api/fixtures") return fixturesApi(url, ctx);
      if (request.method === "GET" && url.pathname === "/api/live") {
        url.searchParams.set("view", "live");
        return fixturesApi(url, ctx);
      }
      if (request.method === "GET" && url.pathname === "/api/health") return json({ ok: true, service: "soccerway-livescore", livePollTargetMs: 1000, edgeCacheSeconds: 1, generatedAt: new Date().toISOString() });
      if (request.method === "GET" && url.pathname === "/") return new Response(HTML, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" } });
      return json({ ok: false, error: "Not found" }, 404);
    } catch (error) {
      return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 502);
    }
  },
};
