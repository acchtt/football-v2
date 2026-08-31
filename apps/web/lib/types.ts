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

export type XISignals = {
  attack_shape_delta: number;
  creator_availability: number;
  finisher_availability: number;
  defensive_absence_over_impact: number;
  rotation_risk: number;
  cohesion_risk: number;
  service_quality: number;
  genuine_role_change: boolean;
  notes: string[];
};

export type LineupExtraction = {
  home_team: string;
  away_team: string;
  home_starting_xi: string[];
  away_starting_xi: string[];
  home_bench: string[];
  away_bench: string[];
  home_missing: string[];
  away_missing: string[];
  home_formation: string | null;
  away_formation: string | null;
  confidence: number;
  visible_notes: string[];
  xi_signals: XISignals;
};

export type OddsLine = {
  line: number;
  over_odds: number;
  under_odds: number;
};

export type OddsExtraction = {
  match: string;
  totals: OddsLine[];
  confidence: number;
  visible_notes: string[];
};

export type LineupSubmission = {
  id: string;
  original_filenames: string[];
  extraction: LineupExtraction;
  confidence: number;
  vision_provider: string;
  manually_corrected: boolean;
  supersedes_submission_id: string | null;
  submitted_at: string;
};

export type OddsSubmission = {
  id: string;
  original_filenames: string[];
  extraction: OddsExtraction;
  confidence: number;
  vision_provider: string;
  manually_corrected: boolean;
  supersedes_submission_id: string | null;
  submitted_at: string;
};

export type DecisionState = {
  id: string;
  period: string;
  verdict: string;
  grade: string;
  selected_line: number | null;
  selected_odds: number | null;
  evidence_summary: Record<string, unknown>;
  created_at: string;
};

export type MatchDetail = {
  fixture: {
    id: string;
    competition: string;
    home_team: string;
    away_team: string;
    kickoff_ict: string;
    status: string;
  };
  frozen: {
    model_version: string;
    grade: string;
    structural_type: string;
    structural_score: number;
    failure_modes: string[];
    evidence: Record<string, unknown>;
    frozen_at: string;
  };
  profile: null | {
    home_gf: number | null;
    home_ga: number | null;
    away_gf: number | null;
    away_ga: number | null;
    scoring_2plus_frequency: Record<string, unknown>;
    conceding_2plus_frequency: Record<string, unknown>;
    clean_sheet_rate: Record<string, unknown>;
    chance_metrics: Record<string, unknown>;
    captured_at: string;
  };
  latest_lineup: LineupSubmission | null;
  latest_odds: OddsSubmission | null;
  decision_history: DecisionState[];
  official_bet: null | {
    id: string;
    selected_line: number;
    selected_odds: number;
    stake_units: number;
    locked_at: string;
    settlement: string | null;
    pnl_units: number | null;
  };
  analysis_ready: boolean;
};

export type Verdict = {
  fixture_id: string;
  frozen_grade: string;
  xi_grade: string;
  profile_gate: string;
  chance_quality_gate: string;
  failure_modes_acceptable: boolean;
  selected_line: number | null;
  selected_odds: number | null;
  verdict: string;
  reasons: string[];
  decision_state_id: string | null;
  official_bet_id: string | null;
};
