from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

from app.model_state import get_model_state


class Settings(BaseSettings):
    app_name: str = "Football v2"
    app_env: str = "development"
    database_url: str = (
        "postgresql+psycopg://football:football_local_only@localhost:5432/football_v2"
    )
    fixture_provider: str = "demo"
    bsd_api_token: str | None = None
    bsd_base_url: str = "https://sports.bzzoiro.com/api/v2"
    bsd_timeout_seconds: float = 20.0
    bsd_history_matches: int = 10
    bsd_lookback_days: int = 180
    sportmonks_api_token: str | None = None
    sportmonks_base_url: str = "https://api.sportmonks.com/v3/football"
    sportmonks_timeout_seconds: float = 20.0
    sportmonks_history_matches: int = 10
    sportmonks_lookback_days: int = 180
    research_import_token: str | None = None
    seed_demo_on_read: bool = True
    web_origin: str = "http://localhost:3000"
    vision_provider: str = "demo"
    vision_model: str = "gpt-5.6"
    openai_api_key: str | None = None
    upload_dir: str = "/data/uploads"
    max_upload_bytes: int = 10 * 1024 * 1024
    max_upload_files: int = 6

    # Airtable is a reporting/projection sink only. It is never model authority.
    airtable_sync_enabled: bool = False
    airtable_token: str | None = None
    airtable_base_id: str = "appWyZJjitSBATXAU"
    airtable_decision_states_table: str = "Decision States"
    airtable_timeout_seconds: float = 15.0

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def model_version(self) -> str:
        return get_model_state().model.version

    @property
    def model_regime(self) -> str:
        return get_model_state().model.regime

    @property
    def timezone(self) -> str:
        return get_model_state().model.timezone


@lru_cache
def get_settings() -> Settings:
    return Settings()
