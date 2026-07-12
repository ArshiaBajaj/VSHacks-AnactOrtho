"""CV pipeline over a synthetic game video. This file is the ONE place where
importorskip is allowed: the CV stack (and app.cv.synthetic itself) may not
have landed yet, in which case these tests skip instead of failing.
"""
from __future__ import annotations

import importlib
import math
import os

import pytest

np = pytest.importorskip("numpy")
cv2 = pytest.importorskip("cv2")
synthetic = pytest.importorskip("app.cv.synthetic")

from app.cv.types import COURT_LENGTH_M, COURT_WIDTH_M  # noqa: E402

DURATION_S = 8.0
FPS = 30


def _resolve(func_name: str, candidates: list[str]):
    """Find a function across a few plausible module homes; skip if absent."""
    for mod_name in candidates:
        try:
            mod = importlib.import_module(mod_name)
        except Exception:
            continue
        fn = getattr(mod, func_name, None)
        if callable(fn):
            return fn
    pytest.skip(f"{func_name} not found in any of {candidates}")


@pytest.fixture(scope="module")
def synth(tmp_path_factory):
    """8s synthetic game + its ground truth dict, generated once per module."""
    out_dir = tmp_path_factory.mktemp("synth")
    path = str(out_dir / "game.mp4")
    try:
        truth = synthetic.generate_synthetic_game(
            path, duration_s=DURATION_S, fps=FPS, size=(960, 540), seed=42
        )
    except TypeError:
        truth = synthetic.generate_synthetic_game(path, DURATION_S, FPS, (960, 540), 42)
    assert os.path.exists(path) and os.path.getsize(path) > 0, "no video written"
    return path, truth


@pytest.fixture(scope="module")
def pipeline_run(synth):
    pipeline_mod = pytest.importorskip("app.cv.pipeline")
    path, _truth = synth
    pipe = pipeline_mod.VideoPipeline(path)
    observations = list(pipe.frames())
    return pipe, observations


# ---------------------------------------------------------------------------
# Ground truth contract
# ---------------------------------------------------------------------------

def test_ground_truth_keys(synth):
    _, truth = synth
    assert isinstance(truth, dict)
    for key in ("shots", "made", "oob_times", "court_corners_px"):
        assert key in truth, f"ground truth missing {key!r}: has {sorted(truth)}"
    assert len(truth["court_corners_px"]) == 4


# ---------------------------------------------------------------------------
# Pipeline behavior
# ---------------------------------------------------------------------------

def test_pipeline_yields_observations(pipeline_run):
    _, observations = pipeline_run
    assert len(observations) > 0


def test_ball_detected_in_at_least_40pct_of_frames(pipeline_run):
    _, observations = pipeline_run
    detected = sum(1 for o in observations if o.ball is not None)
    rate = detected / len(observations)
    assert rate >= 0.40, f"ball detected in only {rate:.0%} of {len(observations)} frames"


def test_ball_court_xy_within_court_bounds(pipeline_run):
    _, observations = pipeline_run
    margin = 2.0
    checked = 0
    for o in observations:
        if o.ball is not None and o.ball.court_xy is not None:
            x, y = o.ball.court_xy
            checked += 1
            assert -margin <= x <= COURT_LENGTH_M + margin, f"frame {o.frame_idx}: x={x}"
            assert -margin <= y <= COURT_WIDTH_M + margin, f"frame {o.frame_idx}: y={y}"
    assert checked > 0, "no ball observation ever had a court_xy (calibration never landed?)"


def test_pipeline_duration_close_to_truth(pipeline_run):
    pipe, _ = pipeline_run
    assert abs(pipe.duration_s - DURATION_S) <= 0.20 * DURATION_S, (
        f"duration_s={pipe.duration_s}, expected about {DURATION_S}"
    )


# ---------------------------------------------------------------------------
# Court homography from ground-truth corners
# ---------------------------------------------------------------------------

def _map_to_court(detector, court_mod, pt):
    if hasattr(detector, "to_court_xy"):
        try:
            return tuple(detector.to_court_xy(pt))
        except TypeError:
            return tuple(detector.to_court_xy(pt[0], pt[1]))
    fn = getattr(court_mod, "to_court_xy")
    try:
        return tuple(fn(detector, pt))
    except TypeError:
        return tuple(fn(detector, pt[0], pt[1]))


def test_from_corners_maps_corners_to_court_rect(synth):
    court_mod = pytest.importorskip("app.cv.court")
    _, truth = synth
    corners_px = [tuple(map(float, c)) for c in truth["court_corners_px"]]

    if hasattr(court_mod, "CourtDetector") and hasattr(court_mod.CourtDetector, "from_corners"):
        detector = court_mod.CourtDetector.from_corners(corners_px)
    elif hasattr(court_mod, "from_corners"):
        detector = court_mod.from_corners(corners_px)
    else:
        pytest.skip("no from_corners in app.cv.court")

    mapped = [_map_to_court(detector, court_mod, c) for c in corners_px]

    def _rect(length):
        return [(0.0, 0.0), (length, 0.0), (length, COURT_WIDTH_M), (0.0, COURT_WIDTH_M)]

    def _matches(expected, tol=0.5):
        matched_idx = set()
        worst = 0.0
        for mx, my in mapped:
            dists = [math.hypot(mx - ex, my - ey) for ex, ey in expected]
            best = min(range(4), key=lambda i: dists[i])
            worst = max(worst, dists[best])
            matched_idx.add(best)
        return worst <= tol and matched_idx == {0, 1, 2, 3}, worst

    # Both are documented court rects: full court (cv/types.py constants) or
    # half court (cv/court.py: pickup games use [0, L/2] x [0, W]).
    full_ok, full_worst = _matches(_rect(COURT_LENGTH_M))
    half_ok, half_worst = _matches(_rect(COURT_LENGTH_M / 2.0))
    assert full_ok or half_ok, (
        "ground-truth corners must map onto the court rect corners within 0.5m; "
        f"worst error: full-court {full_worst:.2f}m, half-court {half_worst:.2f}m; "
        f"mapped={[(round(x, 2), round(y, 2)) for x, y in mapped]}"
    )


# ---------------------------------------------------------------------------
# Analytics: heatmap binning with known points
# ---------------------------------------------------------------------------

def _call_build_heatmap(fn, points, grid_w, grid_h):
    for call in (
        lambda: fn(points, grid_w=grid_w, grid_h=grid_h),
        lambda: fn(points, grid_w, grid_h),
        lambda: fn(points),
    ):
        try:
            return call()
        except TypeError:
            continue
    pytest.skip("build_heatmap signature not recognized")


def _cells_of(heatmap) -> list[list[int]]:
    if isinstance(heatmap, dict):
        return heatmap["cells"]
    return getattr(heatmap, "cells")


def test_build_heatmap_bins_known_points():
    from app import config

    fn = _resolve("build_heatmap", ["app.analytics", "app.analytics.heatmap", "app.analytics.stats"])
    gw, gh = config.HEATMAP_GRID_W, config.HEATMAP_GRID_H

    # The grid's x extent is documented two ways: full court length
    # (API_CONTRACT.md "court length x width") or half court (pickup games,
    # analytics/heatmap.py). Pick physical points and accept either binning.
    px, py = 5.0, 3.5  # meters, comfortably inside both rects
    qx, qy = 0.2, 0.4
    points = [(px, py)] * 3 + [(qx, qy)]

    heatmap = _call_build_heatmap(fn, points, gw, gh)
    cells = {(c[0], c[1]): c[2] for c in _cells_of(heatmap)}

    def expected_cell(x, y, length):
        return (int(x / (length / gw)), int(y / (COURT_WIDTH_M / gh)))

    p_candidates = {expected_cell(px, py, COURT_LENGTH_M), expected_cell(px, py, COURT_LENGTH_M / 2)}
    q_candidates = {expected_cell(qx, qy, COURT_LENGTH_M), expected_cell(qx, qy, COURT_LENGTH_M / 2)}

    assert any(cells.get(c) == 3 for c in p_candidates), (
        f"3 points at ({px},{py}) must land in one of {p_candidates}; cells={cells}"
    )
    assert any(cells.get(c) == 1 for c in q_candidates), (
        f"1 point at ({qx},{qy}) must land in one of {q_candidates}; cells={cells}"
    )
    assert sum(cells.values()) == 4, "heatmap must not invent or drop points"


# ---------------------------------------------------------------------------
# Highlights: mp4 + jpg written to disk
# ---------------------------------------------------------------------------

def test_extract_highlights_writes_files(synth, tmp_path):
    from app import config
    from app.models import GameEvent, Score

    fn = _resolve(
        "extract_highlights",
        ["app.analytics", "app.analytics.highlights", "app.cv.highlights", "app.workers.processor"],
    )
    path, _truth = synth
    out_dir = tmp_path / "hl"
    out_dir.mkdir()

    events = [
        GameEvent(
            event_id="e_hl1", t=2.0, type="score", team="a", points=2,
            score_after=Score(team_a=2, team_b=0), text="Bucket!",
        ),
        GameEvent(
            event_id="e_hl2", t=5.0, type="score", team="b", points=1,
            score_after=Score(team_a=2, team_b=1), text="Answer back.",
        ),
    ]

    def media_files():
        return {p for p in config.MEDIA_DIR.rglob("*") if p.suffix in (".mp4", ".jpg")}

    before = media_files()
    called = False
    for call in (
        lambda: fn(path, events, out_dir, "g_hltest"),
        lambda: fn(path, events, str(out_dir)),
        lambda: fn(video_path=path, events=events, out_dir=str(out_dir)),
        lambda: fn("g_hltest", path, events),
        lambda: fn(path, events),
    ):
        try:
            call()
            called = True
            break
        except TypeError:
            continue
    if not called:
        pytest.skip("extract_highlights signature not recognized")

    mp4s = list(out_dir.rglob("*.mp4"))
    jpgs = list(out_dir.rglob("*.jpg"))
    if not (mp4s and jpgs):
        # Implementation may write under MEDIA_DIR instead of taking out_dir.
        new = media_files() - before
        mp4s = mp4s or [p for p in new if p.suffix == ".mp4"]
        jpgs = jpgs or [p for p in new if p.suffix == ".jpg"]

    assert mp4s, "extract_highlights wrote no highlight mp4"
    assert jpgs, "extract_highlights wrote no thumbnail jpg"
    assert all(p.stat().st_size > 0 for p in mp4s + jpgs)
