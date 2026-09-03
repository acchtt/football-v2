import json
from pathlib import Path

from app.football_engine.research.shadow_market_policy import (
    ProtectionPosture,
    build_shadow_market_envelope,
)


FIXTURE_DIR = Path(__file__).parent / "fixtures"
GOLDEN_PATH = FIXTURE_DIR / "market_golden_cases.json"
INPUT_PATH = FIXTURE_DIR / "golden_policy_inputs.json"


def load_json(path: Path) -> list[dict[str, object]]:
    return json.loads(path.read_text(encoding="utf-8"))


def test_every_golden_case_has_shadow_policy_input() -> None:
    golden = {case["case_id"] for case in load_json(GOLDEN_PATH)}
    policy = {case["case_id"] for case in load_json(INPUT_PATH)}
    assert policy == golden


def test_historical_selected_line_survives_shadow_envelope_for_full_golden_set() -> None:
    golden = {case["case_id"]: case for case in load_json(GOLDEN_PATH)}
    inputs = {case["case_id"]: case for case in load_json(INPUT_PATH)}

    failures: list[str] = []
    for case_id, case in golden.items():
        policy = inputs[case_id]
        envelope = build_shadow_market_envelope(
            anchor_goal=int(policy["anchor_goal"]),
            posture=ProtectionPosture(str(policy["posture"])),
            offers=[tuple(offer) for offer in case["offers"]],
        )
        allowed = {(offer.line, offer.odds) for offer in envelope.allowed_offers}
        selected = (float(case["selected_line"]), float(case["selected_odds"]))
        if selected not in allowed:
            failures.append(f"{case_id}: selected={selected}, allowed={sorted(allowed)}")

    assert failures == []


def test_acceptance_case_is_narrowed_to_o275_only() -> None:
    golden = {case["case_id"]: case for case in load_json(GOLDEN_PATH)}
    america = golden["AME-MTY-20260903-ACCEPTANCE"]
    envelope = build_shadow_market_envelope(
        anchor_goal=3,
        posture=ProtectionPosture.PROTECTION_HEAVY,
        offers=[tuple(offer) for offer in america["offers"]],
    )

    assert [(offer.line, offer.odds) for offer in envelope.allowed_offers] == [(2.75, 1.89)]


def test_clean_cases_are_distinguished_from_audited_error_controls() -> None:
    inputs = load_json(INPUT_PATH)
    clean = [case for case in inputs if case["evidence_status"] in {"supporting_reconstruction", "historical_observation", "acceptance_control"}]
    errors = [case for case in inputs if str(case["evidence_status"]).startswith("audited_")]

    assert clean
    assert errors
    assert len(clean) + len(errors) == len(inputs)
