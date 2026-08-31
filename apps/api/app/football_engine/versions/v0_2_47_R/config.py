from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class StructuralConfig:
    a1_min_score: float = 85.0
    a2_min_score: float = 72.0
    b_plus_min_score: float = 60.0
    b_min_score: float = 45.0
    board_min_score: float = 60.0
    a1_min_profile: float = 70.0
    a1_min_chance_quality: float = 70.0
    a1_min_failure_resistance: float = 65.0
    mandatory_gate_floor: float = 55.0

    primary_route_weight: float = 0.38
    profile_weight: float = 0.22
    chance_quality_weight: float = 0.20
    failure_resistance_weight: float = 0.20


DEFAULT_CONFIG = StructuralConfig()
