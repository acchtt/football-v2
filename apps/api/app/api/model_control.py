from typing import Any

from fastapi import APIRouter

from app.model_state import get_model_state

router = APIRouter()


@router.get("/api/v1/model/state")
def active_model_state() -> dict[str, Any]:
    state = get_model_state()
    return {
        "banner": state.banner,
        "model": state.model.model_dump(),
        "rules": {
            "recent_total_leakage_confirmation": state.rules.recent_total_leakage_confirmation,
            "sep1_hardening": state.rules.sep1_hardening,
            "chance_quality_role": state.rules.chance_quality_role,
            "h2h_role": state.rules.h2h_role,
            "price_can_promote_structure": state.rules.price_can_promote_structure,
        },
        "change_control": state.change_control.model_dump(),
        "competition_scope": state.competition_scope.model_dump(),
    }
