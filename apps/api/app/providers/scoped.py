from __future__ import annotations

from typing import Any

from app.competition_scope import evaluate_competition

from .base import (
    ConfirmedLineupSnapshot,
    FinalResultSnapshot,
    FixtureProvider,
    ProviderFixture,
    StatsProvider,
    StructuralMetrics,
    TeamProfileSnapshot,
)


class CompetitionScopedProvider(FixtureProvider, StatsProvider):
    """Apply canonical competition eligibility before any profile/ranking work."""

    def __init__(self, inner: Any) -> None:
        self.inner = inner
        self.name = getattr(inner, "name", "scoped")

    def fetch_fixtures(self, target_date_ict):  # type: ignore[no-untyped-def]
        fixtures: list[ProviderFixture] = self.inner.fetch_fixtures(target_date_ict)
        return [
            fixture
            for fixture in fixtures
            if evaluate_competition(
                fixture.competition,
                fixture.country_code,
                fixture.metadata,
            ).eligible
        ]

    def fetch_confirmed_lineup(
        self, provider_fixture_id: str
    ) -> ConfirmedLineupSnapshot | None:
        return self.inner.fetch_confirmed_lineup(provider_fixture_id)

    def fetch_final_result(self, provider_fixture_id: str) -> FinalResultSnapshot | None:
        return self.inner.fetch_final_result(provider_fixture_id)

    def fetch_team_profile(self, fixture: ProviderFixture) -> TeamProfileSnapshot | None:
        return self.inner.fetch_team_profile(fixture)

    def fetch_structural_metrics(self, fixture: ProviderFixture) -> StructuralMetrics | None:
        return self.inner.fetch_structural_metrics(fixture)

    def close(self) -> None:
        close = getattr(self.inner, "close", None)
        if callable(close):
            close()
