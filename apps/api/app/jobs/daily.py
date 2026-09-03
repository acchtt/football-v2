from datetime import datetime
from zoneinfo import ZoneInfo

from app.config import get_settings
from app.db.models import Base
from app.db.session import SessionLocal, engine
from app.providers.factory import build_providers
from app.services.airtable_sync import AirtableSyncService
from app.services.daily_board import DailyBoardService


def main() -> None:
    settings = get_settings()
    Base.metadata.create_all(bind=engine)
    fixture_provider, stats_provider = build_providers(settings)
    target_date = datetime.now(ZoneInfo(settings.timezone)).date()
    service: DailyBoardService | None = None
    sync_service: AirtableSyncService | None = None
    sync_results = []
    try:
        with SessionLocal() as session:
            service = DailyBoardService(
                session,
                fixture_provider,
                stats_provider,
                settings.model_version,
                settings.timezone,
            )
            result = service.ingest_and_freeze(target_date)

            # Projection happens after the canonical DB transaction commits. Airtable is never
            # allowed to block or roll back a frozen model state.
            sync_service = AirtableSyncService(settings)
            sync_results = sync_service.sync_date(session, target_date)
    finally:
        if sync_service is not None:
            sync_service.close()
        if service is not None:
            service.close()

    synced = sum(item.synced for item in sync_results)
    failed = sum(item.attempted and not item.synced for item in sync_results)
    print(
        f"daily board {target_date}: fetched={result.fetched} "
        f"new={result.newly_frozen} displayed={result.displayed} excluded={result.excluded} "
        f"airtable_synced={synced} airtable_failed={failed}"
    )


if __name__ == "__main__":
    main()
