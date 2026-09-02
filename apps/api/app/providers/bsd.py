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
FINISHED_STATES = {"finished", "ft", "aet", "after_extra_time", "after_penalties"}


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


def _as_int(value: Any) -> int | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _mean(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 4) if values else None


def _frequency(values: list[float], predicate: Any) -> float:
    return round(sum(1 for value in values if predicate(value)) / len(values), 4) if values else 0.0


def _parse_datetime(value: Any) -> datetime:
    if not isinstance(value, str) or not value:
        raise ValueError("BSD event is missing event_date")
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed.astimezone(UTC)


def _object_name(value: Any, fallback: str = "") -> str:
    if isinstance(value, dict):
        return str(value.get("name") or value.get("short_name") or value.get("id") or fallback)
    if value is None:
        return fallback
    return str(value)


def _team_id(item: dict[str, Any], side: str) -> int | None:
    direct = _as_int(item.get(f"{side}_team_id"))
    if direct is not None:
        return direct
    nested = item.get(f"{side}_team")
    if isinstance(nested, dict):
        return _as_int(nested.get("id"))
    return None


def _team_name(item: dict[str, Any], side: str) -> str:
    return _object_name(item.get(f"{side}_team"), fallback=f"{side.title()} team")


def _league(item: dict[str, Any]) -> tuple[str, str, int | None]:
    value = item.get("league")
    if isinstance(value, dict):
        name = _object_name(value, fallback="Unknown competition")
        country = value.get("country_code") or value.get("country") or ""
        league_id = _as_int(value.get("id"))
        return name, str(country), league_id
    name = str(value or item.get("league_name") or "Unknown competition")
    country = item.get("country_code") or item.get("country") or ""
    return name, str(country), _as_int(item.get("league_id"))


def _status(item: dict[str, Any]) -> str:
    return str(item.get("status") or "notstarted").strip().lower()


def _side_score(item: dict[str, Any], side: str) -> float | None:
    for key in (f"{side}_score", f"{side}_goals", f"score_{side}"):
        value = _as_float(item.get(key))
        if value is not None:
            return value
    score = item.get("score")
    if isinstance(score, dict):
        return _as_float(score.get(side))
    return None


def _field_value(source: Any, *names: str) -> float | None:
    if not isinstance(source, dict):
        return None
    normalized = {str(key).lower().replace("-", "_"): value for key, value in source.items()}
    for name in names:
        value = _as_float(normalized.get(name.lower().replace("-", "_")))
        if value is not None:
            return value
    return None


def _extract_team_stats(
    payload: Any, side: str, team_id: int | None
) -> tuple[float | None, float | None]:
    names_xg = ("xg", "expected_goals", "expected_goals_for")
    names_big = ("big_chances", "big_chances_created", "big_chances_for")

    if isinstance(payload, dict):
        direct_xg = _field_value(
            payload,
            f"{side}_xg",
            f"{side}_expected_goals",
        )
        direct_big = _field_value(
            payload,
            f"{side}_big_chances",
            f"{side}_big_chances_created",
        )
        if direct_xg is not None or direct_big is not None:
            return direct_xg, direct_big

        side_block = payload.get(side)
        if isinstance(side_block, dict):
            xg = _field_value(side_block, *names_xg)
            big = _field_value(side_block, *names_big)
            if xg is not None or big is not None:
                return xg, big

        for envelope in ("results", "stats", "statistics", "data", "teams"):
            block = payload.get(envelope)
            if block is not None:
                xg, big = _extract_team_stats(block, side, team_id)
                if xg is not None or big is not None:
                    return xg, big

    if isinstance(payload, list):
        for row in payload:
            if not isinstance(row, dict):
                continue
            row_team_id = _as_int(row.get("team_id") or row.get("participant_id"))
            row_side = str(
                row.get("side") or row.get("location") or row.get("home_away") or ""
            ).lower()
            if team_id is not None and row_team_id not in {None, team_id}:
                continue
            if row_side and row_side not in {side, side[0]}:
                continue

            xg = _field_value(row, *names_xg)
            big = _field_value(row, *names_big)

            name = str(row.get("name") or row.get("type") or row.get("stat") or "").lower()
            value = _as_float(row.get("value") or row.get("stat_value"))
            if value is not None:
                if xg is None and name in {"xg", "expected goals", "expected_goals"}:
                    xg = value
                if big is None and name in {
                    "big chances",
                    "big_chances",
                    "big chances created",
                    "big_chances_created",
                }:
                    big = value
            if xg is not None or big is not None:
                return xg, big
    return None, None


class BsdProvider(FixtureProvider, StatsProvider):
    name = "bsd"

    def __init__(
        self,
        api_token: str,
        base_url: str = "https://sports.bzzoiro.com/api/v2",
        timeout_seconds: float = 20.0,
        history_matches: int = 10,
        lookback_days: int = 180,
        client: httpx.Client | None = None,
    ) -> None:
        if not api_token:
            raise ValueError("A BSD API token is required")
        self.api_token = api_token
        self.base_url = base_url.rstrip("/")
        self.history_matches = max(5, history_matches)
        self.lookback_days = max(30, lookback_days)
        self.client = client or httpx.Client(timeout=timeout_seconds, trust_env=False)
        self._history_cache: dict[tuple[int, str], list[TeamMatchSample]] = {}
        self._profile_cache: dict[str, TeamProfileSnapshot | None] = {}
        self._stats_cache: dict[int, Any] = {}

    def close(self) -> None:
        self.client.close()

    def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        try:
            response = self.client.get(
                f"{self.base_url}/{path.lstrip('/')}",
                params=params,
                headers={"Authorization": f"Token {self.api_token}"},
            )
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ValueError) as error:
            raise RuntimeError(f"BSD request failed for {path}: {error}") from error

    def _get_all(self, path: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        query = dict(params or {})
        limit = max(1, min(int(query.pop("limit", 200)), 200))
        offset = 0
        items: list[dict[str, Any]] = []
        while True:
            payload = self._get(path, {**query, "limit": limit, "offset": offset})
            if isinstance(payload, list):
                return [item for item in payload if isinstance(item, dict)]
            if not isinstance(payload, dict):
                raise RuntimeError(f"BSD returned an invalid data envelope for {path}")

            batch = payload.get("results")
            if not isinstance(batch, list):
                batch = payload.get("events")
            if not isinstance(batch, list):
                batch = payload.get("data")
            if not isinstance(batch, list):
                raise RuntimeError(f"BSD returned an invalid paginated envelope for {path}")

            items.extend(item for item in batch if isinstance(item, dict))
            count = _as_int(payload.get("count"))
            if not payload.get("next") and len(batch) < limit:
                break
            offset += limit
            if count is not None and offset >= count:
                break
        return items

    def fetch_fixtures(self, target_date_ict: date) -> list[ProviderFixture]:
        start = target_date_ict - timedelta(days=1)
        end = target_date_ict + timedelta(days=1)
        raw_events = self._get_all(
            "events/",
            {
                "date_from": start.isoformat(),
                "date_to": end.isoformat(),
                "limit": 200,
            },
        )

        fixtures: list[ProviderFixture] = []
        for item in raw_events:
            event_id = _as_int(item.get("id"))
            if event_id is None:
                continue
            try:
                kickoff = _parse_datetime(item.get("event_date") or item.get("kickoff_at"))
            except ValueError:
                continue
            if kickoff.astimezone(ICT).date() != target_date_ict:
                continue

            home_id = _team_id(item, "home")
            away_id = _team_id(item, "away")
            competition, country_code, league_id = _league(item)
            fixtures.append(
                ProviderFixture(
                    provider_fixture_id=f"bsd:{event_id}",
                    provider_name=self.name,
                    competition=competition,
                    country_code=country_code,
                    home_team=_team_name(item, "home"),
                    away_team=_team_name(item, "away"),
                    kickoff_utc=kickoff,
                    status=_status(item).upper(),
                    metadata={
                        "fixture_id": event_id,
                        "home_team_id": home_id,
                        "away_team_id": away_id,
                        "league_id": league_id,
                        "websocket_plus": bool(item.get("websocket_plus")),
                        "odds_over_25": _as_float(item.get("odds_over_25")),
                        "odds_btts_yes": _as_float(item.get("odds_btts_yes")),
                    },
                )
            )
        return sorted(fixtures, key=lambda fixture: fixture.kickoff_utc)

    def _event_stats(self, event_id: int) -> Any:
        if event_id not in self._stats_cache:
            self._stats_cache[event_id] = self._get(f"events/{event_id}/stats/")
        return self._stats_cache[event_id]

    def _history(self, team_id: int, kickoff: datetime) -> list[TeamMatchSample]:
        cache_key = (team_id, kickoff.isoformat())
        if cache_key in self._history_cache:
            return self._history_cache[cache_key]

        end = kickoff.date() - timedelta(days=1)
        start = end - timedelta(days=self.lookback_days)
        raw_events = self._get_all(
            "events/",
            {
                "team_id": team_id,
                "status": "finished",
                "date_from": start.isoformat(),
                "date_to": end.isoformat(),
                "limit": 200,
            },
        )
        raw_events.sort(
            key=lambda item: str(item.get("event_date") or item.get("kickoff_at") or ""),
            reverse=True,
        )

        samples: list[TeamMatchSample] = []
        for item in raw_events:
            if _status(item) not in FINISHED_STATES:
                continue
            event_id = _as_int(item.get("id"))
            home_id = _team_id(item, "home")
            away_id = _team_id(item, "away")
            if event_id is None or team_id not in {home_id, away_id}:
                continue
            try:
                match_kickoff = _parse_datetime(item.get("event_date") or item.get("kickoff_at"))
            except ValueError:
                continue
            if match_kickoff >= kickoff:
                continue

            venue = "home" if team_id == home_id else "away"
            opponent_venue = "away" if venue == "home" else "home"
            goals_for = _side_score(item, venue)
            goals_against = _side_score(item, opponent_venue)
            if goals_for is None or goals_against is None:
                continue

            team_xg = _field_value(
                item,
                f"{venue}_xg",
                f"{venue}_expected_goals",
            )
            opponent_xg = _field_value(
                item,
                f"{opponent_venue}_xg",
                f"{opponent_venue}_expected_goals",
            )
            team_big = _field_value(item, f"{venue}_big_chances")
            opponent_big = _field_value(item, f"{opponent_venue}_big_chances")

            if team_xg is None or opponent_xg is None:
                stats = self._event_stats(event_id)
                parsed_team_xg, parsed_team_big = _extract_team_stats(stats, venue, team_id)
                opponent_id = away_id if venue == "home" else home_id
                parsed_opp_xg, parsed_opp_big = _extract_team_stats(
                    stats, opponent_venue, opponent_id
                )
                team_xg = team_xg if team_xg is not None else parsed_team_xg
                opponent_xg = opponent_xg if opponent_xg is not None else parsed_opp_xg
                team_big = team_big if team_big is not None else parsed_team_big
                opponent_big = opponent_big if opponent_big is not None else parsed_opp_big

            samples.append(
                TeamMatchSample(
                    fixture_id=str(event_id),
                    kickoff_utc=match_kickoff,
                    venue=venue,
                    goals_for=goals_for,
                    goals_against=goals_against,
                    xg_for=team_xg,
                    xg_against=opponent_xg,
                    big_chances_for=team_big,
                    big_chances_against=opponent_big,
                )
            )
            if len(samples) >= self.history_matches:
                break

        self._history_cache[cache_key] = samples
        return samples

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

        home_id = _as_int(fixture.metadata.get("home_team_id"))
        away_id = _as_int(fixture.metadata.get("away_team_id"))
        if home_id is None or away_id is None:
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
            source_key=f"bsd:{fixture.metadata.get('fixture_id')}:{fixture.kickoff_utc:%Y%m%d%H%M}",
            home_gf=home["gf"],
            home_ga=home["ga"],
            away_gf=away["gf"],
            away_ga=away["ga"],
            recent_gf={"home": home["recent_gf"], "away": away["recent_gf"]},
            recent_ga={"home": home["recent_ga"], "away": away["recent_ga"]},
            scoring_2plus_frequency={
                "home": home["scoring_2plus"],
                "away": away["scoring_2plus"],
            },
            conceding_2plus_frequency={
                "home": home["conceding_2plus"],
                "away": away["conceding_2plus"],
            },
            clean_sheet_rate={"home": home["clean_sheet"], "away": away["clean_sheet"]},
            home_split={
                "gf": home["gf"],
                "ga": home["ga"],
                "matches": home["split_samples"],
            },
            away_split={
                "gf": away["gf"],
                "ga": away["ga"],
                "matches": away["split_samples"],
            },
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
                "xg_coverage": {
                    "home": home["xg_coverage"],
                    "away": away["xg_coverage"],
                },
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
