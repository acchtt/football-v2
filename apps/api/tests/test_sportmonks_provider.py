from datetime import UTC, date, datetime, timedelta

import httpx

from app.config import Settings
from app.providers.base import TeamProfileSnapshot
from app.providers.factory import build_providers, provider_status
from app.providers.normalization import normalize_structural_metrics
from app.providers.sportmonks import SportmonksProvider


def _participant(team_id: int, name: str, location: str) -> dict[str, object]:
    return {"id": team_id, "name": name, "meta": {"location": location}}


def _history_fixture(team_id: int, index: int, desired_venue: str) -> dict[str, object]:
    opponent_id = team_id + 1000 + index
    is_home = (index % 2 == 0) == (desired_venue == "home")
    home_id, away_id = (team_id, opponent_id) if is_home else (opponent_id, team_id)
    home_name, away_name = ("Target", "Opponent") if is_home else ("Opponent", "Target")
    team_goals = float(2 + (index % 2))
    opponent_goals = float(index % 2)
    home_goals, away_goals = (
        (team_goals, opponent_goals) if is_home else (opponent_goals, team_goals)
    )
    kickoff = datetime(2026, 8, 29, 12, tzinfo=UTC) - timedelta(days=index * 7)
    return {
        "id": team_id * 100 + index,
        "starting_at": kickoff.isoformat(),
        "state": {"developer_name": "FT"},
        "participants": [
            _participant(home_id, home_name, "home"),
            _participant(away_id, away_name, "away"),
        ],
        "scores": [
            {
                "participant_id": home_id,
                "description": "CURRENT",
                "score": {"goals": home_goals, "participant": "home"},
            },
            {
                "participant_id": away_id,
                "description": "CURRENT",
                "score": {"goals": away_goals, "participant": "away"},
            },
        ],
        "statistics": [
            {
                "participant_id": team_id,
                "type": {"developer_name": "EXPECTED_GOALS"},
                "data": {"value": 2.15 + index / 100},
            },
            {
                "participant_id": opponent_id,
                "type": {"developer_name": "EXPECTED_GOALS"},
                "data": {"value": 0.85 + index / 100},
            },
            {
                "participant_id": team_id,
                "type": {"developer_name": "BIG_CHANCES_CREATED"},
                "data": {"value": 4},
            },
            {
                "participant_id": opponent_id,
                "type": {"developer_name": "BIG_CHANCES_CREATED"},
                "data": {"value": 1},
            },
        ],
    }


def _provider(include_xg: bool = True) -> tuple[SportmonksProvider, list[httpx.Request]]:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        path = request.url.path
        if path.endswith("/fixtures/between/2026-08-30/2026-09-01"):
            return httpx.Response(
                200,
                json={
                    "data": [
                        {
                            "id": 9001,
                            "starting_at": "2026-08-31T16:00:00Z",
                            "league_id": 8,
                            "season_id": 2026,
                            "league": {
                                "id": 8,
                                "name": "Premier League",
                                "country": {"iso2": "GB-ENG"},
                            },
                            "state": {"developer_name": "NS"},
                            "participants": [
                                _participant(10, "Home FC", "home"),
                                _participant(20, "Away FC", "away"),
                            ],
                        },
                        {
                            "id": 9002,
                            "starting_at": "2026-08-30T16:00:00Z",
                            "league": {"name": "Premier League"},
                            "participants": [
                                _participant(30, "Wrong Day", "home"),
                                _participant(40, "Other", "away"),
                            ],
                        },
                    ],
                    "pagination": {"has_more": False, "current_page": 1, "total_pages": 1},
                },
            )
        if path.endswith("/10") or path.endswith("/20"):
            team_id = 10 if path.endswith("/10") else 20
            desired_venue = "home" if team_id == 10 else "away"
            history = [_history_fixture(team_id, index, desired_venue) for index in range(10)]
            if not include_xg:
                for fixture in history:
                    fixture["statistics"] = []
            return httpx.Response(
                200,
                json={
                    "data": history,
                    "pagination": {"has_more": False, "current_page": 1, "total_pages": 1},
                },
            )
        return httpx.Response(404, json={"message": "unexpected path"})

    client = httpx.Client(transport=httpx.MockTransport(handler))
    return SportmonksProvider("secret-token", client=client), requests


def test_sportmonks_fetches_ict_slate_and_normalizes_history() -> None:
    provider, requests = _provider()
    fixtures = provider.fetch_fixtures(date(2026, 8, 31))

    assert len(fixtures) == 1
    fixture = fixtures[0]
    assert fixture.provider_fixture_id == "sportmonks:9001"
    assert fixture.home_team == "Home FC"
    assert fixture.away_team == "Away FC"
    assert fixture.metadata["home_team_id"] == 10

    profile = provider.fetch_team_profile(fixture)
    metrics = provider.fetch_structural_metrics(fixture)

    assert profile is not None
    assert metrics is not None
    assert profile.home_gf == 2.0
    assert profile.away_gf == 2.0
    assert profile.chance_metrics["xg_coverage"] == {"home": 1.0, "away": 1.0}
    assert metrics.data_complete is True
    assert metrics.carrier_ceiling > 70
    assert metrics.chance_quality > 70
    assert len(requests) == 3
    assert all(request.url.params["api_token"] == "secret-token" for request in requests)


def test_missing_xg_add_on_fails_closed() -> None:
    provider, _requests = _provider(include_xg=False)
    fixture = provider.fetch_fixtures(date(2026, 8, 31))[0]
    profile = provider.fetch_team_profile(fixture)

    assert profile is not None
    metrics = normalize_structural_metrics(profile)
    assert metrics.data_complete is False
    assert metrics.chance_quality == 0
    assert "home_xg_coverage" in metrics.failure_modes[0]
    assert "away_xg_coverage" in metrics.failure_modes[0]


def test_normalizer_requires_venue_samples_even_with_aggregate_values() -> None:
    profile = TeamProfileSnapshot(
        source_key="thin-splits",
        home_gf=2.1,
        home_ga=1.1,
        away_gf=1.8,
        away_ga=1.3,
        recent_gf={"home": 2.2, "away": 1.9},
        scoring_2plus_frequency={"home": 0.7, "away": 0.6},
        conceding_2plus_frequency={"home": 0.4, "away": 0.5},
        clean_sheet_rate={"home": 0.2, "away": 0.2},
        chance_metrics={
            "home_xg_for": 2.0,
            "away_xg_for": 1.7,
            "sample_counts": {
                "home_all": 8,
                "away_all": 8,
                "home_split": 2,
                "away_split": 2,
            },
            "xg_coverage": {"home": 1.0, "away": 1.0},
        },
    )

    metrics = normalize_structural_metrics(profile)

    assert metrics.data_complete is False
    assert metrics.evidence["completeness"]["home_venue_split"] is False


def test_factory_requires_token_and_status_never_exposes_it() -> None:
    missing = Settings(fixture_provider="sportmonks", sportmonks_api_token=None)
    assert provider_status(missing) == {
        "provider": "sportmonks",
        "configured": False,
        "mode": "production",
    }

    configured = Settings(fixture_provider="sportmonks", sportmonks_api_token="top-secret")
    fixture_provider, stats_provider = build_providers(configured)

    assert fixture_provider is stats_provider
    assert provider_status(configured) == {
        "provider": "sportmonks",
        "configured": True,
        "mode": "production",
    }
