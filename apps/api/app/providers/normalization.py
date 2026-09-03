from collections.abc import Mapping
from typing import Any

from app.model_state import get_model_state

from .base import StructuralMetrics, TeamProfileSnapshot

NORMALIZATION_VERSION = "sportmonks-profile-v2-pre-hardening"


def _number(value: Any) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _score(value: float | None, floor: float, ceiling: float) -> float | None:
    if value is None or ceiling <= floor:
        return None
    return max(0.0, min(100.0, (value - floor) * 100 / (ceiling - floor)))


def _weighted_score(components: tuple[tuple[float | None, float], ...], default: float = 50.0) -> float:
    available = [(value, weight) for value, weight in components if value is not None]
    if not available:
        return default
    weight_sum = sum(weight for _value, weight in available)
    return round(sum(value * weight for value, weight in available) / weight_sum, 2)


def _metric(values: Mapping[str, Any], side: str) -> float | None:
    return _number(values.get(side))


def _route_score(
    gf: float | None,
    recent_gf: float | None,
    scoring_2plus: float | None,
    opponent_conceding_2plus: float | None,
    xg_for: float | None,
) -> float:
    # PRE-HARDENING: missing xG/chance evidence is not scored as zero. Available
    # route evidence is reweighted, so chance quality remains a modifier rather than a veto.
    return _weighted_score(
        (
            (_score(gf, 0.8, 2.4), 0.25),
            (_score(recent_gf, 0.8, 2.5), 0.15),
            (_score(scoring_2plus, 0.2, 0.75), 0.20),
            (_score(opponent_conceding_2plus, 0.2, 0.65), 0.15),
            (_score(xg_for, 0.9, 2.2), 0.25),
        )
    )


def normalize_structural_metrics(profile: TeamProfileSnapshot) -> StructuralMetrics:
    """Turn provider evidence into model inputs without market or hardened sample assumptions."""
    state = get_model_state()
    chance = profile.chance_metrics
    home_xg = _metric(chance, "home_xg_for")
    away_xg = _metric(chance, "away_xg_for")
    home_route = _route_score(
        profile.home_gf,
        _metric(profile.recent_gf, "home"),
        _metric(profile.scoring_2plus_frequency, "home"),
        _metric(profile.conceding_2plus_frequency, "away"),
        home_xg,
    )
    away_route = _route_score(
        profile.away_gf,
        _metric(profile.recent_gf, "away"),
        _metric(profile.scoring_2plus_frequency, "away"),
        _metric(profile.conceding_2plus_frequency, "home"),
        away_xg,
    )

    weaker_route = min(home_route, away_route)
    stronger_route = max(home_route, away_route)
    two_sided = round(weaker_route * 0.70 + ((home_route + away_route) / 2) * 0.30, 2)
    profile_gate = round(max(two_sided, stronger_route * 0.85 + weaker_route * 0.15), 2)

    total_xg = None if home_xg is None or away_xg is None else home_xg + away_xg
    xg_quality = _score(total_xg, 1.9, 3.8)
    home_big = _metric(chance, "home_big_chances_for")
    away_big = _metric(chance, "away_big_chances_for")
    big_chance_quality = (
        _score(home_big + away_big, 2.0, 7.0)
        if home_big is not None and away_big is not None
        else None
    )
    chance_quality = _weighted_score(
        ((xg_quality, 0.75), (big_chance_quality, 0.25)),
        default=50.0,
    )

    home_clean_sheet = _metric(profile.clean_sheet_rate, "home") or 0.0
    away_clean_sheet = _metric(profile.clean_sheet_rate, "away") or 0.0
    home_concede = _metric(profile.conceding_2plus_frequency, "home") or 0.0
    away_concede = _metric(profile.conceding_2plus_frequency, "away") or 0.0
    suppression_resistance = 100 * (1 - min(0.8, (home_clean_sheet + away_clean_sheet) / 2))
    defensive_openness = _score((home_concede + away_concede) / 2, 0.15, 0.55) or 0.0
    failure_resistance = round(
        suppression_resistance * 0.55 + defensive_openness * 0.25 + chance_quality * 0.20,
        2,
    )

    sample_counts = chance.get("sample_counts", {})
    xg_coverage = chance.get("xg_coverage", {})
    evidence_coverage = {
        "home_history": int(_number(sample_counts.get("home_all")) or 0),
        "away_history": int(_number(sample_counts.get("away_all")) or 0),
        "home_venue_split": int(_number(sample_counts.get("home_split")) or 0),
        "away_venue_split": int(_number(sample_counts.get("away_split")) or 0),
        "home_xg_coverage": _number(xg_coverage.get("home")) or 0.0,
        "away_xg_coverage": _number(xg_coverage.get("away")) or 0.0,
    }

    mandatory_profile = {
        "home_gf": profile.home_gf is not None,
        "home_ga": profile.home_ga is not None,
        "away_gf": profile.away_gf is not None,
        "away_ga": profile.away_ga is not None,
    }
    data_complete = all(mandatory_profile.values())

    failure_modes: list[str] = []
    missing_profile = [name for name, present in mandatory_profile.items() if not present]
    if missing_profile:
        failure_modes.append("Missing mandatory GF/GA profile: " + ", ".join(missing_profile))
    if weaker_route < 45:
        failure_modes.append("Weak secondary scoring route")
    if (home_clean_sheet + away_clean_sheet) / 2 >= 0.35:
        failure_modes.append("High opponent clean-sheet suppression")
    if chance_quality < 55:
        failure_modes.append("Chance-quality support is weak")

    evidence = {
        "summary": "Provider history normalized from pre-kickoff team and chance evidence",
        "route_scores": {"home": home_route, "away": away_route},
        "profile": {
            "home_gf": profile.home_gf,
            "home_ga": profile.home_ga,
            "away_gf": profile.away_gf,
            "away_ga": profile.away_ga,
            "recent_gf": dict(profile.recent_gf),
            "recent_ga": dict(profile.recent_ga),
            "scoring_2plus_frequency": dict(profile.scoring_2plus_frequency),
            "conceding_2plus_frequency": dict(profile.conceding_2plus_frequency),
            "clean_sheet_rate": dict(profile.clean_sheet_rate),
        },
        "chance_metrics": dict(chance),
        "mandatory_profile": mandatory_profile,
        "evidence_coverage": evidence_coverage,
        "recent_total_leakage_confirmation_required": (
            state.rules.recent_total_leakage_confirmation
        ),
        "chance_quality_role": state.rules.chance_quality_role,
    }
    return StructuralMetrics(
        two_sided_strength=two_sided,
        carrier_ceiling=stronger_route,
        opponent_secondary_route=weaker_route,
        failure_mode_resistance=failure_resistance,
        profile_gate=profile_gate,
        chance_quality=chance_quality,
        data_complete=data_complete,
        failure_modes=tuple(failure_modes),
        evidence=evidence,
        source_metadata={
            **dict(profile.source_metadata),
            "normalization_version": NORMALIZATION_VERSION,
        },
    )
