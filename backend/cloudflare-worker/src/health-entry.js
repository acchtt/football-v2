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

async function probeAirtable(env) {
  if (!env.AIRTABLE_TOKEN) return { ok: false, status: 0, error: "AIRTABLE_TOKEN missing" };
  const base = env.AIRTABLE_BASE_ID || "appWyZJjitSBATXAU";
  const url = new URL(`https://api.airtable.com/v0/${base}/tblcl1UAyMqZT6Ub0`);
  url.searchParams.set("pageSize", "1");
  url.searchParams.append("fields[]", "Match");
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` } });
    const text = await r.text();
    return { ok: r.ok, status: r.status, error: r.ok ? null : text.slice(0, 300) };
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

async function probeBsd(env) {
  if (!env.BSD_API_TOKEN) return { ok: false, status: 0, error: "BSD_API_TOKEN missing" };
  const base = String(env.BSD_API_BASE_URL || "https://sports.bzzoiro.com/api/v2").replace(/\/$/, "");
  try {
    const r = await fetch(`${base}/events/?status=live&limit=1`, { headers: { Authorization: `Token ${env.BSD_API_TOKEN}` } });
    const text = await r.text();
    return { ok: r.ok, status: r.status, error: r.ok ? null : text.slice(0, 300) };
  } catch (error) {
    return { ok: false, status: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      const [airtable, bsd] = await Promise.all([probeAirtable(env), probeBsd(env)]);
      return new Response(JSON.stringify({
        ok: airtable.ok,
        service: "football-v2",
        airtable,
        bsd,
        dashboardMode: "airtable-only",
        generatedAt: new Date().toISOString(),
      }), {
        status: airtable.ok ? 200 : 502,
        headers: { "Content-Type": "application/json; charset=utf-8", ...cors(env, request) },
      });
    }
    return app.fetch(request, env, ctx);
  },
};
