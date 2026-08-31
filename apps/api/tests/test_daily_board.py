from datetime import UTC, date, datetime

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.db.models import Base, DecisionStateModel, FixtureModel, StructuralAssessmentModel
from app.providers.demo import DemoProvider
from app.services.daily_board import DailyBoardService


@pytest.fixture
def session() -> Session:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as db:
        yield db


def service(session: Session) -> DailyBoardService:
    provider = DemoProvider()
    return DailyBoardService(session, provider, provider, "v0.2.47-R")


def test_daily_board_is_ranked_by_structure_and_marks_next_kickoff(session: Session) -> None:
    target = date(2026, 8, 31)
    result = service(session).ingest_and_freeze(target)
    board = service(session).get_board(target, now=datetime(2026, 8, 31, 0, tzinfo=UTC))

    assert result.fetched == 6
    assert result.displayed == 4
    assert [match.home_team for match in board.matches] == [
        "Real Madrid",
        "Chelsea",
        "Bodø/Glimt",
        "Ajax",
    ]
    assert next(match.home_team for match in board.matches if match.is_next) == "Bodø/Glimt"
    assert all("Ulsan" not in match.home_team for match in board.matches)


def test_repeated_ingestion_never_rewrites_frozen_assessments(session: Session) -> None:
    target = date(2026, 8, 31)
    first = service(session).ingest_and_freeze(target)
    before = list(session.scalars(select(StructuralAssessmentModel)).all())
    second = service(session).ingest_and_freeze(target)
    after = list(session.scalars(select(StructuralAssessmentModel)).all())

    assert first.newly_frozen == 6
    assert second.newly_frozen == 0
    assert second.previously_frozen == 6
    assert [row.id for row in before] == [row.id for row in after]
    assert [row.frozen_at for row in before] == [row.frozen_at for row in after]


def test_decision_states_are_append_only(session: Session) -> None:
    fixture = FixtureModel(
        provider_fixture_id="append-only:1",
        provider_name="test",
        competition="Test Cup",
        country_code="GB-ENG",
        home_team="Home",
        away_team="Away",
        kickoff_utc=datetime(2026, 8, 31, 12, tzinfo=UTC),
        kickoff_ict=datetime(2026, 8, 31, 19, tzinfo=UTC),
        kickoff_ict_date=date(2026, 8, 31),
        status="SCHEDULED",
    )
    session.add(fixture)
    session.flush()
    state = DecisionStateModel(
        fixture_id=fixture.id,
        model_version="v0.2.47-R",
        period="PRE",
        minute=None,
        score=None,
        verdict="NO BET — HOLD",
        grade="B",
        selected_line=None,
        selected_odds=None,
        evidence_summary={"reason": "test"},
    )
    session.add(state)
    session.commit()

    state.verdict = "OFFICIAL LOCK"
    with pytest.raises(ValueError, match="append-only"):
        session.commit()
