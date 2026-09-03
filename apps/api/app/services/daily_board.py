from dataclasses import dataclass
from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import FixtureModel, StructuralAssessmentModel, TeamProfileModel
from app.football_engine.versions.v0_2_47_R import StructuralInput, assess_structural_fit
from app.football_engine.versions.v0_2_47_R.types import AssessmentStatus
from app.providers.base import FixtureProvider, ProviderFixture, StatsProvider, StructuralMetrics
from app.schemas.board import BoardMatch, DailyBoardResponse, DailyJobResponse
from app.services.stage_events import append_stage_event


@dataclass(frozen=True, slots=True)
class DailyJobResult:
    target_date: date
    fetched: int
    newly_frozen: int
    previously_frozen: int
    displayed: int
    excluded: int


class DailyBoardService:
    def __init__(
        self,
        session: Session,
        fixture_provider: FixtureProvider,
        stats_provider: StatsProvider,
        model_version: str,
        timezone: str = "Asia/Ho_Chi_Minh",
    ) -> None:
        self.session = session
        self.fixture_provider = fixture_provider
        self.stats_provider = stats_provider
        self.model_version = model_version
        self.timezone = ZoneInfo(timezone)

    def close(self) -> None:
        """Release provider transports after one request or scheduled job."""
        closed: set[int] = set()
        for provider in (self.fixture_provider, self.stats_provider):
            if id(provider) in closed:
                continue
            closed.add(id(provider))
            close = getattr(provider, "close", None)
            if callable(close):
                close()

    def ingest_and_freeze(self, target_date: date) -> DailyJobResult:
        fixtures = self.fixture_provider.fetch_fixtures(target_date)
        newly_frozen = 0
        previously_frozen = 0
        displayed = 0
        excluded = 0

        for provider_fixture in fixtures:
            fixture = self._upsert_fixture(provider_fixture)
            existing = self.session.scalar(
                select(StructuralAssessmentModel).where(
                    StructuralAssessmentModel.fixture_id == fixture.id,
                    StructuralAssessmentModel.model_version == self.model_version,
                )
            )
            if existing is not None:
                previously_frozen += 1
                displayed += int(existing.display_on_board)
                excluded += int(not existing.display_on_board)
                continue

            append_stage_event(
                self.session,
                fixture_id=fixture.id,
                stage="DISCOVERED",
                event_key=f"DISCOVERED:{provider_fixture.provider_fixture_id}",
                payload={
                    "competition": provider_fixture.competition,
                    "home_team": provider_fixture.home_team,
                    "away_team": provider_fixture.away_team,
                    "kickoff_utc": provider_fixture.kickoff_utc.isoformat(),
                },
                source_kind=provider_fixture.provider_name,
                source_reference=provider_fixture.provider_fixture_id,
            )
            append_stage_event(
                self.session,
                fixture_id=fixture.id,
                stage="PRE_SCREENED",
                event_key=f"PRE_SCREENED:{provider_fixture.provider_fixture_id}",
                payload={"competition_scope_passed": True},
                source_kind="model",
            )

            profile = self.stats_provider.fetch_team_profile(provider_fixture)
            metrics = self.stats_provider.fetch_structural_metrics(provider_fixture)
            if profile is not None:
                self._store_profile(fixture.id, profile)

            assessment = assess_structural_fit(
                self._to_engine_input(provider_fixture, metrics, profile is not None)
            )
            provider_metadata = {
                "provider_fixture_id": provider_fixture.provider_fixture_id,
                "provider_name": provider_fixture.provider_name,
                **(dict(metrics.source_metadata) if metrics is not None else {}),
            }
            record = StructuralAssessmentModel(
                fixture_id=fixture.id,
                model_version=self.model_version,
                structural_grade=assessment.grade.value,
                structural_type=assessment.structural_type.value,
                structural_score=assessment.score,
                assessment_status=assessment.status.value,
                display_on_board=assessment.display_on_board,
                failure_modes=list(assessment.failure_modes),
                evidence=dict(assessment.evidence),
                source_metadata=provider_metadata,
                exclusion_reason=assessment.exclusion_reason,
                frozen_at=datetime.now(UTC),
            )
            self.session.add(record)
            self.session.flush()
            append_stage_event(
                self.session,
                fixture_id=fixture.id,
                stage="PRE_FROZEN",
                event_key=f"PRE_FROZEN:{record.id}",
                payload={
                    "assessment_id": record.id,
                    "grade": record.structural_grade,
                    "structural_type": record.structural_type,
                    "structural_score": record.structural_score,
                    "display_on_board": record.display_on_board,
                    "failure_modes": list(record.failure_modes),
                    "evidence": dict(record.evidence),
                },
                source_kind="model",
                source_reference=record.id,
            )
            if assessment.display_on_board:
                append_stage_event(
                    self.session,
                    fixture_id=fixture.id,
                    stage="WAITING_XI",
                    event_key=f"WAITING_XI:{record.id}",
                    payload={"assessment_id": record.id},
                    source_kind="system",
                )

            newly_frozen += 1
            displayed += int(assessment.display_on_board)
            excluded += int(not assessment.display_on_board)

        self.session.commit()
        return DailyJobResult(
            target_date=target_date,
            fetched=len(fixtures),
            newly_frozen=newly_frozen,
            previously_frozen=previously_frozen,
            displayed=displayed,
            excluded=excluded,
        )

    def has_frozen_board(self, target_date: date) -> bool:
        statement = (
            select(StructuralAssessmentModel.id)
            .join(FixtureModel, FixtureModel.id == StructuralAssessmentModel.fixture_id)
            .where(
                FixtureModel.kickoff_ict_date == target_date,
                StructuralAssessmentModel.model_version == self.model_version,
            )
            .limit(1)
        )
        return self.session.scalar(statement) is not None

    def get_board(self, target_date: date, now: datetime | None = None) -> DailyBoardResponse:
        statement = (
            select(FixtureModel, StructuralAssessmentModel)
            .join(
                StructuralAssessmentModel,
                StructuralAssessmentModel.fixture_id == FixtureModel.id,
            )
            .where(
                FixtureModel.kickoff_ict_date == target_date,
                StructuralAssessmentModel.model_version == self.model_version,
                StructuralAssessmentModel.display_on_board.is_(True),
                StructuralAssessmentModel.assessment_status == AssessmentStatus.FROZEN.value,
            )
            .order_by(
                StructuralAssessmentModel.structural_score.desc(),
                FixtureModel.kickoff_utc.asc(),
            )
        )
        rows = list(self.session.execute(statement).all())
        current = (now or datetime.now(UTC)).astimezone(self.timezone)
        future_kickoffs = [
            self._as_utc(fixture.kickoff_utc)
            for fixture, _assessment in rows
            if self._as_utc(fixture.kickoff_utc) > current.astimezone(UTC)
        ]
        next_kickoff = min(future_kickoffs) if future_kickoffs else None

        matches = []
        for rank, (fixture, assessment) in enumerate(rows, start=1):
            evidence_summary = str(assessment.evidence.get("summary", "Frozen structural evidence"))
            matches.append(
                BoardMatch(
                    fixture_id=fixture.id,
                    rank=rank,
                    kickoff_ict=self._as_utc(fixture.kickoff_utc).astimezone(self.timezone),
                    competition=fixture.competition,
                    home_team=fixture.home_team,
                    away_team=fixture.away_team,
                    frozen_grade=assessment.structural_grade,
                    structural_type=assessment.structural_type,
                    structural_score=assessment.structural_score,
                    frozen_status=self._status_label(assessment),
                    frozen_at=assessment.frozen_at,
                    is_next=(
                        next_kickoff is not None
                        and self._as_utc(fixture.kickoff_utc) == next_kickoff
                    ),
                    failure_modes=list(assessment.failure_modes),
                    evidence_summary=evidence_summary,
                )
            )

        return DailyBoardResponse(
            board_date_ict=target_date,
            timezone=str(self.timezone),
            model_version=self.model_version,
            generated_at=datetime.now(UTC),
            matches=matches,
        )

    def _upsert_fixture(self, provider_fixture: ProviderFixture) -> FixtureModel:
        fixture = self.session.scalar(
            select(FixtureModel).where(
                FixtureModel.provider_fixture_id == provider_fixture.provider_fixture_id
            )
        )
        kickoff_ict = provider_fixture.kickoff_utc.astimezone(self.timezone)
        if fixture is None:
            fixture = FixtureModel(
                provider_fixture_id=provider_fixture.provider_fixture_id,
                provider_name=provider_fixture.provider_name,
                competition=provider_fixture.competition,
                country_code=provider_fixture.country_code,
                home_team=provider_fixture.home_team,
                away_team=provider_fixture.away_team,
                kickoff_utc=provider_fixture.kickoff_utc,
                kickoff_ict=kickoff_ict,
                kickoff_ict_date=kickoff_ict.date(),
                status=provider_fixture.status,
            )
            self.session.add(fixture)
            self.session.flush()
            return fixture

        fixture.status = provider_fixture.status
        return fixture

    def _store_profile(self, fixture_id: str, profile: object) -> None:
        from app.providers.base import TeamProfileSnapshot

        assert isinstance(profile, TeamProfileSnapshot)
        existing = self.session.scalar(
            select(TeamProfileModel).where(
                TeamProfileModel.fixture_id == fixture_id,
                TeamProfileModel.source_key == profile.source_key,
            )
        )
        if existing is not None:
            return
        self.session.add(
            TeamProfileModel(
                fixture_id=fixture_id,
                source_key=profile.source_key,
                home_gf=profile.home_gf,
                home_ga=profile.home_ga,
                away_gf=profile.away_gf,
                away_ga=profile.away_ga,
                recent_gf=dict(profile.recent_gf),
                recent_ga=dict(profile.recent_ga),
                scoring_2plus_frequency=dict(profile.scoring_2plus_frequency),
                conceding_2plus_frequency=dict(profile.conceding_2plus_frequency),
                clean_sheet_rate=dict(profile.clean_sheet_rate),
                home_split=dict(profile.home_split),
                away_split=dict(profile.away_split),
                chance_metrics=dict(profile.chance_metrics),
                source_metadata=dict(profile.source_metadata),
            )
        )

    def _to_engine_input(
        self,
        fixture: ProviderFixture,
        metrics: StructuralMetrics | None,
        profile_available: bool,
    ) -> StructuralInput:
        if metrics is None:
            metrics = StructuralMetrics(0, 0, 0, 0, 0, 0, False)
        return StructuralInput(
            provider_fixture_id=fixture.provider_fixture_id,
            competition=fixture.competition,
            country_code=fixture.country_code,
            home_team=fixture.home_team,
            away_team=fixture.away_team,
            kickoff_utc=fixture.kickoff_utc,
            two_sided_strength=metrics.two_sided_strength,
            carrier_ceiling=metrics.carrier_ceiling,
            opponent_secondary_route=metrics.opponent_secondary_route,
            failure_mode_resistance=metrics.failure_mode_resistance,
            profile_gate=metrics.profile_gate,
            chance_quality=metrics.chance_quality,
            data_complete=metrics.data_complete and profile_available,
            failure_modes=metrics.failure_modes,
            evidence=metrics.evidence,
            source_metadata=metrics.source_metadata,
        )

    @staticmethod
    def _status_label(assessment: StructuralAssessmentModel) -> str:
        type_labels = {
            "TWO_SIDED": "Two-Sided",
            "ELITE_CARRIER": "Elite Carrier",
            "CARRIER_SECONDARY_ROUTE": "Elite Carrier / secondary route",
        }
        return (
            f"{assessment.structural_grade} "
            f"{type_labels.get(assessment.structural_type, assessment.structural_type)} — freeze"
        )

    @staticmethod
    def _as_utc(value: datetime) -> datetime:
        """SQLite drops tzinfo; production PostgreSQL retains it."""
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def to_job_response(result: DailyJobResult) -> DailyJobResponse:
    return DailyJobResponse(
        board_date_ict=result.target_date,
        fetched=result.fetched,
        newly_frozen=result.newly_frozen,
        previously_frozen=result.previously_frozen,
        displayed=result.displayed,
        excluded=result.excluded,
    )
