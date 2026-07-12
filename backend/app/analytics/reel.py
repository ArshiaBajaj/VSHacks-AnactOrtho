"""Highlight reel stitching: concatenate a game's highlight clips with cv2.

One VideoWriter, normalized to the first readable clip's size/fps; other
clips are resized to match. A 0.5 s black title card with the highlight
label (cv2.putText) is inserted ahead of every clip. Written atomically:
frames go to a .tmp file which is renamed over out_path on success.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Sequence, Union

import cv2
import numpy as np

TITLE_S = 0.5
_FONT = cv2.FONT_HERSHEY_SIMPLEX

ClipSpec = tuple[Union[str, Path], str]  # (mp4 path, title label)


def _probe(path: Path) -> tuple[float, tuple[int, int]] | None:
    """(fps, (w, h)) of a readable clip, else None."""
    cap = cv2.VideoCapture(str(path))
    try:
        if not cap.isOpened():
            return None
        fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        if w <= 0 or h <= 0:
            return None
        return (fps if fps > 0 else 30.0), (w, h)
    finally:
        cap.release()


def _title_frame(size: tuple[int, int], label: str) -> np.ndarray:
    """Black frame with the highlight label centered."""
    w, h = size
    frame = np.zeros((h, w, 3), dtype=np.uint8)
    text = (label or "Highlight").strip() or "Highlight"
    scale = max(0.5, min(1.6, h / 480.0))
    thickness = max(1, int(round(scale * 2)))
    (tw, th), _ = cv2.getTextSize(text, _FONT, scale, thickness)
    while tw > w - 40 and scale > 0.4:
        scale *= 0.9
        thickness = max(1, int(round(scale * 2)))
        (tw, th), _ = cv2.getTextSize(text, _FONT, scale, thickness)
    org = (max(10, (w - tw) // 2), (h + th) // 2)
    cv2.putText(frame, text, org, _FONT, scale, (255, 255, 255), thickness, cv2.LINE_AA)
    return frame


def build_reel(game_id: str, highlight_paths: Sequence[ClipSpec],
               out_path: Union[str, Path]) -> dict[str, Any]:
    """Stitch (clip_path, label) pairs into a single mp4 at out_path.

    Unreadable clips are skipped. Returns
    {"clips", "frames", "fps", "duration_s"}; raises RuntimeError when no
    clip could be read or the writer cannot be opened.
    """
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    clips = [(Path(p), label) for p, label in highlight_paths]

    fmt = None
    for path, _label in clips:
        fmt = _probe(path)
        if fmt is not None:
            break
    if fmt is None:
        raise RuntimeError(f"no readable highlight clips for {game_id}")
    fps, size = fmt

    tmp_path = out_path.with_name(out_path.stem + ".tmp.mp4")
    writer = cv2.VideoWriter(str(tmp_path), cv2.VideoWriter_fourcc(*"mp4v"), fps, size)
    if not writer.isOpened():
        writer.release()
        raise RuntimeError(f"could not open reel writer for {out_path}")

    n_title = max(1, int(round(TITLE_S * fps)))
    frames = 0
    stitched = 0
    try:
        for path, label in clips:
            cap = cv2.VideoCapture(str(path))
            try:
                if not cap.isOpened():
                    continue
                ok, frame = cap.read()
                if not ok or frame is None:
                    continue
                title = _title_frame(size, label)
                for _ in range(n_title):
                    writer.write(title)
                    frames += 1
                while ok and frame is not None:
                    if (frame.shape[1], frame.shape[0]) != size:
                        frame = cv2.resize(frame, size)
                    writer.write(frame)
                    frames += 1
                    ok, frame = cap.read()
                stitched += 1
            finally:
                cap.release()
    finally:
        writer.release()

    if stitched == 0:
        tmp_path.unlink(missing_ok=True)
        raise RuntimeError(f"no readable highlight clips for {game_id}")
    tmp_path.replace(out_path)
    return {
        "clips": stitched,
        "frames": frames,
        "fps": fps,
        "duration_s": round(frames / fps, 2),
    }
