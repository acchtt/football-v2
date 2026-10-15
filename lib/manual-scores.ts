export type ManualScore = {
  home: number;
  away: number;
  updatedAt?: string;
};

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

/**
 * Website-side manual-score persistence is retired. The private Google Sheets
 * "Manual Scores" tab is the operational override store. The public dashboard
 * projection may include already-approved manualScore values, but this web
 * library never reads the private workbook directly.
 */
export async function fetchManualScores() {
  return new Map<string, ManualScore>();
}

export function getManualScore(
  scores: Map<string, ManualScore>,
  match: string,
  kickoff: string,
) {
  return scores.get(manualScoreKey(match, kickoff));
}

export async function saveManualScore(): Promise<never> {
  throw new Error(
    "MANUAL_SCORE_WEB_WRITE_RETIRED: use the private Google Sheets Manual Scores tab",
  );
}
