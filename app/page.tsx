import Link from "next/link";
import BrandLogo from "@/components/BrandLogo";
import NextMatch from "@/components/NextMatch";
import { getPublishedMatches, getPublishedState } from "@/lib/published";

function formatKickoff(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

export default function Home() {
  const state = getPublishedState();
  const matches = getPublishedMatches();
  const topCount = matches.filter((match) => match.focus === "TOP FOCUS").length;
  const strongCount = matches.filter((match) => match.focus === "STRONG FOCUS").length;
  const secondaryCount = matches.filter((match) => match.focus === "SECONDARY").length;

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">Chat → Website control plane</span>
          <h1>Football Decision Control</h1>
        </div>
        <div className="header-pills">
          <span className="pill">{state.model.version}</span>
          <span className="pill live">BSD XI LIVE</span>
        </div>
      </header>

      <section className="hero hero-compact">
        <div>
          <span className="eyebrow">Published PRE slate</span>
          <h2>Research-backed matches, ready for execution.</h2>
          <p>ChatGPT owns slate research and PRE structure. The site takes over at confirmed XI, verified Asian-total odds, and the final LOCK / HOLD decision.</p>
        </div>
        <div className="hero-stats">
          <div className="summary-card primary-stat">
            <span>Published</span>
            <strong>{matches.length}</strong>
            <small>{state.published_at ? `Updated ${new Date(state.published_at).toLocaleString("en-GB", { timeZone: "Asia/Ho_Chi_Minh" })} ICT` : "Waiting for first chat publish"}</small>
          </div>
          <div className="focus-summary" aria-label="Published focus breakdown">
            <div><b>{topCount}</b><span>Top</span></div>
            <div><b>{strongCount}</b><span>Strong</span></div>
            <div><b>{secondaryCount}</b><span>Secondary</span></div>
          </div>
        </div>
      </section>

      <section className="flow-strip">
        <div><b>01</b><span>Research</span></div>
        <div><b>02</b><span>PRE publish</span></div>
        <div><b>03</b><span>Confirmed XI</span></div>
        <div><b>04</b><span>Verified odds</span></div>
        <div><b>05</b><span>LOCK / HOLD</span></div>
      </section>

      <NextMatch matches={matches} />

      <div className="section-head board-head">
        <div><span className="eyebrow">Active board</span><h3>Upcoming published matches</h3></div>
        <div className="board-meta">
          <span>{matches.length} matches</span>
          <span className="pill">{state.model.regime}</span>
        </div>
      </div>

      <section className="published-grid">
        {matches.map((match) => (
          <Link className="published-card" href={`/match/${match.slug}`} key={match.slug}>
            <div className="card-top">
              <span className={`focus focus-pill ${match.focus.toLowerCase().replaceAll(" ", "-")}`}>{match.focus}</span>
              <span className="kickoff kickoff-pill">{formatKickoff(match.kickoff)} ICT</span>
            </div>

            <div className="league-row">
              <BrandLogo kind="league" name={match.competition} className="league-logo" />
              <span className="competition league-name">{match.competition}</span>
            </div>

            <div className="card-matchup">
              <div className="team-row">
                <BrandLogo kind="team" name={match.home} className="team-logo" />
                <h3>{match.home}</h3>
              </div>
              <div className="versus">VS</div>
              <div className="team-row">
                <BrandLogo kind="team" name={match.away} className="team-logo" />
                <h3>{match.away}</h3>
              </div>
            </div>

            <p className="research-summary">{match.research.summary}</p>
            <div className="card-bottom">
              <span>Published PRE</span>
              <strong>Open match <span aria-hidden="true">→</span></strong>
            </div>
          </Link>
        ))}
        {!matches.length && (
          <div className="empty-state">
            <span className="eyebrow">No published matches</span>
            <h3>The board is intentionally empty.</h3>
            <p>Ask me in chat to research the upcoming matches. When I find matches worth tracking, I will publish them here automatically.</p>
          </div>
        )}
      </section>

      <footer>
        <span>ChatGPT publishes PRE · BSD supplies confirmed XI · Browser OCR reads odds</span>
        <span>{state.model.version} · {state.model.regime}</span>
      </footer>
    </main>
  );
}
