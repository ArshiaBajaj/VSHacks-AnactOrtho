# CourtVision AI — Backend

Turns a single courtside phone video into an automated referee, live commentator, and
free scouting analytics. This service powers the CourtVision frontend.

## Quick start (Windows/macOS/Linux)

```bash
cd backend
uv venv --python 3.12 .venv          # or: python -m venv .venv
.venv\Scripts\activate               # Windows  (source .venv/bin/activate elsewhere)
uv pip install -r requirements.txt   # or: pip install -r requirements.txt
uvicorn app.main:app --reload --port 8787
```

Port **8787** matters: the web frontend (`apps/web`) points at
`http://localhost:8787` by default. Open http://localhost:8787/docs for live
interactive API docs.

**Frontend devs:** read [`API_CONTRACT.md`](API_CONTRACT.md). You do not need a real
game video to build UI — `POST /api/games/g_sample/simulate` streams a realistic fake
game over the WebSocket.

## Architecture

```
video upload ──> workers/processor  (background job)
                   │
                   ├─ cv/        court homography · ball tracker (Kalman) · pose
                   │      └─ emits FrameObservation stream (cv/types.py — the seam)
                   ├─ engine/    scoring state machine · out-of-bounds · streaks
                   │      └─ emits GameEvent stream (models.py)
                   ├─ commentary/ playground-style lines + offline TTS (wav)
                   └─ analytics/  jump height · release velocity · heatmaps · highlights
                   
results ──> SQLite (data/courtvision.db) ──> REST API + WebSocket live stream
```

- **Everything runs locally** — no cloud calls, matching the project's edge-first pitch.
- Optional deps degrade gracefully: no MediaPipe → pose metrics are null; no TTS engine →
  `audio_url` is null. `GET /api/config` reports what's enabled.

## Tests

```bash
pytest
```
Integration tests generate synthetic court videos (a moving ball over a drawn court), so
they're deterministic and need no real footage.
