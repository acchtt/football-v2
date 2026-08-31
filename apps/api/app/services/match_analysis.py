import re
import unicodedata
from datetime import UTC, datetime
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.db.models import (
    DecisionStateModel,
    FixtureModel,
    LineupSubmissionModel,
    OddsSubmissionModel,
    OfficialBetModel,
    StructuralAssessmentModel,
    TeamProfileModel,
)
from app.football_engine.versions.v0_2_47_R.goal_burden import OddsOffer
from app.football_engine.versions.v0_2_47_R.types import StructuralGrade
from app.football_engine.versions.v0_2_47_R.verdict import VerdictInput, VerdictResult, decide
from app.football_engine.versions.v0_2_47_R.xi_rerank import XISignalsInput
from app.schemas.analysis import (
    DecisionStateView,
    FixtureDetail,
    FrozenAssessmentDetail,
    LineupCorrectionRequest,
    LineupExtraction,
    LineupSubmissionView,
    MatchDetailResponse,
    OddsCorrectionRequest,
    OddsExtraction,
    OddsSubmissionView,
    OfficialBetView,
    TeamProfileDetail,
    VerdictResponse,
)
from app.storage import LocalUploadStorage
from app.vision import ImagePayload, VisionAdapter
from app.vision.base import FixtureIdentity


class MatchAnalysisService:
    def __init__(
        self,
        session: Session,
        vision: VisionAdapter,
        storage: LocalUploadStorage,
        settings: Settings,
    ) -> None:
        self.session = session
        self.vision = vision
        self.storage = storage
        self.settings = settings
        self.timezone = ZoneInfo(settings.timezone)

    def get_detail(self, fixture_id: str) -> MatchDetailResponse:
        fixture, frozen = self._fixture_and_frozen(fixture_id)
        profile = self.session.scalar(
            select(TeamProfileModel)
            .where(TeamProfileModel.fixture_id == fixture_id)
            .order_by(TeamProfileModel.captured_at.desc())
            .limit(1)
        )
        lineup = self._latest_lineup(fixture_id)
        odds = self._latest_odds(fixture_id)
        decisions = list(
            self.session.scalars(
                select(DecisionStateModel)
                .where(DecisionStateModel.fixture_id == fixture_id)
                .order_by(DecisionStateModel.created_at.asc())
            ).all()
        )
        official = self.session.scalar(
            select(OfficialBetModel).where(
                OfficialBetModel.fixture_id == fixture_id,
                OfficialBetModel.model_version == self.settings.model_version,
            )
        )
        return MatchDetailResponse(
            fixture=FixtureDetail(
                id=fixture.id,
                competition=fixture.competition,
                home_team=fixture.home_team,
                away_team=fixture.away_team,
                kickoff_ict=self._as_utc(fixture.kickoff_utc).astimezone(self.timezone),
                status=fixture.status,
            ),
            frozen=FrozenAssessmentDetail(
                model_version=frozen.model_version,
                grade=frozen.structural_grade,
                structural_type=frozen.structural_type,
                structural_score=frozen.structural_score,
                failure_modes=list(frozen.failure_modes),
                evidence=dict(frozen.evidence),
                frozen_at=frozen.frozen_at,
            ),
            profile=self._profile_view(profile),
            latest_lineup=self._lineup_view(lineup),
            latest_odds=self._odds_view(odds),
            decision_history=[self._decision_view(item) for item in decisions],
            official_bet=self._official_view(official),
            analysis_ready=lineup is not None and odds is not None,
        )

    def submit_lineup(
        self,
        fixture_id: str,
        images: tuple[ImagePayload, ...],
    ) -> LineupSubmissionView:
        fixture, _frozen = self._fixture_and_frozen(fixture_id)
        self.storage.validate(images)
        extraction = self.vision.extract_lineup(images, self._identity(fixture))
        saved = self.storage.save(fixture_id, images)
        record = LineupSubmissionModel(
            fixture_id=fixture_id,
            uploaded_image=saved[0].storage_path,
            uploaded_images=[item.storage_path for item in saved],
            original_filenames=[item.original_filename for item in saved],
            extracted_json=extraction.model_dump(mode="json"),
            extraction_confidence=extraction.confidence,
            vision_provider=self.vision.name,
            manually_corrected=False,
        )
        self.session.add(record)
        self.session.commit()
        return self._lineup_view(record)  # type: ignore[return-value]

    def submit_odds(
        self,
        fixture_id: str,
        images: tuple[ImagePayload, ...],
    ) -> OddsSubmissionView:
        fixture, _frozen = self._fixture_and_frozen(fixture_id)
        self.storage.validate(images)
        extraction = self.vision.extract_odds(images, self._identity(fixture))
        saved = self.storage.save(fixture_id, images)
        record = OddsSubmissionModel(
            fixture_id=fixture_id,
            uploaded_image=saved[0].storage_path,
            uploaded_images=[item.storage_path for item in saved],
            original_filenames=[item.original_filename for item in saved],
            extracted_lines_json=extraction.model_dump(mode="json"),
            extraction_confidence=extraction.confidence,
            vision_provider=self.vision.name,
            manually_corrected=False,
        )
        self.session.add(record)
        self.session.commit()
        return self._odds_view(record)  # type: ignore[return-value]

    def correct_lineup(
        self,
        fixture_id: str,
        submission_id: str,
        correction: LineupCorrectionRequest,
    ) -> LineupSubmissionView:
        original = self.session.get(LineupSubmissionModel, submission_id)
        if original is None or original.fixture_id != fixture_id:
            raise LookupError("Lineup submission not found for this fixture")
        record = LineupSubmissionModel(
            fixture_id=fixture_id,
            uploaded_image=original.uploaded_image,
            uploaded_images=list(original.uploaded_images),
            original_filenames=list(original.original_filenames),
            extracted_json=correction.model_dump(mode="json"),
            extraction_confidence=correction.confidence,
            vision_provider="manual",
            manually_corrected=True,
            supersedes_submission_id=original.id,
            corrected_at=datetime.now(UTC),
        )
        self.session.add(record)
        self.session.commit()
        return self._lineup_view(record)  # type: ignore[return-value]

    def correct_odds(
        self,
        fixture_id: str,
        submission_id: str,
        correction: OddsCorrectionRequest,
    ) -> OddsSubmissionView:
        original = self.session.get(OddsSubmissionModel, submission_id)
        if original is None or original.fixture_id != fixture_id:
            raise LookupError("Odds submission not found for this fixture")
        record = OddsSubmissionModel(
            fixture_id=fixture_id,
            uploaded_image=original.uploaded_image,
            uploaded_images=list(original.uploaded_images),
            original_filenames=list(original.original_filenames),
            extracted_lines_json=correction.model_dump(mode="json"),
            extraction_confidence=correction.confidence,
            vision_provider="manual",
            manually_corrected=True,
            supersedes_submission_id=original.id,
            corrected_at=datetime.now(UTC),
        )
        self.session.add(record)
        self.session.commit()
        return self._odds_view(record)  # type: ignore[return-value]

    def decide(self, fixture_id: str) -> VerdictResponse:
        fixture, frozen = self._fixture_and_frozen(fixture_id)
        existing_bet = self.session.scalar(
            select(OfficialBetModel).where(
                OfficialBetModel.fixture_id == fixture_id,
                OfficialBetModel.model_version == self.settings.model_version,
            )
        )
        if existing_bet is not None:
            decision = self.session.get(DecisionStateModel, existing_bet.decision_state_id)
            assert decision is not None
            return self._response_from_decision(fixture_id, frozen, decision, existing_bet)

        lineup_record = self._latest_lineup(fixture_id)
        odds_record = self._latest_odds(fixture_id)
        existing_decision = self._existing_decision(fixture_id, lineup_record, odds_record)
        if existing_decision is not None:
            return self._response_from_decision(fixture_id, frozen, existing_decision, None)

        result = self._run_engine(fixture, frozen, lineup_record, odds_record)
        evidence = self._decision_evidence(result, frozen, lineup_record, odds_record)
        state = DecisionStateModel(
            fixture_id=fixture_id,
            model_version=self.settings.model_version,
            period="XI",
            minute=None,
            score=None,
            verdict=result.verdict,
            grade=result.xi_grade.value,
            selected_line=result.selected_line,
            selected_odds=result.selected_odds,
            evidence_summary=evidence,
            source_lineup_submission_id=lineup_record.id if lineup_record else None,
            source_odds_submission_id=odds_record.id if odds_record else None,
        )
        self.session.add(state)
        self.session.flush()

        official: OfficialBetModel | None = None
        if result.verdict == "OFFICIAL LOCK":
            assert result.selected_line is not None and result.selected_odds is not None
            official = OfficialBetModel(
                fixture_id=fixture_id,
                model_version=self.settings.model_version,
                decision_state_id=state.id,
                selected_line=result.selected_line,
                selected_odds=result.selected_odds,
                stake_units=1.0,
                settlement=None,
                pnl_units=None,
            )
            self.session.add(official)
        self.session.commit()
        return self._response_from_result(
            fixture_id,
            result,
            state.id,
            official.id if official else None,
        )

    def _run_engine(
        self,
        fixture: FixtureModel,
        frozen: StructuralAssessmentModel,
        lineup_record: LineupSubmissionModel | None,
        odds_record: OddsSubmissionModel | None,
    ) -> VerdictResult:
        if lineup_record is None or odds_record is None:
            neutral = XISignalsInput(0, 0, 0, 0, 0, 0, 0, False)
            return decide(
                VerdictInput(
                    frozen_grade=StructuralGrade(frozen.structural_grade),
                    structural_score=frozen.structural_score,
                    profile_gate_score=self._frozen_score(frozen, "profile_gate"),
                    chance_quality_score=self._frozen_score(frozen, "chance_quality"),
                    frozen_failure_modes=tuple(frozen.failure_modes),
                    lineup_confidence=0 if lineup_record is None else 1,
                    odds_confidence=0 if odds_record is None else 1,
                    screenshots_match_fixture=False,
                    xi_signals=neutral,
                    odds_offers=(),
                )
            )

        lineup = LineupExtraction.model_validate(lineup_record.extracted_json)
        odds = OddsExtraction.model_validate(odds_record.extracted_lines_json)
        signals = XISignalsInput(
            attack_shape_delta=lineup.xi_signals.attack_shape_delta,
            creator_availability=lineup.xi_signals.creator_availability,
            finisher_availability=lineup.xi_signals.finisher_availability,
            defensive_absence_over_impact=lineup.xi_signals.defensive_absence_over_impact,
            rotation_risk=lineup.xi_signals.rotation_risk,
            cohesion_risk=lineup.xi_signals.cohesion_risk,
            service_quality=lineup.xi_signals.service_quality,
            genuine_role_change=lineup.xi_signals.genuine_role_change,
        )
        matches_fixture = self._lineup_matches(lineup, fixture) and self._odds_match(odds, fixture)
        return decide(
            VerdictInput(
                frozen_grade=StructuralGrade(frozen.structural_grade),
                structural_score=frozen.structural_score,
                profile_gate_score=self._frozen_score(frozen, "profile_gate"),
                chance_quality_score=self._frozen_score(frozen, "chance_quality"),
                frozen_failure_modes=tuple(frozen.failure_modes),
                lineup_confidence=lineup.confidence,
                odds_confidence=odds.confidence,
                screenshots_match_fixture=matches_fixture,
                xi_signals=signals,
                odds_offers=tuple(
                    OddsOffer(item.line, item.over_odds, item.under_odds) for item in odds.totals
                ),
            )
        )

    def _decision_evidence(
        self,
        result: VerdictResult,
        frozen: StructuralAssessmentModel,
        lineup: LineupSubmissionModel | None,
        odds: OddsSubmissionModel | None,
    ) -> dict[str, Any]:
        return {
            "frozen_grade": frozen.structural_grade,
            "xi_grade": result.xi_grade.value,
            "profile_gate": result.profile_gate,
            "chance_quality_gate": result.chance_quality_gate,
            "failure_modes_acceptable": result.failure_modes_acceptable,
            "reasons": list(result.reasons),
            "xi_band_delta": result.xi_band_delta,
            "lineup_snapshot": dict(lineup.extracted_json) if lineup else None,
            "odds_snapshot": dict(odds.extracted_lines_json) if odds else None,
        }

    def _existing_decision(
        self,
        fixture_id: str,
        lineup: LineupSubmissionModel | None,
        odds: OddsSubmissionModel | None,
    ) -> DecisionStateModel | None:
        statement = select(DecisionStateModel).where(
            DecisionStateModel.fixture_id == fixture_id,
            DecisionStateModel.model_version == self.settings.model_version,
            DecisionStateModel.period == "XI",
        )
        statement = statement.where(
            DecisionStateModel.source_lineup_submission_id == (lineup.id if lineup else None),
            DecisionStateModel.source_odds_submission_id == (odds.id if odds else None),
        )
        return self.session.scalar(statement.limit(1))

    def _fixture_and_frozen(
        self,
        fixture_id: str,
    ) -> tuple[FixtureModel, StructuralAssessmentModel]:
        fixture = self.session.get(FixtureModel, fixture_id)
        if fixture is None:
            raise LookupError("Fixture not found")
        frozen = self.session.scalar(
            select(StructuralAssessmentModel).where(
                StructuralAssessmentModel.fixture_id == fixture_id,
                StructuralAssessmentModel.model_version == self.settings.model_version,
                StructuralAssessmentModel.display_on_board.is_(True),
            )
        )
        if frozen is None:
            raise LookupError("No frozen shortlisted assessment exists for this fixture")
        return fixture, frozen

    def _latest_lineup(self, fixture_id: str) -> LineupSubmissionModel | None:
        return self.session.scalar(
            select(LineupSubmissionModel)
            .where(LineupSubmissionModel.fixture_id == fixture_id)
            .order_by(LineupSubmissionModel.submitted_at.desc(), LineupSubmissionModel.id.desc())
            .limit(1)
        )

    def _latest_odds(self, fixture_id: str) -> OddsSubmissionModel | None:
        return self.session.scalar(
            select(OddsSubmissionModel)
            .where(OddsSubmissionModel.fixture_id == fixture_id)
            .order_by(OddsSubmissionModel.submitted_at.desc(), OddsSubmissionModel.id.desc())
            .limit(1)
        )

    @staticmethod
    def _identity(fixture: FixtureModel) -> FixtureIdentity:
        return FixtureIdentity(fixture.home_team, fixture.away_team, fixture.competition)

    @staticmethod
    def _normalize(value: str) -> str:
        ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
        return re.sub(r"[^a-z0-9]+", " ", ascii_value.lower()).strip()

    def _lineup_matches(self, lineup: LineupExtraction, fixture: FixtureModel) -> bool:
        return self._normalize(lineup.home_team) == self._normalize(
            fixture.home_team
        ) and self._normalize(lineup.away_team) == self._normalize(fixture.away_team)

    def _odds_match(self, odds: OddsExtraction, fixture: FixtureModel) -> bool:
        match = self._normalize(odds.match)
        return (
            self._normalize(fixture.home_team) in match
            and self._normalize(fixture.away_team) in match
        )

    @staticmethod
    def _frozen_score(frozen: StructuralAssessmentModel, key: str) -> float:
        inputs = frozen.evidence.get("inputs", {})
        if not isinstance(inputs, dict):
            return 0
        value = inputs.get(key)
        return float(value) if isinstance(value, int | float) else 0

    @staticmethod
    def _profile_view(profile: TeamProfileModel | None) -> TeamProfileDetail | None:
        if profile is None:
            return None
        return TeamProfileDetail(
            home_gf=profile.home_gf,
            home_ga=profile.home_ga,
            away_gf=profile.away_gf,
            away_ga=profile.away_ga,
            scoring_2plus_frequency=dict(profile.scoring_2plus_frequency),
            conceding_2plus_frequency=dict(profile.conceding_2plus_frequency),
            clean_sheet_rate=dict(profile.clean_sheet_rate),
            chance_metrics=dict(profile.chance_metrics),
            captured_at=profile.captured_at,
        )

    @staticmethod
    def _lineup_view(record: LineupSubmissionModel | None) -> LineupSubmissionView | None:
        if record is None:
            return None
        extraction = LineupExtraction.model_validate(record.extracted_json)
        return LineupSubmissionView(
            id=record.id,
            original_filenames=list(record.original_filenames),
            extraction=extraction,
            confidence=extraction.confidence,
            vision_provider=record.vision_provider,
            manually_corrected=record.manually_corrected,
            supersedes_submission_id=record.supersedes_submission_id,
            submitted_at=record.submitted_at,
        )

    @staticmethod
    def _odds_view(record: OddsSubmissionModel | None) -> OddsSubmissionView | None:
        if record is None:
            return None
        extraction = OddsExtraction.model_validate(record.extracted_lines_json)
        return OddsSubmissionView(
            id=record.id,
            original_filenames=list(record.original_filenames),
            extraction=extraction,
            confidence=extraction.confidence,
            vision_provider=record.vision_provider,
            manually_corrected=record.manually_corrected,
            supersedes_submission_id=record.supersedes_submission_id,
            submitted_at=record.submitted_at,
        )

    @staticmethod
    def _decision_view(record: DecisionStateModel) -> DecisionStateView:
        return DecisionStateView(
            id=record.id,
            period=record.period,
            verdict=record.verdict,
            grade=record.grade,
            selected_line=record.selected_line,
            selected_odds=record.selected_odds,
            evidence_summary=dict(record.evidence_summary),
            created_at=record.created_at,
        )

    @staticmethod
    def _official_view(record: OfficialBetModel | None) -> OfficialBetView | None:
        if record is None:
            return None
        return OfficialBetView(
            id=record.id,
            selected_line=record.selected_line,
            selected_odds=record.selected_odds,
            stake_units=record.stake_units,
            locked_at=record.locked_at,
            settlement=record.settlement,
            pnl_units=record.pnl_units,
        )

    @staticmethod
    def _response_from_result(
        fixture_id: str,
        result: VerdictResult,
        decision_state_id: str | None,
        official_bet_id: str | None,
    ) -> VerdictResponse:
        return VerdictResponse(
            fixture_id=fixture_id,
            frozen_grade=result.frozen_grade.value,
            xi_grade=result.xi_grade.value,
            profile_gate=result.profile_gate,
            chance_quality_gate=result.chance_quality_gate,
            failure_modes_acceptable=result.failure_modes_acceptable,
            selected_line=result.selected_line,
            selected_odds=result.selected_odds,
            verdict=result.verdict,
            reasons=list(result.reasons),
            decision_state_id=decision_state_id,
            official_bet_id=official_bet_id,
        )

    def _response_from_decision(
        self,
        fixture_id: str,
        frozen: StructuralAssessmentModel,
        decision: DecisionStateModel,
        official: OfficialBetModel | None,
    ) -> VerdictResponse:
        evidence = dict(decision.evidence_summary)
        return VerdictResponse(
            fixture_id=fixture_id,
            frozen_grade=str(evidence.get("frozen_grade", frozen.structural_grade)),
            xi_grade=decision.grade,
            profile_gate=str(evidence.get("profile_gate", "UNKNOWN")),
            chance_quality_gate=str(evidence.get("chance_quality_gate", "UNKNOWN")),
            failure_modes_acceptable=bool(evidence.get("failure_modes_acceptable", False)),
            selected_line=decision.selected_line,
            selected_odds=decision.selected_odds,
            verdict=decision.verdict,
            reasons=list(evidence.get("reasons", [])),
            decision_state_id=decision.id,
            official_bet_id=official.id if official else None,
        )

    @staticmethod
    def _as_utc(value: datetime) -> datetime:
        return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
