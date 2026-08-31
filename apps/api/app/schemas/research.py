from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any, Self
from zoneinfo import ZoneInfo

from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator

ICT = ZoneInfo("Asia/Ho_Chi_Minh")


class SideValues(BaseModel):
    home: float = Field(ge=0, le=10)
    away: float = Field(ge=0, le=10)


class SideRates(BaseModel):
    home: float = Field(ge=0, le=1)
    away: float = Field(ge=0, le=1)


class ResearchSource(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    url: HttpUrl
    captured_at: datetime

    @field_validator("captured_at")
    @classmethod
    def captured_at_must_be_timezone_aware(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("captured_at must include a timezone")
        return value.astimezone(UTC)


class ResearchProfile(BaseModel):
    home_gf: float | None = Field(default=None, ge=0, le=10)
    home_ga: float | None = Field(default=None, ge=0, le=10)
    away_gf: float | None = Field(default=None, ge=0, le=10)
    away_ga: float | None = Field(default=None, ge=0, le=10)
    recent_gf: SideValues
    recent_ga: SideValues
    scoring_2plus_frequency: SideRates
    conceding_2plus_frequency: SideRates
    clean_sheet_rate: SideRates
    home_split: dict[str, Any] = Field(default_factory=dict)
    away_split: dict[str, Any] = Field(default_factory=dict)
    chance_metrics: dict[str, Any] = Field(default_factory=dict)


class ResearchStructuralMetrics(BaseModel):
    two_sided_strength: float = Field(ge=0, le=100)
    carrier_ceiling: float = Field(ge=0, le=100)
    opponent_secondary_route: float = Field(ge=0, le=100)
    failure_mode_resistance: float = Field(ge=0, le=100)
    profile_gate: float = Field(ge=0, le=100)
    chance_quality: float = Field(ge=0, le=100)
    data_complete: bool
    failure_modes: list[str] = Field(default_factory=list, max_length=20)
    evidence: dict[str, Any] = Field(default_factory=dict)


class ResearchFixtureInput(BaseModel):
    external_id: str | None = Field(default=None, min_length=1, max_length=80)
    competition: str = Field(min_length=1, max_length=160)
    country_code: str = Field(min_length=1, max_length=16)
    home_team: str = Field(min_length=1, max_length=160)
    away_team: str = Field(min_length=1, max_length=160)
    kickoff_utc: datetime
    status: str = Field(default="SCHEDULED", min_length=1, max_length=32)
    sources: list[ResearchSource] = Field(min_length=1, max_length=20)
    profile: ResearchProfile | None = None
    structural: ResearchStructuralMetrics

    @field_validator("kickoff_utc")
    @classmethod
    def kickoff_must_be_timezone_aware(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("kickoff_utc must include a timezone")
        return value.astimezone(UTC)

    @model_validator(mode="after")
    def teams_must_differ(self) -> Self:
        if self.home_team.casefold() == self.away_team.casefold():
            raise ValueError("home_team and away_team must differ")
        return self


class ResearchImportRequest(BaseModel):
    board_date_ict: date
    batch_label: str = Field(default="daily-web-research", min_length=1, max_length=120)
    fixtures: list[ResearchFixtureInput] = Field(min_length=1, max_length=200)

    @model_validator(mode="after")
    def fixtures_must_match_board_date(self) -> Self:
        mismatches = [
            f"{fixture.home_team} vs {fixture.away_team}"
            for fixture in self.fixtures
            if fixture.kickoff_utc.astimezone(ICT).date() != self.board_date_ict
        ]
        if mismatches:
            raise ValueError(
                "fixture kickoff does not match board_date_ict: " + ", ".join(mismatches)
            )
        return self
