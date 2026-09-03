import json
from pathlib import Path


REPO_ROOT = Path(__file__).parents[3]
MODEL_STATE = REPO_ROOT / "model" / "MODEL_STATE.json"


def test_distribution_method_is_not_yet_activated_in_canonical_state() -> None:
    state = json.loads(MODEL_STATE.read_text(encoding="utf-8"))

    market = state["market"]
    projection = state.get("projection", {})

    assert "distribution_method" not in market
    assert "distribution_method" not in projection
    assert state["change_control"]["explicit_user_approval_required"] is True


def test_staging_does_not_reactivate_sep1_hardening() -> None:
    state = json.loads(MODEL_STATE.read_text(encoding="utf-8"))

    assert state["model"]["regime"] == "PRE-HARDENING"
    assert state["rules"]["sep1_hardening"] is False
    assert state["rules"]["deprecated_restrictions"]["o3_75_hard_gates"] is False
