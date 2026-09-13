import app from "./index.js";

const TABLES = {
  coverage: "tblcl1UAyMqZT6Ub0",
  picks: "tblg3J5sbJYbzuTYD",
  decisionStates: "tblQmUpd5WjBLQ38X",
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
const DECISION_FIELDS = [
  "Assessment ID", "Match", "Competition", "Model Version", "Assessment Time",
  "Verdict", "Candidate", "Line", "Odds", "Stake u", "Result", "P/L u",
  "Evidence Summary", "Website Fixture ID",
];
const MANUAL_FIELDS = ["Score Key", "Match", "Kickoff ICT", "Home Score", "Away Score", "Updated At"];
const ZONE = "Asia/Ho_Chi_Minh";

function allowedOrigin(env, request) {
  const allowed = String(env.ALLOWED_ORIGIN || "https://acchtt.github.io")
    .split(",").map((x) => x.trim()).filter(Boolean);
  const origin = request.headers.get("Origin");
  if (!origin) return allowed[0] || "*";
  return allowed.includes(origin) ? origin : null;
}

function cors(env, request) {
  const origin = allowedOrigin(env, request);
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
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
  for (const separator of [/\s+vs\.?\s+/i, /\s+v\.?\s+/i, /\s+-\s+/, /\s+—\s+/, /\s+–\s+/]) {
    const parts = String(match).split(separator).map((part) => part.trim()).filter(Boolean);
    if (parts.length === 2) return { home: parts[0], away: parts[1] };
  }
  return undefined;
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

function fixtureNameScore(a, b) {
  const left = splitFixtureName(a), right = splitFixtureName(b);
  if (!left || !right) return normalize(a) === normalize(b) ? 12 : 0;
  return nameScore(left.home, right.home) + nameScore(left.away, right.away);
}

function selectName(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && !Array.isArray(value) && "name" in value) return String(value.name || "");
  return "";
}

function dateKey(value) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(value));
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

function parseBetLine(row) {
  const values = [row?.Candidate, row?.Line].filter(Boolean).map(String);
  for (const value of values) {
    const match = value.match(/(?:\bover\b|\bo)\s*([0-9]+(?:\.[0-9]+)?)/i) || value.match(/^\s*([0-9]+(?:\.[0-9]+)?)/);
    if (match) return Number(match[1]);
  }
  return undefined;
}

async function airtableRecords(env, table, fields, sort) {
  if (!env.AIRTABLE_TOKEN) throw new Error("AIRTABLE_TOKEN is not configured.");
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
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Airtable HTTP ${response.status}: ${text.slice(0, 300)}`);
    }
    const payload = await response.json();
    out.push(...(payload.records || []));
    offset = payload.offset;
  } while (offset);
  return out;
}

async function recentOfficialStates(env) {
  if (!env.AIRTABLE_TOKEN) throw new Error("AIRTABLE_TOKEN is not configured.");
  const base = env.AIRTABLE_BASE_ID || "appWyZJjitSBATXAU";
  const out = [];
  let offset;
  do {
    const url = new URL(`https://api.airtable.com/v0/${base}/${TABLES.decisionStates}`);
    url.searchParams.set("pageSize", "100");
    url.searchParams.set("maxRecords", "100");
    url.searchParams.set("filterByFormula", "{Verdict}='OFFICIAL BET'");
    url.searchParams.set("sort[0][field]", "Assessment Time");
    url.searchParams.set("sort[0][direction]", "desc");
    for (const field of DECISION_FIELDS) url.searchParams.append("fields[]", field);
    if (offset) url.searchParams.set("offset", offset);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${env.AIRTABLE_TOKEN}` } });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Airtable Decision States HTTP ${response.status}: ${text.slice(0, 300)}`);
    }
    const payload = await response.json();
    out.push(...(payload.records || []));
    offset = payload.offset;
  } while (offset && out.length < 100);
  return out.slice(0, 100);
}

function findCoverageForState(stateRow, coverageRecords) {
  const assessmentTime = timestamp(stateRow?.["Assessment Time"]);
  const match = stateRow?.Match || "";
  let best;
  for (const record of coverageRecords) {
    const row = record.fields || {};
    const kickoff = timestamp(row["Kickoff ICT"]);
    if (!kickoff) continue;
    const teamScore = fixtureNameScore(match, row.Match || "");
    if (teamScore < 6) continue;
    const hours = assessmentTime ? Math.abs(kickoff - assessmentTime) / 3_600_000 : 0;
    if (assessmentTime && hours > 36) continue;
    const score = teamScore * 10 - Math.min(hours, 36);
    if (!best || score > best.score) best = { score, record };
  }
  return best?.record;
}

function pickMatchesCandidate(pick, candidate) {
  if (Number(pick.line) !== Number(candidate.line)) return false;
  if (fixtureNameScore(pick.match, candidate.match) < 6) return false;
  return Math.abs(timestamp(pick.kickoff) - timestamp(candidate.kickoff)) <= 36 * 3_600_000;
}

async function dashboardData(env) {
  const [coverageRows, pickRows, decisionRows, manualRows] = await Promise.all([
    airtableRecords(env, TABLES.coverage, COVERAGE_FIELDS, { field: "Screened At", direction: "desc" }),
    airtableRecords(env, TABLES.picks, PICK_FIELDS, { field: "Recorded At", direction: "desc" }),
    recentOfficialStates(env),
    airtableRecords(env, TABLES.manualScores, MANUAL_FIELDS, { field: "Updated At", direction: "desc" }),
  ]);

  const manualScores = new Map();
  for (const record of manualRows) {
    const row = record.fields || {};
    const key = row["Score Key"];
    const home = row["Home Score"];
    const away = row["Away Score"];
    if (key && typeof home === "number" && typeof away === "number" && !manualScores.has(key)) {
      manualScores.set(key, { home, away, updatedAt: row["Updated At"] || "" });
    }
  }

  const latest = new Map();
  for (const record of coverageRows) {
    const key = fixtureKey(record.fields || {});
    if (!key || key.endsWith("|") || latest.has(key)) continue;
    latest.set(key, record);
  }
  const currentCoverage = [...latest.values()];

  const boardBase = currentCoverage
    .filter((record) => ["FOCUS", "WATCHLIST"].includes(selectName(record.fields?.["Board Tier"])))
    .filter((record) => Boolean(slateDay(record.fields || {})) && timestamp(record.fields?.["Kickoff ICT"]) > 0)
    .sort((a, b) => slateDay(a.fields || {}).localeCompare(slateDay(b.fields || {})) || timestamp(a.fields?.["Kickoff ICT"]) - timestamp(b.fields?.["Kickoff ICT"]));

  const websitePicks = pickRows
    .filter((record) => timestamp(record.fields?.Kickoff) > 0)
    .map((record) => {
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
        source: "Website Picks",
      };
    });

  const stateCandidates = [];
  const stateSeen = new Set();
  for (const record of decisionRows) {
    const row = record.fields || {};
    if (selectName(row.Verdict).toUpperCase() !== "OFFICIAL BET") continue;
    const line = parseBetLine(row);
    const assessmentTime = row["Assessment Time"];
    if (!Number.isFinite(line) || !timestamp(assessmentTime)) continue;

    const coverage = findCoverageForState(row, currentCoverage);
    const coverageRow = coverage?.fields || {};
    const match = coverageRow.Match || row.Match || "Unknown fixture";
    const kickoff = coverageRow["Kickoff ICT"] || assessmentTime;
    const dedupeKey = `${normalize(match)}|${line}|${dateKey(kickoff)}`;
    if (stateSeen.has(dedupeKey)) continue;
    stateSeen.add(dedupeKey);

    const candidate = {
      id: `decision:${record.id}`,
      pickId: row["Assessment ID"] || `decision-${record.id}`,
      match,
      competition: coverageRow.Competition || row.Competition || "",
      kickoff,
      displayKickoff: kickoff,
      modelVersion: row["Model Version"] || "",
      verdict: "LOCK",
      line,
      odds: row.Odds,
      stake: row["Stake u"] ?? 1,
      result: selectName(row.Result) || "PENDING",
      pl: row["P/L u"],
      recordedAt: assessmentTime,
      reason: row["Evidence Summary"] || "Synced from Decision States while Website Picks catches up.",
      manualScore: manualScores.get(manualScoreKey(match, kickoff)) || null,
      bsd: null,
      source: "Decision States",
    };
    if (!websitePicks.some((pick) => pickMatchesCandidate(pick, candidate))) stateCandidates.push(candidate);
  }

  const picks = [...websitePicks, ...stateCandidates]
    .sort((a, b) => timestamp(b.recordedAt || b.kickoff) - timestamp(a.recordedAt || a.kickoff));

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

  return {
    ok: true,
    schedule,
    picks,
    generatedAt: new Date().toISOString(),
    backendMode: "airtable-with-decision-state-fallback",
    sync: {
      websitePicks: websitePicks.length,
      decisionStateFallbacks: stateCandidates.length,
    },
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(env, request) });
    }

    if (request.method === "GET" && url.pathname === "/api/dashboard-data") {
      try {
        return json(await dashboardData(env), 200, env, request);
      } catch (error) {
        return json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 502, env, request);
      }
    }

    return app.fetch(request, env, ctx);
  },
};
