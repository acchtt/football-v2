import json
from pathlib import Path

from app.football_engine.research.shadow_market_policy import (
    ProtectionPosture,
    build_shadow_market_envelope,
    classify_protection_posture,
)


CONTEXT_PATH = Path(__file__).parent / "fixtures" / "protection_context_cases.json"


def load_context_cases() -> list[dict[str, object]]:
    return json.loads(CONTEXT_PATH.read_text(encoding="utf-8"))


def test_recovered_context_separates_price_tolerant_and_protection_heavy_cases() -> None:
    cases = {case["case_id"]: case for case in load_context_cases()}

    assert classify_protection_posture(cases["KOE-HOF-20260829-CONTEXT"]) == ProtectionPosture.PRICE_TOLERANT
    assert classify_protection_posture(cases["ELV-LEV-20260829-CONTEXT"]) == ProtectionPosture.PRICE_TOLERANT
    assert classify_protection_posture(cases["IPS-LEI-20260826-CONTEXT"]) == ProtectionPosture.PROTECTION_HEAVY
    assert classify_protection_posture(cases["LEC-ROM-20260831-CONTEXT"]) == ProtectionPosture.PROTECTION_HEAVY
    assert classify_protection_posture(cases["GCZ-STG-20260903-CONTEXT"]) == ProtectionPosture.BALANCED


def test_protection_heavy_does_not_surrender_best_anchor_settlement() -> None:
    envelope = build_shadow_market_envelope(
        anchor_goal=3,
        posture=ProtectionPosture.PROTECTION_HEAVY,
        offers=[(2.75, 1.89), (3.0, 2.16), (3.25, 2.42)],
    )

    assert [(offer.line, offer.odds) for offer in envelope.allowed_offers] == [(2.75, 1.89)]
    assert envelope.production_ready is False


def test_balanced_allows_one_settlement_step_but_not_two() -> None:
    envelope = build_shadow_market_envelope(
        anchor_goal=3,
        posture=ProtectionPosture.BALANCED,
        offers=[(2.75, 1.80), (3.0, 2.05), (3.25, 2.30)],
    )

    assert [offer.line for offer in envelope.allowed_offers] == [2.75, 3.0]
    assert [offer.line for offer in envelope.rejected_offers] == [3.25]


def test_price_tolerant_is_still_an_envelope_not_a_selector() -> None:
    envelope = build_shadow_market_envelope(
        anchor_goal=3,
        posture=ProtectionPosture.PRICE_TOLERANT,
        offers=[(2.75, 1.74), (3.0, 1.95), (3.25, 2.20)],
    )

    assert len(envelope.allowed_offers) >= 2
    assert envelope.production_ready is False
    assert not hasattr(envelope, "selected_line")
