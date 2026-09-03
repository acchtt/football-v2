from datetime import datetime

from pydantic import BaseModel


class MarketVerificationView(BaseModel):
    id: str
    fixture_id: str
    odds_submission_id: str
    verified_by: str
    verified_at: datetime
    extraction: dict[str, object]


class MarketStatusView(BaseModel):
    fixture_id: str
    latest_odds_submission_id: str | None
    verified_odds_submission_id: str | None
    verification_id: str | None
    verified: bool
    ready_for_verification: bool
    verified_at: datetime | None
    lock_engine_ready: bool = False
    blocker: str | None = "CANONICAL_FAIR_TOTAL_LOGIC_PENDING"
