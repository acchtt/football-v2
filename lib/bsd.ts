import type { BsdLineup, PublishedMatch } from "@/lib/types";

const BSD_BASE_URL = (process.env.BSD_API_BASE_URL || "https://sports.bzzoiro.com/api/v2").replace(/\/$/, "");

type BsdEvent = {
  id: number;
  event_date: string;
  home_team?: unknown;
  away_team?: unknown;
  home_team_name?: string;
  away_team_name?: string;
};

export type BsdResearchFixture = {
  id: number;
  kickoff: string;
  home: string;
  away: string;
  status: string;
  competition: string;
  competitionResolved: boolean;
  leagueId?: number;
  country?: string;
};

function token(): string {
  const value = process.env.BSD_API_TOKEN;
  if (!value) throw new Error("BSD_API_TOKEN is not configured");
  return value;
}

export function isBsdConfigured(): boolean {
  return Boolean(process.env.BSD_API_TOKEN);
}

async function bsdGet(path: string, params: Record<string, string | number | undefined> = {}): Promise<unknown> {
  const url = new URL(`${BSD_BASE_URL}/${path.replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    headers: { Authorization: `Token ${token()}` },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`BSD ${path} returned ${response.status}`);
  return response.json();
}

async function bsdGetAll(path: string, params: Record<string, string | number | undefined> = {}): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = [];
  let offset = 0;
  const limit = 200;
  for (;;) {
    const payload = await bsdGet(path, { ...params, limit, offset });
    if (Array.isArray(payload)) return payload.filter(isRecord);
    if (!isRecord(payload)) return results;
    const batch = [payload.results, payload.events, payload.data].find(Array.isArray) as unknown[] | undefined;
    if (!batch) return results;
    results.push(...batch.filter(isRecord));
    offset += limit;
    if (!payload.next || batch.length < limit) break;
  }
  return results;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function numeric(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function teamName(value: unknown, flat?: unknown): string {
  if (typeof flat === "string" && flat.trim()) return flat.trim();
  if (typeof value === "string" && value.trim()) return value.trim();
  if (isRecord(value)) {
    const name = value.name ?? value.short_name;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  return "";
}

function normalize(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\b(fc|cf|afc|sc|ac|club)\b/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
}

function day(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function shiftDay(value: string, delta: number): string {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return day(date);
}

function eventSimilarity(match: PublishedMatch, event: BsdEvent): number {
  const eventHome = normalize(teamName(event.home_team, event.home_team_name));
  const eventAway = normalize(teamName(event.away_team, event.away_team_name));
  const home = normalize(match.home);
  const away = normalize(match.away);
  let score = 0;
  if (eventHome === home) score += 5;
  else if (eventHome.includes(home) || home.includes(eventHome)) score += 3;
  if (eventAway === away) score += 5;
  else if (eventAway.includes(away) || away.includes(eventAway)) score += 3;
  const eventTime = new Date(event.event_date).getTime();
  const targetTime = new Date(match.kickoff).getTime();
  if (Number.isFinite(eventTime) && Number.isFinite(targetTime)) {
    const hours = Math.abs(eventTime - targetTime) / 3_600_000;
    if (hours <= 1) score += 3;
    else if (hours <= 6) score += 2;
    else if (hours <= 12) score += 1;
  }
  return score;
}

export async function resolvePublishedMatchEvent(match: PublishedMatch): Promise<BsdEvent | undefined> {
  if (!isBsdConfigured()) return undefined;
  const targetDay = day(new Date(match.kickoff));
  const rows = await bsdGetAll("events/", {
    date_from: shiftDay(targetDay, -1),
    date_to: shiftDay(targetDay, 1)
  });
  const events = rows.flatMap((row): BsdEvent[] => {
    const id = numeric(row.id);
    const eventDate = typeof row.event_date === "string" ? row.event_date : undefined;
    if (id === undefined || !eventDate) return [];
    return [{ ...row, id, event_date: eventDate } as BsdEvent];
  });
  const ranked = events.map((event) => ({ event, score: eventSimilarity(match, event) })).sort((a, b) => b.score - a.score);
  return ranked[0]?.score >= 8 ? ranked[0].event : undefined;
}

function playerName(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!isRecord(value)) return undefined;
  const nested = isRecord(value.player) ? value.player : undefined;
  const name = value.name ?? value.player_name ?? nested?.name ?? nested?.short_name;
  return typeof name === "string" && name.trim() ? name.trim() : undefined;
}

function playerList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const name = playerName(item);
    return name ? [name] : [];
  });
}

function sideBlock(root: unknown, side: "home" | "away"): Record<string, unknown> | undefined {
  if (isRecord(root)) {
    const direct = root[side];
    if (isRecord(direct)) return direct;
    const alt = root[`${side}_team`];
    if (isRecord(alt)) return alt;
  }
  if (Array.isArray(root)) {
    return root.find((item) => isRecord(item) && String(item.side ?? item.location ?? item.home_away ?? "").toLowerCase() === side) as Record<string, unknown> | undefined;
  }
  return undefined;
}

function parseSide(block: Record<string, unknown> | undefined): { starting: string[]; formation?: string } {
  if (!block) return { starting: [] };
  const starting = playerList(block.starting_xi ?? block.startingXI ?? block.starters ?? block.starting ?? block.players).slice(0, 11);
  return { starting, formation: typeof block.formation === "string" ? block.formation : undefined };
}

export async function fetchPublishedMatchLineup(match: PublishedMatch): Promise<BsdLineup> {
  const event = await resolvePublishedMatchEvent(match);
  if (!event) return { status: "unavailable", homeStarting: [], awayStarting: [] };
  const payload = await bsdGet(`events/${event.id}/lineups/`).catch(() => undefined);
  if (!isRecord(payload)) return { status: "unavailable", eventId: event.id, homeStarting: [], awayStarting: [] };
  const statusValue = String(payload.lineup_status ?? payload.status ?? "unavailable").toLowerCase();
  const status: BsdLineup["status"] = statusValue === "confirmed" ? "confirmed" : statusValue === "predicted" ? "predicted" : "unavailable";
  if (status !== "confirmed") return { status, eventId: event.id, homeStarting: [], awayStarting: [] };
  const root = payload.lineups ?? payload;
  const home = parseSide(sideBlock(root, "home"));
  const away = parseSide(sideBlock(root, "away"));
  return {
    status,
    eventId: event.id,
    homeStarting: home.starting,
    awayStarting: away.starting,
    homeFormation: home.formation,
    awayFormation: away.formation
  };
}

function objectName(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (isRecord(value)) {
    const name = value.name ?? value.short_name;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  return "";
}

function objectCountry(value: unknown): string {
  if (!isRecord(value)) return "";
  const country = value.country_code ?? value.country;
  return typeof country === "string" ? country.trim() : "";
}

export async function fetchBsdResearchSlate(dateFrom: string, dateTo: string): Promise<BsdResearchFixture[]> {
  if (!isBsdConfigured()) return [];
  const [rows, leagueRows] = await Promise.all([
    bsdGetAll("events/", { date_from: dateFrom, date_to: dateTo }),
    bsdGetAll("leagues/")
  ]);

  const leagueDirectory = new Map<number, { name: string; country: string }>();
  for (const row of leagueRows) {
    const id = numeric(row.id);
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (id === undefined || !name) continue;
    const country = typeof row.country_code === "string" ? row.country_code : typeof row.country === "string" ? row.country : "";
    leagueDirectory.set(id, { name, country });
  }

  return rows.flatMap((row): BsdResearchFixture[] => {
    const id = numeric(row.id);
    const kickoff = typeof row.event_date === "string" ? row.event_date : "";
    const home = teamName(row.home_team, row.home_team_name);
    const away = teamName(row.away_team, row.away_team_name);
    if (id === undefined || !kickoff || !home || !away) return [];

    const leagueId = numeric(row.league_id) ?? (isRecord(row.league) ? numeric(row.league.id) : numeric(row.league));
    const inlineCompetition = [row.league, row.competition, row.tournament].map(objectName).find(Boolean)
      || (typeof row.league_name === "string" ? row.league_name.trim() : "")
      || (typeof row.competition_name === "string" ? row.competition_name.trim() : "")
      || (typeof row.tournament_name === "string" ? row.tournament_name.trim() : "");
    const resolvedLeague = leagueId !== undefined ? leagueDirectory.get(leagueId) : undefined;
    const competition = inlineCompetition || resolvedLeague?.name || "Unknown competition";
    const country = [row.league, row.competition, row.tournament].map(objectCountry).find(Boolean)
      || (typeof row.country_code === "string" ? row.country_code : "")
      || (typeof row.country === "string" ? row.country : "")
      || resolvedLeague?.country
      || undefined;

    return [{
      id,
      kickoff,
      home,
      away,
      status: String(row.status ?? "scheduled"),
      competition,
      competitionResolved: competition !== "Unknown competition",
      leagueId,
      country
    }];
  }).sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
}
