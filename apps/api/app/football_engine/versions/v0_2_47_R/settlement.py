from decimal import Decimal
from enum import StrEnum


class AsianTotalSettlement(StrEnum):
    FULL_WIN = "FULL_WIN"
    HALF_WIN = "HALF_WIN"
    PUSH = "PUSH"
    HALF_LOSS = "HALF_LOSS"
    FULL_LOSS = "FULL_LOSS"


def settle_over(total_goals_90: int, line: Decimal | float | str) -> AsianTotalSettlement:
    """Settle a full-match Over using 90 minutes plus stoppage time only."""
    total_line = Decimal(str(line))
    quarter = (total_line * 4) % 4

    if quarter == 0:
        if Decimal(total_goals_90) > total_line:
            return AsianTotalSettlement.FULL_WIN
        if Decimal(total_goals_90) == total_line:
            return AsianTotalSettlement.PUSH
        return AsianTotalSettlement.FULL_LOSS

    if quarter == 2:
        return (
            AsianTotalSettlement.FULL_WIN
            if Decimal(total_goals_90) > total_line
            else AsianTotalSettlement.FULL_LOSS
        )

    lower_line = total_line - Decimal("0.25")
    upper_line = total_line + Decimal("0.25")
    lower_result = settle_over(total_goals_90, lower_line)
    upper_result = settle_over(total_goals_90, upper_line)

    pair = {lower_result, upper_result}
    if pair == {AsianTotalSettlement.FULL_WIN, AsianTotalSettlement.PUSH}:
        return AsianTotalSettlement.HALF_WIN
    if pair == {AsianTotalSettlement.FULL_LOSS, AsianTotalSettlement.PUSH}:
        return AsianTotalSettlement.HALF_LOSS
    if pair == {AsianTotalSettlement.FULL_WIN}:
        return AsianTotalSettlement.FULL_WIN
    return AsianTotalSettlement.FULL_LOSS
