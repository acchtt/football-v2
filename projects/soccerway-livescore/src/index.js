const SOCCERWAY_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153.0.0.0 Safari/537.36",
  Accept: "*/*",
  "Accept-Language": "en-GB,en;q=0.9",
  Referer: "https://www.soccerway.com/",
  Origin: "https://www.soccerway.com",
  "x-fsign": "SW9D1eZo",
};

const BOARD_ORIGIN = "https://football-v2.acchtt.workers.dev";
const ZONE = "Asia/Ho_Chi_Minh";

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

function dayKey(day) {
  const d = new Date(Date.now() + day * 86400000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (type) => parts.find((x) => x.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function normalizeTeam(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(fc|cf|afc|sc|ac|sk|fk|club|sv|cd|sd)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitMatch(match = "") {
  for (const separator of [/\s+vs\.?\s+/i, /\s+v\.?\s+/i, /\s+—\s+/, /\s+–\s+/, /\s+-\s+/]) {
    const parts = String(match).split(separator).map((x) => x.trim()).filter(Boolean);
    if (parts.length === 2) return { home: parts[0], away: parts[1] };
  }
  return { home: String(match), away: "" };
}

function nameScore(a, b) {
  const left = normalizeTeam(a);
  const right = normalizeTeam(b);
  if (!left || !right) return 0;
  if (left === right) return 6;
  if (left.includes(right) || right.includes(left)) return 4;
  const aTokens = new Set(left.split(" "));
  const bTokens = new Set(right.split(" "));
  let shared = 0;
  for (const token of aTokens) if (bTokens.has(token)) shared += 1;
  const overlap = shared / Math.max(aTokens.size, bTokens.size);
  return overlap >= 0.75 ? 4 : overlap >= 0.5 ? 3 : 0;
}

function fixtureScore(boardRow, fixture) {
  const teams = splitMatch(boardRow.match || "");
  const names = nameScore(teams.home, fixture.homeTeam) + nameScore(teams.away, fixture.awayTeam);
  if (names < 6) return -1;
  let score = names * 10;
  const boardTime = Date.parse(boardRow.displayKickoff || boardRow.kickoff || "");
  const fixtureTime = Number(fixture.kickoffTimestamp) * 1000;
  if (Number.isFinite(boardTime) && Number.isFinite(fixtureTime) && fixtureTime > 0) {
    const hours = Math.abs(boardTime - fixtureTime) / 3600000;
    if (hours <= 3) score += 8;
    else if (hours <= 12) score += 4;
    else if (hours <= 24) score += 1;
    else score -= 8;
  }
  return score;
}

function bestFixture(boardRow, fixtures, used) {
  let best = null;
  for (const fixture of fixtures) {
    if (used.has(fixture.matchId)) continue;
    const score = fixtureScore(boardRow, fixture);
    if (score < 0) continue;
    if (!best || score > best.score) best = { score, fixture };
  }
  if (best) used.add(best.fixture.matchId);
  return best?.fixture || null;
}

async function fetchSoccerway(day, ctx) {
  const cache = caches.default;
  const cacheKey = new Request(`https://soccerway-livescore.local/feed/${day}`);
  const cached = await cache.match(cacheKey);
  if (cached) return { body: await cached.text(), cached: true, status: 200 };

  const upstreamUrl = `https://www.soccerway.com/x/feed/f_1_${day}_3_en_1`;
  const response = await fetch(upstreamUrl, { headers: SOCCERWAY_HEADERS, redirect: "follow" });
  const body = await response.text();
  if (!response.ok) throw new Error(`Soccerway HTTP ${response.status}: ${body.slice(0, 180)}`);

  const cacheResponse = new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=1" },
  });
  ctx.waitUntil(cache.put(cacheKey, cacheResponse));
  return { body, cached: false, status: response.status };
}

async function fetchBoard() {
  const response = await fetch(`${BOARD_ORIGIN}/api/dashboard-data?t=${Date.now()}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) throw new Error(payload?.error || `Board HTTP ${response.status}`);
  return Array.isArray(payload.schedule) ? payload.schedule : [];
}

async function fixturesData(day, ctx, view = "all") {
  const upstream = await fetchSoccerway(day, ctx);
  let fixtures = parseFeed(upstream.body);
  if (view === "live") fixtures = fixtures.filter((f) => f.status === "live");
  else if (view === "finished") fixtures = fixtures.filter((f) => f.status === "finished");
  else if (view === "scheduled") fixtures = fixtures.filter((f) => f.status === "scheduled");
  return { upstream, fixtures };
}

async function fixturesApi(url, ctx) {
  const day = parseDay(url);
  if (day === null) return json({ ok: false, error: "day must be an integer from -7 to 7" }, 400);
  const view = url.searchParams.get("view") || "all";
  const { upstream, fixtures } = await fixturesData(day, ctx, view);
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

async function boardApi(url, ctx) {
  const day = parseDay(url);
  if (day === null) return json({ ok: false, error: "day must be an integer from -7 to 7" }, 400);
  const targetDate = dayKey(day);
  const [boardRows, soccerway] = await Promise.all([fetchBoard(), fixturesData(day, ctx, "all")]);
  const board = boardRows.filter((row) => ["FOCUS", "WATCHLIST"].includes(String(row.tier || "").toUpperCase()) && row.slateDate === targetDate);
  const used = new Set();

  const fixtures = board.map((row) => {
    const matched = bestFixture(row, soccerway.fixtures, used);
    const teams = splitMatch(row.match || "");
    const kickoff = row.displayKickoff || row.kickoff || null;
    const base = matched || {
      matchId: `board:${row.id}`,
      competition: row.competition || "",
      competitionId: "",
      region: "",
      kickoffTimestamp: kickoff ? Math.floor(Date.parse(kickoff) / 1000) : null,
      kickoffUtcSource: kickoff,
      homeTeam: teams.home,
      awayTeam: teams.away,
      homeScore: null,
      awayScore: null,
      status: "scheduled",
      statusText: "Scheduled",
      minute: null,
      source: "Board",
      rawStatusCode: "",
    };
    return {
      ...base,
      homeTeam: teams.home || base.homeTeam,
      awayTeam: teams.away || base.awayTeam,
      competition: row.competition || base.competition,
      boardId: row.id,
      boardMatch: row.match || "",
      boardKickoff: kickoff,
      tier: row.tier || "",
      grade: row.grade || "",
      structure: row.structure || "",
      matchedToSoccerway: Boolean(matched),
    };
  });

  return json({
    ok: true,
    source: "SlipTrace FOCUS/WATCHLIST + Soccerway",
    project: "soccerway-livescore",
    day,
    slateDate: targetDate,
    count: fixtures.length,
    focusCount: fixtures.filter((f) => f.tier === "FOCUS").length,
    watchlistCount: fixtures.filter((f) => f.tier === "WATCHLIST").length,
    liveCount: fixtures.filter((f) => f.status === "live").length,
    matchedCount: fixtures.filter((f) => f.matchedToSoccerway).length,
    fixtures,
    generatedAt: new Date().toISOString(),
  });
}

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Focus / Watchlist Live</title>
<style>
:root{color-scheme:dark;--bg:#0b0d10;--card:#13171c;--line:#242b33;--text:#f5f7fa;--muted:#8f9aa6;--accent:#7cf58b;--live:#ff4d67;--focus:#ff4d67;--watch:#48d8ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif}.wrap{max-width:980px;margin:0 auto;padding:20px}.top{position:sticky;top:0;z-index:5;background:rgba(11,13,16,.96);backdrop-filter:blur(12px);padding:16px 0 12px}.title{display:flex;align-items:center;gap:10px;font-weight:800;font-size:26px}.dot{width:11px;height:11px;border-radius:50%;background:var(--live);box-shadow:0 0 18px var(--live)}.sub{color:var(--muted);font-size:13px;margin-top:3px}.controls{display:grid;grid-template-columns:auto auto auto 1fr auto;gap:8px;margin-top:14px}.controls button,.controls input{border:1px solid var(--line);background:var(--card);color:var(--text);border-radius:10px;padding:10px 12px;font:inherit}.controls button{cursor:pointer}.controls button.active{border-color:var(--accent);color:var(--accent)}.liveToggle{display:flex;align-items:center;gap:7px;border:1px solid var(--line);background:var(--card);border-radius:10px;padding:0 12px;font-size:14px}.meta{display:flex;justify-content:space-between;color:var(--muted);font-size:12px;margin:12px 2px}.league{margin:14px 0 0;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--card)}.leagueHead{padding:11px 14px;background:#11151a;color:#c8d0d8;font-size:13px;font-weight:750;border-bottom:1px solid var(--line)}.match{display:grid;grid-template-columns:74px 1fr 120px;gap:12px;align-items:center;padding:11px 14px;border-bottom:1px solid var(--line)}.match:last-child{border-bottom:0}.time{font-size:12px;color:var(--muted)}.status.live{color:var(--live);font-weight:800}.teams{min-width:0}.team{display:flex;justify-content:space-between;gap:12px;line-height:1.7}.name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.score{font-weight:800;font-variant-numeric:tabular-nums}.right{text-align:right;display:flex;justify-content:flex-end;align-items:center;gap:7px}.tier{font-size:10px;font-weight:900;letter-spacing:.05em;border:1px solid var(--line);padding:4px 6px;border-radius:6px}.tier.focus{color:var(--focus);border-color:rgba(255,77,103,.45)}.tier.watchlist{color:var(--watch);border-color:rgba(72,216,255,.45)}.grade{font-size:11px;color:var(--muted)}.empty{padding:42px 16px;text-align:center;color:var(--muted)}@media(max-width:650px){.wrap{padding:12px}.controls{grid-template-columns:repeat(3,1fr)}.controls input{grid-column:1/-1}.liveToggle{grid-column:1/-1;height:42px}.match{grid-template-columns:60px 1fr 86px;padding:10px}.title{font-size:22px}.right{gap:4px}.grade{display:none}}
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <div class="title"><span class="dot"></span>Focus / Watchlist Live</div>
    <div class="sub">Only SlipTrace board matches · Soccerway scores poll every ~1 second</div>
    <div class="controls">
      <button data-day="-1">Yesterday</button>
      <button data-day="0" class="active">Today</button>
      <button data-day="1">Tomorrow</button>
      <input id="search" placeholder="Search board match or competition" />
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
function statusText(f){if(f.status==='live')return f.minute?f.minute+"'":(f.statusText||'LIVE');if(f.status==='finished')return 'FT';return localTime(f.boardKickoff||f.kickoffUtcSource);}
function render(){
  if(!lastPayload)return;
  const q=$('#search').value.trim().toLowerCase();
  const liveOnly=$('#liveOnly').checked;
  let rows=lastPayload.fixtures||[];
  if(liveOnly)rows=rows.filter(f=>f.status==='live');
  if(q)rows=rows.filter(f=>(f.homeTeam+' '+f.awayTeam+' '+f.competition+' '+f.tier).toLowerCase().includes(q));
  const groups=new Map();
  for(const f of rows){const key=f.competition||'Other';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(f);}
  $('#count').textContent=rows.length+' board matches · '+(lastPayload.liveCount||0)+' live · '+(lastPayload.focusCount||0)+' focus / '+(lastPayload.watchlistCount||0)+' watch';
  $('#updated').textContent='Updated '+new Date(lastPayload.generatedAt).toLocaleTimeString();
  if(!rows.length){$('#list').innerHTML='<div class="empty">No FOCUS or WATCHLIST matches on this board/day.</div>';return;}
  $('#list').innerHTML=[...groups.entries()].map(([league,items])=>'<section class="league"><div class="leagueHead">'+esc(league)+'</div>'+items.map(f=>{
    const scoreA=f.homeScore==null?'':f.homeScore,scoreB=f.awayScore==null?'':f.awayScore;
    return '<div class="match"><div><div class="time '+(f.status==='live'?'status live':'')+'">'+esc(statusText(f))+'</div></div><div class="teams"><div class="team"><span class="name">'+esc(f.homeTeam)+'</span><span class="score">'+esc(scoreA)+'</span></div><div class="team"><span class="name">'+esc(f.awayTeam)+'</span><span class="score">'+esc(scoreB)+'</span></div></div><div class="right"><span class="grade">'+esc(f.grade||'')+'</span><span class="tier '+String(f.tier||'').toLowerCase()+'">'+esc(f.tier==='WATCHLIST'?'WATCH':f.tier||'')+'</span></div></div>';
  }).join('')+'</section>').join('');
}
function mergeLive(p){
  if(!lastPayload)return false;
  const map=new Map((lastPayload.fixtures||[]).map(f=>[f.matchId,f]));
  const nextLiveIds=new Set();
  for(const live of p.fixtures||[]){
    if(!map.has(live.matchId))continue;
    nextLiveIds.add(live.matchId);
    map.set(live.matchId,{...map.get(live.matchId),...live});
  }
  let disappeared=false;
  for(const id of previousLiveIds){if(!nextLiveIds.has(id)){disappeared=true;break;}}
  previousLiveIds=nextLiveIds;
  const fixtures=[...map.values()];
  lastPayload={...lastPayload,fixtures,liveCount:fixtures.filter(f=>f.status==='live').length,generatedAt:p.generatedAt};
  render();
  return disappeared;
}
async function loadFull(){
  if(fullBusy)return;
  fullBusy=true;
  try{
    const r=await fetch('/api/board?day='+day,{cache:'no-store'});const p=await r.json();if(!p.ok)throw new Error(p.error||'Board feed failed');
    lastPayload=p;previousLiveIds=new Set((p.fixtures||[]).filter(f=>f.status==='live'&&f.matchedToSoccerway).map(f=>f.matchId));render();
  }catch(e){$('#count').textContent='Board feed error';$('#list').innerHTML='<div class="empty">'+esc(e.message)+'</div>';}
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
      if (request.method === "GET" && url.pathname === "/api/board") return boardApi(url, ctx);
      if (request.method === "GET" && url.pathname === "/api/fixtures") return fixturesApi(url, ctx);
      if (request.method === "GET" && url.pathname === "/api/live") {
        url.searchParams.set("view", "live");
        return fixturesApi(url, ctx);
      }
      if (request.method === "GET" && url.pathname === "/api/health") return json({ ok: true, service: "soccerway-livescore", defaultView: "FOCUS/WATCHLIST", livePollTargetMs: 1000, edgeCacheSeconds: 1, generatedAt: new Date().toISOString() });
      if (request.method === "GET" && url.pathname === "/") return new Response(HTML, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
      return json({ ok: false, error: "Not found" }, 404);
    } catch (error) {
      return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 502);
    }
  },
};
