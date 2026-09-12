import { AirtableError, records, selectName, TABLES } from "@/lib/airtable";

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

const FIELDS = [
  "Pick ID", "Match", "Competition", "Kickoff", "Model Version", "Verdict",
  "Line", "Odds", "Stake u", "Result", "P/L u", "Recorded At", "Reason"
];

const ZONE = "Asia/Ho_Chi_Minh";

function formatICT(value?: string) {
  if (!value) return "—";
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

export default async function PicksPage() {
  try {
    const picks = await records<Row>(TABLES.picks, FIELDS, { field: "Recorded At", direction: "desc" });
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
          <p className="sub">Immutable Website Picks log with model version, settlement state, stake and recorded P/L.</p>
        </div>

        <div className="metrics" style={{ marginTop: 24 }}>
          <div className="stat"><small>TOTAL PICKS</small><strong>{picks.length}</strong></div>
          <div className="stat"><small>SETTLED</small><strong>{settled.length}</strong></div>
          <div className="stat"><small>PENDING</small><strong>{pending}</strong></div>
          <div className="stat lime"><small>P/L</small><strong>{units(profit)}</strong></div>
          <div className="stat cyan"><small>ROI</small><strong>{roi >= 0 ? "+" : ""}{roi.toFixed(1)}%</strong></div>
        </div>

        {picks.length === 0 ? (
          <div className="empty">No Website Picks records found.</div>
        ) : (
          picks.map((pick) => {
            const row = pick.fields;
            const result = selectName(row.Result) || "PENDING";
            const verdict = selectName(row.Verdict);

            return (
              <details className="card" key={pick.id}>
                <summary className="pick">
                  <div>
                    <div className="meta">{formatICT(row.Kickoff)} · {row.Competition || "Unknown competition"}</div>
                    <div className="match">{row.Match || "Unknown fixture"}</div>
                    <div className="badges" style={{ justifyContent: "flex-start", marginTop: 9 }}>
                      {verdict && <span className="badge cyan">{verdict}</span>}
                      <span className={`badge ${resultTone(result)}`}>{result}</span>
                      {row["Model Version"] && <span className="badge">{row["Model Version"]}</span>}
                    </div>
                  </div>
                  <div className="selection">
                    <div className="meta">SELECTION</div>
                    <strong>O{row.Line ?? "—"} @ {row.Odds ?? "—"}</strong>
                    <div className="meta" style={{ marginTop: 7 }}>P/L {units(row["P/L u"])}</div>
                  </div>
                </summary>
                <div className="detail">
                  <div className="badges" style={{ justifyContent: "flex-start" }}>
                    <span className="badge">STAKE {row["Stake u"] ?? "—"}u</span>
                    <span className="badge">RECORDED {formatICT(row["Recorded At"])}</span>
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
