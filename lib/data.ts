import { z } from "zod";
import type { MatchRecord } from "@/lib/types";

const matchSchema = z.object({
  id: z.string(), kickoff: z.string(), competition: z.string(), home: z.string(), away: z.string(),
  focus: z.enum(["TOP FOCUS", "STRONG FOCUS", "SECONDARY", "HOLD", "PASS-FIRST"]),
  preRank: z.number(), preScore: z.number(), structuralFamily: z.string(), carrier: z.string(),
  secondaryRoute: z.string(), failureModeResistance: z.string(), evidenceSummary: z.string(), stage: z.string(),
  homeProfile: z.object({ gf: z.number(), ga: z.number(), scoringTwoPlusRate: z.number(), concedingTwoPlusRate: z.number() }),
  awayProfile: z.object({ gf: z.number(), ga: z.number(), scoringTwoPlusRate: z.number(), concedingTwoPlusRate: z.number() }),
  lineupStatus: z.enum(["confirmed", "predicted", "unavailable"]),
  homeXI: z.array(z.string()), awayXI: z.array(z.string()), xiNote: z.string(),
  offers: z.array(z.object({ line: z.number(), odds: z.number() })),
  verdict: z.enum(["LOCK", "HOLD", "PENDING"]), preferredLine: z.number().optional(), preferredOdds: z.number().optional(),
  verdictReason: z.string(), result: z.string().optional(), pnl: z.number().optional()
});

const payloadSchema = z.object({ matches: z.array(matchSchema) });

const demoMatches: MatchRecord[] = [
  {
    id: "ame-mty-acceptance",
    kickoff: "2026-09-03T20:00:00-05:00",
    competition: "Leagues Cup",
    home: "Club América",
    away: "Monterrey",
    focus: "TOP FOCUS",
    preRank: 1,
    preScore: 9.2,
    structuralFamily: "Two-sided carrier with suppression",
    carrier: "Both sides retain credible scoring routes",
    secondaryRoute: "Credible, but not strong enough to surrender central protection",
    failureModeResistance: "Medium",
    evidenceSummary: "Canonical acceptance control for the current model.",
    stage: "OFFICIAL_LOCK_OR_HOLD",
    homeProfile: { gf: 2.0, ga: 1.1, scoringTwoPlusRate: 0.68, concedingTwoPlusRate: 0.26 },
    awayProfile: { gf: 2.1, ga: 1.2, scoringTwoPlusRate: 0.71, concedingTwoPlusRate: 0.31 },
    lineupStatus: "confirmed",
    homeXI: ["Confirmed XI from provider"],
    awayXI: ["Confirmed XI from provider"],
    xiNote: "XI keeps both scoring routes live. No unsupported route is created from names alone.",
    offers: [{ line: 2.5, odds: 1.69 }, { line: 2.75, odds: 1.89 }, { line: 3.0, odds: 2.16 }, { line: 3.25, odds: 2.42 }],
    verdict: "LOCK",
    preferredLine: 2.75,
    preferredOdds: 1.89,
    verdictReason: "O2.5 is below the active 1.70 price floor. O2.75 preserves the preferred protection while O3 gives up too much central-outcome protection.",
    result: "2-2",
    pnl: 0.89
  },
  {
    id: "koe-hof-control",
    kickoff: "2026-08-29T18:30:00+02:00",
    competition: "Bundesliga",
    home: "Köln",
    away: "Hoffenheim",
    focus: "STRONG FOCUS",
    preRank: 2,
    preScore: 8.6,
    structuralFamily: "Two independent routes",
    carrier: "Both teams independently capable of contributing",
    secondaryRoute: "Strong",
    failureModeResistance: "High",
    evidenceSummary: "Historical clean control where O3 retained push protection at exactly three.",
    stage: "OFFICIAL_LOCK_OR_HOLD",
    homeProfile: { gf: 1.8, ga: 1.5, scoringTwoPlusRate: 0.56, concedingTwoPlusRate: 0.43 },
    awayProfile: { gf: 1.9, ga: 1.6, scoringTwoPlusRate: 0.61, concedingTwoPlusRate: 0.47 },
    lineupStatus: "confirmed",
    homeXI: ["Ache", "Thielmann", "El Mala"],
    awayXI: ["Hlozek", "Bamba", "Wimmer", "Daghim"],
    xiNote: "Confirmed attacking routes on both sides support the stronger burden.",
    offers: [{ line: 2.75, odds: 1.74 }, { line: 3.0, odds: 1.95 }, { line: 3.25, odds: 2.20 }],
    verdict: "LOCK",
    preferredLine: 3.0,
    preferredOdds: 1.95,
    verdictReason: "Independent routes and high failure-mode resistance justify O3: exactly three pushes and four-plus wins."
  },
  {
    id: "ips-lei-control",
    kickoff: "2026-08-26T19:45:00+01:00",
    competition: "EFL Cup",
    home: "Ipswich Town",
    away: "Leicester City",
    focus: "SECONDARY",
    preRank: 3,
    preScore: 7.9,
    structuralFamily: "Protected carrier play",
    carrier: "Ipswich is the primary senior attacking carrier",
    secondaryRoute: "Weak / conditional",
    failureModeResistance: "Medium-low",
    evidenceSummary: "Historical control where higher price did not justify surrendering protection.",
    stage: "OFFICIAL_LOCK_OR_HOLD",
    homeProfile: { gf: 1.9, ga: 1.1, scoringTwoPlusRate: 0.59, concedingTwoPlusRate: 0.28 },
    awayProfile: { gf: 1.4, ga: 1.6, scoringTwoPlusRate: 0.38, concedingTwoPlusRate: 0.51 },
    lineupStatus: "confirmed",
    homeXI: ["Senior attacking carrier confirmed"],
    awayXI: ["Heavily rotated / youth-weighted XI"],
    xiNote: "Leicester rotation weakens the independent second route.",
    offers: [{ line: 2.75, odds: 1.75 }, { line: 3.0, odds: 2.00 }, { line: 3.25, odds: 2.25 }],
    verdict: "LOCK",
    preferredLine: 2.75,
    preferredOdds: 1.75,
    verdictReason: "This remains a protected carrier play; do not upgrade to O3 merely for price."
  }
];

export type DataMode = "LIVE" | "DEMO";

export async function getMatches(): Promise<{ mode: DataMode; matches: MatchRecord[] }> {
  const url = process.env.FOOTBALL_FIXTURES_JSON_URL;
  if (!url) return { mode: "DEMO", matches: demoMatches };

  const response = await fetch(url, {
    headers: process.env.FOOTBALL_API_TOKEN ? { Authorization: `Bearer ${process.env.FOOTBALL_API_TOKEN}` } : {},
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Fixture provider returned ${response.status}`);
  const parsed = payloadSchema.parse(await response.json());
  return { mode: "LIVE", matches: parsed.matches as MatchRecord[] };
}

export async function getMatch(id: string): Promise<{ mode: DataMode; match: MatchRecord | undefined }> {
  const data = await getMatches();
  return { mode: data.mode, match: data.matches.find((item) => item.id === id) };
}
