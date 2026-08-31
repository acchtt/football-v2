from app.config import Settings

from .base import VisionAdapter
from .demo import DemoVisionAdapter


def build_vision_adapter(settings: Settings) -> VisionAdapter:
    if settings.vision_provider == "demo":
        return DemoVisionAdapter()
    if settings.vision_provider == "openai":
        if not settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is required when VISION_PROVIDER=openai")
        from .openai_adapter import OpenAIVisionAdapter

        return OpenAIVisionAdapter(settings.openai_api_key, settings.vision_model)
    raise RuntimeError(f"Unknown vision provider: {settings.vision_provider}")
