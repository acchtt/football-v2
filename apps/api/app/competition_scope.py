from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

from app.model_state import get_model_state


@dataclass(frozen=True, slots=True)
class CompetitionEligibility:
    eligible: bool
    reason: str


def _normalized(value: str) -> str:
    return re.sub(r"[^A-Z0-9]+", " ", value.upper()).strip()


def _country_is_england(country_code: str) -> bool:
    return _normalized(country_code) in {
        "GB ENG",
        "ENG",
        "ENGLAND",
        "GB",
        "UK",
        "UNITED KINGDOM",
    }


def _looks_like_cup(competition: str) -> bool:
    normalized = _normalized(competition)
    return any(
        token in normalized
        for token in (
            " CUP",
            "CUP ",
            "POKAL",
            "COPA",
            "COPPA",
            "TACA",
            "TROPHY",
            "SHIELD",
        )
    ) or normalized.endswith("CUP")


def _looks_continental(competition: str) -> bool:
    normalized = _normalized(competition)
    return any(
        token in normalized
        for token in (
            "UEFA",
            "CONMEBOL",
            "CONCACAF",
            "AFC CHAMPIONS",
            "CAF CHAMPIONS",
            "LIBERTADORES",
            "SUDAMERICANA",
            "CHAMPIONS LEAGUE",
            "EUROPA LEAGUE",
            "CONFERENCE LEAGUE",
            "CLUB WORLD CUP",
        )
    )


def evaluate_competition(
    competition: str,
    country_code: str,
    metadata: Mapping[str, Any] | None = None,
) -> CompetitionEligibility:
    state = get_model_state().competition_scope
    normalized = _normalized(competition)

    # Named exception must run before generic cup/continental heuristics. In particular,
    # North American Leagues Cup must never be removed by a generic "League Cup" rule.
    if normalized == "LEAGUES CUP" or normalized.endswith(" LEAGUES CUP"):
        return CompetitionEligibility(
            eligible=state.north_american_leagues_cup,
            reason="NAMED_EXCEPTION_LEAGUES_CUP",
        )

    if "DFB POKAL" in normalized:
        return CompetitionEligibility(
            eligible=state.dfb_pokal,
            reason="NAMED_EXCEPTION_DFB_POKAL",
        )

    if _country_is_england(country_code) and _looks_like_cup(competition):
        return CompetitionEligibility(
            eligible=state.english_domestic_cups,
            reason="ENGLISH_DOMESTIC_CUP",
        )

    metadata = metadata or {}
    raw_type = str(
        metadata.get("competition_type")
        or metadata.get("league_type")
        or metadata.get("type")
        or ""
    )
    normalized_type = _normalized(raw_type)

    if _looks_continental(competition):
        return CompetitionEligibility(False, "CONTINENTAL_COMPETITION_EXCLUDED")

    if "CUP" in normalized_type or _looks_like_cup(competition):
        return CompetitionEligibility(state.other_cups, "OTHER_CUP_SCOPE")

    # With no cup/continental evidence, treat the competition as a domestic league.
    # This keeps normal domestic leagues eligible and does not resurrect legacy K League rules.
    return CompetitionEligibility(state.domestic_leagues, "DOMESTIC_LEAGUE_SCOPE")
