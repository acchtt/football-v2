import app from "./assets-entry.js";

function cors(env, request) {
  const allowed = String(env.ALLOWED_ORIGIN || "https://acchtt.github.io")
    .split(",").map((x) => x.trim()).filter(Boolean);
  const origin = request.headers.get("Origin");
  const accepted = !origin ? allowed[0] || "*" : allowed.includes(origin) ? origin : null;
  return {
    ...(accepted ? { "Access-Control-Allow-Origin": accepted } : {}),
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store, max-age=0",
    Vary: "Origin",
  };
}

function json(data, status, env, request) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors(env, request) },
  });
}

const SOCCERWAY_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153.0.0.0 Safari/537.36",
  Accept: "*/*",
  "Accept-Language": "en-GB,en;q=0.9",
  Referer: "https://www.soccerway.com/",
  Origin: "https://www.soccerway.com",
  "x-fsign": "SW9D1eZo",
};

async function fetchText(url, headers = SOCCERWAY_HEADERS) {
  try {
    const response = await fetch(url, { headers, redirect: "follow" });
    const body = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      finalUrl: response.url,
      contentType: response.headers.get("content-type") || "",
      body,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      finalUrl: url,
      contentType: "",
      body: "",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function compactProbe(result) {
  const body = result.body || "";
  return {
    ok: result.ok,
    status: result.status,
    finalUrl: result.finalUrl,
    contentType: result.contentType,
    bytes: body.length,
    startsWith: body.slice(0, 140).replace(/\s+/g, " "),
    looksLikeFeed: /(?:^|[¬~])(?:AA|ZA|AD)÷/.test(body),
    hasMatchRecord: /AA÷[A-Za-z0-9]{6,12}/.test(body),
    error: result.error,
  };
}

async function soccerwayProbe() {
  const homepage = await fetchText("https://www.soccerway.com/", {
    "User-Agent": SOCCERWAY_HEADERS["User-Agent"],
    Accept: "text/html,application/xhtml+xml",
    "Accept-Language": SOCCERWAY_HEADERS["Accept-Language"],
  });

  const html = homepage.body || "";
  const hints = {
    hasFlashscoreAssets: /static\.flashscore\.com/i.test(html),
    hasLsapp: /lsapp\.eu/i.test(html),
    hasNinja: /flashscore\.ninja/i.test(html),
    hasXFeed: /\/x\/feed\//i.test(html),
    projectIds: [...new Set(Array.from(html.matchAll(/(?:projectId|project_id)["'\s:=]+(\d+)/gi), (m) => m[1]))].slice(0, 10),
    feedFragments: [...new Set(Array.from(html.matchAll(/[^"'\s<>]{0,120}\/x\/feed\/[^"'\s<>]{0,120}/gi), (m) => m[0]))].slice(0, 10),
    livesportHosts: [...new Set(Array.from(html.matchAll(/https?:\/\/[^"'\s<>]*(?:flashscore\.ninja|lsapp\.eu)[^"'\s<>]*/gi), (m) => m[0]))].slice(0, 10),
  };

  const candidates = [
    "https://www.soccerway.com/x/feed/f_1_0_3_en_1",
    "https://www.soccerway.com/x/feed/f_1_0_3_en-gb_1",
    "https://www.soccerway.com/x/feed/f_1_0_3_en_5",
    "https://d.soccerway.com/x/feed/f_1_0_3_en_1",
  ];

  const probes = [];
  for (const url of candidates) {
    const result = await fetchText(url);
    probes.push({ url, ...compactProbe(result) });
  }

  return {
    ok: homepage.ok,
    homepage: compactProbe(homepage),
    hints,
    probes,
    generatedAt: new Date().toISOString(),
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS" && url.pathname === "/api/soccerway-probe") {
      return new Response(null, { status: 204, headers: cors(env, request) });
    }
    if (request.method === "GET" && url.pathname === "/api/soccerway-probe") {
      const result = await soccerwayProbe();
      return json(result, result.ok ? 200 : 502, env, request);
    }
    return app.fetch(request, env, ctx);
  },
};
