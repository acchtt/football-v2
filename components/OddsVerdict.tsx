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
  lineKey: string;
};

function foldText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replaceAll(",", ".")
    .toLowerCase();
}

function isOverMarker(value: string): boolean {
  const token = foldText(value).replace(/[^a-z]/g, "");
  return token.includes("tai") || token.includes("over");
}

function isUnderMarker(value: string): boolean {
  const token = foldText(value).replace(/[^a-z]/g, "");
  return token.includes("under") || token.includes("xiu");
}

function totalFromText(value: string): number | undefined {
  const text = foldText(value);

  const split = text.match(/([2-5](?:\.[05])?)\s*\/\s*([2-5](?:\.[05])?)/);
  if (split) {
    const low = Number(split[1]);
    const high = Number(split[2]);
    if (Math.abs(high - low) !== 0.5) return undefined;
    const quarter = (low + high) / 2;
    return quarter >= 2 && quarter <= 5 ? quarter : undefined;
  }

  const single = text.match(/(?:^|[^0-9])([2-5](?:\.0|\.5))(?:$|[^0-9])/);
  if (single) return Number(single[1]);

  const labelledWhole = text.match(/(?:tai|over)\s*([2-5])(?:\D|$)/i);
  if (labelledWhole) return Number(labelledWhole[1]);

  return undefined;
}

function priceFromText(value: string): number | undefined {
  const text = foldText(value);
  const matches = [...text.matchAll(/(?:^|[^0-9])([1-3]\.[0-9]{2,3})(?:$|[^0-9])/g)];
  for (const match of matches.reverse()) {
    const price = Number(match[1]);
    if (price > 1 && price <= 3.5) return price;
  }
  return undefined;
}

function parseTsvWords(tsv: string): OcrWord[] {
  const rows = tsv.split(/\r?\n/).slice(1);
  const words: OcrWord[] = [];

  for (const row of rows) {
    if (!row.trim()) continue;
    const columns = row.split("\t");
    if (columns.length < 12 || columns[0] !== "5") continue;

    const left = Number(columns[6]);
    const top = Number(columns[7]);
    const width = Number(columns[8]);
    const height = Number(columns[9]);
    const confidence = Number(columns[10]);
    const text = columns.slice(11).join("\t").trim();
    const lineKey = `${columns[2]}-${columns[3]}-${columns[4]}`;

    if (!text || ![left, top, width, height, confidence].every(Number.isFinite)) continue;
    if (confidence < 10) continue;
    words.push({ text, left, top, width, height, confidence, lineKey });
  }

  return words;
}

function splitAtLargestGap(words: OcrWord[]): OcrWord[] {
  if (words.length < 4) return words;
  const sorted = words.slice().sort((a, b) => a.left - b.left);
  let bestIndex = -1;
  let bestGap = 0;
  const avgHeight = sorted.reduce((sum, word) => sum + word.height, 0) / sorted.length;

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const gap = sorted[index + 1].left - (sorted[index].left + sorted[index].width);
    if (gap > bestGap) {
      bestGap = gap;
      bestIndex = index;
    }
  }

  return bestIndex >= 0 && bestGap > Math.max(18, avgHeight * 2.2)
    ? sorted.slice(0, bestIndex + 1)
    : sorted;
}

function parseBookmakerOverRows(tsv: string): Row[] {
  const words = parseTsvWords(tsv);
  const grouped = new Map<string, OcrWord[]>();

  for (const word of words) {
    const group = grouped.get(word.lineKey) || [];
    group.push(word);
    grouped.set(word.lineKey, group);
  }

  const found: Array<Row & { top: number }> = [];

  for (const lineWords of grouped.values()) {
    const sorted = lineWords.slice().sort((a, b) => a.left - b.left);
    const overIndex = sorted.findIndex((word) => isOverMarker(word.text));
    if (overIndex < 0) continue;

    const underIndex = sorted.findIndex((word, index) => index > overIndex && isUnderMarker(word.text));
    let overSide = underIndex > overIndex ? sorted.slice(overIndex, underIndex) : sorted.slice(overIndex);
    if (underIndex < 0) overSide = splitAtLargestGap(overSide);

    const joined = overSide.map((word) => word.text).join(" ");
    const total = totalFromText(joined);
    if (total === undefined) continue;

    const priceCandidates = overSide
      .flatMap((word) => {
        const price = priceFromText(word.text);
        return price === undefined ? [] : [{ price, left: word.left }];
      })
      .sort((a, b) => b.left - a.left);

    const price = priceCandidates[0]?.price ?? priceFromText(joined);
    if (price === undefined) continue;

    found.push({
      line: String(Number(total.toFixed(2))),
      odds: String(price),
      top: Math.min(...overSide.map((word) => word.top))
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

function parseFlatOverRows(text: string): Row[] {
  const rows: Row[] = [];
  const seen = new Set<string>();

  for (const rawLine of text.split(/\r?\n/)) {
    if (!isOverMarker(rawLine)) continue;

    const underMatch = foldText(rawLine).search(/\b(?:under|xiu)\b/);
    const overSide = underMatch >= 0 ? rawLine.slice(0, underMatch) : rawLine;
    const total = totalFromText(overSide);
    const price = priceFromText(overSide);
    if (total === undefined || price === undefined) continue;

    const row = { line: String(Number(total.toFixed(2))), odds: String(price) };
    const key = `${row.line}-${row.odds}`;
    if (!seen.has(key)) {
      seen.add(key);
      rows.push(row);
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
    const context = canvas.getContext("2d");
    if (!context) return file;

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.filter = "grayscale(1) contrast(1.55)";
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
      const imageItem = Array.from(event.clipboardData?.items || []).find((item) => item.type.startsWith("image/"));
      const pasted = imageItem?.getAsFile();
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
      setPasteNotice("Clipboard access was blocked. Press Ctrl/Cmd+V instead.");
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
      await worker.setParameters({ preserve_interword_spaces: "1", user_defined_dpi: "300" });
      const prepared = await prepareOcrImage(file);
      const result = await worker.recognize(prepared, {}, { text: true, tsv: true });
      await worker.terminate();

      const text = result.data.text || "";
      const tsv = result.data.tsv || "";
      setOcrText(text);

      const visualRows = tsv ? parseBookmakerOverRows(tsv) : [];
      const extracted = visualRows.length ? visualRows : parseFlatOverRows(text);
      setRows(extracted);
      setOcrNotice(
        visualRows.length
          ? `Tài/Over row mode: found ${visualRows.length} Over row${visualRows.length === 1 ? "" : "s"}. Under was ignored.`
          : extracted.length
            ? "Fallback text-row mode used. Verify every extracted Tài/Over row."
            : "No reliable Tài/Over rows were detected. Add the visible rows manually."
      );
    } catch (error) {
      setOcrText(error instanceof Error ? `OCR failed: ${error.message}` : "OCR failed.");
      setOcrNotice("OCR failed. Enter the visible Tài/Over rows manually.");
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
          <div><span className="kicker">Odds screenshot</span><h3>Upload or paste an image</h3></div>
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
          <button type="button" disabled={!file || ocrBusy} onClick={runOcr}>{ocrBusy ? "Reading Tài rows…" : "Extract Tài / Over odds"}</button>
          <button type="button" onClick={() => { setRows((current) => [...current, { line: "", odds: "" }]); setVerified(false); }}>Add row manually</button>
          {file && <button type="button" onClick={() => ingestImage(null)}>Clear image</button>}
        </div>
        {ocrNotice && <p className="ocr-notice" aria-live="polite">{ocrNotice}</p>}
        {ocrText && <details><summary>OCR text</summary><pre>{ocrText}</pre></details>}
      </div>

      <div className="odds-editor">
        <div className="editor-head">
          <div><span className="kicker">Visible full-match market</span><h3>Verify Tài / Over lines and prices</h3></div>
          <span className={verified ? "badge ok" : "badge"}>{verified ? "VERIFIED" : "UNVERIFIED"}</span>
        </div>
        {rows.length === 0 && <p className="muted">Upload or paste an image and extract the Tài/Over rows, or add them manually.</p>}
        {rows.map((row, index) => {
          const normalized = normalizeOffer(Number(row.line), Number(row.odds));
          return (
            <div className="odds-row" key={index}>
              <label>Over line<input inputMode="decimal" value={row.line} onChange={(event) => updateRow(index, "line", event.target.value)} /></label>
              <label>Shown Tài / Over price<input inputMode="decimal" value={row.odds} onChange={(event) => updateRow(index, "odds", event.target.value)} /></label>
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
