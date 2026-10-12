import app from "./index.js";

const TABLES = {
  coverage: "tbl20jBW5dfgNnTV6",
  picks: "tblmGd7XwTYbceIiL",
  decisionStates: "tblzMyYuDTi1UMd66",
  manualScores: "tbliGfSwMacpnmauM",
};

const COVERAGE_FIELDS = [
  "Coverage ID", "Slate Date", "Match", "Competition", "Kickoff ICT",
  "Coverage Status", "PRE Grade", "Structural Type", "Board Tier",
  "XI Status", "Market Status", "Screened At", "Frozen PRE Summary", "Coverage Notes",
  "C Board State", "C Rank", "C Supported Line",
  "C2 Shadow State", "C2 Shadow Rank", "C2 Supported Line",
  "Step1 C Follow Lane", "Operational Grade",
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

function officialLane(row) {
  const rank = Number(row?.["C Rank"]);
  if (!Number.isInteger(rank) || rank <= 0) return "";
  const lane = selectName(row?.["Step1 C Follow Lane"]).toUpperCase();
  return ["FOLLOW", "RESERVE", "STOP"].includes(lane) ? lane : "";
}

function officialTier(row) {
  // A real C rank takes precedence over the older screening-era Board Tier.
  // The follow lane is an operational schedule state, NEVER a priced C-BET.
  const rank = Number(row?.["C Rank"]);
  const state = selectName(row?.["C Board State"]).toUpperCase();
  if (Number.isInteger(rank) && rank > 0) {
    const lane = officialLane(row);
    if (lane === "FOLLOW") return "FOCUS";
    if (lane === "RESERVE") return "WATCHLIST";
    if (lane === "STOP") return "PASS"; // display STOP fixtures; do not publish a bet
    if (state === "C-FOCUS" || state === "FOCUS") return "FOCUS";
    if (state === "C-WATCH" || state === "WATCH") return "WATCHLIST";
    if (state === "C-PASS" || state === "PASS") return "PASS";
    return "";
  }
  // Historical board-tiers remain display-only; provisional V4 rows have none.
  const tier = selectName(row?.["Board Tier"]).toUpperCase();
  return ["FOCUS","WATCHLIST","PASS"].includes(tier) ? tier : "";
}

function dateKey(value) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(value));
  const get = (type) => parts.find((x) => x.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function slateDay(row) {
  // ICT kickoff owns the visible calendar day, including post-midnight games.
  const kickoff = row?.["Kickoff ICT"];
  if (kickoff && timestamp(kickoff)) return dateKey(kickoff);
  const slate = row?.["Slate Date"];
  return slate && /^\d{4}-\d{2}-\d{2}$/.test(slate) ? slate : "";
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

async function airtableRecords(env, table, fields, sort, options = {}) {
  if (!env.AIRTABLE_TOKEN) throw new Error("AIRTABLE_TOKEN is not configured.");
  const base = env.AIRTABLE_BASE_ID || "appbzxqXYf0lKfD4P";
  const out = [];
  const pageSize = Math.max(1, Math.min(100, Number(options.pageSize) || 100));
  const maxRecords = Math.max(0, Number(options.maxRecords) || 0);
  let offset;
  do {
    const url = new URL(`https://api.airtable.com/v0/${base}/${table}`);
    url.searchParams.set("pageSize", String(pageSize));
    if (maxRecords) url.searchParams.set("maxRecords", String(maxRecords));
    if (options.filterByFormula) url.searchParams.set("filterByFormula", options.filterByFormula);
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
    if (maxRecords && out.length >= maxRecords) return out.slice(0, maxRecords);
    offset = payload.offset;
  } while (offset);
  return out;
}

async function recentOfficialStates(env) {
  if (!env.AIRTABLE_TOKEN) throw new Error("AIRTABLE_TOKEN is not configured.");
  const base = env.AIRTABLE_BASE_ID || "appbzxqXYf0lKfD4P";
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
  const rankCondition = "AND({C Rank}>0,OR({C Board State}='C-FOCUS',{C Board State}='C-WATCH',{C Board State}='C-PASS',{C Board State}='FOCUS',{C Board State}='WATCH',{C Board State}='PASS'))";
  const dateCondition = "IS_AFTER({Kickoff ICT},DATEADD(NOW(),-7,'days')),IS_BEFORE({Kickoff ICT},DATEADD(NOW(),14,'days'))";
  const coverageWindow = "AND(OR({Board Tier}='FOCUS',{Board Tier}='WATCHLIST',{Board Tier}='PASS'," + rankCondition + ")," + dateCondition + ")";
  // Separate ranked query avoids losing recent ranked rows to the legacy
  // coverage cap when many unrelated fixtures were screened in the window.
  const rankedWindow = "AND(" + rankCondition + "," + dateCondition + ")";
  const pickWindow = "AND(IS_AFTER({Kickoff},DATEADD(NOW(),-14,'days')),IS_BEFORE({Kickoff},DATEADD(NOW(),14,'days')))";
  const manualWindow = "IS_AFTER({Updated At},DATEADD(NOW(),-14,'days'))";
  const [coverageRows, rankedRows, pickRows, decisionRows, manualRows] = await Promise.all([
    airtableRecords(env, TABLES.coverage, COVERAGE_FIELDS, { field: "Screened At", direction: "desc" }, { filterByFormula: coverageWindow, maxRecords: 500 }),
    airtableRecords(env, TABLES.coverage, COVERAGE_FIELDS, { field: "Screened At", direction: "desc" }, { filterByFormula: rankedWindow, maxRecords: 1000 }),
    airtableRecords(env, TABLES.picks, PICK_FIELDS, { field: "Recorded At", direction: "desc" }, { filterByFormula: pickWindow, maxRecords: 300 }),
    recentOfficialStates(env),
    airtableRecords(env, TABLES.manualScores, MANUAL_FIELDS, { field: "Updated At", direction: "desc" }, { filterByFormula: manualWindow, maxRecords: 300 }),
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
  const uniqueRecords = new Map([...coverageRows, ...rankedRows].map(record => [record.id, record]));
  const sorted = [...uniqueRecords.values()].sort((a,b) =>
    timestamp(b.fields?.["Screened At"] || b.createdTime) - timestamp(a.fields?.["Screened At"] || a.createdTime));
  for (const record of sorted) {
    const key = fixtureKey(record.fields || {});
    if (!key || key.endsWith("|")) continue;
    const previous = latest.get(key);
    if (!previous) {
      latest.set(key, record);
      continue;
    }
    // A newer sweep lead or pending enrichment is not a newer *ranked board*.
    // Never allow an unranked V4/legacy coverage row to mask the signed C/C2
    // result for the same fixture. Among equally ranked sources, screened-at
    // descending (the original sort) preserves the latest valid freeze.
    const ranked = Number(record.fields?.["C Rank"]) > 0 && Boolean(officialTier(record.fields));
    const previousRanked = Number(previous.fields?.["C Rank"]) > 0 && Boolean(officialTier(previous.fields));
    if (ranked && !previousRanked) latest.set(key, record);
  }
  const currentCoverage = [...latest.values()];

  const boardBase = currentCoverage
    .filter((record) => Boolean(officialTier(record.fields || {})))
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

  const rankedExpected = new Set(rankedRows.map(record => fixtureKey(record.fields || {})).filter(Boolean));
  const rankedPublishedKeys = new Set(boardBase.filter(record => {
    const row = record.fields || {};
    return Number(row["C Rank"]) > 0 && Boolean(officialTier(row));
  }).map(record => fixtureKey(record.fields || {})));
  const missingRankedKeys = [...rankedExpected].filter(key => !rankedPublishedKeys.has(key));

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
      tier: officialTier(row),
      // These fields are display-only; no odds, stake, WAIT or Website Pick is inferred.
      sourceCoverageId: row["Coverage ID"] || "",
      boardId: String(row["Coverage ID"] || "").split("|")[0] || "",
      followLane: officialLane(row),
      cBoardState: selectName(row["C Board State"]),
      cRank: Number.isInteger(Number(row["C Rank"])) && Number(row["C Rank"]) > 0 ? Number(row["C Rank"]) : null,
      cSupportedLine: Number.isFinite(Number(row["C Supported Line"])) ? Number(row["C Supported Line"]) : null,
      c2BoardState: selectName(row["C2 Shadow State"]),
      c2Rank: Number.isInteger(Number(row["C2 Shadow Rank"])) && Number(row["C2 Shadow Rank"]) > 0 ? Number(row["C2 Shadow Rank"]) : null,
      c2SupportedLine: Number.isFinite(Number(row["C2 Supported Line"])) ? Number(row["C2 Supported Line"]) : null,
      grade: selectName(row["Operational Grade"]) || selectName(row["PRE Grade"]),
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
      sourceBaseId: env.AIRTABLE_BASE_ID || "appbzxqXYf0lKfD4P",
      websitePicks: websitePicks.length,
      decisionStateFallbacks: stateCandidates.length,
      rankedSourceRecords: rankedRows.length,
      rankedPublished: schedule.filter(row => row.cRank !== null).length,
      latestRankedBoardId: boardBase.filter(record => Number(record.fields?.["C Rank"]) > 0)
        .sort((a,b) => timestamp(b.fields?.["Screened At"]) - timestamp(a.fields?.["Screened At"]))[0]?.fields?.["Coverage ID"]?.split("|")[0] || null,
      stopDisplayed: schedule.filter(row => row.followLane === "STOP").length,
      missingRankedCount: missingRankedKeys.length,
      missingRankedKeys: missingRankedKeys.slice(0,15),
      scheduleByDate: Object.fromEntries([...new Set(schedule.map(row => row.slateDate))].map(day =>
        [day, schedule.filter(row => row.slateDate === day).length])),
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
