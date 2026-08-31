from datetime import date, datetime
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db.session import get_db
from app.providers.factory import build_providers
from app.schemas.analysis import (
    LineupCorrectionRequest,
    LineupSubmissionView,
    MatchDetailResponse,
    OddsCorrectionRequest,
    OddsSubmissionView,
    VerdictResponse,
)
from app.schemas.board import DailyBoardResponse, DailyJobResponse
from app.services.daily_board import DailyBoardService, to_job_response
from app.services.match_analysis import MatchAnalysisService
from app.storage import LocalUploadStorage
from app.vision import ImagePayload, build_vision_adapter

router = APIRouter()
DatabaseDependency = Annotated[Session, Depends(get_db)]
SettingsDependency = Annotated[Settings, Depends(get_settings)]
BoardDateQuery = Annotated[date | None, Query(alias="date")]
UploadedFiles = Annotated[list[UploadFile], File(description="One or more screenshots")]


def _service(db: Session, settings: Settings) -> DailyBoardService:
    fixture_provider, stats_provider = build_providers(settings)
    return DailyBoardService(
        session=db,
        fixture_provider=fixture_provider,
        stats_provider=stats_provider,
        model_version=settings.model_version,
        timezone=settings.timezone,
    )


def _analysis_service(db: Session, settings: Settings) -> MatchAnalysisService:
    return MatchAnalysisService(
        session=db,
        vision=build_vision_adapter(settings),
        storage=LocalUploadStorage(
            settings.upload_dir,
            settings.max_upload_bytes,
            settings.max_upload_files,
        ),
        settings=settings,
    )


def _image_payloads(files: list[UploadFile]) -> tuple[ImagePayload, ...]:
    return tuple(
        ImagePayload(
            filename=file.filename or "screenshot",
            content_type=file.content_type or "application/octet-stream",
            content=file.file.read(),
        )
        for file in files
    )


def _http_error(error: Exception) -> HTTPException:
    if isinstance(error, LookupError):
        return HTTPException(status_code=404, detail=str(error))
    if isinstance(error, ValueError):
        return HTTPException(status_code=422, detail=str(error))
    return HTTPException(status_code=503, detail=str(error))


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


@router.get("/api/v1/matches/{fixture_id}", response_model=MatchDetailResponse)
def match_detail(
    fixture_id: str,
    db: DatabaseDependency,
    settings: SettingsDependency,
) -> MatchDetailResponse:
    try:
        return _analysis_service(db, settings).get_detail(fixture_id)
    except (LookupError, ValueError, RuntimeError) as error:
        raise _http_error(error) from error


@router.post(
    "/api/v1/matches/{fixture_id}/lineup",
    response_model=LineupSubmissionView,
)
def upload_lineup(
    fixture_id: str,
    files: UploadedFiles,
    db: DatabaseDependency,
    settings: SettingsDependency,
) -> LineupSubmissionView:
    try:
        return _analysis_service(db, settings).submit_lineup(
            fixture_id,
            _image_payloads(files),
        )
    except (LookupError, ValueError, RuntimeError) as error:
        raise _http_error(error) from error


@router.post(
    "/api/v1/matches/{fixture_id}/odds",
    response_model=OddsSubmissionView,
)
def upload_odds(
    fixture_id: str,
    files: UploadedFiles,
    db: DatabaseDependency,
    settings: SettingsDependency,
) -> OddsSubmissionView:
    try:
        return _analysis_service(db, settings).submit_odds(
            fixture_id,
            _image_payloads(files),
        )
    except (LookupError, ValueError, RuntimeError) as error:
        raise _http_error(error) from error


@router.post(
    "/api/v1/matches/{fixture_id}/lineup/{submission_id}/corrections",
    response_model=LineupSubmissionView,
)
def correct_lineup(
    fixture_id: str,
    submission_id: str,
    correction: LineupCorrectionRequest,
    db: DatabaseDependency,
    settings: SettingsDependency,
) -> LineupSubmissionView:
    try:
        return _analysis_service(db, settings).correct_lineup(
            fixture_id,
            submission_id,
            correction,
        )
    except (LookupError, ValueError, RuntimeError) as error:
        raise _http_error(error) from error


@router.post(
    "/api/v1/matches/{fixture_id}/odds/{submission_id}/corrections",
    response_model=OddsSubmissionView,
)
def correct_odds(
    fixture_id: str,
    submission_id: str,
    correction: OddsCorrectionRequest,
    db: DatabaseDependency,
    settings: SettingsDependency,
) -> OddsSubmissionView:
    try:
        return _analysis_service(db, settings).correct_odds(
            fixture_id,
            submission_id,
            correction,
        )
    except (LookupError, ValueError, RuntimeError) as error:
        raise _http_error(error) from error


@router.post("/api/v1/matches/{fixture_id}/verdict", response_model=VerdictResponse)
def issue_verdict(
    fixture_id: str,
    db: DatabaseDependency,
    settings: SettingsDependency,
) -> VerdictResponse:
    try:
        return _analysis_service(db, settings).decide(fixture_id)
    except (LookupError, ValueError, RuntimeError) as error:
        raise _http_error(error) from error
