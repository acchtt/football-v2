"use client";

import { useEffect } from "react";

type LocalPick = {
  pickId: string;
  slug: string;
  line: number;
  odds: number;
  reason: string;
  recordedAt: string;
  synced: boolean;
};

const STORAGE_KEY = "football-v2-picks";

function readLocal(): LocalPick[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocal(pick: LocalPick) {
  const current = readLocal();
  const next = [pick, ...current.filter((item) => item.pickId !== pick.pickId)].slice(0, 250);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("football-picks-updated"));
}

export default function PickAutoRecorder() {
  useEffect(() => {
    if (!window.location.pathname.startsWith("/match/")) return;
    let inFlight = "";

    const scan = async () => {
      const panel = document.querySelector<HTMLElement>(".verdict-panel.lock");
      if (!panel) return;
      const verdictText = panel.querySelector("strong")?.textContent || "";
      const oddsText = panel.querySelector("b")?.textContent || "";
      const lineMatch = verdictText.match(/O(\d+(?:\.\d+)?)/i);
      const oddsMatch = oddsText.match(/(\d+(?:\.\d+)?)/);
      if (!lineMatch || !oddsMatch) return;

      const slug = decodeURIComponent(window.location.pathname.split("/").filter(Boolean).pop() || "");
      const line = Number(lineMatch[1]);
      const odds = Number(oddsMatch[1]);
      if (!slug || !Number.isFinite(line) || !Number.isFinite(odds)) return;

      const pickId = `${slug}|O${line}|${odds.toFixed(2)}`;
      const existing = readLocal().find((item) => item.pickId === pickId);
      if (existing?.synced || inFlight === pickId) return;
      inFlight = pickId;

      const localPick: LocalPick = {
        pickId,
        slug,
        line,
        odds,
        reason: panel.querySelector("p")?.textContent || "Website LOCK",
        recordedAt: existing?.recordedAt || new Date().toISOString(),
        synced: false
      };
      saveLocal(localPick);

      try {
        const response = await fetch("/api/picks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, line, odds, reason: localPick.reason })
        });
        if (response.ok) saveLocal({ ...localPick, synced: true });
      } finally {
        inFlight = "";
      }
    };

    const observer = new MutationObserver(() => { void scan(); });
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["class"] });
    void scan();
    return () => observer.disconnect();
  }, []);

  return null;
}
