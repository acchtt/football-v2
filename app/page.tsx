import Link from "next/link";
import { currentIctDate, getMatches } from "@/lib/data";
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

export default async function Home({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const params = await searchParams;
  const date = params.date || currentIctDate();
  const { mode, matches } = await getMatches(date);
  const ranked = [...matches].sort((a, b) => b.preScore - a.preScore || new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
  const locked = ranked.filter((match) => match.verdict === "LOCK").length;
  const actionable = ranked.filter((match) => ["TOP FOCUS", "STRONG FOCUS", "SECONDARY"].includes(match.focus)).length;

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
            BSD supplies fixtures and historical team evidence. The current model ranks structure first; confirmed XI and your bookmaker screenshot come later. BSD odds are not used for the verdict.
          </p>
          <form className="date-form" method="get">
            <label>Board date <input type="date" name="date" defaultValue={date} /></label>
            <button type="submit">Load board</button>
          </form>
        </div>
        <div className="summary">
          <div><span>Eligible</span><strong>{ranked.length}</strong></div>
          <div><span>Focus</span><strong>{actionable}</strong></div>
          <div><span>Locks</span><strong>{locked}</strong></div>
          <div><span>Min price</span><strong>{MODEL.minimumOverPrice.toFixed(2)}</strong></div>
        </div>
      </section>

      <div className="section-head">
        <div>
          <h3>Structural board · {date}</h3>
          <p>Strongest over-friendly structures first. Missing mandatory profile evidence stays PASS-FIRST.</p>
        </div>
        <span className="status-pill">PRE → XI → SCREENSHOT → VERDICT</span>
      </div>

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
              <div className="match-name">{match.structuralFamily}{match.structuralGrade ? ` · ${match.structuralGrade}` : ""}</div>
              <div className="evidence">{match.evidenceSummary}</div>
            </div>
            <div className="score-box">
              <strong>{match.preScore.toFixed(1)}</strong>
              <span>{match.stage.replaceAll("_", " ")}</span>
            </div>
          </Link>
        )) : (
          <div className="notice">No eligible fixtures were returned for this ICT date.</div>
        )}
      </section>

      {mode === "DEMO" && (
        <div className="notice">
          BSD is wired but no <code>BSD_API_TOKEN</code> is configured in this runtime, so the board is using the three canonical demo controls. Add the token and reload; no code change is required.
        </div>
      )}

      <footer>
        <span>{MODEL.version} · {MODEL.regime}</span>
        <span>BSD data · Screenshot-only market · Recent-total confirmation ACTIVE · Sep-1 hardening INACTIVE</span>
      </footer>
    </main>
  );
}
