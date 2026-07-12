"""CourtVision AI backend — FastAPI app factory.

Run locally:
    uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

import os
from pathlib import Path

# Load backend/.env if present (OPENAI_API_KEY, etc.) before other imports use env.
_env = Path(__file__).resolve().parent.parent / ".env"
if _env.exists():
    for _line in _env.read_text().splitlines():
        _line = _line.strip()
        if not _line or _line.startswith("#") or "=" not in _line:
            continue
        _k, _v = _line.split("=", 1)
        _k, _v = _k.strip(), _v.strip().strip('"').strip("'")
        if _k and _k not in os.environ:
            os.environ[_k] = _v

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app import config
from app.db import init_db

def create_app() -> FastAPI:
    app = FastAPI(
        title="CourtVision AI",
        version=config.VERSION,
        description="On-device AI referee, commentator, and scout — backend API.",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    init_db()

    # Routers are registered here by the API layer.
    from app.api import register_routes

    register_routes(app)

    app.mount("/media", StaticFiles(directory=str(config.MEDIA_DIR)), name="media")
    return app


app = create_app()
