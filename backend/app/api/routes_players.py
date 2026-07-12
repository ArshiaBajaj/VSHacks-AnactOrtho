"""Roster CRUD (our tracked players) + share-link creation.

NOTE: these live under /api/roster, not /api/players — GET /api/players is
reserved for the NBA-data compat endpoints the frontend client expects
(see routes_compat.py and API_CONTRACT.md section 6).
"""
from __future__ import annotations

import json
import sqlite3
from typing import Any, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from app.api.common import ApiError, game_summary, player_row_to_dict
from app.db import get_conn
from app.models import PlayerIn
from app.util import new_id

router = APIRouter(tags=["roster"])


def fetch_player(conn: sqlite3.Connection, player_id: str) -> sqlite3.Row:
    row = conn.execute("SELECT * FROM players WHERE player_id = ?", (player_id,)).fetchone()
    if row is None:
        raise ApiError(404, "player_not_found", f"No player {player_id}")
    return row


def player_career(conn: sqlite3.Connection, player_id: str) -> dict[str, Any]:
    """Aggregate a player's stats across every processed game they appear in."""
    rows = conn.execute(
        "SELECT a.game_id, a.json FROM analytics a"
        " JOIN game_players gp ON gp.game_id = a.game_id"
        " WHERE gp.player_id = ?",
        (player_id,),
    ).fetchall()
    career: dict[str, Any] = {
        "games_played": 0,
        "points": 0,
        "shot_attempts": 0,
        "shots_made": 0,
        "max_vertical_jump_cm": None,
        "top_speed_ms": None,
        "distance_covered_m": 0.0,
        "avg_points_per_game": 0.0,
    }
    for row in rows:
        blob = json.loads(row["json"])
        me = next((p for p in blob.get("players", []) if p.get("player_id") == player_id), None)
        if me is None:
            continue
        career["games_played"] += 1
        career["points"] += me.get("points") or 0
        career["shot_attempts"] += me.get("shot_attempts") or 0
        career["shots_made"] += me.get("shots_made") or 0
        for key in ("max_vertical_jump_cm", "top_speed_ms"):
            v = me.get(key)
            if v is not None and (career[key] is None or v > career[key]):
                career[key] = v
        career["distance_covered_m"] += me.get("distance_covered_m") or 0.0
    if career["games_played"]:
        career["avg_points_per_game"] = round(career["points"] / career["games_played"], 2)
    career["fg_pct"] = (
        round(100 * career["shots_made"] / career["shot_attempts"], 1)
        if career["shot_attempts"]
        else None
    )
    return career


def player_games(conn: sqlite3.Connection, player_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        "SELECT g.* FROM games g JOIN game_players gp ON gp.game_id = g.game_id"
        " WHERE gp.player_id = ? ORDER BY g.created_at DESC",
        (player_id,),
    ).fetchall()
    return [game_summary(r) for r in rows]


class PlayerPatch(BaseModel):
    name: Optional[str] = None
    position: Optional[str] = None
    height_cm: Optional[float] = None
    jersey_hint: Optional[str] = None


@router.post("/roster", status_code=201)
def create_player(body: PlayerIn) -> dict[str, str]:
    player_id = new_id("p")
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO players (player_id, name, position, height_cm, jersey_hint)"
            " VALUES (?,?,?,?,?)",
            (player_id, body.name, body.position, body.height_cm, body.jersey_hint),
        )
    return {"player_id": player_id}


@router.get("/roster")
def list_players() -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute("SELECT * FROM players ORDER BY name").fetchall()
    return [player_row_to_dict(r) for r in rows]


@router.get("/roster/{player_id}")
def get_player(player_id: str) -> dict[str, Any]:
    with get_conn() as conn:
        row = fetch_player(conn, player_id)
        career = player_career(conn, player_id)
        games = player_games(conn, player_id)
    return {**player_row_to_dict(row), "career": career, "games": games}


@router.patch("/roster/{player_id}")
def patch_player(player_id: str, body: PlayerPatch) -> dict[str, Any]:
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    with get_conn() as conn:
        row = fetch_player(conn, player_id)
        if updates:
            sets = ", ".join(f"{k} = ?" for k in updates)
            conn.execute(
                f"UPDATE players SET {sets} WHERE player_id = ?",
                (*updates.values(), player_id),
            )
            row = fetch_player(conn, player_id)
    return player_row_to_dict(row)


@router.post("/roster/{player_id}/share", status_code=201)
def create_share(player_id: str) -> dict[str, str]:
    """Create a public scouting link for a player."""
    with get_conn() as conn:
        fetch_player(conn, player_id)
        token = new_id("s")
        conn.execute(
            "INSERT INTO shares (share_token, player_id) VALUES (?, ?)", (token, player_id)
        )
    return {"share_token": token, "share_url": f"/api/share/{token}"}
