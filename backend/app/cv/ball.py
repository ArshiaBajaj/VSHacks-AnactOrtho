"""Basketball detection and Kalman tracking.

Detection combines an HSV orange mask, contour circularity, and a
frame-differencing motion weight so a moving round orange object beats
static orange things (rims, court paint). A constant-velocity Kalman
filter smooths the track and predicts through occlusions.
"""
from __future__ import annotations

import math
from typing import Optional

import cv2
import numpy as np

from .court import to_court_xy
from .types import BallObservation, CourtCalibration

# HSV orange range for a basketball (avoids pure red at hue ~0).
ORANGE_LO = (4, 110, 80)
ORANGE_HI = (28, 255, 255)

MIN_RADIUS_PX = 3.0
MAX_RADIUS_FRAC = 0.06     # of frame width
MIN_CIRCULARITY = 0.55
MAX_MISSES = 15            # frames of pure prediction before dropping the track
GATE_BASE_PX = 60.0        # association gate around the Kalman prediction


class BallTracker:
    """Per-frame basketball detector + constant-velocity Kalman tracker."""

    def __init__(self) -> None:
        self._kf: Optional[cv2.KalmanFilter] = None
        self._misses = 0
        self._confidence = 0.0
        self._radius_px = 8.0
        self._prev_gray: Optional[np.ndarray] = None
        self._calibration: Optional[CourtCalibration] = None

    def set_calibration(self, calibration: Optional[CourtCalibration]) -> None:
        """Provide the latest court calibration used to fill court_xy."""
        self._calibration = calibration

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #

    def update(self, frame_bgr: np.ndarray, t: float) -> Optional[BallObservation]:
        """Process one frame; return the ball observation or None."""
        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
        motion = self._motion_mask(gray)
        self._prev_gray = gray

        detection = self._detect(frame_bgr, motion)

        if detection is not None:
            (cx, cy), r, det_conf = detection
            self._radius_px = 0.6 * self._radius_px + 0.4 * r
            if self._kf is None:
                self._kf = self._make_kalman(cx, cy)
            else:
                self._kf.predict()
                self._kf.correct(np.array([[cx], [cy]], dtype=np.float32))
            self._misses = 0
            self._confidence = float(np.clip(0.5 * self._confidence + 0.5 * det_conf, 0.1, 1.0))
            sx, sy = self._state_xy()
            return self._observation((sx, sy), self._radius_px, self._confidence, predicted=False)

        # No detection this frame: predict through occlusion.
        if self._kf is None:
            return None
        self._misses += 1
        if self._misses > MAX_MISSES:
            self._kf = None
            self._confidence = 0.0
            return None
        pred = self._kf.predict()
        px, py = float(pred[0, 0]), float(pred[1, 0])
        h, w = frame_bgr.shape[:2]
        if not (-w * 0.1 <= px <= w * 1.1 and -h * 0.1 <= py <= h * 1.1):
            self._kf = None
            self._confidence = 0.0
            return None
        self._confidence *= 0.85
        return self._observation((px, py), self._radius_px, self._confidence, predicted=True)

    # ------------------------------------------------------------------ #
    # Internals
    # ------------------------------------------------------------------ #

    def _observation(self, image_xy: tuple[float, float], radius: float,
                     conf: float, predicted: bool) -> BallObservation:
        return BallObservation(
            image_xy=(float(image_xy[0]), float(image_xy[1])),
            court_xy=to_court_xy(self._calibration, image_xy),
            radius_px=float(radius),
            confidence=float(conf),
            predicted=predicted,
        )

    def _state_xy(self) -> tuple[float, float]:
        assert self._kf is not None
        post = self._kf.statePost
        return float(post[0, 0]), float(post[1, 0])

    @staticmethod
    def _make_kalman(x: float, y: float) -> cv2.KalmanFilter:
        """4-state (x, y, vx, vy) constant-velocity Kalman filter."""
        kf = cv2.KalmanFilter(4, 2)
        kf.transitionMatrix = np.array(
            [[1, 0, 1, 0],
             [0, 1, 0, 1],
             [0, 0, 1, 0],
             [0, 0, 0, 1]], dtype=np.float32)
        kf.measurementMatrix = np.array(
            [[1, 0, 0, 0],
             [0, 1, 0, 0]], dtype=np.float32)
        # A basketball accelerates hard (bounces, shots), so the constant
        # velocity model needs high process noise to avoid lagging the ball.
        kf.processNoiseCov = np.diag([1.0, 1.0, 10.0, 10.0]).astype(np.float32)
        kf.measurementNoiseCov = (np.eye(2) * 1.0).astype(np.float32)
        kf.errorCovPost = (np.eye(4) * 10.0).astype(np.float32)
        kf.statePost = np.array([[x], [y], [0], [0]], dtype=np.float32)
        return kf

    def _motion_mask(self, gray: np.ndarray) -> Optional[np.ndarray]:
        if self._prev_gray is None or self._prev_gray.shape != gray.shape:
            return None
        diff = cv2.absdiff(gray, self._prev_gray)
        _, mask = cv2.threshold(diff, 12, 255, cv2.THRESH_BINARY)
        return cv2.dilate(mask, np.ones((5, 5), np.uint8))

    def _detect(self, frame_bgr: np.ndarray, motion: Optional[np.ndarray],
                ) -> Optional[tuple[tuple[float, float], float, float]]:
        """Best orange-round-moving candidate: ((cx, cy), radius, confidence)."""
        h, w = frame_bgr.shape[:2]
        hsv = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2HSV)
        mask = cv2.inRange(hsv, ORANGE_LO, ORANGE_HI)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))

        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        max_r = MAX_RADIUS_FRAC * w
        pred_xy = self._predicted_xy()

        best: Optional[tuple[float, tuple[float, float], float]] = None  # score, xy, r
        for c in contours:
            area = cv2.contourArea(c)
            if area < math.pi * MIN_RADIUS_PX ** 2:
                continue
            (cx, cy), r = cv2.minEnclosingCircle(c)
            if r < MIN_RADIUS_PX or r > max_r:
                continue
            peri = cv2.arcLength(c, True)
            if peri <= 0:
                continue
            circularity = 4.0 * math.pi * area / (peri * peri)
            fill = area / (math.pi * r * r)
            if circularity < MIN_CIRCULARITY or fill < 0.5:
                continue

            motion_frac = self._motion_fraction(motion, cx, cy, r)
            score = circularity * (0.3 + 0.7 * motion_frac)

            # Suppress the (static) rim: an orange circle near the calibrated
            # hoop only counts as the ball if it is actually moving.
            if self._calibration is not None and self._calibration.hoop_image_xy is not None:
                hx, hy = self._calibration.hoop_image_xy
                hr = self._calibration.hoop_radius_px or 12.0
                if math.hypot(cx - hx, cy - hy) < 2.5 * hr:
                    if motion is not None and motion_frac < 0.15:
                        continue
                    score *= 0.25  # no motion evidence yet: strong penalty

            if pred_xy is not None:
                dist = math.hypot(cx - pred_xy[0], cy - pred_xy[1])
                gate = GATE_BASE_PX + 8.0 * self._misses
                if dist > 4.0 * gate:
                    continue
                score /= (1.0 + dist / gate)

            if best is None or score > best[0]:
                best = (score, (float(cx), float(cy)), float(r))

        if best is None:
            return None
        score, xy, r = best
        # A static candidate (e.g. the rim) only survives if nothing moved and
        # it is still tolerably round; give it low confidence.
        conf = float(np.clip(score, 0.15, 1.0))
        return xy, r, conf

    def _predicted_xy(self) -> Optional[tuple[float, float]]:
        if self._kf is None:
            return None
        pre = self._kf.transitionMatrix @ self._kf.statePost
        return float(pre[0, 0]), float(pre[1, 0])

    @staticmethod
    def _motion_fraction(motion: Optional[np.ndarray], cx: float, cy: float, r: float) -> float:
        """Fraction of the candidate disk that changed since the last frame."""
        if motion is None:
            return 0.5  # neutral when we have no motion evidence yet
        h, w = motion.shape[:2]
        x0 = max(0, int(cx - r)); x1 = min(w, int(cx + r) + 1)
        y0 = max(0, int(cy - r)); y1 = min(h, int(cy + r) + 1)
        if x1 <= x0 or y1 <= y0:
            return 0.0
        patch = motion[y0:y1, x0:x1]
        return float(np.count_nonzero(patch)) / patch.size
