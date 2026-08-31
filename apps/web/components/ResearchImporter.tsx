"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export default function ResearchImporter() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [payload, setPayload] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    let parsed: { board_date_ict?: string };
    try {
      parsed = JSON.parse(payload) as { board_date_ict?: string };
    } catch {
      setMessage("The research package is not valid JSON.");
      return;
    }
    if (!parsed.board_date_ict) {
      setMessage("The package must include board_date_ict.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/imports/research`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Research-Import-Token": token,
        },
        body: JSON.stringify(parsed),
      });
      const result = (await response.json()) as {
        detail?: string | Array<{ msg?: string }>;
        newly_frozen?: number;
        previously_frozen?: number;
      };
      if (!response.ok) {
        const detail = Array.isArray(result.detail)
          ? result.detail.map((item) => item.msg).filter(Boolean).join(" · ")
          : result.detail;
        throw new Error(detail || `Import failed (${response.status})`);
      }
      setMessage(
        `Imported ${result.newly_frozen ?? 0} new fixture(s); ` +
          `${result.previously_frozen ?? 0} already frozen.`,
      );
      router.push(`/?date=${encodeURIComponent(parsed.board_date_ict)}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Research import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="research-importer">
      <summary>
        <span>Research import</span>
        <small>Paste a sourced daily slate</small>
      </summary>
      <form onSubmit={submit}>
        <div className="research-import-copy">
          <span>Manual provider</span>
          <h2>Freeze our normal web-researched slate</h2>
          <p>
            Paste the JSON research package and enter the private import token. The token stays
            in this form and is not saved by the browser.
          </p>
        </div>
        <label>
          Import token
          <input
            type="password"
            autoComplete="off"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            required
          />
        </label>
        <label className="research-json-field">
          Sourced research JSON
          <textarea
            value={payload}
            onChange={(event) => setPayload(event.target.value)}
            placeholder='{"board_date_ict":"2026-08-31","fixtures":[...]}'
            spellCheck={false}
            required
          />
        </label>
        <div className="research-import-actions">
          <button type="submit" disabled={busy}>
            {busy ? "Freezing…" : "Import and freeze"}
          </button>
          {message && <p role="status">{message}</p>}
        </div>
      </form>
    </details>
  );
}
