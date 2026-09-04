import { MODEL } from "@/lib/model";
import {
  currentIctDate,
  getMatch as getDemoMatch,
  getMatches as getDemoMatches,
  type DataMode
} from "@/lib/data";
import {
  eventTeamId,
  eventTeamName,
  fetchBsdEvent,
  fetchBsdEvents,
  fetchBsdLeagueDirectory,
  fetchBsdLineup,
  isBsdConfigured,
  type BsdEvent,
  type BsdLeagueDirectory
} from "@/lib/bsd";
import { fetchCanonicalBsdProfiles } from "@/lib/bsd-canonical-profiles";
import { assessStructure } from "@/lib/structural";
import type { MatchRecord, TeamProfile } from "@/lib/types";

export { currentIctDate };
export type { DataMode };

type CompetitionIdentity = {
  name: string;
  countryCode: string;
  resolved: boolean;
};

export type BoardData = {
  mode: DataMode;
  matches: MatchRecord[];
  date: string;
  scannedCount: number;
};

const FINISHED_STATES = new Set(["finished", "ft", "aet", "after_extra_time", "after_penalties"]);

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function explicitObjectName(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const item = value as Record<string, unknown>;
  const name = item.name || item.short_name;
  return typeof name === "string" ? name.trim() : "";
}

function explicitObjectCountry(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const item = value as Record<string, unknown>;
  const country = item.country_code || item.country;
  return typeof country === "string" ? country : "";
}

function scalarName(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || /^\d+$/.test(trimmed)) return "";
  return trimmed;
}

function realLeagueId(event: BsdEvent): number | undefined {
  const direct = numberValue(event.league_id);
  if (direct !== undefined) return direct;
  if (event.league && typeof event.league === "object" && !Array.isArray(event.league)) {
    const nested = numberValue((event.league as Record<string, unknown>).id);
    if (nested !== undefined) return nested;
  }
  return numberValue(event.league);
}

export function resolveCompetitionSafely(event: BsdEvent, directory?: BsdLeagueDirectory): CompetitionIdentity {
  for (const candidate of [event.league, event.competition, event.tournament]) {
    const objectName = explicitObjectName(candidate);
    if (objectName) {
      return {
        name: objectName,
        countryCode: explicitObjectCountry(candidate) || String(event.country_code || event.country || ""),
        resolved: true
      };
    }
    const name = scalarName(candidate);
    if (name) {
      return {
        name,
        countryCode: String(event.country_code || event.country || ""),
        resolved: true
      };
    }
  }

  const flatName = String(event.league_name || event.competition_name || event.tournament_name || "").trim();
  if (flatName) {
    return {
      name: flatName,
      countryCode: String(event.country_code || event.country || ""),
      resolved: true
    };
  }

  // Only a real BSD league_id may resolve through /leagues/. Numeric competition/tournament
  // identifiers are different namespaces and must never be treated as league IDs.
  const leagueId = realLeagueId(event);
  const league = leagueId === undefined ? undefined : directory?.get(leagueId);
  if (league) {
    return {
      name: league.name,
      countryCode: String(league.country_code || league.country || event.country_code || event.country || ""),
      resolved: true
    };
  }

  return {
    name: "Unknown competition",
    countryCode: String(event.country_code || event.country || ""),
    resolved: false
  };
}

function normalized(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

function countryIsEngland(countryCode: string): boolean {
  return new Set(["GB ENG", "ENG", "ENGLAND", "GB", "UK", "UNITED KINGDOM"]).has(normalized(countryCode));
}

function looksLikeCup(competition: string): boolean {
  const value = normalized(competition);
  return [" CUP", "CUP ", "POKAL", "COPA", "COPPA", "TACA", "TROPHY", "SHIELD"].some((token) => value.includes(token)) || value.endsWith("CUP");
}

function looksContinental(competition: string): boolean {
  const value = normalized(competition);
  return [
    "UEFA", "CONMEBOL", "CONCACAF", "AFC CHAMPIONS", "CAF CHAMPIONS",
    "LIBERTADORES", "SUDAMERICANA", "CHAMPIONS LEAGUE", "EUROPA LEAGUE",
    "CONFERENCE LEAGUE", "CLUB WORLD CUP"
  ].some((token) => value.includes(token));
}

function eligibleCompetition(identity: CompetitionIdentity): boolean {
  const value = normalized(identity.name);
  if (!identity.resolved || !value || value === "UNKNOWN COMPETITION") return false;

  if (value === "LEAGUES CUP" || value.endsWith(" LEAGUES CUP")) return true;
  if (value.includes("DFB POKAL")) return true;
  if (countryIsEngland(identity.countryCode) && looksLikeCup(identity.name)) return true;
  if (looksContinental(identity.name)) return false;
  if (looksLikeCup(identity.name)) return false;
  return true;
}

function displayOnCanonicalBoard(match: MatchRecord): boolean {
  if (match.preScore < MODEL.structural.boardMinScore) return false;
  return match.structuralGrade === "A1" || match.structuralGrade === "A2" || match.structuralGrade === "B+";
}

function partsForIct(value: Date): Record<string, string> {
  return Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: MODEL.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
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

function emptyProfile(): TeamProfile {
  return {};
}

function eventScore(event: BsdEvent, side: "home" | "away"): number | undefined {
  const raw = event as unknown as Record<string, unknown>;
  for (const key of [`${side}_score`, `${side}_goals`, `score_${side}`]) {
    const value = numberValue(raw[key]);
    if (value !== undefined) return value;
  }
  const score = raw.score;
  if (score && typeof score === "object" && !Array.isArray(score)) {
    return numberValue((score as Record<string, unknown>)[side]);
  }
  return undefined;
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

async function buildLiveMatch(event: BsdEvent, competition: CompetitionIdentity, includeLineup: boolean): Promise<MatchRecord> {
  const home = eventTeamName(event, "home");
  const away = eventTeamName(event, "away");
  const profiles = await fetchCanonicalBsdProfiles(event).catch(() => undefined);
  const assessment = profiles ? assessStructure(profiles.home, profiles.away, home, away) : undefined;
  const lineup = includeLineup ? await fetchBsdLineup(event.id).catch(() => ({
    status: "unavailable" as const,
    homeStarting: [], awayStarting: [], homeBench: [], awayBench: []
  })) : undefined;
  const status = String(event.status || "").trim().toLowerCase();
  const homeScore = eventScore(event, "home");
  const awayScore = eventScore(event, "away");
  const lineupStatus = lineup?.status || "unavailable";

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
    stage: lineupStatus === "confirmed" ? "XI_CONFIRMED" : assessment ? "WAITING_XI" : "PRE_SCREENED",
    homeProfile: profiles?.home || emptyProfile(),
    awayProfile: profiles?.away || emptyProfile(),
    lineupStatus,
    homeXI: lineupStatus === "confirmed" ? lineup?.homeStarting || [] : [],
    awayXI: lineupStatus === "confirmed" ? lineup?.awayStarting || [] : [],
    homeBench: lineupStatus === "confirmed" ? lineup?.homeBench || [] : [],
    awayBench: lineupStatus === "confirmed" ? lineup?.awayBench || [] : [],
    homeFormation: lineupStatus === "confirmed" ? lineup?.homeFormation : undefined,
    awayFormation: lineupStatus === "confirmed" ? lineup?.awayFormation : undefined,
    xiNote: lineupStatus === "confirmed"
      ? "Official BSD teamsheet loaded. Player names cannot create an unsupported route by themselves."
      : lineupStatus === "predicted"
        ? "BSD has a predicted XI, but v0.2.47-R ignores predicted lineups and waits for lineup_status=confirmed."
        : "Waiting for an official confirmed BSD teamsheet.",
    offers: [],
    verdict: "PENDING",
    verdictReason: "Bookmaker market is screenshot-only. Upload and visibly verify the odds before a LOCK/HOLD decision.",
    result: FINISHED_STATES.has(status) && homeScore !== undefined && awayScore !== undefined ? `${homeScore}-${awayScore}` : undefined
  };
}

export async function getMatches(targetDateIct = currentIctDate()): Promise<BoardData> {
  if (!isBsdConfigured() || process.env.DATA_PROVIDER === "demo") {
    const demo = await getDemoMatches(targetDateIct);
    return { ...demo, scannedCount: demo.matches.length };
  }

  const [events, directory] = await Promise.all([
    fetchBsdEvents(shiftDate(targetDateIct, -1), shiftDate(targetDateIct, 1)),
    fetchBsdLeagueDirectory()
  ]);

  const scoped = events.flatMap((event): Array<{ event: BsdEvent; competition: CompetitionIdentity }> => {
    if (ictDateOf(event.event_date) !== targetDateIct) return [];
    const competition = resolveCompetitionSafely(event, directory);
    if (!eligibleCompetition(competition)) return [];
    return [{ event, competition }];
  });

  const assessed = await mapWithConcurrency(scoped, 6, ({ event, competition }) => buildLiveMatch(event, competition, false));
  const matches = assessed.filter(displayOnCanonicalBoard);
  matches.sort((a, b) => b.preScore - a.preScore || new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
  matches.forEach((match, index) => { match.preRank = index + 1; });

  return { mode: "BSD", matches, date: targetDateIct, scannedCount: scoped.length };
}

export async function getMatch(id: string): Promise<{ mode: DataMode; match: MatchRecord | undefined }> {
  if (!id.startsWith("bsd-") || !isBsdConfigured() || process.env.DATA_PROVIDER === "demo") {
    return getDemoMatch(id);
  }

  const eventId = Number(id.slice(4));
  if (!Number.isFinite(eventId)) return { mode: "BSD", match: undefined };
  const [event, directory] = await Promise.all([fetchBsdEvent(eventId), fetchBsdLeagueDirectory()]);
  const competition = resolveCompetitionSafely(event, directory);
  if (!eligibleCompetition(competition)) return { mode: "BSD", match: undefined };
  const match = await buildLiveMatch(event, competition, true);
  return { mode: "BSD", match: { ...match, preRank: 1 } };
}
