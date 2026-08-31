from app.schemas.analysis import LineupExtraction, OddsExtraction, OddsLine, XISignals

from .base import FixtureIdentity, ImagePayload, VisionAdapter


class DemoVisionAdapter(VisionAdapter):
    name = "demo"

    def extract_lineup(
        self,
        images: tuple[ImagePayload, ...],
        fixture: FixtureIdentity,
    ) -> LineupExtraction:
        del images
        return LineupExtraction(
            home_team=fixture.home_team,
            away_team=fixture.away_team,
            home_starting_xi=[f"{fixture.home_team} player {index}" for index in range(1, 12)],
            away_starting_xi=[f"{fixture.away_team} player {index}" for index in range(1, 12)],
            home_bench=[],
            away_bench=[],
            home_missing=[],
            away_missing=[],
            home_formation="4-3-3",
            away_formation="4-2-3-1",
            confidence=0.93,
            visible_notes=["Demo extraction; configure VISION_PROVIDER=openai for real OCR"],
            xi_signals=XISignals(
                attack_shape_delta=0,
                creator_availability=0,
                finisher_availability=0,
                defensive_absence_over_impact=0,
                rotation_risk=0,
                cohesion_risk=0,
                service_quality=0,
                genuine_role_change=False,
                notes=["Neutral demo XI preserves the frozen grade"],
            ),
        )

    def extract_odds(
        self,
        images: tuple[ImagePayload, ...],
        fixture: FixtureIdentity,
    ) -> OddsExtraction:
        del images
        return OddsExtraction(
            match=f"{fixture.home_team} — {fixture.away_team}",
            totals=[
                OddsLine(line=2.75, over_odds=1.78, under_odds=2.02),
                OddsLine(line=3.0, over_odds=1.92, under_odds=1.88),
                OddsLine(line=3.25, over_odds=2.08, under_odds=1.74),
            ],
            confidence=0.96,
            visible_notes=["Demo prices; configure VISION_PROVIDER=openai for real extraction"],
        )
