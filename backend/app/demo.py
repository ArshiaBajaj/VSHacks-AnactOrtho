"""Seed a fully processed demo game through the real CV pipeline.

    python -m app.demo            # 20s synthetic game
    python -m app.demo --long     # 45s, more plays

Generates a synthetic court video, registers it like an upload, and runs the
actual processor synchronously (court detection, ball tracking, scoring engine,
commentary + TTS, highlights). Afterwards the local server has a game with
real media at /api/games — useful for frontend demos when no phone footage is
at hand. Idempotent per demo id: re-running replaces the previous demo game.
"""
from __future__ import annotations

import sys

from app import config
from app.cv.synthetic import generate_synthetic_game
from app.db import get_conn, init_db
from app.workers.processor import process_game

DEMO_GAME_ID = "g_demo"


def seed_demo(duration_s: int = 20) -> str:
    init_db()
    video_path = config.UPLOAD_DIR / f"{DEMO_GAME_ID}.mp4"
    truth = generate_synthetic_game(str(video_path), duration_s=duration_s)

    with get_conn() as conn:
        conn.execute("DELETE FROM games WHERE game_id = ?", (DEMO_GAME_ID,))
        conn.execute("DELETE FROM events WHERE game_id = ?", (DEMO_GAME_ID,))
        conn.execute("DELETE FROM highlights WHERE game_id = ?", (DEMO_GAME_ID,))
        conn.execute("DELETE FROM analytics WHERE game_id = ?", (DEMO_GAME_ID,))
        conn.execute(
            "INSERT INTO games (game_id, title, status, target_score, scoring, video_path)"
            " VALUES (?, ?, 'queued', ?, ?, ?)",
            (DEMO_GAME_ID, "Demo: synthetic pickup game", 21, "1s_and_2s", str(video_path)),
        )

    print(f"Processing {duration_s}s demo video ({len(truth['shots'])} scripted shots)...")
    process_game(DEMO_GAME_ID)

    with get_conn() as conn:
        row = conn.execute("SELECT status, error FROM games WHERE game_id = ?", (DEMO_GAME_ID,)).fetchone()
        n_events = conn.execute("SELECT COUNT(*) c FROM events WHERE game_id = ?", (DEMO_GAME_ID,)).fetchone()["c"]
        n_high = conn.execute("SELECT COUNT(*) c FROM highlights WHERE game_id = ?", (DEMO_GAME_ID,)).fetchone()["c"]
    print(f"status={row['status']} events={n_events} highlights={n_high}")
    if row["status"] != "done":
        print(f"error: {row['error']}", file=sys.stderr)
        raise SystemExit(1)
    print(f"Demo game ready: GET /api/games/{DEMO_GAME_ID}")
    return DEMO_GAME_ID


if __name__ == "__main__":
    seed_demo(duration_s=45 if "--long" in sys.argv else 20)
