import { NextRequest, NextResponse } from "next/server";
import { AirtableError } from "@/lib/airtable";
import { saveManualScore } from "@/lib/manual-scores";

const PAGES_ORIGIN = "https://acchtt.github.io";

function cors(headers: HeadersInit = {}) {
  return {
    "Access-Control-Allow-Origin": PAGES_ORIGIN,
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store, max-age=0",
    ...headers
  };
}

function cleanReturnTo(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/schedule";
  return value;
}

function scoreValue(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 99) return value;
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 99) return undefined;
  return parsed;
}

function originAllowed(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    return parsed.origin === PAGES_ORIGIN || (!!host && parsed.host === host);
  } catch {
    return false;
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors() });
}

export async function POST(request: NextRequest) {
  if (!originAllowed(request)) {
    return new NextResponse("Cross-origin score edits are not allowed.", { status: 403, headers: cors() });
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    const wantsJson = contentType.includes("application/json");
    let match = "";
    let kickoff = "";
    let action = "save";
    let homeRaw: unknown;
    let awayRaw: unknown;
    let returnTo = "/schedule";

    if (wantsJson) {
      const body = await request.json() as Record<string, unknown>;
      match = typeof body.match === "string" ? body.match.trim() : "";
      kickoff = typeof body.kickoff === "string" ? body.kickoff.trim() : "";
      action = typeof body.action === "string" ? body.action : "save";
      homeRaw = body.home;
      awayRaw = body.away;
    } else {
      const form = await request.formData();
      match = typeof form.get("match") === "string" ? String(form.get("match")).trim() : "";
      kickoff = typeof form.get("kickoff") === "string" ? String(form.get("kickoff")).trim() : "";
      action = typeof form.get("action") === "string" ? String(form.get("action")) : "save";
      homeRaw = form.get("home");
      awayRaw = form.get("away");
      returnTo = cleanReturnTo(form.get("returnTo"));
    }

    if (!match || !kickoff || !Number.isFinite(new Date(kickoff).getTime())) {
      return NextResponse.json({ ok: false, error: "Match and kickoff are required." }, { status: 400, headers: cors() });
    }

    if (action === "clear") {
      await saveManualScore(match, kickoff, null, null);
      if (wantsJson || request.headers.get("origin") === PAGES_ORIGIN) {
        return NextResponse.json({ ok: true, cleared: true }, { headers: cors() });
      }
      return NextResponse.redirect(new URL(returnTo, request.url), 303);
    }

    const home = scoreValue(homeRaw);
    const away = scoreValue(awayRaw);
    if (home === undefined || away === undefined) {
      return NextResponse.json({ ok: false, error: "Enter whole-number scores between 0 and 99." }, { status: 400, headers: cors() });
    }

    await saveManualScore(match, kickoff, home, away);
    if (wantsJson || request.headers.get("origin") === PAGES_ORIGIN) {
      return NextResponse.json({ ok: true, home, away }, { headers: cors() });
    }
    return NextResponse.redirect(new URL(returnTo, request.url), 303);
  } catch (error) {
    console.error("Manual score save failed", error);
    const message = error instanceof Error ? error.message : "Unknown server error";
    const status = error instanceof AirtableError && error.status && error.status >= 400 && error.status < 500 ? error.status : 502;
    return NextResponse.json({ ok: false, error: message }, { status, headers: cors() });
  }
}
