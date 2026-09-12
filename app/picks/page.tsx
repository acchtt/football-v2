import { AirtableError, records, selectName, TABLES } from "@/lib/airtable";
import { fetchBsdFinalScores, getBsdScore, isBsdConfigured, splitFixtureName } from "@/lib/bsd";
import { fetchManualScores, getManualScore } from "@/lib/manual-scores";

export const dynamic = "force-dynamic";

type Row = {
  "Pick ID"?: string;
  Match?: string;
  Competition?: string;
  Kickoff?: string;
  "Model Version"?: string;
  Verdict?: unknown;
  Line?: number;
  Odds?: number;
  "Stake u"?: number;
  Result?: unknown;
  "P/L u"?: number;
  "Recorded At"?: string;
  Reason?: string;
};

type SearchParams = Promise<{
  date?: string;
  result?: string;
  competition?: string;
  model?: string;
  q?: string;
}>;

const FIELDS = [
  "Pick ID", "Match", "Competition", "Kickoff", "Model Version", "Verdict",
  "Line", "Odds", "Stake u", "Result", "P/L u", "Recorded At", "Reason"
];

const ZONE = "Asia/Ho_Chi_Minh";

function timestamp(value?: string) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateKey(value: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function normalize(value = "") {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function formatICT(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function units(value?: number) {
  if (value === undefined) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(2)}u`;
}

function resultTone(result: string) {
  if (result === "WIN" || result === "HALF WIN") return "lime";
  if (result === "LOSS" || result === "HALF LOSS") return "red";
  return "cyan";
}

function returnTo(filters: Awaited<SearchParams>) {
  const params = new URLSearchParams();
  if (filters.date) params.set("date", filters.date);
  if (filters.result) params.set("result", filters.result);
  if (filters.competition) params.set("competition", filters.competition);
  if (filters.model) params.set("model", filters.model);
  if (filters.q) params.set("q", filters.q);
  const query = params.toString();
  return query ? `/picks?${query}` : "/picks";
}

function Notice({ message }: { message: string }) {
  return (
    <main className="wrap">
      <div className="notice">
        <div className="eyebrow cyan">AIRTABLE / SERVER STATUS</div>
        <h2>Picks could not load</h2>
        <p>{message}</p>
      </div>
    </main>
  );
}

export default async function PicksPage({ searchParams }: { searchParams: SearchParams }) {
  try {
    const filters = await searchParams;
    const dateFilter = filters.date || "";
    const resultFilter = filters.result || "ALL";
    const competitionFilter = filters.competition || "ALL";
    const modelFilter = filters.model || "ALL";
    const query = normalize(filters.q || "");
    const scoreReturnTo = returnTo(filters);

    const allPicks = await records<Row>(TABLES.picks, FIELDS, { field: "Recorded At", direction: "desc" });
    const datedPicks = allPicks
      .filter((pick) => timestamp(pick.fields.Kickoff) > 0 && timestamp(pick.fields["Recorded At"] || pick.fields.Kickoff) > 0)
      .sort((a, b) => timestamp(b.fields["Recorded At"] || b.fields.Kickoff) - timestamp(a.fields["Recorded At"] || a.fields.Kickoff));

    const competitions = [...new Set(datedPicks.map((pick) => pick.fields.Competition).filter((value): value is string => Boolean(value)))].sort();
    const models = [...new Set(datedPicks.map((pick) => pick.fields["Model Version"]).filter((value): value is string => Boolean(value)))].sort().reverse();
    const results = [...new Set(datedPicks.map((pick) => selectName(pick.fields.Result) || "PENDING"))].sort();

    const picks = datedPicks.filter((pick) => {
      const row = pick.fields;
      const kickoff = row.Kickoff as string;
      const result = selectName(row.Result) || "PENDING";
      if (dateFilter && dateKey(kickoff) !== dateFilter) return false;
      if (resultFilter !== "ALL" && result !== resultFilter) return false;
      if (competitionFilter !== "ALL" && row.Competition !== competitionFilter) return false;
      if (modelFilter !== "ALL" && row["Model Version"] !== modelFilter) return false;
      if (query && !normalize(`${row.Match || ""} ${row.Competition || ""} ${row.Reason || ""}`).includes(query)) return false;
      return true;
    });

    const scoreFixtures = picks.flatMap((pick) => {
      const match = pick.fields.Match;
      const kickoff = pick.fields.Kickoff;
      return match && kickoff ? [{ match, kickoff }] : [];
    });
    const [finalScores, manualScores] = await Promise.all([
      fetchBsdFinalScores(scoreFixtures),
      fetchManualScores()
    ]);

    const settled = picks.filter((pick) => selectName(pick.fields.Result) && selectName(pick.fields.Result) !== "PENDING");
    const stake = settled.reduce((sum, pick) => sum + (pick.fields["Stake u"] || 0), 0);
    const profit = settled.reduce((sum, pick) => sum + (pick.fields["P/L u"] || 0), 0);
    const pending = picks.length - settled.length;
    const roi = stake ? (profit / stake) * 100 : 0;

    return (
      <main className="wrap">
        <div>
          <div className="eyebrow cyan">OFFICIAL WEBSITE PICKS</div>
          <h1>History</h1>
          <p className="sub">Newest records first. Manual final scores override BSD here and on the Schedule page.</p>
        </div>

        <div className="metrics" style={{ marginTop: 24 }}>
          <div className="stat"><small>TOTAL PICKS</small><strong>{picks.length}</strong></div>
          <div className="stat"><small>SETTLED</small><strong>{settled.length}</strong></div>
          <div className="stat"><small>PENDING</small><strong>{pending}</strong></div>
          <div className="stat lime"><small>P/L</small><strong>{units(profit)}</strong></div>
          <div className="stat cyan"><small>ROI</small><strong>{roi >= 0 ? "+" : ""}{roi.toFixed(1)}%</strong></div>
        </div>

        <form className="filters" method="get">
          <div className="filterSearch">
            <label htmlFor="q">Search</label>
            <input id="q" name="q" type="search" defaultValue={filters.q || ""} placeholder="Match, competition or reason" />
          </div>
          <div>
            <label htmlFor="date">Match date</label>
            <input id="date" name="date" type="date" defaultValue={dateFilter} />
          </div>
          <div>
            <label htmlFor="result">Result</label>
            <select id="result" name="result" defaultValue={resultFilter}>
              <option value="ALL">All results</option>
              {results.map((result) => <option key={result} value={result}>{result}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="competition">Competition</label>
            <select id="competition" name="competition" defaultValue={competitionFilter}>
              <option value="ALL">All competitions</option>
              {competitions.map((competition) => <option key={competition} value={competition}>{competition}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="model">Model</label>
            <select id="model" name="model" defaultValue={modelFilter}>
              <option value="ALL">All models</option>
              {models.map((model) => <option key={model} value={model}>{model}</option>)}
            </select>
          </div>
          <div className="filterActions">
            <button className="filterButton" type="submit">Apply</button>
            <a className="filterReset" href="/picks">Reset</a>
          </div>
        </form>

        <div className="resultCount">
          Showing {picks.length} of {datedPicks.length} dated picks
          <span className={`syncState ${isBsdConfigured() ? "on" : "off"}`}>BSD scores {isBsdConfigured() ? "on" : "off"}</span>
        </div>

        {picks.length === 0 ? (
          <div className="empty">No picks match the current filters.</div>
        ) : (
          picks.map((pick) => {
            const row = pick.fields;
            const kickoff = row.Kickoff as string;
            const recordedAt = (row["Recorded At"] || kickoff) as string;
            const match = row.Match || "Unknown fixture";
            const teams = splitFixtureName(match);
            const manualScore = getManualScore(manualScores, match, kickoff);
            const bsdScore = getBsdScore(finalScores, match, kickoff);
            const score = manualScore || bsdScore;
            const scoreSource = manualScore ? "MANUAL" : bsdScore ? "FT" : "SCORE";
            const result = selectName(row.Result) || "PENDING";
            const verdict = selectName(row.Verdict);

            return (
              <details className="card pickCard" key={pick.id}>
                <summary className="pickReadable">
                  <div className="pickIdentity">
                    <div className="meta">{formatICT(kickoff)} · {row.Competition || "Unknown competition"}</div>
                    {teams ? (
                      <div className="teamStack compact">
                        <div className="teamRow"><span className="sideLabel">HOME</span><strong>{teams.home}</strong></div>
                        <div className="teamRow"><span className="sideLabel">AWAY</span><strong>{teams.away}</strong></div>
                      </div>
                    ) : (
                      <div className="match">{match}</div>
                    )}
                    <div className="pickTags">
                      {verdict && <span className="badge cyan">{verdict}</span>}
                      {row["Model Version"] && <span className="badge">{row["Model Version"]}</span>}
                    </div>
                  </div>

                  <div className={`scoreBlock ${score ? "final" : "pending"} ${manualScore ? "manual" : ""}`}>
                    <span>{scoreSource}</span>
                    <strong>{score ? `${score.home}–${score.away}` : "—"}</strong>
                  </div>

                  <div className="betBlock">
                    <span className="betLabel">SELECTION</span>
                    <strong>O{row.Line ?? "—"} <em>@ {row.Odds ?? "—"}</em></strong>
                    <div className="betOutcome">
                      <span className={`badge ${resultTone(result)}`}>{result}</span>
                      <span className="plValue">{units(row["P/L u"])}</span>
                    </div>
                  </div>
                </summary>

                <div className="detail">
                  <div className="detailStrip">
                    <span><small>STAKE</small><strong>{row["Stake u"] ?? "—"}u</strong></span>
                    <span><small>RECORDED</small><strong>{formatICT(recordedAt)}</strong></span>
                    {manualScore && <span><small>SCORE SOURCE</small><strong>MANUAL</strong></span>}
                    {!manualScore && bsdScore && <span><small>BSD EVENT</small><strong>#{bsdScore.eventId}</strong></span>}
                  </div>

                  <div className="scoreEditor">
                    <div>
                      <div className="label">MANUAL FINAL SCORE</div>
                      <p>Save an override here and it will also appear on Schedule.</p>
                    </div>
                    <form className="scoreForm" method="post" action="/api/manual-score">
                      <input type="hidden" name="match" value={match} />
                      <input type="hidden" name="kickoff" value={kickoff} />
                      <input type="hidden" name="returnTo" value={scoreReturnTo} />
                      <label>
                        <span>{teams?.home || "Home"}</span>
                        <input name="home" type="number" min="0" max="99" step="1" required defaultValue={manualScore?.home ?? bsdScore?.home ?? ""} aria-label="Home score" />
                      </label>
                      <span className="scoreDash">–</span>
                      <label>
                        <span>{teams?.away || "Away"}</span>
                        <input name="away" type="number" min="0" max="99" step="1" required defaultValue={manualScore?.away ?? bsdScore?.away ?? ""} aria-label="Away score" />
                      </label>
                      <button className="scoreSave" type="submit" name="action" value="save">Save score</button>
                      {manualScore && <button className="scoreClear" type="submit" name="action" value="clear" formNoValidate>Use BSD</button>}
                    </form>
                  </div>

                  {row.Reason && <><div className="label" style={{ marginTop: 16 }}>DECISION REASON</div><p>{row.Reason}</p></>}
                </div>
              </details>
            );
          })
        )}
      </main>
    );
  } catch (error) {
    return <Notice message={error instanceof AirtableError ? error.message : error instanceof Error ? error.message : "Unknown server error"} />;
  }
}
