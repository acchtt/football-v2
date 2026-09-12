const TABLES = {
  coverage: "tblcl1UAyMqZT6Ub0",
  picks: "tblg3J5sbJYbzuTYD",
  manualScores: "tblvsHegh2WZ8qor2",
};

const COVERAGE_FIELDS = [
  "Coverage ID", "Slate Date", "Match", "Competition", "Kickoff ICT",
  "Coverage Status", "PRE Grade", "Structural Type", "Board Tier",
  "XI Status", "Market Status", "Screened At", "Frozen PRE Summary", "Coverage Notes",
];

const PICK_FIELDS = [
  "Pick ID", "Match", "Competition", "Kickoff", "Model Version", "Verdict",
  "Line", "Odds", "Stake u", "Result", "P/L u", "Recorded At", "Reason",
];

const MANUAL_FIELDS = ["Score Key", "Match", "Kickoff ICT", "Home Score", "Away Score", "Updated At"];
const ZONE = "Asia/Ho_Chi_Minh";

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

function allowedOrigin(env, request) {
  const configured = String(env.ALLOWED_ORIGIN || "https://acchtt.github.io");
  const allowed = configured.split(",").map((x) => x.trim()).filter(Boolean);
  const origin = request.headers.get("Origin");
  if (!origin) return allowed[0] || "*";
  return allowed.includes(origin) ? origin : null;
}

function cors(env, request, methods = "GET,POST,OPTIONS") {
  const origin = allowedOrigin(env, request);
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store, max-age=0",
    Vary: "Origin",
  };
}

function selectName(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "name" in value) return String(value.name || "");
  return "";
}

function timestamp(value) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalize(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeTeam(value = "") {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(fc|cf|afc|sc|ac|sk|fk|club)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitFixtureName(match = "") {
  for (const separator of [/\s+vs\.?\s+/i, /\s+v\.?\s+/i, /\s+—\s+/, /\s+–\s+/]) {
    const parts = String(match).split(separator).map((part) => part.trim()).filter(Boolean);
    if (parts.length === 2) return { home: parts[0], away: parts[1] };
  }
  return undefined;
}

function dateKey(value) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function slateDay(row) {
  const slate = row["Slate Date"];
  if (slate && /^\d{4}-\d{2}-\d{2}$/.test(slate)) return slate;
  const kickoff = row["Kickoff ICT"];
  return kickoff && timestamp(kickoff) ? dateKey(kickoff) : "";
}

function fixtureKey(row) {
  return `${normalize(row.Match)}|${slateDay(row)}`;
}

function manualScoreKey(match, kickoff) {
  return `${normalize(match)}|${new Date(kickoff).toISOString()}`;
}

async function airtableFetch(env, path, init = {}) {
  if (!env.AIRTABLE_TOKEN) throw new Error("AIRTABLE_TOKEN is not configured in Cloudflare Workers.");
  const base = env.AIRTABLE_BASE_ID || "appWyZJjitSBATXAU";
  const url = new URL(`https://api.airtable.com/v0/${base}/${path}`);
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.AIRTABLE_TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Airtable HTTP ${response.status}: ${text.slice(0, 500) || "request rejected"}`);
  }
  return response;
}

async function airtableRecords(env, table, fields, sort) {
  const out = [];
  let offset;
  do {
    const base = env.AIRTABLE_BASE_ID || "appWyZJjitSBATXAU";
    const url = new URL(`https://api.airtable.com/v0/${base}/${table}`);
    url.searchParams.set("pageSize", "100");
    for (const field of fields) url.searchParams.append("fields[]", field);
    if (sort) {
      url.searchParams.set("sort[0][field]", sort.field);
      url.searchParams.set("sort[0][direction]", sort.direction);
    }
    if (offset) url.searchParams.set("offset", offset);
    if (!env.AIRTABLE_TOKEN) throw new Error("AIRTABLE_TOKEN is not configured in Cloudflare Workers.");
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Airtable HTTP ${response.status}: ${text.slice(0, 500) || "request rejected"}`);
    }
    const payload = await response.json();
    out.push(...(payload.records || []));
    offset = payload.offset;
  } while (offset);
  return out;
}

async function createRecord(env, table, fields) {
  const response = await airtableFetch(env, table, {
    method: "POST",
    body: JSON.stringify({ records: [{ fields }] }),
  });
  const payload = await response.json();
  if (!payload.records?.[0]) throw new Error("Airtable create returned no record.");
  return payload.records[0];
}

async function updateRecord(env, table, recordId, fields) {
  const response = await airtableFetch(env, `${table}/${recordId}`, {
    method: "PATCH",
    body: JSON.stringify({ fields }),
  });
  return response.json();
}

async function deleteRecord(env, table, recordId) {
  const response = await airtableFetch(env, `${table}/${recordId}`, { method: "DELETE" });
  return response.json();
}

async function fetchManualScores(env) {
  const output = new Map();
  const rows = await airtableRecords(env, TABLES.manualScores, MANUAL_FIELDS, { field: "Updated At", direction: "desc" });
  for (const row of rows) {
    const key = row.fields?.["Score Key"];
    const home = row.fields?.["Home Score"];
    const away = row.fields?.["Away Score"];
    if (!key || typeof home !== "number" || typeof away !== "number") continue;
    if (!output.has(key)) output.set(key, { home, away, updatedAt: row.fields?.["Updated At"] });
  }
  return output;
}

function getManualScore(scores, match, kickoff) {
  return scores.get(manualScoreKey(match, kickoff));
}

async function saveManualScore(env, match, kickoff, home, away) {
  const key = manualScoreKey(match, kickoff);
  const rows = await airtableRecords(env, TABLES.manualScores, ["Score Key"]);
  const existing = rows.find((row) => row.fields?.["Score Key"] === key);
  if (home === null || away === null) {
    if (existing) await deleteRecord(env, TABLES.manualScores, existing.id);
    return;
  }
  const fields = {
    "Score Key": key,
    Match: match,
    "Kickoff ICT": new Date(kickoff).toISOString(),
    "Home Score": home,
    "Away Score": away,
    "Updated At": new Date().toISOString(),
  };
  if (existing) await updateRecord(env, TABLES.manualScores, existing.id, fields);
  else await createRecord(env, TABLES.manualScores, fields);
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
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function stringish(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}
function teamName(value, flat) {
  if (typeof flat === "string" && flat.trim()) return flat.trim();
  if (typeof value === "string" && value.trim()) return value.trim();
  if (isRecord(value)) {
    const name = value.name ?? value.short_name;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  return "";
}
function payloadRows(payload) {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];
  const batch = [payload.results, payload.events, payload.live, payload.matches, payload.data].find(Array.isArray);
  return batch ? batch.filter(isRecord) : [payload];
}
function nameScore(a, b) {
  const left = normalizeTeam(a), right = normalizeTeam(b);
  if (!left || !right) return 0;
  if (left === right) return 6;
  if (left.includes(right) || right.includes(left)) return 4;
  const aTokens = new Set(left.split(" ")), bTokens = new Set(right.split(" "));
  let shared = 0;
  for (const token of aTokens) if (bTokens.has(token)) shared += 1;
  const overlap = shared / Math.max(aTokens.size, bTokens.size);
  return overlap >= 0.75 ? 4 : overlap >= 0.5 ? 3 : 0;
}
function lookupKey(match, kickoff) { return `${match}\u0000${kickoff}`; }
function utcDay(value) { return new Date(value).toISOString().slice(0, 10); }
function addDays(day, amount) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return utcDay(date);
}

function parseEvent(row, defaultStatus = "") {
  const score = isRecord(row.score) ? row.score : undefined;
  const time = isRecord(row.time) ? row.time : undefined;
  const id = numeric(row.id ?? row.event_id);
  const eventDate = text(row.event_date ?? row.date ?? row.kickoff ?? row.kickoff_at ?? time?.kickoff_at) || "";
  const home = teamName(row.home_team ?? row.home, row.home_team_name ?? row.home_name);
  const away = teamName(row.away_team ?? row.away, row.away_team_name ?? row.away_name);
  if (id === undefined || !eventDate || !home || !away) return undefined;
  return {
    id, eventDate, home, away,
    status: String(row.status ?? time?.status ?? defaultStatus).toLowerCase(),
    homeScore: numeric(row.home_score ?? score?.home ?? score?.home_score),
    awayScore: numeric(row.away_score ?? score?.away ?? score?.away_score),
    period: stringish(row.period ?? row.current_period ?? row.match_period ?? time?.period ?? time?.display),
    currentMinute: numeric(row.current_minute ?? row.minute ?? time?.minute ?? time?.current_minute),
  };
}

function parseLive(row) {
  const event = isRecord(row.event) ? row.event : undefined;
  const merged = event ? { ...event, ...row } : row;
  const parsed = parseEvent(merged, "live");
  if (parsed) return parsed;
  const score = isRecord(row.score) ? row.score : undefined;
  const time = isRecord(row.time) ? row.time : undefined;
  const id = numeric(row.id ?? row.event_id ?? event?.id ?? event?.event_id);
  const home = teamName(row.home_team ?? row.home ?? event?.home_team ?? event?.home, row.home_team_name ?? row.home_name ?? event?.home_team_name);
  const away = teamName(row.away_team ?? row.away ?? event?.away_team ?? event?.away, row.away_team_name ?? row.away_name ?? event?.away_team_name);
  if (!home || !away) return undefined;
  return {
    id,
    eventDate: text(row.event_date ?? row.date ?? row.kickoff ?? row.kickoff_at ?? time?.kickoff_at) || "",
    home, away,
    status: String(row.status ?? time?.status ?? "live").toLowerCase(),
    homeScore: numeric(row.home_score ?? score?.home ?? score?.home_score),
    awayScore: numeric(row.away_score ?? score?.away ?? score?.away_score),
    period: stringish(row.period ?? row.current_period ?? row.match_period ?? time?.period ?? time?.display),
    currentMinute: numeric(row.current_minute ?? row.minute ?? time?.minute ?? time?.current_minute),
  };
}

async function bsdFetchJson(env, path) {
  if (!env.BSD_API_TOKEN) return { ok: false, status: 503, payload: null, error: "BSD_API_TOKEN is not configured" };
  const base = String(env.BSD_API_BASE_URL || "https://sports.bzzoiro.com/api/v2").replace(/\/$/, "");
  const response = await fetch(`${base}${path}`, { headers: { Authorization: `Token ${env.BSD_API_TOKEN}` } });
  const body = await response.text();
  let payload = null;
  try { payload = body ? JSON.parse(body) : null; } catch {}
  return { ok: response.ok, status: response.status, payload, error: response.ok ? undefined : body.slice(0, 300) };
}

async function bsdGetAll(env, dateFrom, dateTo) {
  if (!env.BSD_API_TOKEN) return [];
  const base = String(env.BSD_API_BASE_URL || "https://sports.bzzoiro.com/api/v2").replace(/\/$/, "");
  const results = [];
  let offset = 0;
  const limit = 200;
  for (;;) {
    const url = new URL(`${base}/events/`);
    url.searchParams.set("date_from", dateFrom);
    url.searchParams.set("date_to", dateTo);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));
    const response = await fetch(url, { headers: { Authorization: `Token ${env.BSD_API_TOKEN}` } });
    if (!response.ok) throw new Error(`BSD events returned ${response.status}`);
    const payload = await response.json();
    const batch = payloadRows(payload);
    results.push(...batch);
    if (!isRecord(payload) || !payload.next || batch.length < limit) break;
    offset += limit;
  }
  return results;
}

function eventMatchScore(target, event) {
  const teams = splitFixtureName(target.match);
  if (!teams) return -1;
  const home = nameScore(teams.home, event.home), away = nameScore(teams.away, event.away);
  if (home < 3 || away < 3) return -1;
  const targetTime = new Date(target.kickoff).getTime(), eventTime = new Date(event.eventDate).getTime();
  if (!Number.isFinite(targetTime) || !Number.isFinite(eventTime)) return -1;
  const hours = Math.abs(targetTime - eventTime) / 3_600_000;
  if (hours > 12) return -1;
  const timeScore = hours <= 1 ? 4 : hours <= 3 ? 3 : hours <= 6 ? 2 : 1;
  return home + away + timeScore;
}

async function fetchBsdFixtures(env, fixtures) {
  const output = new Map();
  if (!fixtures.length || !env.BSD_API_TOKEN) return output;
  const times = fixtures.map((f) => new Date(f.kickoff).getTime()).filter(Number.isFinite).sort((a, b) => a - b);
  if (!times.length) return output;
  const start = addDays(utcDay(times[0]), -1), end = addDays(utcDay(times[times.length - 1]), 1);
  const rows = [];
  let cursor = start;
  while (cursor <= end) {
    const chunkEnd = [addDays(cursor, 13), end].sort()[0];
    rows.push(...await bsdGetAll(env, cursor, chunkEnd));
    cursor = addDays(chunkEnd, 1);
  }
  let events = rows.map((row) => parseEvent(row)).filter(Boolean);
  const compact = await bsdFetchJson(env, "/events/live/");
  const live = compact.ok ? payloadRows(compact.payload).map(parseLive).filter(Boolean) : [];
  const liveById = new Map(live.filter((x) => x.id !== undefined).map((x) => [x.id, x]));
  events = events.map((event) => {
    const patch = liveById.get(event.id);
    return patch ? {
      ...event,
      eventDate: patch.eventDate || event.eventDate,
      home: patch.home || event.home,
      away: patch.away || event.away,
      status: patch.status || "live",
      homeScore: patch.homeScore ?? event.homeScore,
      awayScore: patch.awayScore ?? event.awayScore,
      period: patch.period ?? event.period,
      currentMinute: patch.currentMinute ?? event.currentMinute,
    } : event;
  });
  for (const fixture of fixtures) {
    const best = events
      .map((event) => ({ event, score: eventMatchScore(fixture, event) }))
      .filter((entry) => entry.score >= 10)
      .sort((a, b) => b.score - a.score)[0]?.event;
    if (!best) continue;
    output.set(lookupKey(fixture.match, fixture.kickoff), {
      eventId: best.id,
      homeTeam: best.home,
      awayTeam: best.away,
      kickoff: best.eventDate,
      status: best.status,
      home: best.homeScore,
      away: best.awayScore,
      period: best.period,
      currentMinute: best.currentMinute,
    });
  }
  return output;
}

function getBsdFixture(fixtures, match, kickoff) {
  return fixtures.get(lookupKey(match, kickoff));
}

async function dashboardData(env) {
  const [coverageRows, pickRows, manualScores] = await Promise.all([
    airtableRecords(env, TABLES.coverage, COVERAGE_FIELDS, { field: "Screened At", direction: "desc" }),
    airtableRecords(env, TABLES.picks, PICK_FIELDS, { field: "Recorded At", direction: "desc" }),
    fetchManualScores(env),
  ]);
  const latest = new Map();
  for (const record of [...coverageRows].sort((a, b) => timestamp(b.fields?.["Screened At"] || b.createdTime) - timestamp(a.fields?.["Screened At"] || a.createdTime))) {
    const key = fixtureKey(record.fields || {});
    if (!key || key.endsWith("|") || latest.has(key)) continue;
    latest.set(key, record);
  }
  const boardBase = [...latest.values()]
    .filter((record) => ["FOCUS", "WATCHLIST"].includes(selectName(record.fields?.["Board Tier"])))
    .filter((record) => Boolean(slateDay(record.fields || {})) && timestamp(record.fields?.["Kickoff ICT"]) > 0)
    .sort((a, b) => slateDay(b.fields || {}).localeCompare(slateDay(a.fields || {})) || timestamp(b.fields?.["Kickoff ICT"]) - timestamp(a.fields?.["Kickoff ICT"]));
  const pickBase = pickRows
    .filter((pick) => timestamp(pick.fields?.Kickoff) > 0)
    .sort((a, b) => timestamp(b.fields?.["Recorded At"] || b.fields?.Kickoff) - timestamp(a.fields?.["Recorded At"] || a.fields?.Kickoff));
  const fixtureRefs = [
    ...boardBase.flatMap((record) => record.fields?.Match && record.fields?.["Kickoff ICT"] ? [{ match: record.fields.Match, kickoff: record.fields["Kickoff ICT"] }] : []),
    ...pickBase.flatMap((record) => record.fields?.Match && record.fields?.Kickoff ? [{ match: record.fields.Match, kickoff: record.fields.Kickoff }] : []),
  ];
  const bsdFixtures = await fetchBsdFixtures(env, fixtureRefs);
  const schedule = boardBase.map((record) => {
    const row = record.fields || {}, match = row.Match || "Unknown fixture", kickoff = row["Kickoff ICT"];
    const bsd = getBsdFixture(bsdFixtures, match, kickoff), manual = getManualScore(manualScores, match, kickoff);
    return {
      id: record.id, slateDate: slateDay(row), match, competition: row.Competition || "", kickoff,
      displayKickoff: bsd?.kickoff || kickoff, tier: selectName(row["Board Tier"]), grade: selectName(row["PRE Grade"]),
      structure: selectName(row["Structural Type"]), xiStatus: selectName(row["XI Status"]), marketStatus: selectName(row["Market Status"]),
      coverageStatus: selectName(row["Coverage Status"]), frozenPreSummary: row["Frozen PRE Summary"] || "", coverageNotes: row["Coverage Notes"] || "",
      manualScore: manual || null,
      bsd: bsd ? { eventId: bsd.eventId, status: bsd.status, home: bsd.home, away: bsd.away, minute: bsd.currentMinute, period: bsd.period } : null,
    };
  });
  const picks = pickBase.map((record) => {
    const row = record.fields || {}, match = row.Match || "Unknown fixture", kickoff = row.Kickoff;
    const bsd = getBsdFixture(bsdFixtures, match, kickoff), manual = getManualScore(manualScores, match, kickoff);
    return {
      id: record.id, pickId: row["Pick ID"] || "", match, competition: row.Competition || "", kickoff, displayKickoff: bsd?.kickoff || kickoff,
      modelVersion: row["Model Version"] || "", verdict: selectName(row.Verdict), line: row.Line, odds: row.Odds, stake: row["Stake u"],
      result: selectName(row.Result) || "PENDING", pl: row["P/L u"], recordedAt: row["Recorded At"] || kickoff, reason: row.Reason || "",
      manualScore: manual || null,
      bsd: bsd ? { eventId: bsd.eventId, status: bsd.status, home: bsd.home, away: bsd.away, minute: bsd.currentMinute, period: bsd.period } : null,
    };
  });
  return { ok: true, schedule, picks, generatedAt: new Date().toISOString() };
}

async function liveScores(env) {
  const [statusLive, compactLive] = await Promise.all([
    bsdFetchJson(env, "/events/?status=live&limit=200"),
    bsdFetchJson(env, "/events/live/"),
  ]);
  const merged = new Map();
  for (const source of [statusLive, compactLive]) {
    if (!source.ok) continue;
    for (const row of payloadRows(source.payload)) {
      const event = parseLive(row);
      if (!event) continue;
      const key = event.id !== undefined ? `id:${event.id}` : `${event.home.toLowerCase()}|${event.away.toLowerCase()}`;
      const previous = merged.get(key);
      merged.set(key, previous ? { ...previous, ...event } : event);
    }
  }
  const events = [...merged.values()].map((event) => ({
    id: event.id, home: event.home, away: event.away,
    homeScore: event.homeScore, awayScore: event.awayScore,
    minute: event.currentMinute, period: event.period, status: event.status,
  }));
  return {
    ok: statusLive.ok || compactLive.ok,
    count: events.length,
    sources: {
      statusLive: { ok: statusLive.ok, status: statusLive.status, rows: statusLive.ok ? payloadRows(statusLive.payload).length : 0, error: statusLive.error },
      compactLive: { ok: compactLive.ok, status: compactLive.status, rows: compactLive.ok ? payloadRows(compactLive.payload).length : 0, error: compactLive.error },
    },
    events,
    generatedAt: new Date().toISOString(),
  };
}

async function handleManualScore(env, request) {
  if (!allowedOrigin(env, request)) return json({ ok: false, error: "Origin not allowed" }, 403, cors(env, request));
  const body = await request.json().catch(() => ({}));
  const match = typeof body.match === "string" ? body.match.trim() : "";
  const kickoff = typeof body.kickoff === "string" ? body.kickoff.trim() : "";
  const action = body.action === "clear" ? "clear" : "save";
  if (!match || !kickoff || !Number.isFinite(new Date(kickoff).getTime())) return json({ ok: false, error: "Match and kickoff are required." }, 400, cors(env, request));
  if (action === "clear") {
    await saveManualScore(env, match, kickoff, null, null);
    return json({ ok: true, action: "clear" }, 200, cors(env, request));
  }
  const home = Number(body.home), away = Number(body.away);
  if (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0 || home > 99 || away > 99) {
    return json({ ok: false, error: "Enter whole-number scores between 0 and 99." }, 400, cors(env, request));
  }
  await saveManualScore(env, match, kickoff, home, away);
  return json({ ok: true, action: "save", home, away }, 200, cors(env, request));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const headers = cors(env, request);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    try {
      if (url.pathname === "/" || url.pathname === "/health") {
        return json({ ok: true, service: "sliptrace-football-api", airtable: Boolean(env.AIRTABLE_TOKEN), bsd: Boolean(env.BSD_API_TOKEN) }, 200, headers);
      }
      if (request.method === "GET" && url.pathname === "/api/dashboard-data") return json(await dashboardData(env), 200, headers);
      if (request.method === "GET" && url.pathname === "/api/live-scores") return json(await liveScores(env), 200, headers);
      if (request.method === "POST" && url.pathname === "/api/manual-score") return handleManualScore(env, request);
      return json({ ok: false, error: "Not found" }, 404, headers);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return json({ ok: false, error: message }, 502, headers);
    }
  },
};
