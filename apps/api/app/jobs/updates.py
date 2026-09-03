from datetime import datetime
from zoneinfo import ZoneInfo

from app.config import get_settings
from app.db.models import Base
from app.db.session import SessionLocal, engine
from app.providers.factory import build_providers
from app.services.airtable_sync import AirtableSyncService
from app.services.automated_updates import AutomatedMatchUpdateService


def main() -> None:
    settings = get_settings()
    Base.metadata.create_all(bind=engine)
    fixture_provider, stats_provider = build_providers(settings)
    target_date = datetime.now(ZoneInfo(settings.timezone)).date()
    update_service: AutomatedMatchUpdateService | None = None
    sync_service: AirtableSyncService | None = None
    try:
        with SessionLocal() as session:
            update_service = AutomatedMatchUpdateService(session, fixture_provider)
            result = update_service.run(target_date)

            # The model/result transaction is already committed by run(). Airtable is a
            # best-effort reporting projection and cannot change the canonical outcome.
            sync_service = AirtableSyncService(settings)
            sync_results = sync_service.sync_date(session, target_date)
    finally:
        if sync_service is not None:
            sync_service.close()
        if update_service is not None:
            update_service.close()
        elif fixture_provider is not stats_provider:
            close = getattr(fixture_provider, "close", None)
            if callable(close):
                close()
        if fixture_provider is not stats_provider:
            close = getattr(stats_provider, "close", None)
            if callable(close):
                close()

    synced = sum(item.synced for item in sync_results)
    failed = sum(item.attempted and not item.synced for item in sync_results)
    print(
        f"updates {target_date}: lineup_candidates={result.lineup_candidates} "
        f"lineups_ingested={result.lineups_ingested} "
        f"result_candidates={result.result_candidates} results_settled={result.results_settled} "
        f"airtable_synced={synced} airtable_failed={failed}"
    )


if __name__ == "__main__":
    main()
