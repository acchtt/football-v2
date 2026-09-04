import type { MatchRecord, TeamProfile } from "@/lib/types";
import { MODEL } from "@/lib/model";
import {
  eventCompetition,
  eventTeamId,
  eventTeamName,
  fetchBsdEvent,
  fetchBsdEvents,
  fetchBsdLeagueDirectory,
  fetchBsdLineup,
  fetchBsdProfiles,
  isBsdConfigured,
  type BsdEvent,
  type BsdLeagueDirectory
} from "@/lib/bsd";
import { assessStructure } from "@/lib/structural";

const demoMatches: MatchRecord[] = [
  {
    id: "ame-mty-acceptance",
    provider: "demo",
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
    provider: "demo",
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
    provider: "demo",
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

export type DataMode = "BSD" | "DEMO";

function partsForIct(value: Date): Record<string, string> {
  return Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: MODEL.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

export function currentIctDate(): string {
  const parts = partsForIct(new Date());
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function ictDateOf(timestamp: string): string {
  const parts = partsForIct(new Date(timestamp));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function normalizeCompetition(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function eligibleCompetition(name: string): boolean {
  const normalized = normalizeCompetition(name);
  if (!normalized || normalized === "unknown competition") return false;

  if (MODEL.competitionScope.namedCupExceptions.some((item) => normalized.includes(normalizeCompetition(item)))) {
    return true;
  }

  const excludedNonDomestic = [
    "champions league",
    "europa league",
    "conference league",
    "libertadores",
    "sudamericana",
    "afc champions",
    "concacaf champions",
    "club world cup",
    "fifa club world",
    "recopa",
    "world cup",
    "nations league",
    "international friendly",
    "friendlies",
    "friendly"
  ];
  if (excludedNonDomestic.some((token) => normalized.includes(token))) return false;

  if (/\bcup\b|\bpokal\b|\btrophy\b|super cup|supercup|coupe|copa/.test(normalized)) return false;
  return true;
}

function emptyProfile(): TeamProfile {
  return {};
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function buildBsdMatch(
  event: BsdEvent,
  includeLineup = false,
  leagueDirectory?: BsdLeagueDirectory
): Promise<MatchRecord> {
  const home = eventTeamName(event, "home");
  const away = eventTeamName(event, "away");
  const competition = eventCompetition(event, leagueDirectory);
  const profiles = await fetchBsdProfiles(event).catch(() => undefined);
  const assessment = profiles ? assessStructure(profiles.home, profiles.away, home, away) : undefined;
  const lineup = includeLineup ? await fetchBsdLineup(event.id).catch(() => ({
    status: "unavailable" as const,
    homeStarting: [], awayStarting: [], homeBench: [], awayBench: []
  })) : undefined;
  const finished = String(event.status || "").toLowerCase() === "finished";
  const homeScore = typeof event.home_score === "number" ? event.home_score : undefined;
  const awayScore = typeof event.away_score === "number" ? event.away_score : undefined;

  return {
    id: `bsd-${event.id}`,
    provider: "bsd",
    providerEventId: event.id,
    kickoff: event.event_date,
    competition: competition.name,
    countryCode: competition.countryCode,
    home,
    away,
    homeTeamId: eventTeamId(event, "home"),
    awayTeamId: eventTeamId(event, "away"),
    homeLogoUrl: eventTeamId(event, "home") ? `https://sports.bzzoiro.com/img/team/${eventTeamId(event, "home")}/` : undefined,
    awayLogoUrl: eventTeamId(event, "away") ? `https://sports.bzzoiro.com/img/team/${eventTeamId(event, "away")}/` : undefined,
    focus: assessment?.focus || "PASS-FIRST",
    preRank: 0,
    preScore: assessment?.score || 0,
    structuralGrade: assessment?.grade,
    structuralFamily: assessment?.family || "Profile incomplete",
    carrier: assessment?.carrier || "Pending mandatory GF/GA evidence",
    secondaryRoute: assessment?.secondaryRoute || "Pending mandatory GF/GA evidence",
    failureModeResistance: assessment?.failureModeResistance || "Unresolved",
    failureModes: assessment?.failureModes || ["Mandatory GF/GA history unavailable"],
    evidenceSummary: assessment?.evidenceSummary || "BSD fixture loaded, but the mandatory pre-kickoff team profile is incomplete. No structural promotion is allowed.",
    stage: assessment ? "WAITING_XI" : "PRE_SCREENED",
    homeProfile: profiles?.home || emptyProfile(),
    awayProfile: profiles?.away || emptyProfile(),
    lineupStatus: lineup?.status || "unavailable",
    homeXI: lineup?.status === "confirmed" ? lineup.homeStarting : [],
    awayXI: lineup?.status === "confirmed" ? lineup.awayStarting : [],
    homeBench: lineup?.status === "confirmed" ? lineup.homeBench : [],
    awayBench: lineup?.status === "confirmed" ? lineup.awayBench : [],
    homeFormation: lineup?.status === "confirmed" ? lineup.homeFormation : undefined,
    awayFormation: lineup?.status === "confirmed" ? lineup.awayFormation : undefined,
    xiNote: lineup?.status === "confirmed"
      ? "Official BSD teamsheet loaded. Player names cannot create an unsupported route by themselves."
      : lineup?.status === "predicted"
        ? "BSD has a predicted XI, but the model ignores predicted lineups and waits for lineup_status=confirmed."
        : "Waiting for an official confirmed BSD teamsheet.",
    offers: [],
    verdict: "PENDING",
    verdictReason: "Bookmaker market is screenshot-only. Upload and visibly verify the odds before a LOCK/HOLD decision.",
    result: finished && homeScore !== undefined && awayScore !== undefined ? `${homeScore}-${awayScore}` : undefined
  };
}

export async function getMatches(targetDateIct = currentIctDate()): Promise<{ mode: DataMode; matches: MatchRecord[]; date: string }> {
  if (!isBsdConfigured() || process.env.DATA_PROVIDER === "demo") {
    return { mode: "DEMO", matches: demoMatches, date: targetDateIct };
  }

  const [events, leagueDirectory] = await Promise.all([
    fetchBsdEvents(shiftDate(targetDateIct, -1), shiftDate(targetDateIct, 1)),
    fetchBsdLeagueDirectory()
  ]);

  const eligible = events.filter((event) => {
    if (ictDateOf(event.event_date) !== targetDateIct) return false;
    const competition = eventCompetition(event, leagueDirectory);
    return competition.resolved && eligibleCompetition(competition.name);
  });

  const matches = await mapWithConcurrency(eligible, 8, (event) => buildBsdMatch(event, false, leagueDirectory));
  matches.sort((a, b) => b.preScore - a.preScore || new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
  matches.forEach((match, index) => { match.preRank = index + 1; });
  return { mode: "BSD", matches, date: targetDateIct };
}

export async function getMatch(id: string): Promise<{ mode: DataMode; match: MatchRecord | undefined }> {
  if (id.startsWith("bsd-") && isBsdConfigured()) {
    const eventId = Number(id.slice(4));
    if (!Number.isFinite(eventId)) return { mode: "BSD", match: undefined };
    const [event, leagueDirectory] = await Promise.all([fetchBsdEvent(eventId), fetchBsdLeagueDirectory()]);
    const competition = eventCompetition(event, leagueDirectory);
    if (!competition.resolved || !eligibleCompetition(competition.name)) {
      return { mode: "BSD", match: undefined };
    }
    const match = await buildBsdMatch(event, true, leagueDirectory);
    return { mode: "BSD", match: { ...match, preRank: 1 } };
  }
  return { mode: "DEMO", match: demoMatches.find((item) => item.id === id) };
}
