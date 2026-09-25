import legacy from "./health-entry.js";

const BSD_BASE = "https://sports.bzzoiro.com/api/v2";
const CACHE = new Map();
const IN_FLIGHT = new Map();

const TTL = {
  live: 10_000,
  events: 10_000,
  match: 10_000,
  lineups: 30_000,
  standings: 60_000,
  reference: 300_000,
  predictions: 120_000,
};

function allowedOrigin(env, request) {
  const configured = String(env.ALLOWED_ORIGIN || "https://acchtt.github.io")
    .split(",").map(v => v.trim()).filter(Boolean);
  const origin = request.headers.get("Origin");
  if (!origin) return configured[0] || "*";
  return configured.includes(origin) ? origin : null;
}

function cors(env, request, cacheControl = "no-store") {
  const origin = allowedOrigin(env, request);
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": cacheControl,
    Vary: "Origin",
  };
}

function json(data, status, env, request, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors(env, request), ...extra },
  });
}

function numericId(value) {
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) ? text : null;
}

function cleanQuery(source, allowed) {
  const out = new URLSearchParams();
  for (const key of allowed) {
    for (const value of source.getAll(key)) if (value !== "") out.append(key, value);
  }
  return out;
}

async function bsdRaw(env, path, query = new URLSearchParams()) {
  if (!env.BSD_API_TOKEN) throw new Error("BSD_API_TOKEN missing");
  const base = String(env.BSD_API_BASE_URL || BSD_BASE).replace(/\/$/, "");
  const url = new URL(`${base}${path}`);
  for (const [key, value] of query) url.searchParams.append(key, value);
  const response = await fetch(url, {
    headers: {
      Authorization: `Token ${env.BSD_API_TOKEN}`,
      Accept: "application/json",
    },
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) {
    const error = new Error(payload?.detail || payload?.error || `BSD HTTP ${response.status}`);
    error.status = response.status;
    error.payload = payload || { error: true, status: response.status, detail: text.slice(0, 300) };
    throw error;
  }
  return payload;
}

async function cached(key, ttl, fn) {
  const now = Date.now();
  const hit = CACHE.get(key);
  if (hit && now - hit.at < ttl) return { value: hit.value, cache: "HIT", ageMs: now - hit.at };
  if (IN_FLIGHT.has(key)) return IN_FLIGHT.get(key);
  const job = Promise.resolve().then(fn).then(value => {
    CACHE.set(key, { at: Date.now(), value });
    if (CACHE.size > 150) {
      const oldest = [...CACHE.entries()].sort((a,b) => a[1].at - b[1].at).slice(0, CACHE.size - 150);
      oldest.forEach(([k]) => CACHE.delete(k));
    }
    return { value, cache: "MISS", ageMs: 0 };
  }).finally(() => IN_FLIGHT.delete(key));
  IN_FLIGHT.set(key, job);
  return job;
}

async function optional(fn) {
  try { return { ok: true, data: await fn() }; }
  catch (error) {
    return {
      ok: false,
      status: error?.status || 502,
      error: error?.payload?.detail || error?.message || String(error),
    };
  }
}

function responseWithMeta(result, env, request) {
  return json({ ok: true, data: result.value, cache: result.cache, ageMs: result.ageMs, generatedAt: new Date().toISOString() }, 200, env, request);
}

async function handleLive(request, env) {
  const result = await cached("bsd:live", TTL.live, () => bsdRaw(env, "/events/live/"));
  return responseWithMeta(result, env, request);
}

async function handleEvents(url, request, env) {
  const query = cleanQuery(url.searchParams, [
    "date_from","date_to","status","league_id","season_id","team_id","stage","round","limit","offset"
  ]);
  if (!query.has("limit")) query.set("limit", "100");
  const key = `bsd:events:${query.toString()}`;
  const result = await cached(key, TTL.events, () => bsdRaw(env, "/events/", query));
  return responseWithMeta(result, env, request);
}

async function handleMatch(id, request, env) {
  const key = `bsd:match:${id}`;
  const result = await cached(key, TTL.match, async () => {
    const [event, stats, lineups, incidents, odds, h2h, prediction] = await Promise.all([
      optional(() => bsdRaw(env, `/events/${id}/`)),
      optional(() => bsdRaw(env, `/events/${id}/stats/`)),
      optional(() => bsdRaw(env, `/events/${id}/lineups/`)),
      optional(() => bsdRaw(env, `/events/${id}/incidents/`)),
      optional(() => bsdRaw(env, `/events/${id}/odds/`)),
      optional(() => bsdRaw(env, `/events/${id}/h2h/`)),
      optional(() => bsdRaw(env, `/events/${id}/prediction/`)),
    ]);
    if (!event.ok) {
      const err = new Error(event.error || "Match not found");
      err.status = event.status || 404;
      throw err;
    }
    return { event: event.data, stats, lineups, incidents, odds, h2h, prediction };
  });
  return responseWithMeta(result, env, request);
}

async function handleLeagues(url, request, env) {
  const query = cleanQuery(url.searchParams, ["name","country_code","limit","offset"]);
  if (!query.has("limit")) query.set("limit", "100");
  const result = await cached(`bsd:leagues:${query}`, TTL.reference, () => bsdRaw(env, "/leagues/", query));
  return responseWithMeta(result, env, request);
}

async function handleLeague(id, url, request, env) {
  const seasonId = numericId(url.searchParams.get("season_id"));
  const eventsQuery = new URLSearchParams({ league_id: id, limit: "100" });
  const [league, seasons, standings, events, scorers] = await Promise.all([
    optional(() => bsdRaw(env, `/leagues/${id}/`)),
    optional(() => bsdRaw(env, `/leagues/${id}/seasons/`)),
    seasonId ? optional(() => bsdRaw(env, `/leagues/${id}/standings/`, new URLSearchParams({ season_id: seasonId }))) : Promise.resolve({ ok: false, status: 400, error: "season_id required" }),
    optional(() => bsdRaw(env, "/events/", eventsQuery)),
    optional(() => bsdRaw(env, `/leagues/${id}/top/scorers/`)),
  ]);
  return json({ ok: true, data: { league, seasons, standings, events, scorers }, generatedAt: new Date().toISOString() }, 200, env, request);
}

async function handleTeams(url, request, env) {
  const query = cleanQuery(url.searchParams, ["name","league_id","country_code","limit","offset"]);
  if (!query.has("limit")) query.set("limit", "60");
  const result = await cached(`bsd:teams:${query}`, TTL.reference, () => bsdRaw(env, "/teams/", query));
  return responseWithMeta(result, env, request);
}

async function handleTeam(id, request, env) {
  const [team, squad, fixtures, stats, transfers] = await Promise.all([
    optional(() => bsdRaw(env, `/teams/${id}/`)),
    optional(() => bsdRaw(env, `/teams/${id}/squad/`)),
    optional(() => bsdRaw(env, `/teams/${id}/fixtures/`)),
    optional(() => bsdRaw(env, `/teams/${id}/stats/`)),
    optional(() => bsdRaw(env, "/transfers/", new URLSearchParams({ team_id: id, limit: "50" }))),
  ]);
  return json({ ok: true, data: { team, squad, fixtures, stats, transfers }, generatedAt: new Date().toISOString() }, 200, env, request);
}

async function handleSearch(url, request, env) {
  const q = String(url.searchParams.get("q") || "").trim();
  if (q.length < 2) return json({ ok: true, data: { teams: [], players: [] } }, 200, env, request);
  const [teams, players] = await Promise.all([
    optional(() => bsdRaw(env, "/teams/", new URLSearchParams({ name: q, limit: "12" }))),
    optional(() => bsdRaw(env, "/players/", new URLSearchParams({ name: q, limit: "12" }))),
  ]);
  return json({ ok: true, data: { teams, players }, generatedAt: new Date().toISOString() }, 200, env, request);
}

async function handleCollection(name, url, request, env) {
  const routes = {
    predictions: ["/predictions/", TTL.predictions, ["status","league_id","season_id","team_id","date_from","date_to","min_confidence","recommended","limit","offset"]],
    odds: ["/odds/", TTL.live, ["event_id","league_id","season_id","team_id","market","outcome","bookmaker_slug","is_max_quote","movement","min_decimal_odds","max_decimal_odds","updated_after","limit","offset"]],
    bookmakers: ["/bookmakers/", TTL.reference, ["limit","offset"]],
    managers: ["/managers/", TTL.reference, ["name","team_id","league_id","nationality_code","tactical_profile","team_style","min_matches","limit","offset"]],
    referees: ["/referees/", TTL.reference, ["name","country_code","league_id","min_matches","limit","offset"]],
    venues: ["/venues/", TTL.reference, ["name","country_code","city","min_capacity","team_id","limit","offset"]],
    broadcasts: ["/broadcasts/", TTL.reference, ["event_id","country_code","channel_id","limit","offset"]],
    social: ["/social/", TTL.reference, ["event_id","league_id","team_id","player_id","type","limit","offset"]],
  };
  const def = routes[name];
  if (!def) return json({ ok: false, error: "Unknown collection" }, 404, env, request);
  const [path, ttl, fields] = def;
  const query = cleanQuery(url.searchParams, fields);
  if (!query.has("limit")) query.set("limit", "50");
  const result = await cached(`bsd:${name}:${query}`, ttl, () => bsdRaw(env, path, query));
  return responseWithMeta(result, env, request);
}

async function handleSoccerwayBoard(url, request, env) {
  if (!env.SOCCERWAY_API || typeof env.SOCCERWAY_API.fetch !== "function") {
    return json({ ok: false, error: "Soccerway fallback binding unavailable" }, 503, env, request);
  }
  const day = Number(url.searchParams.get("day") ?? 0);
  if (!Number.isInteger(day) || day < -7 || day > 7) {
    return json({ ok: false, error: "day must be an integer from -7 to 7" }, 400, env, request);
  }
  const upstream = await env.SOCCERWAY_API.fetch(`https://soccerway.internal/api/board?day=${day}`, {
    headers: { Accept: "application/json" },
  });
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors(env, request) },
  });
}

async function liveSocket(request, env) {
  if (!env.BSD_API_TOKEN) return new Response("BSD_API_TOKEN missing", { status: 503 });
  if (String(request.headers.get("Upgrade") || "").toLowerCase() !== "websocket") {
    return new Response("WebSocket upgrade required", { status: 426, headers: { Upgrade: "websocket" } });
  }
  if (!allowedOrigin(env, request)) return new Response("Origin not allowed", { status: 403 });

  const upstreamResponse = await fetch(`https://sports.bzzoiro.com/live/football/?token=${encodeURIComponent(env.BSD_API_TOKEN)}`, {
    headers: { Upgrade: "websocket" },
  });
  const upstream = upstreamResponse.webSocket;
  if (upstreamResponse.status !== 101 || !upstream) return new Response(`BSD WebSocket unavailable (${upstreamResponse.status})`, { status: 502 });

  const pair = new WebSocketPair();
  const client = pair[0], server = pair[1];
  server.accept();
  try { upstream.accept(); } catch {}
  const close = (code = 1000, reason = "closed") => {
    try { server.close(code, reason); } catch {}
    try { upstream.close(code, reason); } catch {}
  };
  server.addEventListener("message", e => { try { upstream.send(e.data); } catch { close(1011, "upstream send failed"); } });
  upstream.addEventListener("message", e => { try { server.send(e.data); } catch { close(1011, "client send failed"); } });
  server.addEventListener("close", e => close(e.code || 1000, e.reason || "client closed"));
  upstream.addEventListener("close", e => close(e.code || 1000, e.reason || "BSD closed"));
  server.addEventListener("error", () => close(1011, "client socket error"));
  upstream.addEventListener("error", () => close(1011, "BSD socket error"));
  return new Response(null, { status: 101, webSocket: client });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/bsd/")) {
      return new Response(null, { status: 204, headers: cors(env, request) });
    }
    if (request.method === "GET" && url.pathname === "/api/bsd/live") return handleLive(request, env);
    if (request.method === "GET" && url.pathname === "/api/bsd/events") return handleEvents(url, request, env);
    if (request.method === "GET" && url.pathname === "/api/bsd/leagues") return handleLeagues(url, request, env);
    if (request.method === "GET" && url.pathname === "/api/bsd/teams") return handleTeams(url, request, env);
    if (request.method === "GET" && url.pathname === "/api/bsd/search") return handleSearch(url, request, env);
    if (request.method === "GET" && url.pathname === "/api/bsd/ws") return liveSocket(request, env);
    if (request.method === "GET" && url.pathname === "/api/soccerway/board") return handleSoccerwayBoard(url, request, env);

    let match = url.pathname.match(/^\/api\/bsd\/match\/(\d+)$/);
    if (request.method === "GET" && match) return handleMatch(match[1], request, env);
    match = url.pathname.match(/^\/api\/bsd\/league\/(\d+)$/);
    if (request.method === "GET" && match) return handleLeague(match[1], url, request, env);
    match = url.pathname.match(/^\/api\/bsd\/team\/(\d+)$/);
    if (request.method === "GET" && match) return handleTeam(match[1], request, env);
    match = url.pathname.match(/^\/api\/bsd\/(predictions|odds|bookmakers|managers|referees|venues|broadcasts|social)$/);
    if (request.method === "GET" && match) return handleCollection(match[1], url, request, env);

    return legacy.fetch(request, env, ctx);
  },
};
