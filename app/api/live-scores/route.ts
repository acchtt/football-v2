import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BSD_BASE_URL = (process.env.BSD_API_BASE_URL || "https://sports.bzzoiro.com/api/v2").replace(/\/$/, "");

type AnyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function rows(payload: unknown): AnyRecord[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];
  const candidate = [payload.results, payload.events, payload.live, payload.matches, payload.data].find(Array.isArray) as unknown[] | undefined;
  return candidate ? candidate.filter(isRecord) : [payload];
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function textValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function teamName(value: unknown, fallback?: unknown): string {
  const flat = textValue(fallback);
  if (flat) return flat;
  const direct = textValue(value);
  if (direct) return direct;
  if (isRecord(value)) return textValue(value.name ?? value.short_name) || "";
  return "";
}

function parseLive(row: AnyRecord) {
  const score = isRecord(row.score) ? row.score : undefined;
  const time = isRecord(row.time) ? row.time : undefined;
  const event = isRecord(row.event) ? row.event : undefined;

  const id = numberValue(row.id ?? row.event_id ?? event?.id ?? event?.event_id);
  const home = teamName(row.home_team ?? row.home ?? event?.home_team ?? event?.home, row.home_team_name ?? row.home_name ?? event?.home_team_name);
  const away = teamName(row.away_team ?? row.away ?? event?.away_team ?? event?.away, row.away_team_name ?? row.away_name ?? event?.away_team_name);
  const homeScore = numberValue(row.home_score ?? score?.home ?? score?.home_score);
  const awayScore = numberValue(row.away_score ?? score?.away ?? score?.away_score);
  const minute = numberValue(row.current_minute ?? row.minute ?? time?.minute ?? time?.current_minute);
  const period = textValue(row.period ?? row.current_period ?? row.match_period ?? time?.period ?? time?.display);
  const status = (textValue(row.status ?? time?.status) || "live").toLowerCase();

  if (!home || !away) return undefined;

  return {
    id,
    home,
    away,
    homeScore,
    awayScore,
    minute,
    period,
    status
  };
}

async function fetchJson(path: string, token: string) {
  const response = await fetch(`${BSD_BASE_URL}${path}`, {
    headers: { Authorization: `Token ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000)
  });

  const bodyText = await response.text();
  let payload: unknown = null;
  try {
    payload = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    payload = null;
  }

  return {
    ok: response.ok,
    status: response.status,
    payload,
    error: response.ok ? undefined : bodyText.slice(0, 300)
  };
}

export async function GET() {
  const token = process.env.BSD_API_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, error: "BSD_API_TOKEN is not configured" }, { status: 503 });
  }

  const [listResult, compactResult] = await Promise.all([
    fetchJson("/events/?status=live&limit=200", token),
    fetchJson("/events/live/", token)
  ]);

  const merged = new Map<string, ReturnType<typeof parseLive>>();

  for (const source of [listResult, compactResult]) {
    if (!source.ok) continue;
    for (const row of rows(source.payload)) {
      const parsed = parseLive(row);
      if (!parsed) continue;
      const key = parsed.id !== undefined ? `id:${parsed.id}` : `${parsed.home.toLowerCase()}|${parsed.away.toLowerCase()}`;
      const previous = merged.get(key);
      merged.set(key, previous ? { ...previous, ...parsed } : parsed);
    }
  }

  const events = [...merged.values()].filter((event): event is NonNullable<typeof event> => Boolean(event));

  return NextResponse.json({
    ok: listResult.ok || compactResult.ok,
    count: events.length,
    sources: {
      statusLive: { ok: listResult.ok, status: listResult.status, rows: listResult.ok ? rows(listResult.payload).length : 0, error: listResult.error },
      compactLive: { ok: compactResult.ok, status: compactResult.status, rows: compactResult.ok ? rows(compactResult.payload).length : 0, error: compactResult.error }
    },
    events,
    generatedAt: new Date().toISOString()
  }, {
    headers: { "Cache-Control": "no-store, max-age=0" }
  });
}
