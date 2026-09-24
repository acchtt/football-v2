import { records, selectName, TABLES, type Rec } from "@/lib/airtable";

export const dynamic = "force-dynamic";

type Row = {
  Match?: string;
  Competition?: string;
  "Kickoff ICT"?: string;
  "Board Tier"?: unknown;
  "PRE Grade"?: unknown;
  "Structural Type"?: unknown;
};

const FIELDS = ["Match", "Competition", "Kickoff ICT", "Board Tier", "PRE Grade", "Structural Type"];

export default async function AllSchedulePage() {
  const rows = await records<Row>(TABLES.coverage, FIELDS, { field: "Kickoff ICT", direction: "desc" });

  return (
    <main className="wrap">
      <div className="eyebrow">AUDIT VIEW</div>
      <h1>All Screened Fixtures</h1>
      <p className="sub">Internal audit view. Includes fixtures outside the public FOCUS/WATCHLIST board filter.</p>
      <div className="card">
        {rows.map((record: Rec<Row>) => (
          <div key={record.id} style={{ padding: 12, borderBottom: "1px solid #222" }}>
            <strong>{record.fields.Match || "Unknown"}</strong>
            <div>{record.fields.Competition}</div>
            <div>{record.fields["Kickoff ICT"]}</div>
            <div>{selectName(record.fields["PRE Grade"])} · {selectName(record.fields["Board Tier"])} · {selectName(record.fields["Structural Type"])}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
