"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import type {
  LineupExtraction,
  MarketStatus,
  MatchDetail,
  OddsExtraction,
} from "@/lib/types";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

function lines(values: string[]): string {
  return values.join("\n");
}

function list(value: string): string[] {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

async function responseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: string };
    return body.detail ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

function SignalField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="signal-field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export function MatchWorkbench({ detail }: { detail: MatchDetail }) {
  const router = useRouter();
  const fixtureId = detail.fixture.id;
  const [lineupFiles, setLineupFiles] = useState<File[]>([]);
  const [oddsFiles, setOddsFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [marketStatus, setMarketStatus] = useState<MarketStatus | null>(null);
  const [oddsDirty, setOddsDirty] = useState(false);

  const initialLineup = detail.latest_lineup?.extraction;
  const initialOdds = detail.latest_odds?.extraction;
  const [lineup, setLineup] = useState<LineupExtraction | null>(initialLineup ?? null);
  const [odds, setOdds] = useState<OddsExtraction | null>(initialOdds ?? null);
  const [oddsRows, setOddsRows] = useState(
    initialOdds?.totals.map((item) => `${item.line}, ${item.over_odds}, ${item.under_odds}`).join("\n") ?? "",
  );
  const locked = Boolean(detail.official_bet);

  const latestDecision = detail.decision_history.at(-1);
  const visibleVerdict =
    (detail.official_bet ? "OFFICIAL LOCK" : undefined) ?? latestDecision?.verdict;

  const providerMode = useMemo(() => {
    const providers = [detail.latest_lineup?.vision_provider, detail.latest_odds?.vision_provider];
    return providers.includes("demo") ? "DEMO EXTRACTION" : "VISION EXTRACTION";
  }, [detail.latest_lineup?.vision_provider, detail.latest_odds?.vision_provider]);

  useEffect(() => {
    setLineup(detail.latest_lineup?.extraction ?? null);
  }, [detail.latest_lineup?.id]);

  useEffect(() => {
    const nextOdds = detail.latest_odds?.extraction ?? null;
    setOdds(nextOdds);
    setOddsRows(
      nextOdds?.totals
        .map((item) => `${item.line}, ${item.over_odds}, ${item.under_odds}`)
        .join("\n") ?? "",
    );
    setOddsDirty(false);
  }, [detail.latest_odds?.id]);

  useEffect(() => {
    let cancelled = false;
    async function loadMarketStatus() {
      const response = await fetch(`${apiBaseUrl}/api/v1/matches/${fixtureId}/market`, {
        cache: "no-store",
      });
      if (!response.ok || cancelled) return;
      const status = (await response.json()) as MarketStatus;
      if (!cancelled) setMarketStatus(status);
    }
    void loadMarketStatus();
    return () => {
      cancelled = true;
    };
  }, [fixtureId, detail.latest_lineup?.id, detail.latest_odds?.id]);

  async function upload(kind: "lineup" | "odds", files: File[]) {
    if (!files.length) {
      setMessage(`Select at least one ${kind} screenshot.`);
      return;
    }
    setBusy(kind);
    setMessage(null);
    const body = new FormData();
    files.forEach((file) => body.append("files", file));
    const response = await fetch(`${apiBaseUrl}/api/v1/matches/${fixtureId}/${kind}`, {
      method: "POST",
      body,
    });
    if (!response.ok) {
      setMessage(await responseError(response));
      setBusy(null);
      return;
    }
    setMessage(`${kind === "lineup" ? "Lineup" : "Odds"} extracted. Review it below.`);
    if (kind === "odds") {
      setMarketStatus(null);
      setOddsDirty(false);
    }
    setBusy(null);
    router.refresh();
  }

  async function saveLineup(event: FormEvent) {
    event.preventDefault();
    if (!lineup || !detail.latest_lineup) return;
    setBusy("lineup-correction");
    setMessage(null);
    const response = await fetch(
      `${apiBaseUrl}/api/v1/matches/${fixtureId}/lineup/${detail.latest_lineup.id}/corrections`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lineup),
      },
    );
    if (!response.ok) {
      setMessage(await responseError(response));
    } else {
      setMessage("Corrected lineup saved as a new immutable version.");
      router.refresh();
    }
    setBusy(null);
  }

  async function saveOdds(event: FormEvent) {
    event.preventDefault();
    if (!odds || !detail.latest_odds) return;
    const parsed = oddsRows.split("\n").filter(Boolean).map((row) => {
      const [line, over_odds, under_odds] = row.split(/[ ,]+/).map(Number);
      return { line, over_odds, under_odds };
    });
    if (parsed.some((row) => Object.values(row).some((value) => Number.isNaN(value)))) {
      setMessage("Use one odds row per line: total, over odds, under odds.");
      return;
    }
    setBusy("odds-correction");
    setMessage(null);
    const response = await fetch(
      `${apiBaseUrl}/api/v1/matches/${fixtureId}/odds/${detail.latest_odds.id}/corrections`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...odds, totals: parsed }),
      },
    );
    if (!response.ok) {
      setMessage(await responseError(response));
    } else {
      setMessage("Corrected odds saved as a new immutable version. Verify the saved values next.");
      setMarketStatus(null);
      setOddsDirty(false);
      router.refresh();
    }
    setBusy(null);
  }

  async function verifyOdds() {
    if (!detail.latest_odds || oddsDirty) return;
    setBusy("market-verification");
    setMessage(null);
    const response = await fetch(
      `${apiBaseUrl}/api/v1/matches/${fixtureId}/odds/${detail.latest_odds.id}/verify`,
      { method: "POST" },
    );
    if (!response.ok) {
      setMessage(await responseError(response));
      setBusy(null);
      return;
    }
    const status = (await response.json()) as MarketStatus;
    setMarketStatus(status);
    setMessage(
      "Market verified and frozen as MARKET_RECEIVED. Final LOCK/HOLD remains disabled until canonical fair-total logic is restored.",
    );
    setBusy(null);
    router.refresh();
  }

  const marketVerified = Boolean(
    marketStatus?.verified
      && marketStatus.latest_odds_submission_id === detail.latest_odds?.id
      && marketStatus.verified_odds_submission_id === detail.latest_odds?.id,
  );
  const canVerify = Boolean(
    detail.latest_odds
      && marketStatus?.ready_for_verification
      && !oddsDirty
      && !busy
      && !locked,
  );

  return (
    <>
      {visibleVerdict && (
        <section className={`verdict-banner ${visibleVerdict === "OFFICIAL LOCK" ? "lock" : "hold"}`}>
          <div>
            <span>Historical decision</span>
            <strong>{visibleVerdict}</strong>
          </div>
          {detail.official_bet?.selected_line && (
            <p>
              O{detail.official_bet.selected_line} @{detail.official_bet.selected_odds.toFixed(2)}
            </p>
          )}
        </section>
      )}

      {message && <div className="workbench-message" role="status">{message}</div>}

      <section className="upload-grid">
        <div className="upload-card">
          <div className="card-index">01</div>
          <div>
            <span className="card-kicker">Confirmed XI</span>
            <h3>Lineup evidence</h3>
            <p>Provider-confirmed XI is primary. Screenshot upload remains a manual fallback/correction path.</p>
          </div>
          <input
            aria-label="Lineup screenshots"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={(event) => setLineupFiles(Array.from(event.target.files ?? []))}
          />
          <button type="button" onClick={() => upload("lineup", lineupFiles)} disabled={Boolean(busy) || locked}>
            {busy === "lineup" ? "Reading…" : detail.latest_lineup ? "Replace extraction" : "Extract lineup"}
          </button>
          {detail.latest_lineup && (
            <small>{detail.latest_lineup.original_filenames.join(", ")} · {Math.round(detail.latest_lineup.confidence * 100)}%</small>
          )}
        </div>

        <div className="upload-card">
          <div className="card-index">02</div>
          <div>
            <span className="card-kicker">Asian totals</span>
            <h3>Odds screenshot</h3>
            <p>Manual bookmaker screenshot only: full-match Asian total, Over price and Under price.</p>
          </div>
          <input
            aria-label="Odds screenshots"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={(event) => setOddsFiles(Array.from(event.target.files ?? []))}
          />
          <button type="button" onClick={() => upload("odds", oddsFiles)} disabled={Boolean(busy) || locked}>
            {busy === "odds" ? "Reading…" : detail.latest_odds ? "Replace extraction" : "Extract odds"}
          </button>
          {detail.latest_odds && (
            <small>{detail.latest_odds.original_filenames.join(", ")} · {Math.round(detail.latest_odds.confidence * 100)}%</small>
          )}
        </div>
      </section>

      {(lineup || odds) && (
        <div className="review-heading">
          <div><span>03</span><h2>Review extracted evidence</h2></div>
          <small>{providerMode} · corrections create a new immutable version</small>
        </div>
      )}

      {lineup && detail.latest_lineup && (
        <form className="correction-card" onSubmit={saveLineup}>
          <div className="correction-title">
            <div><span>LINEUP</span><h3>{lineup.home_team} — {lineup.away_team}</h3></div>
            <label>Confidence <input type="number" min="0" max="1" step="0.01" value={lineup.confidence} onChange={(event) => setLineup({ ...lineup, confidence: Number(event.target.value) })} /></label>
          </div>
          <div className="identity-grid">
            <label>Home team<input value={lineup.home_team} onChange={(event) => setLineup({ ...lineup, home_team: event.target.value })} /></label>
            <label>Away team<input value={lineup.away_team} onChange={(event) => setLineup({ ...lineup, away_team: event.target.value })} /></label>
          </div>
          <div className="formation-grid">
            <label>Home formation<input value={lineup.home_formation ?? ""} onChange={(event) => setLineup({ ...lineup, home_formation: event.target.value || null })} /></label>
            <label>Away formation<input value={lineup.away_formation ?? ""} onChange={(event) => setLineup({ ...lineup, away_formation: event.target.value || null })} /></label>
          </div>
          <div className="squad-grid">
            <label>Home starting XI<textarea value={lines(lineup.home_starting_xi)} onChange={(event) => setLineup({ ...lineup, home_starting_xi: list(event.target.value) })} /></label>
            <label>Away starting XI<textarea value={lines(lineup.away_starting_xi)} onChange={(event) => setLineup({ ...lineup, away_starting_xi: list(event.target.value) })} /></label>
            <label>Home bench<textarea value={lines(lineup.home_bench)} onChange={(event) => setLineup({ ...lineup, home_bench: list(event.target.value) })} /></label>
            <label>Away bench<textarea value={lines(lineup.away_bench)} onChange={(event) => setLineup({ ...lineup, away_bench: list(event.target.value) })} /></label>
            <label>Home missing<textarea value={lines(lineup.home_missing)} onChange={(event) => setLineup({ ...lineup, home_missing: list(event.target.value) })} /></label>
            <label>Away missing<textarea value={lines(lineup.away_missing)} onChange={(event) => setLineup({ ...lineup, away_missing: list(event.target.value) })} /></label>
          </div>
          <div className="signals-grid">
            <SignalField label="Attack shape" min={-2} max={2} value={lineup.xi_signals.attack_shape_delta} onChange={(value) => setLineup({ ...lineup, xi_signals: { ...lineup.xi_signals, attack_shape_delta: value } })} />
            <SignalField label="Creators" min={-2} max={2} value={lineup.xi_signals.creator_availability} onChange={(value) => setLineup({ ...lineup, xi_signals: { ...lineup.xi_signals, creator_availability: value } })} />
            <SignalField label="Finishers" min={-2} max={2} value={lineup.xi_signals.finisher_availability} onChange={(value) => setLineup({ ...lineup, xi_signals: { ...lineup.xi_signals, finisher_availability: value } })} />
            <SignalField label="Defensive absences" min={-2} max={2} value={lineup.xi_signals.defensive_absence_over_impact} onChange={(value) => setLineup({ ...lineup, xi_signals: { ...lineup.xi_signals, defensive_absence_over_impact: value } })} />
            <SignalField label="Rotation risk" min={0} max={2} value={lineup.xi_signals.rotation_risk} onChange={(value) => setLineup({ ...lineup, xi_signals: { ...lineup.xi_signals, rotation_risk: value } })} />
            <SignalField label="Cohesion risk" min={0} max={2} value={lineup.xi_signals.cohesion_risk} onChange={(value) => setLineup({ ...lineup, xi_signals: { ...lineup.xi_signals, cohesion_risk: value } })} />
            <SignalField label="Service quality" min={-2} max={2} value={lineup.xi_signals.service_quality} onChange={(value) => setLineup({ ...lineup, xi_signals: { ...lineup.xi_signals, service_quality: value } })} />
            <label className="role-change"><input type="checkbox" checked={lineup.xi_signals.genuine_role_change} onChange={(event) => setLineup({ ...lineup, xi_signals: { ...lineup.xi_signals, genuine_role_change: event.target.checked } })} /> Genuine role/shape change</label>
          </div>
          <button className="secondary-button" disabled={Boolean(busy) || locked}>Save corrected lineup version</button>
        </form>
      )}

      {odds && detail.latest_odds && (
        <form className="correction-card odds-correction" onSubmit={saveOdds}>
          <div className="correction-title">
            <div><span>ODDS</span><h3>Asian total lines</h3></div>
            <label>Confidence <input type="number" min="0" max="1" step="0.01" value={odds.confidence} onChange={(event) => { setOdds({ ...odds, confidence: Number(event.target.value) }); setOddsDirty(true); }} /></label>
          </div>
          <label>Match label<input value={odds.match} onChange={(event) => { setOdds({ ...odds, match: event.target.value }); setOddsDirty(true); }} /></label>
          <label>Line, Over odds, Under odds<textarea value={oddsRows} onChange={(event) => { setOddsRows(event.target.value); setOddsDirty(true); }} placeholder="2.75, 1.80, 2.00" /></label>
          <button className="secondary-button" disabled={Boolean(busy) || locked}>Save corrected odds version</button>
          {oddsDirty && <small>Unsaved changes cannot be verified. Save this corrected version first.</small>}
        </form>
      )}

      <section className="decision-control">
        <div>
          <span className="card-kicker">04 · User verification</span>
          <h2>Freeze the visible market</h2>
          <p>
            Confirm that the saved Asian totals and prices above match the bookmaker screenshot.
            Verification creates an immutable MARKET_RECEIVED event.
          </p>
          {marketVerified && marketStatus?.verified_at && (
            <small>Verified {new Date(marketStatus.verified_at).toLocaleString()}</small>
          )}
        </div>
        <button type="button" className="decision-button" onClick={verifyOdds} disabled={!canVerify}>
          {marketVerified
            ? "Market verified"
            : busy === "market-verification"
              ? "Verifying…"
              : oddsDirty
                ? "Save corrections first"
                : "Verify saved odds"}
        </button>
      </section>

      <section className="decision-control">
        <div>
          <span className="card-kicker">05 · Final gate</span>
          <h2>Fair-total comparison and LOCK/HOLD</h2>
          <p>
            Disabled by change control. The canonical situational adjustment, projected goal
            distribution, fair total and market-comparison logic must be restored before this
            stage can issue any production verdict.
          </p>
        </div>
        <button type="button" className="decision-button" disabled>
          {marketVerified ? "Market ready · lock engine pending" : "Verify market first"}
        </button>
      </section>
    </>
  );
}
