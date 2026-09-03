import json
from pathlib import Path


REPO_ROOT = Path(__file__).parents[3]
MODEL_STATE = REPO_ROOT / "model" / "MODEL_STATE.json"
METHOD_ID = "RECIPROCAL_TOTAL_SCENARIO_COUNT_V1"


def test_distribution_method_c_is_approved_in_canonical_state() -> None:
    state = json.loads(MODEL_STATE.read_text(encoding="utf-8"))

    projection = state["projection"]

    assert state["schema_version"] == 3
    assert projection["distribution_method"] == METHOD_ID
    assert projection["distribution_method_approved"] is True
    assert projection["score_scenario_source"] == "EXPLICIT_PRIMARY_UPSIDE_SCENARIOS"
    assert projection["upstream_scenario_producer_status"] == "PENDING_IMPLEMENTATION"
    assert projection["synthetic_scorelines_allowed"] is False
    assert projection["poisson_fallback_allowed"] is False
    assert "distribution_method" not in state["market"]
    assert state["change_control"]["explicit_user_approval_required"] is True


def test_method_c_activation_does_not_reactivate_sep1_hardening() -> None:
    state = json.loads(MODEL_STATE.read_text(encoding="utf-8"))

    assert state["model"]["regime"] == "PRE-HARDENING"
    assert state["rules"]["sep1_hardening"] is False
    assert state["rules"]["deprecated_restrictions"]["o3_75_hard_gates"] is False
    assert state["market"]["minimum_price"] == 1.70
    assert state["market"]["grade_based_maximum_line_enabled"] is False
