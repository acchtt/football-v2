from decimal import Decimal
from inspect import signature
from pathlib import Path

import pytest

from app.football_engine.versions.v0_2_47_R.scenario_distribution import (
    METHOD_ID,
    METHOD_STATUS,
    build_scenario_distribution,
    build_total_goal_scenario_distribution,
)
from app.model_state import get_model_state


APP_ROOT = Path(__file__).parents[1] / "app"


def test_adapter_activation_authority_comes_from_canonical_state() -> None:
    state = get_model_state()
    result = build_scenario_distribution(
        [[2, 1], [3, 1], [2, 2]],
        upside_scores=[[3, 2]],
    )

    assert state.projection.distribution_method_approved is True
    assert state.projection.distribution_method == METHOD_ID
    assert METHOD_STATUS == "APPROVED_ACTIVE"
    assert result.method_id == METHOD_ID
    assert result.production_ready is True
    assert result.blocker is None
    assert "activation_approved" not in signature(build_scenario_distribution).parameters


def test_reciprocal_total_scenario_count_weights_are_derived_not_hard_coded() -> None:
    result = build_scenario_distribution(
        [[2, 1], [3, 1], [2, 2]],
        upside_scores=[[3, 2]],
    )

    assert [scenario.weight for scenario in result.scenarios[:3]] == [Decimal("1")] * 3
    assert result.scenarios[3].weight == Decimal("0.25")


def test_upside_weight_changes_with_total_recorded_scenario_count() -> None:
    result = build_scenario_distribution(
        [[1, 1], [2, 1]],
        upside_scores=[[2, 2]],
    )

    assert result.scenarios[-1].weight == Decimal("1") / Decimal("3")


def test_adapter_aggregates_total_goals_without_inventing_tail_mass() -> None:
    result = build_scenario_distribution(
        [[2, 1], [3, 1], [2, 2]],
        upside_scores=[[3, 2]],
    )

    assert set(result.distribution) == {3, 4, 5}
    assert sum(result.distribution.values(), Decimal("0")) == Decimal("1")
    assert 0 not in result.distribution
    assert 6 not in result.distribution


def test_totals_only_adapter_is_exactly_equivalent_after_scoreline_collapse() -> None:
    score_result = build_scenario_distribution(
        [[2, 1], [3, 1], [2, 2]],
        upside_scores=[[3, 2]],
    )
    total_result = build_total_goal_scenario_distribution(
        [3, 4, 4],
        upside_totals=[5],
    )

    assert total_result.method_id == METHOD_ID
    assert total_result.distribution == score_result.distribution
    assert [scenario.total_goals for scenario in total_result.scenarios] == [3, 4, 4, 5]
    assert [scenario.weight for scenario in total_result.scenarios] == [
        Decimal("1"),
        Decimal("1"),
        Decimal("1"),
        Decimal("0.25"),
    ]


def test_totals_only_adapter_preserves_duplicate_scenario_multiplicity() -> None:
    result = build_total_goal_scenario_distribution([3, 4, 4])

    assert result.distribution[3] == Decimal("1") / Decimal("3")
    assert result.distribution[4] == Decimal("2") / Decimal("3")


def test_totals_only_adapter_never_expands_a_band_or_invents_tail_mass() -> None:
    result = build_total_goal_scenario_distribution([3], upside_totals=[4])

    assert set(result.distribution) == {3, 4}
    assert 2 not in result.distribution
    assert 5 not in result.distribution

    with pytest.raises(ValueError, match="primary scenario"):
        build_total_goal_scenario_distribution([])
    with pytest.raises(ValueError, match="cannot be negative"):
        build_total_goal_scenario_distribution([-1])


def test_runtime_services_do_not_import_distribution_adapter_before_scenario_producer_exists() -> None:
    offenders: list[str] = []
    token = "scenario_distribution"

    for relative_root in ("api", "services", "schemas"):
        root = APP_ROOT / relative_root
        if not root.exists():
            continue
        for path in root.rglob("*.py"):
            if token in path.read_text(encoding="utf-8"):
                offenders.append(path.relative_to(APP_ROOT).as_posix())

    assert offenders == []
