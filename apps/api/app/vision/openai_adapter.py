import base64

from app.schemas.analysis import LineupExtraction, OddsExtraction

from .base import FixtureIdentity, ImagePayload, VisionAdapter

LINEUP_INSTRUCTIONS = """You extract confirmed football lineup information from screenshots.
Only report information visible in the supplied images. Match the images to the named frozen
fixture. If an image is unrelated or unreadable, return empty player lists and confidence 0.
Names on the bench must never be treated as starters. Infer XI signals conservatively: use zero
when the screenshot does not support a directional judgment. Rotation/cohesion signals describe
evidence visible from the lineup, not speculation. Never invent missing players."""

ODDS_INSTRUCTIONS = """You extract full-match Asian goal totals from bookmaker screenshots.
Only report visible lines for the named frozen fixture. Do not include first-half markets, team
totals, handicaps, extra-time markets, or inferred prices. If unrelated or unreadable, return an
empty totals list and confidence 0. Full-match totals mean 90 minutes plus stoppage time."""


class OpenAIVisionAdapter(VisionAdapter):
    name = "openai"

    def __init__(self, api_key: str, model: str) -> None:
        from openai import OpenAI

        self.client = OpenAI(api_key=api_key)
        self.model = model

    @staticmethod
    def _content(
        prompt: str,
        images: tuple[ImagePayload, ...],
    ) -> list[dict[str, str]]:
        content: list[dict[str, str]] = [{"type": "input_text", "text": prompt}]
        for image in images:
            encoded = base64.b64encode(image.content).decode("ascii")
            content.append(
                {
                    "type": "input_image",
                    "image_url": f"data:{image.content_type};base64,{encoded}",
                    "detail": "high",
                }
            )
        return content

    def extract_lineup(
        self,
        images: tuple[ImagePayload, ...],
        fixture: FixtureIdentity,
    ) -> LineupExtraction:
        prompt = (
            f"Frozen fixture: {fixture.home_team} vs {fixture.away_team} "
            f"({fixture.competition}). Extract the lineup package."
        )
        response = self.client.responses.parse(
            model=self.model,
            instructions=LINEUP_INSTRUCTIONS,
            input=[
                {
                    "role": "user",
                    "content": self._content(prompt, images),
                }
            ],
            text_format=LineupExtraction,
        )
        if response.output_parsed is None:
            raise ValueError("Vision model returned no structured lineup extraction")
        return response.output_parsed

    def extract_odds(
        self,
        images: tuple[ImagePayload, ...],
        fixture: FixtureIdentity,
    ) -> OddsExtraction:
        prompt = (
            f"Frozen fixture: {fixture.home_team} vs {fixture.away_team} "
            f"({fixture.competition}). Extract every visible full-match Asian total."
        )
        response = self.client.responses.parse(
            model=self.model,
            instructions=ODDS_INSTRUCTIONS,
            input=[
                {
                    "role": "user",
                    "content": self._content(prompt, images),
                }
            ],
            text_format=OddsExtraction,
        )
        if response.output_parsed is None:
            raise ValueError("Vision model returned no structured odds extraction")
        return response.output_parsed
