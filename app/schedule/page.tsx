import { AirtableError, records, selectName, TABLES, type Rec } from "@/lib/airtable";
import { fetchBsdFinalScores, getBsdScore, isBsdConfigured, splitFixtureName } from "@/lib/bsd";
import { fetchManualScores, getManualScore } from "@/lib/manual-scores";

export const dynamic = "force-dynamic";

type Row = {
  "Coverage ID"?: string;
  "Slate Date"?: string;
  Match?: string;
  Competition?: string;
  "Kickoff ICT"?: string;
  "Coverage Status"?: unknown;
  "PRE Grade"?: unknown;
  "Structural Type"?: unknown;
  "Board Tier"?: unknown;
  "XI Status"?: unknown;
  "Market Status"?: unknown;
  "Screened At"?: string;
  "Frozen PRE Summary"?: string;
  "Coverage Notes"?: string;
};

type SearchParams = Promise<{
  date?: string;
  tier?: string;
  grade?: string;
  competition?: string;
  q?: string;
}>;

const FIELDS = [
  "Coverage ID", "Slate Date", "Match", "Competition", "Kickoff ICT",
  "Coverage Status", "PRE Grade", "Structural Type", "Board Tier",
  "XI Status", "Market Status", "Screened At", "Frozen PRE Summary", "Coverage Notes"
];

const ZONE = "Asia/Ho_Chi_Minh";

function timestamp(value?: string) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function hasValidDate(value?: string) {
  return timestamp(value) > 0;
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

function slateDay(row: Row) {
  const slate = row["Slate Date"];
  if (slate && /^\d{4}-\d{2}-\d{2}$/.test(slate)) return slate;
  const kickoff = row["Kickoff ICT"];
  return kickoff && hasValidDate(kickoff) ? dateKey(kickoff) : "";
}

function normalize(value = "") {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function fixtureKey(row: Row) {
  return `${normalize(row.Match)}|${slateDay(row)}`;
}

function kickoffTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function dayLabelFromSlate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(new Date(`${value}T12:00:00+07:00`));
}

function returnTo(filters: Awaited<SearchParams>) {
  const params = new URLSearchParams();
  if (filters.date) params.set("date", filters.date);
  if (filters.tier) params.set("tier", filters.tier);
  if (filters.grade) params.set("grade", filters.grade);
  if (filters.competition) params.set("competition", filters.competition);
  if (filters.q) params.set("q", filters.q);
  const query = params.toString();
  return query ? `/schedule?${query}` : "/schedule";
}

function Notice({ message }: { message: string }) {
  return (
    <main className="wrap">
      <div className="notice">
        <div className="eyebrow">AIRTABLE / SERVER STATUS</div>
        <h2>Schedule could not load</h2>
        <p>{message}</p>
        <div className="code">AIRTABLE_BASE_ID=appWyZJjitSBATXAU</div>
      </div>
    </main>
  );
}

export default async function SchedulePage({ searchParams }: { searchParams: SearchParams }) {
  try {
    const filters = await searchParams;
    const dateFilter = filters.date || "";
    const tierFilter = (filters.tier || "ALL").toUpperCase();
    const gradeFilter = filters.grade || "ALL";
    const competitionFilter = filters.competition || "ALL";
    const query = normalize(filters.q || "");
    const scoreReturnTo = returnTo(filters);

    const all = await records<Row>(TABLES.coverage, FIELDS, { field: "Screened At", direction: "desc" });

    const latest = new Map<string, Rec<Row>>();
    for (const record of all.sort((a, b) =>
      timestamp(b.fields["Screened At"] || b.createdTime) - timestamp(a.fields["Screened At"] || a.createdTime)
    )) {
      const key = fixtureKey(record.fields);
      if (key.endsWith("|") || latest.has(key)) continue;
      latest.set(key, record);
    }

    const baseBoard = [...latest.values()]
      .filter((record) => ["FOCUS", "WATCHLIST"].includes(selectName(record.fields["Board Tier"])))
      .filter((record) => Boolean(slateDay(record.fields)) && hasValidDate(record.fields["Kickoff ICT"]))
      .sort((a, b) => {
        const dayCompare = slateDay(b.fields).localeCompare(slateDay(a.fields));
        return dayCompare || timestamp(b.fields["Kickoff ICT"]) - timestamp(a.fields["Kickoff ICT"]);
      });

    const competitions = [...new Set(baseBoard.map((record) => record.fields.Competition).filter((value): value is string => Boolean(value)))].sort();
    const grades = [...new Set(baseBoard.map((record) => selectName(record.fields["PRE Grade"])).filter(Boolean))].sort();

    const board = baseBoard.filter((record) => {
      const row = record.fields;
      const tier = selectName(row["Board Tier"]);
      const grade = selectName(row["PRE Grade"]);
      if (dateFilter && slateDay(row) !== dateFilter) return false;
      if (tierFilter !== "ALL" && tier !== tierFilter) return false;
      if (gradeFilter !== "ALL" && grade !== gradeFilter) return false;
      if (competitionFilter !== "ALL" && row.Competition !== competitionFilter) return false;
      if (query && !normalize(`${row.Match || ""} ${row.Competition || ""}`).includes(query)) return false;
      return true;
    });

    const scoreFixtures = board.flatMap((record) => {
      const match = record.fields.Match;
      const kickoff = record.fields["Kickoff ICT"];
      return match && kickoff ? [{ match, kickoff }] : [];
    });
    const [finalScores, manualScores] = await Promise.all([
      fetchBsdFinalScores(scoreFixtures),
      fetchManualScores()
    ]);

    const focus = board.filter((record) => selectName(record.fields["Board Tier"]) === "FOCUS").length;
    const groups = new Map<string, Rec<Row>[]>();

    for (const record of board) {
      const day = slateDay(record.fields);
      groups.set(day, [...(groups.get(day) || []), record]);
    }

    return (
      <main className="wrap">
        <div className="top">
          <div>
            <div className="eyebrow">LIVE CONTROL BOARD</div>
            <h1>Schedule</h1>
            <p className="sub">Newest slate dates first. Airtable Slate Date controls the board day; kickoff is used only for the ICT clock time. Manual final scores override BSD.</p>
          </div>
          <div className="stats">
            <div className="stat red"><small>FOCUS</small><strong>{focus}</strong></div>
            <div className="stat cyan"><small>WATCHLIST</small><strong>{board.length - focus}</strong></div>
            <div className="stat lime"><small>TIMEZONE</small><strong style={{ fontSize: 17 }}>ICT · GMT+7</strong></div>
          </div>
        </div>

        <form className="filters" method="get">
          <div className="filterSearch">
            <label htmlFor="q">Search</label>
            <input id="q" name="q" type="search" defaultValue={filters.q || ""} placeholder="Match or competition" />
          </div>
          <div>
            <label htmlFor="date">Slate date</label>
            <input id="date" name="date" type="date" defaultValue={dateFilter} />
          </div>
          <div>
            <label htmlFor="tier">Tier</label>
            <select id="tier" name="tier" defaultValue={tierFilter}>
              <option value="ALL">All tiers</option>
              <option value="FOCUS">FOCUS</option>
              <option value="WATCHLIST">WATCHLIST</option>
            </select>
          </div>
          <div>
            <label htmlFor="grade">PRE grade</label>
            <select id="grade" name="grade" defaultValue={gradeFilter}>
              <option value="ALL">All grades</option>
              {grades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="competition">Competition</label>
            <select id="competition" name="competition" defaultValue={competitionFilter}>
              <option value="ALL">All competitions</option>
              {competitions.map((competition) => <option key={competition} value={competition}>{competition}</option>)}
            </select>
          </div>
          <div className="filterActions">
            <button className="filterButton" type="submit">Apply</button>
            <a className="filterReset" href="/schedule">Reset</a>
          </div>
        </form>

        <div className="resultCount">
          Showing {board.length} of {baseBoard.length} dated FOCUS / WATCHLIST fixtures
          <span className={`syncState ${isBsdConfigured() ? "on" : "off"}`}>BSD scores {isBsdConfigured() ? "on" : "off"}</span>
        </div>

        {board.length === 0 ? (
          <div className="empty">No fixtures match the current filters.</div>
        ) : (
          [...groups.entries()].map(([day, dayRecords]) => (
            <section key={day}>
              <div className="sectionTitle">{dayLabelFromSlate(day)} · ICT</div>
              {dayRecords.map((record) => {
                const row = record.fields;
                const kickoff = row["Kickoff ICT"] as string;
                const match = row.Match || "Unknown fixture";
                const teams = splitFixtureName(match);
                const manualScore = getManualScore(manualScores, match, kickoff);
                const bsdScore = getBsdScore(finalScores, match, kickoff);
                const score = manualScore || bsdScore;
                const scoreSource = manualScore ? "MANUAL" : bsdScore ? "FT" : "SCORE";
                const tier = selectName(row["Board Tier"]);
                const grade = selectName(row["PRE Grade"]);
                const structure = selectName(row["Structural Type"]);
                const xi = selectName(row["XI Status"]);
                const market = selectName(row["Market Status"]);
                const status = selectName(row["Coverage Status"]);

                return (
                  <details className="card fixtureCard" key={record.id}>
                    <summary className="fixtureReadable">
                      <div className="kickoffBlock">
                        <div className="time">{kickoffTime(kickoff)}</div>
                        <div className="timeZone">ICT</div>
                      </div>

                      <div className="fixtureIdentity">
                        {teams ? (
                          <div className="teamStack">
                            <div className="teamRow"><strong>{teams.home}</strong></div>
                            <div className="teamRow"><strong>{teams.away}</strong></div>
                          </div>
                        ) : (
                          <div className="match">{match}</div>
                        )}
                        <div className="comp">{row.Competition || "Unknown competition"}</div>
                      </div>

                      <div className={`scoreBlock ${score ? "final" : "pending"} ${manualScore ? "manual" : ""}`}>
                        <span>{scoreSource}</span>
                        <strong>{score ? `${score.home}–${score.away}` : "—"}</strong>
                      </div>

                      <div className="primaryBadges">
                        {grade && <span className={`badge ${grade.startsWith("A") ? "lime" : "amber"}`}>{grade}</span>}
                        <span className={`badge ${tier === "FOCUS" ? "red" : "cyan"}`}>{tier}</span>
                      </div>
                    </summary>

                    <div className="detail">
                      <div className="detailStrip">
                        {structure && <span><small>STRUCTURE</small><strong>{structure}</strong></span>}
                        <span><small>XI</small><strong>{xi || "—"}</strong></span>
                        <span><small>MARKET</small><strong>{market || "—"}</strong></span>
                        {status && <span><small>COVERAGE</small><strong>{status}</strong></span>}
                        {manualScore && <span><small>SCORE SOURCE</small><strong>MANUAL</strong></span>}
                        {!manualScore && bsdScore && <span><small>BSD EVENT</small><strong>#{bsdScore.eventId}</strong></span>}
                      </div>

                      <div className="scoreEditor">
                        <div>
                          <div className="label">MANUAL FINAL SCORE</div>
                          <p>Manual values take priority over BSD on both Schedule and Picks.</p>
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

                      {row["Frozen PRE Summary"] && <><div className="label" style={{ marginTop: 16 }}>FROZEN PRE</div><p>{row["Frozen PRE Summary"]}</p></>}
                      {row["Coverage Notes"] && <><div className="label" style={{ marginTop: 16, color: "#8b919d" }}>COVERAGE NOTES</div><p>{row["Coverage Notes"]}</p></>}
                    </div>
                  </details>
                );
              })}
            </section>
          ))
        )}
      </main>
    );
  } catch (error) {
    return <Notice message={error instanceof AirtableError ? error.message : error instanceof Error ? error.message : "Unknown server error"} />;
  }
}
