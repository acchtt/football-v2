import app from "./board-entry.js";
import { renderSiteHtml } from "./template-ui.js";

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

async function dashboardResponse(env) {
  if (!env.BOARD_API || typeof env.BOARD_API.fetch !== "function") {
    return json({ ok: false, error: "BOARD_API service binding is unavailable" }, 503);
  }

  try {
    const upstream = await env.BOARD_API.fetch("https://board.internal/api/dashboard-data");
    const raw = await upstream.text();
    let payload;
    try {
      payload = raw ? JSON.parse(raw) : null;
    } catch {
      return json({
        ok: false,
        error: `Board API returned non-JSON HTTP ${upstream.status}: ${raw.slice(0, 140).replace(/\s+/g, " ")}`,
      }, 502);
    }

    if (!upstream.ok || !payload?.ok) {
      return json({ ok: false, error: payload?.error || `Board API HTTP ${upstream.status}` }, upstream.ok ? 502 : upstream.status);
    }

    return json(payload, 200);
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 502);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      return new Response(renderSiteHtml(), {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store, max-age=0",
          "X-SlipTrace-Frontend": "soccerway-template-v1",
        },
      });
    }

    if (request.method === "GET" && url.pathname === "/api/dashboard-data") {
      return dashboardResponse(env);
    }

    return app.fetch(request, env, ctx);
  },
};
