import app from "./fast-entry.js";

const statsCache = new Map();
const statsInFlight = new Map();
const STATS_TTL_MS = 3000;
const MAX_STATS_CACHE = 80;

function allowedOrigin(env, request) {
  const allowed = String(env.ALLOWED_ORIGIN || "https://acchtt.github.io")
    .split(",").map((x) => x.trim()).filter(Boolean);
  const origin = request.headers.get("Origin");
  if (!origin) return allowed[0] || "*";
  return allowed.includes(origin) ? origin : null;
}

function cors(env, request, cacheControl = "no-store, max-age=0") {
  const accepted = allowedOrigin(env, request);
  return {
    ...(accepted ? { "Access-Control-Allow-Origin": accepted } : {}),
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": cacheControl,
    Vary: "Origin",
  };
}

function json(data, status, env, request, cacheControl) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors(env, request, cacheControl) },
  });
}

function eventIdFrom(url) {
  const value = Number(url.searchParams.get("event_id"));
  return Number.isInteger(value) && value > 0 ? value : null;
}

async function bsdJson(env, path) {
  if (!env.BSD_API_TOKEN) throw new Error("BSD_API_TOKEN missing");
  const base = String(env.BSD_API_BASE_URL || "https://sports.bzzoiro.com/api/v2").replace(/\/$/, "");
  const response = await fetch(`${base}${path}`, {
    headers: { Authorization: `Token ${env.BSD_API_TOKEN}`, Accept: "application/json" },
  });
  const body = await response.text();
  let payload = null;
  try { payload = body ? JSON.parse(body) : null; } catch {}
  if (!response.ok) throw new Error(`BSD HTTP ${response.status}: ${body.slice(0, 240)}`);
  return payload;
}

function pruneStatsCache() {
  if (statsCache.size <= MAX_STATS_CACHE) return;
  const rows = [...statsCache.entries()].sort((a, b) => a[1].at - b[1].at);
  for (const [key] of rows.slice(0, statsCache.size - MAX_STATS_CACHE)) statsCache.delete(key);
}

async function matchStats(env, eventId) {
  const now = Date.now();
  const cached = statsCache.get(eventId);
  if (cached && now - cached.at < STATS_TTL_MS) return { ...cached.value, cached: true };
  if (statsInFlight.has(eventId)) return statsInFlight.get(eventId);

  const task = Promise.all([
    bsdJson(env, `/events/${eventId}/stats/`),
    bsdJson(env, `/events/${eventId}/`).catch(() => null),
  ]).then(([stats, event]) => {
    const value = {
      ok: true,
      eventId,
      stats,
      event,
      cached: false,
      generatedAt: new Date().toISOString(),
    };
    statsCache.set(eventId, { at: Date.now(), value });
    pruneStatsCache();
    return value;
  }).finally(() => statsInFlight.delete(eventId));

  statsInFlight.set(eventId, task);
  return task;
}

function closeSocket(socket, code = 1000, reason = "closed") {
  try { socket.close(code, reason); } catch {}
}

async function websocketProxy(request, env) {
  if (!env.BSD_API_TOKEN) return new Response("BSD_API_TOKEN missing", { status: 503 });
  if (allowedOrigin(env, request) === null) return new Response("Origin not allowed", { status: 403 });
  if (String(request.headers.get("Upgrade") || "").toLowerCase() !== "websocket") {
    return new Response("Expected WebSocket upgrade", { status: 426, headers: { Upgrade: "websocket" } });
  }

  const upstreamUrl = `https://sports.bzzoiro.com/live/football/?token=${encodeURIComponent(env.BSD_API_TOKEN)}`;
  let upstreamResponse;
  try {
    upstreamResponse = await fetch(upstreamUrl, { headers: { Upgrade: "websocket" } });
  } catch (error) {
    return new Response(`BSD WebSocket connection failed: ${error instanceof Error ? error.message : String(error)}`, { status: 502 });
  }

  const upstream = upstreamResponse.webSocket;
  if (upstreamResponse.status !== 101 || !upstream) {
    return new Response(`BSD WebSocket unavailable (${upstreamResponse.status})`, { status: 502 });
  }

  try { upstream.accept?.(); } catch {}

  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];
  server.accept();

  let closed = false;
  const shutdown = (code = 1000, reason = "closed") => {
    if (closed) return;
    closed = true;
    closeSocket(server, code, reason);
    closeSocket(upstream, code, reason);
  };

  server.addEventListener("message", (event) => {
    try { upstream.send(event.data); } catch { shutdown(1011, "upstream send failed"); }
  });
  upstream.addEventListener("message", (event) => {
    try { server.send(event.data); } catch { shutdown(1011, "client send failed"); }
  });
  server.addEventListener("close", (event) => shutdown(event.code || 1000, event.reason || "client closed"));
  upstream.addEventListener("close", (event) => shutdown(event.code || 1000, event.reason || "BSD closed"));
  server.addEventListener("error", () => shutdown(1011, "client socket error"));
  upstream.addEventListener("error", () => shutdown(1011, "BSD socket error"));

  return new Response(null, { status: 101, webSocket: client });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS" && url.pathname === "/api/match-stats") {
      return new Response(null, { status: 204, headers: cors(env, request) });
    }

    if (request.method === "GET" && url.pathname === "/api/match-stats") {
      const eventId = eventIdFrom(url);
      if (!eventId) return json({ ok: false, error: "valid event_id is required" }, 400, env, request);
      try {
        return json(await matchStats(env, eventId), 200, env, request, "no-store, max-age=0");
      } catch (error) {
        return json({ ok: false, eventId, error: error instanceof Error ? error.message : String(error) }, 502, env, request);
      }
    }

    if (request.method === "GET" && url.pathname === "/api/live-centre") {
      return websocketProxy(request, env);
    }

    return app.fetch(request, env, ctx);
  },
};
