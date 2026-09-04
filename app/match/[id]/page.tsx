import Link from "next/link";
import { notFound } from "next/navigation";
import { OddsWorkspace } from "@/components/OddsWorkspace";
import { getMatch } from "@/lib/data";
import { MODEL } from "@/lib/model";

function kickoff(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: MODEL.timezone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function number(value: number | undefined) {
  return value === undefined ? "—" : value.toFixed(2);
}

function percent(value: number | undefined) {
  return value === undefined ? "—" : `${Math.round(value * 100)}%`;
}

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { mode, match } = await getMatch(id);
  if (!match) notFound();

  const stageOrder = ["PRE", "XI", "MARKET", "VERDICT", "SETTLED"];
  const doneThrough = match.stage === "SETTLED" ? 5 : match.stage.includes("LOCK") ? 4 : match.lineupStatus === "confirmed" ? 2 : 1;

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">F1</div>
          <div><small>Decision control</small><h1>Football v1.0</h1></div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span className="mode-pill">{mode} PROVIDER</span>
          <span className="model-pill"><i className="live-dot" />{MODEL.version} · {MODEL.regime}</span>
        </div>
      </header>

      <section className="match-header">
        <Link href="/" className="back">← Daily board</Link>
        <div className="match-title">
          <div>
            <span className="eyebrow">{match.competition} · {kickoff(match.kickoff)} ICT</span>
            <h2>{match.home}<br />{match.away}</h2>
            {match.providerEventId && <p className="muted">BSD event #{match.providerEventId}</p>}
          </div>
          <div className={`verdict ${match.verdict.toLowerCase()}`}>
            <span>Current verdict</span>
            <strong>{match.verdict}{match.preferredLine ? ` · O${match.preferredLine}` : ""}</strong>
            {match.preferredOdds && <p className="muted">@ {match.preferredOdds.toFixed(2)}</p>}
          </div>
        </div>
      </section>

      <nav className="process">
        {stageOrder.map((stage, index) => (
          <div className={index < doneThrough ? "done" : ""} key={stage}>
            <span>0{index + 1}</span><strong>{stage}</strong>
          </div>
        ))}
      </nav>

      <div className="detail-grid">
        <div>
          <section className="card">
            <span className="kicker">PRE freeze</span>
            <h3>{match.structuralFamily}</h3>
            <div className="route-grid">
              <div className="metric"><span>Carrier route</span><strong>{match.carrier}</strong></div>
              <div className="metric"><span>Secondary route</span><strong>{match.secondaryRoute}</strong></div>
              <div className="metric"><span>Failure-mode resistance</span><strong>{match.failureModeResistance}</strong></div>
              <div className="metric"><span>Structural score</span><strong>{match.preScore.toFixed(1)}{match.structuralGrade ? ` · ${match.structuralGrade}` : ""}</strong></div>
            </div>
            <p className="reason">{match.evidenceSummary}</p>
            {match.failureModes?.length ? <ul className="reason">{match.failureModes.map((mode) => <li key={mode}>{mode}</li>)}</ul> : null}
          </section>

          <section className="card">
            <span className="kicker">XI stage</span>
            <h3>Confirmed lineup check</h3>
            <div className="xi">
              <div className="metric">
                <span>{match.home}{match.homeFormation ? ` · ${match.homeFormation}` : ""}</span>
                {match.homeXI.length ? <ul>{match.homeXI.map((item) => <li key={item}>{item}</li>)}</ul> : <strong>Waiting for confirmed XI</strong>}
              </div>
              <div className="metric">
                <span>{match.away}{match.awayFormation ? ` · ${match.awayFormation}` : ""}</span>
                {match.awayXI.length ? <ul>{match.awayXI.map((item) => <li key={item}>{item}</li>)}</ul> : <strong>Waiting for confirmed XI</strong>}
              </div>
            </div>
            <p className="reason">Status: <strong>{match.lineupStatus.toUpperCase()}</strong>. {match.xiNote}</p>
          </section>

          <section className="card">
            <span className="kicker">Market</span>
            <h3>Asian-total screenshot</h3>
            {match.offers.length ? (
              <table className="odds-table">
                <thead><tr><th>Line</th><th>Over price</th><th>Model</th></tr></thead>
                <tbody>
                  {match.offers.map((offer) => {
                    const preferred = offer.line === match.preferredLine && offer.odds === match.preferredOdds;
                    return <tr key={`${offer.line}-${offer.odds}`}><td>O{offer.line}</td><td>{offer.odds.toFixed(2)}</td><td className={preferred ? "preferred" : ""}>{preferred ? "PREFERRED" : "—"}</td></tr>;
                  })}
                </tbody>
              </table>
            ) : <p className="reason">No bookmaker prices are imported from BSD. Market input starts from the screenshot below.</p>}
            <p className="reason">{match.verdictReason}</p>
            <OddsWorkspace matchHome={match.home} matchAway={match.away} />
          </section>
        </div>

        <aside>
          <section className="card">
            <span className="kicker">Team profile</span>
            <h3>Mandatory GF / GA</h3>
            <div className="profile-grid">
              <div className="metric"><span>{match.home} GF</span><strong>{number(match.homeProfile.gf)}</strong></div>
              <div className="metric"><span>{match.home} GA</span><strong>{number(match.homeProfile.ga)}</strong></div>
              <div className="metric"><span>{match.away} GF</span><strong>{number(match.awayProfile.gf)}</strong></div>
              <div className="metric"><span>{match.away} GA</span><strong>{number(match.awayProfile.ga)}</strong></div>
              <div className="metric"><span>{match.home} scores 2+</span><strong>{percent(match.homeProfile.scoringTwoPlusRate)}</strong></div>
              <div className="metric"><span>{match.away} scores 2+</span><strong>{percent(match.awayProfile.scoringTwoPlusRate)}</strong></div>
              <div className="metric"><span>Home history</span><strong>{match.homeProfile.sampleCount ?? "—"}</strong></div>
              <div className="metric"><span>Away history</span><strong>{match.awayProfile.sampleCount ?? "—"}</strong></div>
            </div>
          </section>

          <section className="card">
            <span className="kicker">Model guardrails</span>
            <h3>Current rules</h3>
            <ul className="reason">
              {MODEL.principles.map((rule) => <li key={rule}>{rule}</li>)}
            </ul>
          </section>

          {match.result && (
            <section className="card">
              <span className="kicker">Regulation result</span>
              <h3>{match.result}</h3>
              {match.pnl !== undefined && <p className="reason">P/L: <strong className={match.pnl > 0 ? "preferred" : ""}>{match.pnl.toFixed(2)}u</strong></p>}
            </section>
          )}
        </aside>
      </div>

      <footer>
        <span>{MODEL.version} · {MODEL.regime}</span>
        <span>PRE → confirmed XI → screenshot market → verdict → settlement</span>
      </footer>
    </main>
  );
}
