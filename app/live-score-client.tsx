"use client";

import { useEffect } from "react";

type LiveEvent = {
  id?: number;
  home: string;
  away: string;
  homeScore?: number;
  awayScore?: number;
  minute?: number;
  period?: string;
  status?: string;
};

type Payload = {
  ok?: boolean;
  count?: number;
  events?: LiveEvent[];
  sources?: Record<string, { ok?: boolean; status?: number; rows?: number; error?: string }>;
};

function normalize(value = "") {
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
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return 0;
  if (left === right) return 6;
  if (left.includes(right) || right.includes(left)) return 4;
  const aa = new Set(left.split(" "));
  const bb = new Set(right.split(" "));
  let shared = 0;
  for (const token of aa) if (bb.has(token)) shared += 1;
  const overlap = shared / Math.max(aa.size, bb.size);
  if (overlap >= 0.75) return 4;
  if (overlap >= 0.5) return 3;
  return 0;
}

function findMatch(home: string, away: string, events: LiveEvent[]) {
  return events
    .map((event) => ({ event, score: nameScore(home, event.home) + nameScore(away, event.away) }))
    .filter((entry) => entry.score >= 6)
    .sort((a, b) => b.score - a.score)[0]?.event;
}

function applyLiveScores(events: LiveEvent[]) {
  const cards = document.querySelectorAll<HTMLElement>("details.fixtureCard, details.pickCard");

  cards.forEach((card) => {
    const names = card.querySelectorAll<HTMLElement>(".teamStack .teamRow strong");
    if (names.length < 2) return;

    const home = names[0]?.textContent?.trim() || "";
    const away = names[1]?.textContent?.trim() || "";
    const live = findMatch(home, away, events);
    if (!live || live.homeScore === undefined || live.awayScore === undefined) return;

    const scoreBlock = card.querySelector<HTMLElement>(".scoreBlock");
    if (!scoreBlock || scoreBlock.classList.contains("manual")) return;

    const label = scoreBlock.querySelector<HTMLElement>("span");
    const score = scoreBlock.querySelector<HTMLElement>("strong");
    if (!label || !score) return;

    const liveLabel = live.minute !== undefined
      ? `${live.minute}′`
      : live.period?.trim()
        ? live.period.toUpperCase()
        : "LIVE";

    label.textContent = liveLabel;
    score.textContent = `${live.homeScore}–${live.awayScore}`;
    scoreBlock.classList.remove("pending", "final");
    scoreBlock.classList.add("live");
    card.dataset.live = "true";
  });
}

function updateSyncBadge(payload: Payload, error?: string) {
  const badges = document.querySelectorAll<HTMLElement>(".syncState");
  badges.forEach((badge) => {
    if (!badge.textContent?.toLowerCase().includes("bsd")) return;
    if (error) {
      badge.textContent = "BSD live error";
      badge.classList.remove("on");
      badge.classList.add("off");
      badge.title = error;
      return;
    }

    badge.textContent = `BSD live ${payload.count ?? 0}`;
    badge.classList.remove("off");
    badge.classList.add("on");
    badge.title = Object.entries(payload.sources || {})
      .map(([name, info]) => `${name}: HTTP ${info.status ?? "?"}, rows ${info.rows ?? 0}${info.error ? `, ${info.error}` : ""}`)
      .join(" | ");
  });
}

export default function LiveScoreClient() {
  useEffect(() => {
    let stopped = false;

    const poll = async () => {
      try {
        const response = await fetch(`/api/live-scores?t=${Date.now()}`, { cache: "no-store" });
        const payload = await response.json() as Payload;
        if (stopped) return;

        if (!response.ok || !payload.ok) {
          updateSyncBadge(payload, `HTTP ${response.status}`);
          return;
        }

        const events = Array.isArray(payload.events) ? payload.events : [];
        applyLiveScores(events);
        updateSyncBadge(payload);
      } catch (error) {
        if (!stopped) updateSyncBadge({}, error instanceof Error ? error.message : "Live score request failed");
      }
    };

    poll();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") poll();
    }, 15000);

    const onVisible = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
