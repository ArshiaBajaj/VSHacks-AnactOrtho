"""Health + config endpoints.

/api/health returns the UNION of the contract shape ({status, version}) and
the compat stub shape ({ok, llm, counts, ...}) so both the frontend client
and any contract consumers are satisfied by one endpoint.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter

from app import config

router = APIRouter(tags=["meta"])


@router.get("/health")
def health() -> dict:
    from app.api import compat_data
    from app.commentary.generator import llm_enabled

    return {
        "ok": True,
        "status": "ok",
        "service": "anact-ortho-server",
        "version": config.VERSION,
        "llm": "enabled" if llm_enabled() else "offline-fallback",
        "counts": {
            "players": len(compat_data.PLAYERS),
            "teams": len(compat_data.TEAMS),
            "films": len(compat_data.list_films()),
        },
        "time": datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "features": {
            "pose_enabled": config.pose_available(),
            "tts_enabled": config.tts_available(),
        },
    }


@router.get("/config")
def get_config() -> dict:
    return {
        "version": config.VERSION,
        "heatmap_grid": {"w": config.HEATMAP_GRID_W, "h": config.HEATMAP_GRID_H},
        "default_target_score": config.DEFAULT_TARGET_SCORE,
        "features": {
            "pose_enabled": config.pose_available(),
            "tts_enabled": config.tts_available(),
        },
    }
