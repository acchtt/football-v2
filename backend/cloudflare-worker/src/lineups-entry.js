import app from "./stable-entry.js";

const LINEUPS_TTL_MS = 30000;
const LINEUPS_STALE_MS = 10 * 60 * 1000;
const cache = new Map();
const inFlight = new Map();

function allowedOrigin(env, request) {
  const allowed = String(env.ALLOWED_ORIGIN || "https://acchtt.github.io")
    .split(",").map((x) => x.trim()).filter(Boolean);
  const origin = request.headers.get("Origin");
  if (!origin) return allowed[0] || "*";
  return allowed.includes(origin) ? origin : null;
}

function cors(env, request) {
  const accepted = allowedOrigin(env, request);
  return {
    ...(accepted ? { "Access-Control-Allow-Origin": accepted } : {}),
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
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

function eventId(url) {
  const value = Number(url.searchParams.get("event_id"));
  return Number.isInteger(value) && value > 0 ? value : null;
}

async function bsdLineups(env, id) {
  if (!env.BSD_API_TOKEN) throw new Error("BSD_API_TOKEN missing");
  const base = String(env.BSD_API_BASE_URL || "https://sports.bzzoiro.com/api/v2").replace(/\/$/, "");
  const response = await fetch(`${base}/events/${id}/lineups/`, {
    headers: { Authorization: `Token ${env.BSD_API_TOKEN}`, Accept: "application/json" },
  });
  const body = await response.text();
  let payload = null;
  try { payload = body ? JSON.parse(body) : null; } catch {}
  if (!response.ok) throw new Error(`BSD HTTP ${response.status}: ${body.slice(0, 240)}`);
  return payload;
}

async function lineups(env, id) {
  const now = Date.now();
  const cached = cache.get(id);
  if (cached && now - cached.at < LINEUPS_TTL_MS) return { ...cached.value, cached: true };
  if (inFlight.has(id)) return inFlight.get(id);

  const task = bsdLineups(env, id).then((lineups) => {
    const value = { ok: true, eventId: id, lineups, cached: false, generatedAt: new Date().toISOString() };
    cache.set(id, { at: Date.now(), value });
    if (cache.size > 80) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, cache.size - 80);
      for (const [key] of oldest) cache.delete(key);
    }
    return value;
  }).finally(() => inFlight.delete(id));

  inFlight.set(id, task);
  return task;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS" && url.pathname === "/api/match-lineups") {
      return new Response(null, { status: 204, headers: cors(env, request) });
    }

    if (request.method === "GET" && url.pathname === "/api/match-lineups") {
      const id = eventId(url);
      if (!id) return json({ ok: false, error: "valid event_id is required" }, 400, env, request);
      try {
        return json(await lineups(env, id), 200, env, request);
      } catch (error) {
        const cached = cache.get(id);
        if (cached && Date.now() - cached.at < LINEUPS_STALE_MS) {
          return json({ ...cached.value, cached: true, degraded: true, error: error instanceof Error ? error.message : String(error) }, 200, env, request);
        }
        return json({ ok: false, eventId: id, error: error instanceof Error ? error.message : String(error) }, 502, env, request);
      }
    }

    return app.fetch(request, env, ctx);
  },
};
