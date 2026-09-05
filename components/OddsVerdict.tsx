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
  centerX: number;
  centerY: number;
};
type OcrPage = { words: OcrWord[]; width: number; height: number };
type OcrMode = "soft" | "threshold";

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

function numericText(value: string): string {
  return foldText(value)
    .replace(/[|li]/g, "1")
    .replace(/o/g, "0")
    .replace(/\s+/g, "");
}

function coerceTotalToken(token: string): number | undefined {
  const clean = numericText(token).replace(/[^0-9.]/g, "");
  if (/^[2-5](?:\.[05])?$/.test(clean)) {
    const value = Number(clean);
    return value >= 2 && value <= 5 ? value : undefined;
  }
  if (/^[2-5][05]$/.test(clean)) {
    const value = Number(clean) / 10;
    return value >= 2 && value <= 5 ? value : undefined;
  }
  return undefined;
}

function totalFromText(value: string): number | undefined {
  const text = numericText(value);
  const split = text.match(/([2-5](?:\.[05])?|[2-5][05])\/([2-5](?:\.[05])?|[2-5][05])/);
  if (split) {
    const low = coerceTotalToken(split[1]);
    const high = coerceTotalToken(split[2]);
    if (low === undefined || high === undefined || Math.abs(high - low) !== 0.5) return undefined;
    const quarter = (low + high) / 2;
    return quarter >= 2 && quarter <= 5 ? quarter : undefined;
  }

  const single = text.match(/(?:^|[^0-9])([2-5](?:\.[05])|[2-5][05])(?:$|[^0-9])/);
  if (single) return coerceTotalToken(single[1]);

  const labelledWhole = foldText(value).match(/(?:tai|over)\s*([2-5])(?:\D|$)/i);
  if (labelledWhole) return Number(labelledWhole[1]);

  return undefined;
}

function priceFromText(value: string): number | undefined {
  const text = numericText(value);
  const decimalMatches = [...text.matchAll(/(?:^|[^0-9])([1-3]\.[0-9]{2,3})(?:$|[^0-9])/g)];
  for (const match of decimalMatches.reverse()) {
    const price = Number(match[1]);
    if (price > 1 && price <= 3.5) return price;
  }

  const compactMatches = [...text.matchAll(/(?:^|[^0-9])([1-3])([0-9]{2})(?:$|[^0-9])/g)];
  for (const match of compactMatches.reverse()) {
    const price = Number(`${match[1]}.${match[2]}`);
    if (price > 1 && price <= 3.5) return price;
  }

  return undefined;
}

function parseTsvPage(tsv: string): OcrPage {
  const lines = tsv.split(/\r?\n/).slice(1);
  const words: OcrWord[] = [];
  let pageWidth = 0;
  let pageHeight = 0;

  for (const row of lines) {
    if (!row.trim()) continue;
    const columns = row.split("\t");
    if (columns.length < 12) continue;

    const level = columns[0];
    const left = Number(columns[6]);
    const top = Number(columns[7]);
    const width = Number(columns[8]);
    const height = Number(columns[9]);
    const confidence = Number(columns[10]);
    const text = columns.slice(11).join("\t").trim();

    if (level === "1" && Number.isFinite(width) && Number.isFinite(height)) {
      pageWidth = Math.max(pageWidth, width);
      pageHeight = Math.max(pageHeight, height);
    }

    if (level !== "5") continue;
    if (!text || ![left, top, width, height, confidence].every(Number.isFinite)) continue;
    if (confidence < 0) continue;

    words.push({
      text,
      left,
      top,
      width,
      height,
      confidence,
      centerX: left + width / 2,
      centerY: top + height / 2
    });
  }

  if (!pageWidth && words.length) pageWidth = Math.max(...words.map((word) => word.left + word.width));
  if (!pageHeight && words.length) pageHeight = Math.max(...words.map((word) => word.top + word.height));
  return { words, width: pageWidth, height: pageHeight };
}

function median(values: number[]): number | undefined {
  if (!values.length) return undefined;
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function clusterSpatialRows(words: OcrWord[]): OcrWord[][] {
  if (!words.length) return [];
  const heightMedian = median(words.map((word) => word.height)) || 20;
  const tolerance = Math.max(8, heightMedian * 0.72);
  const rows: Array<{ centerY: number; words: OcrWord[] }> = [];

  for (const word of words.slice().sort((a, b) => a.centerY - b.centerY || a.left - b.left)) {
    let best: { centerY: number; words: OcrWord[] } | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const row of rows) {
      const distance = Math.abs(word.centerY - row.centerY);
      if (distance <= tolerance && distance < bestDistance) {
        best = row;
        bestDistance = distance;
      }
    }

    if (!best) {
      rows.push({ centerY: word.centerY, words: [word] });
      continue;
    }

    best.words.push(word);
    best.centerY = best.words.reduce((sum, item) => sum + item.centerY, 0) / best.words.length;
  }

  return rows
    .sort((a, b) => a.centerY - b.centerY)
    .map((row) => row.words.slice().sort((a, b) => a.left - b.left));
}

function chooseOverDivider(page: OcrPage): number {
  const underLefts = page.words.filter((word) => isUnderMarker(word.text)).map((word) => word.left);
  const fromUnder = median(underLefts);
  if (fromUnder !== undefined) return fromUnder - 4;

  const overRights = page.words.filter((word) => isOverMarker(word.text)).map((word) => word.left + word.width);
  const fromOver = median(overRights);
  if (fromOver !== undefined && page.width) return Math.max(page.width * 0.48, fromOver + page.width * 0.18);

  return page.width ? page.width * 0.52 : Number.POSITIVE_INFINITY;
}

function confidenceFor(words: OcrWord[]): number {
  if (!words.length) return 0;
  return words.reduce((sum, word) => sum + Math.max(0, word.confidence), 0) / words.length;
}

function parseBookmakerOverRows(tsv: string): Array<Row & { score: number; top: number }> {
  const page = parseTsvPage(tsv);
  if (!page.words.length) return [];

  const globalOverCount = page.words.filter((word) => isOverMarker(word.text)).length;
  const globalUnderCount = page.words.filter((word) => isUnderMarker(word.text)).length;
  if (globalOverCount === 0 && globalUnderCount === 0) return [];

  const divider = chooseOverDivider(page);
  const found: Array<Row & { score: number; top: number }> = [];

  for (const rowWords of clusterSpatialRows(page.words)) {
    const underWord = rowWords.find((word) => isUnderMarker(word.text));
    const rowDivider = underWord ? underWord.left - 4 : divider;
    const overSide = rowWords.filter((word) => word.centerX < rowDivider);
    if (!overSide.length) continue;

    const hasExplicitOver = overSide.some((word) => isOverMarker(word.text));
    const joined = overSide.map((word) => word.text).join(" ");
    const total = totalFromText(joined);
    const price = priceFromText(joined);
    if (total === undefined || price === undefined) continue;

    const score = confidenceFor(overSide) + (hasExplicitOver ? 35 : 0) + (underWord ? 12 : 0);
    found.push({
      line: String(Number(total.toFixed(2))),
      odds: String(Number(price.toFixed(3))),
      score,
      top: Math.min(...overSide.map((word) => word.top))
    });
  }

  const bestByLine = new Map<string, Row & { score: number; top: number }>();
  for (const row of found) {
    const existing = bestByLine.get(row.line);
    if (!existing || row.score > existing.score) bestByLine.set(row.line, row);
  }

  return [...bestByLine.values()]
    .sort((a, b) => Number(a.line) - Number(b.line) || a.top - b.top)
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

    const row = { line: String(Number(total.toFixed(2))), odds: String(Number(price.toFixed(3))) };
    if (!seen.has(row.line)) {
      seen.add(row.line);
      rows.push(row);
    }
  }

  return rows.sort((a, b) => Number(a.line) - Number(b.line)).slice(0, 12);
}

function mergeDetectedRows(...groups: Array<Array<Row & { score?: number }>>): Row[] {
  const best = new Map<string, Row & { score?: number }>();

  for (const group of groups) {
    for (const row of group) {
      const existing = best.get(row.line);
      const rowScore = row.score ?? 0;
      const existingScore = existing?.score ?? -1;
      if (!existing || rowScore > existingScore) best.set(row.line, row);
    }
  }

  return [...best.values()]
    .sort((a, b) => Number(a.line) - Number(b.line))
    .map(({ line, odds }) => ({ line, odds }))
    .slice(0, 12);
}

async function prepareOcrImage(file: File, mode: OcrMode): Promise<Blob | File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = bitmap.width < 900 ? 3.4 : bitmap.width < 1500 ? 2.6 : 1.8;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d", { willReadFrequently: mode === "threshold" });
    if (!context) return file;

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.filter = mode === "soft" ? "grayscale(1) contrast(1.35)" : "grayscale(1) contrast(1.75)";
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    if (mode === "threshold") {
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const data = image.data;
      for (let index = 0; index < data.length; index += 4) {
        const gray = data[index];
        const value = gray > 178 ? 255 : 0;
        data[index] = value;
        data[index + 1] = value;
        data[index + 2] = value;
        data[index + 3] = 255;
      }
      context.putImageData(image, 0, 0);
    }

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
  const [ocrStage, setOcrStage] = useState("Reading market…");
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
    setOcrStage("Reading market · pass 1/2…");

    let worker: Awaited<ReturnType<(typeof import("tesseract.js"))["createWorker"]>> | undefined;
    try {
      const tesseract = await import("tesseract.js");
      worker = await tesseract.createWorker("eng");
      await worker.setParameters({
        preserve_interword_spaces: "1",
        user_defined_dpi: "300",
        tessedit_pageseg_mode: tesseract.PSM.SINGLE_BLOCK
      });

      const soft = await prepareOcrImage(file, "soft");
      const first = await worker.recognize(soft, {}, { text: true, tsv: true });
      const firstText = first.data.text || "";
      const firstTsv = first.data.tsv || "";
      const firstRows = firstTsv ? parseBookmakerOverRows(firstTsv) : [];

      setOcrStage("Reading market · rescue pass 2/2…");
      await worker.setParameters({ tessedit_pageseg_mode: tesseract.PSM.SPARSE_TEXT });
      const threshold = await prepareOcrImage(file, "threshold");
      const second = await worker.recognize(threshold, {}, { text: true, tsv: true });
      const secondText = second.data.text || "";
      const secondTsv = second.data.tsv || "";
      const secondRows = secondTsv ? parseBookmakerOverRows(secondTsv) : [];

      const visualRows = mergeDetectedRows(firstRows, secondRows);
      const fallbackRows = visualRows.length ? [] : parseFlatOverRows(`${firstText}\n${secondText}`);
      const extracted = visualRows.length ? visualRows : fallbackRows;

      setOcrText(`PASS 1\n${firstText}\n\nPASS 2\n${secondText}`.trim());
      setRows(extracted);
      setOcrNotice(
        visualRows.length
          ? `Spatial Tài/Over mode found ${visualRows.length} row${visualRows.length === 1 ? "" : "s"}. Rows are matched by position, and the Under column is ignored.`
          : fallbackRows.length
            ? `Text fallback found ${fallbackRows.length} Tài/Over row${fallbackRows.length === 1 ? "" : "s"}. Verify every row before continuing.`
            : "No reliable full-match Tài/Over rows were detected. Add the visible rows manually."
      );
    } catch (error) {
      setOcrText(error instanceof Error ? `OCR failed: ${error.message}` : "OCR failed.");
      setOcrNotice("OCR failed. Enter the visible Tài/Over rows manually.");
    } finally {
      if (worker) await worker.terminate().catch(() => undefined);
      setOcrBusy(false);
      setOcrStage("Reading market…");
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
          <button type="button" disabled={!file || ocrBusy} onClick={runOcr}>{ocrBusy ? ocrStage : "Extract Tài / Over odds"}</button>
          <button type="button" onClick={() => { setRows((current) => [...current, { line: "", odds: "" }]); setVerified(false); }}>Add row manually</button>
          {file && <button type="button" onClick={() => ingestImage(null)}>Clear image</button>}
        </div>
        {ocrNotice && <p className="ocr-notice" aria-live="polite">{ocrNotice}</p>}
        {ocrText && <details><summary>OCR diagnostics</summary><pre>{ocrText}</pre></details>}
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
            <div className="odds-row" key={`${row.line}-${index}`}>
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
