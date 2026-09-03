import json
from pathlib import Path

from app.football_engine.research.template_recovery import (
    GoalBand,
    analyze_template_cases,
    sufficiently_supported_consistent_groups,
)


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "projection_template_cases.json"


def load_template_cases() -> list[dict[str, object]]:
    return json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


def test_template_evidence_preserves_sources_without_inferred_probabilities() -> None:
    cases = load_template_cases()

    assert len(cases) >= 7
    assert len({case["case_id"] for case in cases}) == len(cases)

    for case in cases:
        assert case["source_record_id"]
        assert case["structural_archetype"]
        assert case["expected_total_range"]
        assert "weight" not in case
        assert "probabilities" not in case
        assert "poisson" not in str(case).lower()


def test_historical_recurrence_does_not_become_positive_validation_automatically() -> None:
    report = analyze_template_cases(load_template_cases())
    elite = next(
        group
        for group in report.groups
        if group.structural_archetype == "ELITE_CARRIER_WITH_SECONDARY"
    )

    assert elite.historical_sample_count == 2
    assert elite.historical_observed_bands == (GoalBand(3, 4),)
    assert elite.historical_mapping_consistent is True
    assert elite.supporting_sample_count == 0
    assert elite.supporting_mapping_status == "NO_SUPPORTING_EVIDENCE"
    assert elite.production_ready is False


def test_failed_forecast_is_counted_as_negative_control_not_support() -> None:
    report = analyze_template_cases(load_template_cases())
    hull = next(
        group
        for group in report.groups
        if group.structural_archetype == "ELITE_CARRIER_BROAD_RANGE"
    )

    assert hull.historical_sample_count == 1
    assert hull.negative_control_count == 1
    assert hull.supporting_sample_count == 0
    assert report.negative_control_count >= 2


def test_current_supporting_template_evidence_is_still_sparse() -> None:
    report = analyze_template_cases(load_template_cases())

    supporting_groups = [group for group in report.groups if group.supporting_sample_count]
    assert supporting_groups
    assert all(group.supporting_mapping_status == "SPARSE" for group in supporting_groups)
    assert sufficiently_supported_consistent_groups(report) == ()
    assert report.production_ready is False


def test_analyzer_reports_consistency_and_contradiction_without_selecting_a_band() -> None:
    base = {
        "source_record_id": "source",
        "structural_archetype": "SYNTHETIC_TWO_SIDED",
        "carrier_level": "credible",
        "secondary_route": "credible",
        "two_sided_strength": "strong",
        "failure_modes": [],
        "evidence_status": "supporting_reconstruction",
    }
    consistent = [
        {**base, "case_id": "one", "expected_total_range": [3, 4]},
        {**base, "case_id": "two", "expected_total_range": [3, 4]},
    ]
    consistent_report = analyze_template_cases(consistent)
    supported = sufficiently_supported_consistent_groups(consistent_report)

    assert len(supported) == 1
    assert supported[0].supporting_observed_bands == (GoalBand(3, 4),)
    assert supported[0].production_ready is False

    contradictory = [
        *consistent,
        {**base, "case_id": "three", "expected_total_range": [2, 3]},
    ]
    contradictory_report = analyze_template_cases(contradictory)
    group = contradictory_report.groups[0]

    assert group.supporting_mapping_status == "CONTRADICTORY"
    assert group.supporting_observed_bands == (GoalBand(2, 3), GoalBand(3, 4))
    assert sufficiently_supported_consistent_groups(contradictory_report) == ()
