import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.model_control import router as model_control_router
from app.api.routes import router
from app.config import get_settings
from app.db.models import Base
from app.db.session import engine
from app.model_state import get_model_state

settings = get_settings()
model_state = get_model_state()
logger = logging.getLogger("football.model_control")


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    # Loading ModelState is intentionally fatal when canonical production guardrails fail.
    logger.warning("ACTIVE MODEL: %s", model_state.banner)
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description=f"Deterministic decision control — {model_state.banner}",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.web_origin],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
app.include_router(model_control_router)
app.include_router(router)
