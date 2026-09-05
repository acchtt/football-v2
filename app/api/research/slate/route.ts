import { NextRequest, NextResponse } from "next/server";
import { fetchBsdResearchSlate, isBsdConfigured } from "@/lib/bsd";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function validDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export async function GET(request: NextRequest) {
  if (!isBsdConfigured()) {
    return NextResponse.json({ ok: false, error: "BSD_API_TOKEN is not configured" }, { status: 503 });
  }

  const from = request.nextUrl.searchParams.get("date_from");
  const to = request.nextUrl.searchParams.get("date_to") || from;
  if (!validDate(from) || !validDate(to)) {
    return NextResponse.json({ ok: false, error: "Use date_from=YYYY-MM-DD&date_to=YYYY-MM-DD" }, { status: 400 });
  }

  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 3 * 86_400_000) {
    return NextResponse.json({ ok: false, error: "Research range must be 0-3 days" }, { status: 400 });
  }

  try {
    const fixtures = await fetchBsdResearchSlate(from, to);
    return NextResponse.json({ ok: true, date_from: from, date_to: to, count: fixtures.length, fixtures }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "BSD research slate failed" }, { status: 502 });
  }
}
