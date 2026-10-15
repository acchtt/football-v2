import app from "./index.js";

const FEED_SCHEMA = "football-v2-public-board-feed-v1";
const DEFAULT_FEED_URL = "https://raw.githubusercontent.com/acchtt/football-v2/main/pages/data/board-feed.json";

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

function officialTier(row) {
  const lane = String(row?.followLane || "").toUpperCase();
  if (lane === "FOLLOW") return "FOCUS";
  if (lane === "RESERVE") return "WATCHLIST";
  if (lane === "STOP") return "PASS";
  const tier = String(row?.tier || "").toUpperCase();
  return ["FOCUS", "WATCHLIST", "PASS"].includes(tier) ? tier : "";
}

function safeScheduleRow(row) {
  if (!row || typeof row !== "object") return null;
  const kickoff = String(row.kickoff || row.displayKickoff || "");
  const match = String(row.match || "").trim();
  if (!match || !timestamp(kickoff)) return null;
  const tier = officialTier(row);
  if (!tier) return null;
  const rank = Number(row.cRank);
  const line = Number(row.cSupportedLine);
  return {
    id: String(row.id || row.sourceCoverageId || ""),
    slateDate: String(row.slateDate || "").trim(),
    match,
    competition: String(row.competition || ""),
    kickoff,
    displayKickoff: String(row.displayKickoff || kickoff),
    tier,
    sourceCoverageId: String(row.sourceCoverageId || row.id || ""),
    boardId: String(row.boardId || ""),
    followLane: String(row.followLane || "").toUpperCase(),
    cBoardState: String(row.cBoardState || ""),
    cRank: Number.isInteger(rank) && rank > 0 ? rank : null,
    cSupportedLine: Number.isFinite(line) ? line : null,
    grade: String(row.grade || ""),
    structure: String(row.structure || ""),
    xiStatus: String(row.xiStatus || ""),
    marketStatus: String(row.marketStatus || ""),
    coverageStatus: String(row.coverageStatus || ""),
    frozenPreSummary: String(row.frozenPreSummary || ""),
    coverageNotes: String(row.coverageNotes || ""),
    manualScore: row.manualScore && typeof row.manualScore === "object" ? row.manualScore : null,
    bsd: row.bsd && typeof row.bsd === "object" ? row.bsd : null,
  };
}

function safePickRow(row) {
  if (!row || typeof row !== "object") return null;
  const kickoff = String(row.kickoff || row.displayKickoff || "");
  const match = String(row.match || "").trim();
  if (!match || !timestamp(kickoff)) return null;
  const line = Number(row.line);
  const odds = Number(row.odds);
  return {
    id: String(row.id || row.pickId || row.publicationKey || ""),
    pickId: String(row.pickId || row.publicationKey || ""),
    match,
    competition: String(row.competition || ""),
    kickoff,
    displayKickoff: String(row.displayKickoff || kickoff),
    modelVersion: String(row.modelVersion || "Football C"),
    verdict: String(row.verdict || row.cAction || ""),
    line: Number.isFinite(line) ? line : undefined,
    odds: Number.isFinite(odds) ? odds : undefined,
    stake: Number.isFinite(Number(row.stake)) ? Number(row.stake) : undefined,
    result: String(row.result || "PENDING"),
    pl: Number.isFinite(Number(row.pl)) ? Number(row.pl) : undefined,
    recordedAt: String(row.recordedAt || row.publishedAt || kickoff),
    reason: String(row.reason || ""),
    manualScore: row.manualScore && typeof row.manualScore === "object" ? row.manualScore : null,
    bsd: row.bsd && typeof row.bsd === "object" ? row.bsd : null,
  };
}

function validateFeed(payload) {
  if (!payload || typeof payload !== "object") throw new Error("Board projection is not a JSON object.");
  if (payload.schemaVersion !== FEED_SCHEMA) {
    throw new Error(`Board projection schema mismatch: ${String(payload.schemaVersion || "missing")}`);
  }
  if (payload.sourceStore !== "GOOGLE_SHEETS") {
    throw new Error("Board projection is not sourced from Google Sheets.");
  }
  if (!Array.isArray(payload.schedule) || !Array.isArray(payload.picks)) {
    throw new Error("Board projection must contain schedule and picks arrays.");
  }
  // Privacy boundary: the public feed must never carry private operational stores.
  for (const forbidden of ["decisionStates", "actualBets", "engineResults", "step1EngineResult"]) {
    if (Object.prototype.hasOwnProperty.call(payload, forbidden)) {
      throw new Error(`Public board projection contains forbidden private field: ${forbidden}`);
    }
  }
  return payload;
}

async function loadProjection(env) {
  const url = String(env.BOARD_FEED_URL || DEFAULT_FEED_URL);
  const response = await fetch(`${url}?v=${Date.now()}`, {
    headers: { Accept: "application/json" },
    cf: { cacheTtl: 0, cacheEverything: false },
  });
  if (!response.ok) {
    throw new Error(`Google Sheets board projection HTTP ${response.status}`);
  }
  return validateFeed(await response.json());
}

async function dashboardData(env) {
  const feed = await loadProjection(env);
  const schedule = feed.schedule
    .map(safeScheduleRow)
    .filter(Boolean)
    .sort((a, b) => timestamp(a.kickoff) - timestamp(b.kickoff));
  const picks = feed.picks
    .map(safePickRow)
    .filter(Boolean)
    .sort((a, b) => timestamp(b.recordedAt || b.kickoff) - timestamp(a.recordedAt || a.kickoff));

  const ranked = schedule.filter((row) => row.cRank !== null);
  const latestRankedBoardId = [...ranked]
    .sort((a, b) => timestamp(b.kickoff) - timestamp(a.kickoff))[0]?.boardId || null;

  return {
    ok: true,
    schedule,
    picks,
    generatedAt: new Date().toISOString(),
    sourceGeneratedAt: feed.generatedAt || null,
    backendMode: "google-sheets-public-projection",
    sync: {
      sourceStore: "GOOGLE_SHEETS",
      projectionSchema: FEED_SCHEMA,
      projectionUrl: String(env.BOARD_FEED_URL || DEFAULT_FEED_URL),
      rankedPublished: ranked.length,
      latestRankedBoardId,
      stopDisplayed: schedule.filter((row) => row.followLane === "STOP").length,
      scheduleByDate: Object.fromEntries(
        [...new Set(schedule.map((row) => row.slateDate).filter(Boolean))]
          .map((day) => [day, schedule.filter((row) => row.slateDate === day).length]),
      ),
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
        return json(
          { ok: false, error: error instanceof Error ? error.message : String(error) },
          502,
          env,
          request,
        );
      }
    }
    return app.fetch(request, env, ctx);
  },
};

export { dashboardData, officialTier, safeScheduleRow, validateFeed };
