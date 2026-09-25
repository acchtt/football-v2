import app from "./index.js";

const ZONE = "Asia/Ho_Chi_Minh";

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

function parseDay(url) {
  const raw = url.searchParams.get("day") ?? "0";
  const day = Number(raw);
  if (!Number.isInteger(day) || day < -7 || day > 7) return null;
  return day;
}

function dayKey(day) {
  const d = new Date(Date.now() + day * 86400000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (type) => parts.find((x) => x.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function kickoffDay(row) {
  const value = row?.displayKickoff || row?.kickoff;
  if (!value || !Number.isFinite(Date.parse(value))) return String(row?.slateDate || "");
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const get = (type) => parts.find((x) => x.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}


function normalizeTeam(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(women|woman|ladies|w|femenino|feminine)\b/g, " ")
    .replace(/\b(fc|cf|afc|sc|ac|sk|fk|club|sv|cd|sd|ifk|bk|ff|dff|ik)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.length > 5 && token.endsWith("s") ? token.slice(0, -1) : token)
    .join(" ")
    .trim();
}

function splitMatch(match = "") {
  for (const separator of [/\s+vs\.?\s+/i, /\s+v\.?\s+/i, /\s+—\s+/, /\s+–\s+/, /\s+-\s+/]) {
    const parts = String(match).split(separator).map((x) => x.trim()).filter(Boolean);
    if (parts.length === 2) return { home: parts[0], away: parts[1] };
  }
  return { home: String(match), away: "" };
}

function nameScore(a, b) {
  const left = normalizeTeam(a);
  const right = normalizeTeam(b);
  if (!left || !right) return 0;
  if (left === right) return 6;
  if (left.includes(right) || right.includes(left)) return 4;
  const aTokens = new Set(left.split(" "));
  const bTokens = new Set(right.split(" "));
  let shared = 0;
  for (const token of aTokens) if (bTokens.has(token)) shared += 1;
  const overlap = shared / Math.max(aTokens.size, bTokens.size);
  return overlap >= 0.75 ? 4 : overlap >= 0.5 ? 3 : 0;
}

function fixtureScore(boardRow, fixture) {
  const teams = splitMatch(boardRow.match || "");
  const names = nameScore(teams.home, fixture.homeTeam) + nameScore(teams.away, fixture.awayTeam);
  if (names < 6) return -1;
  let score = names * 10;
  const boardTime = Date.parse(boardRow.displayKickoff || boardRow.kickoff || "");
  const fixtureTime = Number(fixture.kickoffTimestamp) * 1000;
  if (Number.isFinite(boardTime) && Number.isFinite(fixtureTime) && fixtureTime > 0) {
    const hours = Math.abs(boardTime - fixtureTime) / 3600000;
    if (hours <= 3) score += 8;
    else if (hours <= 12) score += 4;
    else if (hours <= 24) score += 1;
    else score -= 8;
  }
  return score;
}

function bestFixture(boardRow, fixtures, used) {
  let best = null;
  for (const fixture of fixtures) {
    if (used.has(fixture.matchId)) continue;
    const score = fixtureScore(boardRow, fixture);
    if (score < 0) continue;
    if (!best || score > best.score) best = { score, fixture };
  }
  if (best) used.add(best.fixture.matchId);
  return best?.fixture || null;
}

async function readJson(response, label) {
  const raw = await response.text();
  let payload;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    const start = raw.slice(0, 160).replace(/\s+/g, " ");
    throw new Error(`${label} returned non-JSON HTTP ${response.status}: ${start}`);
  }
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || `${label} HTTP ${response.status}`);
  }
  return payload;
}

function competitionPageUrl(path) {
  const clean = String(path || "").trim();
  if (!/^\/[a-z0-9][a-z0-9/_-]*\/$/i.test(clean)) return null;
  return "https://www.flashscore.com/football" + clean;
}

async function fetchCompetitionLogo(path, ctx) {
  const pageUrl = competitionPageUrl(path);
  if (!pageUrl) return null;
  const cache = caches.default;
  const cacheKey = new Request("https://soccerway-livescore.local/competition-logo?path=" + encodeURIComponent(path));
  const cached = await cache.match(cacheKey);
  if (cached) {
    const value = await cached.text();
    return value || null;
  }
  try {
    const response = await fetch(pageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/153.0.0.0 Safari/537.36",
        Accept: "text/html,*/*",
        "Accept-Language": "en-GB,en;q=0.9",
      },
      redirect: "follow",
    });
    if (!response.ok) return null;
    const html = await response.text();
    const matches = html.match(/https:\/\/static\.flashscore\.com\/res\/image\/data\/[A-Za-z0-9_-]+\.(?:png|svg|webp)/gi) || [];
    const logo = matches.find((value) => !value.includes("/bookmakers/")) || "";
    const cacheResponse = new Response(logo, { headers: { "Cache-Control": "public, max-age=604800" } });
    ctx.waitUntil(cache.put(cacheKey, cacheResponse));
    return logo || null;
  } catch {
    return null;
  }
}

async function fetchBoard(env) {
  if (!env.BOARD_API || typeof env.BOARD_API.fetch !== "function") {
    throw new Error("BOARD_API service binding is unavailable");
  }
  const response = await env.BOARD_API.fetch("https://board.internal/api/dashboard-data");
  const payload = await readJson(response, "Board API");
  return Array.isArray(payload.schedule) ? payload.schedule : [];
}

async function fetchSoccerwayFixtures(day, env, ctx) {
  const request = new Request(`https://soccerway.internal/api/fixtures?day=${day}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const response = await app.fetch(request, env, ctx);
  const payload = await readJson(response, "Soccerway feed");
  return Array.isArray(payload.fixtures) ? payload.fixtures : [];
}

async function boardApi(url, env, ctx) {
  const day = parseDay(url);
  if (day === null) return json({ ok: false, error: "day must be an integer from -7 to 7" }, 400);

  const targetDate = dayKey(day);
  const soccerwayDays = [day - 1, day].filter((value) => value >= -7 && value <= 7);
  const [boardRows, ...fixtureSets] = await Promise.all([
    fetchBoard(env),
    ...soccerwayDays.map((value) => fetchSoccerwayFixtures(value, env, ctx)),
  ]);
  const soccerwayFixtures = [...new Map(
    fixtureSets.flat().map((fixture) => [fixture.matchId, fixture])
  ).values()];

  const board = boardRows.filter((row) =>
    ["FOCUS", "WATCHLIST"].includes(String(row.tier || "").toUpperCase()) &&
    kickoffDay(row) === targetDate
  );
  const used = new Set();

  const fixtures = board.map((row) => {
    const matched = bestFixture(row, soccerwayFixtures, used);
    const teams = splitMatch(row.match || "");
    const kickoff = row.displayKickoff || row.kickoff || null;
    const base = matched || {
      matchId: `board:${row.id}`,
      competition: row.competition || "",
      competitionId: "",
      competitionPath: "",
      competitionLogo: null,
      region: "",
      kickoffTimestamp: kickoff ? Math.floor(Date.parse(kickoff) / 1000) : null,
      kickoffUtcSource: kickoff,
      homeTeam: teams.home,
      awayTeam: teams.away,
      homeTeamId: "",
      awayTeamId: "",
      homeLogoUrl: null,
      awayLogoUrl: null,
      homeScore: null,
      awayScore: null,
      status: "scheduled",
      statusText: "Scheduled",
      minute: null,
      source: "Board",
      rawStatusCode: "",
    };

    return {
      ...base,
      homeTeam: teams.home || base.homeTeam,
      awayTeam: teams.away || base.awayTeam,
      competition: row.competition || base.competition,
      boardId: row.id,
      boardMatch: row.match || "",
      sourceSlateDate: row.slateDate || "",
      boardKickoff: kickoff,
      tier: String(row.tier || "").toUpperCase(),
      grade: row.grade || "",
      structure: row.structure || "",
      matchedToSoccerway: Boolean(matched),
    };
  });
  const paths = [...new Set(fixtures.filter((fixture) => fixture.matchedToSoccerway && fixture.competitionPath).map((fixture) => fixture.competitionPath))];
  const logos = new Map(await Promise.all(paths.map(async (path) => [path, await fetchCompetitionLogo(path, ctx)])));
  fixtures.forEach((fixture) => {
    fixture.competitionLogo = fixture.competitionPath ? logos.get(fixture.competitionPath) || null : null;
  });

  return json({
    ok: true,
    source: "SlipTrace FOCUS/WATCHLIST + Soccerway",
    project: "soccerway-livescore",
    day,
    slateDate: targetDate,
    count: fixtures.length,
    focusCount: fixtures.filter((f) => f.tier === "FOCUS").length,
    watchlistCount: fixtures.filter((f) => f.tier === "WATCHLIST").length,
    liveCount: fixtures.filter((f) => f.status === "live").length,
    matchedCount: fixtures.filter((f) => f.matchedToSoccerway).length,
    fixtures,
    generatedAt: new Date().toISOString(),
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/board") {
      try {
        return await boardApi(url, env, ctx);
      } catch (error) {
        return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 502);
      }
    }
    return app.fetch(request, env, ctx);
  },
};
