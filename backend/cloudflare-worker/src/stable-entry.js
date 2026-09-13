import app from "./fast-entry.js";

const DASHBOARD_TTL_MS = 7000;
const DASHBOARD_STALE_MS = 60000;
const STATS_TTL_MS = 5000;

let dashboardCache = null;
let dashboardAt = 0;
let dashboardInFlight = null;
const statsCache = new Map();
const statsInFlight = new Map();

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

function eventId(url) {
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

async function matchStats(env, id) {
  const now = Date.now();
  const cached = statsCache.get(id);
  if (cached && now - cached.at < STATS_TTL_MS) return { ...cached.value, cached: true };
  if (statsInFlight.has(id)) return statsInFlight.get(id);

  const task = Promise.all([
    bsdJson(env, `/events/${id}/stats/`),
    bsdJson(env, `/events/${id}/`).catch(() => null),
  ]).then(([stats, event]) => {
    const value = { ok: true, eventId: id, stats, event, cached: false, generatedAt: new Date().toISOString() };
    statsCache.set(id, { at: Date.now(), value });
    if (statsCache.size > 60) {
      const oldest = [...statsCache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, statsCache.size - 60);
      for (const [key] of oldest) statsCache.delete(key);
    }
    return value;
  }).finally(() => statsInFlight.delete(id));

  statsInFlight.set(id, task);
  return task;
}

async function dashboardResponse(request, env, ctx) {
  const now = Date.now();
  if (dashboardCache && now - dashboardAt < DASHBOARD_TTL_MS) {
    return json({ ...dashboardCache, cached: true }, 200, env, request, { "X-SlipTrace-Cache": "HIT" });
  }
  if (dashboardInFlight) return dashboardInFlight;

  dashboardInFlight = (async () => {
    try {
      const upstream = await app.fetch(request, env, ctx);
      if (upstream.ok) {
        const payload = await upstream.clone().json();
        if (payload?.ok && Array.isArray(payload.schedule) && Array.isArray(payload.picks)) {
          dashboardCache = payload;
          dashboardAt = Date.now();
        }
        return upstream;
      }
      if (dashboardCache && Date.now() - dashboardAt < DASHBOARD_STALE_MS) {
        return json({ ...dashboardCache, cached: true, degraded: true, staleAgeMs: Date.now() - dashboardAt }, 200, env, request, { "X-SlipTrace-Cache": "STALE" });
      }
      return upstream;
    } catch (error) {
      if (dashboardCache && Date.now() - dashboardAt < DASHBOARD_STALE_MS) {
        return json({ ...dashboardCache, cached: true, degraded: true, staleAgeMs: Date.now() - dashboardAt }, 200, env, request, { "X-SlipTrace-Cache": "STALE" });
      }
      return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 502, env, request);
    } finally {
      dashboardInFlight = null;
    }
  })();

  return dashboardInFlight;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS" && url.pathname === "/api/match-stats") {
      return new Response(null, { status: 204, headers: cors(env, request) });
    }

    if (request.method === "GET" && url.pathname === "/api/match-stats") {
      const id = eventId(url);
      if (!id) return json({ ok: false, error: "valid event_id is required" }, 400, env, request);
      try {
        return json(await matchStats(env, id), 200, env, request);
      } catch (error) {
        const cached = statsCache.get(id);
        if (cached) return json({ ...cached.value, cached: true, degraded: true, error: error instanceof Error ? error.message : String(error) }, 200, env, request);
        return json({ ok: false, eventId: id, error: error instanceof Error ? error.message : String(error) }, 502, env, request);
      }
    }

    if (request.method === "GET" && url.pathname === "/api/dashboard-data") {
      return dashboardResponse(request, env, ctx);
    }

    return app.fetch(request, env, ctx);
  },
};
