from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from .base import ConfirmedLineupSnapshot, FinalResultSnapshot, LineupPlayer
from .bsd import BsdProvider, FINISHED_STATES, _as_int, _side_score, _status


def _bsd_event_id(provider_fixture_id: str) -> int:
    prefix, separator, raw_id = provider_fixture_id.partition(":")
    if separator != ":" or prefix != "bsd":
        raise ValueError(f"Not a BSD fixture id: {provider_fixture_id!r}")
    event_id = _as_int(raw_id)
    if event_id is None:
        raise ValueError(f"Invalid BSD event id: {provider_fixture_id!r}")
    return event_id


def _timestamp(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed.replace(tzinfo=UTC) if parsed.tzinfo is None else parsed.astimezone(UTC)


def _player_name(row: dict[str, Any]) -> str:
    player = row.get("player")
    if isinstance(player, dict):
        return str(
            player.get("name")
            or player.get("short_name")
            or row.get("player_name")
            or "Unknown player"
        )
    return str(
        row.get("name")
        or row.get("player_name")
        or player
        or "Unknown player"
    )


def _player_id(row: dict[str, Any]) -> int | str | None:
    player = row.get("player")
    if isinstance(player, dict):
        value = player.get("id")
    else:
        value = row.get("player_id") or row.get("id")
    parsed = _as_int(value)
    return parsed if parsed is not None else (str(value) if value is not None else None)


def _lineup_player(row: Any) -> LineupPlayer | None:
    if isinstance(row, str):
        return LineupPlayer(player_id=None, name=row)
    if not isinstance(row, dict):
        return None
    jersey = _as_int(
        row.get("jersey_number")
        or row.get("shirt_number")
        or row.get("number")
    )
    position = row.get("position") or row.get("pos")
    if isinstance(position, dict):
        position = position.get("name") or position.get("code")
    return LineupPlayer(
        player_id=_player_id(row),
        name=_player_name(row),
        position=str(position) if position else None,
        jersey_number=jersey,
        captain=bool(row.get("captain") or row.get("is_captain")),
    )


def _players(values: Any) -> tuple[LineupPlayer, ...]:
    if not isinstance(values, list):
        return ()
    return tuple(
        player
        for value in values
        if (player := _lineup_player(value)) is not None
    )


def _first_list(block: dict[str, Any], keys: tuple[str, ...]) -> Any:
    for key in keys:
        value = block.get(key)
        if isinstance(value, list):
            return value
    return []


def _side_block(lineups: dict[str, Any], side: str) -> dict[str, Any] | None:
    candidates = (
        side,
        f"{side}_team",
        f"{side}_lineup",
    )
    for key in candidates:
        value = lineups.get(key)
        if isinstance(value, dict):
            return value
    return None


def _split_flat_lineups(lineups: list[Any], side: str) -> dict[str, Any]:
    starters: list[Any] = []
    substitutes: list[Any] = []
    formation: str | None = None
    for raw in lineups:
        if not isinstance(raw, dict):
            continue
        raw_side = str(
            raw.get("side")
            or raw.get("location")
            or raw.get("home_away")
            or ""
        ).lower()
        home_flag = raw.get("home")
        belongs = raw_side in {side, side[0]} or (
            isinstance(home_flag, bool) and home_flag is (side == "home")
        )
        if not belongs:
            continue
        formation = formation or (
            str(raw.get("formation")) if raw.get("formation") else None
        )
        is_sub = bool(raw.get("substitute") or raw.get("is_substitute"))
        starter = raw.get("starter")
        if is_sub or starter is False:
            substitutes.append(raw)
        else:
            starters.append(raw)
    return {
        "formation": formation,
        "starters": starters,
        "substitutes": substitutes,
    }


def _parse_side(lineups: Any, side: str) -> tuple[tuple[LineupPlayer, ...], tuple[LineupPlayer, ...], str | None]:
    if isinstance(lineups, dict):
        block = _side_block(lineups, side)
        if block is None:
            return (), (), None
        starters = _first_list(
            block,
            ("starting_xi", "starters", "starting", "lineup", "players"),
        )
        substitutes = _first_list(block, ("substitutes", "subs", "bench"))
        formation = block.get("formation")
        return (
            _players(starters),
            _players(substitutes),
            str(formation) if formation else None,
        )

    if isinstance(lineups, list):
        block = _split_flat_lineups(lineups, side)
        return (
            _players(block["starters"]),
            _players(block["substitutes"]),
            block["formation"],
        )
    return (), (), None


class BsdAutomationProvider(BsdProvider):
    """BSD provider plus the V1 update capabilities used after PRE freeze."""

    def fetch_confirmed_lineup(
        self, provider_fixture_id: str
    ) -> ConfirmedLineupSnapshot | None:
        event_id = _bsd_event_id(provider_fixture_id)
        payload = self._get(f"events/{event_id}/lineups/")
        if not isinstance(payload, dict):
            return None
        if str(payload.get("lineup_status") or "").lower() != "confirmed":
            return None
        lineups = payload.get("lineups")
        if lineups is None:
            return None

        home_xi, home_subs, home_formation = _parse_side(lineups, "home")
        away_xi, away_subs, away_formation = _parse_side(lineups, "away")
        if not home_xi or not away_xi:
            return None

        return ConfirmedLineupSnapshot(
            provider_fixture_id=provider_fixture_id,
            home_starting_xi=home_xi,
            away_starting_xi=away_xi,
            home_substitutes=home_subs,
            away_substitutes=away_subs,
            home_formation=home_formation,
            away_formation=away_formation,
            captured_at=_timestamp(payload.get("updated_at")) or datetime.now(UTC),
            source_metadata={
                "provider": self.name,
                "event_id": event_id,
                "lineup_status": "confirmed",
                "beta": bool(payload.get("beta", False)),
                "source_endpoint": f"events/{event_id}/lineups/",
            },
        )

    def fetch_final_result(self, provider_fixture_id: str) -> FinalResultSnapshot | None:
        event_id = _bsd_event_id(provider_fixture_id)
        payload = self._get(f"events/{event_id}/")
        if not isinstance(payload, dict):
            return None
        status = _status(payload)
        if status not in FINISHED_STATES:
            return None
        home_goals = _side_score(payload, "home")
        away_goals = _side_score(payload, "away")
        if home_goals is None or away_goals is None:
            return None
        if not home_goals.is_integer() or not away_goals.is_integer():
            raise ValueError("BSD final score must contain integer regulation-time goals")

        return FinalResultSnapshot(
            provider_fixture_id=provider_fixture_id,
            status=status.upper(),
            home_goals_90=int(home_goals),
            away_goals_90=int(away_goals),
            captured_at=datetime.now(UTC),
            source_metadata={
                "provider": self.name,
                "event_id": event_id,
                "score_basis": "REGULATION_TIME",
                "source_endpoint": f"events/{event_id}/",
            },
        )
