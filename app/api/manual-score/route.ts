import { NextResponse } from "next/server";

const PAGES_ORIGIN = "https://acchtt.github.io";

function cors(headers: HeadersInit = {}) {
  return {
    "Access-Control-Allow-Origin": PAGES_ORIGIN,
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store, max-age=0",
    ...headers,
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors() });
}

export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error:
        "Website manual-score writes were retired with Airtable. Use the private Google Sheets Manual Scores tab for operational overrides.",
      activeStore: "GOOGLE_SHEETS",
      sheet: "Manual Scores",
    },
    { status: 410, headers: cors() },
  );
}
