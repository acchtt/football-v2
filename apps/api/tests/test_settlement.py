from decimal import Decimal

import pytest

from app.football_engine.versions.v0_2_47_R.settlement import (
    AsianTotalSettlement,
    settle_over,
    settle_over_with_pnl,
)


@pytest.mark.parametrize(
    ("goals", "line", "expected"),
    [
        (3, 2.75, AsianTotalSettlement.HALF_WIN),
        (3, 3.0, AsianTotalSettlement.PUSH),
        (3, 3.25, AsianTotalSettlement.HALF_LOSS),
        (4, 3.5, AsianTotalSettlement.FULL_WIN),
        (4, 3.75, AsianTotalSettlement.HALF_WIN),
        (2, 2.5, AsianTotalSettlement.FULL_LOSS),
    ],
)
def test_asian_over_settlement(goals: int, line: float, expected: AsianTotalSettlement) -> None:
    assert settle_over(goals, line) == expected


def test_o2_75_at_1_93_exactly_three_is_half_win_not_full_profit() -> None:
    result = settle_over_with_pnl(3, 2.75, 1.93, 1)
    assert result.settlement == AsianTotalSettlement.HALF_WIN
    assert result.pnl_units == Decimal("0.465")


def test_o3_25_exactly_three_is_half_loss() -> None:
    result = settle_over_with_pnl(3, 3.25, 2.00, 1)
    assert result.settlement == AsianTotalSettlement.HALF_LOSS
    assert result.pnl_units == Decimal("-0.5")


def test_o3_75_exactly_four_is_half_win() -> None:
    result = settle_over_with_pnl(4, 3.75, 1.90, 1)
    assert result.settlement == AsianTotalSettlement.HALF_WIN
    assert result.pnl_units == Decimal("0.45")
