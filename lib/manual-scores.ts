import { createRecord, deleteRecord, records, TABLES, updateRecord } from "@/lib/airtable";

type ManualScoreRow = {
  "Score Key"?: string;
  Match?: string;
  "Kickoff ICT"?: string;
  "Home Score"?: number;
  "Away Score"?: number;
  "Updated At"?: string;
};

export type ManualScore = {
  home: number;
  away: number;
  updatedAt?: string;
};

const FIELDS = ["Score Key", "Match", "Kickoff ICT", "Home Score", "Away Score", "Updated At"];

function normalize(value = "") {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function manualScoreKey(match: string, kickoff: string) {
  const iso = new Date(kickoff).toISOString();
  return `${normalize(match)}|${iso}`;
}

export async function fetchManualScores() {
  const output = new Map<string, ManualScore>();
  const rows = await records<ManualScoreRow>(TABLES.manualScores, FIELDS, { field: "Updated At", direction: "desc" });

  for (const row of rows) {
    const key = row.fields["Score Key"];
    const home = row.fields["Home Score"];
    const away = row.fields["Away Score"];
    if (!key || typeof home !== "number" || typeof away !== "number") continue;
    if (!output.has(key)) {
      output.set(key, { home, away, updatedAt: row.fields["Updated At"] });
    }
  }

  return output;
}

export function getManualScore(scores: Map<string, ManualScore>, match: string, kickoff: string) {
  return scores.get(manualScoreKey(match, kickoff));
}

export async function saveManualScore(match: string, kickoff: string, home: number | null, away: number | null) {
  const key = manualScoreKey(match, kickoff);
  const existingRows = await records<ManualScoreRow>(TABLES.manualScores, ["Score Key"]);
  const existing = existingRows.find((row) => row.fields["Score Key"] === key);

  if (home === null || away === null) {
    if (existing) await deleteRecord(TABLES.manualScores, existing.id);
    return;
  }

  const fields = {
    "Score Key": key,
    Match: match,
    "Kickoff ICT": new Date(kickoff).toISOString(),
    "Home Score": home,
    "Away Score": away,
    "Updated At": new Date().toISOString()
  };

  if (existing) {
    await updateRecord(TABLES.manualScores, existing.id, fields);
  } else {
    await createRecord(TABLES.manualScores, fields);
  }
}
