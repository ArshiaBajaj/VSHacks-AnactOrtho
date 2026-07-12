"""Compatibility endpoints mirroring apps/server (the teammate Express stub).

JSON shapes are EXACTLY the stub's (camelCase, same wrapper objects, string
error payloads like {"error": "film_not_found"}) so the real frontend client
(apps/web/src/lib/api.ts) works against this server unchanged.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import secrets
import time
from typing import Any, Optional

from fastapi import APIRouter, Body
from fastapi.responses import JSONResponse

from app import config
from app.api import compat_data
from app.commentary.generator import (
    CommentaryRequest,
    generate_commentary,
    generate_scouting_report,
)
from app.commentary.film_coach import (
    answer_film_question,
    as_film_context,
    generate_chapters,
    generate_coach_line,
    generate_moment,
    generate_quiz,
    generate_recap,
)
from app.db import get_conn

router = APIRouter(tags=["compat"])

_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz"


def _short_id() -> str:
    """Random base36 id, same flavor as the stub's shortId()."""
    return "".join(secrets.choice(_ALPHABET) for _ in range(10))


# --- Real NBA data ---------------------------------------------------------


@router.get("/teams")
def get_teams() -> dict[str, Any]:
    return {"teams": compat_data.TEAMS}


@router.get("/players")
def get_players(search: str = "", team: str = "") -> dict[str, Any]:
    q = search.lower().strip()
    team = team.upper().strip()
    out = compat_data.PLAYERS
    if team:
        out = [p for p in out if p["team"] == team]
    if q:
        out = [p for p in out if q in p["name"].lower() or q in p["team"].lower()]
    return {"season": "2023-24", "count": len(out), "players": out}


@router.get("/players/{player_id}")
def get_player(player_id: str):
    p = compat_data.player_by_id(player_id)
    if p is None:
        return JSONResponse(status_code=404, content={"error": "player_not_found"})
    return {"player": p}


@router.get("/leaders")
def get_leaders(category: str = "ppg", limit: int = 10) -> dict[str, Any]:
    cat = category if category in compat_data.LEADER_CATEGORIES else "ppg"
    limit = min(24, max(1, limit))
    return {"category": cat, "leaders": compat_data.leaders(cat, limit)}


# --- Film room --------------------------------------------------------------


@router.get("/films")
def get_films() -> dict[str, Any]:
    return {"films": compat_data.list_films()}


@router.get("/films/{film_id}")
def get_film(film_id: str):
    film = compat_data.film_detail(film_id)
    if film is None:
        return JSONResponse(status_code=404, content={"error": "film_not_found"})
    return {"film": film}


# --- Commentary + scouting AI ------------------------------------------------


async def _adhoc_tts(text: str) -> Optional[str]:
    """Synthesize `text` to a content-addressed wav under media/audio/adhoc/.

    Repeated lines hit the cache (hash of the text). Returns the /media URL,
    or None when TTS is unavailable or synthesis fails.
    """
    if not text or not config.tts_available():
        return None
    from app.commentary.tts import synth_wav

    digest = hashlib.sha1(text.encode("utf-8")).hexdigest()[:16]
    out_path = config.MEDIA_DIR / "audio" / "adhoc" / f"{digest}.wav"
    url = f"/media/audio/adhoc/{digest}.wav"
    if out_path.exists() and out_path.stat().st_size > 0:
        return url
    ok = await asyncio.to_thread(synth_wav, text, out_path)
    return url if ok else None


@router.post("/commentary")
async def post_commentary(body: Any = Body(None)):
    if not isinstance(body, dict) or not isinstance(body.get("event"), str):
        return JSONResponse(status_code=400, content={"error": "event_required"})
    req = CommentaryRequest(
        event=body["event"],
        team=body.get("team"),
        teamName=body.get("teamName"),
        value=body.get("value"),
        scoreA=body.get("scoreA"),
        scoreB=body.get("scoreB"),
        style=body.get("style"),
    )
    result = await generate_commentary(req)
    if body.get("tts"):
        result = dict(result)
        result["audio_url"] = await _adhoc_tts(result.get("text") or "")
    return result


def _valid_card(body: Any) -> bool:
    return (
        isinstance(body, dict)
        and isinstance(body.get("player"), dict)
        and isinstance(body["player"].get("name"), str)
    )


@router.post("/ai/scouting-report")
async def post_scouting_report(body: Any = Body(None)):
    if not _valid_card(body):
        return JSONResponse(status_code=400, content={"error": "player_required"})
    result = await generate_scouting_report(body)
    if body.get("tts"):
        result = dict(result)
        result["audio_url"] = await _adhoc_tts(result.get("text") or "")
    return result


@router.post("/ai/film")
async def post_film_ai(body: Any = Body(None)):
    """Film Room coach: line | ask | moment | quiz | chapters | recap."""
    if not isinstance(body, dict):
        return JSONResponse(status_code=400, content={"error": "film_context_required"})
    film = as_film_context(body)
    if film is None:
        return JSONResponse(status_code=400, content={"error": "film_context_required"})
    action = str(body.get("action") or "")
    try:
        if action == "line":
            return await generate_coach_line(film)
        if action == "ask":
            return await answer_film_question(film, str(body.get("question") or ""))
        if action == "moment":
            return await generate_moment(film)
        if action == "quiz":
            return await generate_quiz(film)
        if action == "chapters":
            timeline = body.get("timeline") if isinstance(body.get("timeline"), list) else []
            return await generate_chapters(film, timeline)
        if action == "recap":
            return await generate_recap(film)
        return JSONResponse(
            status_code=400,
            content={
                "error": "invalid_action",
                "hint": "line | ask | moment | quiz | chapters | recap",
            },
        )
    except Exception:
        return JSONResponse(status_code=500, content={"error": "film_ai_failed"})


# --- Scout-card persistence + sharing ----------------------------------------


@router.post("/scout/profiles")
async def publish_scout_card(body: Any = Body(None)):
    if not _valid_card(body):
        return JSONResponse(status_code=400, content={"error": "invalid_card"})
    card: dict[str, Any] = dict(body)
    if not card.get("report"):
        report = await generate_scouting_report({**card, "id": "tmp", "createdAt": int(time.time() * 1000)})
        card["report"] = report["text"]
        card["reportSource"] = report["source"]
    card["id"] = _short_id()
    card["createdAt"] = int(time.time() * 1000)
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO scout_cards (id, created_at, json) VALUES (?, ?, ?)",
            (card["id"], card["createdAt"], json.dumps(card)),
        )
    return JSONResponse(status_code=201, content={"card": card})


@router.get("/scout/profiles")
def list_scout_cards() -> dict[str, Any]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT json FROM scout_cards ORDER BY created_at DESC"
        ).fetchall()
    cards = [json.loads(r["json"]) for r in rows]
    return {"count": len(cards), "cards": cards}


@router.get("/scout/profiles/{card_id}")
def get_scout_card(card_id: str):
    with get_conn() as conn:
        row = conn.execute("SELECT json FROM scout_cards WHERE id = ?", (card_id,)).fetchone()
    if row is None:
        return JSONResponse(status_code=404, content={"error": "card_not_found"})
    return {"card": json.loads(row["json"])}
