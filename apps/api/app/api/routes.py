import hmac
from datetime import date, datetime
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, Header, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db.session import get_db
from app.providers.factory import build_providers, provider_status
from app.schemas.analysis import (
    LineupCorrectionRequest,
    LineupSubmissionView,
    MatchDetailResponse,
    OddsCorrectionRequest,
    OddsSubmissionView,
    VerdictResponse,
)
from app.schemas.board import DailyBoardResponse, DailyJobResponse
from app.schemas.market import MarketStatusView
from app.schemas.research import ResearchImportRequest
from app.services.daily_board import DailyBoardService, to_job_response
from app.services.market_verification import MarketVerificationService
from app.services.match_analysis import MatchAnalysisService
from app.services.research_import import build_research_provider
from app.storage import LocalUploadStorage
from app.vision import ImagePayload, build_vision_adapter

router = APIRouter()
DatabaseDependency = Annotated[Session, Depends(get_db)]
SettingsDependency = Annotated[Settings, Depends(get_settings)]
BoardDateQuery = Annotated[date | None, Query(alias="date")]
UploadedFiles = Annotated[list[UploadFile], File(description="One or more screenshots")]
ResearchImportToken = Annotated[str | None, Header(alias="X-Research-Import-Token")]


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


def _market_service(db: Session, settings: Settings) -> MarketVerificationService:
    return MarketVerificationService(session=db, settings=settings)


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


def _authorize_research_import(settings: Settings, supplied_token: str | None) -> None:
    configured_token = settings.research_import_token
    if not configured_token:
        raise HTTPException(status_code=503, detail="Research import is not configured")
    if not supplied_token or not hmac.compare_digest(supplied_token, configured_token):
        raise HTTPException(status_code=401, detail="Invalid research import token")


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/api/v1/providers/status")
def data_provider_status(settings: SettingsDependency) -> dict[str, str | bool]:
    """Report readiness without making a billable provider request or exposing credentials."""
    return provider_status(settings)


@router.get("/api/v1/board", response_model=DailyBoardResponse)
def daily_board(
    db: DatabaseDependency,
    settings: SettingsDependency,
    board_date: BoardDateQuery = None,
) -> DailyBoardResponse:
    target_date = board_date or datetime.now(ZoneInfo(settings.timezone)).date()
    service = _service(db, settings)
    try:
        if (
            settings.fixture_provider == "demo"
            and settings.seed_demo_on_read
            and not service.has_frozen_board(target_date)
        ):
            service.ingest_and_freeze(target_date)
        return service.get_board(target_date)
    finally:
        service.close()


@router.post("/api/v1/jobs/daily", response_model=DailyJobResponse)
def run_daily_job(
    db: DatabaseDependency,
    settings: SettingsDependency,
    board_date: BoardDateQuery = None,
) -> DailyJobResponse:
    target_date = board_date or datetime.now(ZoneInfo(settings.timezone)).date()
    service = _service(db, settings)
    try:
        return to_job_response(service.ingest_and_freeze(target_date))
    finally:
        service.close()


@router.post("/api/v1/imports/research", response_model=DailyJobResponse)
def import_researched_slate(
    payload: ResearchImportRequest,
    db: DatabaseDependency,
    settings: SettingsDependency,
    import_token: ResearchImportToken = None,
) -> DailyJobResponse:
    """Freeze a sourced slate assembled through the normal web-research workflow."""
    _authorize_research_import(settings, import_token)
    provider = build_research_provider(payload)
    service = DailyBoardService(
        session=db,
        fixture_provider=provider,
        stats_provider=provider,
        model_version=settings.model_version,
        timezone=settings.timezone,
    )
    try:
        return to_job_response(service.ingest_and_freeze(payload.board_date_ict))
    finally:
        service.close()


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


@router.get("/api/v1/matches/{fixture_id}/market", response_model=MarketStatusView)
def market_status(
    fixture_id: str,
    db: DatabaseDependency,
    settings: SettingsDependency,
) -> MarketStatusView:
    try:
        return _market_service(db, settings).status(fixture_id)
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


@router.post(
    "/api/v1/matches/{fixture_id}/odds/{submission_id}/verify",
    response_model=MarketStatusView,
)
def verify_odds(
    fixture_id: str,
    submission_id: str,
    db: DatabaseDependency,
    settings: SettingsDependency,
) -> MarketStatusView:
    try:
        return _market_service(db, settings).verify(fixture_id, submission_id)
    except (LookupError, ValueError, RuntimeError) as error:
        raise _http_error(error) from error


@router.post("/api/v1/matches/{fixture_id}/verdict", response_model=VerdictResponse)
def issue_verdict(
    fixture_id: str,
    db: DatabaseDependency,
    settings: SettingsDependency,
) -> VerdictResponse:
    del fixture_id, db, settings
    raise HTTPException(
        status_code=503,
        detail=(
            "Final LOCK/HOLD engine is disabled until the canonical situational adjustment, "
            "projected goal distribution, fair-total, and market-comparison logic is approved. "
            "Verified markets stop at MARKET_RECEIVED."
        ),
    )
