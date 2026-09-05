import { NextRequest, NextResponse } from "next/server";
import seed from "@/data/picks-seed.json";
import { getPublishedMatch, getPublishedState } from "@/lib/published";

const BASE_ID = "appWyZJjitSBATXAU";
const TABLE_ID = "tblg3J5sbJYbzuTYD";
const AIRTABLE_URL = `https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}`;

export const dynamic = "force-dynamic";

type Pick = {
  pickId: string;
  slug: string;
  match: string;
  competition: string;
  kickoff: string;
  modelVersion: string;
  verdict: "LOCK";
  line: number;
  odds: number;
  stake: number;
  result: string;
  pl: number;
  recordedAt: string;
  reason: string;
  synced: boolean;
};

function token() {
  return process.env.AIRTABLE_ACCESS_TOKEN || process.env.AIRTABLE_TOKEN;
}

function escapeFormula(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function mapFields(fields: Record<string, unknown>): Pick | undefined {
  const pickId = String(fields["Pick ID"] || "");
  const slug = String(fields["Website Fixture ID"] || "");
  const line = Number(fields.Line);
  const odds = Number(fields.Odds);
  if (!pickId || !slug || !Number.isFinite(line) || !Number.isFinite(odds)) return undefined;

  return {
    pickId,
    slug,
    match: String(fields.Match || slug),
    competition: String(fields.Competition || ""),
    kickoff: String(fields.Kickoff || ""),
    modelVersion: String(fields["Model Version"] || "Football v0.2.47"),
    verdict: "LOCK",
    line,
    odds,
    stake: Number(fields["Stake u"] ?? 1),
    result: String(fields.Result || "PENDING"),
    pl: Number(fields["P/L u"] ?? 0),
    recordedAt: String(fields["Recorded At"] || ""),
    reason: String(fields.Reason || ""),
    synced: true
  };
}

async function airtable(path = "", init?: RequestInit) {
  const apiToken = token();
  if (!apiToken) throw new Error("AIRTABLE_NOT_CONFIGURED");
  const response = await fetch(`${AIRTABLE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      ...(init?.headers || {})
    },
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`AIRTABLE_${response.status}`);
  return response.json() as Promise<Record<string, unknown>>;
}

export async function GET() {
  try {
    const query = new URLSearchParams({
      "sort[0][field]": "Recorded At",
      "sort[0][direction]": "desc",
      pageSize: "100"
    });
    const payload = await airtable(`?${query.toString()}`);
    const records = Array.isArray(payload.records) ? payload.records : [];
    const picks = records.flatMap((record) => {
      if (!record || typeof record !== "object") return [];
      const fields = (record as Record<string, unknown>).fields;
      if (!fields || typeof fields !== "object") return [];
      const pick = mapFields(fields as Record<string, unknown>);
      return pick ? [pick] : [];
    });
    return NextResponse.json({ picks, configured: true, source: "airtable" });
  } catch (error) {
    const configured = Boolean(token());
    return NextResponse.json({
      picks: seed,
      configured,
      source: "seed",
      warning: configured ? "Airtable read failed; showing the local ledger seed." : "Airtable runtime token is not configured; local picks remain available in this browser."
    });
  }
}

export async function POST(request: NextRequest) {
  const apiToken = token();
  if (!apiToken) {
    return NextResponse.json({ ok: false, configured: false, error: "Airtable runtime token is not configured." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const slug = String(body.slug || "");
  const line = Number(body.line);
  const odds = Number(body.odds);
  const reason = String(body.reason || "");
  if (!slug || !Number.isFinite(line) || !Number.isFinite(odds)) {
    return NextResponse.json({ ok: false, error: "Invalid pick payload." }, { status: 400 });
  }

  const match = getPublishedMatch(slug);
  if (!match) return NextResponse.json({ ok: false, error: "Unknown published match." }, { status: 404 });

  const eligible = match.market_policy.choices.some((choice) => {
    if (Math.abs(choice.line - line) > 0.001) return false;
    const floor = Math.max(match.market_policy.min_price, choice.min_odds);
    const ceiling = Math.min(match.market_policy.max_price, choice.max_odds ?? match.market_policy.max_price);
    return odds >= floor && odds <= ceiling;
  });
  if (!eligible) return NextResponse.json({ ok: false, error: "Line/price is outside the published final market policy." }, { status: 400 });

  const pickId = `${slug}|O${line}|${odds.toFixed(2)}`;
  try {
    const query = new URLSearchParams({ filterByFormula: `{Pick ID}='${escapeFormula(pickId)}'`, maxRecords: "1" });
    const existing = await airtable(`?${query.toString()}`);
    const records = Array.isArray(existing.records) ? existing.records : [];
    if (records.length) return NextResponse.json({ ok: true, created: false, pickId });

    const state = getPublishedState();
    const recordedAt = new Date().toISOString();
    await airtable("", {
      method: "POST",
      body: JSON.stringify({
        records: [{
          fields: {
            "Pick ID": pickId,
            Match: `${match.home} – ${match.away}`,
            Competition: match.competition,
            Kickoff: match.kickoff,
            "Model Version": state.model.version,
            Verdict: "LOCK",
            Line: line,
            Odds: odds,
            "Stake u": 1,
            Result: "PENDING",
            "P/L u": 0,
            "Recorded At": recordedAt,
            "Website Fixture ID": slug,
            Reason: reason
          }
        }],
        typecast: true
      })
    });
    return NextResponse.json({ ok: true, created: true, pickId, recordedAt });
  } catch (error) {
    return NextResponse.json({ ok: false, configured: true, error: "Airtable sync failed." }, { status: 502 });
  }
}
