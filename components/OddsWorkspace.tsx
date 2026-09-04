"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { ODDS_EXAMPLES } from "@/lib/odds-examples";

type EditableOffer = { line: string; odds: string };

export function OddsWorkspace({ matchHome, matchAway }: { matchHome: string; matchAway: string }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [sourceLabel, setSourceLabel] = useState("");
  const [offers, setOffers] = useState<EditableOffer[]>([]);
  const [verified, setVerified] = useState(false);

  useEffect(() => () => {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
  }, [preview]);

  const validOffers = useMemo(() => offers.filter((offer) => {
    const line = Number(offer.line);
    const odds = Number(offer.odds);
    return Number.isFinite(line) && Number.isFinite(odds) && odds > 1;
  }), [offers]);

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
  }

  function updateOffer(index: number, key: keyof EditableOffer, value: string) {
    setOffers((current) => current.map((offer, offerIndex) => offerIndex === index ? { ...offer, [key]: value } : offer));
    setVerified(false);
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
            <p className="upload-note">Custom-image OCR is the next server connection. For now, use “Add visible row” to enter exactly what the screenshot shows; no hidden value can reach the model.</p>
          ) : null}

          <div className="editable-offers">
            {offers.map((offer, index) => (
              <div className="editable-offer" key={index}>
                <label>Over line<input inputMode="decimal" value={offer.line} onChange={(event) => updateOffer(index, "line", event.target.value)} /></label>
                <label>Price<input inputMode="decimal" value={offer.odds} onChange={(event) => updateOffer(index, "odds", event.target.value)} /></label>
                <button type="button" onClick={() => { setOffers((current) => current.filter((_, itemIndex) => itemIndex !== index)); setVerified(false); }}>Remove</button>
              </div>
            ))}
          </div>

          <div className="verification-actions">
            <button type="button" onClick={() => { setOffers((current) => [...current, { line: "", odds: "" }]); setVerified(false); }}>Add visible row</button>
            <button type="button" className="verify-button" disabled={!validOffers.length} onClick={() => setVerified(true)}>Verify visible odds</button>
          </div>

          <p className="upload-note">
            Example images preload their visible values so the workflow can be tested immediately. Uploaded screenshots remain user-verifiable before any LOCK/HOLD decision.
          </p>
        </div>
      )}
    </div>
  );
}
