import { NextRequest, NextResponse } from "next/server";
import { currentIctDate, getCurrentModelBoard } from "@/lib/model-board";
import { MODEL } from "@/lib/model";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date") || currentIctDate();
  const data = await getCurrentModelBoard(date);
  return NextResponse.json(
    {
      model: { version: MODEL.version, regime: MODEL.regime, timezone: MODEL.timezone },
      mode: data.mode,
      date: data.date,
      scannedCount: data.scannedCount,
      candidateCount: data.candidateCount,
      modelReady: data.modelReady,
      rankingEngine: data.rankingEngine,
      rankingError: data.rankingError,
      matches: data.matches
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
