"""Extras wave (routes_games.py additions): shot chart, JSON/CSV exports,
highlight reel, and /api/commentary TTS.

All app imports happen lazily via the conftest `client` fixture so collection
stays clean while the coder agents land the feature. A missing feature is a
test FAILURE (the bug-fixer wave runs after), never a skip.
"""
from __future__ import annotations

import csv
import io
import time

import pytest

from tests.helpers import error_code, make_tiny_video, unwrap_list

# Half-court bounds documented for the shot chart (length x width, metres).
SHOT_X_MAX = 14.4
SHOT_Y_MAX = 15.3


# ---------------------------------------------------------------------------
# Shot chart
# ---------------------------------------------------------------------------

def test_shotchart_g_sample(client):
    r = client.get("/api/games/g_sample/shotchart")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["game_id"] == "g_sample"
    shots = body["shots"]
    assert isinstance(shots, list) and shots, (
        "g_sample has score events, so its shot chart must be non-empty"
    )
    for s in shots:
        for key in ("t", "team", "made", "points", "x", "y"):
            assert key in s, f"shot missing '{key}': {s}"
        assert isinstance(s["made"], bool), f"made must be a bool: {s}"
        assert str(s["team"]).lower() in ("a", "b"), f"bad team: {s}"
        assert isinstance(s["points"], int) and s["points"] >= 0, f"bad points: {s}"
        assert 0 <= s["x"] <= SHOT_X_MAX, f"x out of court bounds [0, {SHOT_X_MAX}]: {s}"
        assert 0 <= s["y"] <= SHOT_Y_MAX, f"y out of court bounds [0, {SHOT_Y_MAX}]: {s}"


def test_shotchart_unknown_game_404_envelope(client):
    r = client.get("/api/games/g_zzz_does_not_exist/shotchart")
    assert r.status_code == 404, r.text
    code = error_code(r)
    assert isinstance(code, str) and code, f"404 must use the error envelope: {r.text}"


# ---------------------------------------------------------------------------
# Exports
# ---------------------------------------------------------------------------

def test_export_json(client):
    r = client.get("/api/games/g_sample/export.json")
    assert r.status_code == 200, r.text
    disposition = r.headers.get("content-disposition", "")
    assert "attachment" in disposition.lower(), (
        f"export must set an attachment content-disposition, got: {disposition!r}"
    )
    body = r.json()
    for key in ("game", "events", "analytics"):
        assert key in body, f"export.json missing '{key}' (keys: {list(body)})"
    assert isinstance(body["events"], list) and body["events"]


def test_export_csv(client):
    events = unwrap_list(client.get("/api/games/g_sample/events").json(), "events")
    assert events, "g_sample must have events (precondition)"

    r = client.get("/api/games/g_sample/export.csv")
    assert r.status_code == 200, r.text
    ctype = r.headers.get("content-type", "")
    assert ctype.split(";")[0].strip() == "text/csv", f"bad content-type: {ctype!r}"
    raw = r.content
    assert raw.startswith(b"\xef\xbb\xbf"), "export.csv must start with a UTF-8 BOM"

    rows = [row for row in csv.reader(io.StringIO(raw.decode("utf-8-sig"))) if row]
    header = rows[0]
    assert header[0] == "t" and header[1] == "type", (
        f"csv header must start 't,type,...': {header}"
    )
    assert len(rows) == len(events) + 1, (
        f"csv must have header + one row per event: {len(rows)} rows vs "
        f"{len(events)} events"
    )


# ---------------------------------------------------------------------------
# Reel
# ---------------------------------------------------------------------------

def test_reel_post_g_sample_builds_or_409_no_highlights(client):
    """g_sample has no highlight FILES on disk, so 409 no_highlights is the
    expected outcome; a real reel response is also acceptable if the
    implementation can synthesize one."""
    r = client.post("/api/games/g_sample/reel")
    if r.status_code == 409:
        body = r.json()
        assert isinstance(body.get("error"), dict), (
            f"409 must use the nested error envelope: {r.text}"
        )
        assert error_code(r) == "no_highlights"
        assert isinstance(body["error"].get("message"), str) and body["error"]["message"]
    else:
        assert r.status_code in (200, 201), r.text
        body = r.json()
        assert isinstance(body.get("reel_url"), str) and body["reel_url"], (
            f"reel response must carry reel_url: {body}"
        )


def test_reel_get_never_built_404(client, fresh_db):
    gid = "g_test_reel_never_built"
    with fresh_db.get_conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO games (game_id, title, status) VALUES (?, ?, ?)",
            (gid, "pytest reel probe", "done"),
        )
    r = client.get(f"/api/games/{gid}/reel")
    assert r.status_code == 404, r.text
    assert error_code(r) == "reel_not_built"


@pytest.mark.slow
def test_reel_happy_path_after_processing(client, fresh_db, tmp_path):
    """Full E2E: upload synthetic video -> processed -> POST reel -> mp4 on
    disk that cv2 can open with >30 frames."""
    video = make_tiny_video(tmp_path)
    with open(video, "rb") as fh:
        r = client.post(
            "/api/games",
            files={"video": ("tiny.mp4", fh, "video/mp4")},
            data={"title": "pytest reel e2e", "target_score": "5"},
        )
    assert r.status_code == 201, r.text
    gid = r.json()["game_id"]

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

    highlights = unwrap_list(client.get(f"/api/games/{gid}/highlights").json(), "highlights")

    rr = client.post(f"/api/games/{gid}/reel")
    if rr.status_code == 409:
        assert error_code(rr) == "no_highlights"
        assert not highlights, (
            "reel 409'd no_highlights but /highlights is non-empty — that is a bug"
        )
        pytest.skip("synthetic game produced no highlight clips; reel happy path not exercisable")

    assert rr.status_code in (200, 201), rr.text
    reel_url = rr.json().get("reel_url")
    assert isinstance(reel_url, str) and reel_url.startswith("/media/"), (
        f"reel_url must be a /media/ path: {rr.json()}"
    )

    # Serveable over HTTP and present on disk.
    assert client.get(reel_url).status_code == 200

    from app import config

    rel = reel_url.split("?")[0][len("/media/"):]
    path = config.MEDIA_DIR / rel
    assert path.exists() and path.stat().st_size > 0, f"reel mp4 missing on disk: {path}"

    cv2 = pytest.importorskip("cv2")
    cap = cv2.VideoCapture(str(path))
    assert cap.isOpened(), f"cv2 could not open the reel mp4: {path}"
    frames = 0
    while True:
        ok, _ = cap.read()
        if not ok:
            break
        frames += 1
    cap.release()
    assert frames > 30, f"reel must contain more than 30 frames, got {frames}"


# ---------------------------------------------------------------------------
# /api/commentary TTS
# ---------------------------------------------------------------------------

def test_commentary_tts_true_has_audio_url_key(client):
    r = client.post(
        "/api/commentary",
        json={"event": "score", "teamName": "Red", "scoreA": 5, "scoreB": 3, "tts": True},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body["text"], str) and body["text"].strip()
    assert "audio_url" in body, f"tts=true response must carry an audio_url key: {body}"
    audio_url = body["audio_url"]
    if audio_url is None:
        return  # TTS unavailable in this environment: null is documented
    assert isinstance(audio_url, str) and audio_url, f"bad audio_url: {body}"
    media = client.get(audio_url)
    assert media.status_code == 200, f"audio_url must be fetchable: {audio_url}"
    assert media.content, "served TTS audio must be non-empty"


def test_commentary_without_tts_shape_unchanged(client):
    """No regression: the pre-existing contract is {text, source} with no TTS
    side effects; audio_url must be absent or null without the tts flag."""
    r = client.post(
        "/api/commentary",
        json={"event": "score", "teamName": "Red", "scoreA": 5, "scoreB": 3},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body["text"], str) and body["text"].strip()
    assert body["source"] in ("engine", "llm")
    assert body.get("audio_url") is None, (
        f"audio_url must be absent/null when tts was not requested: {body}"
    )
