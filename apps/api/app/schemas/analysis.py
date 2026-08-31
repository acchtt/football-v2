from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class XISignals(BaseModel):
    attack_shape_delta: int = Field(ge=-2, le=2)
    creator_availability: int = Field(ge=-2, le=2)
    finisher_availability: int = Field(ge=-2, le=2)
    defensive_absence_over_impact: int = Field(ge=-2, le=2)
    rotation_risk: int = Field(ge=0, le=2)
    cohesion_risk: int = Field(ge=0, le=2)
    service_quality: int = Field(ge=-2, le=2)
    genuine_role_change: bool
    notes: list[str]


class LineupExtraction(BaseModel):
    home_team: str
    away_team: str
    home_starting_xi: list[str]
    away_starting_xi: list[str]
    home_bench: list[str]
    away_bench: list[str]
    home_missing: list[str]
    away_missing: list[str]
    home_formation: str | None
    away_formation: str | None
    confidence: float = Field(ge=0, le=1)
    visible_notes: list[str]
    xi_signals: XISignals


class OddsLine(BaseModel):
    line: float = Field(ge=0.5, le=8.0)
    over_odds: float = Field(gt=1.0, le=20.0)
    under_odds: float = Field(gt=1.0, le=20.0)

    @field_validator("line")
    @classmethod
    def require_quarter_line(cls, value: float) -> float:
        if abs(value * 4 - round(value * 4)) > 0.0001:
            raise ValueError("Asian total must use a quarter-goal increment")
        return value


class OddsExtraction(BaseModel):
    match: str
    totals: list[OddsLine]
    confidence: float = Field(ge=0, le=1)
    visible_notes: list[str]


class FixtureDetail(BaseModel):
    id: str
    competition: str
    home_team: str
    away_team: str
    kickoff_ict: datetime
    status: str


class FrozenAssessmentDetail(BaseModel):
    model_version: str
    grade: str
    structural_type: str
    structural_score: float
    failure_modes: list[str]
    evidence: dict[str, object]
    frozen_at: datetime


class TeamProfileDetail(BaseModel):
    home_gf: float | None
    home_ga: float | None
    away_gf: float | None
    away_ga: float | None
    scoring_2plus_frequency: dict[str, object]
    conceding_2plus_frequency: dict[str, object]
    clean_sheet_rate: dict[str, object]
    chance_metrics: dict[str, object]
    captured_at: datetime


class LineupSubmissionView(BaseModel):
    id: str
    original_filenames: list[str]
    extraction: LineupExtraction
    confidence: float
    vision_provider: str
    manually_corrected: bool
    supersedes_submission_id: str | None
    submitted_at: datetime


class OddsSubmissionView(BaseModel):
    id: str
    original_filenames: list[str]
    extraction: OddsExtraction
    confidence: float
    vision_provider: str
    manually_corrected: bool
    supersedes_submission_id: str | None
    submitted_at: datetime


class DecisionStateView(BaseModel):
    id: str
    period: str
    verdict: str
    grade: str
    selected_line: float | None
    selected_odds: float | None
    evidence_summary: dict[str, object]
    created_at: datetime


class OfficialBetView(BaseModel):
    id: str
    selected_line: float
    selected_odds: float
    stake_units: float
    locked_at: datetime
    settlement: str | None
    pnl_units: float | None


class MatchDetailResponse(BaseModel):
    fixture: FixtureDetail
    frozen: FrozenAssessmentDetail
    profile: TeamProfileDetail | None
    latest_lineup: LineupSubmissionView | None
    latest_odds: OddsSubmissionView | None
    decision_history: list[DecisionStateView]
    official_bet: OfficialBetView | None
    analysis_ready: bool


class VerdictResponse(BaseModel):
    fixture_id: str
    frozen_grade: str
    xi_grade: str
    profile_gate: str
    chance_quality_gate: str
    failure_modes_acceptable: bool
    selected_line: float | None
    selected_odds: float | None
    verdict: str
    reasons: list[str]
    decision_state_id: str | None
    official_bet_id: str | None


class LineupCorrectionRequest(LineupExtraction):
    model_config = ConfigDict(extra="forbid")


class OddsCorrectionRequest(OddsExtraction):
    model_config = ConfigDict(extra="forbid")
