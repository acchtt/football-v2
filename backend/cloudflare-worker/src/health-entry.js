import app from "./dashboard-entry.js";

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
  return {
    id: numeric(source.id ?? source.event_id),
    eventDate: text(source.event_date ?? source.date ?? source.kickoff ?? source.kickoff_at ?? time?.kickoff_at) || "",
    home,
    away,
    homeScore,
    awayScore,
    minute: numeric(source.current_minute ?? source.minute ?? time?.minute ?? time?.current_minute),
    period: stringish(source.period ?? source.current_period ?? source.match_period ?? time?.period ?? time?.display),
    status: String(source.status ?? time?.status ?? defaultStatus).toLowerCase(),
  };
}

function parsePatch(row) {
  const nestedEvent = isRecord(row.event) ? row.event : undefined;
  const score = isRecord(row.score) ? row.score : undefined;
  const time = isRecord(row.time) ? row.time : undefined;
  const id = numeric(row.id ?? row.event_id ?? nestedEvent?.id ?? nestedEvent?.event_id);
  if (id === undefined) return undefined;
  return {
    id,
    eventDate: text(row.event_date ?? row.date ?? row.kickoff ?? row.kickoff_at ?? time?.kickoff_at) || undefined,
    home: teamName(row.home_team ?? row.home ?? nestedEvent?.home_team ?? nestedEvent?.home, row.home_team_name ?? row.home_name ?? nestedEvent?.home_team_name) || undefined,
    away: teamName(row.away_team ?? row.away ?? nestedEvent?.away_team ?? nestedEvent?.away, row.away_team_name ?? row.away_name ?? nestedEvent?.away_team_name) || undefined,
    homeScore: numeric(row.home_score ?? score?.home ?? score?.home_score),
    awayScore: numeric(row.away_score ?? score?.away ?? score?.away_score),
    minute: numeric(row.current_minute ?? row.minute ?? time?.minute ?? time?.current_minute),
    period: stringish(row.period ?? row.current_period ?? row.match_period ?? time?.period ?? time?.display),
    status: String(row.status ?? time?.status ?? "live").toLowerCase(),
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
  return value === "finished" || value === "ft" || value === "full_time" || value === "ended";
}

async function bsdFetch(env, path) {
  if (!env.BSD_API_TOKEN) return { ok: false, status: 503, payload: null, error: "BSD_API_TOKEN missing" };
  const base = String(env.BSD_API_BASE_URL || "https://sports.bzzoiro.com/api/v2").replace(/\/$/, "");
  try {
    const response = await fetch(`${base}${path}`, {
      headers: { Authorization: `Token ${env.BSD_API_TOKEN}` },
    });
    const body = await response.text();
    let payload = null;
    try { payload = body ? JSON.parse(body) : null; } catch {}
    return {
      ok: response.ok,
      status: response.status,
      payload,
      error: response.ok ? null : body.slice(0, 300),
    };
  } catch (error) {
    return { ok: false, status: 0, payload: null, error: error instanceof Error ? error.message : String(error) };
  }
}

async function scoreFeed(env) {
  const now = Date.now();
  const from = new Date(now - 2 * 86400000).toISOString().slice(0, 10);
  const to = new Date(now + 86400000).toISOString().slice(0, 10);
  const [statusLive, compactLive, statusFinished] = await Promise.all([
    bsdFetch(env, "/events/?status=live&limit=200"),
    bsdFetch(env, "/events/live/"),
    bsdFetch(env, `/events/?status=finished&date_from=${from}&date_to=${to}&limit=200`),
  ]);

  const merged = new Map();
  const addFull = (source, defaultStatus) => {
    if (!source.ok) return;
    for (const row of payloadRows(source.payload)) {
      const event = parseScore(row, defaultStatus);
      if (!event) continue;
      const key = eventKey(event);
      merged.set(key, merged.has(key) ? mergeDefined(merged.get(key), event) : event);
    }
  };

  addFull(statusLive, "live");
  addFull(statusFinished, "finished");

  if (compactLive.ok) {
    for (const row of payloadRows(compactLive.payload)) {
      const patch = parsePatch(row);
      if (!patch) continue;
      const key = `id:${patch.id}`;
      const previous = merged.get(key);
      if (previous) {
        merged.set(key, mergeDefined(previous, patch));
      } else if (patch.home && patch.away) {
        merged.set(key, patch);
      }
    }
  }

  const events = [...merged.values()]
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
        period: finished ? "FT" : event.period,
        status: finished ? "finished" : (event.status || "live"),
      };
    });

  return {
    ok: statusLive.ok || compactLive.ok || statusFinished.ok,
    count: events.filter((event) => !finishedStatus(event.status)).length,
    scoreCount: events.length,
    sources: {
      statusLive: { ok: statusLive.ok, status: statusLive.status, rows: statusLive.ok ? payloadRows(statusLive.payload).length : 0, error: statusLive.error },
      compactLive: { ok: compactLive.ok, status: compactLive.status, rows: compactLive.ok ? payloadRows(compactLive.payload).length : 0, error: compactLive.error },
      statusFinished: { ok: statusFinished.ok, status: statusFinished.status, rows: statusFinished.ok ? payloadRows(statusFinished.payload).length : 0, error: statusFinished.error },
    },
    events,
    generatedAt: new Date().toISOString(),
  };
}

async function sortedDashboard(request, env, ctx) {
  const response = await app.fetch(request, env, ctx);
  if (!response.ok) return response;
  let payload;
  try {
    payload = await response.clone().json();
  } catch {
    return response;
  }
  if (!payload?.ok || !Array.isArray(payload.schedule)) return response;

  payload.schedule.sort((a, b) => {
    const day = String(a.slateDate || "").localeCompare(String(b.slateDate || ""));
    if (day) return day;
    const left = Date.parse(a.kickoff || a.displayKickoff || "");
    const right = Date.parse(b.kickoff || b.displayKickoff || "");
    if (!Number.isFinite(left) && !Number.isFinite(right)) return 0;
    if (!Number.isFinite(left)) return 1;
    if (!Number.isFinite(right)) return -1;
    return left - right;
  });

  const headers = new Headers(response.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store, max-age=0");
  return new Response(JSON.stringify(payload), { status: response.status, headers });
}

async function probeAirtable(env) {
  if (!env.AIRTABLE_TOKEN) return { ok: false, status: 0, error: "AIRTABLE_TOKEN missing" };
  const base = env.AIRTABLE_BASE_ID || "appWyZJjitSBATXAU";
  const url = new URL(`https://api.airtable.com/v0/${base}/tblcl1UAyMqZT6Ub0`);
  url.searchParams.set("pageSize", "1");
  url.searchParams.append("fields[]", "Match");
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` } });
    const body = await r.text();
    return { ok: r.ok, status: r.status, error: r.ok ? null : body.slice(0, 300) };
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

async function probeBsd(env) {
  const result = await bsdFetch(env, "/events/?status=live&limit=1");
  return { ok: result.ok, status: result.status, error: result.error };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      const [airtable, bsd] = await Promise.all([probeAirtable(env), probeBsd(env)]);
      return json({
        ok: airtable.ok,
        service: "football-v2",
        airtable,
        bsd,
        dashboardMode: "airtable-plus-lightweight-bsd-scores",
        generatedAt: new Date().toISOString(),
      }, airtable.ok ? 200 : 502, env, request);
    }

    if (request.method === "GET" && url.pathname === "/api/live-scores") {
      const feed = await scoreFeed(env);
      return json(feed, feed.ok ? 200 : 502, env, request);
    }

    if (request.method === "GET" && url.pathname === "/api/dashboard-data") {
      return sortedDashboard(request, env, ctx);
    }

    return app.fetch(request, env, ctx);
  },
};
