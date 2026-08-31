from datetime import UTC, date, datetime

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.api.routes import _authorize_research_import, router
from app.config import Settings, get_settings
from app.db.models import Base, StructuralAssessmentModel, TeamProfileModel
from app.db.session import get_db
from app.schemas.research import ResearchImportRequest
from app.services.daily_board import DailyBoardService
from app.services.research_import import build_research_provider


@pytest.fixture
def session() -> Session:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine, expire_on_commit=False) as db:
        yield db


def _fixture_payload(
    *,
    external_id: str = "chelsea-brighton-20260831",
    kickoff: str = "2026-08-31T13:00:00Z",
    country_code: str = "GB-ENG",
    competition: str = "Premier League",
    profile: bool = True,
) -> dict[str, object]:
    item: dict[str, object] = {
        "external_id": external_id,
        "competition": competition,
        "country_code": country_code,
        "home_team": "Chelsea",
        "away_team": "Brighton",
        "kickoff_utc": kickoff,
        "sources": [
            {
                "title": "Public match and team-statistics page",
                "url": "https://example.com/matches/chelsea-brighton",
                "captured_at": "2026-08-31T05:00:00Z",
            }
        ],
        "structural": {
            "two_sided_strength": 91,
            "carrier_ceiling": 82,
            "opponent_secondary_route": 74,
            "failure_mode_resistance": 83,
            "profile_gate": 88,
            "chance_quality": 86,
            "data_complete": True,
            "failure_modes": ["Favourite may manage a two-goal lead"],
            "evidence": {"summary": "Two-sided creation survives the main failure routes"},
        },
    }
    if profile:
        item["profile"] = {
            "home_gf": 2.3,
            "home_ga": 0.9,
            "away_gf": 1.8,
            "away_ga": 1.5,
            "recent_gf": {"home": 2.4, "away": 1.9},
            "recent_ga": {"home": 1.0, "away": 1.6},
            "scoring_2plus_frequency": {"home": 0.7, "away": 0.6},
            "conceding_2plus_frequency": {"home": 0.3, "away": 0.5},
            "clean_sheet_rate": {"home": 0.3, "away": 0.2},
            "home_split": {"matches": 8},
            "away_split": {"matches": 8},
            "chance_metrics": {"home_xg": 2.1, "away_xg": 1.7},
        }
    return item


def _request(**fixture_overrides: object) -> ResearchImportRequest:
    return ResearchImportRequest.model_validate(
        {
            "board_date_ict": "2026-08-31",
            "batch_label": "usual daily research",
            "fixtures": [_fixture_payload(**fixture_overrides)],
        }
    )


def test_research_import_freezes_sourced_evidence_and_is_idempotent(
    session: Session,
) -> None:
    payload = _request()
    provider = build_research_provider(payload)
    service = DailyBoardService(session, provider, provider, "v0.2.47-R")

    first = service.ingest_and_freeze(payload.board_date_ict)
    second = service.ingest_and_freeze(payload.board_date_ict)
    assessment = session.scalar(select(StructuralAssessmentModel))
    profile = session.scalar(select(TeamProfileModel))

    assert first.newly_frozen == 1
    assert first.displayed == 1
    assert second.newly_frozen == 0
    assert second.previously_frozen == 1
    assert assessment is not None
    assert assessment.source_metadata["provider"] == "research"
    assert assessment.source_metadata["sources"][0]["url"].startswith("https://example.com")
    assert assessment.evidence["research_sources"][0]["title"].startswith("Public match")
    assert profile is not None
    assert profile.home_gf == 2.3


def test_missing_profile_fails_closed_even_when_research_scores_are_high(
    session: Session,
) -> None:
    payload = _request(external_id="missing-profile", profile=False)
    provider = build_research_provider(payload)

    result = DailyBoardService(
        session, provider, provider, "v0.2.47-R"
    ).ingest_and_freeze(payload.board_date_ict)
    assessment = session.scalar(select(StructuralAssessmentModel))

    assert result.displayed == 0
    assert result.excluded == 1
    assert assessment is not None
    assert assessment.assessment_status == "DATA_INCOMPLETE"
    assert assessment.exclusion_reason == "REQUIRED_EVIDENCE_INCOMPLETE"


def test_research_schema_rejects_wrong_ict_date_and_naive_times() -> None:
    with pytest.raises(ValidationError, match="fixture kickoff does not match board_date_ict"):
        _request(kickoff="2026-09-01T18:00:00Z")

    item = _fixture_payload()
    item["kickoff_utc"] = "2026-08-31T13:00:00"
    with pytest.raises(ValidationError, match="kickoff_utc must include a timezone"):
        ResearchImportRequest.model_validate(
            {"board_date_ict": "2026-08-31", "fixtures": [item]}
        )


def test_duplicate_research_fixture_id_is_rejected() -> None:
    fixture = _fixture_payload(external_id="duplicate")
    payload = ResearchImportRequest.model_validate(
        {
            "board_date_ict": "2026-08-31",
            "fixtures": [fixture, fixture],
        }
    )

    with pytest.raises(ValueError, match="duplicate fixture identities"):
        build_research_provider(payload)


def test_research_import_token_is_required_and_compared_safely() -> None:
    disabled = Settings(research_import_token=None)
    with pytest.raises(HTTPException) as disabled_error:
        _authorize_research_import(disabled, "anything")
    assert disabled_error.value.status_code == 503

    configured = Settings(research_import_token="daily-secret")
    with pytest.raises(HTTPException) as invalid_error:
        _authorize_research_import(configured, "wrong")
    assert invalid_error.value.status_code == 401

    _authorize_research_import(configured, "daily-secret")


def test_research_source_and_kickoff_are_normalized_to_utc() -> None:
    payload = ResearchImportRequest.model_validate(
        {
            "board_date_ict": date(2026, 8, 31),
            "fixtures": [
                {
                    **_fixture_payload(),
                    "kickoff_utc": "2026-08-31T20:00:00+07:00",
                    "sources": [
                        {
                            "title": "Fixture source",
                            "url": "https://example.com/fixture",
                            "captured_at": "2026-08-31T12:00:00+07:00",
                        }
                    ],
                }
            ],
        }
    )

    fixture = payload.fixtures[0]
    assert fixture.kickoff_utc == datetime(2026, 8, 31, 13, tzinfo=UTC)
    assert fixture.sources[0].captured_at == datetime(2026, 8, 31, 5, tzinfo=UTC)


def test_research_import_endpoint_requires_token_and_returns_job_result(
    session: Session,
) -> None:
    test_app = FastAPI()
    test_app.include_router(router)

    def database_override() -> Session:
        return session

    test_app.dependency_overrides[get_db] = database_override
    test_app.dependency_overrides[get_settings] = lambda: Settings(
        research_import_token="daily-secret"
    )
    client = TestClient(test_app)
    body = {
        "board_date_ict": "2026-08-31",
        "fixtures": [_fixture_payload(external_id="endpoint-import")],
    }

    unauthorized = client.post("/api/v1/imports/research", json=body)
    imported = client.post(
        "/api/v1/imports/research",
        json=body,
        headers={"X-Research-Import-Token": "daily-secret"},
    )

    assert unauthorized.status_code == 401
    assert imported.status_code == 200
    assert imported.json() == {
        "board_date_ict": "2026-08-31",
        "fetched": 1,
        "newly_frozen": 1,
        "previously_frozen": 0,
        "displayed": 1,
        "excluded": 0,
    }
