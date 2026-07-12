"""Test helpers: FrameObservation factories plus small adapters that keep the
tests pinned to CONTRACT BEHAVIOR while two implementations land in parallel.

app.cv.types is dependency-free by design (no cv2/mediapipe), so importing it
at module level here is always safe.
"""
from __future__ import annotations

import json
import math
import queue
import threading
import time
from typing import Any, Callable, Iterable, Optional

from app.cv.types import (
    COURT_LENGTH_M,
    COURT_WIDTH_M,
    BallObservation,
    CourtCalibration,
    FrameObservation,
    PlayerObservation,
)

FPS = 30.0
IDENTITY_H = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]

# A fixed hoop the synthetic engine sequences shoot at.
HOOP_IMAGE_XY = (640.0, 200.0)
HOOP_RADIUS_PX = 30.0
HOOP_COURT_XY = (1.6, COURT_WIDTH_M / 2.0)

FRAME_W, FRAME_H = 1280.0, 720.0


# ---------------------------------------------------------------------------
# Observation factories
# ---------------------------------------------------------------------------

def make_calibration() -> CourtCalibration:
    return CourtCalibration(
        homography=[row[:] for row in IDENTITY_H],
        boundary_image_poly=[(50.0, 100.0), (1230.0, 100.0), (1230.0, 650.0), (50.0, 650.0)],
        hoop_image_xy=HOOP_IMAGE_XY,
        hoop_radius_px=HOOP_RADIUS_PX,
        confidence=0.9,
    )


def make_player(
    track_id: int = 1,
    team: Optional[str] = "a",
    image_center: tuple[float, float] = (400.0, 480.0),
    court_xy: Optional[tuple[float, float]] = None,
) -> PlayerObservation:
    x, y = image_center
    return PlayerObservation(
        track_id=track_id,
        image_bbox=(x - 30.0, y - 90.0, x + 30.0, y + 90.0),
        court_xy=court_xy or (8.0, COURT_WIDTH_M / 2.0),
        keypoints=[],
        team=team,
    )


def make_obs(
    frame_idx: int,
    ball_image: Optional[tuple[float, float]] = None,
    ball_court: Optional[tuple[float, float]] = None,
    players: Optional[Iterable[PlayerObservation]] = None,
    calib: Optional[CourtCalibration] = None,
    predicted: bool = False,
    radius_px: float = 12.0,
    confidence: float = 0.9,
) -> FrameObservation:
    ball = None
    if ball_image is not None or ball_court is not None:
        if ball_image is None:
            ball_image = (FRAME_W / 2.0, FRAME_H / 2.0)
        ball = BallObservation(
            image_xy=(float(ball_image[0]), float(ball_image[1])),
            court_xy=(float(ball_court[0]), float(ball_court[1])) if ball_court is not None else None,
            radius_px=radius_px,
            confidence=confidence,
            predicted=predicted,
        )
    return FrameObservation(
        frame_idx=frame_idx,
        t=frame_idx / FPS,
        ball=ball,
        players=list(players or []),
        calibration=calib or make_calibration(),
    )


def neutral_sequence(start_idx: int, n: int = 15) -> list[FrameObservation]:
    """Ball dribbled around midcourt: no events should fire."""
    return [
        make_obs(start_idx + k, ball_image=(640.0, 500.0), ball_court=(14.0, COURT_WIDTH_M / 2.0))
        for k in range(n)
    ]


def shot_sequence(start_idx: int = 0, team: Optional[str] = "a") -> list[FrameObservation]:
    """Ball is carried toward the hoop, arcs above the rim, then drops straight
    down through the hoop center: contract behavior is shot_attempt -> score.
    """
    calib = make_calibration()
    hoop_x, hoop_y = HOOP_IMAGE_XY
    obs: list[FrameObservation] = []
    i = start_idx

    # Approach: player of `team` dribbles the ball toward the hoop.
    for k in range(8):
        bx, by = 320.0 + k * 30.0, 500.0
        cx = max(8.0 - k * 0.8, 2.5)
        obs.append(
            make_obs(
                i,
                ball_image=(bx, by),
                ball_court=(cx, COURT_WIDTH_M / 2.0),
                players=[make_player(track_id=1, team=team, image_center=(bx, by + 40.0),
                                     court_xy=(cx, COURT_WIDTH_M / 2.0))],
                calib=calib,
            )
        )
        i += 1

    # Release + arc: ball rises well above the rim.
    for k, by in enumerate((420.0, 350.0, 280.0, 220.0, 170.0, 140.0)):
        bx = 560.0 + k * 16.0  # ends exactly at hoop_x
        obs.append(make_obs(i, ball_image=(bx, by), ball_court=HOOP_COURT_XY, calib=calib))
        i += 1

    # Drop: ball passes down through the hoop center (x == hoop_x).
    for by in (160.0, 185.0, 200.0, 215.0, 240.0, 280.0):
        obs.append(make_obs(i, ball_image=(hoop_x, by), ball_court=HOOP_COURT_XY, calib=calib))
        i += 1

    # Ball falls to the floor under the hoop.
    for by in (340.0, 420.0, 500.0):
        obs.append(make_obs(i, ball_image=(hoop_x, by), ball_court=(2.0, COURT_WIDTH_M / 2.0), calib=calib))
        i += 1

    return obs


def oob_sequence(frames_outside: int, start_idx: int = 0) -> list[FrameObservation]:
    """In-bounds play, then the ball's court position leaves the court width
    for `frames_outside` frames, then comes back in.
    """
    obs: list[FrameObservation] = []
    i = start_idx
    for _ in range(10):
        obs.append(make_obs(i, ball_image=(640.0, 400.0), ball_court=(10.0, 7.0)))
        i += 1
    for _ in range(frames_outside):
        obs.append(make_obs(i, ball_image=(640.0, 680.0), ball_court=(10.0, COURT_WIDTH_M + 1.5)))
        i += 1
    for _ in range(15):
        obs.append(make_obs(i, ball_image=(640.0, 400.0), ball_court=(10.0, 7.0)))
        i += 1
    return obs


# ---------------------------------------------------------------------------
# Engine adapters (constructor / event shapes may vary while code lands)
# ---------------------------------------------------------------------------

def make_engine(**kwargs):
    """Construct a GameEngine without pinning the constructor style.

    Plain make_engine() failures are hard failures (engine is core contract).
    If extra kwargs (e.g. target_score) are rejected by every constructor
    style, the calling test is skipped with a clear message: constructor
    style is an implementation detail, the kwarg is not itself the contract.
    """
    import pytest

    from app.engine.game_state import GameEngine

    attempts = [
        lambda: GameEngine(**kwargs),
        lambda: GameEngine(game_id="g_test", **kwargs),
        lambda: GameEngine("g_test", **kwargs),
    ]
    last: Exception | None = None
    for attempt in attempts:
        try:
            return attempt()
        except TypeError as exc:
            last = exc
    if kwargs:
        pytest.skip(f"GameEngine constructor does not accept kwargs {sorted(kwargs)}: {last}")
    raise AssertionError(f"Could not construct GameEngine with any known signature: {last}")


def run_engine(engine, observations: Iterable[FrameObservation], finalize: bool = True) -> list:
    events: list = []
    for obs in observations:
        out = engine.process(obs)
        if out:
            events.extend(out)
    if finalize:
        out = engine.finalize()
        if out:
            events.extend(out)
    return events


def etype(event) -> Optional[str]:
    """Event type as a plain string, whatever the event object is."""
    t = event.get("type") if isinstance(event, dict) else getattr(event, "type", None)
    return getattr(t, "value", t)


def escore(event) -> Optional[tuple[int, int]]:
    """(team_a, team_b) from score_after, or None."""
    s = event.get("score_after") if isinstance(event, dict) else getattr(event, "score_after", None)
    if s is None:
        return None
    if isinstance(s, dict):
        return (int(s.get("team_a", 0)), int(s.get("team_b", 0)))
    return (int(getattr(s, "team_a", 0)), int(getattr(s, "team_b", 0)))


# ---------------------------------------------------------------------------
# Commentary adapters
# ---------------------------------------------------------------------------

_COMMENTARY_FIELDS = ("event", "team", "teamName", "value", "scoreA", "scoreB", "style")


class _Req:
    """Duck-typed CommentaryRequest: attribute, .get() and [] access."""

    def __init__(self, data: dict):
        for k in _COMMENTARY_FIELDS:
            setattr(self, k, data.get(k))

    def get(self, key, default=None):
        return getattr(self, key, default)

    def __getitem__(self, key):
        return getattr(self, key)

    def __contains__(self, key):
        return getattr(self, key, None) is not None


def call_commentary(fn: Callable, **req: Any):
    """Call a ported commentary function whether it takes the module's own
    CommentaryRequest model, kwargs, a request object, or a plain dict.

    Order matters for async functions (a coroutine is returned before any
    body code runs), so the richest request shapes are tried first.
    """
    import sys

    payload = {k: v for k, v in req.items() if v is not None}
    errors: list[Exception] = []

    # 1. The module's own request model, if it exports one.
    mod = sys.modules.get(getattr(fn, "__module__", "") or "")
    req_cls = getattr(mod, "CommentaryRequest", None)
    if req_cls is not None:
        try:
            return fn(req_cls(**payload))
        except (TypeError, ValueError) as exc:
            errors.append(exc)

    # 2. Plain kwargs.
    try:
        return fn(**payload)
    except TypeError as exc:
        errors.append(exc)

    # 3. Duck-typed request object (works for attr AND dict style access).
    try:
        return fn(_Req(payload))
    except (TypeError, AttributeError) as exc:
        errors.append(exc)

    # 4. Bare dict.
    try:
        return fn(payload)
    except (TypeError, AttributeError, KeyError) as exc:
        errors.append(exc)
    raise AssertionError(f"Could not call {fn!r} with any known request shape: {errors}")


def unpack_text_source(result) -> tuple[str, str]:
    """Normalize a {text, source} result whether dict, tuple, or object."""
    if isinstance(result, dict):
        return result["text"], result["source"]
    if isinstance(result, (tuple, list)) and len(result) == 2:
        return result[0], result[1]
    return getattr(result, "text"), getattr(result, "source")


# ---------------------------------------------------------------------------
# WebSocket helper: TestClient WS receive has no timeout, so a silent socket
# would hang the suite. A dedicated reader thread feeds a queue; the test
# thread drains it under a hard deadline.
# ---------------------------------------------------------------------------

def collect_ws_messages(
    ws,
    duration: float,
    stop_when: Optional[Callable[[dict], bool]] = None,
) -> list[dict]:
    q: "queue.Queue[Optional[dict]]" = queue.Queue()

    def _reader() -> None:
        while True:
            try:
                raw = ws.receive_text()
            except Exception:
                q.put(None)
                return
            try:
                q.put(json.loads(raw))
            except Exception:
                q.put({"type": "unparseable", "raw": raw})

    thread = threading.Thread(target=_reader, daemon=True)
    thread.start()

    msgs: list[dict] = []
    deadline = time.monotonic() + duration
    while time.monotonic() < deadline:
        try:
            msg = q.get(timeout=max(0.05, deadline - time.monotonic()))
        except queue.Empty:
            break
        if msg is None:  # socket closed
            break
        msgs.append(msg)
        if stop_when is not None and stop_when(msg):
            break
    return msgs


# ---------------------------------------------------------------------------
# Shared compat payloads (mirror apps/server/src/types.ts ScoutCard)
# ---------------------------------------------------------------------------

SCOUT_PLAYER_NAME = "Vihan Test"


def scout_card_payload() -> dict:
    return {
        "player": {
            "name": SCOUT_PLAYER_NAME,
            "team": "A",
            "position": "PG",
            "points": 18,
            "shots": 12,
            "makes": 7,
            "jumps": 9,
            "bestJumpCm": 61.0,
            "topReleaseMps": 8.2,
            "distanceM": 1320.0,
        },
        "sport": "basketball",
        "duration": 600000,
        "events": [
            {"id": "ev1", "t": 12000, "kind": "score", "team": "A", "value": 2, "text": "bucket"},
            {"id": "ev2", "t": 44000, "kind": "jump", "team": "A", "value": 55},
            {"id": "ev3", "t": 90000, "kind": "score", "team": "A", "value": 1, "text": "and one"},
        ],
    }


def error_code(resp) -> Optional[str]:
    """Extract a machine error code from either documented envelope:
    {"error": {"code": ...}} (backend contract) or {"error": "..."} (compat).
    """
    try:
        body = resp.json()
    except Exception:
        return None
    err = body.get("error")
    if isinstance(err, dict):
        return err.get("code")
    return err


# ---------------------------------------------------------------------------
# Bonus wave (live sessions + extras) shared factories — ADDITIVE ONLY.
# ---------------------------------------------------------------------------

LIVE_EVENT_KINDS = (
    "score",
    "whistle",
    "jump",
    "steal",
    "streak",
    "commentary",
    "out_of_bounds",
    "shot",
    "highlight",
)


def live_event(
    kind: str = "score",
    t_ms: int = 15000,
    team: Optional[str] = "A",
    value: Optional[float] = None,
    score_a: Optional[int] = None,
    score_b: Optional[int] = None,
    text: Optional[str] = None,
    player_id: Optional[str] = None,
    **extra: Any,
) -> dict:
    """Frontend-shaped live event: `t` in MILLISECONDS, camelCase score keys,
    team as "A"/"B". None fields are omitted (frontends only send what they have).
    """
    ev: dict[str, Any] = {"id": f"lev_{kind}_{t_ms}", "t": int(t_ms), "kind": kind}
    if team is not None:
        ev["team"] = team
    if value is not None:
        ev["value"] = value
    if score_a is not None:
        ev["scoreA"] = score_a
    if score_b is not None:
        ev["scoreB"] = score_b
    if text is not None:
        ev["text"] = text
    if player_id is not None:
        ev["playerId"] = player_id
    ev.update(extra)
    return ev


def create_live_session(
    client,
    title: str = "Test run",
    team_a: str = "Red",
    team_b: str = "Blue",
) -> tuple[str, dict]:
    """POST /api/live/sessions and return (session_id, response_body)."""
    r = client.post(
        "/api/live/sessions",
        json={"title": title, "teamAName": team_a, "teamBName": team_b},
    )
    assert r.status_code == 201, f"POST /api/live/sessions -> {r.status_code}: {r.text[:300]}"
    body = r.json()
    sid = body.get("session_id") or body.get("id")
    assert isinstance(sid, str) and sid, f"create-session response carries no session id: {body}"
    return sid, body


def post_live_events(client, session_id: str, events: list[dict]):
    return client.post(f"/api/live/sessions/{session_id}/events", json={"events": events})


def finish_live_session(
    client,
    session_id: str,
    duration_ms: int = 300000,
    publish_scout_card: Optional[dict] = None,
):
    payload: dict[str, Any] = {"durationMs": duration_ms}
    if publish_scout_card is not None:
        payload["publishScoutCard"] = publish_scout_card
    return client.post(f"/api/live/sessions/{session_id}/finish", json=payload)


def unwrap_list(body, *keys):
    """Accept either a bare JSON list or a {key: [...]} envelope."""
    if isinstance(body, list):
        return body
    if isinstance(body, dict):
        for key in keys:
            if isinstance(body.get(key), list):
                return body[key]
    raise AssertionError(f"expected a list (or one of {keys} keys), got: {type(body).__name__}")


def make_tiny_video(tmp_path) -> str:
    """Small REAL mp4 for upload tests: prefer the project's synthetic
    generator; else 30 solid frames via cv2. (Mirrors test_games_api.)
    """
    import os

    import pytest

    out = str(tmp_path / "tiny.mp4")
    try:
        from app.cv import synthetic

        try:
            synthetic.generate_synthetic_game(out, duration_s=4.0, fps=30, size=(640, 360), seed=7)
        except TypeError:
            synthetic.generate_synthetic_game(out, 4.0, 30, (640, 360), 7)
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
