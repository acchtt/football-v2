import Link from "next/link";

import { getDailyBoard } from "@/lib/api";
import type { BoardMatch, DailyBoard } from "@/lib/types";

function kickoff(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function calendarDate(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(`${value}T12:00:00+07:00`));
}

function typeLabel(value: BoardMatch["structural_type"]): string {
  const labels = {
    TWO_SIDED: "Two-Sided",
    ELITE_CARRIER: "Elite Carrier",
    CARRIER_SECONDARY_ROUTE: "Carrier + secondary route",
  } as const;
  return labels[value];
}

function Grade({ value }: { value: BoardMatch["frozen_grade"] }) {
  return <span className={`grade grade-${value.replace("+", "plus")}`}>{value}</span>;
}

function EmptyBoard() {
  return (
    <div className="empty-state">
      <span className="empty-mark">0</span>
      <div>
        <h2>No matches cleared the structural filter</h2>
        <p>The engine preferred no bet over an incomplete or fragile route.</p>
      </div>
    </div>
  );
}

function BoardTable({ matches }: { matches: BoardMatch[] }) {
  return (
    <div className="table-shell">
      <table>
        <thead>
          <tr>
            <th scope="col">Rank</th>
            <th scope="col">ICT kickoff</th>
            <th scope="col">Match</th>
            <th scope="col">Frozen assessment</th>
            <th scope="col" className="score-heading">Score</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((match) => (
            <tr key={match.fixture_id} className={match.is_next ? "next-row" : undefined}>
              <td className="rank-cell">
                <span>{String(match.rank).padStart(2, "0")}</span>
                {match.is_next && <span className="next-tag">NEXT</span>}
              </td>
              <td className="kickoff-cell">{kickoff(match.kickoff_ict)}</td>
              <td>
                <Link href={`/match/${match.fixture_id}`} className="match-link">
                <div className="match-name">
                  <strong>{match.home_team}</strong>
                  <span>vs</span>
                  <strong>{match.away_team}</strong>
                </div>
                <span className="competition">{match.competition}</span>
                </Link>
              </td>
              <td>
                <div className="assessment-cell">
                  <Grade value={match.frozen_grade} />
                  <div>
                    <strong>{typeLabel(match.structural_type)}</strong>
                    <span>{match.evidence_summary}</span>
                  </div>
                </div>
              </td>
              <td className="score-cell">{match.structural_score.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Dashboard({ board }: { board: DailyBoard }) {
  const next = board.matches.find((match) => match.is_next);
  const aGradeCount = board.matches.filter((match) => match.frozen_grade !== "B+").length;

  return (
    <main>
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true">F2</span>
          <div>
            <p>Decision control</p>
            <h1>Football v2</h1>
          </div>
        </div>
        <div className="model-pill">
          <span className="live-dot" aria-hidden="true" />
          Engine {board.model_version}
        </div>
      </header>

      <section className="board-heading">
        <div>
          <p className="eyebrow">Frozen daily shortlist</p>
          <h2>{calendarDate(board.board_date_ict)}</h2>
          <p className="subhead">
            Ranked by structural quality. Price cannot promote a weaker match.
          </p>
        </div>
        <div className="summary-strip" aria-label="Board summary">
          <div><span>Filtered</span><strong>{board.matches.length}</strong></div>
          <div><span>A-grade</span><strong>{aGradeCount}</strong></div>
          <div><span>Timezone</span><strong>ICT</strong></div>
        </div>
      </section>

      {next && (
        <section className="next-card" aria-label="Next filtered kickoff">
          <div className="next-time">
            <span>Next filtered kickoff</span>
            <strong>{kickoff(next.kickoff_ict)}</strong>
            <small>ICT · {next.competition}</small>
          </div>
          <div className="next-fixture">
            <p>{next.home_team}</p>
            <span>—</span>
            <p>{next.away_team}</p>
          </div>
          <div className="next-grade">
            <Grade value={next.frozen_grade} />
            <span>{typeLabel(next.structural_type)}</span>
          </div>
        </section>
      )}

      <section className="board-section">
        <div className="section-label">
          <h2>Structural board</h2>
          <span>PRE FREEZE</span>
        </div>
        {board.matches.length ? <BoardTable matches={board.matches} /> : <EmptyBoard />}
      </section>

      <footer>
        <p>Structure → profile → chance quality → failure modes → XI → goal burden → price</p>
        <span>Assessments are immutable after freeze.</span>
      </footer>
    </main>
  );
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date } = await searchParams;
  try {
    const board = await getDailyBoard(date);
    return <Dashboard board={board} />;
  } catch {
    return (
      <main className="error-page">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true">F2</span>
          <div><p>Decision control</p><h1>Football v2</h1></div>
        </div>
        <section className="error-card">
          <span>DATA UNAVAILABLE</span>
          <h2>The frozen board could not be loaded.</h2>
          <p>No assessment has been invented. Check the API and database, then reload.</p>
        </section>
      </main>
    );
  }
}
