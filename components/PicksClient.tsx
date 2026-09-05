"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./PicksClient.module.css";

type Pick = {
  pickId: string;
  slug: string;
  match: string;
  competition: string;
  kickoff: string;
  modelVersion: string;
  verdict: "LOCK";
  line: number;
  odds: number;
  stake: number;
  result: string;
  pl: number;
  recordedAt: string;
  reason: string;
  synced: boolean;
};

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

function time(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

export default function PicksClient() {
  const [remote, setRemote] = useState<Pick[]>([]);
  const [local, setLocal] = useState<LocalPick[]>([]);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [source, setSource] = useState("loading");
  const [warning, setWarning] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLocal(readLocal());
    try {
      const response = await fetch("/api/picks", { cache: "no-store" });
      const payload = await response.json();
      setRemote(Array.isArray(payload.picks) ? payload.picks : []);
      setConfigured(Boolean(payload.configured));
      setSource(String(payload.source || "airtable"));
      setWarning(String(payload.warning || ""));
    } catch {
      setWarning("Remote pick ledger could not be loaded. Showing browser-local picks only.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const update = () => void load();
    window.addEventListener("football-picks-updated", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("football-picks-updated", update);
      window.removeEventListener("storage", update);
    };
  }, [load]);

  const picks = useMemo(() => {
    const byId = new Map<string, Pick>();
    for (const pick of remote) byId.set(pick.pickId, pick);
    for (const item of local) {
      if (byId.has(item.pickId)) continue;
      byId.set(item.pickId, {
        ...item,
        match: item.slug.replace(/-2026-\d{2}-\d{2}$/, "").replaceAll("-", " "),
        competition: "",
        kickoff: "",
        modelVersion: "Football v0.2.47",
        verdict: "LOCK",
        stake: 1,
        result: "PENDING",
        pl: 0
      });
    }
    return [...byId.values()].sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
  }, [remote, local]);

  const settled = picks.filter((pick) => pick.result !== "PENDING").length;
  const pending = picks.length - settled;
  const pl = picks.reduce((sum, pick) => sum + (Number.isFinite(pick.pl) ? pick.pl : 0), 0);

  return (
    <>
      <section className={styles.stats}>
        <div><span>Total picks</span><strong>{picks.length}</strong></div>
        <div><span>Pending</span><strong>{pending}</strong></div>
        <div><span>Settled</span><strong>{settled}</strong></div>
        <div><span>P/L</span><strong>{pl >= 0 ? "+" : ""}{pl.toFixed(3)}u</strong></div>
      </section>

      <div className={styles.syncBar}>
        <div>
          <span className="eyebrow">Sync status</span>
          <strong>{configured ? "Airtable connected" : "Browser fallback active"}</strong>
          <small>{source === "airtable" ? "Reading from Website Picks in Airtable." : "Airtable runtime access is unavailable on this deployment."}</small>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh picks"}</button>
      </div>
      {warning && <p className={styles.warning}>{warning}</p>}

      <section className={styles.list}>
        <div className={styles.headerRow}>
          <span>Recorded</span><span>Match</span><span>Pick</span><span>Result</span><span>P/L</span><span>Sync</span>
        </div>
        {picks.map((pick) => (
          <Link className={styles.row} href={`/match/${pick.slug}`} key={pick.pickId}>
            <span className={styles.time}>{time(pick.recordedAt)} ICT</span>
            <span className={styles.match}><strong>{pick.match}</strong><small>{pick.competition || pick.modelVersion}</small></span>
            <span className={styles.selection}><strong>O{pick.line}</strong><small>@ {pick.odds.toFixed(2)} · {pick.stake.toFixed(2)}u</small></span>
            <span><b className={`${styles.result} ${pick.result === "WIN" || pick.result === "HALF WIN" ? styles.win : pick.result === "LOSS" || pick.result === "HALF LOSS" ? styles.loss : ""}`}>{pick.result}</b></span>
            <span className={styles.pl}>{pick.pl >= 0 ? "+" : ""}{pick.pl.toFixed(3)}u</span>
            <span><b className={pick.synced ? styles.synced : styles.local}>{pick.synced ? "AIRTABLE" : "LOCAL"}</b></span>
          </Link>
        ))}
        {!loading && !picks.length && <div className={styles.empty}>No official LOCK has been recorded yet.</div>}
      </section>
    </>
  );
}
