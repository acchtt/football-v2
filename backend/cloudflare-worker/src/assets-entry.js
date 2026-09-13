import app from "./health-entry.js";

const MAX_DAYS = 14;
const MAX_PAGES = 6;
const PAGE_SIZE = 200;

function cors(env, request) {
  const allowed = String(env.ALLOWED_ORIGIN || "https://acchtt.github.io")
    .split(",").map((x) => x.trim()).filter(Boolean);
  const origin = request.headers.get("Origin");
  const accepted = !origin ? allowed[0] || "*" : allowed.includes(origin) ? origin : null;
  return {
    ...(accepted ? { "Access-Control-Allow-Origin": accepted } : {}),
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, max-age=300",
    Vary: "Origin",
  };
}

function json(data, status, env, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors(env, request) },
  });
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function numeric(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function identifier(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return text(value);
}

function teamName(value, flat) {
  if (text(flat)) return text(flat);
  if (text(value)) return text(value);
  if (isRecord(value)) return text(value.name ?? value.short_name);
  return "";
}

function teamId(value, flat) {
  const direct = numeric(flat);
  if (direct !== undefined) return direct;
  if (isRecord(value)) return numeric(value.id ?? value.team_id);
  return undefined;
}

function rowsFrom(payload) {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];
  const batch = [payload.results, payload.events, payload.matches, payload.data].find(Array.isArray);
  return batch ? batch.filter(isRecord) : [payload];
}

function isoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : "";
}

function daySpan(from, to) {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return Infinity;
  return Math.floor((b - a) / 86400000) + 1;
}

async function bsdPage(env, from, to, offset) {
  if (!env.BSD_API_TOKEN) throw new Error("BSD_API_TOKEN missing");
  const base = String(env.BSD_API_BASE_URL || "https://sports.bzzoiro.com/api/v2").replace(/\/$/, "");
  const url = new URL(`${base}/events/`);
  url.searchParams.set("date_from", from);
  url.searchParams.set("date_to", to);
  url.searchParams.set("limit", String(PAGE_SIZE));
  url.searchParams.set("offset", String(offset));
  const response = await fetch(url, { headers: { Authorization: `Token ${env.BSD_API_TOKEN}` } });
  const body = await response.text();
  let payload = null;
  try { payload = body ? JSON.parse(body) : null; } catch {}
  if (!response.ok) throw new Error(`BSD HTTP ${response.status}: ${body.slice(0, 240)}`);
  return payload;
}

function firstNumeric(values) {
  for (const value of values) {
    const n = numeric(value);
    if (n !== undefined) return n;
  }
  return undefined;
}

function firstOpaque(values) {
  for (const value of values) {
    const id = identifier(value);
    if (id && numeric(id) === undefined) return id;
  }
  return null;
}

function parseAsset(row) {
  const nested = isRecord(row.event) ? row.event : undefined;
  const source = nested ? { ...nested, ...row } : row;
  const homeObj = source.home_team ?? source.home;
  const awayObj = source.away_team ?? source.away;
  const home = teamName(homeObj, source.home_team_name ?? source.home_name);
  const away = teamName(awayObj, source.away_team_name ?? source.away_name);
  const homeTeamId = teamId(homeObj, source.home_team_id ?? source.home_id);
  const awayTeamId = teamId(awayObj, source.away_team_id ?? source.away_id);
  if (!home || !away || (homeTeamId === undefined && awayTeamId === undefined)) return null;

  // Do not flatten identifiers before classifying them. Some BSD list/live rows
  // expose an opaque provider/live key on the outer object while the nested event
  // carries the canonical numeric REST/WebSocket event id.
  const idCandidates = [
    nested?.id,
    nested?.event_id,
    nested?.match_id,
    row.event_id,
    row.match_id,
    row.id,
  ];
  const restId = firstNumeric(idCandidates);
  const liveId = firstOpaque([
    row.id,
    row.event_id,
    row.match_id,
    nested?.id,
    nested?.event_id,
    nested?.match_id,
  ]);

  const eventDate = text(source.event_date ?? source.date ?? source.kickoff ?? source.kickoff_at ?? source.time?.kickoff_at);
  const leagueId = numeric(source.league_id ?? source.league?.id);
  return {
    id: restId ?? liveId,
    restId,
    liveId,
    eventDate,
    home,
    away,
    homeTeamId,
    awayTeamId,
    leagueId,
    homeLogo: homeTeamId !== undefined ? `https://sports.bzzoiro.com/img/team/${homeTeamId}/?bg=transparent` : null,
    awayLogo: awayTeamId !== undefined ? `https://sports.bzzoiro.com/img/team/${awayTeamId}/?bg=transparent` : null,
  };
}

async function fixtureAssets(env, from, to) {
  const events = [];
  const seen = new Set();
  let offset = 0;
  let pages = 0;
  let total = null;

  while (pages < MAX_PAGES) {
    const payload = await bsdPage(env, from, to, offset);
    const rows = rowsFrom(payload);
    if (isRecord(payload) && numeric(payload.count) !== undefined) total = numeric(payload.count);
    for (const row of rows) {
      const asset = parseAsset(row);
      if (!asset) continue;
      const key = asset.restId !== undefined
        ? `rest:${asset.restId}`
        : asset.liveId
          ? `live:${asset.liveId}`
          : `${asset.home}|${asset.away}|${asset.eventDate}`;
      if (seen.has(key)) continue;
      seen.add(key);
      events.push(asset);
    }
    pages += 1;
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    if (total !== null && offset >= total) break;
  }

  return { ok: true, from, to, count: events.length, events, generatedAt: new Date().toISOString() };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(env, request) });

    if (request.method === "GET" && url.pathname === "/api/fixture-assets") {
      const now = new Date();
      const fallback = now.toISOString().slice(0, 10);
      const from = isoDate(url.searchParams.get("date_from")) || fallback;
      const to = isoDate(url.searchParams.get("date_to")) || from;
      if (daySpan(from, to) > MAX_DAYS) {
        return json({ ok: false, error: `date range must be ${MAX_DAYS} days or fewer` }, 400, env, request);
      }
      try {
        return json(await fixtureAssets(env, from, to), 200, env, request);
      } catch (error) {
        return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 502, env, request);
      }
    }

    return app.fetch(request, env, ctx);
  },
};
