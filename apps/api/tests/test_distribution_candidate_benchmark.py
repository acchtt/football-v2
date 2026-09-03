import json
from pathlib import Path

from app.football_engine.research.distribution_candidate_benchmark import (
    CANDIDATES,
    benchmark_distribution_candidates,
    proposal_eligible_candidates,
)
from app.football_engine.research.shadow_market_policy import (
    ProtectionPosture,
    build_shadow_market_envelope,
)


FIXTURE_DIR = Path(__file__).parent / "fixtures"
RECOVERY_PATH = FIXTURE_DIR / "projection_recovery_cases.json"
GOLDEN_PATH = FIXTURE_DIR / "market_golden_cases.json"
POLICY_PATH = FIXTURE_DIR / "golden_policy_inputs.json"


def load_json(path: Path) -> list[dict[str, object]]:
    return json.loads(path.read_text(encoding="utf-8"))


def test_only_reciprocal_total_scenario_count_is_proposal_eligible() -> None:
    diagnostics = benchmark_distribution_candidates(load_json(RECOVERY_PATH))
    eligible = proposal_eligible_candidates(diagnostics)

    assert [item.candidate_id for item in eligible] == [
        "RECIPROCAL_TOTAL_SCENARIO_COUNT_UPSIDE"
    ]
    assert eligible[0].range_hit_count == 5
    assert eligible[0].market_reference_count == 4
    assert eligible[0].market_reference_top_ev_hit_count == 4
    assert eligible[0].preserves_recorded_upside is True
    assert eligible[0].parameter_free is True
    assert eligible[0].production_ready is False


def test_heavier_upside_candidates_break_hiroshima_market_reference() -> None:
    diagnostics = {
        item.candidate_id: item
        for item in benchmark_distribution_candidates(load_json(RECOVERY_PATH))
    }

    for candidate_id in (
        "EQUAL_ALL_SCENARIOS",
        "HALF_UPSIDE_WEIGHT",
        "RECIPROCAL_PRIMARY_COUNT_UPSIDE",
    ):
        item = diagnostics[candidate_id]
        hiroshima = next(
            case for case in item.case_diagnostics if case.case_id == "HIR-KAW-20260822-PREMATCH"
        )
        assert hiroshima.range_hit is True
        assert hiroshima.market_reference_top_ev_hit is False
        assert hiroshima.reference_ev_rank == 2
        assert item.proposal_eligible is False


def test_light_tuned_tail_fits_but_is_not_parameter_free() -> None:
    diagnostics = {
        item.candidate_id: item
        for item in benchmark_distribution_candidates(load_json(RECOVERY_PATH))
    }
    light = diagnostics["LIGHT_UPSIDE_010"]

    assert light.all_ranges_hit is True
    assert light.all_market_references_top_ev is True
    assert light.preserves_recorded_upside is True
    assert light.parameter_free is False
    assert light.proposal_eligible is False


def test_primary_only_control_fits_but_discards_recorded_upside() -> None:
    diagnostics = {
        item.candidate_id: item
        for item in benchmark_distribution_candidates(load_json(RECOVERY_PATH))
    }
    primary_only = diagnostics["PRIMARY_ONLY_CONTROL"]

    assert primary_only.all_ranges_hit is True
    assert primary_only.all_market_references_top_ev is True
    assert primary_only.preserves_recorded_upside is False
    assert primary_only.parameter_free is True
    assert primary_only.proposal_eligible is False


def test_candidate_catalog_contains_no_poisson_method() -> None:
    catalog = " ".join(
        f"{candidate.candidate_id} {candidate.description}" for candidate in CANDIDATES
    ).lower()
    assert "poisson" not in catalog
    assert "lambda" not in catalog


def test_distribution_benchmark_cannot_bypass_golden_policy_envelope() -> None:
    golden = {case["case_id"]: case for case in load_json(GOLDEN_PATH)}
    policy = {case["case_id"]: case for case in load_json(POLICY_PATH)}

    assert set(golden) == set(policy)
    for case_id, market_case in golden.items():
        policy_case = policy[case_id]
        envelope = build_shadow_market_envelope(
            anchor_goal=int(policy_case["anchor_goal"]),
            posture=ProtectionPosture(str(policy_case["posture"])),
            offers=tuple((float(line), float(odds)) for line, odds in market_case["offers"]),
        )
        allowed = {(offer.line, offer.odds) for offer in envelope.allowed_offers}
        historical = (
            float(market_case["selected_line"]),
            float(market_case["selected_odds"]),
        )
        assert historical in allowed, case_id

        # Distribution methods are downstream diagnostics only. They never expand the
        # categorical envelope, so a future EV ranking cannot resurrect a rejected line.
        assert all(offer.allowed for offer in envelope.allowed_offers)


def test_america_control_stays_narrow_before_any_distribution_ranking() -> None:
    golden = {case["case_id"]: case for case in load_json(GOLDEN_PATH)}
    policy = {case["case_id"]: case for case in load_json(POLICY_PATH)}
    america = golden["AME-MTY-20260903-ACCEPTANCE"]
    america_policy = policy["AME-MTY-20260903-ACCEPTANCE"]

    envelope = build_shadow_market_envelope(
        anchor_goal=int(america_policy["anchor_goal"]),
        posture=ProtectionPosture(str(america_policy["posture"])),
        offers=tuple((float(line), float(odds)) for line, odds in america["offers"]),
    )

    assert [(offer.line, offer.odds) for offer in envelope.allowed_offers] == [(2.75, 1.89)]
