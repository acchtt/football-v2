import app from "./fast-entry.js";

const DASHBOARD_TTL_MS = 8000;
const DASHBOARD_STALE_MS = 3 * 60 * 1000;
const EDGE_CACHE_MAX_AGE_S = 10 * 60;
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
  const value = String(url.searchParams.get("event_id") || "").trim();
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : null;
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

  const safeId = encodeURIComponent(id);
  const task = Promise.all([
    bsdJson(env, `/events/${safeId}/stats/`),
    bsdJson(env, `/events/${safeId}/`).catch(() => null),
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

function validDashboard(payload) {
  return Boolean(payload?.ok && Array.isArray(payload.schedule) && Array.isArray(payload.picks));
}

function dashboardEdgeKey(request) {
  const url = new URL(request.url);
  url.search = "";
  url.pathname = "/api/dashboard-data";
  return new Request(url.toString(), { method: "GET" });
}

async function readEdgeDashboard(request) {
  try {
    if (!globalThis.caches?.default) return null;
    const response = await caches.default.match(dashboardEdgeKey(request));
    if (!response) return null;
    const payload = await response.json().catch(() => null);
    if (!validDashboard(payload)) return null;
    const storedAt = Number(response.headers.get("X-SlipTrace-Stored-At")) || 0;
    if (!storedAt) return null;
    return { payload, storedAt };
  } catch {
    return null;
  }
}

function writeEdgeDashboard(request, payload, ctx) {
  try {
    if (!globalThis.caches?.default || !validDashboard(payload)) return;
    const storedAt = Date.now();
    const response = new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": `public, max-age=${EDGE_CACHE_MAX_AGE_S}`,
        "X-SlipTrace-Stored-At": String(storedAt),
      },
    });
    ctx.waitUntil(caches.default.put(dashboardEdgeKey(request), response));
  } catch {}
}

function cachedDashboardResponse(request, env, payload, storedAt, source) {
  const staleAgeMs = Math.max(0, Date.now() - storedAt);
  return json({
    ...payload,
    cached: true,
    degraded: source === "STALE" || staleAgeMs >= DASHBOARD_TTL_MS,
    staleAgeMs,
    cacheSource: source,
  }, 200, env, request, { "X-SlipTrace-Cache": source });
}

async function dashboardResponse(request, env, ctx) {
  const now = Date.now();

  if (dashboardCache && now - dashboardAt < DASHBOARD_TTL_MS) {
    return cachedDashboardResponse(request, env, dashboardCache, dashboardAt, "MEMORY");
  }

  const edge = await readEdgeDashboard(request);
  if (edge) {
    if (!dashboardCache || edge.storedAt > dashboardAt) {
      dashboardCache = edge.payload;
      dashboardAt = edge.storedAt;
    }
    if (now - edge.storedAt < DASHBOARD_TTL_MS) {
      return cachedDashboardResponse(request, env, edge.payload, edge.storedAt, "EDGE");
    }
  }

  if (dashboardInFlight) return dashboardInFlight;

  dashboardInFlight = (async () => {
    const fallback = dashboardCache && Date.now() - dashboardAt < DASHBOARD_STALE_MS
      ? { payload: dashboardCache, storedAt: dashboardAt }
      : edge && Date.now() - edge.storedAt < DASHBOARD_STALE_MS
        ? edge
        : null;

    try {
      const upstream = await app.fetch(request, env, ctx);
      const payload = await upstream.clone().json().catch(() => null);

      if (upstream.ok && validDashboard(payload)) {
        dashboardCache = payload;
        dashboardAt = Date.now();
        writeEdgeDashboard(request, payload, ctx);
        return json({ ...payload, cached: false, degraded: false, staleAgeMs: 0, cacheSource: "ORIGIN" }, 200, env, request, {
          "X-SlipTrace-Cache": "MISS",
        });
      }

      if (fallback) {
        return cachedDashboardResponse(request, env, fallback.payload, fallback.storedAt, "STALE");
      }

      return upstream;
    } catch (error) {
      if (fallback) {
        return cachedDashboardResponse(request, env, fallback.payload, fallback.storedAt, "STALE");
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
