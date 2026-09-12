import app from "./index.js";

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

function cors(env, request) {
  const configured = String(env.ALLOWED_ORIGIN || "https://acchtt.github.io");
  const allowed = configured.split(",").map((x) => x.trim()).filter(Boolean);
  const origin = request.headers.get("Origin");
  const accepted = !origin ? allowed[0] || "*" : allowed.includes(origin) ? origin : null;
  return {
    ...(accepted ? { "Access-Control-Allow-Origin": accepted } : {}),
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
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

function timestamp(value) {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}
function normalize(value = "") {
  return String(value).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
function selectName(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && !Array.isArray(value) && "name" in value) return String(value.name || "");
  return "";
}
function dateKey(value) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const get = (type) => parts.find((x) => x.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
function slateDay(row) {
  const slate = row?.["Slate Date"];
  if (slate && /^\d{4}-\d{2}-\d{2}$/.test(slate)) return slate;
  const kickoff = row?.["Kickoff ICT"];
  return kickoff && timestamp(kickoff) ? dateKey(kickoff) : "";
}
function fixtureKey(row) {
  return `${normalize(row?.Match)}|${slateDay(row || {})}`;
}
function manualScoreKey(match, kickoff) {
  return `${normalize(match)}|${new Date(kickoff).toISOString()}`;
}

async function airtableRecords(env, table, fields, sort) {
  if (!env.AIRTABLE_TOKEN) throw new Error("AIRTABLE_TOKEN is not configured in Cloudflare Workers.");
  const base = env.AIRTABLE_BASE_ID || "appWyZJjitSBATXAU";
  const out = [];
  let offset;
  do {
    const url = new URL(`https://api.airtable.com/v0/${base}/${table}`);
    url.searchParams.set("pageSize", "100");
    for (const field of fields) url.searchParams.append("fields[]", field);
    if (sort) {
      url.searchParams.set("sort[0][field]", sort.field);
      url.searchParams.set("sort[0][direction]", sort.direction);
    }
    if (offset) url.searchParams.set("offset", offset);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` } });
    if (!response.ok) throw new Error(`Airtable ${table} returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const payload = await response.json();
    out.push(...(payload.records || []));
    offset = payload.offset;
  } while (offset);
  return out;
}

async function airtableOnlyDashboard(env) {
  const [coverageRows, pickRows, manualRows] = await Promise.all([
    airtableRecords(env, TABLES.coverage, COVERAGE_FIELDS, { field: "Screened At", direction: "desc" }),
    airtableRecords(env, TABLES.picks, PICK_FIELDS, { field: "Recorded At", direction: "desc" }),
    airtableRecords(env, TABLES.manualScores, MANUAL_FIELDS, { field: "Updated At", direction: "desc" }),
  ]);

  const manualScores = new Map();
  for (const record of manualRows) {
    const row = record.fields || {};
    const key = row["Score Key"];
    const home = row["Home Score"], away = row["Away Score"];
    if (key && typeof home === "number" && typeof away === "number" && !manualScores.has(key)) {
      manualScores.set(key, { home, away, updatedAt: row["Updated At"] || "" });
    }
  }

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
    .filter((record) => timestamp(record.fields?.Kickoff) > 0)
    .sort((a, b) => timestamp(b.fields?.["Recorded At"] || b.fields?.Kickoff) - timestamp(a.fields?.["Recorded At"] || a.fields?.Kickoff));

  const schedule = boardBase.map((record) => {
    const row = record.fields || {};
    const match = row.Match || "Unknown fixture";
    const kickoff = row["Kickoff ICT"];
    return {
      id: record.id,
      slateDate: slateDay(row),
      match,
      competition: row.Competition || "",
      kickoff,
      displayKickoff: kickoff,
      tier: selectName(row["Board Tier"]),
      grade: selectName(row["PRE Grade"]),
      structure: selectName(row["Structural Type"]),
      xiStatus: selectName(row["XI Status"]),
      marketStatus: selectName(row["Market Status"]),
      coverageStatus: selectName(row["Coverage Status"]),
      frozenPreSummary: row["Frozen PRE Summary"] || "",
      coverageNotes: row["Coverage Notes"] || "",
      manualScore: manualScores.get(manualScoreKey(match, kickoff)) || null,
      bsd: null,
    };
  });

  const picks = pickBase.map((record) => {
    const row = record.fields || {};
    const match = row.Match || "Unknown fixture";
    const kickoff = row.Kickoff;
    return {
      id: record.id,
      pickId: row["Pick ID"] || "",
      match,
      competition: row.Competition || "",
      kickoff,
      displayKickoff: kickoff,
      modelVersion: row["Model Version"] || "",
      verdict: selectName(row.Verdict),
      line: row.Line,
      odds: row.Odds,
      stake: row["Stake u"],
      result: selectName(row.Result) || "PENDING",
      pl: row["P/L u"],
      recordedAt: row["Recorded At"] || kickoff,
      reason: row.Reason || "",
      manualScore: manualScores.get(manualScoreKey(match, kickoff)) || null,
      bsd: null,
    };
  });

  return { ok: true, schedule, picks, generatedAt: new Date().toISOString(), backendMode: "airtable-fallback" };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(env, request) });

    if (request.method === "GET" && url.pathname === "/api/dashboard-data") {
      try {
        const response = await app.fetch(request, env, ctx);
        if (response.ok) {
          const clone = response.clone();
          const payload = await clone.json().catch(() => null);
          if (payload?.ok && Array.isArray(payload.schedule) && Array.isArray(payload.picks)) return response;
        }
      } catch {}
      try {
        const fallback = await airtableOnlyDashboard(env);
        return json(fallback, 200, env, request);
      } catch (error) {
        return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 502, env, request);
      }
    }

    return app.fetch(request, env, ctx);
  },
};
