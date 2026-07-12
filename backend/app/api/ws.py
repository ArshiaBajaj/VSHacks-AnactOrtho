"""WebSocket live event stream + demo simulate replays.

WS /ws/games/{game_id}:
- on connect, sends {"type": "status", ...} with the current game state
- while queued/processing: replays already-stored events (catch-up), then
  streams new events from the EventBus as the processor emits them
- if the game is already done and no simulation is active: replays all stored
  events instantly, sends {"type": "status", "status": "done"} and closes
- if a simulation is running (POST /api/games/{id}/simulate), the socket stays
  open and receives the replayed events with real-time pacing

POST simulate lives in routes_games but calls into `start_simulation` here so
the "is a simulation active" state is shared with the socket handler.
"""
from __future__ import annotations

import asyncio
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.api.common import event_row_to_dict
from app.db import get_conn
from app.engine.events import CLOSE, bus

router = APIRouter(tags=["live"])

#: game_ids with an active simulate replay (read by the WS handler).
SIMULATING: set[str] = set()

_MAX_GAP_S = 10.0  # cap the wall-clock wait between two replayed events


def _load_game(game_id: str) -> dict[str, Any] | None:
    with get_conn() as conn:
        row = conn.execute("SELECT * FROM games WHERE game_id = ?", (game_id,)).fetchone()
        return dict(row) if row else None


def _load_events(game_id: str) -> list[dict[str, Any]]:
    with get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM events WHERE game_id = ? ORDER BY seq", (game_id,)
        ).fetchall()
    return [event_row_to_dict(r) for r in rows]


async def _simulate(game_id: str, speed: float) -> None:
    """Republish a finished game's stored events over the bus, time-scaled."""
    try:
        # grace period: callers POST /simulate first, then open the socket
        await asyncio.sleep(1.5)
        events = _load_events(game_id)
        bus.publish(game_id, {"type": "status", "status": "processing", "progress": 0.0, "simulated": True})
        prev_t = events[0]["t"] if events else 0.0
        total = events[-1]["t"] if events else 1.0
        for ev in events:
            delay = max(0.0, (ev["t"] - prev_t) / max(speed, 0.01))
            prev_t = ev["t"]
            if delay:
                await asyncio.sleep(min(delay, _MAX_GAP_S))
            bus.publish(game_id, ev)
            if ev["type"] in ("score", "game_end"):
                bus.publish(
                    game_id,
                    {
                        "type": "status",
                        "status": "processing",
                        "progress": round(min(1.0, ev["t"] / max(total, 0.001)), 3),
                        "simulated": True,
                    },
                )
    finally:
        SIMULATING.discard(game_id)
        bus.publish(game_id, {"type": "status", "status": "done", "simulated": True})
        bus.close(game_id)


def start_simulation(game_id: str, speed: float) -> bool:
    """Kick off a replay task. Returns False if one is already running."""
    if game_id in SIMULATING:
        return False
    SIMULATING.add(game_id)
    asyncio.get_running_loop().create_task(_simulate(game_id, speed))
    return True


def _load_live_session(session_id: str) -> dict[str, Any] | None:
    with get_conn() as conn:
        row = conn.execute(
            "SELECT * FROM live_sessions WHERE session_id = ?", (session_id,)
        ).fetchone()
        return dict(row) if row else None


@router.websocket("/ws/live/{session_id}")
async def live_session_socket(ws: WebSocket, session_id: str) -> None:
    """Spectator stream for an in-browser CV live session.

    On connect: one status frame, then a replay of the last 20 stored events,
    then live events from the EventBus (key "live:{session_id}") until the
    session finishes. Finished sessions get the tail replay and close.
    """
    from app.api.routes_live import live_bus_key, load_session_events

    await ws.accept()
    session = _load_live_session(session_id)
    if session is None:
        await ws.send_json(
            {"type": "status", "status": "error", "error": f"No live session {session_id}"}
        )
        await ws.close()
        return

    def _tail() -> list[dict[str, Any]]:
        with get_conn() as conn:
            return load_session_events(conn, session_id, limit=20)

    try:
        if session["status"] != "live":
            await ws.send_json({"type": "status", "status": "finished", "game_id": session["game_id"]})
            for ev in _tail():
                await ws.send_json(ev)
            await ws.send_json({"type": "status", "status": "finished", "game_id": session["game_id"]})
            await ws.close()
            return

        key = live_bus_key(session_id)
        q = bus.subscribe(key)
        seen: set[str] = set()
        try:
            await ws.send_json({"type": "status", "status": "live"})
            for ev in _tail():
                if ev.get("id"):
                    seen.add(ev["id"])
                await ws.send_json(ev)
            while True:
                item = await q.get()
                if item is CLOSE:
                    await ws.send_json({"type": "status", "status": "finished"})
                    break
                if isinstance(item, dict) and item.get("id") in seen:
                    continue
                await ws.send_json(item)
                if (
                    isinstance(item, dict)
                    and item.get("type") == "status"
                    and item.get("status") in ("finished", "error")
                ):
                    break
        finally:
            bus.unsubscribe(key, q)
        await ws.close()
    except (WebSocketDisconnect, RuntimeError):
        pass


@router.websocket("/ws/games/{game_id}")
async def game_socket(ws: WebSocket, game_id: str) -> None:
    await ws.accept()
    game = _load_game(game_id)
    if game is None:
        await ws.send_json(
            {"type": "status", "status": "error", "error": f"No game {game_id}"}
        )
        await ws.close()
        return

    status = game["status"]
    try:
        if status in ("done", "error") and game_id not in SIMULATING:
            # Finished game: instant replay of the stored timeline, then close.
            await ws.send_json(
                {"type": "status", "status": status, "progress": game["progress"]}
            )
            for ev in _load_events(game_id):
                await ws.send_json(ev)
            await ws.send_json({"type": "status", "status": status})
            await ws.close()
            return

        q = bus.subscribe(game_id)
        seen: set[str] = set()
        try:
            await ws.send_json(
                {"type": "status", "status": status, "progress": game["progress"]}
            )
            if status in ("queued", "processing"):
                # catch up on anything persisted before we subscribed
                for ev in _load_events(game_id):
                    seen.add(ev["event_id"])
                    await ws.send_json(ev)
            while True:
                item = await q.get()
                if item is CLOSE:
                    await ws.send_json({"type": "status", "status": "done"})
                    break
                if isinstance(item, dict) and item.get("event_id") in seen:
                    continue
                await ws.send_json(item)
                if (
                    isinstance(item, dict)
                    and item.get("type") == "status"
                    and item.get("status") in ("done", "error")
                ):
                    break
        finally:
            bus.unsubscribe(game_id, q)
        await ws.close()
    except (WebSocketDisconnect, RuntimeError):
        pass
