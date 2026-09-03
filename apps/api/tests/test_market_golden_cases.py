import json
from pathlib import Path


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "market_golden_cases.json"


def load_cases() -> list[dict[str, object]]:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def test_market_golden_cases_are_well_formed() -> None:
    cases = load_cases()

    assert len(cases) >= 12
    assert len({case["case_id"] for case in cases}) == len(cases)

    for case in cases:
        offers = case["offers"]
        selected_line = case["selected_line"]
        selected_odds = case["selected_odds"]

        assert isinstance(offers, list) and len(offers) >= 2
        assert any(
            line == selected_line and odds == selected_odds
            for line, odds in offers
        )
        for line, odds in offers:
            assert abs(float(line) * 4 - round(float(line) * 4)) < 0.0001
            assert float(odds) > 1.0


def test_america_monterrey_acceptance_case_is_pinned() -> None:
    cases = {case["case_id"]: case for case in load_cases()}
    america = cases["AME-MTY-20260903-ACCEPTANCE"]

    assert america["offers"] == [
        [2.5, 1.69],
        [2.75, 1.89],
        [3.0, 2.16],
        [3.25, 2.42],
    ]
    assert america["selected_line"] == 2.75
    assert america["selected_odds"] == 1.89


def test_golden_set_contains_non_lowest_line_choices() -> None:
    cases = load_cases()
    non_lowest = 0

    for case in cases:
        lowest_line = min(float(line) for line, _odds in case["offers"])
        if float(case["selected_line"]) > lowest_line:
            non_lowest += 1

    # Prevent reintroduction of the legacy "always choose the lowest acceptable line" shortcut.
    assert non_lowest >= 8
