from __future__ import annotations

import hashlib
import json
from typing import Any

from app.competition_scope import evaluate_competition
from app.providers.base import ProviderFixture, StructuralMetrics, TeamProfileSnapshot
from app.providers.research import ResearchFixtureRecord, ResearchImportProvider
from app.schemas.research import ResearchFixtureInput, ResearchImportRequest


def _fixture_identity(item: ResearchFixtureInput) -> str:
    if item.external_id:
        return item.external_id
    canonical = "|".join(
        (
            item.competition.casefold(),
            item.home_team.casefold(),
            item.away_team.casefold(),
            item.kickoff_utc.isoformat(),
        )
    )
    return hashlib.sha256(canonical.encode()).hexdigest()[:24]


def _source_metadata(item: ResearchFixtureInput, batch_label: str) -> dict[str, Any]:
    sources = [
        {
            "title": source.title,
            "url": str(source.url),
            "captured_at": source.captured_at.isoformat(),
        }
        for source in item.sources
    ]
    source_hash = hashlib.sha256(
        json.dumps(sources, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    return {
        "provider": "research",
        "batch_label": batch_label,
        "sources": sources,
        "source_hash": source_hash,
    }


def _mandatory_profile_complete(item: ResearchFixtureInput) -> bool:
    profile = item.profile
    return profile is not None and all(
        value is not None
        for value in (
            profile.home_gf,
            profile.home_ga,
            profile.away_gf,
            profile.away_ga,
        )
    )


def build_research_provider(payload: ResearchImportRequest) -> ResearchImportProvider:
    records: list[ResearchFixtureRecord] = []
    for item in payload.fixtures:
        identity = _fixture_identity(item)
        metadata = _source_metadata(item, payload.batch_label)
        if not evaluate_competition(item.competition, item.country_code, metadata).eligible:
            continue

        provider_fixture = ProviderFixture(
            provider_fixture_id=f"research:{identity}",
            provider_name="research",
            competition=item.competition,
            country_code=item.country_code,
            home_team=item.home_team,
            away_team=item.away_team,
            kickoff_utc=item.kickoff_utc,
            status=item.status,
            metadata=metadata,
        )
        profile = None
        if item.profile is not None:
            profile = TeamProfileSnapshot(
                source_key=f"research:{identity}:{metadata['source_hash'][:16]}",
                home_gf=item.profile.home_gf,
                home_ga=item.profile.home_ga,
                away_gf=item.profile.away_gf,
                away_ga=item.profile.away_ga,
                recent_gf=item.profile.recent_gf.model_dump(),
                recent_ga=item.profile.recent_ga.model_dump(),
                scoring_2plus_frequency=(
                    item.profile.scoring_2plus_frequency.model_dump()
                ),
                conceding_2plus_frequency=(
                    item.profile.conceding_2plus_frequency.model_dump()
                ),
                clean_sheet_rate=item.profile.clean_sheet_rate.model_dump(),
                home_split=item.profile.home_split,
                away_split=item.profile.away_split,
                chance_metrics=item.profile.chance_metrics,
                source_metadata=metadata,
            )
        structural = item.structural
        metrics = StructuralMetrics(
            two_sided_strength=structural.two_sided_strength,
            carrier_ceiling=structural.carrier_ceiling,
            opponent_secondary_route=structural.opponent_secondary_route,
            failure_mode_resistance=structural.failure_mode_resistance,
            profile_gate=structural.profile_gate,
            chance_quality=structural.chance_quality,
            # Do not trust a historical/import-side completeness flag to reactivate old
            # sample/xG gates. Canonical PRE-HARDENING completeness is mandatory GF/GA.
            data_complete=_mandatory_profile_complete(item),
            failure_modes=tuple(structural.failure_modes),
            evidence={
                **structural.evidence,
                "summary": structural.evidence.get(
                    "summary", "Source-backed daily web research"
                ),
                "research_sources": metadata["sources"],
            },
            source_metadata=metadata,
        )
        records.append(ResearchFixtureRecord(provider_fixture, profile, metrics))
    return ResearchImportProvider(payload.board_date_ict, records)
