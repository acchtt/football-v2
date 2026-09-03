import json
from dataclasses import fields
from pathlib import Path

import pytest

from app.football_engine.research.scenario_producer_recovery import (
    CURRENT_TEMPLATE_CANDIDATE,
    RESEARCH_BLOCKER,
    ScenarioProducerResult,
    analyze_scenario_producer_evidence,
    resolve_scenario_template,
)
from app.football_engine.versions.v0_2_47_R.scenario_distribution import (
    build_scenario_distribution,
)


FIXTURE = Path(__file__).parent / "fixtures" / "scenario_producer_evidence.json"


def _cases() -> list[dict]:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


def _report():  # type: ignore[no-untyped-def]
    return analyze_scenario_producer_evidence(_cases())


def test_dataset_has_current_historical_and_negative_evidence() -> None:
    cases = _cases()
    assert len(cases) >= 9
    assert {case["evidence_status"] for case in cases} == {
        "current_support",
        "historical_only",
        "negative_control",
    }
    assert all(case["source_reference"] for case in cases)


def test_producer_has_no_grade_only_mapping_surface() -> None:
    names = {field.name for field in fields(ScenarioProducerResult)}
    assert "grade" not in names
    assert "structural_grade" not in names


def test_current_two_sided_strong_is_unresolved_without_explicit_scores() -> None:
    report = _report()
    summary = next(
        item for item in report.summaries if item.structural_archetype == "TWO_SIDED_STRONG"
    )
    assert summary.current_support_count == 3
    assert summary.current_explicit_score_count == 0
    assert summary.current_band_only_count == 3
    assert summary.template_candidate_ready is False

    result = resolve_scenario_template(report, structural_archetype="TWO_SIDED_STRONG")
    assert result.status == "UNRESOLVED"
    assert result.primary_scores == ()
    assert result.upside_scores == ()
    assert result.production_ready is False
    assert result.blocker == RESEARCH_BLOCKER
    assert "no explicit score set" in result.reason


def test_cross_version_carrier_recurrence_is_detected_but_not_promoted() -> None:
    report = _report()
    summary = next(
        item
        for item in report.summaries
        if item.structural_archetype == "ELITE_CARRIER_WITH_SECONDARY"
    )
    assert summary.repeated_primary_signature == ((2, 1), (3, 1), (2, 2))
    assert summary.repeated_primary_signature_count == 2
    # LAFC is historical evidence; Hiroshima is a negative control. The negative row
    # cannot be counted as a second positive recurrence.
    assert summary.positive_historical_recurrence_count == 1
    assert summary.current_explicit_score_count == 0
    assert summary.template_candidate_ready is False

    result = resolve_scenario_template(
        report,
        structural_archetype="ELITE_CARRIER_WITH_SECONDARY",
    )
    assert result.status == "UNRESOLVED"
    assert result.primary_scores == ()
    assert "cannot activate" in result.reason


def test_no_recovered_archetype_is_currently_template_ready() -> None:
    report = _report()
    assert report.production_ready is False
    assert not any(summary.template_candidate_ready for summary in report.summaries)


def test_unresolved_producer_cannot_be_fed_to_method_c() -> None:
    report = _report()
    unresolved = resolve_scenario_template(report, structural_archetype="TWO_SIDED_STRONG")
    with pytest.raises(ValueError, match="At least one primary score scenario"):
        build_scenario_distribution(
            unresolved.primary_scores,
            upside_scores=unresolved.upside_scores,
        )


def test_synthetic_future_current_support_requires_repeated_identical_full_template() -> None:
    cases = _cases()
    template = {
        "source_reference": "synthetic-current-evidence",
        "match": "Synthetic current evidence",
        "model_version": "v0.2.47-R",
        "structural_archetype": "TEST_CURRENT_ARCHETYPE",
        "expected_total_range": [3, 4],
        "anchor_goal": 3,
        "primary_scores": [[2, 1], [3, 1], [2, 2]],
        "upside_scores": [[3, 2]],
        "evidence_status": "current_support",
        "current_scope_compatible": True,
        "audit_note": "Synthetic unit-test row only.",
    }
    cases.extend(
        [
            {**template, "case_id": "SYNTH-CURRENT-1", "source_reference": "synth-1"},
            {**template, "case_id": "SYNTH-CURRENT-2", "source_reference": "synth-2"},
        ]
    )
    report = analyze_scenario_producer_evidence(cases)
    result = resolve_scenario_template(report, structural_archetype="TEST_CURRENT_ARCHETYPE")
    assert result.status == CURRENT_TEMPLATE_CANDIDATE
    assert result.template_candidate_ready is True
    assert result.primary_scores == ((2, 1), (3, 1), (2, 2))
    assert result.upside_scores == ((3, 2),)
    # Recovery readiness is not activation authority.
    assert result.production_ready is False
