import { ManualPreHandoff } from "@/components/ManualPreHandoff";
import { currentIctDate, getCurrentModelBoard } from "@/lib/model-board";
import { MODEL } from "@/lib/model";

export const maxDuration = 300;

export default async function Home({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const params = await searchParams;
  const date = params.date || currentIctDate();
  const board = await getCurrentModelBoard(date);
  const candidateViews = board.candidates.map((match) => ({
    id: match.id,
    home: match.home,
    away: match.away,
    competition: match.competition,
    kickoff: match.kickoff
  }));

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
          <span className="eyebrow">Daily slate · ICT</span>
          <h2>BSD gathers the evidence. ChatGPT makes the model call.</h2>
          <p>
            The website now uses BSD for fixtures and historical evidence only. The broad retrieval pass is not an official model board. Copy the generated packet into this Football ChatGPT project, then paste the JSON shortlist back here.
          </p>
          <form className="date-form" method="get">
            <label>Board date <input type="date" name="date" defaultValue={date} /></label>
            <button type="submit">Load evidence</button>
          </form>
        </div>
        <div className="summary">
          <div><span>Scanned</span><strong>{board.scannedCount}</strong></div>
          <div><span>Retrieval</span><strong>{board.candidateCount}</strong></div>
          <div><span>Official PRE</span><strong>Manual</strong></div>
          <div><span>Min price</span><strong>{MODEL.minimumOverPrice.toFixed(2)}</strong></div>
        </div>
      </section>

      <div className="section-head">
        <div>
          <h3>Current-model handoff · {date}</h3>
          <p>{board.rankingEngine}. Retrieval scores are recall aids only and are not displayed as picks.</p>
        </div>
        <span className="status-pill">BSD → CHATGPT PRE → XI → SCREENSHOT → CHATGPT VERDICT</span>
      </div>

      <ManualPreHandoff packet={board.handoffPacket} candidates={candidateViews} />

      {board.mode === "DEMO" && (
        <div className="notice">
          BSD is not active in this runtime, so the site is using canonical demo controls rather than fabricating live data.
        </div>
      )}

      <footer>
        <span>{MODEL.version} · {MODEL.regime}</span>
        <span>BSD evidence · Manual ChatGPT reasoning · Screenshot-only market · No OpenAI API required</span>
      </footer>
    </main>
  );
}
