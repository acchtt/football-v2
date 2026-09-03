from pathlib import Path

from app.football_engine.research.shadow_decision_chain import run_shadow_decision_chain


APP_ROOT = Path(__file__).parents[1] / "app"


def test_production_code_does_not_import_shadow_market_policy_or_chain() -> None:
    forbidden = ("shadow_market_policy", "shadow_decision_chain")
    offenders: list[str] = []

    for path in APP_ROOT.rglob("*.py"):
        if "football_engine/research" in path.as_posix():
            continue
        text = path.read_text(encoding="utf-8")
        if any(token in text for token in forbidden):
            offenders.append(path.relative_to(APP_ROOT).as_posix())

    assert offenders == []


def test_shadow_chain_has_no_official_selection_field_value() -> None:
    result = run_shadow_decision_chain(
        context={
            "carrier_dependence": "high",
            "secondary_route_strength": "weak",
            "two_sided_strength": "weak",
            "suppression_risk": "high",
            "failure_mode_resistance": "low",
        },
        anchor_goal=3,
        goal_distribution={2: 0.1, 3: 0.5, 4: 0.3, 5: 0.1},
        offers=[(2.75, 1.89), (3.0, 2.16)],
    )

    assert result.official_selection is None
    assert result.production_ready is False
