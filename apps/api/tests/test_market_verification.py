from datetime import date

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.config import Settings
from app.db.models import Base, FixtureModel, MarketVerificationModel, OddsSubmissionModel
from app.providers.demo import DemoProvider
from app.schemas.analysis import OddsCorrectionRequest
from app.services.daily_board import DailyBoardService
from app.services.market_verification import MarketVerificationService
from app.services.match_analysis import MatchAnalysisService
from app.services.stage_events import latest_stage
from app.storage import LocalUploadStorage
from app.vision import ImagePayload
from app.vision.demo import DemoVisionAdapter


def settings(upload_dir: str) -> Settings:
    return Settings(
        database_url="sqlite+pysqlite:///:memory:",
        fixture_provider="demo",
        vision_provider="demo",
        upload_dir=upload_dir,
        airtable_sync_enabled=False,
    )


def seed(session: Session) -> None:
    provider = DemoProvider()
    DailyBoardService(session, provider, provider, "v0.2.47-R").ingest_and_freeze(
        date(2026, 8, 31)
    )


def fixture_id(session: Session, home_team: str) -> str:
    return session.scalar(
        select(FixtureModel.id).where(FixtureModel.home_team == home_team)
    )  # type: ignore[return-value]


def screenshot() -> tuple[ImagePayload, ...]:
    return (ImagePayload("screen.png", "image/png", b"\x89PNG\r\n\x1a\ndemo"),)


def analysis_service(
    session: Session,
    upload_dir: str,
    cfg: Settings,
) -> MatchAnalysisService:
    return MatchAnalysisService(
        session,
        DemoVisionAdapter(),
        LocalUploadStorage(upload_dir, 1_000_000, 6),
        cfg,
    )


def test_market_requires_explicit_verification_and_is_idempotent(tmp_path: object) -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as session:
        seed(session)
        cfg = settings(str(tmp_path))
        match_id = fixture_id(session, "Real Madrid")
        analysis = analysis_service(session, str(tmp_path), cfg)
        analysis.submit_lineup(match_id, screenshot())
        odds = analysis.submit_odds(match_id, screenshot())
        market = MarketVerificationService(session, cfg)

        before = market.status(match_id)
        assert before.verified is False
        assert before.ready_for_verification is True
        assert before.lock_engine_ready is False

        first = market.verify(match_id, odds.id)
        second = market.verify(match_id, odds.id)

        assert first.verified is True
        assert first.verified_odds_submission_id == odds.id
        assert first.lock_engine_ready is False
        assert first.blocker == "CANONICAL_FAIR_TOTAL_LOGIC_PENDING"
        assert second.verification_id == first.verification_id
        assert session.scalar(select(func.count()).select_from(MarketVerificationModel)) == 1
        stage = latest_stage(session, match_id)
        assert stage is not None
        assert stage.stage == "MARKET_RECEIVED"


def test_correction_creates_new_unverified_market_version(tmp_path: object) -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as session:
        seed(session)
        cfg = settings(str(tmp_path))
        match_id = fixture_id(session, "Real Madrid")
        analysis = analysis_service(session, str(tmp_path), cfg)
        analysis.submit_lineup(match_id, screenshot())
        original = analysis.submit_odds(match_id, screenshot())
        market = MarketVerificationService(session, cfg)
        market.verify(match_id, original.id)

        corrected_payload = original.extraction.model_dump()
        corrected_payload["totals"][0]["over_odds"] = 1.89
        corrected = analysis.correct_odds(
            match_id,
            original.id,
            OddsCorrectionRequest.model_validate(corrected_payload),
        )

        status = market.status(match_id)
        assert corrected.id != original.id
        assert status.latest_odds_submission_id == corrected.id
        assert status.verified is False
        assert status.ready_for_verification is True
        assert session.scalar(select(func.count()).select_from(MarketVerificationModel)) == 1

        with pytest.raises(ValueError, match="latest immutable odds version"):
            market.verify(match_id, original.id)

        market.verify(match_id, corrected.id)
        assert session.scalar(select(func.count()).select_from(MarketVerificationModel)) == 2


def test_market_verification_requires_lineup_first(tmp_path: object) -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as session:
        seed(session)
        cfg = settings(str(tmp_path))
        match_id = fixture_id(session, "Real Madrid")
        analysis = analysis_service(session, str(tmp_path), cfg)
        odds = analysis.submit_odds(match_id, screenshot())
        market = MarketVerificationService(session, cfg)

        with pytest.raises(ValueError, match="Confirmed XI"):
            market.verify(match_id, odds.id)

        assert session.scalar(select(func.count()).select_from(MarketVerificationModel)) == 0
        assert session.scalar(select(func.count()).select_from(OddsSubmissionModel)) == 1
