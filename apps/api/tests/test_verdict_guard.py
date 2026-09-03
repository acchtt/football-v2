import pytest
from fastapi import HTTPException

from app.api.routes import issue_verdict
from app.config import Settings


def test_http_verdict_route_is_disabled_until_canonical_fair_total_exists() -> None:
    settings = Settings(
        database_url="sqlite+pysqlite:///:memory:",
        fixture_provider="demo",
        vision_provider="demo",
    )

    with pytest.raises(HTTPException) as exc_info:
        issue_verdict("fixture-id", None, settings)  # type: ignore[arg-type]

    assert exc_info.value.status_code == 503
    detail = str(exc_info.value.detail)
    assert "fair-total" in detail
    assert "MARKET_RECEIVED" in detail
