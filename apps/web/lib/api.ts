import type { DailyBoard, MatchDetail } from "./types";

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:8000";

export async function getDailyBoard(date?: string): Promise<DailyBoard> {
  const query = date ? `?date=${encodeURIComponent(date)}` : "";
  const response = await fetch(`${apiBaseUrl}/api/v1/board${query}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Board API returned ${response.status}`);
  }

  return (await response.json()) as DailyBoard;
}

export async function getMatchDetail(fixtureId: string): Promise<MatchDetail> {
  const response = await fetch(`${apiBaseUrl}/api/v1/matches/${fixtureId}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Match API returned ${response.status}`);
  }
  return (await response.json()) as MatchDetail;
}
