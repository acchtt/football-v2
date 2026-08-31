from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class BoardMatch(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    fixture_id: str
    rank: int
    kickoff_ict: datetime
    competition: str
    home_team: str
    away_team: str
    frozen_grade: str
    structural_type: str
    structural_score: float
    frozen_status: str
    frozen_at: datetime
    is_next: bool
    failure_modes: list[str]
    evidence_summary: str


class DailyBoardResponse(BaseModel):
    board_date_ict: date
    timezone: str
    model_version: str
    generated_at: datetime
    matches: list[BoardMatch]


class DailyJobResponse(BaseModel):
    board_date_ict: date
    fetched: int
    newly_frozen: int
    previously_frozen: int
    displayed: int
    excluded: int
