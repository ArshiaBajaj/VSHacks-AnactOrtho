"""Live sessions (routes_live.py): create -> ingest frontend-shaped ms events
-> finish/convert to a done game (t in SECONDS) -> identify remap -> leaderboards,
plus the /ws/live/{session_id} stream.

All app imports happen lazily via the conftest `client` fixture so collection
stays clean while the coder agents land the feature. A missing feature is a
test FAILURE (the bug-fixer wave runs after), never a skip.

WS receives always go through helpers.collect_ws_messages (daemon reader
thread + hard deadline) so a silent socket fails instead of hanging pytest.
"""
from __future__ import annotations

import json
import threading
import time

from tests import helpers as H
from tests.helpers import error_code

FINISH_OK = (200, 201)


def _batch() -> list[dict]:
    """Three frontend-shaped events; t is MILLISECONDS. The 34200 ms score is
    the ms->seconds conversion probe (must become t=34.2 after finish)."""
    return [
        H.live_event(kind="score", t_ms=15000, team="A", value=2, score_a=2,
                     score_b=0, text="opening bucket", player_id="guest_1"),
        H.live_event(kind="jump", t_ms=21000, team="B", value=48,
                     score_a=2, score_b=0),
        H.live_event(kind="score", t_ms=34200, team="B", value=1, score_a=2,
                     score_b=1, text="answer back", player_id="guest_2"),
    ]


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------

def test_create_session_contract(client):
    r = client.post(
        "/api/live/sessions",
        json={"title": "Test run", "teamAName": "Red", "teamBName": "Blue"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    sid = body.get("session_id")
    assert isinstance(sid, str) and sid.startswith("ls_"), (
        f"session_id must start with 'ls_': {body}"
    )
    assert body.get("started_at"), f"created session must carry started_at: {body}"


# ---------------------------------------------------------------------------
# Event ingest
# ---------------------------------------------------------------------------

def test_post_events_accepted_and_total(client):
    sid, _ = H.create_live_session(client)

    r1 = H.post_live_events(client, sid, _batch())
    assert r1.status_code == 200, r1.text
    b1 = r1.json()
    assert b1["accepted"] == 3
    assert isinstance(b1["total"], int) and b1["total"] >= 3

    r2 = H.post_live_events(client, sid, [
        H.live_event(kind="whistle", t_ms=40000, team="A"),
        H.live_event(kind="steal", t_ms=45000, team="B", value=1),
    ])
    assert r2.status_code == 200, r2.text
    b2 = r2.json()
    assert b2["accepted"] == 2
    # "total" may be batch-size or the cumulative session count; both are
    # coherent readings of {"accepted": n, "total": m}. Anything else is a bug.
    assert b2["total"] in (2, 5), f"total must be batch (2) or cumulative (5): {b2}"


def test_post_events_all_frontend_kinds_accepted(client):
    sid, _ = H.create_live_session(client)
    events = [
        H.live_event(kind=kind, t_ms=1000 * (i + 1), team="A" if i % 2 == 0 else "B",
                     value=2, score_a=i, score_b=0, text=f"{kind} probe")
        for i, kind in enumerate(H.LIVE_EVENT_KINDS)
    ]
    r = H.post_live_events(client, sid, events)
    assert r.status_code == 200, r.text
    assert r.json()["accepted"] == len(H.LIVE_EVENT_KINDS), (
        f"every documented kind {H.LIVE_EVENT_KINDS} must be accepted: {r.json()}"
    )


def test_post_events_unknown_session_404(client):
    r = H.post_live_events(client, "ls_zzz_does_not_exist", [H.live_event()])
    assert r.status_code == 404, r.text
    code = error_code(r)
    assert isinstance(code, str) and code, f"404 must use the error envelope: {r.text}"


def test_post_events_after_finish_409_session_finished(client, fresh_db):
    sid, _ = H.create_live_session(client)
    assert H.post_live_events(client, sid, _batch()).status_code == 200
    fin = H.finish_live_session(client, sid)
    assert fin.status_code in FINISH_OK, fin.text

    r = H.post_live_events(client, sid, [H.live_event(kind="score", t_ms=60000)])
    assert r.status_code == 409, r.text
    assert error_code(r) == "session_finished"


# ---------------------------------------------------------------------------
# Detail + list
# ---------------------------------------------------------------------------

def test_session_detail_has_events_tail_and_list_contains_it(client):
    sid, _ = H.create_live_session(client, title="Detail probe")
    marker = "detail-tail-marker-7f3"
    r = H.post_live_events(
        client, sid, [H.live_event(kind="commentary", t_ms=1000, team=None, text=marker)]
    )
    assert r.status_code == 200, r.text

    d = client.get(f"/api/live/sessions/{sid}")
    assert d.status_code == 200, d.text
    detail = d.json()
    src = detail.get("session") if isinstance(detail.get("session"), dict) else detail
    tail = None
    for key in ("events", "recent_events", "recentEvents", "recent", "tail"):
        if isinstance(src.get(key), list):
            tail = src[key]
            break
    assert tail is not None, f"detail must expose a recent-events tail; keys: {list(detail)}"
    assert marker in json.dumps(tail), f"posted event missing from tail: {tail[-3:]}"

    lst = client.get("/api/live/sessions")
    assert lst.status_code == 200, lst.text
    sessions = H.unwrap_list(lst.json(), "sessions", "items")
    assert any(sid in json.dumps(s) for s in sessions), (
        f"{sid} missing from GET /api/live/sessions"
    )


# ---------------------------------------------------------------------------
# Finish -> converted done game (+ optional scout card)
# ---------------------------------------------------------------------------

def test_finish_converts_to_done_game_seconds_and_scout_card(client, fresh_db):
    sid, _ = H.create_live_session(client, title="Convert me")
    assert H.post_live_events(client, sid, _batch()).status_code == 200

    fin = H.finish_live_session(
        client, sid, duration_ms=300000, publish_scout_card={"playerName": "Testy"}
    )
    assert fin.status_code in FINISH_OK, fin.text
    body = fin.json()
    gid = body.get("game_id")
    assert gid, f"finish must return a game_id: {body}"

    detail = client.get(f"/api/games/{gid}")
    assert detail.status_code == 200, detail.text
    assert detail.json()["status"] == "done"

    events = H.unwrap_list(client.get(f"/api/games/{gid}/events").json(), "events")
    assert events, "converted game must have a non-empty /events timeline"
    ts = [e["t"] for e in events]
    assert max(ts) <= 300.0 + 1.0, (
        f"event t must be SECONDS (durationMs was 300000 -> <=300s), got max t={max(ts)}"
    )
    assert any(abs(e["t"] - 34.2) < 0.01 for e in events), (
        f"the 34200 ms live event must convert to t=34.2 s; ts={sorted(ts)[:20]}"
    )

    box = client.get(f"/api/games/{gid}/boxscore")
    assert box.status_code == 200, box.text
    assert box.json().get("game_id") == gid

    card_id = body.get("scout_card_id")
    if card_id:
        got = client.get(f"/api/scout/profiles/{card_id}")
        assert got.status_code == 200, got.text
        assert "Testy" in json.dumps(got.json()), (
            "published scout card must carry the requested playerName"
        )


# ---------------------------------------------------------------------------
# WS /ws/live/{session_id}
# ---------------------------------------------------------------------------

def test_ws_live_receives_events_posted_from_thread(client, fresh_db):
    sid, _ = H.create_live_session(client)
    marker = "ws-live-marker-bucket-42"
    batch = [H.live_event(kind="score", t_ms=5000, team="A", value=2,
                          score_a=2, score_b=0, text=marker)]

    post_result: dict = {}

    def _post_later() -> None:
        time.sleep(0.7)  # let the socket attach first
        try:
            r = H.post_live_events(client, sid, batch)
            post_result["status"] = r.status_code
            post_result["body"] = r.text[:200]
        except Exception as exc:  # noqa: BLE001 - surfaced via assert below
            post_result["error"] = repr(exc)

    poster = threading.Thread(target=_post_later, daemon=True)
    with client.websocket_connect(f"/ws/live/{sid}") as ws:
        poster.start()
        msgs = H.collect_ws_messages(
            ws, duration=15.0, stop_when=lambda m: marker in json.dumps(m)
        )
    poster.join(timeout=5.0)

    assert post_result.get("status") == 200, f"threaded event POST failed: {post_result}"
    assert any(marker in json.dumps(m) for m in msgs), (
        f"posted live event never arrived on /ws/live/{sid}; "
        f"got {len(msgs)} messages, types: {[m.get('type') or m.get('kind') for m in msgs][:20]}"
    )


def test_ws_live_finished_session_status(client, fresh_db):
    sid, _ = H.create_live_session(client)
    assert H.post_live_events(client, sid, _batch()).status_code == 200
    assert H.finish_live_session(client, sid).status_code in FINISH_OK

    try:
        with client.websocket_connect(f"/ws/live/{sid}") as ws:
            msgs = H.collect_ws_messages(
                ws, duration=5.0, stop_when=lambda m: m.get("type") == "status"
            )
    except Exception:
        return  # rejected handshake is acceptable finished-session behavior

    status_frames = [m for m in msgs if m.get("type") == "status"]
    assert status_frames, (
        f"finished-session socket must send a status frame (or reject the "
        f"handshake); got: {msgs[:5]}"
    )
    assert any(m.get("status") in ("finished", "done") for m in status_frames), (
        f"expected status finished/done, got: {status_frames}"
    )


# ---------------------------------------------------------------------------
# POST /api/games/{game_id}/identify on a converted game
# ---------------------------------------------------------------------------

def _converted_game_with_player_ids(client) -> str:
    sid, _ = H.create_live_session(client, title="Identify me")
    assert H.post_live_events(client, sid, _batch()).status_code == 200
    fin = H.finish_live_session(client, sid)
    assert fin.status_code in FINISH_OK, fin.text
    return fin.json()["game_id"]


def test_identify_remaps_event_player_ids(client, fresh_db):
    gid = _converted_game_with_player_ids(client)

    events = H.unwrap_list(client.get(f"/api/games/{gid}/events").json(), "events")
    sources = sorted({e.get("player_id") for e in events if e.get("player_id")})
    assert sources, (
        "converted live game must preserve a player_id on events (score events "
        "were posted with playerId=guest_1/guest_2) so identify has something to remap"
    )
    src = sources[0]

    # Unknown roster id must 404 (and must not partially apply).
    r404 = client.post(
        f"/api/games/{gid}/identify",
        json={"mapping": {src: "p_zzz_does_not_exist"}},
    )
    assert r404.status_code == 404, r404.text

    rp = client.post("/api/roster", json={"name": "Mapped Marvin", "position": "PG"})
    assert rp.status_code in (200, 201), rp.text
    rp_body = rp.json()
    pid = rp_body.get("player_id") or rp_body.get("id") or (
        rp_body.get("player") or {}
    ).get("player_id")
    assert pid, f"roster create returned no player id: {rp_body}"

    ri = client.post(f"/api/games/{gid}/identify", json={"mapping": {src: pid}})
    assert ri.status_code == 200, ri.text

    events2 = H.unwrap_list(client.get(f"/api/games/{gid}/events").json(), "events")
    ids_after = {e.get("player_id") for e in events2 if e.get("player_id")}
    assert pid in ids_after, f"mapped roster id must appear on events: {ids_after}"
    assert src not in ids_after, f"old id {src} must be fully remapped: {ids_after}"


# ---------------------------------------------------------------------------
# GET /api/leaderboards
# ---------------------------------------------------------------------------

def test_leaderboards_points_shape(client, fresh_db):
    # Give the leaderboard at least one finished live game to source from.
    sid, _ = H.create_live_session(client)
    H.post_live_events(client, sid, _batch())
    H.finish_live_session(client, sid)

    r = client.get("/api/leaderboards", params={"category": "points"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["category"] == "points"
    assert isinstance(body["leaders"], list)
    for leader in body["leaders"]:
        assert isinstance(leader, dict)


def test_leaderboards_invalid_category_falls_back_to_points(client):
    r = client.get("/api/leaderboards", params={"category": "totally_bogus"})
    assert r.status_code == 200, r.text
    assert r.json()["category"] == "points"


def test_leaderboards_limit_respected(client):
    r = client.get("/api/leaderboards", params={"category": "points", "limit": 1})
    assert r.status_code == 200, r.text
    assert len(r.json()["leaders"]) <= 1
