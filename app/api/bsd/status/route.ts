import { NextResponse } from "next/server";
import { currentIctDate } from "@/lib/data";
import { testBsdConnection } from "@/lib/bsd";

export async function GET() {
  try {
    const status = await testBsdConnection(currentIctDate());
    return NextResponse.json({ ok: status.configured, ...status }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { ok: false, configured: true, error: error instanceof Error ? error.message : "BSD connection failed" },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
