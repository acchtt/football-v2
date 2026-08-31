from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Football v2"
    app_env: str = "development"
    database_url: str = (
        "postgresql+psycopg://football:football_local_only@localhost:5432/football_v2"
    )
    fixture_provider: str = "demo"
    seed_demo_on_read: bool = True
    web_origin: str = "http://localhost:3000"
    timezone: str = "Asia/Ho_Chi_Minh"
    model_version: str = "v0.2.47-R"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
