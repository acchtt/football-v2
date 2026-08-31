from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Football v2"
    app_env: str = "development"
    database_url: str = (
        "postgresql+psycopg://football:football_local_only@localhost:5432/football_v2"
    )
    fixture_provider: str = "demo"
    sportmonks_api_token: str | None = None
    sportmonks_base_url: str = "https://api.sportmonks.com/v3/football"
    sportmonks_timeout_seconds: float = 20.0
    sportmonks_history_matches: int = 10
    sportmonks_lookback_days: int = 180
    research_import_token: str | None = None
    seed_demo_on_read: bool = True
    web_origin: str = "http://localhost:3000"
    timezone: str = "Asia/Ho_Chi_Minh"
    model_version: str = "v0.2.47-R"
    vision_provider: str = "demo"
    vision_model: str = "gpt-5.6"
    openai_api_key: str | None = None
    upload_dir: str = "/data/uploads"
    max_upload_bytes: int = 10 * 1024 * 1024
    max_upload_files: int = 6

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
