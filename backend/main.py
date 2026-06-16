import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import get_settings
from routers import studio, pdf, video_matcher, video_matcher_workflow

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure storage directory exists on startup
    Path(settings.storage_dir).mkdir(parents=True, exist_ok=True)
    logger.info("Javis Studio API started. Storage: %s", settings.storage_dir)
    yield
    logger.info("Javis Studio API shutting down.")


app = FastAPI(
    title=settings.app_title,
    version=settings.app_version,
    description="Javis Studio — LLM Script Generation + IndexTTS2 Audio Synthesis",
    lifespan=lifespan,
)

# CORS — accept any origin in dev; keeps credentials for audio fetch cookies
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(studio.router)
app.include_router(pdf.router)
app.include_router(video_matcher.router)
app.include_router(video_matcher_workflow.router)


@app.get("/health")
async def health():
    return {"status": "ok", "version": settings.app_version}


@app.get("/")
async def root():
    return {
        "service": settings.app_title,
        "docs": "/docs",
        "health": "/health",
    }
