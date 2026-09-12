import { NextRequest, NextResponse } from "next/server";
import { saveManualScore } from "@/lib/manual-scores";

function cleanReturnTo(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/schedule";
  return value;
}

function scoreValue(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 99) return undefined;
  return parsed;
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) return new NextResponse("Cross-origin score edits are not allowed.", { status: 403 });
    } catch {
      return new NextResponse("Invalid request origin.", { status: 403 });
    }
  }

  const form = await request.formData();
  const match = typeof form.get("match") === "string" ? String(form.get("match")).trim() : "";
  const kickoff = typeof form.get("kickoff") === "string" ? String(form.get("kickoff")).trim() : "";
  const action = typeof form.get("action") === "string" ? String(form.get("action")) : "save";
  const returnTo = cleanReturnTo(form.get("returnTo"));

  if (!match || !kickoff || !Number.isFinite(new Date(kickoff).getTime())) {
    return new NextResponse("Match and kickoff are required.", { status: 400 });
  }

  if (action === "clear") {
    await saveManualScore(match, kickoff, null, null);
    return NextResponse.redirect(new URL(returnTo, request.url), 303);
  }

  const home = scoreValue(form.get("home"));
  const away = scoreValue(form.get("away"));
  if (home === undefined || away === undefined) {
    return new NextResponse("Enter whole-number scores between 0 and 99.", { status: 400 });
  }

  await saveManualScore(match, kickoff, home, away);
  return NextResponse.redirect(new URL(returnTo, request.url), 303);
}
