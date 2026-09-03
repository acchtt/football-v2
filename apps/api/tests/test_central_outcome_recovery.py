import json
from pathlib import Path

from app.football_engine.research.central_outcome_recovery import (
    analyze_central_outcome_cases,
    sufficiently_supported_anchor_groups,
)


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "central_outcome_cases.json"


def load_central_outcome_cases() -> list[dict[str, object]]:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def test_central_outcome_evidence_is_sourced_and_probability_free() -> None:
    cases = load_central_outcome_cases()

    assert len(cases) >= 12
    assert len({case["case_id"] for case in cases}) == len(cases)

    for case in cases:
        assert case["source_reference"]
        assert case["structural_family"]
        assert isinstance(case["anchor_goal"], int)
        assert "probability" not in str(case).lower()
        assert "poisson" not in str(case).lower()
        assert "fair_total" not in case
        assert "weight" not in case


def test_two_sided_recovery_has_repeated_three_goal_anchor_with_multiple_expressions() -> None:
    report = analyze_central_outcome_cases(load_central_outcome_cases())
    two_sided = next(
        group for group in report.groups if group.structural_family == "TWO_SIDED"
    )

    assert two_sided.supporting_sample_count == 4
    assert two_sided.supporting_anchor_goals == (3,)
    assert two_sided.supporting_mapping_status == "CONSISTENT"
    assert two_sided.supporting_selected_line_offsets == (-0.25, 0.0)
    assert two_sided.expression_diversity_status == "MULTIPLE_EXPRESSIONS"
    assert two_sided.non_lowest_selection_count >= 5
    assert two_sided.production_ready is False


def test_america_monterrey_is_acceptance_control_not_validation_evidence() -> None:
    cases = load_central_outcome_cases()
    america = next(
        case for case in cases if case["case_id"] == "AME-MTY-20260903-ACCEPTANCE-CENTER"
    )
    report = analyze_central_outcome_cases(cases)
    two_sided = next(
        group for group in report.groups if group.structural_family == "TWO_SIDED"
    )

    assert america["anchor_goal"] == 3
    assert america["selected_line"] == 2.75
    assert min(line for line, _odds in america["offers"]) == 2.5
    assert america["evidence_status"] == "acceptance_control"
    assert report.acceptance_control_count == 1
    assert two_sided.acceptance_control_count == 1
    assert two_sided.supporting_sample_count == 4


def test_a_repeated_anchor_does_not_imply_one_selected_line() -> None:
    base = {
        "source_reference": "synthetic-source",
        "structural_family": "SYNTHETIC",
        "structural_label": "synthetic two-sided",
        "anchor_goal": 3,
        "anchor_role": "protected_integer_boundary",
        "scope_compatible": True,
        "evidence_status": "supporting_reconstruction",
    }
    cases = [
        {
            **base,
            "case_id": "one",
            "selected_line": 2.75,
            "selected_odds": 1.9,
            "offers": [[2.5, 1.7], [2.75, 1.9], [3.0, 2.1]],
        },
        {
            **base,
            "case_id": "two",
            "selected_line": 3.0,
            "selected_odds": 1.95,
            "offers": [[2.75, 1.7], [3.0, 1.95], [3.25, 2.2]],
        },
    ]
    group = analyze_central_outcome_cases(cases).groups[0]

    assert group.supporting_anchor_goals == (3,)
    assert group.supporting_mapping_status == "CONSISTENT"
    assert group.supporting_selected_line_offsets == (-0.25, 0.0)
    assert group.expression_diversity_status == "MULTIPLE_EXPRESSIONS"


def test_audited_overstretch_rows_are_negative_controls_not_support() -> None:
    report = analyze_central_outcome_cases(load_central_outcome_cases())
    carrier = next(
        group for group in report.groups if group.structural_family == "CARRIER_HYBRID"
    )

    assert carrier.supporting_sample_count == 1
    assert carrier.supporting_anchor_goals == (3,)
    assert carrier.historical_anchor_goals == (3, 4)
    assert carrier.negative_control_count == 2
    assert carrier.supporting_mapping_status == "SPARSE"
    assert report.negative_control_count >= 5


def test_only_repeated_consistent_support_is_reported_as_proposal_candidate() -> None:
    report = analyze_central_outcome_cases(load_central_outcome_cases())
    candidates = sufficiently_supported_anchor_groups(report)

    assert [group.structural_family for group in candidates] == ["TWO_SIDED"]
    assert candidates[0].supporting_anchor_goals == (3,)
    assert candidates[0].production_ready is False
    assert report.production_ready is False
    assert report.blocker == "RESEARCH_ONLY_CENTRAL_OUTCOME_MAPPING_NOT_APPROVED"
