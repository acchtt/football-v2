import { MODEL } from "@/lib/model";
import {
  currentIctDate,
  getMatch as getBaseMatch,
  getMatches as getBaseMatches,
  type DataMode
} from "@/lib/data";
import {
  fetchBsdEvent,
  fetchBsdEvents,
  fetchBsdLeagueDirectory,
  type BsdEvent,
  type BsdLeagueDirectory
} from "@/lib/bsd";
import type { MatchRecord } from "@/lib/types";

export { currentIctDate };
export type { DataMode };

type CompetitionIdentity = {
  name: string;
  countryCode: string;
  resolved: boolean;
};

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

export function resolveCompetitionSafely(
  event: BsdEvent,
  directory?: BsdLeagueDirectory
): CompetitionIdentity {
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

  // Critical namespace rule: only a real BSD league_id may be resolved against /leagues/.
  // competition_id and tournament_id belong to different namespaces and must never be
  // interpreted as league IDs merely because their numeric values happen to collide.
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

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export async function getMatches(targetDateIct = currentIctDate()): Promise<{
  mode: DataMode;
  matches: MatchRecord[];
  date: string;
}> {
  const base = await getBaseMatches(targetDateIct);
  if (base.mode !== "BSD") return base;

  const [events, directory] = await Promise.all([
    fetchBsdEvents(shiftDate(targetDateIct, -1), shiftDate(targetDateIct, 1)),
    fetchBsdLeagueDirectory()
  ]);
  const byId = new Map(events.map((event) => [event.id, event]));

  const matches = base.matches.flatMap((match): MatchRecord[] => {
    if (match.providerEventId === undefined) return [];
    const event = byId.get(match.providerEventId);
    if (!event) return [];
    const competition = resolveCompetitionSafely(event, directory);
    if (!competition.resolved || !eligibleCompetition(competition.name)) return [];
    return [{ ...match, competition: competition.name, countryCode: competition.countryCode }];
  });

  matches.sort((a, b) => b.preScore - a.preScore || new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
  matches.forEach((match, index) => { match.preRank = index + 1; });
  return { mode: "BSD", matches, date: base.date };
}

export async function getMatch(id: string): Promise<{ mode: DataMode; match: MatchRecord | undefined }> {
  const base = await getBaseMatch(id);
  if (base.mode !== "BSD" || !base.match?.providerEventId) return base;

  const [event, directory] = await Promise.all([
    fetchBsdEvent(base.match.providerEventId),
    fetchBsdLeagueDirectory()
  ]);
  const competition = resolveCompetitionSafely(event, directory);
  if (!competition.resolved || !eligibleCompetition(competition.name)) {
    return { mode: "BSD", match: undefined };
  }
  return {
    mode: "BSD",
    match: { ...base.match, competition: competition.name, countryCode: competition.countryCode }
  };
}
