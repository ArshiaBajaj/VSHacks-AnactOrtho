"""Public scouting-profile pages (no auth): GET /api/share/{token}."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from app.api.common import ApiError, highlight_row_to_dict, player_row_to_dict
from app.api.routes_players import player_career, player_games
from app.db import get_conn

router = APIRouter(tags=["share"])


@router.get("/share/{share_token}")
def get_share(share_token: str) -> dict[str, Any]:
    """Full public scouting profile: bio, career, game history, best highlights."""
    with get_conn() as conn:
        share = conn.execute(
            "SELECT * FROM shares WHERE share_token = ?", (share_token,)
        ).fetchone()
        if share is None:
            raise ApiError(404, "share_not_found", f"No share {share_token}")
        player_id = share["player_id"]
        player = conn.execute(
            "SELECT * FROM players WHERE player_id = ?", (player_id,)
        ).fetchone()
        if player is None:
            raise ApiError(404, "player_not_found", f"No player {player_id}")

        career = player_career(conn, player_id)
        games = player_games(conn, player_id)

        game_ids = [g["game_id"] for g in games]
        highlights: list[dict[str, Any]] = []
        if game_ids:
            marks = ",".join("?" for _ in game_ids)
            rows = conn.execute(
                f"SELECT * FROM highlights WHERE game_id IN ({marks})", game_ids
            ).fetchall()
            name = player["name"].lower()
            scored = []
            for r in rows:
                h = highlight_row_to_dict(r)
                relevance = 2 if name in (h["label"] or "").lower() else 1
                scored.append((relevance, h["t_end"] - h["t_start"], h))
            scored.sort(key=lambda s: (-s[0], -s[1]))
            highlights = [h for _, _, h in scored[:5]]

    return {
        "share_token": share_token,
        "player": player_row_to_dict(player),
        "career": career,
        "games": games,
        "highlights": highlights,
    }
