"""Video processing orchestrator: frames -> FrameObservation stream.

Reads a video with cv2.VideoCapture, downsamples to config.PROCESS_FPS /
PROCESS_MAX_WIDTH, and runs CourtDetector (re-detecting every ~2 seconds
until confidence > 0.5, then holding), BallTracker, and PoseEstimator.
"""
from __future__ import annotations

from typing import Iterator, Optional

import cv2
import numpy as np

from .. import config
from .ball import BallTracker
from .court import CourtDetector
from .pose import PoseEstimator
from .types import CourtCalibration, FrameObservation

COURT_REDETECT_S = 2.0
COURT_HOLD_CONFIDENCE = 0.5


class VideoPipeline:
    """Iterates a video file and yields per-frame CV observations."""

    def __init__(self, video_path: str, enable_pose: bool = True) -> None:
        self.video_path = str(video_path)
        cap = cv2.VideoCapture(self.video_path)
        if not cap.isOpened():
            cap.release()
            raise ValueError("unreadable_video")
        src_fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        # Validate we can actually decode at least one frame.
        ok, first = cap.read()
        if not ok or first is None:
            cap.release()
            raise ValueError("unreadable_video")
        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
        self._cap = cap

        self.src_fps = float(src_fps) if src_fps and src_fps > 0 else 30.0
        self._step = max(1, int(round(self.src_fps / config.PROCESS_FPS)))
        self.fps = self.src_fps / self._step
        self.frame_count = max(frame_count, 0)
        self.duration_s = self.frame_count / self.src_fps if self.frame_count else 0.0
        self.progress = 0.0

        src_w = first.shape[1]
        self._scale = min(1.0, config.PROCESS_MAX_WIDTH / src_w) if src_w else 1.0

        self.court = CourtDetector()
        self.ball = BallTracker()
        self.pose = PoseEstimator() if enable_pose else None
        self.calibration: Optional[CourtCalibration] = None
        self._last_detect_t = -1e9

    # ------------------------------------------------------------------ #

    def frames(self) -> Iterator[FrameObservation]:
        """Yield one FrameObservation per processed (downsampled) frame."""
        src_idx = 0
        out_idx = 0
        try:
            while True:
                ok, frame = self._cap.read()
                if not ok or frame is None:
                    break
                if src_idx % self._step != 0:
                    src_idx += 1
                    continue
                t = src_idx / self.src_fps
                frame = self._resize(frame)

                self._maybe_detect_court(frame, t)
                self.ball.set_calibration(self.calibration)
                ball_obs = self.ball.update(frame, t)

                players = []
                if self.pose is not None:
                    self.pose.set_calibration(self.calibration)
                    players = self.pose.estimate(frame)

                if self.frame_count:
                    self.progress = min(1.0, (src_idx + 1) / self.frame_count)

                yield FrameObservation(
                    frame_idx=out_idx,
                    t=t,
                    ball=ball_obs,
                    players=players,
                    calibration=self.calibration,
                )
                out_idx += 1
                src_idx += 1
        finally:
            self.progress = 1.0
            self.close()

    def close(self) -> None:
        if self._cap is not None:
            self._cap.release()
        if self.pose is not None:
            self.pose.close()

    # ------------------------------------------------------------------ #

    def _resize(self, frame: np.ndarray) -> np.ndarray:
        if self._scale >= 0.999:
            return frame
        new_w = int(frame.shape[1] * self._scale)
        new_h = int(frame.shape[0] * self._scale)
        return cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_AREA)

    def _maybe_detect_court(self, frame: np.ndarray, t: float) -> None:
        """Re-detect every ~2s until confident, then hold the calibration."""
        held = self.calibration is not None and self.calibration.confidence > COURT_HOLD_CONFIDENCE
        if held:
            return
        if t - self._last_detect_t < COURT_REDETECT_S and self.calibration is not None:
            return
        self._last_detect_t = t
        cal = self.court.detect(frame)
        # Keep the best calibration seen so far.
        if self.calibration is None or cal.confidence > self.calibration.confidence:
            self.calibration = cal
