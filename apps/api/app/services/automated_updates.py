from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.db.models import (
    DecisionStateModel,
    FixtureModel,
    LineupSubmissionModel,
    OfficialBetModel,
    ResultSettlementModel,
    StructuralAssessmentModel,
)
from app.football_engine.versions.v0_2_47_R.settlement import settle_over_with_pnl
from app.football_engine.versions.v0_2_47_R.types import StructuralGrade
from app.football_engine.versions.v0_2_47_R.xi_rerank import XISignalsInput, rerank_xi
from app.model_state import get_model_state
from app.providers.base import ConfirmedLineupSnapshot, FixtureProvider
from app.schemas.analysis import LineupExtraction, XISignals
from app.services.stage_events import append_stage_event


@dataclass(frozen=True, slots=True)
class UpdateRunResult:
    lineup_candidates: int
    lineups_ingested: int
    result_candidates: int
    results_settled: int


class AutomatedMatchUpdateService:
    """Provider-driven XI/result updates; bookmaker market remains screenshot-only."""

    def __init__(self, session: Session, provider: FixtureProvider) -> None:
        self.session = session
        self.provider = provider
        self.model = get_model_state()

    def close(self) -> None:
        close = getattr(self.provider, "close", None)
        if callable(close):
            close()

    def run(self, target_date_ict: date | None = None) -> UpdateRunResult:
        lineup_candidates, lineups_ingested = self.ingest_confirmed_lineups(target_date_ict)
        result_candidates, results_settled = self.settle_finished_bets(target_date_ict)
        self.session.commit()
        return UpdateRunResult(
            lineup_candidates=lineup_candidates,
            lineups_ingested=lineups_ingested,
            result_candidates=result_candidates,
            results_settled=results_settled,
        )

    def ingest_confirmed_lineups(self, target_date_ict: date | None = None) -> tuple[int, int]:
        statement = (
            select(FixtureModel, StructuralAssessmentModel)
            .join(
                StructuralAssessmentModel,
                StructuralAssessmentModel.fixture_id == FixtureModel.id,
            )
            .where(
                StructuralAssessmentModel.model_version == self.model.model.version,
                StructuralAssessmentModel.display_on_board.is_(True),
                ~exists().where(
                    LineupSubmissionModel.fixture_id == FixtureModel.id,
                    LineupSubmissionModel.vision_provider == self.provider.name,
                ),
            )
            .order_by(FixtureModel.kickoff_utc.asc())
        )
        if target_date_ict is not None:
            statement = statement.where(FixtureModel.kickoff_ict_date == target_date_ict)

        rows = list(self.session.execute(statement).all())
        ingested = 0
        for fixture, frozen in rows:
            snapshot = self.provider.fetch_confirmed_lineup(fixture.provider_fixture_id)
            if snapshot is None:
                continue
            self._store_confirmed_lineup(fixture, frozen, snapshot)
            ingested += 1
        return len(rows), ingested

    def settle_finished_bets(self, target_date_ict: date | None = None) -> tuple[int, int]:
        statement = (
            select(FixtureModel, OfficialBetModel)
            .join(OfficialBetModel, OfficialBetModel.fixture_id == FixtureModel.id)
            .where(
                OfficialBetModel.model_version == self.model.model.version,
                ~exists().where(
                    ResultSettlementModel.official_bet_id == OfficialBetModel.id
                ),
            )
            .order_by(FixtureModel.kickoff_utc.asc())
        )
        if target_date_ict is not None:
            statement = statement.where(FixtureModel.kickoff_ict_date == target_date_ict)

        rows = list(self.session.execute(statement).all())
        settled = 0
        for fixture, bet in rows:
            result = self.provider.fetch_final_result(fixture.provider_fixture_id)
            if result is None:
                continue
            total_goals = result.home_goals_90 + result.away_goals_90
            asian = settle_over_with_pnl(
                total_goals,
                Decimal(str(bet.selected_line)),
                Decimal(str(bet.selected_odds)),
                Decimal(str(bet.stake_units)),
            )
            settlement = ResultSettlementModel(
                fixture_id=fixture.id,
                official_bet_id=bet.id,
                model_version=self.model.model.version,
                model_regime=self.model.model.regime,
                home_goals_90=result.home_goals_90,
                away_goals_90=result.away_goals_90,
                total_goals_90=total_goals,
                settlement=asian.settlement.value,
                stake_units=Decimal(str(bet.stake_units)),
                pnl_units=asian.pnl_units,
                provider_name=self.provider.name,
                provider_result_reference=str(
                    result.source_metadata.get(
                        "source_endpoint", fixture.provider_fixture_id
                    )
                ),
                result_payload={
                    "status": result.status,
                    "home_goals_90": result.home_goals_90,
                    "away_goals_90": result.away_goals_90,
                    "total_goals_90": total_goals,
                    "source_metadata": dict(result.source_metadata),
                },
            )
            self.session.add(settlement)
            self.session.flush()
            append_stage_event(
                self.session,
                fixture_id=fixture.id,
                stage="SETTLED",
                event_key=f"SETTLED:{bet.id}",
                payload={
                    "official_bet_id": bet.id,
                    "final_score_90": f"{result.home_goals_90}-{result.away_goals_90}",
                    "total_goals_90": total_goals,
                    "settlement": asian.settlement.value,
                    "stake_units": str(bet.stake_units),
                    "pnl_units": str(asian.pnl_units),
                },
                source_kind=self.provider.name,
                source_reference=settlement.provider_result_reference,
            )
            settled += 1
        return len(rows), settled

    def _store_confirmed_lineup(
        self,
        fixture: FixtureModel,
        frozen: StructuralAssessmentModel,
        snapshot: ConfirmedLineupSnapshot,
    ) -> None:
        extraction = self._neutral_lineup_extraction(fixture, snapshot)
        source_reference = str(
            snapshot.source_metadata.get("source_endpoint", fixture.provider_fixture_id)
        )
        record = LineupSubmissionModel(
            fixture_id=fixture.id,
            uploaded_image=f"provider://{self.provider.name}/{source_reference}",
            uploaded_images=[],
            original_filenames=[],
            extracted_json=extraction.model_dump(mode="json"),
            extraction_confidence=1.0,
            vision_provider=self.provider.name,
            manually_corrected=False,
            submitted_at=snapshot.captured_at or datetime.now(UTC),
        )
        self.session.add(record)
        self.session.flush()
        append_stage_event(
            self.session,
            fixture_id=fixture.id,
            stage="XI_CONFIRMED",
            event_key=f"XI_CONFIRMED:{record.id}",
            payload={
                "lineup_submission_id": record.id,
                "home_starting_xi": extraction.home_starting_xi,
                "away_starting_xi": extraction.away_starting_xi,
                "home_formation": extraction.home_formation,
                "away_formation": extraction.away_formation,
                "source_metadata": dict(snapshot.source_metadata),
            },
            source_kind=self.provider.name,
            source_reference=source_reference,
        )

        neutral = XISignalsInput(0, 0, 0, 0, 0, 0, 0, False)
        xi = rerank_xi(StructuralGrade(frozen.structural_grade), neutral)
        state = DecisionStateModel(
            fixture_id=fixture.id,
            model_version=self.model.model.version,
            period="XI",
            minute=None,
            score=None,
            verdict="XI_RERANKED",
            grade=xi.xi_grade.value,
            selected_line=None,
            selected_odds=None,
            evidence_summary={
                "baseline": {
                    "pre_grade": frozen.structural_grade,
                    "pre_structure": frozen.structural_type,
                    "pre_score": frozen.structural_score,
                    "pre_failure_modes": list(frozen.failure_modes),
                },
                "lineup_adjustment": {
                    "band_delta": xi.band_delta,
                    "signal_score": xi.signal_score,
                    "reason": (
                        "Confirmed provider XI stored. No canonical player-role-to-signal "
                        "mapping is approved, so names/formations cannot create a model upgrade."
                    ),
                },
                "confirmed_xi": extraction.model_dump(mode="json"),
                "situational_adjustment": {"status": "PENDING_CANONICAL_LOGIC"},
                "projected_goal_distribution": {"status": "PENDING_CANONICAL_LOGIC"},
                "fair_total": None,
            },
            source_lineup_submission_id=record.id,
            source_odds_submission_id=None,
        )
        self.session.add(state)
        self.session.flush()
        append_stage_event(
            self.session,
            fixture_id=fixture.id,
            stage="XI_RERANKED",
            event_key=f"XI_RERANKED:{state.id}",
            payload={
                "decision_state_id": state.id,
                "pre_grade": frozen.structural_grade,
                "xi_grade": xi.xi_grade.value,
                "xi_band_delta": xi.band_delta,
                "reason": state.evidence_summary["lineup_adjustment"]["reason"],
            },
            source_kind="model",
            source_reference=state.id,
        )
        append_stage_event(
            self.session,
            fixture_id=fixture.id,
            stage="WAITING_MARKET",
            event_key=f"WAITING_MARKET:{state.id}",
            payload={"xi_decision_state_id": state.id},
            source_kind="system",
        )

    @staticmethod
    def _neutral_lineup_extraction(
        fixture: FixtureModel,
        snapshot: ConfirmedLineupSnapshot,
    ) -> LineupExtraction:
        return LineupExtraction(
            home_team=fixture.home_team,
            away_team=fixture.away_team,
            home_starting_xi=[player.name for player in snapshot.home_starting_xi],
            away_starting_xi=[player.name for player in snapshot.away_starting_xi],
            home_bench=[player.name for player in snapshot.home_substitutes],
            away_bench=[player.name for player in snapshot.away_substitutes],
            home_missing=[],
            away_missing=[],
            home_formation=snapshot.home_formation,
            away_formation=snapshot.away_formation,
            confidence=1.0,
            visible_notes=[
                "Confirmed XI ingested automatically from the football provider.",
                "No player-name-only promotion is permitted.",
                "XI signal mapping remains neutral until canonical role logic is approved.",
            ],
            xi_signals=XISignals(
                attack_shape_delta=0,
                creator_availability=0,
                finisher_availability=0,
                defensive_absence_over_impact=0,
                rotation_risk=0,
                cohesion_risk=0,
                service_quality=0,
                genuine_role_change=False,
                notes=["Neutral canonical XI adjustment pending approved role mapping."],
            ),
        )
