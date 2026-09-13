import app from "./soccerway-probe-entry.js";

const eventCache = new Map();
let fullLiveAt = 0;
let finishedAt = 0;
let responseAt = 0;
let responseValue = null;
let scoreInFlight = null;

const RESPONSE_TTL_MS = 1000;
const FULL_LIVE_TTL_MS = 10000;
const FINISHED_TTL_MS = 10000;
const KEEP_MS = 3 * 86400000;

function cors(env, request) {
  const allowed = String(env.ALLOWED_ORIGIN || "https://acchtt.github.io")
    .split(",").map((x) => x.trim()).filter(Boolean);
  const origin = request.headers.get("Origin");
  const accepted = !origin ? allowed[0] || "*" : allowed.includes(origin) ? origin : null;
  return {
    ...(accepted ? { "Access-Control-Allow-Origin": accepted } : {}),
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store, max-age=0",
    Vary: "Origin",
  };
}

function json(data, status, env, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors(env, request) },
  });
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function numeric(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringish(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function eventIdentifier(value) {
  const id = stringish(value);
  return id || undefined;
}

function teamName(value, flat) {
  if (typeof flat === "string" && flat.trim()) return flat.trim();
  if (typeof value === "string" && value.trim()) return value.trim();
  if (isRecord(value)) {
    const name = value.name ?? value.short_name;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  return "";
}

function payloadRows(payload) {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];
  const batch = [payload.results, payload.events, payload.live, payload.matches, payload.data].find(Array.isArray);
  return batch ? batch.filter(isRecord) : [payload];
}

function normalizePeriod(value) {
  const p = String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (["1", "1h", "half1", "1sthalf", "firsthalf"].includes(p)) return 1;
  if (["2", "2h", "half2", "2ndhalf", "secondhalf"].includes(p)) return 2;
  if (["3", "et1", "1et", "extra1", "1stextra", "firstextra"].includes(p)) return 3;
  if (["4", "et2", "2et", "extra2", "2ndextra", "secondextra"].includes(p)) return 4;
  if (["5", "pens", "penalties", "shootout"].includes(p)) return 5;
  return undefined;
}

// BSD has two clock shapes in circulation: some REST live rows expose the minute
// within the current period, while richer event/WebSocket rows expose full-match
// minute. Period-aware normalization supports both without double-adding offsets.
function normalizeClock(minute, second, period, periodStartedAtUts) {
  let m = numeric(minute);
  let s = numeric(second);
  const p = normalizePeriod(period);

  if (m === undefined && p && numeric(periodStartedAtUts) !== undefined) {
    const elapsed = Math.max(0, Math.floor(Date.now() / 1000 - Number(periodStartedAtUts)));
    m = Math.floor(elapsed / 60);
    s = elapsed % 60;
  }

  if (m === undefined) return { minute: undefined, second: s, rawMinute: undefined };
  const rawMinute = m;

  if (p === 2 && m <= 45) m += 45;
  else if (p === 3 && m <= 15) m += 90;
  else if (p === 4 && m <= 15) m += 105;

  return {
    minute: m,
    second: s === undefined ? undefined : Math.max(0, Math.min(59, Math.floor(s))),
    rawMinute,
  };
}

function parseScore(row, defaultStatus = "") {
  const nestedEvent = isRecord(row.event) ? row.event : undefined;
  const source = nestedEvent ? { ...nestedEvent, ...row } : row;
  const score = isRecord(source.score) ? source.score : undefined;
  const time = isRecord(source.time) ? source.time : undefined;
  const homeScore = numeric(source.home_score ?? score?.home ?? score?.home_score);
  const awayScore = numeric(source.away_score ?? score?.away ?? score?.away_score);
  const home = teamName(source.home_team ?? source.home, source.home_team_name ?? source.home_name);
  const away = teamName(source.away_team ?? source.away, source.away_team_name ?? source.away_name);
  if (!home || !away) return undefined;
  const period = stringish(source.period ?? source.current_period ?? source.match_period ?? time?.period);
  const periodStartedAtUts = numeric(source.period_started_at_uts ?? time?.period_started_at_uts);
  const clock = normalizeClock(
    source.current_minute ?? source.minute ?? time?.minute ?? time?.current_minute,
    source.current_second ?? source.second ?? time?.second ?? time?.current_second,
    period,
    periodStartedAtUts,
  );
  return {
    id: eventIdentifier(source.id ?? source.event_id),
    eventDate: text(source.event_date ?? source.date ?? source.kickoff ?? source.kickoff_at ?? time?.kickoff_at) || "",
    home,
    away,
    homeScore,
    awayScore,
    minute: clock.minute,
    rawMinute: clock.rawMinute,
    second: clock.second,
    display: stringish(source.clock_display ?? source.display ?? time?.display),
    period,
    periodStartedAtUts,
    status: String(source.status ?? time?.status ?? defaultStatus).toLowerCase(),
  };
}

function parsePatch(row) {
  const nestedEvent = isRecord(row.event) ? row.event : undefined;
  const score = isRecord(row.score) ? row.score : undefined;
  const time = isRecord(row.time) ? row.time : undefined;
  const id = eventIdentifier(row.id ?? row.event_id ?? nestedEvent?.id ?? nestedEvent?.event_id);
  if (!id) return undefined;
  const period = stringish(row.period ?? row.current_period ?? row.match_period ?? time?.period ?? nestedEvent?.period ?? nestedEvent?.time?.period);
  const periodStartedAtUts = numeric(row.period_started_at_uts ?? time?.period_started_at_uts ?? nestedEvent?.period_started_at_uts ?? nestedEvent?.time?.period_started_at_uts);
  const clock = normalizeClock(
    row.current_minute ?? row.minute ?? time?.minute ?? time?.current_minute ?? nestedEvent?.current_minute ?? nestedEvent?.minute ?? nestedEvent?.time?.minute,
    row.current_second ?? row.second ?? time?.second ?? time?.current_second ?? nestedEvent?.current_second ?? nestedEvent?.second ?? nestedEvent?.time?.second,
    period,
    periodStartedAtUts,
  );
  return {
    id,
    eventDate: text(row.event_date ?? row.date ?? row.kickoff ?? row.kickoff_at ?? time?.kickoff_at) || undefined,
    home: teamName(row.home_team ?? row.home ?? nestedEvent?.home_team ?? nestedEvent?.home, row.home_team_name ?? row.home_name ?? nestedEvent?.home_team_name) || undefined,
    away: teamName(row.away_team ?? row.away ?? nestedEvent?.away_team ?? nestedEvent?.away, row.away_team_name ?? row.away_name ?? nestedEvent?.away_team_name) || undefined,
    homeScore: numeric(row.home_score ?? score?.home ?? score?.home_score ?? nestedEvent?.home_score ?? nestedEvent?.score?.home),
    awayScore: numeric(row.away_score ?? score?.away ?? score?.away_score ?? nestedEvent?.away_score ?? nestedEvent?.score?.away),
    minute: clock.minute,
    rawMinute: clock.rawMinute,
    second: clock.second,
    display: stringish(row.clock_display ?? row.display ?? time?.display ?? nestedEvent?.display ?? nestedEvent?.time?.display),
    period,
    periodStartedAtUts,
    status: String(row.status ?? time?.status ?? nestedEvent?.status ?? nestedEvent?.time?.status ?? "live").toLowerCase(),
  };
}

function mergeDefined(base, patch) {
  const next = { ...base };
  for (const [key, value] of Object.entries(patch || {})) {
    if (value !== undefined && value !== "") next[key] = value;
  }
  return next;
}

function eventKey(event) {
  if (event.id !== undefined) return `id:${event.id}`;
  return `teams:${String(event.home).toLowerCase()}|${String(event.away).toLowerCase()}`;
}

function finishedStatus(status) {
  const value = String(status || "").toLowerCase();
  return value === "finished" || value === "ft" || value === "full_time" || value === "full time" || value === "ended" || value === "complete" || value === "completed";
}

async function bsdFetch(env, path) {
  if (!env.BSD_API_TOKEN) return { ok: false, status: 503, payload: null, error: "BSD_API_TOKEN missing" };
  const base = String(env.BSD_API_BASE_URL || "https://sports.bzzoiro.com/api/v2").replace(/\/$/, "");
  try {
    const response = await fetch(`${base}${path}`, { headers: { Authorization: `Token ${env.BSD_API_TOKEN}` } });
    const body = await response.text();
    let payload = null;
    try { payload = body ? JSON.parse(body) : null; } catch {}
    return { ok: response.ok, status: response.status, payload, error: response.ok ? null : body.slice(0, 300) };
  } catch (error) {
    return { ok: false, status: 0, payload: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function addFull(source, defaultStatus) {
  if (!source?.ok) return 0;
  let count = 0;
  for (const row of payloadRows(source.payload)) {
    const event = parseScore(row, defaultStatus);
    if (!event) continue;
    const key = eventKey(event);
    eventCache.set(key, eventCache.has(key) ? mergeDefined(eventCache.get(key), event) : event);
    count += 1;
  }
  return count;
}

function addCompact(source) {
  if (!source?.ok) return 0;
  let count = 0;
  for (const row of payloadRows(source.payload)) {
    const patch = parsePatch(row);
    if (!patch) continue;
    const key = `id:${patch.id}`;
    const previous = eventCache.get(key);
    if (previous) eventCache.set(key, mergeDefined(previous, patch));
    else if (patch.home && patch.away) eventCache.set(key, patch);
    count += 1;
  }
  return count;
}

function pruneCache(now) {
  for (const [key, event] of eventCache) {
    const ts = event.eventDate ? Date.parse(event.eventDate) : NaN;
    if (Number.isFinite(ts) && ts < now - KEEP_MS) eventCache.delete(key);
  }
}

async function buildFastScoreFeed(env) {
  const now = Date.now();
  const from = new Date(now - 2 * 86400000).toISOString().slice(0, 10);
  const to = new Date(now + 86400000).toISOString().slice(0, 10);
  const needFullLive = eventCache.size === 0 || now - fullLiveAt >= FULL_LIVE_TTL_MS;
  const needFinished = eventCache.size === 0 || now - finishedAt >= FINISHED_TTL_MS;

  const [compactLive, statusLive, statusFinished] = await Promise.all([
    bsdFetch(env, "/events/live/"),
    needFullLive ? bsdFetch(env, "/events/?status=live&limit=200") : Promise.resolve(null),
    needFinished ? bsdFetch(env, `/events/?status=finished&date_from=${from}&date_to=${to}&limit=200`) : Promise.resolve(null),
  ]);

  if (statusLive?.ok) { addFull(statusLive, "live"); fullLiveAt = now; }
  if (statusFinished?.ok) { addFull(statusFinished, "finished"); finishedAt = now; }
  addCompact(compactLive);
  pruneCache(now);

  const events = [...eventCache.values()]
    .filter((event) => event.home && event.away && event.homeScore !== undefined && event.awayScore !== undefined)
    .map((event) => {
      const finished = finishedStatus(event.status);
      return {
        id: event.id,
        eventDate: event.eventDate,
        home: event.home,
        away: event.away,
        homeScore: event.homeScore,
        awayScore: event.awayScore,
        minute: finished ? undefined : event.minute,
        rawMinute: finished ? undefined : event.rawMinute,
        second: finished ? undefined : event.second,
        display: finished ? "FT" : event.display,
        period: finished ? "FT" : event.period,
        periodStartedAtUts: finished ? undefined : event.periodStartedAtUts,
        status: finished ? "finished" : (event.status || "live"),
      };
    });

  return {
    ok: Boolean(compactLive.ok || statusLive?.ok || statusFinished?.ok || events.length),
    count: events.filter((event) => !finishedStatus(event.status)).length,
    scoreCount: events.length,
    fastPath: true,
    cadence: { compactLiveMs: 0, fullLiveMs: FULL_LIVE_TTL_MS, finishedMs: FINISHED_TTL_MS },
    sources: {
      compactLive: { ok: compactLive.ok, status: compactLive.status, rows: compactLive.ok ? payloadRows(compactLive.payload).length : 0, error: compactLive.error },
      statusLive: statusLive ? { ok: statusLive.ok, status: statusLive.status, rows: statusLive.ok ? payloadRows(statusLive.payload).length : 0, error: statusLive.error } : { cached: true },
      statusFinished: statusFinished ? { ok: statusFinished.ok, status: statusFinished.status, rows: statusFinished.ok ? payloadRows(statusFinished.payload).length : 0, error: statusFinished.error } : { cached: true },
    },
    events,
    generatedAt: new Date().toISOString(),
  };
}

async function fastScoreFeed(env) {
  const now = Date.now();
  if (responseValue && now - responseAt < RESPONSE_TTL_MS) return responseValue;
  if (scoreInFlight) return scoreInFlight;
  scoreInFlight = buildFastScoreFeed(env)
    .then((value) => { responseValue = value; responseAt = Date.now(); return value; })
    .finally(() => { scoreInFlight = null; });
  return scoreInFlight;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS" && url.pathname === "/api/live-scores") {
      return new Response(null, { status: 204, headers: cors(env, request) });
    }
    if (request.method === "GET" && url.pathname === "/api/live-scores") {
      const feed = await fastScoreFeed(env);
      return json(feed, feed.ok ? 200 : 502, env, request);
    }
    return app.fetch(request, env, ctx);
  },
};
