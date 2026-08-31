from datetime import date, datetime
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db.session import get_db
from app.providers.factory import build_providers
from app.schemas.board import DailyBoardResponse, DailyJobResponse
from app.services.daily_board import DailyBoardService, to_job_response

router = APIRouter()
DatabaseDependency = Annotated[Session, Depends(get_db)]
SettingsDependency = Annotated[Settings, Depends(get_settings)]
BoardDateQuery = Annotated[date | None, Query(alias="date")]


def _service(db: Session, settings: Settings) -> DailyBoardService:
    fixture_provider, stats_provider = build_providers(settings)
    return DailyBoardService(
        session=db,
        fixture_provider=fixture_provider,
        stats_provider=stats_provider,
        model_version=settings.model_version,
        timezone=settings.timezone,
    )


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/api/v1/board", response_model=DailyBoardResponse)
def daily_board(
    db: DatabaseDependency,
    settings: SettingsDependency,
    board_date: BoardDateQuery = None,
) -> DailyBoardResponse:
    target_date = board_date or datetime.now(ZoneInfo(settings.timezone)).date()
    service = _service(db, settings)
    if settings.seed_demo_on_read and not service.has_frozen_board(target_date):
        service.ingest_and_freeze(target_date)
    return service.get_board(target_date)


@router.post("/api/v1/jobs/daily", response_model=DailyJobResponse)
def run_daily_job(
    db: DatabaseDependency,
    settings: SettingsDependency,
    board_date: BoardDateQuery = None,
) -> DailyJobResponse:
    target_date = board_date or datetime.now(ZoneInfo(settings.timezone)).date()
    result = _service(db, settings).ingest_and_freeze(target_date)
    return to_job_response(result)
