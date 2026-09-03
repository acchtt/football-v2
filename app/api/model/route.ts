import { NextResponse } from "next/server";
import { MODEL } from "@/lib/model";

export async function GET() {
  return NextResponse.json(MODEL, { headers: { "Cache-Control": "no-store" } });
}
