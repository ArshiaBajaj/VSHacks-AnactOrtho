"""Central config. Reads env vars, provides paths and feature flags."""
from __future__ import annotations

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/
DATA_DIR = Path(os.environ.get("COURTVISION_DATA_DIR", BASE_DIR / "data"))
UPLOAD_DIR = DATA_DIR / "uploads"
MEDIA_DIR = DATA_DIR / "media"
DB_PATH = DATA_DIR / "courtvision.db"

for _d in (DATA_DIR, UPLOAD_DIR, MEDIA_DIR):
    _d.mkdir(parents=True, exist_ok=True)

VERSION = "0.1.0"

# Feature flags — degrade gracefully when optional deps are missing.
def pose_available() -> bool:
    try:
        import mediapipe  # noqa: F401
        return True
    except Exception:
        return False


def tts_available() -> bool:
    try:
        import pyttsx3  # noqa: F401
        return True
    except Exception:
        return False


# Processing knobs
PROCESS_FPS = 30            # downsample target, per pitch doc (30fps @ 720p)
PROCESS_MAX_WIDTH = 1280
HEATMAP_GRID_W = 30
HEATMAP_GRID_H = 17
DEFAULT_TARGET_SCORE = 21
