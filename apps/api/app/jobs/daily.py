from datetime import datetime
from zoneinfo import ZoneInfo

from app.config import get_settings
from app.db.models import Base
from app.db.session import SessionLocal, engine
from app.providers.factory import build_providers
from app.services.daily_board import DailyBoardService


def main() -> None:
    settings = get_settings()
    Base.metadata.create_all(bind=engine)
    fixture_provider, stats_provider = build_providers(settings)
    target_date = datetime.now(ZoneInfo(settings.timezone)).date()
    service: DailyBoardService | None = None
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
    finally:
        if service is not None:
            service.close()
    print(
        f"daily board {target_date}: fetched={result.fetched} "
        f"new={result.newly_frozen} displayed={result.displayed} excluded={result.excluded}"
    )


if __name__ == "__main__":
    main()
