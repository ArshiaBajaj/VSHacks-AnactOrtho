"""Shared API plumbing: contract error shape, row serializers, fetch helpers."""
from __future__ import annotations

import sqlite3
from typing import Any, Optional

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class ApiError(Exception):
    """Raised by contract endpoints; rendered as {"error": {code, message}}."""

    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(_request: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "message": exc.message}},
        )


def game_not_found(game_id: str) -> ApiError:
    return ApiError(404, "game_not_found", f"No game {game_id}")


def fetch_game(conn: sqlite3.Connection, game_id: str) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM games WHERE game_id = ?", (game_id,)).fetchone()
    if row is None:
        raise game_not_found(game_id)
    return row


def final_score(row: sqlite3.Row) -> Optional[dict[str, int]]:
    if row["score_a"] is None or row["score_b"] is None:
        return None
    return {"team_a": row["score_a"], "team_b": row["score_b"]}


def game_summary(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "game_id": row["game_id"],
        "title": row["title"],
        "status": row["status"],
        "created_at": row["created_at"],
        "duration_s": row["duration_s"],
        "final_score": final_score(row),
    }


def game_detail(row: sqlite3.Row, players: list[dict[str, Any]]) -> dict[str, Any]:
    d = game_summary(row)
    d.update(
        {
            "progress": row["progress"],
            "error": row["error"],
            "target_score": row["target_score"],
            "scoring": row["scoring"],
            "players": players,
        }
    )
    return d


def event_row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    score_after = None
    if row["score_a"] is not None and row["score_b"] is not None:
        score_after = {"team_a": row["score_a"], "team_b": row["score_b"]}
    return {
        "event_id": row["event_id"],
        "t": row["t"],
        "type": row["type"],
        "team": row["team"],
        "player_id": row["player_id"],
        "points": row["points"],
        "score_after": score_after,
        "text": row["text"],
        "audio_url": row["audio_url"],
    }


def player_row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "player_id": row["player_id"],
        "name": row["name"],
        "position": row["position"],
        "height_cm": row["height_cm"],
        "jersey_hint": row["jersey_hint"],
    }


def highlight_row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "highlight_id": row["highlight_id"],
        "t_start": row["t_start"],
        "t_end": row["t_end"],
        "label": row["label"],
        "video_url": row["video_url"],
        "thumb_url": row["thumb_url"],
    }
