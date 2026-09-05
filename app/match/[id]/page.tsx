import Link from "next/link";
import { notFound } from "next/navigation";
import { OddsVerdict } from "@/components/OddsVerdict";
import { fetchPublishedMatchLineup, isBsdConfigured } from "@/lib/bsd";
import { getPublishedMatch, getPublishedState } from "@/lib/published";
import type { BsdLineup } from "@/lib/types";
import { evaluateXi } from "@/lib/verdict";

export const dynamic = "force-dynamic";

function kickoff(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const match = getPublishedMatch(id);
  if (!match) notFound();
  const state = getPublishedState();
  const unavailable: BsdLineup = { status: "unavailable", homeStarting: [], awayStarting: [] };
  const lineup: BsdLineup = isBsdConfigured()
    ? await fetchPublishedMatchLineup(match).catch(() => unavailable)
    : unavailable;
  const xi = evaluateXi(match, lineup);

  return (
    <main className="shell">
      <header className="topbar">
        <div><Link href="/" className="back">← Published board</Link><h1>Match execution</h1></div>
        <div className="header-pills"><span className="pill">{state.model.version}</span><span className={`pill ${xi.ready ? "live" : ""}`}>{xi.status.replaceAll("_", " ")}</span></div>
      </header>

      <section className="match-hero">
        <div>
          <span className="eyebrow">{match.focus} · {match.competition}</span>
          <h2>{match.home}<br /><span>vs</span> {match.away}</h2>
          <p>{kickoff(match.kickoff)} ICT</p>
        </div>
        <div className="stage-card">
          <span>Current stage</span>
          <strong>{xi.status === "WAITING_XI" ? "WAITING FOR XI" : xi.status === "XI_HOLD" ? "XI HOLD" : "READY FOR ODDS"}</strong>
          <small>{lineup.eventId ? `BSD event #${lineup.eventId}` : "BSD match resolution pending"}</small>
        </div>
      </section>

      <section className="detail-grid">
        <div className="stack">
          <section className="panel">
            <span className="eyebrow">Published PRE packet</span>
            <h3>{match.research.summary}</h3>
            <div className="research-grid">
              <div><span>Carrier</span><strong>{match.research.carrier}</strong></div>
              <div><span>Secondary route</span><strong>{match.research.secondary_route}</strong></div>
              <div><span>Failure resistance</span><strong>{match.research.failure_mode_resistance}</strong></div>
              <div><span>Recent confirmation</span><strong>{match.research.recent_confirmation}</strong></div>
            </div>
            {match.research.sources.length > 0 && (
              <div className="sources"><span>Research sources</span>{match.research.sources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" key={source.url}>{source.label}</a>)}</div>
            )}
          </section>

          <section className="panel">
            <div className="panel-head"><div><span className="eyebrow">BSD lineup</span><h3>Confirmed XI check</h3></div><a className="refresh" href={`/match/${match.slug}`}>Refresh XI</a></div>
            <div className="lineup-grid">
              <div><span>{match.home}{lineup.homeFormation ? ` · ${lineup.homeFormation}` : ""}</span>{lineup.homeStarting.length ? <ol>{lineup.homeStarting.map((name) => <li key={name}>{name}</li>)}</ol> : <p>Waiting for confirmed XI.</p>}</div>
              <div><span>{match.away}{lineup.awayFormation ? ` · ${lineup.awayFormation}` : ""}</span>{lineup.awayStarting.length ? <ol>{lineup.awayStarting.map((name) => <li key={name}>{name}</li>)}</ol> : <p>Waiting for confirmed XI.</p>}</div>
            </div>
            <div className="requirements">
              <span>Published XI requirements</span>
              {xi.requirements.length ? xi.requirements.map((rule) => (
                <div className={rule.present ? "requirement pass" : rule.required ? "requirement fail" : "requirement"} key={`${rule.side}-${rule.player}`}>
                  <b>{rule.present ? "✓" : rule.required ? "×" : "○"}</b><span>{rule.side.toUpperCase()} · {rule.player}</span><small>{rule.reason}</small>
                </div>
              )) : <p>No player-specific requirement was published; confirmed XI is the gate.</p>}
            </div>
          </section>

          <section className="panel">
            <span className="eyebrow">Market policy</span>
            <h3>Published line / price ladder</h3>
            <div className="policy-table">
              {match.market_policy.choices.slice().sort((a, b) => a.priority - b.priority).map((choice) => (
                <div key={`${choice.line}-${choice.priority}`}><b>#{choice.priority}</b><strong>O{choice.line}</strong><span>{choice.min_odds.toFixed(2)}–{(choice.max_odds ?? match.market_policy.max_price).toFixed(2)}</span><small>{choice.note || "Eligible published burden"}</small></div>
              ))}
            </div>
            <p className="muted">Global price window {match.market_policy.min_price.toFixed(2)}–{match.market_policy.max_price.toFixed(2)}. The website cannot choose a line that ChatGPT did not publish here.</p>
          </section>

          <OddsVerdict match={match} xi={xi} />
        </div>

        <aside className="stack">
          <section className="panel compact"><span className="eyebrow">Control</span><h3>Immutable flow</h3><ol className="flow-list"><li className="done">Chat research</li><li className="done">PRE published</li><li className={lineup.status === "confirmed" ? "done" : ""}>BSD confirmed XI</li><li>Your odds image</li><li>Website LOCK / HOLD</li></ol></section>
          <section className="panel compact"><span className="eyebrow">Model</span><h3>{state.model.version}</h3><p>{state.model.regime}. Structure is decided in chat before publication. Website execution cannot promote structure or invent a market burden.</p></section>
        </aside>
      </section>

      <footer><span>Published from chat · Executed on website</span><span>{state.model.version} · {state.model.regime}</span></footer>
    </main>
  );
}
