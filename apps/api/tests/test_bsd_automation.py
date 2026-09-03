import json

import httpx

from app.providers.bsd_automation import BsdAutomationProvider


def _provider(handler):  # type: ignore[no-untyped-def]
    client = httpx.Client(transport=httpx.MockTransport(handler))
    return BsdAutomationProvider(api_token="test-token", client=client)


def test_confirmed_lineup_is_ingested_with_bench_and_captain() -> None:
    payload = {
        "event_id": 42,
        "lineup_status": "confirmed",
        "beta": False,
        "updated_at": "2026-09-03T10:00:00Z",
        "lineups": {
            "home": {
                "formation": "4-2-3-1",
                "starting_xi": [
                    {"player_id": 1, "name": "Home Keeper", "number": 1, "pos": "G"},
                    {"player_id": 9, "name": "Home Striker", "number": 9, "pos": "F", "captain": True},
                ],
                "substitutes": [{"player_id": 19, "name": "Home Sub", "number": 19}],
            },
            "away": {
                "formation": "4-3-3",
                "starting_xi": [
                    {"player": {"id": 2, "name": "Away Keeper"}, "jersey_number": 1},
                    {"player": {"id": 10, "name": "Away Forward"}, "jersey_number": 10},
                ],
                "bench": [{"player_id": 20, "player_name": "Away Sub"}],
            },
        },
    }

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/v2/events/42/lineups/"
        assert request.headers["Authorization"] == "Token test-token"
        return httpx.Response(200, json=payload)

    provider = _provider(handler)
    snapshot = provider.fetch_confirmed_lineup("bsd:42")

    assert snapshot is not None
    assert snapshot.home_formation == "4-2-3-1"
    assert snapshot.away_formation == "4-3-3"
    assert [player.name for player in snapshot.home_starting_xi] == [
        "Home Keeper",
        "Home Striker",
    ]
    assert snapshot.home_starting_xi[1].captain is True
    assert snapshot.away_substitutes[0].name == "Away Sub"
    assert snapshot.source_metadata["lineup_status"] == "confirmed"


def test_predicted_lineup_is_never_ingested_as_confirmed() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "event_id": 42,
                "lineup_status": "predicted",
                "beta": True,
                "lineups": {"home": {}, "away": {}},
            },
        )

    provider = _provider(handler)
    assert provider.fetch_confirmed_lineup("bsd:42") is None


def test_finished_result_uses_regulation_score_only() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/api/v2/events/42/"
        return httpx.Response(
            200,
            content=json.dumps(
                {
                    "id": 42,
                    "status": "finished",
                    "home_score": 2,
                    "away_score": 2,
                    "extra_time_score": {"home": 1, "away": 0},
                    "penalty_shootout": None,
                }
            ).encode(),
            headers={"Content-Type": "application/json"},
        )

    provider = _provider(handler)
    result = provider.fetch_final_result("bsd:42")

    assert result is not None
    assert result.home_goals_90 == 2
    assert result.away_goals_90 == 2
    assert result.source_metadata["score_basis"] == "REGULATION_TIME"


def test_non_final_result_is_not_settled() -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"id": 42, "status": "live", "home_score": 2, "away_score": 2},
        )

    provider = _provider(handler)
    assert provider.fetch_final_result("bsd:42") is None
