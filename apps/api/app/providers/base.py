from abc import ABC, abstractmethod
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any


@dataclass(frozen=True, slots=True)
class ProviderFixture:
    provider_fixture_id: str
    provider_name: str
    competition: str
    country_code: str
    home_team: str
    away_team: str
    kickoff_utc: datetime
    status: str = "SCHEDULED"
    metadata: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class LineupPlayer:
    player_id: int | str | None
    name: str
    position: str | None = None
    jersey_number: int | None = None
    captain: bool = False


@dataclass(frozen=True, slots=True)
class ConfirmedLineupSnapshot:
    provider_fixture_id: str
    home_starting_xi: tuple[LineupPlayer, ...]
    away_starting_xi: tuple[LineupPlayer, ...]
    home_substitutes: tuple[LineupPlayer, ...] = ()
    away_substitutes: tuple[LineupPlayer, ...] = ()
    home_formation: str | None = None
    away_formation: str | None = None
    captured_at: datetime | None = None
    source_metadata: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class FinalResultSnapshot:
    provider_fixture_id: str
    status: str
    home_goals_90: int
    away_goals_90: int
    captured_at: datetime | None = None
    source_metadata: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class TeamProfileSnapshot:
    source_key: str
    home_gf: float | None
    home_ga: float | None
    away_gf: float | None
    away_ga: float | None
    recent_gf: Mapping[str, float] = field(default_factory=dict)
    recent_ga: Mapping[str, float] = field(default_factory=dict)
    scoring_2plus_frequency: Mapping[str, float] = field(default_factory=dict)
    conceding_2plus_frequency: Mapping[str, float] = field(default_factory=dict)
    clean_sheet_rate: Mapping[str, float] = field(default_factory=dict)
    home_split: Mapping[str, Any] = field(default_factory=dict)
    away_split: Mapping[str, Any] = field(default_factory=dict)
    chance_metrics: Mapping[str, Any] = field(default_factory=dict)
    source_metadata: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class StructuralMetrics:
    two_sided_strength: float
    carrier_ceiling: float
    opponent_secondary_route: float
    failure_mode_resistance: float
    profile_gate: float
    chance_quality: float
    data_complete: bool
    failure_modes: tuple[str, ...] = ()
    evidence: Mapping[str, Any] = field(default_factory=dict)
    source_metadata: Mapping[str, Any] = field(default_factory=dict)


class FixtureProvider(ABC):
    name: str

    @abstractmethod
    def fetch_fixtures(self, target_date_ict: date) -> list[ProviderFixture]:
        """Fetch the full slate for one ICT calendar date."""

    def fetch_confirmed_lineup(
        self, provider_fixture_id: str
    ) -> ConfirmedLineupSnapshot | None:
        """Return only an official confirmed teamsheet; predicted XI must return None."""
        return None

    def fetch_final_result(self, provider_fixture_id: str) -> FinalResultSnapshot | None:
        """Return the regulation-time final score when the provider marks it final."""
        return None


class StatsProvider(ABC):
    @abstractmethod
    def fetch_team_profile(self, fixture: ProviderFixture) -> TeamProfileSnapshot | None:
        """Return a timestamped profile snapshot or None when evidence is unavailable."""

    @abstractmethod
    def fetch_structural_metrics(self, fixture: ProviderFixture) -> StructuralMetrics | None:
        """Return normalized engine inputs without deciding the grade."""
