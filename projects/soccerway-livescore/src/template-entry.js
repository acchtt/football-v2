import app from "./board-entry.js";
import { clientScript, renderSiteHtml } from "./template-ui.js";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

async function dashboardPayload(env) {
  if (!env.BOARD_API || typeof env.BOARD_API.fetch !== "function") {
    return { ok: false, schedule: [], picks: [], error: "BOARD_API service binding is unavailable" };
  }
  try {
    const upstream = await env.BOARD_API.fetch("https://board.internal/api/dashboard-data");
    const raw = await upstream.text();
    let payload;
    try { payload = raw ? JSON.parse(raw) : null; }
    catch { return { ok: false, schedule: [], picks: [], error: `Board API returned non-JSON HTTP ${upstream.status}` }; }
    if (!upstream.ok || !payload?.ok) return { ok: false, schedule: [], picks: [], error: payload?.error || `Board API HTTP ${upstream.status}` };
    return payload;
  } catch (error) {
    return { ok: false, schedule: [], picks: [], error: error instanceof Error ? error.message : String(error) };
  }
}

async function dashboardResponse(env) {
  const payload = await dashboardPayload(env);
  return json(payload, payload?.ok === false ? 502 : 200);
}

async function initialBoard(url, env, ctx) {
  const rawDay = Number(url.searchParams.get("day") ?? 0);
  const day = Number.isInteger(rawDay) && rawDay >= -7 && rawDay <= 7 ? rawDay : 0;
  try {
    const response = await app.fetch(new Request(`https://soccerway.internal/api/board?day=${day}`, { headers: { Accept: "application/json" } }), env, ctx);
    const raw = await response.text();
    const payload = raw ? JSON.parse(raw) : null;
    if (response.ok && payload?.ok && Array.isArray(payload.fixtures)) return payload;
  } catch {}
  return { ok: true, source: "SlipTrace FOCUS/WATCHLIST + Soccerway", day, fixtures: [], count: 0, focusCount: 0, watchlistCount: 0, liveCount: 0, matchedCount: 0, generatedAt: new Date().toISOString() };
}

function cleanView(value) {
  const allowed = new Set(["today", "board", "leagues", "teams", "picks"]);
  return allowed.has(String(value || "")) ? String(value) : "today";
}

function cleanStatus(value) {
  const allowed = new Set(["live", "scheduled", "ft"]);
  return allowed.has(String(value || "")) ? String(value) : null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      const [board, dashboard] = await Promise.all([initialBoard(url, env, ctx), dashboardPayload(env)]);
      const view = cleanView(url.searchParams.get("view"));
      const status = cleanStatus(url.searchParams.get("status"));
      const query = String(url.searchParams.get("q") || "").slice(0, 120);
      return new Response(renderSiteHtml(board, { view, status, dashboard, query }), {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store, max-age=0",
          "X-SlipTrace-Frontend": "soccerway-template-v4",
        },
      });
    }

    if (request.method === "GET" && ["/sliptrace-client-v4.js", "/sliptrace-client-v3.js", "/app.js"].includes(url.pathname)) {
      return new Response(clientScript(), {
        status: 200,
        headers: {
          "Content-Type": "application/javascript; charset=utf-8",
          "Cache-Control": "no-store, max-age=0",
          "X-SlipTrace-Asset": "soccerway-client-v4",
        },
      });
    }

    if (request.method === "GET" && url.pathname === "/api/dashboard-data") {
      return dashboardResponse(env);
    }

    return app.fetch(request, env, ctx);
  },
};
