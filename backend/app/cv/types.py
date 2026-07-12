"""The CV -> engine/analytics seam.

The CV pipeline turns raw video into a stream of FrameObservation.
The game engine and analytics consume ONLY these types — they never touch
pixels. Keep this file dependency-free (no cv2, no mediapipe) so the engine
can be tested without any CV stack installed.

Coordinate systems:
- image space: pixels, origin top-left of the frame.
- court space: meters, origin at one corner of the court, x along the long
  (baseline-to-baseline) axis [0, COURT_LENGTH_M], y along width
  [0, COURT_WIDTH_M]. Produced by the homography in cv/court.py.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

COURT_LENGTH_M = 28.65  # full court; halfcourt games just use part of it
COURT_WIDTH_M = 15.24
HOOP_HEIGHT_M = 3.048


@dataclass
class BallObservation:
    image_xy: tuple[float, float]
    court_xy: Optional[tuple[float, float]]  # None until court is calibrated
    radius_px: float
    confidence: float
    predicted: bool = False  # True when Kalman-predicted through occlusion


@dataclass
class PoseKeypoint:
    name: str  # e.g. "left_ankle"
    image_xy: tuple[float, float]
    confidence: float


@dataclass
class PlayerObservation:
    track_id: int  # stable across frames
    image_bbox: tuple[float, float, float, float]  # x1, y1, x2, y2
    court_xy: Optional[tuple[float, float]]  # feet position on court plane
    keypoints: list[PoseKeypoint] = field(default_factory=list)
    team: Optional[str] = None  # "a" | "b" once assigned


@dataclass
class CourtCalibration:
    """Homography image->court plane plus detected regions of interest."""
    homography: Optional[list[list[float]]]  # 3x3, None if not yet found
    boundary_image_poly: Optional[list[tuple[float, float]]]  # court outline in image px
    hoop_image_xy: Optional[tuple[float, float]] = None
    hoop_radius_px: Optional[float] = None
    confidence: float = 0.0


@dataclass
class FrameObservation:
    frame_idx: int
    t: float  # seconds from video start
    ball: Optional[BallObservation]
    players: list[PlayerObservation] = field(default_factory=list)
    calibration: Optional[CourtCalibration] = None  # latest known calibration
