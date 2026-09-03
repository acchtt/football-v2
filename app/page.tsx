import Link from "next/link";
import { getMatches } from "@/lib/data";
import { MODEL } from "@/lib/model";

function kickoff(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: MODEL.timezone,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

export default async function Home() {
  const { mode, matches } = await getMatches();
  const ranked = [...matches].sort((a, b) => b.preScore - a.preScore);
  const locked = ranked.filter((match) => match.verdict === "LOCK").length;

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">F1</div>
          <div>
            <small>Decision control</small>
            <h1>Football v1.0</h1>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span className="mode-pill">{mode} PROVIDER</span>
          <span className="model-pill"><i className="live-dot" />{MODEL.version} · {MODEL.regime}</span>
        </div>
      </header>

      <section className="hero">
        <div>
          <span className="eyebrow">Daily ranked slate · ICT</span>
          <h2>Find the matches worth opening before looking at price.</h2>
          <p>
            Current model only. Structure, team profile, scoring routes and failure-mode resistance rank the board first;
            confirmed XI and market price come later. Sep-1 hardening is disabled.
          </p>
        </div>
        <div className="summary">
          <div><span>Matches</span><strong>{ranked.length}</strong></div>
          <div><span>Locks</span><strong>{locked}</strong></div>
          <div><span>Min price</span><strong>{MODEL.minimumOverPrice.toFixed(2)}</strong></div>
          <div><span>Timezone</span><strong>ICT</strong></div>
        </div>
      </section>

      <div className="section-head">
        <div>
          <h3>Structural board</h3>
          <p>Strongest over-friendly structures first, not chronological order.</p>
        </div>
        <span className="status-pill">PRE → XI → MARKET → VERDICT</span>
      </div>

      <section className="board">
        {ranked.map((match, index) => (
          <Link href={`/match/${match.id}`} className="match-card" key={match.id}>
            <div className="rank">{String(index + 1).padStart(2, "0")}</div>
            <div>
              <span className="focus">{match.focus}</span>
              <div className="match-name">{match.home} — {match.away}</div>
              <div className="match-meta">{kickoff(match.kickoff)} ICT · {match.competition}</div>
            </div>
            <div>
              <div className="match-name">{match.structuralFamily}</div>
              <div className="evidence">{match.evidenceSummary}</div>
            </div>
            <div className="score-box">
              <strong>{match.preScore.toFixed(1)}</strong>
              <span>{match.stage.replaceAll("_", " ")}</span>
            </div>
          </Link>
        ))}
      </section>

      {mode === "DEMO" && (
        <div className="notice">
          This is the first clean website slice. It is running with canonical historical controls while the live football-provider adapter is connected next.
          Set <code>FOOTBALL_FIXTURES_JSON_URL</code> to switch the board to a normalized live feed without changing the UI.
        </div>
      )}

      <footer>
        <span>{MODEL.version} · {MODEL.regime}</span>
        <span>Structure before price · Recent-total confirmation ACTIVE · Sep-1 hardening INACTIVE</span>
      </footer>
    </main>
  );
}
