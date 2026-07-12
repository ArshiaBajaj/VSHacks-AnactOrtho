"""Highlight clip extraction: cut [t-4s, t+2s] windows around key events.

Clips are written with cv2 (mp4v) plus a thumbnail jpg at the event time.
Overlapping windows are merged; score events are preferred; capped at 12.
"""
from __future__ import annotations

from pathlib import Path
from typing import Optional

import cv2

from ..models import EventType, GameEvent, Highlight

PRE_S = 4.0
POST_S = 2.0
MAX_HIGHLIGHTS = 12

# Event types worth clipping, in preference order (score first).
_CLIP_TYPES = (EventType.score, EventType.streak)
_PRIORITY = {EventType.score: 0, EventType.streak: 1}


def _label_for(event: GameEvent) -> str:
    if event.type == EventType.score:
        pts = f" (+{event.points})" if event.points else ""
        who = f" by {event.player_id}" if event.player_id else ""
        return f"Score{pts}{who}"
    if event.type == EventType.streak:
        return event.text or "Hot streak"
    return (event.text or event.type.value).capitalize()


def extract_highlights(video_path: str, events: list[GameEvent],
                       out_dir: Path, game_id: str) -> list[Highlight]:
    """Cut highlight clips + thumbnails for score/streak (and 'jump') events.

    Returns Highlight models with URLs under /media/highlights/{game_id}/.
    Silently skips clips whose frames cannot be read; returns [] for an
    unreadable video.
    """
    candidates = [e for e in events
                  if e.type in _CLIP_TYPES or getattr(e.type, "value", str(e.type)) == "jump"]
    if not candidates:
        return []
    candidates.sort(key=lambda e: (_PRIORITY.get(e.type, 2), e.t))
    candidates = candidates[:MAX_HIGHLIGHTS * 2]  # headroom before merging

    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        cap.release()
        return []
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    if fps <= 0:
        fps = 30.0
    n_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = n_frames / fps if n_frames > 0 else None
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    windows = _merged_windows(candidates, duration)

    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    highlights: list[Highlight] = []
    try:
        for i, (t0, t1, event) in enumerate(windows[:MAX_HIGHLIGHTS]):
            hid = f"hl_{i:03d}"
            video_file = out_dir / f"{hid}.mp4"
            thumb_file = out_dir / f"{hid}.jpg"
            ok = _write_clip(cap, fps, (w, h), t0, t1, event.t, video_file, thumb_file)
            if not ok:
                continue
            highlights.append(Highlight(
                highlight_id=hid,
                t_start=round(t0, 2),
                t_end=round(t1, 2),
                label=_label_for(event),
                video_url=f"/media/highlights/{game_id}/{hid}.mp4",
                thumb_url=f"/media/highlights/{game_id}/{hid}.jpg",
            ))
    finally:
        cap.release()
    highlights.sort(key=lambda hl: hl.t_start)
    return highlights


def _merged_windows(candidates: list[GameEvent], duration: Optional[float],
                    ) -> list[tuple[float, float, GameEvent]]:
    """[t-4, t+2] windows, overlapping ones merged (best-priority event kept)."""
    raw = []
    for e in candidates:
        t0 = max(0.0, e.t - PRE_S)
        t1 = e.t + POST_S
        if duration is not None:
            t1 = min(t1, duration)
        if t1 - t0 < 0.5:
            continue
        raw.append((t0, t1, e))
    raw.sort(key=lambda x: x[0])

    merged: list[tuple[float, float, GameEvent]] = []
    for t0, t1, e in raw:
        if merged and t0 <= merged[-1][1]:
            m0, m1, me = merged[-1]
            keep = e if _PRIORITY.get(e.type, 2) < _PRIORITY.get(me.type, 2) else me
            merged[-1] = (m0, max(m1, t1), keep)
        else:
            merged.append((t0, t1, e))
    # Prefer score-anchored windows when trimming to the cap.
    merged.sort(key=lambda x: (_PRIORITY.get(x[2].type, 2), x[0]))
    return merged


def _write_clip(cap: cv2.VideoCapture, fps: float, size: tuple[int, int],
                t0: float, t1: float, t_event: float,
                video_file: Path, thumb_file: Path) -> bool:
    """Seek and write one clip + a thumbnail at the event time."""
    start_frame = int(t0 * fps)
    end_frame = int(t1 * fps)
    event_frame = int(t_event * fps)
    cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame)

    writer = cv2.VideoWriter(
        str(video_file), cv2.VideoWriter_fourcc(*"mp4v"), fps, size)
    if not writer.isOpened():
        return False
    wrote = 0
    thumb_written = False
    try:
        for fidx in range(start_frame, end_frame):
            ok, frame = cap.read()
            if not ok or frame is None:
                break
            if frame.shape[1] != size[0] or frame.shape[0] != size[1]:
                frame = cv2.resize(frame, size)
            writer.write(frame)
            wrote += 1
            if not thumb_written and fidx >= event_frame:
                cv2.imwrite(str(thumb_file), frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                thumb_written = True
        if wrote and not thumb_written:
            # Event frame past what we could read; reuse the last usable frame.
            cap.set(cv2.CAP_PROP_POS_FRAMES, start_frame + max(0, wrote - 1))
            ok, frame = cap.read()
            if ok and frame is not None:
                cv2.imwrite(str(thumb_file), frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
    finally:
        writer.release()
    return wrote > 0
