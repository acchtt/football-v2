from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import MatchStageEventModel
from app.model_state import get_model_state

STAGES = (
    "DISCOVERED",
    "PRE_SCREENED",
    "PRE_FROZEN",
    "WAITING_XI",
    "XI_CONFIRMED",
    "XI_RERANKED",
    "WAITING_MARKET",
    "MARKET_RECEIVED",
    "OFFICIAL_LOCK",
    "HOLD",
    "SETTLED",
    "AUDITED",
)

_STAGE_RANK = {
    "DISCOVERED": 10,
    "PRE_SCREENED": 20,
    "PRE_FROZEN": 30,
    "WAITING_XI": 40,
    "XI_CONFIRMED": 50,
    "XI_RERANKED": 60,
    "WAITING_MARKET": 70,
    "MARKET_RECEIVED": 80,
    "OFFICIAL_LOCK": 90,
    "HOLD": 90,
    "SETTLED": 100,
    "AUDITED": 110,
}


def append_stage_event(
    session: Session,
    *,
    fixture_id: str,
    stage: str,
    event_key: str,
    payload: Mapping[str, Any] | None = None,
    source_kind: str = "system",
    source_reference: str | None = None,
) -> MatchStageEventModel:
    """Append one immutable state event, idempotently and without moving backwards."""
    if stage not in _STAGE_RANK:
        raise ValueError(f"Unknown match stage: {stage}")

    state = get_model_state()
    existing = session.scalar(
        select(MatchStageEventModel).where(
            MatchStageEventModel.fixture_id == fixture_id,
            MatchStageEventModel.model_version == state.model.version,
            MatchStageEventModel.event_key == event_key,
        )
    )
    if existing is not None:
        if existing.stage != stage:
            raise ValueError(
                f"Stage event key {event_key!r} already exists as {existing.stage}"
            )
        return existing

    latest = session.scalar(
        select(MatchStageEventModel)
        .where(
            MatchStageEventModel.fixture_id == fixture_id,
            MatchStageEventModel.model_version == state.model.version,
        )
        .order_by(MatchStageEventModel.created_at.desc(), MatchStageEventModel.id.desc())
        .limit(1)
    )
    if latest is not None and _STAGE_RANK[stage] < _STAGE_RANK[latest.stage]:
        raise ValueError(
            f"Cannot move match stage backwards from {latest.stage} to {stage}"
        )
    if latest is not None and latest.stage == "OFFICIAL_LOCK" and stage not in {
        "SETTLED",
        "AUDITED",
    }:
        raise ValueError("An official lock cannot be replaced by a later market or HOLD state")
    if latest is not None and latest.stage == "HOLD" and stage not in {"AUDITED"}:
        raise ValueError("A finalized HOLD cannot be silently replaced")
    if latest is not None and latest.stage == "SETTLED" and stage != "AUDITED":
        raise ValueError("A settled match can only proceed to AUDITED")

    record = MatchStageEventModel(
        fixture_id=fixture_id,
        model_version=state.model.version,
        model_regime=state.model.regime,
        stage=stage,
        event_key=event_key,
        payload=dict(payload or {}),
        source_kind=source_kind,
        source_reference=source_reference,
    )
    session.add(record)
    session.flush()
    return record


def latest_stage(session: Session, fixture_id: str) -> MatchStageEventModel | None:
    state = get_model_state()
    return session.scalar(
        select(MatchStageEventModel)
        .where(
            MatchStageEventModel.fixture_id == fixture_id,
            MatchStageEventModel.model_version == state.model.version,
        )
        .order_by(MatchStageEventModel.created_at.desc(), MatchStageEventModel.id.desc())
        .limit(1)
    )
