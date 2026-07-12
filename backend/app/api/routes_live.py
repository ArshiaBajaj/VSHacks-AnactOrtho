"""Live session ingest, player identity mapping, and local leaderboards.

Live sessions persist the web Live page's in-browser CV output so nothing is
lost on refresh and spectators can follow along:

- POST /api/live/sessions            create a session (frontend-shaped body)
- POST /api/live/sessions/{id}/events   append events; echoed to the EventBus
  under key "live:{session_id}" for WS /ws/live/{session_id} spectators
- POST /api/live/sessions/{id}/finish   mark finished AND convert the session
  into a regular completed game row (events translated to the contract
  EventType vocabulary, t ms -> seconds) so /api/games picks it up;
  optionally auto-publishes a compat scout card
- GET  /api/live/sessions[/{id}]     list / detail (+ recent events tail)

Event bodies tolerate the frontend shape produced by apps/web gameStore /
packages/core game-store: {id?, t (ms), kind, team? "A"|"B", playerId?/player?,
value?, text?, scoreA?, scoreB?}.

Also here (deliberately, for route-ordering reasons — see API_CONTRACT.md):
- POST /api/games/{game_id}/identify   remap CV track ids (p_{track_id}) to
  roster player ids so career aggregation picks the game up
- GET  /api/leaderboards               career leaderboards across done games
"""
from __future__ import annotations

import json
import sqlite3
import time
from typing import Any, Optional

from fastapi import APIRouter, Body
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.api.common import ApiError, fetch_game
from app.commentary.generator import generate_scouting_report
from app.db import get_conn
from app.engine.events import bus
from app.util import new_id

router = APIRouter(tags=["live"])

#: EventBus key prefix for live-session spectator streams (no collision with
#: game_id keys used by the processing/simulate stream).
LIVE_BUS_PREFIX = "live:"


def live_bus_key(session_id: str) -> str:
    return f"{LIVE_BUS_PREFIX}{session_id}"


# --- helpers -----------------------------------------------------------------


def session_not_found(session_id: str) -> ApiError:
    return ApiError(404, "session_not_found", f"No live session {session_id}")


def fetch_session(conn: sqlite3.Connection, session_id: str) -> sqlite3.Row:
    row = conn.execute(
        "SELECT * FROM live_sessions WHERE session_id = ?", (session_id,)
    ).fetchone()
    if row is None:
        raise session_not_found(session_id)
    return row


def session_to_dict(row: sqlite3.Row, event_count: Optional[int] = None) -> dict[str, Any]:
    d = {
        "session_id": row["session_id"],
        "title": row["title"],
        "sport": row["sport"],
        "team_a_name": row["team_a_name"],
        "team_b_name": row["team_b_name"],
        "status": row["status"],
        "started_at": row["created_at"],
        "finished_at": row["finished_at"],
        "duration_ms": row["duration_ms"],
        "game_id": row["game_id"],
        "players": json.loads(row["json_players"]) if row["json_players"] else [],
    }
    if event_count is not None:
        d["event_count"] = event_count
    return d


def load_session_events(
    conn: sqlite3.Connection, session_id: str, limit: Optional[int] = None
) -> list[dict[str, Any]]:
    """Stored events in seq order; with `limit`, the LAST `limit` of them."""
    if limit is None:
        rows = conn.execute(
            "SELECT json FROM live_events WHERE session_id = ? ORDER BY seq",
            (session_id,),
        ).fetchall()
        return [json.loads(r["json"]) for r in rows]
    rows = conn.execute(
        "SELECT json FROM live_events WHERE session_id = ? ORDER BY seq DESC LIMIT ?",
        (session_id, limit),
    ).fetchall()
    return [json.loads(r["json"]) for r in reversed(rows)]


def _num(v: Any) -> Optional[float]:
    """Tolerant numeric coercion (bools are not numbers)."""
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    return None


def _normalize_live_event(raw: dict[str, Any]) -> dict[str, Any]:
    """Coerce a frontend-shaped event into a stable stored form.

    Extra keys are preserved; id is generated when missing; t defaults to 0;
    team is normalized to "A"/"B" or dropped.
    """
    ev = dict(raw)
    if not ev.get("id"):
        ev["id"] = new_id("le")
    t = _num(ev.get("t"))
    ev["t"] = t if t is not None else 0.0
    ev["kind"] = str(ev.get("kind") or "commentary")
    team = ev.get("team")
    ev["team"] = team.upper() if isinstance(team, str) and team.upper() in ("A", "B") else None
    return ev


# --- session -> game conversion ----------------------------------------------

#: Frontend EventKind -> contract EventType, where a 1:1 mapping exists.
_KIND_TO_EVENT_TYPE = {
    "score": "score",
    "out_of_bounds": "out_of_bounds",
    "whistle": "whistle",
    "streak": "streak",
    "commentary": "commentary",
    "shot": "shot_attempt",
}


def _fallback_text(kind: str, ev: dict[str, Any]) -> str:
    value = _num(ev.get("value"))
    team = ev.get("team")
    suffix = f" (Team {team})" if team else ""
    if kind == "jump":
        return f"Vertical jump: {value:.0f} cm{suffix}" if value else f"Big jump{suffix}"
    if kind == "steal":
        return f"Steal{suffix}"
    if kind == "highlight":
        return f"Highlight play{suffix}"
    return f"{kind}{suffix}"


def _translate_events(events: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int, int]:
    """Frontend live events -> contract event rows (t seconds, EventType).

    Returns (rows, final_score_a, final_score_b). Rows are dicts without
    event_id/seq (assigned at insert time).
    """
    sa = sb = 0
    rows: list[dict[str, Any]] = []
    for ev in sorted(events, key=lambda e: _num(e.get("t")) or 0.0):
        kind = str(ev.get("kind") or "commentary")
        etype = _KIND_TO_EVENT_TYPE.get(kind)
        text = ev.get("text") if isinstance(ev.get("text"), str) else None
        if etype is None:
            # jump / steal / highlight / unknown -> commentary, text preserved
            etype = "commentary"
            if not text:
                text = _fallback_text(kind, ev)
        team = ev["team"].lower() if isinstance(ev.get("team"), str) else None
        value = _num(ev.get("value"))
        score_a_in, score_b_in = _num(ev.get("scoreA")), _num(ev.get("scoreB"))
        points: Optional[int] = None
        if etype == "score":
            points = int(value) if value else 1
            if score_a_in is not None and score_b_in is not None:
                sa, sb = int(score_a_in), int(score_b_in)
            elif team == "a":
                sa += points
            elif team == "b":
                sb += points
        else:
            if score_a_in is not None and score_b_in is not None:
                sa, sb = int(score_a_in), int(score_b_in)
            if etype == "streak" and value:
                points = int(value)
        with_score = etype in ("score", "streak") or (
            score_a_in is not None and score_b_in is not None
        )
        player = ev.get("playerId") or ev.get("player")
        rows.append(
            {
                "t": round((_num(ev.get("t")) or 0.0) / 1000.0, 3),
                "type": etype,
                "team": team,
                "player_id": str(player) if player else None,
                "points": points,
                "score_a": sa if with_score else None,
                "score_b": sb if with_score else None,
                "text": text,
                "audio_url": None,
            }
        )
    return rows, sa, sb


def _stats_players(stats: Optional[dict[str, Any]]) -> list[dict[str, Any]]:
    """Pull a per-player list out of a freely-shaped stats blob."""
    if not isinstance(stats, dict):
        return []
    for key in ("players", "perPlayer", "per_player"):
        lst = stats.get(key)
        if isinstance(lst, list):
            return [p for p in lst if isinstance(p, dict)]
    return []


def _analytics_player(p: dict[str, Any]) -> dict[str, Any]:
    """Frontend PlayerProfile (camelCase) -> contract PlayerAnalytics dict."""
    pid = str(p.get("id") or p.get("player_id") or p.get("playerId") or new_id("p"))
    return {
        "player_id": pid,
        "name": str(p.get("name") or pid),
        "points": int(_num(p.get("points")) or _num(p.get("pts")) or 0),
        "shot_attempts": int(_num(p.get("shots")) or _num(p.get("shot_attempts")) or 0),
        "shots_made": int(_num(p.get("makes")) or _num(p.get("shots_made")) or 0),
        "max_vertical_jump_cm": _num(p.get("bestJumpCm")) or _num(p.get("max_vertical_jump_cm")),
        "avg_shot_release_velocity_ms": _num(p.get("topReleaseMps"))
        or _num(p.get("avg_shot_release_velocity_ms")),
        "top_speed_ms": _num(p.get("topSpeedMps")) or _num(p.get("top_speed_ms")),
        "distance_covered_m": _num(p.get("distanceM")) or _num(p.get("distance_covered_m")),
        "heatmap": {"grid_w": 30, "grid_h": 17, "cells": []},
    }


def _create_game_from_session(
    conn: sqlite3.Connection,
    session: sqlite3.Row,
    events: list[dict[str, Any]],
    duration_ms: Optional[float],
    stats: Optional[dict[str, Any]],
) -> tuple[str, int, int]:
    """Persist a finished live session as a regular done game. Returns
    (game_id, score_a, score_b)."""
    game_id = new_id("g")
    rows, sa, sb = _translate_events(events)
    last_t = rows[-1]["t"] if rows else 0.0
    duration_s = (
        round(duration_ms / 1000.0, 3) if duration_ms else round(last_t + 3.0, 3) if rows else 0.0
    )
    title = session["title"] or f"Live session {session['session_id']}"

    conn.execute(
        "INSERT INTO games (game_id, title, status, progress, duration_s, score_a,"
        " score_b, target_score, scoring, video_path) VALUES (?,?,?,?,?,?,?,?,?,?)",
        (game_id, title, "done", 1.0, duration_s, sa, sb, 21, "1s_and_2s", None),
    )

    # bracket the translated timeline with game_start / game_end markers
    full_rows = (
        [{"t": 0.0, "type": "game_start", "team": None, "player_id": None, "points": None,
          "score_a": 0, "score_b": 0, "text": None, "audio_url": None}]
        + rows
        + [{"t": max(duration_s, last_t), "type": "game_end", "team": None, "player_id": None,
            "points": None, "score_a": sa, "score_b": sb, "text": None, "audio_url": None}]
    )
    for seq, row in enumerate(full_rows, start=1):
        conn.execute(
            "INSERT INTO events (event_id, game_id, seq, t, type, team, player_id,"
            " points, score_a, score_b, text, audio_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                f"e_{seq:04d}",
                game_id,
                seq,
                row["t"],
                row["type"],
                row["team"],
                row["player_id"],
                row["points"],
                row["score_a"],
                row["score_b"],
                row["text"],
                row["audio_url"],
            ),
        )

    # analytics blob: team totals from the timeline, players from stats (if any)
    team_stats: dict[str, dict[str, int]] = {}
    for key, tk in (("team_a", "a"), ("team_b", "b")):
        made = sum(1 for r in rows if r["type"] == "score" and r["team"] == tk)
        attempts = made + sum(1 for r in rows if r["type"] == "shot_attempt" and r["team"] == tk)
        team_stats[key] = {
            "points": sa if tk == "a" else sb,
            "fg_attempts": attempts,
            "fg_made": made,
        }
    analytics = {
        "game_id": game_id,
        "team_stats": team_stats,
        "players": [_analytics_player(p) for p in _stats_players(stats)],
        "ball_heatmap": {"grid_w": 30, "grid_h": 17, "cells": []},
    }
    conn.execute(
        "INSERT OR REPLACE INTO analytics (game_id, json) VALUES (?, ?)",
        (game_id, json.dumps(analytics)),
    )
    return game_id, sa, sb


async def _publish_scout_card(
    session: sqlite3.Row,
    events: list[dict[str, Any]],
    stats: Optional[dict[str, Any]],
    player_name: str,
    game_id: str,
    sa: int,
    sb: int,
    duration_ms: Optional[float],
) -> str:
    """Auto-create a compat scout card for one player of a finished session.

    Mirrors POST /api/scout/profiles (routes_compat): same card shape, same
    scout_cards save path, report generated via generate_scouting_report.
    """
    from app.api.routes_compat import _short_id

    mine = next(
        (
            p
            for p in _stats_players(stats)
            if str(p.get("name", "")).strip().lower() == player_name.strip().lower()
        ),
        None,
    )
    player: dict[str, Any] = {"name": player_name}
    if mine:
        player.update(mine)
        player["name"] = player_name
    card: dict[str, Any] = {
        "player": player,
        "sport": session["sport"],
        "duration": duration_ms or session["duration_ms"] or 0,
        "events": events,
        "score": {"teamA": sa, "teamB": sb},
        "source": "live_session",
        "sessionId": session["session_id"],
        "gameId": game_id,
    }
    report = await generate_scouting_report(card)
    card["report"] = report["text"]
    card["reportSource"] = report["source"]
    card["id"] = _short_id()
    card["createdAt"] = int(time.time() * 1000)
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO scout_cards (id, created_at, json) VALUES (?, ?, ?)",
            (card["id"], card["createdAt"], json.dumps(card)),
        )
    return card["id"]


# --- live session endpoints ---------------------------------------------------


class LiveSessionCreate(BaseModel):
    title: Optional[str] = None
    sport: Optional[str] = "basketball"
    teamAName: Optional[str] = None
    teamBName: Optional[str] = None
    players: list[dict[str, Any]] = Field(default_factory=list)


@router.post("/live/sessions", status_code=201)
def create_live_session(body: Optional[LiveSessionCreate] = None) -> JSONResponse:
    """Start a persisted live session for the in-browser CV Live page."""
    body = body or LiveSessionCreate()
    session_id = new_id("ls")
    players = [
        {"name": str(p["name"]), "team": p.get("team")}
        for p in body.players
        if isinstance(p, dict) and p.get("name")
    ]
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO live_sessions (session_id, title, sport, team_a_name,"
            " team_b_name, status, json_players) VALUES (?,?,?,?,?,'live',?)",
            (
                session_id,
                body.title,
                body.sport or "basketball",
                body.teamAName,
                body.teamBName,
                json.dumps(players) if players else None,
            ),
        )
        row = conn.execute(
            "SELECT created_at FROM live_sessions WHERE session_id = ?", (session_id,)
        ).fetchone()
    return JSONResponse(
        status_code=201,
        content={"session_id": session_id, "started_at": row["created_at"]},
    )


@router.post("/live/sessions/{session_id}/events")
def append_live_events(session_id: str, body: Any = Body(None)) -> dict[str, Any]:
    """Append frontend-shaped events; each is echoed to WS spectators."""
    if not isinstance(body, dict) or not isinstance(body.get("events"), list):
        raise ApiError(422, "invalid_events", 'Body must be {"events": [{...}, ...]}')
    if not all(isinstance(e, dict) for e in body["events"]):
        raise ApiError(422, "invalid_events", "Every event must be a JSON object")
    normalized = [_normalize_live_event(e) for e in body["events"]]

    with get_conn() as conn:
        session = fetch_session(conn, session_id)
        if session["status"] != "live":
            raise ApiError(409, "session_finished", f"Live session {session_id} is finished")
        base = conn.execute(
            "SELECT COALESCE(MAX(seq), 0) AS n FROM live_events WHERE session_id = ?",
            (session_id,),
        ).fetchone()["n"]
        for i, ev in enumerate(normalized, start=1):
            conn.execute(
                "INSERT INTO live_events (session_id, seq, json) VALUES (?, ?, ?)",
                (session_id, base + i, json.dumps(ev)),
            )
        total = base + len(normalized)

    key = live_bus_key(session_id)
    for ev in normalized:
        bus.publish(key, ev)
    return {"accepted": len(normalized), "total": total}


class FinishBody(BaseModel):
    durationMs: Optional[float] = None
    stats: Optional[dict[str, Any]] = None
    publishScoutCard: Optional[dict[str, Any]] = None


@router.post("/live/sessions/{session_id}/finish")
async def finish_live_session(
    session_id: str, body: Optional[FinishBody] = None
) -> dict[str, Any]:
    """Finish a session and convert it into a regular completed game row."""
    body = body or FinishBody()
    with get_conn() as conn:
        session = fetch_session(conn, session_id)
        if session["status"] != "live":
            raise ApiError(409, "session_finished", f"Live session {session_id} is finished")
        events = load_session_events(conn, session_id)
        game_id, sa, sb = _create_game_from_session(
            conn, session, events, body.durationMs, body.stats
        )
        conn.execute(
            "UPDATE live_sessions SET status = 'finished',"
            " finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),"
            " duration_ms = ?, json_stats = ?, game_id = ? WHERE session_id = ?",
            (
                body.durationMs,
                json.dumps(body.stats) if body.stats is not None else None,
                game_id,
                session_id,
            ),
        )

    response: dict[str, Any] = {"game_id": game_id}
    spec = body.publishScoutCard
    if isinstance(spec, dict) and spec.get("playerName"):
        response["scout_card_id"] = await _publish_scout_card(
            session, events, body.stats, str(spec["playerName"]), game_id, sa, sb, body.durationMs
        )

    key = live_bus_key(session_id)
    bus.publish(key, {"type": "status", "status": "finished", "game_id": game_id})
    bus.close(key)
    return response


@router.get("/live/sessions")
def list_live_sessions() -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM live_sessions ORDER BY created_at DESC"
        ).fetchall()
        counts = {
            r["session_id"]: r["n"]
            for r in conn.execute(
                "SELECT session_id, COUNT(*) AS n FROM live_events GROUP BY session_id"
            ).fetchall()
        }
    return [session_to_dict(r, counts.get(r["session_id"], 0)) for r in rows]


@router.get("/live/sessions/{session_id}")
def get_live_session(session_id: str, limit: int = 50) -> dict[str, Any]:
    """Session detail + the last `limit` stored events (in order)."""
    limit = min(500, max(1, limit))
    with get_conn() as conn:
        row = fetch_session(conn, session_id)
        total = conn.execute(
            "SELECT COUNT(*) AS n FROM live_events WHERE session_id = ?", (session_id,)
        ).fetchone()["n"]
        tail = load_session_events(conn, session_id, limit=limit)
    d = session_to_dict(row, total)
    d["events"] = tail
    return d


# --- identity mapping ----------------------------------------------------------


class IdentifyBody(BaseModel):
    mapping: dict[str, str]


@router.post("/games/{game_id}/identify")
def identify_players(game_id: str, body: IdentifyBody) -> dict[str, Any]:
    """Remap CV track ids (p_{track_id}) to roster player ids for one game.

    Rewrites events.player_id and the analytics blob's players[].player_id
    (name pulled from the roster), and links the roster players to the game
    so career aggregation / the share page pick it up.
    """
    if not body.mapping:
        raise ApiError(422, "invalid_mapping", "mapping must contain at least one entry")
    with get_conn() as conn:
        fetch_game(conn, game_id)
        roster_names: dict[str, str] = {}
        for target_id in body.mapping.values():
            r = conn.execute(
                "SELECT name FROM players WHERE player_id = ?", (target_id,)
            ).fetchone()
            if r is None:
                raise ApiError(
                    404, "roster_player_not_found", f"No roster player {target_id}"
                )
            roster_names[target_id] = r["name"]

        events_updated = 0
        for old_id, new_pid in body.mapping.items():
            cur = conn.execute(
                "UPDATE events SET player_id = ? WHERE game_id = ? AND player_id = ?",
                (new_pid, game_id, old_id),
            )
            events_updated += cur.rowcount

        analytics_updated = False
        arow = conn.execute(
            "SELECT json FROM analytics WHERE game_id = ?", (game_id,)
        ).fetchone()
        if arow is not None:
            blob = json.loads(arow["json"])
            changed = False
            for p in blob.get("players", []):
                new_pid = body.mapping.get(p.get("player_id"))
                if new_pid:
                    p["player_id"] = new_pid
                    p["name"] = roster_names[new_pid]
                    changed = True
            if changed:
                conn.execute(
                    "UPDATE analytics SET json = ? WHERE game_id = ?",
                    (json.dumps(blob), game_id),
                )
                analytics_updated = True

        for new_pid in body.mapping.values():
            conn.execute(
                "INSERT OR IGNORE INTO game_players (game_id, player_id) VALUES (?, ?)",
                (game_id, new_pid),
            )
    return {"events_updated": events_updated, "analytics_updated": analytics_updated}


# --- leaderboards ---------------------------------------------------------------

#: category -> (PlayerAnalytics field, aggregation) — career totals for
#: points/distance, single-game bests for vertical/speed.
_LEADERBOARD_CATEGORIES: dict[str, tuple[str, str]] = {
    "points": ("points", "sum"),
    "vertical": ("max_vertical_jump_cm", "max"),
    "speed": ("top_speed_ms", "max"),
    "distance": ("distance_covered_m", "sum"),
}


@router.get("/leaderboards")
def get_leaderboards(category: str = "points", limit: int = 10) -> dict[str, Any]:
    """Career leaderboards across every done game's analytics blob."""
    if category not in _LEADERBOARD_CATEGORIES:
        category = "points"  # deliberate fallback, mirrors /api/leaders
    field, agg = _LEADERBOARD_CATEGORIES[category]
    limit = min(50, max(1, limit))

    with get_conn() as conn:
        blobs = conn.execute(
            "SELECT a.json FROM analytics a JOIN games g ON g.game_id = a.game_id"
            " WHERE g.status = 'done'"
        ).fetchall()
        roster = {
            r["player_id"]: r["name"]
            for r in conn.execute("SELECT player_id, name FROM players").fetchall()
        }

    acc: dict[str, dict[str, Any]] = {}
    for row in blobs:
        for p in json.loads(row["json"]).get("players", []):
            pid = p.get("player_id")
            if not pid:
                continue
            entry = acc.setdefault(
                pid,
                {
                    "player_id": pid,
                    "name": roster.get(pid) or p.get("name") or pid,
                    "value": None,
                    "games": 0,
                },
            )
            entry["games"] += 1
            if pid in roster:
                entry["name"] = roster[pid]
            v = _num(p.get(field))
            if v is None:
                continue
            if agg == "sum":
                entry["value"] = (entry["value"] or 0.0) + v
            elif entry["value"] is None or v > entry["value"]:
                entry["value"] = v

    leaders = [e for e in acc.values() if e["value"] is not None]
    leaders.sort(key=lambda e: e["value"], reverse=True)
    for e in leaders:
        e["value"] = round(e["value"], 2)
    return {"category": category, "leaders": leaders[:limit]}
