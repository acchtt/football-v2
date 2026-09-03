from decimal import Decimal
from pathlib import Path

import pytest

from app.football_engine.versions.v0_2_47_R.scenario_distribution import (
    ACTIVATION_BLOCKER,
    METHOD_ID,
    build_scenario_distribution,
)


APP_ROOT = Path(__file__).parents[1] / "app"


def test_adapter_fails_closed_without_explicit_activation() -> None:
    with pytest.raises(RuntimeError, match=ACTIVATION_BLOCKER):
        build_scenario_distribution([[2, 1], [3, 1], [2, 2]], upside_scores=[[3, 2]])


def test_reciprocal_total_scenario_count_weights_are_derived_not_hard_coded() -> None:
    result = build_scenario_distribution(
        [[2, 1], [3, 1], [2, 2]],
        upside_scores=[[3, 2]],
        activation_approved=True,
    )

    assert result.method_id == METHOD_ID
    assert [scenario.weight for scenario in result.scenarios[:3]] == [Decimal("1")] * 3
    assert result.scenarios[3].weight == Decimal("0.25")
    assert result.production_ready is False


def test_upside_weight_changes_with_total_recorded_scenario_count() -> None:
    result = build_scenario_distribution(
        [[1, 1], [2, 1]],
        upside_scores=[[2, 2]],
        activation_approved=True,
    )

    assert result.scenarios[-1].weight == Decimal("1") / Decimal("3")


def test_adapter_aggregates_total_goals_without_inventing_tail_mass() -> None:
    result = build_scenario_distribution(
        [[2, 1], [3, 1], [2, 2]],
        upside_scores=[[3, 2]],
        activation_approved=True,
    )

    assert set(result.distribution) == {3, 4, 5}
    assert sum(result.distribution.values(), Decimal("0")) == Decimal("1")
    assert 0 not in result.distribution
    assert 6 not in result.distribution


def test_runtime_services_do_not_import_staged_distribution_adapter() -> None:
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
