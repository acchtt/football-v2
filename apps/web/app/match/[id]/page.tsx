import Link from "next/link";

import { MatchWorkbench } from "@/components/MatchWorkbench";
import { getMatchDetail } from "@/lib/api";

function time(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function metric(value: unknown): string {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : "—";
}

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const detail = await getMatchDetail(id);
    const profile = detail.profile;
    return (
      <main className="match-page">
        <header className="match-topbar">
          <Link href="/" className="back-link">← Daily board</Link>
          <span>Engine {detail.frozen.model_version}</span>
        </header>

        <section className="match-hero">
          <div>
            <p className="eyebrow">{detail.fixture.competition} · {time(detail.fixture.kickoff_ict)} ICT</p>
            <h1>{detail.fixture.home_team}<span>—</span>{detail.fixture.away_team}</h1>
          </div>
          <div className="frozen-stamp">
            <span>PRE FREEZE</span>
            <strong>{detail.frozen.grade}</strong>
            <p>{detail.frozen.structural_type.replaceAll("_", " ")}</p>
            <small>Score {detail.frozen.structural_score.toFixed(1)}</small>
          </div>
        </section>

        <nav className="process-track" aria-label="Decision process">
          <div className="complete"><span>01</span><strong>Pre freeze</strong></div>
          <div className={detail.latest_lineup ? "complete" : "active"}><span>02</span><strong>XI rerank</strong></div>
          <div className={detail.latest_odds ? "complete" : undefined}><span>03</span><strong>Goal burden</strong></div>
          <div className={detail.decision_history.length ? "complete" : undefined}><span>04</span><strong>Verdict</strong></div>
          <div><span>05</span><strong>Settlement</strong></div>
        </nav>

        <div className="match-layout">
          <div className="workbench-column">
            <MatchWorkbench
              key={`${detail.latest_lineup?.id ?? "none"}-${detail.latest_odds?.id ?? "none"}`}
              detail={detail}
            />
          </div>
          <aside>
            <section className="side-card">
              <span className="card-kicker">Frozen profile</span>
              <h3>GF / GA gate</h3>
              {profile ? (
                <div className="profile-table">
                  <div><span>Home GF</span><strong>{profile.home_gf?.toFixed(2) ?? "—"}</strong></div>
                  <div><span>Home GA</span><strong>{profile.home_ga?.toFixed(2) ?? "—"}</strong></div>
                  <div><span>Away GF</span><strong>{profile.away_gf?.toFixed(2) ?? "—"}</strong></div>
                  <div><span>Away GA</span><strong>{profile.away_ga?.toFixed(2) ?? "—"}</strong></div>
                  <div><span>Home 2+</span><strong>{metric(profile.scoring_2plus_frequency.home)}</strong></div>
                  <div><span>Away 2+</span><strong>{metric(profile.scoring_2plus_frequency.away)}</strong></div>
                </div>
              ) : <p className="muted-copy">Profile data unavailable. Final verdict must HOLD.</p>}
            </section>

            <section className="side-card">
              <span className="card-kicker">How it fails</span>
              <h3>Failure modes</h3>
              <ul className="failure-list">
                {detail.frozen.failure_modes.map((mode) => <li key={mode}>{mode}</li>)}
              </ul>
            </section>

            <section className="side-card timeline-card">
              <span className="card-kicker">Immutable record</span>
              <h3>Decision history</h3>
              <div className="decision-timeline">
                <div><span>PRE</span><p>Structural {detail.frozen.grade} frozen</p></div>
                {detail.decision_history.map((decision) => (
                  <div key={decision.id}>
                    <span>{decision.period}</span>
                    <p>{decision.verdict} · {decision.grade}</p>
                    <small>{time(decision.created_at)} ICT</small>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </main>
    );
  } catch {
    return (
      <main className="error-page">
        <Link href="/" className="back-link">← Daily board</Link>
        <section className="error-card">
          <span>DATA UNAVAILABLE</span>
          <h2>This frozen match could not be loaded.</h2>
          <p>No decision has been created. Return to the daily board and try again.</p>
        </section>
      </main>
    );
  }
}

