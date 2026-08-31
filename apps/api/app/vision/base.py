from abc import ABC, abstractmethod
from dataclasses import dataclass

from app.schemas.analysis import LineupExtraction, OddsExtraction


@dataclass(frozen=True, slots=True)
class FixtureIdentity:
    home_team: str
    away_team: str
    competition: str


@dataclass(frozen=True, slots=True)
class ImagePayload:
    filename: str
    content_type: str
    content: bytes


class VisionAdapter(ABC):
    name: str

    @abstractmethod
    def extract_lineup(
        self,
        images: tuple[ImagePayload, ...],
        fixture: FixtureIdentity,
    ) -> LineupExtraction:
        """Extract visible lineup facts and bounded XI interpretation signals."""

    @abstractmethod
    def extract_odds(
        self,
        images: tuple[ImagePayload, ...],
        fixture: FixtureIdentity,
    ) -> OddsExtraction:
        """Extract Asian total lines and prices visible in the images."""
