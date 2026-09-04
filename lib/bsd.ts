import type { TeamProfile } from "@/lib/types";

const BSD_BASE_URL = (process.env.BSD_API_BASE_URL || "https://sports.bzzoiro.com/api/v2").replace(/\/$/, "");
const HISTORY_MATCHES = Math.max(5, Number(process.env.BSD_HISTORY_MATCHES || 10));
const LOOKBACK_DAYS = Math.max(30, Number(process.env.BSD_LOOKBACK_DAYS || 180));

export type BsdEvent = {
  id: number;
  event_date: string;
  status?: string;
  home_team?: { id?: number; name?: string; short_name?: string } | string;
  away_team?: { id?: number; name?: string; short_name?: string } | string;
  home_team_id?: number;
  away_team_id?: number;
  league?: { id?: number; name?: string; country_code?: string; country?: string } | string;
  league_name?: string;
  country_code?: string;
  home_score?: number | null;
  away_score?: number | null;
  home_xg?: number | null;
  away_xg?: number | null;
  home_big_chances?: number | null;
  away_big_chances?: number | null;
};

export type BsdLineup = {
  status: "confirmed" | "predicted" | "unavailable";
  homeStarting: string[];
  awayStarting: string[];
  homeBench: string[];
  awayBench: string[];
  homeFormation?: string;
  awayFormation?: string;
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
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) url.searchParams.set(key, String(value));
  });

  const response = await fetch(url, {
    headers: { Authorization: `Token ${token()}` },
    next: { revalidate: 300 },
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`BSD ${path} returned ${response.status}${text ? `: ${text.slice(0, 180)}` : ""}`);
  }
  return response.json();
}

async function bsdGetAll(path: string, params: Record<string, string | number | undefined> = {}): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let offset = 0;
  const limit = 200;

  for (;;) {
    const payload = await bsdGet(path, { ...params, limit, offset });
    if (Array.isArray(payload)) return payload.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
    if (!payload || typeof payload !== "object") throw new Error(`BSD ${path} returned an invalid envelope`);
    const envelope = payload as Record<string, unknown>;
    const batch = [envelope.results, envelope.events, envelope.data].find(Array.isArray) as unknown[] | undefined;
    if (!batch) throw new Error(`BSD ${path} returned no results array`);
    items.push(...batch.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")));
    const count = typeof envelope.count === "number" ? envelope.count : undefined;
    const next = envelope.next;
    offset += limit;
    if (!next || batch.length < limit || (count !== undefined && offset >= count)) break;
  }
  return items;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function objectName(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const item = value as Record<string, unknown>;
    return String(item.name || item.short_name || item.id || fallback);
  }
  return fallback;
}

export function eventTeamId(event: BsdEvent, side: "home" | "away"): number | undefined {
  const direct = numberValue(event[`${side}_team_id` as keyof BsdEvent]);
  if (direct !== undefined) return direct;
  const nested = event[`${side}_team` as keyof BsdEvent];
  if (nested && typeof nested === "object") return numberValue((nested as Record<string, unknown>).id);
  return undefined;
}

export function eventTeamName(event: BsdEvent, side: "home" | "away"): string {
  return objectName(event[`${side}_team` as keyof BsdEvent], side === "home" ? "Home team" : "Away team");
}

export function eventCompetition(event: BsdEvent): { name: string; countryCode: string } {
  if (event.league && typeof event.league === "object") {
    return {
      name: objectName(event.league, "Unknown competition"),
      countryCode: String(event.league.country_code || event.league.country || "")
    };
  }
  return { name: String(event.league_name || event.league || "Unknown competition"), countryCode: String(event.country_code || "") };
}

export async function fetchBsdEvents(dateFrom: string, dateTo = dateFrom): Promise<BsdEvent[]> {
  const rows = await bsdGetAll("events/", { date_from: dateFrom, date_to: dateTo });
  return rows
    .map((row) => row as BsdEvent)
    .filter((row) => numberValue(row.id) !== undefined && typeof row.event_date === "string")
    .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());
}

export async function fetchBsdEvent(eventId: number): Promise<BsdEvent> {
  const payload = await bsdGet(`events/${eventId}/`);
  if (!payload || typeof payload !== "object") throw new Error("BSD event detail was invalid");
  return payload as BsdEvent;
}

type HistorySample = {
  venue: "home" | "away";
  gf: number;
  ga: number;
  xgFor?: number;
  bigChancesFor?: number;
};

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

async function fetchHistory(teamId: number, kickoff: Date): Promise<HistorySample[]> {
  const end = new Date(kickoff.getTime() - 86_400_000);
  const start = new Date(end.getTime() - LOOKBACK_DAYS * 86_400_000);
  const rows = await bsdGetAll("events/", {
    team_id: teamId,
    status: "finished",
    date_from: dateOnly(start),
    date_to: dateOnly(end)
  });

  return rows
    .map((row) => row as BsdEvent)
    .filter((row) => String(row.status || "").toLowerCase() === "finished")
    .sort((a, b) => new Date(b.event_date).getTime() - new Date(a.event_date).getTime())
    .flatMap((event): HistorySample[] => {
      const homeId = eventTeamId(event, "home");
      const awayId = eventTeamId(event, "away");
      const venue = teamId === homeId ? "home" : teamId === awayId ? "away" : undefined;
      if (!venue) return [];
      const gf = numberValue(venue === "home" ? event.home_score : event.away_score);
      const ga = numberValue(venue === "home" ? event.away_score : event.home_score);
      if (gf === undefined || ga === undefined) return [];
      return [{
        venue,
        gf,
        ga,
        xgFor: numberValue(venue === "home" ? event.home_xg : event.away_xg),
        bigChancesFor: numberValue(venue === "home" ? event.home_big_chances : event.away_big_chances)
      }];
    })
    .slice(0, HISTORY_MATCHES);
}

function mean(values: number[]): number | undefined {
  return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(4)) : undefined;
}

function profileFromHistory(history: HistorySample[], requestedVenue: "home" | "away"): TeamProfile | undefined {
  if (!history.length) return undefined;
  const split = history.filter((item) => item.venue === requestedVenue);
  const relevant = split.length ? split : history;
  const recent = history.slice(0, 5);
  const gf = mean(relevant.map((item) => item.gf));
  const ga = mean(relevant.map((item) => item.ga));
  if (gf === undefined || ga === undefined) return undefined;
  const xg = relevant.flatMap((item) => item.xgFor === undefined ? [] : [item.xgFor]);
  const big = relevant.flatMap((item) => item.bigChancesFor === undefined ? [] : [item.bigChancesFor]);
  return {
    gf,
    ga,
    recentGf: mean(recent.map((item) => item.gf)),
    recentGa: mean(recent.map((item) => item.ga)),
    scoringTwoPlusRate: relevant.filter((item) => item.gf >= 2).length / relevant.length,
    concedingTwoPlusRate: relevant.filter((item) => item.ga >= 2).length / relevant.length,
    cleanSheetRate: relevant.filter((item) => item.ga === 0).length / relevant.length,
    xgFor: mean(xg),
    bigChancesFor: mean(big),
    sampleCount: history.length,
    venueSampleCount: split.length,
    xgCoverage: history.filter((item) => item.xgFor !== undefined).length / history.length
  };
}

export async function fetchBsdProfiles(event: BsdEvent): Promise<{ home: TeamProfile; away: TeamProfile } | undefined> {
  const homeId = eventTeamId(event, "home");
  const awayId = eventTeamId(event, "away");
  if (homeId === undefined || awayId === undefined) return undefined;
  const kickoff = new Date(event.event_date);
  const [homeHistory, awayHistory] = await Promise.all([fetchHistory(homeId, kickoff), fetchHistory(awayId, kickoff)]);
  const home = profileFromHistory(homeHistory, "home");
  const away = profileFromHistory(awayHistory, "away");
  return home && away ? { home, away } : undefined;
}

function playerName(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value;
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  const player = item.player && typeof item.player === "object" ? item.player as Record<string, unknown> : undefined;
  const name = item.name || item.player_name || player?.name || player?.short_name;
  return typeof name === "string" && name.trim() ? name : undefined;
}

function playerList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const name = playerName(item);
    return name ? [name] : [];
  });
}

function sideBlock(root: unknown, side: "home" | "away"): Record<string, unknown> | undefined {
  if (!root) return undefined;
  if (root && typeof root === "object" && !Array.isArray(root)) {
    const object = root as Record<string, unknown>;
    const direct = object[side];
    if (direct && typeof direct === "object" && !Array.isArray(direct)) return direct as Record<string, unknown>;
    const alt = object[`${side}_team`];
    if (alt && typeof alt === "object" && !Array.isArray(alt)) return alt as Record<string, unknown>;
  }
  if (Array.isArray(root)) {
    return root.find((item) => {
      if (!item || typeof item !== "object") return false;
      const row = item as Record<string, unknown>;
      return String(row.side || row.location || row.home_away || "").toLowerCase() === side;
    }) as Record<string, unknown> | undefined;
  }
  return undefined;
}

function parseSide(block: Record<string, unknown> | undefined): { starting: string[]; bench: string[]; formation?: string } {
  if (!block) return { starting: [], bench: [] };
  const starting = playerList(block.starting_xi || block.startingXI || block.starters || block.starting || block.players);
  const bench = playerList(block.substitutes || block.bench || block.subs);
  return { starting: starting.slice(0, 11), bench, formation: typeof block.formation === "string" ? block.formation : undefined };
}

export async function fetchBsdLineup(eventId: number): Promise<BsdLineup> {
  const payload = await bsdGet(`events/${eventId}/lineups/`);
  if (!payload || typeof payload !== "object") return { status: "unavailable", homeStarting: [], awayStarting: [], homeBench: [], awayBench: [] };
  const root = payload as Record<string, unknown>;
  const statusValue = String(root.lineup_status || "unavailable").toLowerCase();
  const status: BsdLineup["status"] = statusValue === "confirmed" ? "confirmed" : statusValue === "predicted" ? "predicted" : "unavailable";
  if (status !== "confirmed") return { status, homeStarting: [], awayStarting: [], homeBench: [], awayBench: [] };
  const lineups = root.lineups ?? root;
  const home = parseSide(sideBlock(lineups, "home"));
  const away = parseSide(sideBlock(lineups, "away"));
  return {
    status,
    homeStarting: home.starting,
    awayStarting: away.starting,
    homeBench: home.bench,
    awayBench: away.bench,
    homeFormation: home.formation,
    awayFormation: away.formation
  };
}

export async function testBsdConnection(targetDate: string): Promise<{ configured: boolean; eventCount: number; baseUrl: string }> {
  if (!isBsdConfigured()) return { configured: false, eventCount: 0, baseUrl: BSD_BASE_URL };
  const events = await fetchBsdEvents(targetDate);
  return { configured: true, eventCount: events.length, baseUrl: BSD_BASE_URL };
}
