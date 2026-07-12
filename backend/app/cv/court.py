"""Court detection and image->court homography.

Strategy: bright/painted court lines are isolated with an adaptive threshold
plus a low-saturation/high-value HSV mask, the dominant boundary contour is
approximated to a quadrilateral (with a Hough-line intersection fallback),
and a homography is computed that maps the visible quad onto a half court
[0, COURT_LENGTH_M / 2] x [0, COURT_WIDTH_M] in meters.

Convention: the image-bottom edge of the quad maps to x = 0 (near baseline)
and the image-top edge maps to x = COURT_LENGTH_M / 2 (far baseline, where
the hoop usually is).
"""
from __future__ import annotations

import math
from typing import Optional, Sequence

import cv2
import numpy as np

from .types import COURT_LENGTH_M, COURT_WIDTH_M, CourtCalibration

HALF_COURT_LENGTH_M = COURT_LENGTH_M / 2.0

# Default court-plane corners for a detected quad, ordered to match image
# corners ordered (top-left, top-right, bottom-right, bottom-left).
DEFAULT_COURT_CORNERS: list[tuple[float, float]] = [
    (HALF_COURT_LENGTH_M, 0.0),
    (HALF_COURT_LENGTH_M, COURT_WIDTH_M),
    (0.0, COURT_WIDTH_M),
    (0.0, 0.0),
]


def _order_corners(pts: np.ndarray) -> np.ndarray:
    """Order 4 points as (top-left, top-right, bottom-right, bottom-left)."""
    pts = np.asarray(pts, dtype=np.float64).reshape(4, 2)
    s = pts.sum(axis=1)
    d = np.diff(pts, axis=1).ravel()  # y - x
    tl = pts[np.argmin(s)]
    br = pts[np.argmax(s)]
    tr = pts[np.argmin(d)]
    bl = pts[np.argmax(d)]
    return np.array([tl, tr, br, bl], dtype=np.float64)


def _line_intersection(l1: tuple[float, float, float, float],
                       l2: tuple[float, float, float, float]) -> Optional[tuple[float, float]]:
    """Intersection of two infinite lines given as segments (x1,y1,x2,y2)."""
    x1, y1, x2, y2 = l1
    x3, y3, x4, y4 = l2
    den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
    if abs(den) < 1e-9:
        return None
    px = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / den
    py = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / den
    return float(px), float(py)


def to_court_xy(calibration: Optional[CourtCalibration],
                image_xy: tuple[float, float]) -> Optional[tuple[float, float]]:
    """Project an image point to court-plane meters via the calibration homography."""
    if calibration is None or calibration.homography is None:
        return None
    h = np.asarray(calibration.homography, dtype=np.float64)
    v = h @ np.array([image_xy[0], image_xy[1], 1.0])
    if abs(v[2]) < 1e-9:
        return None
    return float(v[0] / v[2]), float(v[1] / v[2])


class CourtDetector:
    """Detects the court boundary quad, homography, and (optionally) the hoop."""

    def __init__(self) -> None:
        self._empty = CourtCalibration(
            homography=None, boundary_image_poly=None,
            hoop_image_xy=None, hoop_radius_px=None, confidence=0.0,
        )

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #

    def detect(self, frame_bgr: np.ndarray) -> CourtCalibration:
        """Detect the court in a BGR frame. Never raises; confidence=0 on failure."""
        try:
            return self._detect(frame_bgr)
        except Exception:
            return self._empty

    @staticmethod
    def from_corners(image_corners: Sequence[tuple[float, float]],
                     court_corners: Optional[Sequence[tuple[float, float]]] = None,
                     ) -> CourtCalibration:
        """Manual (tap-to-calibrate) calibration from 4 image corners.

        image_corners may arrive in any order; they are sorted to
        (tl, tr, br, bl) and mapped onto court_corners (default: half court).
        """
        try:
            img = _order_corners(np.asarray(image_corners, dtype=np.float64))
            if court_corners is None:
                crt = np.asarray(DEFAULT_COURT_CORNERS, dtype=np.float64)
            else:
                crt = np.asarray(court_corners, dtype=np.float64).reshape(4, 2)
            h = cv2.getPerspectiveTransform(img.astype(np.float32), crt.astype(np.float32))
            return CourtCalibration(
                homography=[[float(x) for x in row] for row in h],
                boundary_image_poly=[(float(x), float(y)) for x, y in img],
                hoop_image_xy=None,
                hoop_radius_px=None,
                confidence=1.0,
            )
        except Exception:
            return CourtCalibration(homography=None, boundary_image_poly=None, confidence=0.0)

    # ------------------------------------------------------------------ #
    # Internals
    # ------------------------------------------------------------------ #

    def _detect(self, frame_bgr: np.ndarray) -> CourtCalibration:
        if frame_bgr is None or frame_bgr.size == 0 or frame_bgr.ndim != 3:
            return self._empty
        h_img, w_img = frame_bgr.shape[:2]

        line_mask = self._line_mask(frame_bgr)
        quad = self._quad_from_contours(line_mask)
        if quad is None:
            quad = self._quad_from_hough(line_mask, w_img, h_img)
        if quad is None:
            return self._empty

        quad = _order_corners(quad)
        conf = self._confidence(quad, w_img, h_img, line_mask)
        if conf <= 0.0:
            return self._empty

        crt = np.asarray(DEFAULT_COURT_CORNERS, dtype=np.float64)
        homography = cv2.getPerspectiveTransform(
            quad.astype(np.float32), crt.astype(np.float32))

        hoop_xy, hoop_r = self._find_hoop(frame_bgr, quad)
        return CourtCalibration(
            homography=[[float(x) for x in row] for row in homography],
            boundary_image_poly=[(float(x), float(y)) for x, y in quad],
            hoop_image_xy=hoop_xy,
            hoop_radius_px=hoop_r,
            confidence=conf,
        )

    @staticmethod
    def _line_mask(frame_bgr: np.ndarray) -> np.ndarray:
        """Binary mask of bright, low-saturation (painted/white) court lines."""
        gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (5, 5), 0)
        adaptive = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY, 31, -12)
        hsv = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2HSV)
        whiteish = cv2.inRange(hsv, (0, 0, 160), (180, 90, 255))
        mask = cv2.bitwise_and(adaptive, whiteish)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
        return mask

    @staticmethod
    def _quad_from_contours(line_mask: np.ndarray) -> Optional[np.ndarray]:
        """Largest contour in the line mask approximated to a quadrilateral."""
        contours, _ = cv2.findContours(line_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return None
        h, w = line_mask.shape[:2]
        best = max(contours, key=cv2.contourArea)
        if cv2.contourArea(best) < 0.05 * w * h:
            return None
        peri = cv2.arcLength(best, True)
        for eps in (0.02, 0.03, 0.05, 0.08):
            approx = cv2.approxPolyDP(best, eps * peri, True)
            if len(approx) == 4:
                return approx.reshape(4, 2).astype(np.float64)
        # Fall back to the minimum-area rectangle of the contour.
        rect = cv2.minAreaRect(best)
        return cv2.boxPoints(rect).astype(np.float64)

    @staticmethod
    def _quad_from_hough(line_mask: np.ndarray, w_img: int, h_img: int) -> Optional[np.ndarray]:
        """Fallback: cluster Hough segments by angle and intersect the extremes."""
        segs = cv2.HoughLinesP(
            line_mask, 1, math.pi / 180, threshold=60,
            minLineLength=min(w_img, h_img) // 5, maxLineGap=20)
        if segs is None or len(segs) < 4:
            return None
        horiz: list[tuple[float, float, float, float]] = []
        vert: list[tuple[float, float, float, float]] = []
        for seg in segs[:, 0, :]:
            x1, y1, x2, y2 = (float(v) for v in seg)
            ang = abs(math.degrees(math.atan2(y2 - y1, x2 - x1))) % 180
            if ang < 45 or ang > 135:
                horiz.append((x1, y1, x2, y2))
            else:
                vert.append((x1, y1, x2, y2))
        if len(horiz) < 2 or len(vert) < 2:
            return None
        top = min(horiz, key=lambda s: (s[1] + s[3]) / 2)
        bot = max(horiz, key=lambda s: (s[1] + s[3]) / 2)
        left = min(vert, key=lambda s: (s[0] + s[2]) / 2)
        right = max(vert, key=lambda s: (s[0] + s[2]) / 2)
        corners = []
        for pair in ((top, left), (top, right), (bot, right), (bot, left)):
            p = _line_intersection(*pair)
            if p is None:
                return None
            corners.append(p)
        pts = np.asarray(corners, dtype=np.float64)
        if np.any(pts[:, 0] < -0.25 * w_img) or np.any(pts[:, 0] > 1.25 * w_img):
            return None
        if np.any(pts[:, 1] < -0.25 * h_img) or np.any(pts[:, 1] > 1.25 * h_img):
            return None
        return pts

    @staticmethod
    def _confidence(quad: np.ndarray, w_img: int, h_img: int, line_mask: np.ndarray) -> float:
        """Score the quad: reasonable area, convexity, and line-mask support."""
        area = cv2.contourArea(quad.astype(np.float32))
        frac = area / float(w_img * h_img)
        if frac < 0.08 or frac > 0.98:
            return 0.0
        if not cv2.isContourConvex(quad.astype(np.float32).reshape(-1, 1, 2)):
            return 0.0
        # Line support: fraction of the quad perimeter covered by the mask.
        support_hits = 0
        support_total = 0
        for i in range(4):
            p0, p1 = quad[i], quad[(i + 1) % 4]
            n = max(2, int(np.hypot(*(p1 - p0)) // 8))
            for t in np.linspace(0, 1, n):
                x = int(round(p0[0] + t * (p1[0] - p0[0])))
                y = int(round(p0[1] + t * (p1[1] - p0[1])))
                if 0 <= x < w_img and 0 <= y < h_img:
                    support_total += 1
                    y0, y1 = max(0, y - 4), min(h_img, y + 5)
                    x0, x1 = max(0, x - 4), min(w_img, x + 5)
                    if line_mask[y0:y1, x0:x1].any():
                        support_hits += 1
        support = support_hits / support_total if support_total else 0.0
        conf = 0.4 * min(1.0, frac / 0.3) + 0.6 * support
        return float(np.clip(conf, 0.0, 1.0))

    @staticmethod
    def _find_hoop(frame_bgr: np.ndarray, quad: np.ndarray,
                   ) -> tuple[Optional[tuple[float, float]], Optional[float]]:
        """Look for an orange rim blob near the top of the court area."""
        try:
            h_img, w_img = frame_bgr.shape[:2]
            top_y = float(np.min(quad[:, 1]))
            band_y1 = max(0, int(top_y - 0.15 * h_img))
            band_y2 = min(h_img, int(top_y + 0.25 * h_img))
            if band_y2 - band_y1 < 8:
                return None, None
            band = frame_bgr[band_y1:band_y2]
            hsv = cv2.cvtColor(band, cv2.COLOR_BGR2HSV)
            orange = cv2.inRange(hsv, (4, 110, 90), (28, 255, 255))
            orange = cv2.morphologyEx(orange, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
            contours, _ = cv2.findContours(orange, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            cx_court = float(np.mean(quad[:, 0]))
            best: Optional[tuple[float, float, float]] = None  # (score, cx, cy) + r
            best_r = 0.0
            for c in contours:
                (cx, cy), r = cv2.minEnclosingCircle(c)
                if r < 4 or r > 0.08 * w_img:
                    continue
                area = cv2.contourArea(c)
                if area <= 0:
                    continue
                fill = area / (math.pi * r * r)
                if fill < 0.15:  # too sparse to be a rim/ball blob
                    continue
                # Prefer blobs horizontally near the court center and high up.
                score = 1.0 / (1.0 + abs(cx - cx_court) / (0.25 * w_img)) + 0.3 * fill
                if best is None or score > best[0]:
                    best = (score, float(cx), float(cy + band_y1))
                    best_r = float(r)
            if best is None:
                return None, None
            return (best[1], best[2]), best_r
        except Exception:
            return None, None
