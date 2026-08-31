from datetime import date

from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.config import Settings
from app.db.models import (
    Base,
    DecisionStateModel,
    FixtureModel,
    LineupSubmissionModel,
    OfficialBetModel,
)
from app.providers.demo import DemoProvider
from app.schemas.analysis import LineupCorrectionRequest, XISignals
from app.services.daily_board import DailyBoardService
from app.services.match_analysis import MatchAnalysisService
from app.storage import LocalUploadStorage
from app.vision import ImagePayload
from app.vision.demo import DemoVisionAdapter


def build_service(session: Session, upload_dir: str) -> MatchAnalysisService:
    settings = Settings(
        database_url="sqlite+pysqlite:///:memory:",
        fixture_provider="demo",
        vision_provider="demo",
        upload_dir=upload_dir,
    )
    return MatchAnalysisService(
        session,
        DemoVisionAdapter(),
        LocalUploadStorage(upload_dir, 1_000_000, 6),
        settings,
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


def test_affirmative_verdict_creates_one_automatic_official_lock(tmp_path: object) -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as session:
        seed(session)
        service = build_service(session, str(tmp_path))
        match_id = fixture_id(session, "Real Madrid")
        service.submit_lineup(match_id, screenshot())
        service.submit_odds(match_id, screenshot())

        first = service.decide(match_id)
        second = service.decide(match_id)

        assert first.verdict == "OFFICIAL LOCK"
        assert first.selected_line == 2.75
        assert first.official_bet_id is not None
        assert second.official_bet_id == first.official_bet_id
        assert session.scalar(select(func.count()).select_from(OfficialBetModel)) == 1
        assert session.scalar(select(func.count()).select_from(DecisionStateModel)) == 1


def test_manual_correction_creates_new_version_and_rotation_hold(tmp_path: object) -> None:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as session:
        seed(session)
        service = build_service(session, str(tmp_path))
        match_id = fixture_id(session, "Bodø/Glimt")
        original = service.submit_lineup(match_id, screenshot())
        service.submit_odds(match_id, screenshot())
        corrected_data = original.extraction.model_dump()
        corrected_data["xi_signals"] = XISignals(
            attack_shape_delta=-1,
            creator_availability=-1,
            finisher_availability=-1,
            defensive_absence_over_impact=0,
            rotation_risk=2,
            cohesion_risk=2,
            service_quality=-1,
            genuine_role_change=False,
            notes=["Heavy rotation confirmed"],
        ).model_dump()
        corrected = service.correct_lineup(
            match_id,
            original.id,
            LineupCorrectionRequest.model_validate(corrected_data),
        )

        result = service.decide(match_id)

        assert corrected.id != original.id
        assert corrected.supersedes_submission_id == original.id
        assert result.verdict == "NO BET — HOLD"
        assert session.scalar(select(func.count()).select_from(LineupSubmissionModel)) == 2
        assert session.scalar(select(func.count()).select_from(OfficialBetModel)) == 0
