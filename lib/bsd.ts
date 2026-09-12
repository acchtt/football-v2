const BSD_BASE_URL = (process.env.BSD_API_BASE_URL || "https://sports.bzzoiro.com/api/v2").replace(/\/$/, "");

type FixtureRef = {
  match: string;
  kickoff: string;
};

type RawEvent = {
  id: number;
  eventDate: string;
  home: string;
  away: string;
  status: string;
  homeScore?: number;
  awayScore?: number;
  period?: string;
  currentMinute?: number;
};

export type BsdFixture = {
  eventId: number;
  homeTeam: string;
  awayTeam: string;
  kickoff: string;
  status: string;
  home?: number;
  away?: number;
  period?: string;
  currentMinute?: number;
};

export type BsdFinalScore = {
  eventId: number;
  home: number;
  away: number;
  homeTeam: string;
  awayTeam: string;
  kickoff: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function numeric(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function text(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
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

function payloadRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];
  const batch = [payload.results, payload.events, payload.data].find(Array.isArray) as unknown[] | undefined;
  return batch ? batch.filter(isRecord) : [payload];
}

export function isBsdConfigured() {
  return Boolean(process.env.BSD_API_TOKEN);
}

export function splitFixtureName(match = ""): { home: string; away: string } | undefined {
  const separators = [/\s+vs\.?\s+/i, /\s+v\.?\s+/i, /\s+—\s+/, /\s+–\s+/];
  for (const separator of separators) {
    const parts = match.split(separator).map((part) => part.trim()).filter(Boolean);
    if (parts.length === 2) return { home: parts[0], away: parts[1] };
  }
  return undefined;
}

function normalizeTeam(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(fc|cf|afc|sc|ac|sk|fk|club)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameScore(a: string, b: string) {
  const left = normalizeTeam(a);
  const right = normalizeTeam(b);
  if (!left || !right) return 0;
  if (left === right) return 6;
  if (left.includes(right) || right.includes(left)) return 4;

  const aTokens = new Set(left.split(" "));
  const bTokens = new Set(right.split(" "));
  let shared = 0;
  for (const token of aTokens) if (bTokens.has(token)) shared += 1;
  const overlap = shared / Math.max(aTokens.size, bTokens.size);
  if (overlap >= 0.75) return 4;
  if (overlap >= 0.5) return 3;
  return 0;
}

function lookupKey(match: string, kickoff: string) {
  return `${match}\u0000${kickoff}`;
}

function utcDay(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toISOString().slice(0, 10);
}

function addDays(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return utcDay(date);
}

async function bsdFetch(path: string) {
  const token = process.env.BSD_API_TOKEN;
  if (!token) return [] as Record<string, unknown>[];
  const response = await fetch(`${BSD_BASE_URL}${path}`, {
    headers: { Authorization: `Token ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`BSD ${path} returned ${response.status}`);
  return payloadRows(await response.json());
}

async function bsdGetAll(dateFrom: string, dateTo: string): Promise<Record<string, unknown>[]> {
  const token = process.env.BSD_API_TOKEN;
  if (!token) return [];

  const results: Record<string, unknown>[] = [];
  let offset = 0;
  const limit = 200;

  for (;;) {
    const url = new URL(`${BSD_BASE_URL}/events/`);
    url.searchParams.set("date_from", dateFrom);
    url.searchParams.set("date_to", dateTo);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));

    const response = await fetch(url, {
      headers: { Authorization: `Token ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000)
    });

    if (!response.ok) throw new Error(`BSD events returned ${response.status}`);
    const payload: unknown = await response.json();
    const batch = payloadRows(payload);
    results.push(...batch);

    if (!isRecord(payload) || !payload.next || batch.length < limit) break;
    offset += limit;
  }

  return results;
}

function parseEvent(row: Record<string, unknown>, defaultStatus = ""): RawEvent | undefined {
  const id = numeric(row.id ?? row.event_id);
  const eventDate = text(row.event_date ?? row.date ?? row.kickoff) || "";
  const home = teamName(row.home_team ?? row.home, row.home_team_name ?? row.home_name);
  const away = teamName(row.away_team ?? row.away, row.away_team_name ?? row.away_name);
  if (id === undefined || !eventDate || !home || !away) return undefined;

  return {
    id,
    eventDate,
    home,
    away,
    status: String(row.status || defaultStatus).toLowerCase(),
    homeScore: numeric(row.home_score),
    awayScore: numeric(row.away_score),
    period: text(row.period ?? row.current_period ?? row.match_period),
    currentMinute: numeric(row.current_minute ?? row.minute)
  };
}

function eventMatchScore(target: FixtureRef, event: RawEvent) {
  const teams = splitFixtureName(target.match);
  if (!teams) return -1;

  const home = nameScore(teams.home, event.home);
  const away = nameScore(teams.away, event.away);
  if (home < 3 || away < 3) return -1;

  const targetTime = new Date(target.kickoff).getTime();
  const eventTime = new Date(event.eventDate).getTime();
  if (!Number.isFinite(targetTime) || !Number.isFinite(eventTime)) return -1;

  const hours = Math.abs(targetTime - eventTime) / 3_600_000;
  if (hours > 12) return -1;

  const timeScore = hours <= 1 ? 4 : hours <= 3 ? 3 : hours <= 6 ? 2 : 1;
  return home + away + timeScore;
}

async function fetchEventWindow(fixtures: FixtureRef[]) {
  if (!fixtures.length || !isBsdConfigured()) return [] as RawEvent[];

  const times = fixtures
    .map((fixture) => new Date(fixture.kickoff).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!times.length) return [] as RawEvent[];

  const start = addDays(utcDay(new Date(times[0])), -1);
  const end = addDays(utcDay(new Date(times[times.length - 1])), 1);
  const rows: Record<string, unknown>[] = [];
  let cursor = start;

  while (cursor <= end) {
    const chunkEnd = [addDays(cursor, 13), end].sort()[0];
    rows.push(...await bsdGetAll(cursor, chunkEnd));
    cursor = addDays(chunkEnd, 1);
  }

  return rows.flatMap((row) => {
    const event = parseEvent(row);
    return event ? [event] : [];
  });
}

async function fetchLiveEvents() {
  if (!isBsdConfigured()) return [] as RawEvent[];
  try {
    const rows = await bsdFetch("/events/live/");
    return rows.flatMap((row) => {
      const event = parseEvent(row, "live");
      return event ? [event] : [];
    });
  } catch (error) {
    console.error("BSD live score sync failed", error);
    return [] as RawEvent[];
  }
}

export async function fetchBsdFixtures(fixtures: FixtureRef[]) {
  const output = new Map<string, BsdFixture>();
  if (!fixtures.length || !isBsdConfigured()) return output;

  let events: RawEvent[] = [];
  try {
    const [windowEvents, liveEvents] = await Promise.all([
      fetchEventWindow(fixtures),
      fetchLiveEvents()
    ]);
    const byId = new Map<number, RawEvent>();
    for (const event of windowEvents) byId.set(event.id, event);
    for (const event of liveEvents) byId.set(event.id, event);
    events = [...byId.values()];
  } catch (error) {
    console.error("BSD fixture sync failed", error);
    return output;
  }

  for (const fixture of fixtures) {
    const ranked = events
      .map((event) => ({ event, score: eventMatchScore(fixture, event) }))
      .filter((entry) => entry.score >= 10)
      .sort((a, b) => b.score - a.score);

    const best = ranked[0]?.event;
    if (!best) continue;

    output.set(lookupKey(fixture.match, fixture.kickoff), {
      eventId: best.id,
      homeTeam: best.home,
      awayTeam: best.away,
      kickoff: best.eventDate,
      status: best.status,
      home: best.homeScore,
      away: best.awayScore,
      period: best.period,
      currentMinute: best.currentMinute
    });
  }

  return output;
}

export function getBsdFixture(fixtures: Map<string, BsdFixture>, match: string, kickoff: string) {
  return fixtures.get(lookupKey(match, kickoff));
}

export async function fetchBsdFinalScores(fixtures: FixtureRef[]) {
  const resolved = await fetchBsdFixtures(fixtures);
  const output = new Map<string, BsdFinalScore>();

  for (const fixture of fixtures) {
    const event = getBsdFixture(resolved, fixture.match, fixture.kickoff);
    if (!event || event.status !== "finished" || event.home === undefined || event.away === undefined) continue;

    output.set(lookupKey(fixture.match, fixture.kickoff), {
      eventId: event.eventId,
      home: event.home,
      away: event.away,
      homeTeam: event.homeTeam,
      awayTeam: event.awayTeam,
      kickoff: event.kickoff
    });
  }

  return output;
}

export function getBsdScore(scores: Map<string, BsdFinalScore>, match: string, kickoff: string) {
  return scores.get(lookupKey(match, kickoff));
}
