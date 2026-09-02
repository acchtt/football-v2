from datetime import date

import httpx

from app.providers.bsd import BsdProvider


def _event(
    event_id: int,
    kickoff: str,
    home_id: int,
    away_id: int,
    home_name: str,
    away_name: str,
    *,
    status: str = "finished",
    home_score: int | None = None,
    away_score: int | None = None,
) -> dict:
    return {
        "id": event_id,
        "league": {"id": 9, "name": "Test League", "country": "GB"},
        "home_team_id": home_id,
        "away_team_id": away_id,
        "home_team": home_name,
        "away_team": away_name,
        "event_date": kickoff,
        "status": status,
        "home_score": home_score,
        "away_score": away_score,
    }


def test_bsd_provider_builds_ict_board_and_profile() -> None:
    target = _event(
        900,
        "2026-09-02T12:00:00Z",
        10,
        20,
        "Home FC",
        "Away FC",
        status="notstarted",
    )
    out_of_day = _event(
        901,
        "2026-09-02T18:30:00Z",
        30,
        40,
        "Late FC",
        "Tomorrow FC",
        status="notstarted",
    )

    history = {
        10: [
            _event(110, "2026-08-28T12:00:00Z", 10, 31, "Home FC", "A", home_score=3, away_score=1),
            _event(109, "2026-08-22T12:00:00Z", 32, 10, "B", "Home FC", home_score=1, away_score=2),
            _event(108, "2026-08-16T12:00:00Z", 10, 33, "Home FC", "C", home_score=2, away_score=1),
            _event(107, "2026-08-10T12:00:00Z", 34, 10, "D", "Home FC", home_score=2, away_score=2),
            _event(106, "2026-08-04T12:00:00Z", 10, 35, "Home FC", "E", home_score=4, away_score=0),
        ],
        20: [
            _event(210, "2026-08-29T12:00:00Z", 41, 20, "F", "Away FC", home_score=1, away_score=3),
            _event(209, "2026-08-23T12:00:00Z", 20, 42, "Away FC", "G", home_score=2, away_score=2),
            _event(208, "2026-08-17T12:00:00Z", 43, 20, "H", "Away FC", home_score=2, away_score=2),
            _event(207, "2026-08-11T12:00:00Z", 20, 44, "Away FC", "I", home_score=3, away_score=1),
            _event(206, "2026-08-05T12:00:00Z", 45, 20, "J", "Away FC", home_score=0, away_score=2),
        ],
    }

    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        params = request.url.params
        if path.endswith("/events/"):
            team_id = params.get("team_id")
            if team_id:
                rows = history[int(team_id)]
                return httpx.Response(
                    200,
                    json={"count": len(rows), "next": None, "results": rows},
                )
            return httpx.Response(
                200,
                json={"count": 2, "next": None, "results": [target, out_of_day]},
            )

        event_id = int(path.rstrip("/").split("/")[-2])
        event = next(
            row
            for rows in history.values()
            for row in rows
            if row["id"] == event_id
        )
        return httpx.Response(
            200,
            json={
                "home": {
                    "xg": 1.8 if event["home_team_id"] in {10, 20} else 1.0,
                    "big_chances": 3,
                },
                "away": {
                    "xg": 1.7 if event["away_team_id"] in {10, 20} else 0.9,
                    "big_chances": 2,
                },
            },
        )

    client = httpx.Client(transport=httpx.MockTransport(handler))
    provider = BsdProvider("token", history_matches=5, client=client)

    fixtures = provider.fetch_fixtures(date(2026, 9, 2))
    assert len(fixtures) == 1
    fixture = fixtures[0]
    assert fixture.provider_fixture_id == "bsd:900"
    assert fixture.home_team == "Home FC"
    assert fixture.away_team == "Away FC"
    assert fixture.metadata["home_team_id"] == 10
    assert fixture.metadata["away_team_id"] == 20

    profile = provider.fetch_team_profile(fixture)
    assert profile is not None
    assert profile.home_gf == 3.0
    assert profile.away_gf == 2.3333
    assert profile.chance_metrics["xg_coverage"]["home"] == 1.0
    assert profile.chance_metrics["xg_coverage"]["away"] == 1.0

    metrics = provider.fetch_structural_metrics(fixture)
    assert metrics is not None
    assert metrics.data_complete is True


def test_bsd_provider_fails_closed_without_team_ids() -> None:
    event = {
        "id": 901,
        "league": {"id": 9, "name": "Test League", "country": "GB"},
        "home_team": "Home FC",
        "away_team": "Away FC",
        "event_date": "2026-09-02T12:00:00Z",
        "status": "notstarted",
    }

    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"count": 1, "next": None, "results": [event]})

    client = httpx.Client(transport=httpx.MockTransport(handler))
    provider = BsdProvider("token", client=client)
    fixture = provider.fetch_fixtures(date(2026, 9, 2))[0]

    assert provider.fetch_team_profile(fixture) is None
