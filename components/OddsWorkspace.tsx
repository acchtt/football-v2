"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { ODDS_EXAMPLES } from "@/lib/odds-examples";

type EditableOffer = { line: string; odds: string };
type ManualVerdict = { verdict: "LOCK" | "HOLD"; preferred_line: number | null; preferred_odds: number | null; reason: string };

function extractJson(input: string): unknown {
  const trimmed = input.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first < 0 || last < first) throw new Error("No JSON object found");
  return JSON.parse(trimmed.slice(first, last + 1));
}

function parseVerdict(input: string): ManualVerdict {
  const parsed = extractJson(input);
  if (!parsed || typeof parsed !== "object") throw new Error("Invalid response");
  const row = parsed as Record<string, unknown>;
  const verdict = String(row.verdict || "");
  if (verdict !== "LOCK" && verdict !== "HOLD") throw new Error("Verdict must be LOCK or HOLD");
  const line = row.preferred_line === null || row.preferred_line === undefined ? null : Number(row.preferred_line);
  const odds = row.preferred_odds === null || row.preferred_odds === undefined ? null : Number(row.preferred_odds);
  if (verdict === "LOCK" && (!Number.isFinite(line) || !Number.isFinite(odds))) throw new Error("LOCK requires preferred_line and preferred_odds");
  return { verdict, preferred_line: line, preferred_odds: odds, reason: String(row.reason || "") };
}

export function OddsWorkspace({ matchHome, matchAway, decisionBase }: { matchHome: string; matchAway: string; decisionBase: string }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [sourceLabel, setSourceLabel] = useState("");
  const [offers, setOffers] = useState<EditableOffer[]>([]);
  const [verified, setVerified] = useState(false);
  const [copied, setCopied] = useState(false);
  const [chatResponse, setChatResponse] = useState("");
  const [manualVerdict, setManualVerdict] = useState<ManualVerdict | null>(null);
  const [parseError, setParseError] = useState("");

  useEffect(() => () => {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
  }, [preview]);

  const validOffers = useMemo(() => offers.flatMap((offer) => {
    const line = Number(offer.line);
    const odds = Number(offer.odds);
    return Number.isFinite(line) && Number.isFinite(odds) && odds > 1 ? [{ line, odds }] : [];
  }), [offers]);

  const decisionPacket = useMemo(() => {
    if (!verified) return "";
    return `${decisionBase}\n\nVERIFIED SCREENSHOT OFFERS\n${JSON.stringify(validOffers)}\n\nUse only these verified offers. Return the required JSON only.`;
  }, [decisionBase, validOffers, verified]);

  function replacePreview(next: string) {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
    setPreview(next);
  }

  function chooseExample(id: string) {
    const example = ODDS_EXAMPLES.find((item) => item.id === id);
    if (!example) return;
    replacePreview(example.image);
    setSourceLabel(example.matchLabel);
    setOffers(example.offers.map((offer) => ({ line: String(offer.line), odds: offer.odds.toFixed(2) })));
    setVerified(false);
    setManualVerdict(null);
  }

  function updateOffer(index: number, key: keyof EditableOffer, value: string) {
    setOffers((current) => current.map((offer, offerIndex) => offerIndex === index ? { ...offer, [key]: value } : offer));
    setVerified(false);
    setManualVerdict(null);
  }

  async function copyDecisionPacket() {
    if (!decisionPacket) return;
    await navigator.clipboard.writeText(decisionPacket);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function loadVerdict() {
    try {
      setManualVerdict(parseVerdict(chatResponse));
      setParseError("");
    } catch (error) {
      setManualVerdict(null);
      setParseError(error instanceof Error ? error.message : "Could not parse ChatGPT result");
    }
  }

  return (
    <div className="upload">
      <div className="example-picker">
        <span>Try an example odds image</span>
        <div className="example-buttons">
          {ODDS_EXAMPLES.map((example) => (
            <button type="button" key={example.id} onClick={() => chooseExample(example.id)}>{example.label}</button>
          ))}
        </div>
      </div>

      <label className="file-label">
        <span>Or upload your bookmaker screenshot</span>
        <input
          type="file"
          accept="image/*"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            replacePreview(URL.createObjectURL(file));
            setSourceLabel(`${matchHome} vs ${matchAway}`);
            setOffers([]);
            setVerified(false);
            setManualVerdict(null);
          }}
        />
      </label>

      {preview && (
        <div className="odds-preview-shell">
          <Image className="preview" src={preview} alt="Bookmaker odds screenshot preview" width={900} height={560} unoptimized />
        </div>
      )}

      {preview && (
        <div className="verification-panel">
          <div className="verification-head">
            <div>
              <span className="kicker">Visible extraction</span>
              <strong>{sourceLabel || `${matchHome} vs ${matchAway}`}</strong>
            </div>
            <span className={verified ? "verified-badge" : "unverified-badge"}>{verified ? "MARKET RECEIVED" : "VERIFY VALUES"}</span>
          </div>

          {offers.length === 0 ? (
            <p className="upload-note">For uploaded screenshots, enter exactly the visible Over rows. No hidden or BSD odds can reach the model.</p>
          ) : null}

          <div className="editable-offers">
            {offers.map((offer, index) => (
              <div className="editable-offer" key={index}>
                <label>Over line<input inputMode="decimal" value={offer.line} onChange={(event) => updateOffer(index, "line", event.target.value)} /></label>
                <label>Price<input inputMode="decimal" value={offer.odds} onChange={(event) => updateOffer(index, "odds", event.target.value)} /></label>
                <button type="button" onClick={() => { setOffers((current) => current.filter((_, itemIndex) => itemIndex !== index)); setVerified(false); setManualVerdict(null); }}>Remove</button>
              </div>
            ))}
          </div>

          <div className="verification-actions">
            <button type="button" onClick={() => { setOffers((current) => [...current, { line: "", odds: "" }]); setVerified(false); }}>Add visible row</button>
            <button type="button" className="verify-button" disabled={!validOffers.length} onClick={() => setVerified(true)}>Verify visible odds</button>
          </div>

          {verified && (
            <div className="handoff-inline">
              <span className="kicker">No API · final model handoff</span>
              <h3>Copy XI + market packet to ChatGPT</h3>
              <p className="upload-note">Paste the packet into this Football ChatGPT project. Then paste the returned JSON below.</p>
              <div className="verification-actions">
                <button type="button" className="verify-button" onClick={copyDecisionPacket}>{copied ? "Copied" : "Copy decision packet"}</button>
              </div>
              <details className="packet-details"><summary>Preview packet</summary><textarea className="handoff-textarea" readOnly value={decisionPacket} /></details>
              <textarea className="handoff-textarea result-input" value={chatResponse} onChange={(event) => setChatResponse(event.target.value)} placeholder='{"verdict":"LOCK","preferred_line":2.75,"preferred_odds":1.89,"reason":"..."}' />
              <div className="verification-actions"><button type="button" className="verify-button" disabled={!chatResponse.trim()} onClick={loadVerdict}>Load verdict</button></div>
              {parseError && <div className="notice">{parseError}</div>}
              {manualVerdict && (
                <div className={`manual-verdict ${manualVerdict.verdict.toLowerCase()}`}>
                  <span>ChatGPT current-model verdict</span>
                  <strong>{manualVerdict.verdict}{manualVerdict.verdict === "LOCK" ? ` · O${manualVerdict.preferred_line} @ ${manualVerdict.preferred_odds?.toFixed(2)}` : ""}</strong>
                  <p>{manualVerdict.reason}</p>
                </div>
              )}
            </div>
          )}

          <p className="upload-note">
            Example images preload visible values for testing. Uploaded screenshots remain user-verifiable before any LOCK/HOLD handoff.
          </p>
        </div>
      )}
    </div>
  );
}
