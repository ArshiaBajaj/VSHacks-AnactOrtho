"""Games API contract (backend/API_CONTRACT.md section 1) plus the built-in
completed sample game g_sample, plus the slow upload -> process -> results
end-to-end lifecycle.
"""
from __future__ import annotations

import time

import pytest

from tests.helpers import error_code

VALID_EVENT_TYPES = {
    "game_start",
    "game_end",
    "score",
    "shot_attempt",
    "out_of_bounds",
    "whistle",
    "streak",
    "commentary",
    "possession_change",
}


def _unwrap_list(body, *keys):
    """Accept either a bare JSON list or {key: [...]} envelopes."""
    if isinstance(body, list):
        return body
    if isinstance(body, dict):
        for key in keys:
            if isinstance(body.get(key), list):
                return body[key]
    pytest.fail(f"expected a list (or one of {keys} keys), got: {type(body).__name__}")


def _get_events(client, game_id: str) -> list[dict]:
    r = client.get(f"/api/games/{game_id}/events")
    assert r.status_code == 200
    return _unwrap_list(r.json(), "events")


# ---------------------------------------------------------------------------
# g_sample: the built-in completed sample game
# ---------------------------------------------------------------------------

def test_g_sample_listed_and_done(client):
    r = client.get("/api/games")
    assert r.status_code == 200
    games = _unwrap_list(r.json(), "games")
    sample = next((g for g in games if g.get("game_id") == "g_sample"), None)
    assert sample is not None, "built-in sample game g_sample must always exist"
    assert sample["status"] == "done"


def test_g_sample_detail(client):
    r = client.get("/api/games/g_sample")
    assert r.status_code == 200
    detail = r.json()
    assert detail["game_id"] == "g_sample"
    assert detail["status"] == "done"


def test_g_sample_events_ordered_and_sane(client):
    events = _get_events(client, "g_sample")
    assert events, "g_sample must have events"

    ts = [e["t"] for e in events]
    assert ts == sorted(ts), "events must be ordered by t"

    types = [e["type"] for e in events]
    assert set(types) <= VALID_EVENT_TYPES, f"unknown event types: {set(types) - VALID_EVENT_TYPES}"
    assert "game_start" in types
    assert "game_end" in types
    assert types.index("game_start") < types.index("game_end")
    assert "score" in types, "a sample game should contain scoring"


def test_g_sample_scores_monotonic(client):
    events = _get_events(client, "g_sample")
    last_a = last_b = 0
    saw_score_after = False
    for e in events:
        s = e.get("score_after")
        if not s:
            continue
        saw_score_after = True
        assert s["team_a"] >= last_a, f"team_a score regressed at t={e['t']}"
        assert s["team_b"] >= last_b, f"team_b score regressed at t={e['t']}"
        last_a, last_b = s["team_a"], s["team_b"]
    assert saw_score_after, "at least some events must carry score_after"


def test_g_sample_analytics_shape(client):
    from app.models import GameAnalytics

    r = client.get("/api/games/g_sample/analytics")
    assert r.status_code == 200
    analytics = GameAnalytics.model_validate(r.json())  # raises if shape drifts
    assert analytics.game_id == "g_sample"


# ---------------------------------------------------------------------------
# Error envelope + delete lifecycle
# ---------------------------------------------------------------------------

def test_unknown_game_error_envelope(client):
    r = client.get("/api/games/g_zzz_does_not_exist")
    assert r.status_code == 404
    assert error_code(r) == "game_not_found"


def test_unknown_game_events_and_analytics_404(client):
    assert client.get("/api/games/g_zzz_does_not_exist/events").status_code == 404
    assert client.get("/api/games/g_zzz_does_not_exist/analytics").status_code == 404


def test_delete_game_lifecycle(client, fresh_db):
    gid = "g_test_delete_me"
    with fresh_db.get_conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO games (game_id, title, status) VALUES (?, ?, ?)",
            (gid, "pytest temp game", "done"),
        )
    assert client.get(f"/api/games/{gid}").status_code == 200
    r = client.delete(f"/api/games/{gid}")
    assert r.status_code in (200, 204)
    assert client.get(f"/api/games/{gid}").status_code == 404


# ---------------------------------------------------------------------------
# Upload -> process -> results (slow, but included by default)
# ---------------------------------------------------------------------------

def _make_tiny_video(tmp_path) -> str:
    """Prefer the project's synthetic generator; else 30 solid frames via cv2."""
    out = str(tmp_path / "tiny.mp4")
    try:
        from app.cv import synthetic

        try:
            synthetic.generate_synthetic_game(out, duration_s=4.0, fps=30, size=(640, 360), seed=7)
        except TypeError:
            synthetic.generate_synthetic_game(out, 4.0, 30, (640, 360), 7)
        import os

        if os.path.exists(out) and os.path.getsize(out) > 0:
            return out
    except Exception:
        pass

    cv2 = pytest.importorskip("cv2")
    np = pytest.importorskip("numpy")
    writer = cv2.VideoWriter(out, cv2.VideoWriter_fourcc(*"mp4v"), 30, (320, 240))
    assert writer.isOpened(), "cv2 could not open an mp4 writer"
    frame = np.full((240, 320, 3), (40, 90, 160), dtype=np.uint8)
    for _ in range(30):
        writer.write(frame)
    writer.release()
    return out


@pytest.mark.slow
def test_upload_process_lifecycle(client, fresh_db, tmp_path):
    video = _make_tiny_video(tmp_path)

    with open(video, "rb") as fh:
        r = client.post(
            "/api/games",
            files={"video": ("tiny.mp4", fh, "video/mp4")},
            data={"title": "pytest upload", "target_score": "5"},
        )
    assert r.status_code == 201, r.text
    body = r.json()
    gid = body["game_id"]
    assert gid
    # Contract says "queued"; a fast worker may already report processing.
    assert body["status"] in ("queued", "processing")

    deadline = time.monotonic() + 120
    detail = None
    while time.monotonic() < deadline:
        resp = client.get(f"/api/games/{gid}")
        assert resp.status_code == 200
        detail = resp.json()
        if detail.get("status") in ("done", "error"):
            break
        time.sleep(1.0)

    assert detail is not None and detail.get("status") == "done", (
        f"processing did not reach 'done' within 120s: {detail}"
    )
    assert (detail.get("duration_s") or 0) > 0

    events = _get_events(client, gid)
    assert events, "a processed game must emit events"
    types = {e["type"] for e in events}
    assert "game_start" in types
    assert "game_end" in types

    from app.models import GameAnalytics

    ar = client.get(f"/api/games/{gid}/analytics")
    assert ar.status_code == 200
    analytics = GameAnalytics.model_validate(ar.json())
    assert analytics.game_id == gid
