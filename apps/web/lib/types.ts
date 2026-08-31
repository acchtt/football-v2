export type BoardMatch = {
  fixture_id: string;
  rank: number;
  kickoff_ict: string;
  competition: string;
  home_team: string;
  away_team: string;
  frozen_grade: "A1" | "A2" | "B+";
  structural_type:
    | "TWO_SIDED"
    | "ELITE_CARRIER"
    | "CARRIER_SECONDARY_ROUTE";
  structural_score: number;
  frozen_status: string;
  frozen_at: string;
  is_next: boolean;
  failure_modes: string[];
  evidence_summary: string;
};

export type DailyBoard = {
  board_date_ict: string;
  timezone: string;
  model_version: string;
  generated_at: string;
  matches: BoardMatch[];
};

