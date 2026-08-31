from datetime import UTC, date, datetime, time
from zoneinfo import ZoneInfo

from .base import (
    FixtureProvider,
    ProviderFixture,
    StatsProvider,
    StructuralMetrics,
    TeamProfileSnapshot,
)

ICT = ZoneInfo("Asia/Ho_Chi_Minh")


def _kickoff(target_date: date, hour: int, minute: int = 0) -> datetime:
    return datetime.combine(target_date, time(hour, minute), tzinfo=ICT).astimezone(UTC)


class DemoProvider(FixtureProvider, StatsProvider):
    name = "demo"

    def fetch_fixtures(self, target_date_ict: date) -> list[ProviderFixture]:
        fixtures = [
            ("chelsea-brighton", "Premier League", "GB-ENG", "Chelsea", "Brighton", 20, 0),
            ("real-malaga", "Copa del Rey", "ES", "Real Madrid", "Málaga", 22, 0),
            ("bodo-rosenborg", "Eliteserien", "NO", "Bodø/Glimt", "Rosenborg", 19, 30),
            ("ajax-utrecht", "Eredivisie", "NL", "Ajax", "Utrecht", 23, 15),
            ("ulsan-seoul", "K League 1", "KR", "Ulsan HD", "FC Seoul", 17, 30),
            ("torino-lecce", "Serie A", "IT", "Torino", "Lecce", 21, 45),
        ]
        date_key = target_date_ict.isoformat()
        return [
            ProviderFixture(
                provider_fixture_id=f"demo:{date_key}:{slug}",
                provider_name=self.name,
                competition=competition,
                country_code=country,
                home_team=home,
                away_team=away,
                kickoff_utc=_kickoff(target_date_ict, hour, minute),
            )
            for slug, competition, country, home, away, hour, minute in fixtures
        ]

    def _slug(self, fixture: ProviderFixture) -> str:
        return fixture.provider_fixture_id.rsplit(":", 1)[-1]

    def fetch_team_profile(self, fixture: ProviderFixture) -> TeamProfileSnapshot | None:
        slug = self._slug(fixture)
        profiles = {
            "chelsea-brighton": (2.32, 0.94, 1.84, 1.47, 0.71, 0.62),
            "real-malaga": (3.05, 0.78, 1.14, 1.39, 0.84, 0.44),
            "bodo-rosenborg": (2.71, 1.03, 1.88, 1.55, 0.78, 0.57),
            "ajax-utrecht": (2.36, 1.21, 1.73, 1.42, 0.69, 0.55),
            "ulsan-seoul": (1.82, 0.91, 1.47, 1.18, 0.53, 0.38),
            "torino-lecce": (1.08, 1.02, 0.91, 1.45, 0.26, 0.31),
        }
        values = profiles.get(slug)
        if values is None:
            return None
        home_gf, home_ga, away_gf, away_ga, home_2plus, away_2plus = values
        return TeamProfileSnapshot(
            source_key=f"demo-profile:{fixture.provider_fixture_id}",
            home_gf=home_gf,
            home_ga=home_ga,
            away_gf=away_gf,
            away_ga=away_ga,
            recent_gf={"home": home_gf + 0.12, "away": away_gf + 0.08},
            recent_ga={"home": home_ga, "away": away_ga + 0.11},
            scoring_2plus_frequency={"home": home_2plus, "away": away_2plus},
            conceding_2plus_frequency={"home": 0.27, "away": 0.46},
            clean_sheet_rate={"home": 0.31, "away": 0.18},
            home_split={"gf": home_gf, "ga": home_ga},
            away_split={"gf": away_gf, "ga": away_ga},
            chance_metrics={"sample": True, "quality": "demo-normalized"},
            source_metadata={"provider": "demo", "captured_for": fixture.provider_fixture_id},
        )

    def fetch_structural_metrics(self, fixture: ProviderFixture) -> StructuralMetrics | None:
        slug = self._slug(fixture)
        values = {
            "chelsea-brighton": StructuralMetrics(
                93,
                75,
                74,
                83,
                88,
                86,
                True,
                ("Favourite may manage a two-goal lead",),
                {"summary": "Genuine two-sided creation with resilient profiles"},
            ),
            "real-malaga": StructuralMetrics(
                62,
                97,
                34,
                80,
                91,
                90,
                True,
                ("Opponent contribution is optional rather than reliable",),
                {"summary": "Elite carrier owns a credible independent 3+ route"},
            ),
            "bodo-rosenborg": StructuralMetrics(
                70,
                88,
                58,
                70,
                82,
                80,
                True,
                ("Carrier slowdown after a comfortable lead",),
                {"summary": "Strong carrier with a meaningful secondary route"},
            ),
            "ajax-utrecht": StructuralMetrics(
                76,
                81,
                61,
                62,
                69,
                68,
                True,
                ("Defensive resistance and game-state dependence",),
                {"summary": "Good environment with one material failure route"},
            ),
            "ulsan-seoul": StructuralMetrics(
                80,
                82,
                55,
                75,
                76,
                74,
                True,
                (),
                {"summary": "Must remain excluded regardless of numerical score"},
            ),
            "torino-lecce": StructuralMetrics(
                38,
                44,
                22,
                46,
                41,
                37,
                True,
                ("Weak repeatable creation", "High suppression tendency"),
                {"summary": "Fragile route below shortlist quality"},
            ),
        }
        metrics = values.get(slug)
        if metrics is None:
            return None
        return StructuralMetrics(
            two_sided_strength=metrics.two_sided_strength,
            carrier_ceiling=metrics.carrier_ceiling,
            opponent_secondary_route=metrics.opponent_secondary_route,
            failure_mode_resistance=metrics.failure_mode_resistance,
            profile_gate=metrics.profile_gate,
            chance_quality=metrics.chance_quality,
            data_complete=metrics.data_complete,
            failure_modes=metrics.failure_modes,
            evidence=metrics.evidence,
            source_metadata={"provider": "demo", "mode": "seed"},
        )
