from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any
from urllib.parse import quote

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.db.models import (
    DecisionStateModel,
    FixtureModel,
    MarketVerificationModel,
    OddsSubmissionModel,
    OfficialBetModel,
    ResultSettlementModel,
    StructuralAssessmentModel,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True, slots=True)
class AirtableSyncResult:
    attempted: bool
    synced: bool
    assessment_id: str
    record_id: str | None = None
    error: str | None = None


class AirtableSyncService:
    """Best-effort projection of canonical DB state into Airtable.

    PostgreSQL/event history remains authoritative. Airtable failures are logged and
    returned to the caller; they never roll back, mutate, or block a model decision.
    """

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.enabled = bool(settings.airtable_sync_enabled and settings.airtable_token)
        self.base_url = "https://api.airtable.com/v0"
        self.client = httpx.Client(
            timeout=settings.airtable_timeout_seconds,
            headers={
                "Authorization": f"Bearer {settings.airtable_token or ''}",
                "Content-Type": "application/json",
            },
        )

    def close(self) -> None:
        self.client.close()

    def sync_date(self, session: Session, target_date_ict: date) -> list[AirtableSyncResult]:
        fixture_ids = list(
            session.scalars(
                select(FixtureModel.id)
                .join(
                    StructuralAssessmentModel,
                    StructuralAssessmentModel.fixture_id == FixtureModel.id,
                )
                .where(FixtureModel.kickoff_ict_date == target_date_ict)
                .order_by(FixtureModel.kickoff_utc.asc())
            ).all()
        )
        return [self.sync_fixture(session, fixture_id) for fixture_id in fixture_ids]

    def sync_fixture(self, session: Session, fixture_id: str) -> AirtableSyncResult:
        assessment = session.scalar(
            select(StructuralAssessmentModel)
            .where(StructuralAssessmentModel.fixture_id == fixture_id)
            .order_by(StructuralAssessmentModel.frozen_at.desc())
            .limit(1)
        )
        if assessment is None:
            return AirtableSyncResult(False, False, fixture_id, error="NO_STRUCTURAL_ASSESSMENT")

        if not self.enabled:
            return AirtableSyncResult(False, False, assessment.id, error="AIRTABLE_SYNC_DISABLED")

        fixture = session.get(FixtureModel, fixture_id)
        if fixture is None:
            return AirtableSyncResult(True, False, assessment.id, error="FIXTURE_NOT_FOUND")

        latest_state = session.scalar(
            select(DecisionStateModel)
            .where(
                DecisionStateModel.fixture_id == fixture_id,
                DecisionStateModel.model_version == assessment.model_version,
            )
            .order_by(DecisionStateModel.created_at.desc())
            .limit(1)
        )
        market_verification = session.scalar(
            select(MarketVerificationModel)
            .where(MarketVerificationModel.fixture_id == fixture_id)
            .order_by(MarketVerificationModel.verified_at.desc())
            .limit(1)
        )
        market_odds = None
        if market_verification is not None:
            market_odds = session.get(OddsSubmissionModel, market_verification.odds_submission_id)

        bet = session.scalar(
            select(OfficialBetModel).where(
                OfficialBetModel.fixture_id == fixture_id,
                OfficialBetModel.model_version == assessment.model_version,
            )
        )
        settlement = None
        if bet is not None:
            settlement = session.scalar(
                select(ResultSettlementModel).where(ResultSettlementModel.official_bet_id == bet.id)
            )

        fields = self._build_fields(
            fixture,
            assessment,
            latest_state,
            market_verification,
            market_odds,
            bet,
            settlement,
        )
        try:
            record_id = self._upsert_by_assessment_id(assessment.id, fields)
        except Exception as exc:  # sync must never corrupt or block the canonical transaction
            logger.warning(
                "Airtable sync failed fixture_id=%s assessment_id=%s: %s",
                fixture_id,
                assessment.id,
                exc,
            )
            return AirtableSyncResult(True, False, assessment.id, error=str(exc))
        return AirtableSyncResult(True, True, assessment.id, record_id=record_id)

    def _build_fields(
        self,
        fixture: FixtureModel,
        assessment: StructuralAssessmentModel,
        latest_state: DecisionStateModel | None,
        market_verification: MarketVerificationModel | None,
        market_odds: OddsSubmissionModel | None,
        bet: OfficialBetModel | None,
        settlement: ResultSettlementModel | None,
    ) -> dict[str, Any]:
        verdict: str | None = None
        if bet is not None:
            verdict = "OFFICIAL BET"
            period = latest_state.period if latest_state is not None else "MARKET"
        elif latest_state is not None and "HOLD" in latest_state.verdict.upper():
            verdict = "NO BET — HOLD"
            period = latest_state.period
        elif market_verification is not None:
            period = "MARKET"
        else:
            period = latest_state.period if latest_state is not None else "PRE"

        selected_line = (
            bet.selected_line
            if bet is not None
            else (latest_state.selected_line if latest_state is not None else None)
        )
        selected_odds = (
            bet.selected_odds
            if bet is not None
            else (latest_state.selected_odds if latest_state is not None else None)
        )

        if market_verification is not None and market_odds is not None and bet is None:
            evidence = {
                "status": "MARKET_RECEIVED",
                "verification_id": market_verification.id,
                "verified_at": market_verification.verified_at.isoformat(),
                "odds_snapshot": dict(market_odds.extracted_lines_json),
                "lock_engine_ready": False,
                "blocker": "CANONICAL_FAIR_TOTAL_LOGIC_PENDING",
            }
        else:
            evidence = (
                latest_state.evidence_summary
                if latest_state is not None
                else assessment.evidence
            )

        # Explicit nulls clear stale values from an older Airtable projection. Airtable
        # is a mirror, so it must never preserve an obsolete LOCK/HOLD or selection
        # after canonical state says those fields are not present.
        fields: dict[str, Any] = {
            "Assessment ID": assessment.id,
            "Match": f"{fixture.home_team} vs {fixture.away_team}",
            "Competition": fixture.competition,
            "Model Version": assessment.model_version,
            "Assessment Time": assessment.frozen_at.isoformat(),
            "Assessment Period": period,
            "Verdict": verdict,
            "Candidate": assessment.structural_grade,
            "Line": str(selected_line) if selected_line is not None else None,
            "Odds": float(selected_odds) if selected_odds is not None else None,
            "Stake u": float(bet.stake_units) if bet is not None else None,
            "Result": settlement.settlement if settlement is not None else None,
            "P/L u": (
                float(Decimal(settlement.pnl_units)) if settlement is not None else None
            ),
            "Score": (
                f"{settlement.home_goals_90}-{settlement.away_goals_90}"
                if settlement is not None
                else None
            ),
            "Website Fixture ID": fixture.id,
            "BSD Event ID": self._bsd_event_id(fixture.provider_fixture_id),
            "Data Provider": fixture.provider_name,
            "Evidence Version": "canonical-pre-hardening-v1",
            "Evidence Summary": self._compact_evidence(evidence),
        }
        return fields

    def _upsert_by_assessment_id(self, assessment_id: str, fields: dict[str, Any]) -> str:
        table = quote(self.settings.airtable_decision_states_table, safe="")
        url = f"{self.base_url}/{self.settings.airtable_base_id}/{table}"
        formula = "{Assessment ID}='" + assessment_id.replace("'", "\\'") + "'"
        response = self.client.get(
            url,
            params={"filterByFormula": formula, "maxRecords": 2},
        )
        response.raise_for_status()
        records = response.json().get("records", [])
        if len(records) > 1:
            raise RuntimeError(f"duplicate Airtable Assessment ID: {assessment_id}")

        if records:
            record_id = str(records[0]["id"])
            write = self.client.patch(
                f"{url}/{record_id}",
                json={"fields": fields, "typecast": True},
            )
        else:
            write = self.client.post(
                url,
                json={"fields": fields, "typecast": True},
            )
        write.raise_for_status()
        return str(write.json()["id"])

    @staticmethod
    def _bsd_event_id(provider_fixture_id: str) -> str | None:
        if provider_fixture_id.startswith("bsd:"):
            return provider_fixture_id.split(":", 1)[1]
        return None

    @staticmethod
    def _compact_evidence(evidence: dict[str, Any]) -> str:
        # Airtable is a reporting mirror; detailed evidence remains in canonical JSON in Postgres.
        summary = evidence.get("summary") if isinstance(evidence, dict) else None
        if summary:
            return str(summary)[:9000]
        return str(evidence)[:9000]
