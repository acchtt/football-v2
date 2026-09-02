from app.config import Settings

from .base import FixtureProvider, StatsProvider
from .bsd import BsdProvider
from .demo import DemoProvider
from .sportmonks import SportmonksProvider


def build_providers(settings: Settings) -> tuple[FixtureProvider, StatsProvider]:
    if settings.fixture_provider == "demo":
        provider = DemoProvider()
        return provider, provider
    if settings.fixture_provider == "bsd":
        if not settings.bsd_api_token:
            raise RuntimeError("BSD_API_TOKEN is required when FIXTURE_PROVIDER=bsd")
        provider = BsdProvider(
            api_token=settings.bsd_api_token,
            base_url=settings.bsd_base_url,
            timeout_seconds=settings.bsd_timeout_seconds,
            history_matches=settings.bsd_history_matches,
            lookback_days=settings.bsd_lookback_days,
        )
        return provider, provider
    if settings.fixture_provider == "sportmonks":
        if not settings.sportmonks_api_token:
            raise RuntimeError(
                "SPORTMONKS_API_TOKEN is required when FIXTURE_PROVIDER=sportmonks"
            )
        provider = SportmonksProvider(
            api_token=settings.sportmonks_api_token,
            base_url=settings.sportmonks_base_url,
            timeout_seconds=settings.sportmonks_timeout_seconds,
            history_matches=settings.sportmonks_history_matches,
            lookback_days=settings.sportmonks_lookback_days,
        )
        return provider, provider
    raise RuntimeError(
        f"Provider {settings.fixture_provider!r} is not configured; "
        "use 'demo', 'bsd', or 'sportmonks'"
    )


def provider_status(settings: Settings) -> dict[str, str | bool]:
    provider = settings.fixture_provider.lower()
    if provider == "demo":
        return {"provider": "demo", "configured": True, "mode": "synthetic"}
    if provider == "bsd":
        return {
            "provider": "bsd",
            "configured": bool(settings.bsd_api_token),
            "mode": "production",
        }
    if provider == "sportmonks":
        return {
            "provider": "sportmonks",
            "configured": bool(settings.sportmonks_api_token),
            "mode": "production",
        }
    return {"provider": provider, "configured": False, "mode": "unsupported"}
