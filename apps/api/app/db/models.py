from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    event,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def new_id() -> str:
    return str(uuid4())


class Base(DeclarativeBase):
    pass


class FixtureModel(Base):
    __tablename__ = "fixtures"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    provider_fixture_id: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    provider_name: Mapped[str] = mapped_column(String(64))
    competition: Mapped[str] = mapped_column(String(160), index=True)
    country_code: Mapped[str] = mapped_column(String(16))
    home_team: Mapped[str] = mapped_column(String(160))
    away_team: Mapped[str] = mapped_column(String(160))
    kickoff_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    kickoff_ict: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    kickoff_ict_date: Mapped[date] = mapped_column(Date, index=True)
    status: Mapped[str] = mapped_column(String(32), default="SCHEDULED")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )


class TeamProfileModel(Base):
    __tablename__ = "team_profiles"
    __table_args__ = (
        UniqueConstraint("fixture_id", "source_key", name="uq_profile_fixture_source"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    fixture_id: Mapped[str] = mapped_column(
        ForeignKey("fixtures.id", ondelete="CASCADE"), index=True
    )
    source_key: Mapped[str] = mapped_column(String(128))
    home_gf: Mapped[float | None] = mapped_column(Float)
    home_ga: Mapped[float | None] = mapped_column(Float)
    away_gf: Mapped[float | None] = mapped_column(Float)
    away_ga: Mapped[float | None] = mapped_column(Float)
    recent_gf: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    recent_ga: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    scoring_2plus_frequency: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    conceding_2plus_frequency: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    clean_sheet_rate: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    home_split: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    away_split: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    chance_metrics: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    source_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    captured_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class StructuralAssessmentModel(Base):
    __tablename__ = "structural_assessments"
    __table_args__ = (
        UniqueConstraint("fixture_id", "model_version", name="uq_frozen_assessment_version"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    fixture_id: Mapped[str] = mapped_column(
        ForeignKey("fixtures.id", ondelete="CASCADE"), index=True
    )
    model_version: Mapped[str] = mapped_column(String(32), index=True)
    structural_grade: Mapped[str] = mapped_column(String(16), index=True)
    structural_type: Mapped[str] = mapped_column(String(48))
    structural_score: Mapped[float] = mapped_column(Float)
    assessment_status: Mapped[str] = mapped_column(String(32), index=True)
    display_on_board: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    failure_modes: Mapped[list[str]] = mapped_column(JSON, default=list)
    evidence: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    source_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    exclusion_reason: Mapped[str | None] = mapped_column(String(96))
    frozen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class LineupSubmissionModel(Base):
    __tablename__ = "lineup_submissions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    fixture_id: Mapped[str] = mapped_column(
        ForeignKey("fixtures.id", ondelete="CASCADE"), index=True
    )
    uploaded_image: Mapped[str] = mapped_column(Text)
    uploaded_images: Mapped[list[str]] = mapped_column(JSON, default=list)
    original_filenames: Mapped[list[str]] = mapped_column(JSON, default=list)
    extracted_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    extraction_confidence: Mapped[float | None] = mapped_column(Float)
    vision_provider: Mapped[str] = mapped_column(String(32), default="unknown")
    manually_corrected: Mapped[bool] = mapped_column(Boolean, default=False)
    supersedes_submission_id: Mapped[str | None] = mapped_column(
        ForeignKey("lineup_submissions.id"), index=True
    )
    corrected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class OddsSubmissionModel(Base):
    __tablename__ = "odds_submissions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    fixture_id: Mapped[str] = mapped_column(
        ForeignKey("fixtures.id", ondelete="CASCADE"), index=True
    )
    uploaded_image: Mapped[str] = mapped_column(Text)
    uploaded_images: Mapped[list[str]] = mapped_column(JSON, default=list)
    original_filenames: Mapped[list[str]] = mapped_column(JSON, default=list)
    extracted_lines_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    extraction_confidence: Mapped[float | None] = mapped_column(Float)
    vision_provider: Mapped[str] = mapped_column(String(32), default="unknown")
    manually_corrected: Mapped[bool] = mapped_column(Boolean, default=False)
    supersedes_submission_id: Mapped[str | None] = mapped_column(
        ForeignKey("odds_submissions.id"), index=True
    )
    corrected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class MarketVerificationModel(Base):
    __tablename__ = "market_verifications"
    __table_args__ = (
        UniqueConstraint("odds_submission_id", name="uq_market_verified_submission"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    fixture_id: Mapped[str] = mapped_column(
        ForeignKey("fixtures.id", ondelete="CASCADE"), index=True
    )
    odds_submission_id: Mapped[str] = mapped_column(
        ForeignKey("odds_submissions.id", ondelete="CASCADE"), index=True
    )
    verified_by: Mapped[str] = mapped_column(String(32), default="user")
    evidence: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    verified_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class DecisionStateModel(Base):
    __tablename__ = "decision_states"
    __table_args__ = (
        UniqueConstraint(
            "fixture_id",
            "model_version",
            "period",
            "source_lineup_submission_id",
            "source_odds_submission_id",
            name="uq_decision_source_state",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    fixture_id: Mapped[str] = mapped_column(
        ForeignKey("fixtures.id", ondelete="CASCADE"), index=True
    )
    model_version: Mapped[str] = mapped_column(String(32))
    period: Mapped[str] = mapped_column(String(16), index=True)
    minute: Mapped[int | None]
    score: Mapped[str | None] = mapped_column(String(16))
    verdict: Mapped[str] = mapped_column(String(48))
    grade: Mapped[str] = mapped_column(String(16))
    selected_line: Mapped[float | None] = mapped_column(Float)
    selected_odds: Mapped[float | None] = mapped_column(Float)
    evidence_summary: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    source_lineup_submission_id: Mapped[str | None] = mapped_column(
        ForeignKey("lineup_submissions.id"), index=True
    )
    source_odds_submission_id: Mapped[str | None] = mapped_column(
        ForeignKey("odds_submissions.id"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class OfficialBetModel(Base):
    __tablename__ = "official_bets"
    __table_args__ = (
        UniqueConstraint("fixture_id", "model_version", name="uq_official_fixture_version"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    fixture_id: Mapped[str] = mapped_column(
        ForeignKey("fixtures.id", ondelete="CASCADE"), index=True
    )
    model_version: Mapped[str] = mapped_column(String(32))
    decision_state_id: Mapped[str] = mapped_column(ForeignKey("decision_states.id"), unique=True)
    selected_line: Mapped[float] = mapped_column(Float)
    selected_odds: Mapped[float] = mapped_column(Float)
    stake_units: Mapped[float] = mapped_column(Float, default=1.0)
    locked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    # Legacy compatibility only. New settlement is written to result_settlements.
    settlement: Mapped[str | None] = mapped_column(String(32))
    pnl_units: Mapped[float | None] = mapped_column(Float)


class MatchStageEventModel(Base):
    __tablename__ = "match_stage_events"
    __table_args__ = (
        UniqueConstraint(
            "fixture_id", "model_version", "event_key", name="uq_match_stage_event_key"
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    fixture_id: Mapped[str] = mapped_column(
        ForeignKey("fixtures.id", ondelete="CASCADE"), index=True
    )
    model_version: Mapped[str] = mapped_column(String(32), index=True)
    model_regime: Mapped[str] = mapped_column(String(32), index=True)
    stage: Mapped[str] = mapped_column(String(32), index=True)
    event_key: Mapped[str] = mapped_column(String(160))
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    source_kind: Mapped[str] = mapped_column(String(48), default="system")
    source_reference: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class ResultSettlementModel(Base):
    __tablename__ = "result_settlements"
    __table_args__ = (
        UniqueConstraint("official_bet_id", name="uq_result_settlement_bet"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    fixture_id: Mapped[str] = mapped_column(
        ForeignKey("fixtures.id", ondelete="CASCADE"), index=True
    )
    official_bet_id: Mapped[str] = mapped_column(
        ForeignKey("official_bets.id", ondelete="CASCADE"), index=True
    )
    model_version: Mapped[str] = mapped_column(String(32), index=True)
    model_regime: Mapped[str] = mapped_column(String(32))
    home_goals_90: Mapped[int]
    away_goals_90: Mapped[int]
    total_goals_90: Mapped[int]
    settlement: Mapped[str] = mapped_column(String(32), index=True)
    stake_units: Mapped[Decimal] = mapped_column(Numeric(12, 6))
    pnl_units: Mapped[Decimal] = mapped_column(Numeric(12, 6))
    provider_name: Mapped[str] = mapped_column(String(64))
    provider_result_reference: Mapped[str] = mapped_column(Text)
    result_payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    settled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class AuditObservationModel(Base):
    __tablename__ = "audit_observations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    fixture_id: Mapped[str | None] = mapped_column(
        ForeignKey("fixtures.id", ondelete="SET NULL"), index=True
    )
    model_version: Mapped[str] = mapped_column(String(32), index=True)
    classification: Mapped[str | None] = mapped_column(String(64))
    notes: Mapped[str] = mapped_column(Text)
    evidence: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


class ProposedModelChangeModel(Base):
    __tablename__ = "proposed_model_changes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    audit_observation_id: Mapped[str | None] = mapped_column(
        ForeignKey("audit_observations.id", ondelete="SET NULL"), index=True
    )
    proposed_change: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    rationale: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="PROPOSED", index=True)
    approval_reference: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )


def _reject_mutation(_mapper: Any, _connection: Any, target: Any) -> None:
    raise ValueError(f"{type(target).__name__} is append-only and cannot be changed")


for immutable_model in (
    StructuralAssessmentModel,
    LineupSubmissionModel,
    OddsSubmissionModel,
    MarketVerificationModel,
    DecisionStateModel,
    OfficialBetModel,
    MatchStageEventModel,
    ResultSettlementModel,
    AuditObservationModel,
    ProposedModelChangeModel,
):
    event.listen(immutable_model, "before_update", _reject_mutation)
    event.listen(immutable_model, "before_delete", _reject_mutation)
