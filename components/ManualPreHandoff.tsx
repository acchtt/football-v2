"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Candidate = {
  id: string;
  home: string;
  away: string;
  competition: string;
  kickoff: string;
};

type ShortlistItem = {
  id: string;
  status: "TOP FOCUS" | "STRONG FOCUS" | "SECONDARY";
  structural_family: string;
  carrier: string;
  secondary_route: string;
  failure_mode_resistance: string;
  reason: string;
};

function extractJson(input: string): unknown {
  const trimmed = input.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first < 0 || last < first) throw new Error("No JSON object found");
  return JSON.parse(trimmed.slice(first, last + 1));
}

function parseShortlist(input: string, validIds: Set<string>): ShortlistItem[] {
  const parsed = extractJson(input);
  if (!parsed || typeof parsed !== "object") throw new Error("Invalid response");
  const raw = (parsed as { shortlist?: unknown }).shortlist;
  if (!Array.isArray(raw)) throw new Error("Response must contain a shortlist array");

  const allowed = new Set(["TOP FOCUS", "STRONG FOCUS", "SECONDARY"]);
  const seen = new Set<string>();
  const result: ShortlistItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const id = String(item.id || "");
    const status = String(item.status || "") as ShortlistItem["status"];
    if (!validIds.has(id) || !allowed.has(status) || seen.has(id)) continue;
    seen.add(id);
    result.push({
      id,
      status,
      structural_family: String(item.structural_family || "Structural candidate"),
      carrier: String(item.carrier || "Unresolved"),
      secondary_route: String(item.secondary_route || "Unresolved"),
      failure_mode_resistance: String(item.failure_mode_resistance || "Unresolved"),
      reason: String(item.reason || "Current-model PRE selection")
    });
  }
  return result;
}

export function ManualPreHandoff({ packet, candidates }: { packet: string; candidates: Candidate[] }) {
  const [copied, setCopied] = useState(false);
  const [response, setResponse] = useState("");
  const [shortlist, setShortlist] = useState<ShortlistItem[]>([]);
  const [error, setError] = useState("");
  const byId = useMemo(() => new Map(candidates.map((item) => [item.id, item])), [candidates]);
  const validIds = useMemo(() => new Set(candidates.map((item) => item.id)), [candidates]);

  async function copyPacket() {
    await navigator.clipboard.writeText(packet);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function loadResult() {
    try {
      const parsed = parseShortlist(response, validIds);
      setShortlist(parsed);
      setError("");
    } catch (err) {
      setShortlist([]);
      setError(err instanceof Error ? err.message : "Could not parse ChatGPT result");
    }
  }

  return (
    <>
      <section className="card handoff-card">
        <span className="kicker">No API · manual ChatGPT handoff</span>
        <h3>1. Copy the PRE analysis packet</h3>
        <p className="reason">Paste it into this Football v1.0 ChatGPT project. ChatGPT returns a selective JSON shortlist. The retrieval candidates below are evidence only and never become picks by themselves.</p>
        <div className="verification-actions">
          <button type="button" className="verify-button" onClick={copyPacket}>{copied ? "Copied" : "Copy analysis packet"}</button>
        </div>
        <details className="packet-details">
          <summary>Preview packet</summary>
          <textarea className="handoff-textarea" readOnly value={packet} />
        </details>
      </section>

      <section className="card handoff-card">
        <span className="kicker">Return path</span>
        <h3>2. Paste ChatGPT&apos;s JSON result</h3>
        <textarea
          className="handoff-textarea result-input"
          value={response}
          onChange={(event) => setResponse(event.target.value)}
          placeholder='{"shortlist":[...]}'
        />
        <div className="verification-actions">
          <button type="button" className="verify-button" disabled={!response.trim()} onClick={loadResult}>Load shortlist</button>
        </div>
        {error && <div className="notice">{error}</div>}
      </section>

      {shortlist.length > 0 && (
        <section className="board manual-shortlist">
          {shortlist.map((item, index) => {
            const match = byId.get(item.id);
            if (!match) return null;
            return (
              <Link href={`/match/${item.id}`} className="match-card" key={item.id}>
                <div className="rank">{String(index + 1).padStart(2, "0")}</div>
                <div>
                  <span className="focus">{item.status}</span>
                  <div className="match-name">{match.home} — {match.away}</div>
                  <div className="match-meta">{match.competition}</div>
                </div>
                <div>
                  <div className="match-name">{item.structural_family}</div>
                  <div className="evidence">{item.reason}</div>
                </div>
                <div className="score-box"><strong>PRE</strong><span>CHATGPT</span></div>
              </Link>
            );
          })}
        </section>
      )}

      {shortlist.length === 0 && response.trim() && !error && (
        <div className="notice">ChatGPT returned no PRE matches worth opening for this date.</div>
      )}
    </>
  );
}
