from app.config import Settings

from .base import FixtureProvider, StatsProvider
from .demo import DemoProvider
from .scoped import CompetitionScopedProvider
from .sportmonks import SportmonksProvider


def _scoped(provider: FixtureProvider) -> tuple[FixtureProvider, StatsProvider]:
    scoped = CompetitionScopedProvider(provider)
    return scoped, scoped


def build_providers(settings: Settings) -> tuple[FixtureProvider, StatsProvider]:
    if settings.fixture_provider == "demo":
        return _scoped(DemoProvider())
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
        return _scoped(provider)
    raise RuntimeError(
        f"Provider {settings.fixture_provider!r} is not configured; use 'demo' or 'sportmonks'"
    )


def provider_status(settings: Settings) -> dict[str, str | bool]:
    provider = settings.fixture_provider.lower()
    if provider == "demo":
        return {"provider": "demo", "configured": True, "mode": "synthetic"}
    if provider == "sportmonks":
        return {
            "provider": "sportmonks",
            "configured": bool(settings.sportmonks_api_token),
            "mode": "production",
        }
    return {"provider": provider, "configured": False, "mode": "unsupported"}
