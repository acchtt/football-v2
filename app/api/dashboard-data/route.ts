import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ALLOWED_ORIGIN = "https://acchtt.github.io";
const DEFAULT_FEED_URL =
  "https://raw.githubusercontent.com/acchtt/football-v2/main/pages/data/board-feed.json";
const FEED_SCHEMA = "football-v2-public-board-feed-v1";

function cors(headers: HeadersInit = {}) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store, max-age=0",
    ...headers,
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors() });
}

export async function GET() {
  try {
    const url = process.env.BOARD_FEED_URL || DEFAULT_FEED_URL;
    const response = await fetch(`${url}?v=${Date.now()}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Google Sheets board projection HTTP ${response.status}`);
    }
    const feed = await response.json() as Record<string, unknown>;
    if (
      feed.schemaVersion !== FEED_SCHEMA ||
      feed.sourceStore !== "GOOGLE_SHEETS" ||
      !Array.isArray(feed.schedule) ||
      !Array.isArray(feed.picks)
    ) {
      throw new Error("Google Sheets board projection contract mismatch.");
    }
    for (const forbidden of [
      "decisionStates",
      "actualBets",
      "engineResults",
      "step1EngineResult",
    ]) {
      if (Object.prototype.hasOwnProperty.call(feed, forbidden)) {
        throw new Error(`Projection contains forbidden private field: ${forbidden}`);
      }
    }
    return NextResponse.json(
      {
        ok: true,
        schedule: feed.schedule,
        picks: feed.picks,
        generatedAt: new Date().toISOString(),
        sourceGeneratedAt:
          typeof feed.generatedAt === "string" ? feed.generatedAt : null,
        backendMode: "google-sheets-public-projection",
      },
      { headers: cors() },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json(
      { ok: false, schedule: [], picks: [], error: message },
      { status: 502, headers: cors() },
    );
  }
}
