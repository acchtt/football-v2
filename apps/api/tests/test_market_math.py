from decimal import Decimal

from app.football_engine.versions.v0_2_47_R.goal_burden import OddsOffer
from app.football_engine.versions.v0_2_47_R.market_math import (
    even_money_fair_total,
    evaluate_over_offer,
    normalize_goal_distribution,
    projected_mean_goals,
    rank_over_offers,
)


def test_distribution_normalizes_and_projects_mean() -> None:
    distribution = normalize_goal_distribution({2: 1, 3: 2, 4: 1})

    assert distribution == {
        2: Decimal("0.25"),
        3: Decimal("0.5"),
        4: Decimal("0.25"),
    }
    assert projected_mean_goals(distribution) == Decimal("3.00")


def test_expected_pnl_uses_exact_quarter_line_settlement() -> None:
    evaluation = evaluate_over_offer({3: 1}, Decimal("2.75"), Decimal("1.93"))

    assert evaluation.expected_pnl_units == Decimal("0.465")
    assert evaluation.half_win_probability == Decimal("1")
    assert evaluation.full_win_probability == Decimal("0")
    assert evaluation.push_probability == Decimal("0")


def test_expected_pnl_handles_half_loss_and_half_win() -> None:
    half_loss = evaluate_over_offer({3: 1}, Decimal("3.25"), Decimal("2.00"))
    half_win = evaluate_over_offer({4: 1}, Decimal("3.75"), Decimal("1.90"))

    assert half_loss.expected_pnl_units == Decimal("-0.5")
    assert half_loss.half_loss_probability == Decimal("1")
    assert half_win.expected_pnl_units == Decimal("0.45")
    assert half_win.half_win_probability == Decimal("1")


def test_fair_odds_include_push_and_quarter_line_weights() -> None:
    evaluation = evaluate_over_offer(
        {2: Decimal("0.5"), 3: Decimal("0.5")},
        Decimal("2.5"),
        Decimal("2.00"),
    )

    assert evaluation.fair_odds == Decimal("2")
    assert evaluation.expected_pnl_units == Decimal("0.0")


def test_even_money_fair_total_is_distribution_derived() -> None:
    fair = even_money_fair_total({2: Decimal("0.5"), 3: Decimal("0.5")})

    assert fair.line == Decimal("2.5")
    assert fair.even_money_expected_pnl == Decimal("0.0")
    assert fair.projected_mean_goals == Decimal("2.5")


def test_rank_over_offers_ranks_ev_without_issuing_a_lock() -> None:
    offers = (
        OddsOffer(line=2.5, over_odds=1.70, under_odds=2.10),
        OddsOffer(line=2.75, over_odds=1.95, under_odds=1.90),
        OddsOffer(line=3.0, over_odds=2.20, under_odds=1.70),
    )
    ranked = rank_over_offers(
        {2: Decimal("0.1"), 3: Decimal("0.3"), 4: Decimal("0.6")},
        offers,
    )

    assert len(ranked) == 3
    assert ranked[0].expected_pnl_units >= ranked[1].expected_pnl_units
    assert ranked[1].expected_pnl_units >= ranked[2].expected_pnl_units
