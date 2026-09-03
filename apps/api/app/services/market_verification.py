from __future__ import annotations

import re
import unicodedata

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.db.models import (
    FixtureModel,
    LineupSubmissionModel,
    MarketVerificationModel,
    OddsSubmissionModel,
    StructuralAssessmentModel,
)
from app.schemas.analysis import OddsExtraction
from app.schemas.market import MarketStatusView
from app.services.airtable_sync import AirtableSyncService
from app.services.stage_events import append_stage_event


class MarketVerificationService:
    """Require an explicit user check before bookmaker screenshots become model input."""

    def __init__(self, session: Session, settings: Settings) -> None:
        self.session = session
        self.settings = settings

    def status(self, fixture_id: str) -> MarketStatusView:
        self._fixture_and_frozen(fixture_id)
        latest_odds = self._latest_odds(fixture_id)
        verification = None
        if latest_odds is not None:
            verification = self.session.scalar(
                select(MarketVerificationModel).where(
                    MarketVerificationModel.fixture_id == fixture_id,
                    MarketVerificationModel.odds_submission_id == latest_odds.id,
                )
            )
        lineup_exists = self._latest_lineup(fixture_id) is not None
        verified = verification is not None
        return MarketStatusView(
            fixture_id=fixture_id,
            latest_odds_submission_id=latest_odds.id if latest_odds else None,
            verified_odds_submission_id=(
                verification.odds_submission_id if verification is not None else None
            ),
            verification_id=verification.id if verification is not None else None,
            verified=verified,
            ready_for_verification=latest_odds is not None and lineup_exists and not verified,
            verified_at=verification.verified_at if verification is not None else None,
        )

    def verify(self, fixture_id: str, submission_id: str) -> MarketStatusView:
        fixture, _frozen = self._fixture_and_frozen(fixture_id)
        if self._latest_lineup(fixture_id) is None:
            raise ValueError("Confirmed XI is required before market verification")

        latest = self._latest_odds(fixture_id)
        if latest is None:
            raise LookupError("No odds submission exists for this fixture")
        if latest.id != submission_id:
            raise ValueError("Only the latest immutable odds version can be verified")

        odds = self.session.get(OddsSubmissionModel, submission_id)
        if odds is None or odds.fixture_id != fixture_id:
            raise LookupError("Odds submission not found for this fixture")

        extraction = OddsExtraction.model_validate(odds.extracted_lines_json)
        if not extraction.totals:
            raise ValueError("At least one Asian total line is required before verification")
        if not self._odds_match(extraction, fixture):
            raise ValueError("Odds match label does not match this fixture")

        existing = self.session.scalar(
            select(MarketVerificationModel).where(
                MarketVerificationModel.odds_submission_id == submission_id
            )
        )
        if existing is None:
            verification = MarketVerificationModel(
                fixture_id=fixture_id,
                odds_submission_id=submission_id,
                verified_by="user",
                evidence={
                    "user_verified_visible_values": True,
                    "odds_submission_id": submission_id,
                    "extraction": extraction.model_dump(mode="json"),
                    "vision_provider": odds.vision_provider,
                    "manually_corrected": odds.manually_corrected,
                },
            )
            self.session.add(verification)
            self.session.flush()
            append_stage_event(
                self.session,
                fixture_id=fixture_id,
                stage="MARKET_RECEIVED",
                event_key=f"MARKET_RECEIVED:{verification.id}",
                payload={
                    "market_verification_id": verification.id,
                    "odds_submission_id": submission_id,
                    "verified_by": "user",
                    "totals": [item.model_dump(mode="json") for item in extraction.totals],
                    "lock_engine_ready": False,
                    "blocker": "TOTAL_GOAL_SCENARIO_PRODUCER_PENDING",
                },
                source_kind="user",
                source_reference=submission_id,
            )
            self.session.commit()

            sync = AirtableSyncService(self.settings)
            try:
                sync.sync_fixture(self.session, fixture_id)
            finally:
                sync.close()

        return self.status(fixture_id)

    def _fixture_and_frozen(
        self, fixture_id: str
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
            .order_by(
                LineupSubmissionModel.submitted_at.desc(),
                LineupSubmissionModel.id.desc(),
            )
            .limit(1)
        )

    def _latest_odds(self, fixture_id: str) -> OddsSubmissionModel | None:
        return self.session.scalar(
            select(OddsSubmissionModel)
            .where(OddsSubmissionModel.fixture_id == fixture_id)
            .order_by(
                OddsSubmissionModel.submitted_at.desc(),
                OddsSubmissionModel.id.desc(),
            )
            .limit(1)
        )

    @staticmethod
    def _normalize(value: str) -> str:
        ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
        return re.sub(r"[^a-z0-9]+", " ", ascii_value.lower()).strip()

    def _odds_match(self, odds: OddsExtraction, fixture: FixtureModel) -> bool:
        match = self._normalize(odds.match)
        return (
            self._normalize(fixture.home_team) in match
            and self._normalize(fixture.away_team) in match
        )
