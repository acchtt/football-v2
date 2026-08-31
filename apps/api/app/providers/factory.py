from app.config import Settings

from .base import FixtureProvider, StatsProvider
from .demo import DemoProvider


def build_providers(settings: Settings) -> tuple[FixtureProvider, StatsProvider]:
    if settings.fixture_provider == "demo":
        provider = DemoProvider()
        return provider, provider
    raise RuntimeError(
        f"Provider {settings.fixture_provider!r} is not configured; use 'demo' or add an adapter"
    )
