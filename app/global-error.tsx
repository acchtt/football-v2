"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html>
      <body>
        <div className="notice">
          <div className="eyebrow">SERVER ERROR</div>
          <h2>The dashboard hit an unexpected error.</h2>
          <p>{error.message || "Unknown server error"}</p>
          <div className="code">Digest: {error.digest || "none"}</div>
          <button onClick={reset} style={{ marginTop: 14, padding: "9px 14px", borderRadius: 8, border: "1px solid #3a3d45", background: "#17191e", color: "white", cursor: "pointer" }}>Try again</button>
        </div>
      </body>
    </html>
  );
}
