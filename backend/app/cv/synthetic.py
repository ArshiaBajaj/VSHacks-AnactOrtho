"""Synthetic half-court game video generator for tests and the sample game.

Draws a tan half court with white boundary lines on a dark green background,
an orange hoop ring with a white backboard, an orange ball running scripted
plays (dribble runs, arcing shots that alternate made/missed, one
out-of-bounds roll), and two rectangle "players" (red team vs blue team)
that shadow the ball. Deterministic given the seed. Returns ground truth so
tests can assert the pipeline approximately recovers it.
"""
from __future__ import annotations

import math
from pathlib import Path
from typing import Callable

import cv2
import numpy as np

BG_COLOR = (35, 85, 35)        # dark green, BGR
COURT_COLOR = (150, 190, 215)  # tan (low saturation, hue near orange but S~77)
LINE_COLOR = (255, 255, 255)
BALL_COLOR = (0, 140, 255)     # saturated orange
HOOP_COLOR = (0, 130, 250)
BACKBOARD_COLOR = (245, 245, 245)
TEAM_A_COLOR = (30, 30, 210)   # red
TEAM_B_COLOR = (210, 120, 30)  # blue

BALL_RADIUS = 11
HOOP_RADIUS = 14

Segment = tuple[float, float, Callable[[float], tuple[float, float]]]


def generate_synthetic_game(out_path: str, duration_s: float = 20.0, fps: int = 30,
                            size: tuple[int, int] = (960, 540), seed: int = 42) -> dict:
    """Render a synthetic game video to out_path; return ground truth.

    Returns {"shots": [t...], "made": [bool...], "oob_times": [t...],
    "court_corners_px": [(x, y) x4 as tl, tr, br, bl], "hoop_px": (x, y)}.
    """
    w, h = size
    rng = np.random.default_rng(seed)

    corners = _court_corners(w, h)
    hoop = (0.50 * w, 0.12 * h)
    ground_y = 0.75 * h

    segments, truth = _build_script(duration_s, w, h, hoop, ground_y, rng)
    truth["court_corners_px"] = [(float(x), float(y)) for x, y in corners]
    truth["hoop_px"] = (float(hoop[0]), float(hoop[1]))

    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    writer = cv2.VideoWriter(str(out_path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
    if not writer.isOpened():
        raise RuntimeError(f"could not open video writer for {out_path}")

    n_frames = int(round(duration_s * fps))
    lag = 0.3  # players trail the ball by this many seconds
    try:
        for i in range(n_frames):
            t = i / fps
            ball = _ball_at(segments, t, ground_y)
            trail = _ball_at(segments, max(0.0, t - lag), ground_y)
            frame = _draw_frame(w, h, corners, hoop, ball, trail)
            writer.write(frame)
    finally:
        writer.release()
    return truth


# ---------------------------------------------------------------------- #
# Script (ball choreography)
# ---------------------------------------------------------------------- #

def _build_script(duration_s: float, w: int, h: int, hoop: tuple[float, float],
                  ground_y: float, rng: np.random.Generator,
                  ) -> tuple[list[Segment], dict]:
    spots = [0.30, 0.62, 0.42, 0.70, 0.35, 0.58]
    segments: list[Segment] = []
    truth: dict = {"shots": [], "made": [], "oob_times": []}

    t = 0.0
    pos = (0.30 * w, ground_y)
    made_next = True
    spot_i = 0
    oob_done = False

    while t < duration_s:
        # Dribble run to the next spot.
        target = (spots[spot_i % len(spots)] * w, ground_y)
        spot_i += 1
        dur = 1.6
        segments.append(_dribble_seg(t, dur, pos, target, ground_y))
        t += dur
        pos = target

        # One out-of-bounds roll around mid-video.
        if not oob_done and t > 0.45 * duration_s and t + 1.4 < duration_s:
            dur = 1.2
            end = (0.02 * w, 0.88 * h)
            segments.append(_roll_seg(t, dur, pos, end))
            truth["oob_times"].append(round(t + 0.8 * dur, 2))
            t += dur
            pos = (0.25 * w, ground_y)  # ball brought back into play
            oob_done = True
            continue

        if t + 1.4 > duration_s:
            break

        # Shot: arc to the hoop, alternating made/missed.
        flight = 0.9
        truth["shots"].append(round(t, 2))
        truth["made"].append(bool(made_next))
        segments.append(_arc_seg(t, flight, pos, hoop, arc_h=0.28 * h))
        t += flight
        if made_next:
            dur = 0.5
            end = (hoop[0] + float(rng.uniform(-20, 20)), ground_y)
            segments.append(_fall_seg(t, dur, hoop, end))
        else:
            dur = 0.7
            dx = float(rng.choice([-1.0, 1.0]) * rng.uniform(80, 140))
            end = (hoop[0] + dx, ground_y)
            segments.append(_fall_seg(t, dur, hoop, end))
        t += dur
        pos = end
        made_next = not made_next

    return segments, truth


def _dribble_seg(t0: float, dur: float, p0: tuple[float, float],
                 p1: tuple[float, float], ground_y: float) -> Segment:
    def fn(t: float) -> tuple[float, float]:
        s = (t - t0) / dur
        x = p0[0] + (p1[0] - p0[0]) * s
        bounce = abs(math.sin(2 * math.pi * 2.2 * (t - t0))) * 40.0
        return x, ground_y - bounce
    return (t0, t0 + dur, fn)


def _arc_seg(t0: float, dur: float, p0: tuple[float, float],
             p1: tuple[float, float], arc_h: float) -> Segment:
    def fn(t: float) -> tuple[float, float]:
        s = (t - t0) / dur
        x = p0[0] + (p1[0] - p0[0]) * s
        y = p0[1] + (p1[1] - p0[1]) * s - 4.0 * arc_h * s * (1.0 - s)
        return x, y
    return (t0, t0 + dur, fn)


def _fall_seg(t0: float, dur: float, p0: tuple[float, float],
              p1: tuple[float, float]) -> Segment:
    def fn(t: float) -> tuple[float, float]:
        s = (t - t0) / dur
        x = p0[0] + (p1[0] - p0[0]) * s
        y = p0[1] + (p1[1] - p0[1]) * (s * s)  # accelerating fall
        return x, y
    return (t0, t0 + dur, fn)


def _roll_seg(t0: float, dur: float, p0: tuple[float, float],
              p1: tuple[float, float]) -> Segment:
    def fn(t: float) -> tuple[float, float]:
        s = (t - t0) / dur
        x = p0[0] + (p1[0] - p0[0]) * s
        y = p0[1] + (p1[1] - p0[1]) * s + 3.0 * math.sin(10.0 * s)
        return x, y
    return (t0, t0 + dur, fn)


def _ball_at(segments: list[Segment], t: float, ground_y: float) -> tuple[float, float]:
    for t0, t1, fn in segments:
        if t0 <= t < t1:
            return fn(t)
    if segments:
        t0, t1, fn = segments[-1]
        if t >= t1:  # past the script: dribble in place at the last spot
            x, _ = fn(t1 - 1e-3)
            bounce = abs(math.sin(2 * math.pi * 2.2 * (t - t1))) * 40.0
            return x, ground_y - bounce
        return segments[0][2](segments[0][0])
    return (0.0, ground_y)


# ---------------------------------------------------------------------- #
# Rendering
# ---------------------------------------------------------------------- #

def _court_corners(w: int, h: int) -> list[tuple[float, float]]:
    """Perspective trapezoid: tl, tr, br, bl."""
    return [
        (0.22 * w, 0.14 * h),
        (0.78 * w, 0.14 * h),
        (0.94 * w, 0.92 * h),
        (0.06 * w, 0.92 * h),
    ]


def _draw_frame(w: int, h: int, corners: list[tuple[float, float]],
                hoop: tuple[float, float], ball: tuple[float, float],
                trail: tuple[float, float]) -> np.ndarray:
    frame = np.full((h, w, 3), BG_COLOR, dtype=np.uint8)
    quad = np.array(corners, dtype=np.int32)
    cv2.fillPoly(frame, [quad], COURT_COLOR)
    cv2.polylines(frame, [quad], isClosed=True, color=LINE_COLOR, thickness=5)

    # Backboard + hoop ring at the far end (above the court's top edge).
    hx, hy = int(hoop[0]), int(hoop[1])
    cv2.rectangle(frame, (hx - 40, hy - 30), (hx + 40, hy - 12), BACKBOARD_COLOR, -1)
    cv2.circle(frame, (hx, hy), HOOP_RADIUS, HOOP_COLOR, 3)

    # Players (rectangles) shadow the ball with an offset; red leads, blue trails.
    _draw_player(frame, w, h, (ball[0] - 0.06 * w, ball[1] + 0.04 * h), TEAM_A_COLOR)
    _draw_player(frame, w, h, (trail[0] + 0.06 * w, trail[1] + 0.05 * h), TEAM_B_COLOR)

    # Ball on top.
    cv2.circle(frame, (int(round(ball[0])), int(round(ball[1]))), BALL_RADIUS, BALL_COLOR, -1)
    return frame


def _draw_player(frame: np.ndarray, w: int, h: int,
                 pos: tuple[float, float], color: tuple[int, int, int]) -> None:
    px = float(np.clip(pos[0], 0.08 * w, 0.92 * w))
    py = float(np.clip(pos[1], 0.45 * h, 0.88 * h))
    x0, y0 = int(px - 15), int(py - 55)
    x1, y1 = int(px + 15), int(py + 5)
    cv2.rectangle(frame, (x0, y0), (x1, y1), color, -1)
    # simple "head" (kept desaturated so it is not ball-colored)
    cv2.circle(frame, (int(px), y0 - 8), 8, (150, 170, 190), -1)


# ---------------------------------------------------------------------- #
# Self-check
# ---------------------------------------------------------------------- #

if __name__ == "__main__":
    import tempfile

    from .pipeline import VideoPipeline

    out = Path(tempfile.gettempdir()) / "courtvision_synth_check.mp4"
    truth = generate_synthetic_game(str(out), duration_s=5.0, fps=30, size=(960, 540))
    print(f"wrote {out} ({out.stat().st_size} bytes)")
    print(f"ground truth: shots={truth['shots']} made={truth['made']} "
          f"oob={truth['oob_times']}")

    pipe = VideoPipeline(str(out))
    n = 0
    ball_frames = 0
    predicted_frames = 0
    court_frames = 0
    court_xy_frames = 0
    for fo in pipe.frames():
        n += 1
        if fo.ball is not None:
            ball_frames += 1
            if fo.ball.predicted:
                predicted_frames += 1
            if fo.ball.court_xy is not None:
                court_xy_frames += 1
        if fo.calibration is not None and fo.calibration.confidence > 0.5:
            court_frames += 1

    frac = ball_frames / n if n else 0.0
    print(f"frames processed: {n}")
    print(f"ball observed: {ball_frames} ({frac:.0%}), predicted-only: {predicted_frames}")
    print(f"ball with court_xy: {court_xy_frames}")
    print(f"frames with confident court calibration: {court_frames}")
    cal = pipe.calibration
    if cal is not None:
        print(f"calibration confidence: {cal.confidence:.2f}, "
              f"hoop: {cal.hoop_image_xy}, corners: {cal.boundary_image_poly}")
    ok = frac > 0.5 and court_frames > 0
    print("SELF-CHECK:", "PASS" if ok else "FAIL")
