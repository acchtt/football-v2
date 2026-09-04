import { NextRequest, NextResponse } from "next/server";
import { currentIctDate, getMatches } from "@/lib/data";
import { MODEL } from "@/lib/model";

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date") || currentIctDate();
  const data = await getMatches(date);
  return NextResponse.json(
    {
      model: { version: MODEL.version, regime: MODEL.regime, timezone: MODEL.timezone },
      mode: data.mode,
      date: data.date,
      matches: data.matches
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
