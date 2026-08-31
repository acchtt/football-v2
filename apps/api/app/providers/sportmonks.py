from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from .base import (
    FixtureProvider,
    ProviderFixture,
    StatsProvider,
    StructuralMetrics,
    TeamProfileSnapshot,
)
from .normalization import normalize_structural_metrics

ICT = ZoneInfo("Asia/Ho_Chi_Minh")
FINISHED_STATES = {
    "AET",
    "AFTER_EXTRA_TIME",
    "AFTER_PENALTIES",
    "AWARDED",
    "FINISHED",
    "FT",
    "FT_PEN",
}


@dataclass(frozen=True, slots=True)
class TeamMatchSample:
    fixture_id: str
    kickoff_utc: datetime
    venue: str
    goals_for: float
    goals_against: float
    xg_for: float | None
    xg_against: float | None
    big_chances_for: float | None
    big_chances_against: float | None


def _as_float(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _mean(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 4) if values else None


def _frequency(values: list[float], predicate: Any) -> float:
    return round(sum(1 for value in values if predicate(value)) / len(values), 4) if values else 0.0


def _parse_datetime(value: Any) -> datetime:
    if not isinstance(value, str) or not value:
        raise ValueError("Sportmonks fixture is missing starting_at")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed.astimezone(UTC)


def _developer_name(value: Any) -> str:
    if not isinstance(value, dict):
        return ""
    name = value.get("developer_name") or value.get("short_name") or value.get("name") or ""
    return str(name).upper()


def _statistic(
    statistics: dict[tuple[int, str], float], participant_id: int, *names: str
) -> float | None:
    return next(
        (
            statistics[(participant_id, name)]
            for name in names
            if (participant_id, name) in statistics
        ),
        None,
    )


class SportmonksProvider(FixtureProvider, StatsProvider):
    name = "sportmonks"

    def __init__(
        self,
        api_token: str,
        base_url: str = "https://api.sportmonks.com/v3/football",
        timeout_seconds: float = 20.0,
        history_matches: int = 10,
        lookback_days: int = 180,
        client: httpx.Client | None = None,
    ) -> None:
        if not api_token:
            raise ValueError("A Sportmonks API token is required")
        self.api_token = api_token
        self.base_url = base_url.rstrip("/")
        self.history_matches = max(5, history_matches)
        self.lookback_days = max(30, lookback_days)
        self.client = client or httpx.Client(timeout=timeout_seconds, trust_env=False)
        self._history_cache: dict[tuple[int, str], list[TeamMatchSample]] = {}
        self._profile_cache: dict[str, TeamProfileSnapshot | None] = {}

    def close(self) -> None:
        self.client.close()

    def _get_all(self, path: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        query = {**(params or {}), "api_token": self.api_token}
        page = 1
        items: list[dict[str, Any]] = []
        while True:
            try:
                response = self.client.get(
                    f"{self.base_url}/{path.lstrip('/')}",
                    params={**query, "page": page},
                )
                response.raise_for_status()
                payload = response.json()
            except (httpx.HTTPError, ValueError) as error:
                raise RuntimeError(f"Sportmonks request failed for {path}: {error}") from error
            data = payload.get("data") if isinstance(payload, dict) else None
            if isinstance(data, list):
                items.extend(item for item in data if isinstance(item, dict))
            elif isinstance(data, dict):
                items.append(data)
            else:
                raise RuntimeError(f"Sportmonks returned an invalid data envelope for {path}")

            pagination = payload.get("pagination", {}) if isinstance(payload, dict) else {}
            has_more = bool(pagination.get("has_more"))
            current_page = int(pagination.get("current_page") or page)
            total_pages = int(pagination.get("total_pages") or current_page)
            if not has_more and current_page >= total_pages:
                break
            page = current_page + 1
        return items

    @staticmethod
    def _participants(item: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
        participants = item.get("participants") or []
        home = next(
            (
                participant
                for participant in participants
                if str((participant.get("meta") or {}).get("location", "")).lower() == "home"
            ),
            None,
        )
        away = next(
            (
                participant
                for participant in participants
                if str((participant.get("meta") or {}).get("location", "")).lower() == "away"
            ),
            None,
        )
        if not isinstance(home, dict) or not isinstance(away, dict):
            raise ValueError("Sportmonks fixture has no unambiguous home/away participants")
        return home, away

    def fetch_fixtures(self, target_date_ict: date) -> list[ProviderFixture]:
        start = target_date_ict - timedelta(days=1)
        end = target_date_ict + timedelta(days=1)
        raw_fixtures = self._get_all(
            f"fixtures/between/{start.isoformat()}/{end.isoformat()}",
            {"include": "participants;league.country;state"},
        )
        fixtures: list[ProviderFixture] = []
        for item in raw_fixtures:
            try:
                kickoff = _parse_datetime(item.get("starting_at"))
                home, away = self._participants(item)
            except ValueError:
                continue
            if kickoff.astimezone(ICT).date() != target_date_ict:
                continue
            league = item.get("league") if isinstance(item.get("league"), dict) else {}
            country = league.get("country") if isinstance(league.get("country"), dict) else {}
            state = item.get("state") if isinstance(item.get("state"), dict) else {}
            fixture_id = str(item.get("id") or "")
            if not fixture_id:
                continue
            fixtures.append(
                ProviderFixture(
                    provider_fixture_id=f"sportmonks:{fixture_id}",
                    provider_name=self.name,
                    competition=str(
                        league.get("name") or item.get("name") or "Unknown competition"
                    ),
                    country_code=str(
                        country.get("iso2")
                        or country.get("code")
                        or country.get("name")
                        or ""
                    ),
                    home_team=str(home.get("name") or home.get("short_code") or home.get("id")),
                    away_team=str(away.get("name") or away.get("short_code") or away.get("id")),
                    kickoff_utc=kickoff,
                    status=_developer_name(state) or "SCHEDULED",
                    metadata={
                        "fixture_id": int(fixture_id),
                        "home_team_id": int(home["id"]),
                        "away_team_id": int(away["id"]),
                        "league_id": item.get("league_id") or league.get("id"),
                        "season_id": item.get("season_id"),
                    },
                )
            )
        return sorted(fixtures, key=lambda fixture: fixture.kickoff_utc)

    @staticmethod
    def _current_scores(item: dict[str, Any]) -> dict[int | str, float]:
        scores: dict[int | str, float] = {}
        for score in item.get("scores") or []:
            if str(score.get("description", "")).upper() != "CURRENT":
                continue
            score_data = score.get("score") if isinstance(score.get("score"), dict) else {}
            goals = _as_float(score_data.get("goals"))
            key = score.get("participant_id") or score_data.get("participant")
            if key is not None and goals is not None:
                scores[key] = goals
        return scores

    @staticmethod
    def _statistics(item: dict[str, Any]) -> dict[tuple[int, str], float]:
        parsed: dict[tuple[int, str], float] = {}
        for statistic in item.get("statistics") or []:
            participant_id = statistic.get("participant_id")
            stat_type = _developer_name(statistic.get("type"))
            data = statistic.get("data") if isinstance(statistic.get("data"), dict) else {}
            value = _as_float(data.get("value"))
            if participant_id is not None and stat_type and value is not None:
                parsed[(int(participant_id), stat_type)] = value
        return parsed

    def _history(self, team_id: int, kickoff: datetime) -> list[TeamMatchSample]:
        cache_key = (team_id, kickoff.isoformat())
        if cache_key in self._history_cache:
            return self._history_cache[cache_key]
        end = kickoff.date() - timedelta(days=1)
        start = end - timedelta(days=self.lookback_days)
        raw = self._get_all(
            f"fixtures/between/{start.isoformat()}/{end.isoformat()}/{team_id}",
            {"include": "participants;scores;statistics.type;state"},
        )
        samples: list[TeamMatchSample] = []
        for item in raw:
            state = _developer_name(item.get("state"))
            if state not in FINISHED_STATES:
                continue
            try:
                match_kickoff = _parse_datetime(item.get("starting_at"))
                home, away = self._participants(item)
            except ValueError:
                continue
            if match_kickoff >= kickoff:
                continue
            home_id = int(home["id"])
            away_id = int(away["id"])
            if team_id not in {home_id, away_id}:
                continue
            venue = "home" if team_id == home_id else "away"
            opponent_id = away_id if venue == "home" else home_id
            scores = self._current_scores(item)
            goals_for = scores.get(team_id, scores.get(venue))
            opponent_venue = "away" if venue == "home" else "home"
            goals_against = scores.get(opponent_id, scores.get(opponent_venue))
            if goals_for is None or goals_against is None:
                continue
            stats = self._statistics(item)

            samples.append(
                TeamMatchSample(
                    fixture_id=str(item.get("id")),
                    kickoff_utc=match_kickoff,
                    venue=venue,
                    goals_for=goals_for,
                    goals_against=goals_against,
                    xg_for=_statistic(stats, team_id, "EXPECTED_GOALS", "XG"),
                    xg_against=_statistic(stats, opponent_id, "EXPECTED_GOALS", "XG"),
                    big_chances_for=_statistic(
                        stats, team_id, "BIG_CHANCES_CREATED", "BIG_CHANCES"
                    ),
                    big_chances_against=_statistic(
                        stats, opponent_id, "BIG_CHANCES_CREATED", "BIG_CHANCES"
                    ),
                )
            )
        samples.sort(key=lambda sample: sample.kickoff_utc, reverse=True)
        self._history_cache[cache_key] = samples[: self.history_matches]
        return self._history_cache[cache_key]

    @staticmethod
    def _side_metrics(samples: list[TeamMatchSample], venue: str) -> dict[str, Any]:
        split = [sample for sample in samples if sample.venue == venue]
        relevant = split or samples
        goals_for = [sample.goals_for for sample in relevant]
        goals_against = [sample.goals_against for sample in relevant]
        all_xg = [sample.xg_for for sample in samples if sample.xg_for is not None]
        split_xg = [sample.xg_for for sample in relevant if sample.xg_for is not None]
        split_big = [
            sample.big_chances_for
            for sample in relevant
            if sample.big_chances_for is not None
        ]
        return {
            "gf": _mean(goals_for),
            "ga": _mean(goals_against),
            "recent_gf": _mean([sample.goals_for for sample in samples[:5]]),
            "recent_ga": _mean([sample.goals_against for sample in samples[:5]]),
            "scoring_2plus": _frequency(goals_for, lambda value: value >= 2),
            "conceding_2plus": _frequency(goals_against, lambda value: value >= 2),
            "clean_sheet": _frequency(goals_against, lambda value: value == 0),
            "xg_for": _mean(split_xg),
            "big_chances_for": _mean(split_big),
            "all_samples": len(samples),
            "split_samples": len(split),
            "xg_coverage": round(len(all_xg) / len(samples), 4) if samples else 0.0,
        }

    def fetch_team_profile(self, fixture: ProviderFixture) -> TeamProfileSnapshot | None:
        if fixture.provider_fixture_id in self._profile_cache:
            return self._profile_cache[fixture.provider_fixture_id]
        try:
            home_id = int(fixture.metadata["home_team_id"])
            away_id = int(fixture.metadata["away_team_id"])
        except (KeyError, TypeError, ValueError):
            self._profile_cache[fixture.provider_fixture_id] = None
            return None
        home_history = self._history(home_id, fixture.kickoff_utc)
        away_history = self._history(away_id, fixture.kickoff_utc)
        if not home_history or not away_history:
            self._profile_cache[fixture.provider_fixture_id] = None
            return None
        home = self._side_metrics(home_history, "home")
        away = self._side_metrics(away_history, "away")
        profile = TeamProfileSnapshot(
            source_key=f"sportmonks:{fixture.metadata.get('fixture_id')}:{fixture.kickoff_utc:%Y%m%d%H%M}",
            home_gf=home["gf"],
            home_ga=home["ga"],
            away_gf=away["gf"],
            away_ga=away["ga"],
            recent_gf={"home": home["recent_gf"], "away": away["recent_gf"]},
            recent_ga={"home": home["recent_ga"], "away": away["recent_ga"]},
            scoring_2plus_frequency={"home": home["scoring_2plus"], "away": away["scoring_2plus"]},
            conceding_2plus_frequency={
                "home": home["conceding_2plus"],
                "away": away["conceding_2plus"],
            },
            clean_sheet_rate={"home": home["clean_sheet"], "away": away["clean_sheet"]},
            home_split={"gf": home["gf"], "ga": home["ga"], "matches": home["split_samples"]},
            away_split={"gf": away["gf"], "ga": away["ga"], "matches": away["split_samples"]},
            chance_metrics={
                "home_xg_for": home["xg_for"],
                "away_xg_for": away["xg_for"],
                "home_big_chances_for": home["big_chances_for"],
                "away_big_chances_for": away["big_chances_for"],
                "sample_counts": {
                    "home_all": home["all_samples"],
                    "away_all": away["all_samples"],
                    "home_split": home["split_samples"],
                    "away_split": away["split_samples"],
                },
                "xg_coverage": {"home": home["xg_coverage"], "away": away["xg_coverage"]},
            },
            source_metadata={
                "provider": self.name,
                "fixture_id": fixture.metadata.get("fixture_id"),
                "history_fixture_ids": {
                    "home": [sample.fixture_id for sample in home_history],
                    "away": [sample.fixture_id for sample in away_history],
                },
                "history_cutoff_utc": fixture.kickoff_utc.isoformat(),
            },
        )
        self._profile_cache[fixture.provider_fixture_id] = profile
        return profile

    def fetch_structural_metrics(self, fixture: ProviderFixture) -> StructuralMetrics | None:
        profile = self.fetch_team_profile(fixture)
        return normalize_structural_metrics(profile) if profile is not None else None
