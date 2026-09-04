import type { TeamProfile } from "@/lib/types";
import type { BsdEvent } from "@/lib/bsd";

const BSD_BASE_URL = (process.env.BSD_API_BASE_URL || "https://sports.bzzoiro.com/api/v2").replace(/\/$/, "");
const HISTORY_MATCHES = Math.max(5, Number(process.env.BSD_HISTORY_MATCHES || 10));
const LOOKBACK_DAYS = Math.max(30, Number(process.env.BSD_LOOKBACK_DAYS || 180));
const FINISHED_STATES = new Set(["finished", "ft", "aet", "after_extra_time", "after_penalties"]);

type HistorySample = {
  venue: "home" | "away";
  gf: number;
  ga: number;
  xgFor?: number;
  bigChancesFor?: number;
};

function token(): string {
  const value = process.env.BSD_API_TOKEN;
  if (!value) throw new Error("BSD_API_TOKEN is not configured");
  return value;
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
  if (!response.ok) throw new Error(`BSD ${path} returned ${response.status}`);
  return response.json();
}

async function bsdGetAll(path: string, params: Record<string, string | number | undefined> = {}): Promise<Record<string, unknown>[]> {
  const items: Record<string, unknown>[] = [];
  let offset = 0;
  const limit = 200;
  for (;;) {
    const payload = await bsdGet(path, { ...params, limit, offset });
    if (Array.isArray(payload)) {
      return payload.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
    }
    if (!payload || typeof payload !== "object") throw new Error(`BSD ${path} returned an invalid envelope`);
    const envelope = payload as Record<string, unknown>;
    const batch = [envelope.results, envelope.events, envelope.data].find(Array.isArray) as unknown[] | undefined;
    if (!batch) throw new Error(`BSD ${path} returned no results array`);
    items.push(...batch.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")));
    const count = numberValue(envelope.count);
    offset += limit;
    if (!envelope.next || batch.length < limit || (count !== undefined && offset >= count)) break;
  }
  return items;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function fieldValue(source: unknown, ...names: string[]): number | undefined {
  if (!source || typeof source !== "object" || Array.isArray(source)) return undefined;
  const normalized = Object.fromEntries(
    Object.entries(source as Record<string, unknown>).map(([key, value]) => [key.toLowerCase().replaceAll("-", "_"), value])
  );
  for (const name of names) {
    const value = numberValue(normalized[name.toLowerCase().replaceAll("-", "_")]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function teamId(item: Record<string, unknown>, side: "home" | "away"): number | undefined {
  const direct = numberValue(item[`${side}_team_id`]);
  if (direct !== undefined) return direct;
  const nested = item[`${side}_team`];
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return numberValue((nested as Record<string, unknown>).id);
  }
  return undefined;
}

function sideScore(item: Record<string, unknown>, side: "home" | "away"): number | undefined {
  for (const key of [`${side}_score`, `${side}_goals`, `score_${side}`]) {
    const value = numberValue(item[key]);
    if (value !== undefined) return value;
  }
  const score = item.score;
  if (score && typeof score === "object" && !Array.isArray(score)) {
    return numberValue((score as Record<string, unknown>)[side]);
  }
  return undefined;
}

function extractTeamStats(payload: unknown, side: "home" | "away", expectedTeamId?: number): { xg?: number; big?: number } {
  const xgNames = ["xg", "expected_goals", "expected_goals_for"];
  const bigNames = ["big_chances", "big_chances_created", "big_chances_for"];

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const object = payload as Record<string, unknown>;
    const directXg = fieldValue(object, `${side}_xg`, `${side}_expected_goals`);
    const directBig = fieldValue(object, `${side}_big_chances`, `${side}_big_chances_created`);
    if (directXg !== undefined || directBig !== undefined) return { xg: directXg, big: directBig };

    const sideBlock = object[side];
    if (sideBlock && typeof sideBlock === "object" && !Array.isArray(sideBlock)) {
      const xg = fieldValue(sideBlock, ...xgNames);
      const big = fieldValue(sideBlock, ...bigNames);
      if (xg !== undefined || big !== undefined) return { xg, big };
    }

    for (const envelope of ["results", "stats", "statistics", "data", "teams"]) {
      if (object[envelope] !== undefined) {
        const nested = extractTeamStats(object[envelope], side, expectedTeamId);
        if (nested.xg !== undefined || nested.big !== undefined) return nested;
      }
    }
  }

  if (Array.isArray(payload)) {
    for (const row of payload) {
      if (!row || typeof row !== "object" || Array.isArray(row)) continue;
      const item = row as Record<string, unknown>;
      const rowTeamId = numberValue(item.team_id ?? item.participant_id);
      const rowSide = String(item.side ?? item.location ?? item.home_away ?? "").toLowerCase();
      if (expectedTeamId !== undefined && rowTeamId !== undefined && rowTeamId !== expectedTeamId) continue;
      if (rowSide && rowSide !== side && rowSide !== side[0]) continue;

      let xg = fieldValue(item, ...xgNames);
      let big = fieldValue(item, ...bigNames);
      const name = String(item.name ?? item.type ?? item.stat ?? "").toLowerCase();
      const value = numberValue(item.value ?? item.stat_value);
      if (value !== undefined) {
        if (xg === undefined && ["xg", "expected goals", "expected_goals"].includes(name)) xg = value;
        if (big === undefined && ["big chances", "big_chances", "big chances created", "big_chances_created"].includes(name)) big = value;
      }
      if (xg !== undefined || big !== undefined) return { xg, big };
    }
  }

  return {};
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

async function fetchHistory(team: number, kickoff: Date): Promise<HistorySample[]> {
  const end = new Date(kickoff.getTime() - 86_400_000);
  const start = new Date(end.getTime() - LOOKBACK_DAYS * 86_400_000);
  const rows = await bsdGetAll("events/", {
    team_id: team,
    status: "finished",
    date_from: dateOnly(start),
    date_to: dateOnly(end)
  });
  rows.sort((a, b) => String(b.event_date || "").localeCompare(String(a.event_date || "")));

  const samples: HistorySample[] = [];
  for (const row of rows) {
    const status = String(row.status || "").trim().toLowerCase();
    if (!FINISHED_STATES.has(status)) continue;
    const eventId = numberValue(row.id);
    const homeId = teamId(row, "home");
    const awayId = teamId(row, "away");
    if (eventId === undefined || (team !== homeId && team !== awayId)) continue;
    const eventDate = typeof row.event_date === "string" ? new Date(row.event_date) : undefined;
    if (!eventDate || Number.isNaN(eventDate.getTime()) || eventDate >= kickoff) continue;

    const venue: "home" | "away" = team === homeId ? "home" : "away";
    const opponentVenue: "home" | "away" = venue === "home" ? "away" : "home";
    const gf = sideScore(row, venue);
    const ga = sideScore(row, opponentVenue);
    if (gf === undefined || ga === undefined) continue;

    let teamXg = fieldValue(row, `${venue}_xg`, `${venue}_expected_goals`);
    let opponentXg = fieldValue(row, `${opponentVenue}_xg`, `${opponentVenue}_expected_goals`);
    let teamBig = fieldValue(row, `${venue}_big_chances`);

    if (teamXg === undefined || opponentXg === undefined) {
      const stats = await bsdGet(`events/${eventId}/stats/`).catch(() => undefined);
      if (stats !== undefined) {
        const teamStats = extractTeamStats(stats, venue, team);
        const opponentId = venue === "home" ? awayId : homeId;
        const opponentStats = extractTeamStats(stats, opponentVenue, opponentId);
        teamXg = teamXg ?? teamStats.xg;
        opponentXg = opponentXg ?? opponentStats.xg;
        teamBig = teamBig ?? teamStats.big;
      }
    }

    samples.push({ venue, gf, ga, xgFor: teamXg, bigChancesFor: teamBig });
    if (samples.length >= HISTORY_MATCHES) break;
  }
  return samples;
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

export async function fetchCanonicalBsdProfiles(event: BsdEvent): Promise<{ home: TeamProfile; away: TeamProfile } | undefined> {
  const raw = event as unknown as Record<string, unknown>;
  const homeId = teamId(raw, "home");
  const awayId = teamId(raw, "away");
  if (homeId === undefined || awayId === undefined) return undefined;
  const kickoff = new Date(event.event_date);
  const [homeHistory, awayHistory] = await Promise.all([
    fetchHistory(homeId, kickoff),
    fetchHistory(awayId, kickoff)
  ]);
  const home = profileFromHistory(homeHistory, "home");
  const away = profileFromHistory(awayHistory, "away");
  return home && away ? { home, away } : undefined;
}
