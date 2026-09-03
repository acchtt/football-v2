import { NextResponse } from "next/server";
import { getMatches } from "@/lib/data";
import { MODEL } from "@/lib/model";

export async function GET() {
  const data = await getMatches();
  return NextResponse.json(
    {
      model: { version: MODEL.version, regime: MODEL.regime, timezone: MODEL.timezone },
      mode: data.mode,
      matches: [...data.matches].sort((a, b) => b.preScore - a.preScore)
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
