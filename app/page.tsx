import Link from "next/link";
import { currentIctDate, getCurrentModelBoard } from "@/lib/model-board";
import { MODEL } from "@/lib/model";

export const maxDuration = 300;

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

export default async function Home({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const params = await searchParams;
  const date = params.date || currentIctDate();
  const board = await getCurrentModelBoard(date);
  const ranked = board.matches;

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
          <span className="mode-pill">{board.mode} PROVIDER</span>
          <span className="model-pill"><i className="live-dot" />{MODEL.version} · {MODEL.regime}</span>
        </div>
      </header>

      <section className="hero">
        <div>
          <span className="eyebrow">Daily ranked slate · ICT</span>
          <h2>Find the matches worth opening before looking at price.</h2>
          <p>
            BSD supplies fixtures and PRE evidence. A broad mechanical retrieval pass keeps recall high; the current {MODEL.version} reasoning model then produces the selective shortlist. Retrieval scores cannot promote a match by themselves.
          </p>
          <form className="date-form" method="get">
            <label>Board date <input type="date" name="date" defaultValue={date} /></label>
            <button type="submit">Load board</button>
          </form>
        </div>
        <div className="summary">
          <div><span>Scanned</span><strong>{board.scannedCount}</strong></div>
          <div><span>Retrieval</span><strong>{board.candidateCount}</strong></div>
          <div><span>Shortlist</span><strong>{ranked.length}</strong></div>
          <div><span>Min price</span><strong>{MODEL.minimumOverPrice.toFixed(2)}</strong></div>
        </div>
      </section>

      <div className="section-head">
        <div>
          <h3>Current-model PRE shortlist · {date}</h3>
          <p>{board.rankingEngine}. Structure first; recent totals/leakage confirm but cannot create focus. Missing confirmation lowers priority.</p>
        </div>
        <span className="status-pill">PRE → XI → SCREENSHOT → VERDICT</span>
      </div>

      {!board.modelReady && (
        <div className="notice">
          <strong>PRE ranking is fail-closed.</strong> {board.rankingError || "The current-model reasoning service is unavailable."}
        </div>
      )}

      <section className="board">
        {ranked.length ? ranked.map((match, index) => (
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
              <strong>PRE</strong>
              <span>{match.stage.replaceAll("_", " ")}</span>
            </div>
          </Link>
        )) : board.modelReady ? (
          <div className="notice">The current model returned no PRE matches worth opening for this ICT date.</div>
        ) : null}
      </section>

      {board.mode === "DEMO" && (
        <div className="notice">
          BSD is not active in this runtime, so the site is using canonical demo controls rather than fabricating live data.
        </div>
      )}

      <footer>
        <span>{MODEL.version} · {MODEL.regime}</span>
        <span>BSD evidence · GPT current-model PRE reasoning · Screenshot-only market · Sep-1 hardening INACTIVE</span>
      </footer>
    </main>
  );
}
