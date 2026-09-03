from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ModelIdentity(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    name: str
    version: str
    regime: str
    timezone: str


class DeprecatedRestrictions(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    youth_reserve_blanket_caps: bool
    general_short_sample_caps: bool
    o3_75_hard_gates: bool
    blanket_a2_burden_prohibitions: bool
    xi_route_prohibitions: bool
    h2h_vetoes: bool


class RuleState(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    recent_total_leakage_confirmation: bool
    sep1_hardening: bool
    chance_quality_role: Literal["supporting_modifier"]
    h2h_role: Literal["modifier_only"]
    price_can_promote_structure: bool
    prefer_lowest_clean_asian_total_burden: bool
    xi_names_can_create_unsupported_route: bool
    deprecated_restrictions: DeprecatedRestrictions


class ChangeControlState(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    audit_can_modify_model: bool
    silent_rule_changes: bool
    explicit_user_approval_required: bool
    production_requires_canonical_state: bool


class CompetitionScopeState(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    domestic_leagues: bool
    english_domestic_cups: bool
    dfb_pokal: bool
    north_american_leagues_cup: bool
    other_cups: bool
    legacy_k_league_exclusion: bool
    named_cup_exceptions: tuple[str, ...]


class StructuralState(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    grade_thresholds: dict[str, float]
    board_min_score: float
    weights: dict[str, float]
    two_sided_route_threshold: float
    two_sided_carrier_tolerance: float
    secondary_route_threshold: float


class XIState(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    rotation_penalty: float
    cohesion_penalty: float
    two_band_downgrade_threshold: float
    one_band_downgrade_threshold: float
    one_band_upgrade_threshold: float
    two_band_upgrade_threshold: float
    normal_promotion_cap_bands: int
    two_band_upgrade_requires_genuine_role_change: bool


class MarketState(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    minimum_extraction_confidence: float = Field(ge=0.0, le=1.0)
    minimum_price: float
    maximum_price: float
    grade_based_maximum_line_enabled: Literal[False]


class ModelState(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    schema_version: int
    model: ModelIdentity
    rules: RuleState
    change_control: ChangeControlState
    competition_scope: CompetitionScopeState
    structural: StructuralState
    xi: XIState
    market: MarketState

    @model_validator(mode="after")
    def validate_production_guardrails(self) -> ModelState:
        if self.schema_version != 2:
            raise ValueError("Canonical model-state schema must be version 2")
        if self.model.version != "v0.2.47-R":
            raise ValueError("Production model version must remain v0.2.47-R")
        if self.model.regime != "PRE-HARDENING":
            raise ValueError("Production model regime must remain PRE-HARDENING")
        if self.rules.sep1_hardening:
            raise ValueError("Sep-1 hardening is explicitly inactive")
        if self.change_control.audit_can_modify_model:
            raise ValueError("Audit history cannot modify active model state")
        if self.change_control.silent_rule_changes:
            raise ValueError("Silent rule changes are forbidden")
        if not self.change_control.explicit_user_approval_required:
            raise ValueError("Explicit user approval is required for model changes")
        deprecated = self.rules.deprecated_restrictions.model_dump()
        if any(deprecated.values()):
            raise ValueError("Deprecated hardened restrictions cannot be active")
        if self.competition_scope.legacy_k_league_exclusion:
            raise ValueError("Legacy K League exclusion is not active in canonical state")
        if self.rules.price_can_promote_structure:
            raise ValueError("Price cannot promote structural quality")
        if self.rules.xi_names_can_create_unsupported_route:
            raise ValueError("XI names cannot create a route unsupported by the team profile")
        if abs(self.market.minimum_price - 1.70) > 1e-9:
            raise ValueError("Restored v0.2.47-R minimum Over price must remain 1.70")
        if self.market.grade_based_maximum_line_enabled:
            raise ValueError("Blanket grade-based maximum total lines are inactive")
        return self

    @property
    def banner(self) -> str:
        recent = "ACTIVE" if self.rules.recent_total_leakage_confirmation else "INACTIVE"
        sep1 = "ACTIVE" if self.rules.sep1_hardening else "INACTIVE"
        return (
            f"{self.model.name} {self.model.version} | {self.model.regime} | "
            f"Recent-total confirmation: {recent} | Sep-1 hardening: {sep1}"
        )


def _canonical_state_path() -> Path:
    source = Path(__file__).resolve()
    candidates: list[Path] = []

    # Source checkout: <repo>/apps/api/app/model_state.py -> <repo>/model/...
    if len(source.parents) > 3:
        candidates.append(source.parents[3] / "model" / "MODEL_STATE.json")

    # Container image: /app/app/model_state.py -> /app/model/...
    if len(source.parents) > 1:
        candidates.append(source.parents[1] / "model" / "MODEL_STATE.json")

    candidates.append(Path.cwd() / "model" / "MODEL_STATE.json")

    for candidate in dict.fromkeys(candidates):
        if candidate.is_file():
            return candidate
    searched = ", ".join(str(candidate) for candidate in dict.fromkeys(candidates))
    raise RuntimeError(f"Canonical MODEL_STATE.json not found. Searched: {searched}")


@lru_cache(maxsize=1)
def get_model_state() -> ModelState:
    path = _canonical_state_path()
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Unable to load canonical model state from {path}: {error}") from error
    return ModelState.model_validate(payload)
