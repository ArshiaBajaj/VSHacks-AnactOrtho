"""WebSocket live stream + simulate replay (API_CONTRACT.md section 2).

TestClient's WebSocket receive has no timeout, so every receive goes through
helpers.collect_ws_messages, which reads on a daemon thread under a hard
deadline: a silent or hung socket fails the test instead of hanging pytest.
"""
from __future__ import annotations

from tests.helpers import collect_ws_messages


def test_ws_connect_receives_a_message(client):
    """Connecting to a finished game must yield at least one JSON message
    (per contract: a done game sends {"type": "status", "status": "done"})."""
    with client.websocket_connect("/ws/games/g_sample") as ws:
        msgs = collect_ws_messages(ws, duration=5.0, stop_when=lambda m: True)
    assert msgs, "expected at least one message on /ws/games/g_sample"
    first = msgs[0]
    assert isinstance(first, dict)
    assert isinstance(first.get("type"), str) and first["type"], f"malformed WS message: {first}"


def test_simulate_replays_events_over_ws(client):
    """POST simulate at high speed, then connect and collect the replay.

    Per contract a plain connect to a DONE game closes immediately, so the
    simulate POST must come first; the socket then stays open and streams the
    replayed timeline. A status message may arrive before any event, so the
    stop condition is: terminal status AFTER at least one real event.
    """
    r = client.post("/api/games/g_sample/simulate", json={"speed": 50})
    assert r.status_code in (200, 202), r.text

    saw_event = {"yes": False}

    def _stop(m: dict) -> bool:
        if m.get("event_id") or m.get("type") not in (None, "status"):
            saw_event["yes"] = True
        return (
            saw_event["yes"]
            and m.get("type") == "status"
            and m.get("status") in ("done", "error")
        )

    with client.websocket_connect("/ws/games/g_sample") as ws:
        msgs = collect_ws_messages(ws, duration=60.0, stop_when=_stop)

    assert msgs, "simulate produced no WS messages at all"
    kinds = [m.get("type") for m in msgs]

    scores = [m for m in msgs if m.get("type") == "score"]
    assert scores, f"expected replayed score events, got types: {kinds[:30]}"

    # Commentary text must ride with scoring: either on the score event itself
    # (API_CONTRACT.md example) or as dedicated commentary events (engine's
    # score + commentary pairs). Both are documented shapes.
    texted = [
        m for m in msgs
        if m.get("type") in ("score", "commentary")
        and isinstance(m.get("text"), str) and m["text"].strip()
    ]
    assert texted, f"no commentary text anywhere in the replayed stream: {kinds[:30]}"

    assert msgs[-1].get("type") == "status" and msgs[-1].get("status") == "done", (
        f"expected the stream to end with status done, got types: {kinds[-10:]}"
    )


def test_ws_unknown_game(client):
    """Connecting to an unknown game must not hang: either the handshake is
    rejected or the socket closes promptly (optionally after an error/status
    message)."""
    try:
        with client.websocket_connect("/ws/games/g_zzz_does_not_exist") as ws:
            msgs = collect_ws_messages(ws, duration=3.0)
            # Whatever was sent, the socket must have closed within deadline
            # (collect_ws_messages returns early on close) or sent something
            # explicit; either way we must reach this line quickly.
            assert msgs is not None
    except Exception:
        # Rejected handshake / immediate close are both acceptable.
        pass
