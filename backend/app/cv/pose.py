"""Player pose estimation via MediaPipe with graceful degradation.

Supports both MediaPipe APIs:
- legacy ``mp.solutions.pose`` (single person) when present;
- the Tasks API ``PoseLandmarker`` (mediapipe >= 0.10.x without solutions),
  run with num_poses > 1 for simple multi-person support. The Tasks model
  file is cached under config.DATA_DIR / "models" and downloaded on first
  use (override with the COURTVISION_POSE_MODEL env var).

If import, model acquisition, or init fails, available=False and
estimate() returns []. Track ids stay stable across frames via
nearest-centroid matching; players are assigned to team "a"/"b" by
clustering mean torso (jersey) hue.
"""
from __future__ import annotations

import os
from typing import Optional

import numpy as np

from .. import config
from .court import to_court_xy
from .types import CourtCalibration, PlayerObservation, PoseKeypoint

MATCH_MAX_DIST_FRAC = 0.15   # of frame diagonal, for track association
TRACK_TTL_FRAMES = 30        # drop a track after this many unseen frames
MIN_LANDMARK_VIS = 0.3
MAX_POSES = 4

POSE_MODEL_URL = ("https://storage.googleapis.com/mediapipe-models/pose_landmarker/"
                  "pose_landmarker_lite/float16/latest/pose_landmarker_lite.task")

# The 33 MediaPipe pose landmarks, in output order.
POSE_LANDMARK_NAMES = [
    "nose", "left_eye_inner", "left_eye", "left_eye_outer", "right_eye_inner",
    "right_eye", "right_eye_outer", "left_ear", "right_ear", "mouth_left",
    "mouth_right", "left_shoulder", "right_shoulder", "left_elbow",
    "right_elbow", "left_wrist", "right_wrist", "left_pinky", "right_pinky",
    "left_index", "right_index", "left_thumb", "right_thumb", "left_hip",
    "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle",
    "left_heel", "right_heel", "left_foot_index", "right_foot_index",
]


class PoseEstimator:
    """Wraps mediapipe pose; available=False (and estimate() -> []) if it fails."""

    def __init__(self, model_complexity: int = 1) -> None:
        self.available = False
        self._backend: Optional[str] = None  # "solutions" | "tasks"
        self._pose = None
        self._landmarker = None
        self._mp = None
        self._ts_ms = 0
        try:
            import mediapipe as mp  # lazy: heavy import, optional dependency
            self._mp = mp
            if hasattr(mp, "solutions"):
                self._pose = mp.solutions.pose.Pose(
                    static_image_mode=False,
                    model_complexity=model_complexity,
                    enable_segmentation=False,
                    min_detection_confidence=0.5,
                    min_tracking_confidence=0.5,
                )
                self._backend = "solutions"
            else:
                self._init_tasks_backend()
                self._backend = "tasks"
            self.available = True
        except Exception:
            self._pose = None
            self._landmarker = None

        self._calibration: Optional[CourtCalibration] = None
        # track_id -> {"centroid": (x, y), "age": frames_since_seen, "hue": mean_hue}
        self._tracks: dict[int, dict] = {}
        self._next_id = 0
        self._hue_samples: list[tuple[int, float]] = []  # (track_id, hue)

    def _init_tasks_backend(self) -> None:
        from mediapipe.tasks import python as mp_tasks
        from mediapipe.tasks.python import vision
        model_path = self._ensure_model()
        options = vision.PoseLandmarkerOptions(
            base_options=mp_tasks.BaseOptions(model_asset_path=str(model_path)),
            running_mode=vision.RunningMode.VIDEO,
            num_poses=MAX_POSES,
            min_pose_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self._landmarker = vision.PoseLandmarker.create_from_options(options)

    @staticmethod
    def _ensure_model() -> str:
        """Locate (or download once) the Tasks pose model file."""
        env_path = os.environ.get("COURTVISION_POSE_MODEL")
        if env_path and os.path.isfile(env_path):
            return env_path
        cache = config.DATA_DIR / "models" / "pose_landmarker_lite.task"
        if cache.is_file() and cache.stat().st_size > 0:
            return str(cache)
        cache.parent.mkdir(parents=True, exist_ok=True)
        import urllib.request
        tmp = cache.with_suffix(".task.part")
        with urllib.request.urlopen(POSE_MODEL_URL, timeout=30) as resp, open(tmp, "wb") as f:
            f.write(resp.read())
        tmp.replace(cache)
        return str(cache)

    def set_calibration(self, calibration: Optional[CourtCalibration]) -> None:
        self._calibration = calibration

    def close(self) -> None:
        for obj in (self._pose, self._landmarker):
            if obj is not None:
                try:
                    obj.close()
                except Exception:
                    pass

    # ------------------------------------------------------------------ #
    # Public API
    # ------------------------------------------------------------------ #

    def estimate(self, frame_bgr: np.ndarray) -> list[PlayerObservation]:
        """Return player observations for this frame ([] when unavailable)."""
        self._age_tracks()
        if not self.available:
            return []
        try:
            people = self._detect_people(frame_bgr)
        except Exception:
            return []

        h, w = frame_bgr.shape[:2]
        diag = float(np.hypot(w, h))
        detections = []
        for keypoints in people:
            visible = [k for k in keypoints if k.confidence >= MIN_LANDMARK_VIS]
            if len(visible) < 4:
                continue
            xs = [k.image_xy[0] for k in visible]
            ys = [k.image_xy[1] for k in visible]
            bbox = (min(xs), min(ys), max(xs), max(ys))
            centroid = ((bbox[0] + bbox[2]) / 2.0, (bbox[1] + bbox[3]) / 2.0)
            detections.append((centroid, bbox, keypoints))

        track_ids = self._match_tracks([d[0] for d in detections], diag)

        players: list[PlayerObservation] = []
        for (centroid, bbox, keypoints), track_id in zip(detections, track_ids):
            players.append(PlayerObservation(
                track_id=track_id,
                image_bbox=tuple(float(v) for v in bbox),
                court_xy=self._ankle_court_xy(keypoints),
                keypoints=keypoints,
                team=self._assign_team(frame_bgr, keypoints, bbox, track_id),
            ))
        return players

    # ------------------------------------------------------------------ #
    # Backends
    # ------------------------------------------------------------------ #

    def _detect_people(self, frame_bgr: np.ndarray) -> list[list[PoseKeypoint]]:
        """Run mediapipe; return one keypoint list per detected person."""
        import cv2
        h, w = frame_bgr.shape[:2]
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)

        if self._backend == "solutions":
            result = self._pose.process(rgb)
            if result is None or result.pose_landmarks is None:
                return []
            kps = [PoseKeypoint(name=name,
                                image_xy=(float(lm.x * w), float(lm.y * h)),
                                confidence=float(lm.visibility))
                   for name, lm in zip(POSE_LANDMARK_NAMES, result.pose_landmarks.landmark)]
            return [kps]

        # tasks backend
        mp = self._mp
        image = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
        self._ts_ms += 33  # strictly increasing timestamps for VIDEO mode
        result = self._landmarker.detect_for_video(image, self._ts_ms)
        people = []
        for landmarks in (result.pose_landmarks or []):
            kps = []
            for name, lm in zip(POSE_LANDMARK_NAMES, landmarks):
                conf = lm.visibility if lm.visibility else (lm.presence or 0.9)
                kps.append(PoseKeypoint(name=name,
                                        image_xy=(float(lm.x * w), float(lm.y * h)),
                                        confidence=float(conf)))
            people.append(kps)
        return people

    # ------------------------------------------------------------------ #
    # Tracking
    # ------------------------------------------------------------------ #

    def _age_tracks(self) -> None:
        stale = []
        for tid, tr in self._tracks.items():
            tr["age"] += 1
            if tr["age"] > TRACK_TTL_FRAMES:
                stale.append(tid)
        for tid in stale:
            del self._tracks[tid]

    def _match_tracks(self, centroids: list[tuple[float, float]], diag: float) -> list[int]:
        """Greedy nearest-centroid assignment of detections to existing tracks."""
        max_dist = MATCH_MAX_DIST_FRAC * diag
        pairs = []  # (dist, det_idx, track_id)
        for i, c in enumerate(centroids):
            for tid, tr in self._tracks.items():
                d = float(np.hypot(c[0] - tr["centroid"][0], c[1] - tr["centroid"][1]))
                if d <= max_dist:
                    pairs.append((d, i, tid))
        pairs.sort()
        assigned: dict[int, int] = {}
        used_tracks: set[int] = set()
        for d, i, tid in pairs:
            if i in assigned or tid in used_tracks:
                continue
            assigned[i] = tid
            used_tracks.add(tid)

        out: list[int] = []
        for i, c in enumerate(centroids):
            tid = assigned.get(i)
            if tid is None:
                tid = self._next_id
                self._next_id += 1
                self._tracks[tid] = {"centroid": c, "age": 0, "hue": None}
            tr = self._tracks[tid]
            tr["centroid"] = c
            tr["age"] = 0
            out.append(tid)
        return out

    def _ankle_court_xy(self, keypoints: list[PoseKeypoint]) -> Optional[tuple[float, float]]:
        by_name = {k.name: k for k in keypoints}
        ankles = [by_name.get("left_ankle"), by_name.get("right_ankle")]
        pts = [a.image_xy for a in ankles if a is not None and a.confidence >= MIN_LANDMARK_VIS]
        if not pts:
            return None
        mid = (sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))
        return to_court_xy(self._calibration, mid)

    # ------------------------------------------------------------------ #
    # Team assignment
    # ------------------------------------------------------------------ #

    def _assign_team(self, frame_bgr: np.ndarray, keypoints: list[PoseKeypoint],
                     bbox: tuple[float, float, float, float], track_id: int,
                     ) -> Optional[str]:
        hue = self._torso_hue(frame_bgr, keypoints, bbox)
        if hue is None:
            hue = self._tracks.get(track_id, {}).get("hue")
            if hue is None:
                return None
        else:
            prev = self._tracks[track_id].get("hue")
            hue = hue if prev is None else 0.7 * prev + 0.3 * hue
            self._tracks[track_id]["hue"] = hue
            self._hue_samples.append((track_id, hue))
            if len(self._hue_samples) > 400:
                self._hue_samples = self._hue_samples[-400:]

        hues = np.array([h for _, h in self._hue_samples], dtype=np.float32)
        if len(hues) < 2 or float(hues.max() - hues.min()) < 8.0:
            return "a"  # only one jersey color observed so far
        try:
            import cv2
            criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1.0)
            _, _, centers = cv2.kmeans(
                hues.reshape(-1, 1), 2, None, criteria, 3, cv2.KMEANS_PP_CENTERS)
            c = sorted(float(v) for v in centers.ravel())
            return "a" if abs(hue - c[0]) <= abs(hue - c[1]) else "b"
        except Exception:
            mid = float(np.median(hues))
            return "a" if hue <= mid else "b"

    @staticmethod
    def _torso_hue(frame_bgr: np.ndarray, keypoints: list[PoseKeypoint],
                   bbox: tuple[float, float, float, float]) -> Optional[float]:
        """Mean hue of the torso region (shoulders-to-hips box, jersey area)."""
        import cv2
        by_name = {k.name: k for k in keypoints}
        pts = [by_name.get(n) for n in
               ("left_shoulder", "right_shoulder", "left_hip", "right_hip")]
        pts = [p.image_xy for p in pts if p is not None and p.confidence >= MIN_LANDMARK_VIS]
        h, w = frame_bgr.shape[:2]
        if len(pts) >= 3:
            xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
            x0, x1 = int(max(0, min(xs))), int(min(w, max(xs)))
            y0, y1 = int(max(0, min(ys))), int(min(h, max(ys)))
        else:
            bx0, by0, bx1, by1 = bbox
            x0 = int(max(0, bx0 + 0.25 * (bx1 - bx0)))
            x1 = int(min(w, bx1 - 0.25 * (bx1 - bx0)))
            y0 = int(max(0, by0 + 0.2 * (by1 - by0)))
            y1 = int(min(h, by0 + 0.55 * (by1 - by0)))
        if x1 - x0 < 2 or y1 - y0 < 2:
            return None
        patch = frame_bgr[y0:y1, x0:x1]
        hsv = cv2.cvtColor(patch, cv2.COLOR_BGR2HSV)
        sat = hsv[:, :, 1].astype(np.float32)
        mask = sat > 40  # ignore washed-out pixels (skin/court bleed)
        if not mask.any():
            return float(np.mean(hsv[:, :, 0]))
        return float(np.mean(hsv[:, :, 0][mask]))
