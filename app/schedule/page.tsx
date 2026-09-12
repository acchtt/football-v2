import { AirtableError, records, selectName, TABLES, type Rec } from "@/lib/airtable";

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

const FIELDS = [
  "Coverage ID", "Slate Date", "Match", "Competition", "Kickoff ICT",
  "Coverage Status", "PRE Grade", "Structural Type", "Board Tier",
  "XI Status", "Market Status", "Screened At", "Frozen PRE Summary", "Coverage Notes"
];

const ZONE = "Asia/Ho_Chi_Minh";

function timestamp(value?: string) {
  if (!value) return 0;
  return Date.parse(value) || 0;
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
  return `${normalize(row.Match)}|${row["Kickoff ICT"] || row["Slate Date"] || ""}`;
}

function kickoffTime(value?: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(value));
}

function dayLabel(value?: string) {
  if (!value) return "Unknown day";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE,
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(new Date(value));
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

export default async function SchedulePage() {
  try {
    const all = await records<Row>(TABLES.coverage, FIELDS, { field: "Screened At", direction: "desc" });

    const latest = new Map<string, Rec<Row>>();
    for (const record of all.sort((a, b) =>
      timestamp(b.fields["Screened At"] || b.createdTime) - timestamp(a.fields["Screened At"] || a.createdTime)
    )) {
      const key = fixtureKey(record.fields);
      if (!latest.has(key)) latest.set(key, record);
    }

    const board = [...latest.values()]
      .filter((record) => ["FOCUS", "WATCHLIST"].includes(selectName(record.fields["Board Tier"])))
      .sort((a, b) => timestamp(a.fields["Kickoff ICT"]) - timestamp(b.fields["Kickoff ICT"]));

    const focus = board.filter((record) => selectName(record.fields["Board Tier"]) === "FOCUS").length;
    const groups = new Map<string, Rec<Row>[]>();

    for (const record of board) {
      const label = dayLabel(record.fields["Kickoff ICT"]);
      groups.set(label, [...(groups.get(label) || []), record]);
    }

    return (
      <main className="wrap">
        <div className="top">
          <div>
            <div className="eyebrow">LIVE CONTROL BOARD</div>
            <h1>Schedule</h1>
            <p className="sub">Latest authoritative screening state from Daily Coverage Ledger. Repeated sweep records are collapsed before FOCUS / WATCHLIST filtering.</p>
          </div>
          <div className="stats">
            <div className="stat red"><small>FOCUS</small><strong>{focus}</strong></div>
            <div className="stat cyan"><small>WATCHLIST</small><strong>{board.length - focus}</strong></div>
            <div className="stat lime"><small>TIMEZONE</small><strong style={{ fontSize: 17 }}>ICT · GMT+7</strong></div>
          </div>
        </div>

        {board.length === 0 ? (
          <div className="empty">No FOCUS or WATCHLIST fixtures on the latest board.</div>
        ) : (
          [...groups.entries()].map(([day, dayRecords]) => (
            <section key={day}>
              <div className="sectionTitle">{day} · ICT</div>
              {dayRecords.map((record) => {
                const row = record.fields;
                const tier = selectName(row["Board Tier"]);
                const grade = selectName(row["PRE Grade"]);
                const structure = selectName(row["Structural Type"]);
                const xi = selectName(row["XI Status"]);
                const market = selectName(row["Market Status"]);
                const status = selectName(row["Coverage Status"]);

                return (
                  <details className="card" key={record.id}>
                    <summary className="fixture">
                      <div className="time">{kickoffTime(row["Kickoff ICT"])}</div>
                      <div>
                        <div className="match">{row.Match || "Unknown fixture"}</div>
                        <div className="comp">{row.Competition || "Unknown competition"}</div>
                      </div>
                      <div className="badges">
                        {grade && <span className={`badge ${grade.startsWith("A") ? "lime" : "amber"}`}>{grade}</span>}
                        <span className={`badge ${tier === "FOCUS" ? "red" : "cyan"}`}>{tier}</span>
                      </div>
                    </summary>
                    <div className="detail">
                      <div className="badges" style={{ justifyContent: "flex-start" }}>
                        {structure && <span className="badge">{structure}</span>}
                        <span className="badge">XI {xi || "—"}</span>
                        <span className="badge">MARKET {market || "—"}</span>
                        {status && <span className="badge">{status}</span>}
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
