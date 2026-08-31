from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from .base import (
    FixtureProvider,
    ProviderFixture,
    StatsProvider,
    StructuralMetrics,
    TeamProfileSnapshot,
)


@dataclass(frozen=True, slots=True)
class ResearchFixtureRecord:
    fixture: ProviderFixture
    profile: TeamProfileSnapshot | None
    metrics: StructuralMetrics


class ResearchImportProvider(FixtureProvider, StatsProvider):
    """In-memory provider for one authenticated, source-backed research batch."""

    name = "research"

    def __init__(self, target_date: date, records: list[ResearchFixtureRecord]) -> None:
        self.target_date = target_date
        self.records = tuple(records)
        self._records_by_id = {
            record.fixture.provider_fixture_id: record for record in self.records
        }
        if len(self._records_by_id) != len(self.records):
            raise ValueError("Research import contains duplicate fixture identities")

    def fetch_fixtures(self, target_date_ict: date) -> list[ProviderFixture]:
        if target_date_ict != self.target_date:
            return []
        return sorted(
            (record.fixture for record in self.records),
            key=lambda fixture: fixture.kickoff_utc,
        )

    def fetch_team_profile(self, fixture: ProviderFixture) -> TeamProfileSnapshot | None:
        record = self._records_by_id.get(fixture.provider_fixture_id)
        return record.profile if record is not None else None

    def fetch_structural_metrics(self, fixture: ProviderFixture) -> StructuralMetrics | None:
        record = self._records_by_id.get(fixture.provider_fixture_id)
        return record.metrics if record is not None else None
