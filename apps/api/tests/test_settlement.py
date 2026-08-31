import pytest

from app.football_engine.versions.v0_2_47_R.settlement import (
    AsianTotalSettlement,
    settle_over,
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
