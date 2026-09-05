"use client";

import { useEffect, useMemo, useState } from "react";
import type { PublishedMatch, XiEvaluation } from "@/lib/types";
import { decide, normalizeOffer } from "@/lib/verdict";

type Row = { line: string; odds: string };

function parseOcr(text: string): Row[] {
  const normalized = text.replaceAll(",", ".").replace(/[Oo]ver/gi, "O");
  const rows: Row[] = [];
  const seen = new Set<string>();
  const pattern = /(?:\bO\s*)?(\d(?:\.\d{1,2})?)\s+([+-]?\d(?:\.\d{1,3})?)/g;
  for (const match of normalized.matchAll(pattern)) {
    const line = Number(match[1]);
    const odds = Number(match[2]);
    if (line < 1.5 || line > 6.5) continue;
    if (odds <= 0 || odds > 3.5) continue;
    const key = `${line}-${odds}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ line: String(line), odds: String(odds) });
  }
  return rows.slice(0, 12);
}

export function OddsVerdict({ match, xi }: { match: PublishedMatch; xi: XiEvaluation }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [ocrText, setOcrText] = useState("");
  const [ocrBusy, setOcrBusy] = useState(false);
  const [verified, setVerified] = useState(false);

  useEffect(() => () => {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
  }, [preview]);

  const offers = useMemo(() => rows.flatMap((row) => {
    const offer = normalizeOffer(Number(row.line), Number(row.odds));
    return offer ? [offer] : [];
  }), [rows]);

  const verdict = verified ? decide(match, xi, offers) : { verdict: "WAIT" as const, reason: "Verify the extracted odds before a verdict is allowed." };

  async function runOcr() {
    if (!file) return;
    setOcrBusy(true);
    setVerified(false);
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng");
      const result = await worker.recognize(file);
      await worker.terminate();
      const text = result.data.text || "";
      setOcrText(text);
      const extracted = parseOcr(text);
      if (extracted.length) setRows(extracted);
    } catch (error) {
      setOcrText(error instanceof Error ? `OCR failed: ${error.message}` : "OCR failed. Enter the visible rows manually.");
    } finally {
      setOcrBusy(false);
    }
  }

  function updateRow(index: number, field: keyof Row, value: string) {
    setRows((current) => current.map((row, i) => i === index ? { ...row, [field]: value } : row));
    setVerified(false);
  }

  return (
    <section className="market-workspace">
      <div className="upload-box">
        <label>
          <span>Odds screenshot</span>
          <input type="file" accept="image/*" onChange={(event) => {
            const next = event.target.files?.[0] || null;
            if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
            setFile(next);
            setPreview(next ? URL.createObjectURL(next) : null);
            setRows([]);
            setOcrText("");
            setVerified(false);
          }} />
        </label>
        {preview && <img src={preview} className="odds-image" alt="Uploaded odds screenshot" />}
        <div className="actions">
          <button type="button" disabled={!file || ocrBusy} onClick={runOcr}>{ocrBusy ? "Reading image…" : "Extract odds from image"}</button>
          <button type="button" onClick={() => { setRows((current) => [...current, { line: "", odds: "" }]); setVerified(false); }}>Add row manually</button>
        </div>
        {ocrText && <details><summary>OCR text</summary><pre>{ocrText}</pre></details>}
      </div>

      <div className="odds-editor">
        <div className="editor-head">
          <div><span className="kicker">Visible market</span><h3>Verify extracted rows</h3></div>
          <span className={verified ? "badge ok" : "badge"}>{verified ? "VERIFIED" : "UNVERIFIED"}</span>
        </div>
        {rows.length === 0 && <p className="muted">Upload an image and run OCR, or add the visible rows manually.</p>}
        {rows.map((row, index) => {
          const normalized = normalizeOffer(Number(row.line), Number(row.odds));
          return (
            <div className="odds-row" key={index}>
              <label>Over line<input inputMode="decimal" value={row.line} onChange={(event) => updateRow(index, "line", event.target.value)} /></label>
              <label>Shown price<input inputMode="decimal" value={row.odds} onChange={(event) => updateRow(index, "odds", event.target.value)} /></label>
              <div className="normalized"><span>Normalized</span><strong>{normalized ? `${normalized.decimalOdds.toFixed(2)} ${normalized.oddsFormat}` : "—"}</strong></div>
              <button type="button" className="text-button" onClick={() => { setRows((current) => current.filter((_, i) => i !== index)); setVerified(false); }}>Remove</button>
            </div>
          );
        })}
        <button className="verify" type="button" disabled={!offers.length} onClick={() => setVerified(true)}>Verify visible odds</button>
      </div>

      <div className={`verdict-panel ${verdict.verdict.toLowerCase()}`}>
        <span>Website verdict</span>
        <strong>{verdict.verdict}{verdict.line !== undefined ? ` · O${verdict.line}` : ""}</strong>
        {verdict.odds !== undefined && <b>@ {verdict.odds.toFixed(2)}</b>}
        <p>{verdict.reason}</p>
      </div>
    </section>
  );
}
