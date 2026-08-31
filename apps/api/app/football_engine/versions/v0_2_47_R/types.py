from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any


class StructuralGrade(StrEnum):
    A1 = "A1"
    A2 = "A2"
    B_PLUS = "B+"
    B = "B"
    PASS = "PASS"


class StructuralType(StrEnum):
    TWO_SIDED = "TWO_SIDED"
    ELITE_CARRIER = "ELITE_CARRIER"
    CARRIER_SECONDARY_ROUTE = "CARRIER_SECONDARY_ROUTE"


class AssessmentStatus(StrEnum):
    FROZEN = "FROZEN"
    EXCLUDED = "EXCLUDED"
    DATA_INCOMPLETE = "DATA_INCOMPLETE"


@dataclass(frozen=True, slots=True)
class StructuralInput:
    provider_fixture_id: str
    competition: str
    country_code: str
    home_team: str
    away_team: str
    kickoff_utc: datetime
    two_sided_strength: float
    carrier_ceiling: float
    opponent_secondary_route: float
    failure_mode_resistance: float
    profile_gate: float
    chance_quality: float
    data_complete: bool
    failure_modes: tuple[str, ...] = ()
    evidence: Mapping[str, Any] = field(default_factory=dict)
    source_metadata: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True, slots=True)
class StructuralAssessment:
    grade: StructuralGrade
    structural_type: StructuralType
    score: float
    status: AssessmentStatus
    display_on_board: bool
    failure_modes: tuple[str, ...]
    evidence: Mapping[str, Any]
    exclusion_reason: str | None = None
