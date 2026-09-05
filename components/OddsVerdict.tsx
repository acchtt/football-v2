"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PublishedMatch, XiEvaluation } from "@/lib/types";
import { decide, normalizeOffer } from "@/lib/verdict";

type Row = { line: string; odds: string };
type OcrWord = {
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  confidence: number;
};

type SpatialRow = Row & { top: number };

function cleanToken(value: string): string {
  return value
    .replaceAll(",", ".")
    .replace(/[↑↓▲▼△▽]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function totalFromToken(value: string): number | undefined {
  const token = cleanToken(value);

  const split = token.match(/^([2-5](?:\.[05])?)\/([2-5](?:\.[05])?)$/);
  if (split) {
    const low = Number(split[1]);
    const high = Number(split[2]);
    if (Math.abs(high - low) !== 0.5) return undefined;
    const quarter = (low + high) / 2;
    return quarter >= 2 && quarter <= 5 ? quarter : undefined;
  }

  const single = token.match(/^([2-5])(?:\.([05]))$/);
  if (single) {
    const line = Number(token);
    return line >= 2 && line <= 5 ? line : undefined;
  }

  // Some OCR passes drop the trailing .0 from whole-goal totals.
  if (/^[2-5]$/.test(token)) return Number(token);
  return undefined;
}

function priceFromToken(value: string): number | undefined {
  const token = cleanToken(value);
  const match = token.match(/^([1-3]\.[0-9]{2,3})$/);
  if (!match) return undefined;
  const price = Number(match[1]);
  return price > 1 && price <= 3.5 ? price : undefined;
}

function parseTsvWords(tsv: string): OcrWord[] {
  const lines = tsv.split(/\r?\n/).slice(1);
  const words: OcrWord[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const columns = line.split("\t");
    if (columns.length < 12 || columns[0] !== "5") continue;

    const left = Number(columns[6]);
    const top = Number(columns[7]);
    const width = Number(columns[8]);
    const height = Number(columns[9]);
    const confidence = Number(columns[10]);
    const text = columns.slice(11).join("\t").trim();

    if (!text || ![left, top, width, height, confidence].every(Number.isFinite)) continue;
    if (confidence < 15) continue;
    words.push({ text, left, top, width, height, confidence });
  }

  return words;
}

function parseSpatialTotals(tsv: string): Row[] {
  const words = parseTsvWords(tsv);
  const found: SpatialRow[] = [];

  for (const lineWord of words) {
    const total = totalFromToken(lineWord.text);
    if (total === undefined) continue;

    const lineCenterY = lineWord.top + lineWord.height / 2;
    const maxVerticalGap = Math.max(8, lineWord.height * 0.9);
    const maxHorizontalGap = Math.max(100, lineWord.height * 12);
    const lineRight = lineWord.left + lineWord.width;

    const priceCandidates = words
      .flatMap((word) => {
        const price = priceFromToken(word.text);
        if (price === undefined) return [];
        const centerY = word.top + word.height / 2;
        const verticalGap = Math.abs(centerY - lineCenterY);
        const horizontalGap = word.left - lineRight;
        if (verticalGap > maxVerticalGap) return [];
        if (horizontalGap < -2 || horizontalGap > maxHorizontalGap) return [];
        return [{ word, price, horizontalGap, verticalGap }];
      })
      .sort((a, b) => a.horizontalGap - b.horizontalGap || a.verticalGap - b.verticalGap);

    const nearest = priceCandidates[0];
    if (!nearest) continue;

    found.push({
      line: String(Number(total.toFixed(2))),
      odds: String(nearest.price),
      top: lineWord.top
    });
  }

  const seen = new Set<string>();
  return found
    .sort((a, b) => a.top - b.top)
    .filter((row) => {
      const key = `${row.line}-${row.odds}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(({ line, odds }) => ({ line, odds }))
    .slice(0, 12);
}

function parseFlatOcr(text: string): Row[] {
  const normalized = text.replaceAll(",", ".");
  const rows: Row[] = [];
  const seen = new Set<string>();

  for (const rawLine of normalized.split(/\r?\n/)) {
    const tokens = rawLine.trim().split(/\s+/).filter(Boolean);
    for (let index = 0; index < tokens.length; index += 1) {
      const total = totalFromToken(tokens[index]);
      if (total === undefined) continue;

      for (let next = index + 1; next < Math.min(tokens.length, index + 4); next += 1) {
        const price = priceFromToken(tokens[next]);
        if (price === undefined) continue;
        const row = { line: String(Number(total.toFixed(2))), odds: String(price) };
        const key = `${row.line}-${row.odds}`;
        if (!seen.has(key)) {
          seen.add(key);
          rows.push(row);
        }
        break;
      }
    }
  }

  return rows.slice(0, 12);
}

async function prepareOcrImage(file: File): Promise<Blob | File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = bitmap.width < 1400 ? 3 : bitmap.width < 2200 ? 2 : 1.4;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d", { willReadFrequently: false });
    if (!context) return file;

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.filter = "grayscale(1) contrast(1.65)";
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    return blob || file;
  } catch {
    return file;
  }
}

function clipboardFile(file: File): File {
  if (file.name && file.name !== "image.png") return file;
  const extension = file.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
  return new File([file], `odds-${Date.now()}.${extension}`, { type: file.type || "image/png" });
}

export function OddsVerdict({ match, xi }: { match: PublishedMatch; xi: XiEvaluation }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [ocrText, setOcrText] = useState("");
  const [ocrBusy, setOcrBusy] = useState(false);
  const [verified, setVerified] = useState(false);
  const [pasteNotice, setPasteNotice] = useState("");
  const [ocrNotice, setOcrNotice] = useState("");

  useEffect(() => () => {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
  }, [preview]);

  const ingestImage = useCallback((next: File | null, source?: "paste" | "upload") => {
    setPreview((current) => {
      if (current?.startsWith("blob:")) URL.revokeObjectURL(current);
      return next ? URL.createObjectURL(next) : null;
    });
    setFile(next);
    setRows([]);
    setOcrText("");
    setOcrNotice("");
    setVerified(false);
    if (source === "paste" && next) setPasteNotice("Image pasted. Review it, then extract the odds.");
    else if (source === "upload" && next) setPasteNotice("Image loaded from file.");
    else if (!next) setPasteNotice("");
  }, []);

  useEffect(() => {
    function handlePaste(event: ClipboardEvent) {
      const items = Array.from(event.clipboardData?.items || []);
      const imageItem = items.find((item) => item.type.startsWith("image/"));
      if (!imageItem) return;
      const pasted = imageItem.getAsFile();
      if (!pasted) return;
      event.preventDefault();
      ingestImage(clipboardFile(pasted), "paste");
    }

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [ingestImage]);

  const offers = useMemo(() => rows.flatMap((row) => {
    const offer = normalizeOffer(Number(row.line), Number(row.odds));
    return offer ? [offer] : [];
  }), [rows]);

  const verdict = verified ? decide(match, xi, offers) : { verdict: "WAIT" as const, reason: "Verify the extracted odds before a verdict is allowed." };

  async function pasteFromClipboard() {
    setPasteNotice("");
    try {
      if (!navigator.clipboard?.read) {
        setPasteNotice("Clipboard button is not supported here. Use Ctrl/Cmd+V instead.");
        return;
      }
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith("image/"));
        if (!imageType) continue;
        const blob = await item.getType(imageType);
        const extension = imageType.split("/")[1]?.replace("jpeg", "jpg") || "png";
        ingestImage(new File([blob], `odds-${Date.now()}.${extension}`, { type: imageType }), "paste");
        return;
      }
      setPasteNotice("No image found in the clipboard.");
    } catch {
      setPasteNotice("Clipboard access was blocked. Press Ctrl/Cmd+V to paste the image instead.");
    }
  }

  async function runOcr() {
    if (!file) return;
    setOcrBusy(true);
    setVerified(false);
    setOcrNotice("");
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng");
      await worker.setParameters({
        preserve_interword_spaces: "1",
        user_defined_dpi: "300"
      });
      const prepared = await prepareOcrImage(file);
      const result = await worker.recognize(prepared, {}, { text: true, tsv: true });
      await worker.terminate();

      const text = result.data.text || "";
      const tsv = result.data.tsv || "";
      setOcrText(text);

      const spatial = tsv ? parseSpatialTotals(tsv) : [];
      const extracted = spatial.length ? spatial : parseFlatOcr(text);
      setRows(extracted);
      setOcrNotice(
        spatial.length
          ? `Table mode: found ${spatial.length} full-match Over row${spatial.length === 1 ? "" : "s"} by pairing each Asian-total line with the price immediately to its right.`
          : extracted.length
            ? "Fallback text mode used. Please check every extracted row carefully."
            : "No reliable full-match Asian-total rows were detected. Add the visible rows manually."
      );
    } catch (error) {
      setOcrText(error instanceof Error ? `OCR failed: ${error.message}` : "OCR failed. Enter the visible rows manually.");
      setOcrNotice("OCR failed. Enter the visible Asian-total rows manually.");
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
        <div className="image-intake-head">
          <div>
            <span className="kicker">Odds screenshot</span>
            <h3>Upload or paste an image</h3>
          </div>
          <div className="paste-shortcut"><kbd>⌘/Ctrl</kbd><span>+</span><kbd>V</kbd></div>
        </div>

        <div className={`paste-zone ${preview ? "has-image" : ""}`}>
          <label className="file-picker">
            <span>{preview ? "Replace screenshot" : "Choose screenshot"}</span>
            <input type="file" accept="image/*" onChange={(event) => {
              const next = event.target.files?.[0] || null;
              ingestImage(next, "upload");
              event.currentTarget.value = "";
            }} />
          </label>
          <button type="button" className="paste-button" onClick={pasteFromClipboard}>Paste image</button>
          <span className="paste-help">Copy a screenshot, then paste anywhere on this match page.</span>
        </div>

        {pasteNotice && <p className="paste-notice" aria-live="polite">{pasteNotice}</p>}
        {preview && <img src={preview} className="odds-image" alt="Odds screenshot" />}
        <div className="actions">
          <button type="button" disabled={!file || ocrBusy} onClick={runOcr}>{ocrBusy ? "Reading table…" : "Extract Asian totals"}</button>
          <button type="button" onClick={() => { setRows((current) => [...current, { line: "", odds: "" }]); setVerified(false); }}>Add row manually</button>
          {file && <button type="button" onClick={() => ingestImage(null)}>Clear image</button>}
        </div>
        {ocrNotice && <p className="ocr-notice" aria-live="polite">{ocrNotice}</p>}
        {ocrText && <details><summary>OCR text</summary><pre>{ocrText}</pre></details>}
      </div>

      <div className="odds-editor">
        <div className="editor-head">
          <div><span className="kicker">Visible full-match market</span><h3>Verify Over lines and prices</h3></div>
          <span className={verified ? "badge ok" : "badge"}>{verified ? "VERIFIED" : "UNVERIFIED"}</span>
        </div>
        {rows.length === 0 && <p className="muted">Upload or paste an image and extract the Asian totals, or add the visible rows manually.</p>}
        {rows.map((row, index) => {
          const normalized = normalizeOffer(Number(row.line), Number(row.odds));
          return (
            <div className="odds-row" key={index}>
              <label>Over line<input inputMode="decimal" value={row.line} onChange={(event) => updateRow(index, "line", event.target.value)} /></label>
              <label>Shown Over price<input inputMode="decimal" value={row.odds} onChange={(event) => updateRow(index, "odds", event.target.value)} /></label>
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
