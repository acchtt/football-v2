from __future__ import annotations

import logging
from dataclasses import dataclass
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

        fields = self._build_fields(fixture, assessment, latest_state, bet, settlement)
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
        bet: OfficialBetModel | None,
        settlement: ResultSettlementModel | None,
    ) -> dict[str, Any]:
        verdict = latest_state.verdict if latest_state is not None else "PRE_FROZEN"
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
        evidence = (
            latest_state.evidence_summary
            if latest_state is not None
            else assessment.evidence
        )

        fields: dict[str, Any] = {
            "Assessment ID": assessment.id,
            "Match": f"{fixture.home_team} vs {fixture.away_team}",
            "Competition": fixture.competition,
            "Model Version": assessment.model_version,
            "Assessment Time": assessment.frozen_at.isoformat(),
            "Assessment Period": latest_state.period if latest_state is not None else "PRE",
            "Verdict": verdict,
            "Candidate": assessment.structural_grade,
            "Website Fixture ID": fixture.id,
            "BSD Event ID": self._bsd_event_id(fixture.provider_fixture_id),
            "Data Provider": fixture.provider_name,
            "Evidence Version": "canonical-pre-hardening-v1",
            "Evidence Summary": self._compact_evidence(evidence),
        }
        if selected_line is not None:
            fields["Line"] = str(selected_line)
        if selected_odds is not None:
            fields["Odds"] = float(selected_odds)
        if bet is not None:
            fields["Stake u"] = float(bet.stake_units)
        if settlement is not None:
            fields["Result"] = settlement.settlement
            fields["P/L u"] = float(Decimal(settlement.pnl_units))
            fields["Score"] = f"{settlement.home_goals_90}-{settlement.away_goals_90}"
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
