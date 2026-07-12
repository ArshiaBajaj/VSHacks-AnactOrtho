"""Per-player metrics computed from FrameObservations + game events.

Player ids in events are the string form f"p_{track_id}" of CV track ids.
All court-space metrics degrade to None when court_xy was never available.
"""
from __future__ import annotations

import math
from typing import Optional

import numpy as np

from ..models import EventType, GameEvent
from ..cv.types import FrameObservation

MAX_HUMAN_SPEED_MS = 12.0     # reject homography glitches above this
SMOOTH_WINDOW = 5             # moving-average window (frames) for positions
RELEASE_WINDOW_S = 0.3        # ball-speed window after a shot attempt
MAX_JUMP_CM = 150.0           # sanity cap for vertical jump
MIN_JUMP_CM = 5.0             # below this we call it noise, not a jump


def compute_player_metrics(observations: list[FrameObservation],
                           events: list[GameEvent]) -> dict[int, dict]:
    """Return {track_id: metrics dict} for every player track seen.

    Metrics: points, shot_attempts, shots_made, max_vertical_jump_cm,
    avg_shot_release_velocity_ms, top_speed_ms, distance_covered_m.
    """
    tracks = _collect_tracks(observations)
    ball_track = _collect_ball(observations)
    scale_m_per_px = _image_scale_m_per_px(observations)

    metrics: dict[int, dict] = {}
    for track_id, samples in tracks.items():
        player_id = f"p_{track_id}"
        ev = [e for e in events if e.player_id == player_id]
        shot_ts = [e.t for e in ev if e.type == EventType.shot_attempt]
        scores = [e for e in ev if e.type == EventType.score]

        top_speed, distance = _speed_and_distance(samples)
        metrics[track_id] = {
            "points": sum(e.points or 0 for e in scores),
            "shot_attempts": len(shot_ts),
            "shots_made": len(scores),
            "max_vertical_jump_cm": _max_vertical_jump_cm(samples, scale_m_per_px),
            "avg_shot_release_velocity_ms": _avg_release_velocity(ball_track, shot_ts),
            "top_speed_ms": top_speed,
            "distance_covered_m": distance,
        }
    return metrics


# ---------------------------------------------------------------------- #
# Data collection
# ---------------------------------------------------------------------- #

def _collect_tracks(observations: list[FrameObservation]) -> dict[int, list[dict]]:
    """track_id -> list of per-frame samples (t, court_xy, hip_y, ankle_y)."""
    tracks: dict[int, list[dict]] = {}
    for fo in observations:
        for p in fo.players:
            kp = {k.name: k for k in p.keypoints}
            hip_y = _mean_y(kp, ("left_hip", "right_hip"))
            ankle_y = _mean_y(kp, ("left_ankle", "right_ankle"))
            tracks.setdefault(p.track_id, []).append({
                "t": fo.t,
                "court_xy": p.court_xy,
                "hip_y": hip_y,
                "ankle_y": ankle_y,
            })
    return tracks


def _collect_ball(observations: list[FrameObservation]) -> list[tuple[float, tuple[float, float]]]:
    out = []
    for fo in observations:
        if fo.ball is not None and fo.ball.court_xy is not None:
            out.append((fo.t, fo.ball.court_xy))
    return out


def _mean_y(kp: dict, names: tuple[str, ...]) -> Optional[float]:
    ys = [kp[n].image_xy[1] for n in names if n in kp and kp[n].confidence >= 0.3]
    return float(np.mean(ys)) if ys else None


def _image_scale_m_per_px(observations: list[FrameObservation]) -> Optional[float]:
    """Approximate meters-per-pixel from the court boundary poly vs court width.

    Uses the bottom edge of the boundary quad (closest to the camera), which
    spans COURT_WIDTH_M; a coarse but defensible scale for jump heights.
    """
    from ..cv.types import COURT_WIDTH_M
    for fo in observations:
        cal = fo.calibration
        if cal is None or not cal.boundary_image_poly or len(cal.boundary_image_poly) < 4:
            continue
        poly = cal.boundary_image_poly
        # bottom edge = the two points with the largest y
        pts = sorted(poly, key=lambda p: p[1], reverse=True)[:2]
        edge_px = math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1])
        if edge_px > 1.0:
            return COURT_WIDTH_M / edge_px
    return None


# ---------------------------------------------------------------------- #
# Metrics
# ---------------------------------------------------------------------- #

def _smooth(values: np.ndarray, window: int = SMOOTH_WINDOW) -> np.ndarray:
    if len(values) < 2:
        return values
    w = min(window, len(values))
    kernel = np.ones(w) / w
    if values.ndim == 1:
        return np.convolve(values, kernel, mode="same")
    return np.stack([np.convolve(values[:, i], kernel, mode="same")
                     for i in range(values.shape[1])], axis=1)


def _speed_and_distance(samples: list[dict]) -> tuple[Optional[float], Optional[float]]:
    """Top speed (m/s) and distance covered (m) from the court_xy track."""
    pts = [(s["t"], s["court_xy"]) for s in samples if s["court_xy"] is not None]
    if len(pts) < 2:
        return None, None
    ts = np.array([p[0] for p in pts], dtype=np.float64)
    xy = np.array([p[1] for p in pts], dtype=np.float64)
    xy = _smooth(xy)

    top_speed = 0.0
    distance = 0.0
    for i in range(1, len(ts)):
        dt = ts[i] - ts[i - 1]
        if dt <= 1e-6:
            continue
        step = float(np.hypot(*(xy[i] - xy[i - 1])))
        speed = step / dt
        if speed > MAX_HUMAN_SPEED_MS:
            continue  # homography glitch / track jump
        distance += step
        top_speed = max(top_speed, speed)
    return round(float(top_speed), 2), round(float(distance), 1)


def _max_vertical_jump_cm(samples: list[dict],
                          scale_m_per_px: Optional[float]) -> Optional[float]:
    """Max hip rise above the rolling baseline, scaled image px -> cm.

    Method: the hip midpoint's vertical image position dips (rises on screen)
    during a jump while the running median tracks standing height. The max
    (baseline - hip_y) excursion, converted with the court-derived
    meters-per-pixel scale, approximates jump height. Requires pose keypoints
    and a court calibration; returns None otherwise.
    """
    if scale_m_per_px is None:
        return None
    series = [(s["t"], s["hip_y"]) for s in samples if s["hip_y"] is not None]
    if len(series) < SMOOTH_WINDOW * 2:
        return None
    ys = _smooth(np.array([y for _, y in series], dtype=np.float64))

    # Rolling median baseline over ~1.5x the smoothing window each side.
    half = max(SMOOTH_WINDOW, 8)
    best_cm = 0.0
    for i in range(len(ys)):
        lo, hi = max(0, i - half), min(len(ys), i + half + 1)
        baseline = float(np.median(ys[lo:hi]))
        rise_px = baseline - float(ys[i])  # up on screen = smaller y
        if rise_px <= 0:
            continue
        cm = rise_px * scale_m_per_px * 100.0
        best_cm = max(best_cm, cm)
    if best_cm < MIN_JUMP_CM:
        return None
    return round(min(best_cm, MAX_JUMP_CM), 1)


def _avg_release_velocity(ball_track: list[tuple[float, tuple[float, float]]],
                          shot_ts: list[float]) -> Optional[float]:
    """Mean ball speed over the RELEASE_WINDOW_S after each shot attempt."""
    if not ball_track or not shot_ts:
        return None
    speeds = []
    for t0 in shot_ts:
        window = [(t, xy) for t, xy in ball_track if t0 <= t <= t0 + RELEASE_WINDOW_S]
        if len(window) < 2:
            continue
        dist = 0.0
        for i in range(1, len(window)):
            dist += math.hypot(window[i][1][0] - window[i - 1][1][0],
                               window[i][1][1] - window[i - 1][1][1])
        dt = window[-1][0] - window[0][0]
        if dt > 1e-6:
            speeds.append(dist / dt)
    if not speeds:
        return None
    return round(float(np.mean(speeds)), 2)
