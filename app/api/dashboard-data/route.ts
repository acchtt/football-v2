import { NextResponse } from "next/server";
import { records, selectName, TABLES, type Rec } from "@/lib/airtable";
import { fetchManualScores, getManualScore } from "@/lib/manual-scores";
import { fetchBsdFixtures, getBsdFixture } from "@/lib/bsd";

export const dynamic = "force-dynamic";

const ALLOWED_ORIGIN = "https://acchtt.github.io";
const ZONE = "Asia/Ho_Chi_Minh";

type CoverageRow = {
  "Coverage ID"?: string;
  "Slate Date"?: string;
  Match?: string;
  Competition?: string;
  "Kickoff ICT"?: string;
  "Coverage Status"?: unknown;
  "PRE Grade"?: unknown;
  "Structural Type"?: unknown;
  "Board Tier"?: unknown;
  "XI Status"?: unknown;
  "Market Status"?: unknown;
  "Screened At"?: string;
  "Frozen PRE Summary"?: string;
  "Coverage Notes"?: string;
};

type PickRow = {
  "Pick ID"?: string;
  Match?: string;
  Competition?: string;
  Kickoff?: string;
  "Model Version"?: string;
  Verdict?: unknown;
  Line?: number;
  Odds?: number;
  "Stake u"?: number;
  Result?: unknown;
  "P/L u"?: number;
  "Recorded At"?: string;
  Reason?: string;
};

const COVERAGE_FIELDS = [
  "Coverage ID", "Slate Date", "Match", "Competition", "Kickoff ICT",
  "Coverage Status", "PRE Grade", "Structural Type", "Board Tier",
  "XI Status", "Market Status", "Screened At", "Frozen PRE Summary", "Coverage Notes"
];

const PICK_FIELDS = [
  "Pick ID", "Match", "Competition", "Kickoff", "Model Version", "Verdict",
  "Line", "Odds", "Stake u", "Result", "P/L u", "Recorded At", "Reason"
];

function timestamp(value?: string) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateKey(value: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function slateDay(row: CoverageRow) {
  const slate = row["Slate Date"];
  if (slate && /^\d{4}-\d{2}-\d{2}$/.test(slate)) return slate;
  const kickoff = row["Kickoff ICT"];
  return kickoff && timestamp(kickoff) ? dateKey(kickoff) : "";
}

function normalize(value = "") {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function fixtureKey(row: CoverageRow) {
  return `${normalize(row.Match)}|${slateDay(row)}`;
}

function cors(headers: HeadersInit = {}) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store, max-age=0",
    ...headers
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors() });
}

export async function GET() {
  try {
    const [coverageRows, pickRows, manualScores] = await Promise.all([
      records<CoverageRow>(TABLES.coverage, COVERAGE_FIELDS, { field: "Screened At", direction: "desc" }),
      records<PickRow>(TABLES.picks, PICK_FIELDS, { field: "Recorded At", direction: "desc" }),
      fetchManualScores()
    ]);

    const latest = new Map<string, Rec<CoverageRow>>();
    for (const record of [...coverageRows].sort((a, b) => timestamp(b.fields["Screened At"] || b.createdTime) - timestamp(a.fields["Screened At"] || a.createdTime))) {
      const key = fixtureKey(record.fields);
      if (!key || key.endsWith("|") || latest.has(key)) continue;
      latest.set(key, record);
    }

    const boardBase = [...latest.values()]
      .filter((record) => ["FOCUS", "WATCHLIST"].includes(selectName(record.fields["Board Tier"])))
      .filter((record) => Boolean(slateDay(record.fields)) && timestamp(record.fields["Kickoff ICT"]) > 0)
      .sort((a, b) => {
        const dayCompare = slateDay(b.fields).localeCompare(slateDay(a.fields));
        return dayCompare || timestamp(b.fields["Kickoff ICT"]) - timestamp(a.fields["Kickoff ICT"]);
      });

    const pickBase = pickRows
      .filter((pick) => timestamp(pick.fields.Kickoff) > 0)
      .sort((a, b) => timestamp(b.fields["Recorded At"] || b.fields.Kickoff) - timestamp(a.fields["Recorded At"] || a.fields.Kickoff));

    const fixtureRefs = [
      ...boardBase.flatMap((record) => {
        const match = record.fields.Match;
        const kickoff = record.fields["Kickoff ICT"];
        return match && kickoff ? [{ match, kickoff }] : [];
      }),
      ...pickBase.flatMap((record) => {
        const match = record.fields.Match;
        const kickoff = record.fields.Kickoff;
        return match && kickoff ? [{ match, kickoff }] : [];
      })
    ];

    const bsdFixtures = await fetchBsdFixtures(fixtureRefs);

    const schedule = boardBase.map((record) => {
      const row = record.fields;
      const match = row.Match || "Unknown fixture";
      const kickoff = row["Kickoff ICT"] as string;
      const bsd = getBsdFixture(bsdFixtures, match, kickoff);
      const manual = getManualScore(manualScores, match, kickoff);
      return {
        id: record.id,
        slateDate: slateDay(row),
        match,
        competition: row.Competition || "",
        kickoff,
        displayKickoff: bsd?.kickoff || kickoff,
        tier: selectName(row["Board Tier"]),
        grade: selectName(row["PRE Grade"]),
        structure: selectName(row["Structural Type"]),
        xiStatus: selectName(row["XI Status"]),
        marketStatus: selectName(row["Market Status"]),
        coverageStatus: selectName(row["Coverage Status"]),
        frozenPreSummary: row["Frozen PRE Summary"] || "",
        coverageNotes: row["Coverage Notes"] || "",
        manualScore: manual || null,
        bsd: bsd ? { eventId: bsd.eventId, status: bsd.status, home: bsd.home, away: bsd.away, minute: bsd.currentMinute, period: bsd.period } : null
      };
    });

    const picks = pickBase.map((record) => {
      const row = record.fields;
      const match = row.Match || "Unknown fixture";
      const kickoff = row.Kickoff as string;
      const bsd = getBsdFixture(bsdFixtures, match, kickoff);
      const manual = getManualScore(manualScores, match, kickoff);
      return {
        id: record.id,
        pickId: row["Pick ID"] || "",
        match,
        competition: row.Competition || "",
        kickoff,
        displayKickoff: bsd?.kickoff || kickoff,
        modelVersion: row["Model Version"] || "",
        verdict: selectName(row.Verdict),
        line: row.Line,
        odds: row.Odds,
        stake: row["Stake u"],
        result: selectName(row.Result) || "PENDING",
        pl: row["P/L u"],
        recordedAt: row["Recorded At"] || kickoff,
        reason: row.Reason || "",
        manualScore: manual || null,
        bsd: bsd ? { eventId: bsd.eventId, status: bsd.status, home: bsd.home, away: bsd.away, minute: bsd.currentMinute, period: bsd.period } : null
      };
    });

    return NextResponse.json({ ok: true, schedule, picks, generatedAt: new Date().toISOString() }, { headers: cors() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    return NextResponse.json({ ok: false, error: message }, { status: 502, headers: cors() });
  }
}
