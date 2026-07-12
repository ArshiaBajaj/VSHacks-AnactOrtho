"""Background game-processing worker.

A single-worker ThreadPoolExecutor drains jobs FIFO. Each job:
  video -> cv.VideoPipeline -> FrameObservation stream -> GameEngine
        -> events persisted + published live on the EventBus
        -> analytics + highlights (via app.analytics when present, with a
           self-contained fallback so this worker never depends on the CV/
           analytics agent having landed)
        -> TTS wavs for commentary events
All imports of app.cv / app.analytics are lazy and defensive.
"""
from __future__ import annotations

import traceback
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Optional

from app import config
from app.db import get_conn
from app.engine.events import bus
from app.engine.game_state import GameEngine
from app.models import EventType, GameAnalytics, GameEvent, Heatmap, PlayerAnalytics, TeamStats

_executor: Optional[ThreadPoolExecutor] = None


def submit_game(game_id: str) -> None:
    """Queue a game for processing (FIFO, one at a time)."""
    global _executor
    if _executor is None:
        _executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="courtvision-proc")
    _executor.submit(process_game, game_id)


def event_to_dict(ev: GameEvent) -> dict[str, Any]:
    """GameEvent -> the JSON shape used by /events and the WebSocket."""
    return {
        "event_id": ev.event_id,
        "t": ev.t,
        "type": ev.type.value,
        "team": ev.team,
        "player_id": ev.player_id,
        "points": ev.points,
        "score_after": (
            {"team_a": ev.score_after.team_a, "team_b": ev.score_after.team_b}
            if ev.score_after
            else None
        ),
        "text": ev.text,
        "audio_url": ev.audio_url,
    }


def _persist_event(game_id: str, seq: int, ev: GameEvent) -> None:
    with get_conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO events (event_id, game_id, seq, t, type, team, player_id,"
            " points, score_a, score_b, text, audio_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
            (
                ev.event_id,
                game_id,
                seq,
                ev.t,
                ev.type.value,
                ev.team,
                ev.player_id,
                ev.points,
                ev.score_after.team_a if ev.score_after else None,
                ev.score_after.team_b if ev.score_after else None,
                ev.text,
                ev.audio_url,
            ),
        )


def _set_progress(game_id: str, progress: float) -> None:
    with get_conn() as conn:
        conn.execute(
            "UPDATE games SET progress = ? WHERE game_id = ?", (round(progress, 4), game_id)
        )
    bus.publish(
        game_id, {"type": "status", "status": "processing", "progress": round(progress, 4)}
    )


def _open_pipeline(video_path: str):
    """Lazily import the CV pipeline (owned by the other agent)."""
    pipeline_cls = None
    try:
        from app.cv.pipeline import VideoPipeline as pipeline_cls  # type: ignore
    except Exception:
        try:
            from app.cv import VideoPipeline as pipeline_cls  # type: ignore
        except Exception:
            pipeline_cls = None
    if pipeline_cls is None:
        raise RuntimeError("CV pipeline (app.cv) is not available yet")
    return pipeline_cls(video_path)


def _frame_iter(pipeline):
    """The pipeline exposes .frames(); tolerate a plain iterable too."""
    frames = getattr(pipeline, "frames", None)
    if callable(frames):
        return frames()
    return iter(pipeline)


def _fallback_analytics(
    game_id: str,
    events: list[GameEvent],
    players: list[dict[str, Any]],
    ball_cells: dict[tuple[int, int], int],
) -> GameAnalytics:
    """Minimal analytics derived from engine events when app.analytics is absent."""
    team_stats = {"team_a": TeamStats(), "team_b": TeamStats()}
    for ev in events:
        key = "team_a" if ev.team == "a" else "team_b" if ev.team == "b" else None
        if key is None:
            continue
        if ev.type == EventType.shot_attempt:
            team_stats[key].fg_attempts += 1
        elif ev.type == EventType.score:
            team_stats[key].fg_made += 1
            team_stats[key].points += ev.points or 0
    player_rows = [
        PlayerAnalytics(player_id=p["player_id"], name=p["name"]) for p in players
    ]
    heatmap = Heatmap(cells=[[x, y, n] for (x, y), n in sorted(ball_cells.items())])
    return GameAnalytics(
        game_id=game_id, team_stats=team_stats, players=player_rows, ball_heatmap=heatmap
    )


def _compute_analytics(
    game_id: str,
    observations: list[Any],
    events: list[GameEvent],
    players: list[dict[str, Any]],
    ball_cells: dict[tuple[int, int], int],
) -> GameAnalytics:
    """Join analytics.compute_player_metrics/heatmaps with engine events.

    Falls back to event-derived stats if app.analytics is missing or fails.
    Convention (shared with the engine): event player_id == f"p_{track_id}".
    """
    try:
        from app.analytics.heatmap import build_heatmap  # type: ignore
        from app.analytics.metrics import compute_player_metrics  # type: ignore

        per_track = compute_player_metrics(observations, events)

        # team stats from the event stream
        base = _fallback_analytics(game_id, events, players, ball_cells)

        # positional name mapping: roster order -> track order
        roster_names = [p["name"] for p in players]
        player_rows: list[PlayerAnalytics] = []
        for i, (track_id, m) in enumerate(sorted(per_track.items())):
            player_id = f"p_{track_id}"
            name = roster_names[i] if i < len(roster_names) else f"Player {track_id}"
            points: list[tuple[float, float]] = []
            for obs in observations:
                for p in getattr(obs, "players", []):
                    if p.track_id == track_id and p.court_xy is not None:
                        points.append(p.court_xy)
            player_rows.append(
                PlayerAnalytics(
                    player_id=player_id,
                    name=name,
                    points=m.get("points") or 0,
                    shot_attempts=m.get("shot_attempts") or 0,
                    shots_made=m.get("shots_made") or 0,
                    max_vertical_jump_cm=m.get("max_vertical_jump_cm"),
                    avg_shot_release_velocity_ms=m.get("avg_shot_release_velocity_ms"),
                    top_speed_ms=m.get("top_speed_ms"),
                    distance_covered_m=m.get("distance_covered_m"),
                    heatmap=build_heatmap(points),
                )
            )

        if not player_rows:
            player_rows = base.players  # no pose tracks: keep roster rows

        ball_points = [
            obs.ball.court_xy
            for obs in observations
            if getattr(obs, "ball", None) is not None and obs.ball.court_xy is not None
        ]
        return GameAnalytics(
            game_id=game_id,
            team_stats=base.team_stats,
            players=player_rows,
            ball_heatmap=build_heatmap(ball_points),
        )
    except Exception:
        traceback.print_exc()
    return _fallback_analytics(game_id, events, players, ball_cells)


def _extract_highlights(
    game_id: str, events: list[GameEvent], video_path: str, observations: list[Any]
) -> list[dict[str, Any]]:
    """Try analytics.highlights; fall back to windows around score events."""
    try:
        from app.analytics.highlights import extract_highlights  # type: ignore

        result = extract_highlights(
            video_path, events, config.MEDIA_DIR / "highlights" / game_id, game_id
        )
        out = []
        for h in result or []:
            if hasattr(h, "model_dump"):
                out.append(h.model_dump())
            elif isinstance(h, dict):
                out.append(h)
        if out:
            return out
    except Exception:
        traceback.print_exc()
    # Fallback: a clip window around each score, biggest plays first, max 8.
    scores = [ev for ev in events if ev.type == EventType.score]
    scores.sort(key=lambda e: (-(e.points or 0), e.t))
    out = []
    for i, ev in enumerate(scores[:8]):
        label = f"{ev.points or 2}-pointer" + (f" by team {ev.team.upper()}" if ev.team else "")
        out.append(
            {
                "highlight_id": f"h_{i + 1}",
                "t_start": max(0.0, ev.t - 5.0),
                "t_end": ev.t + 2.0,
                "label": label,
                "video_url": None,
                "thumb_url": None,
            }
        )
    out.sort(key=lambda h: h["t_start"])
    return out


def _render_tts(game_id: str, events: list[GameEvent]) -> None:
    """Render commentary lines to wav files; update rows with audio_url."""
    if not config.tts_available():
        return
    from app.commentary.tts import synth_wav

    audio_dir = config.MEDIA_DIR / "audio" / game_id
    for ev in events:
        if ev.type != EventType.commentary or not ev.text:
            continue
        out_path = audio_dir / f"{ev.event_id}.wav"
        if synth_wav(ev.text, out_path):
            ev.audio_url = f"/media/audio/{game_id}/{ev.event_id}.wav"
            with get_conn() as conn:
                conn.execute(
                    "UPDATE events SET audio_url = ? WHERE game_id = ? AND event_id = ?",
                    (ev.audio_url, game_id, ev.event_id),
                )


def _grid_cell(court_xy: tuple[float, float]) -> Optional[tuple[int, int]]:
    from app.cv.types import COURT_LENGTH_M, COURT_WIDTH_M

    x, y = court_xy
    gx = int(x / COURT_LENGTH_M * config.HEATMAP_GRID_W)
    gy = int(y / COURT_WIDTH_M * config.HEATMAP_GRID_H)
    if 0 <= gx < config.HEATMAP_GRID_W and 0 <= gy < config.HEATMAP_GRID_H:
        return gx, gy
    return None


def process_game(game_id: str) -> None:
    """Full processing job for one uploaded game. Runs in the worker thread."""
    try:
        with get_conn() as conn:
            row = conn.execute("SELECT * FROM games WHERE game_id = ?", (game_id,)).fetchone()
            if row is None:
                return
            players = [
                dict(r)
                for r in conn.execute(
                    "SELECT p.* FROM players p JOIN game_players gp ON gp.player_id = p.player_id"
                    " WHERE gp.game_id = ? ORDER BY p.player_id",
                    (game_id,),
                ).fetchall()
            ]
            conn.execute(
                "UPDATE games SET status = 'processing', progress = 0, error = NULL"
                " WHERE game_id = ?",
                (game_id,),
            )
        bus.publish(game_id, {"type": "status", "status": "processing", "progress": 0.0})

        video_path = row["video_path"]
        if not video_path or not Path(video_path).exists():
            raise RuntimeError("uploaded video file is missing")

        pipeline = _open_pipeline(video_path)
        duration_hint = getattr(pipeline, "duration_s", None) or getattr(pipeline, "duration", None)
        total_frames = getattr(pipeline, "total_frames", None) or getattr(pipeline, "frame_count", None)

        engine = GameEngine(
            target_score=row["target_score"],
            scoring=row["scoring"],
        )
        events: list[GameEvent] = []
        observations: list[Any] = []
        ball_cells: dict[tuple[int, int], int] = {}
        seq = 0
        last_progress = 0.0
        last_t = 0.0

        for obs in _frame_iter(pipeline):
            observations.append(obs)
            last_t = getattr(obs, "t", last_t)
            ball = getattr(obs, "ball", None)
            if ball is not None and getattr(ball, "court_xy", None) is not None:
                cell = _grid_cell(ball.court_xy)
                if cell is not None:
                    ball_cells[cell] = ball_cells.get(cell, 0) + 1
            for ev in engine.process(obs):
                seq += 1
                events.append(ev)
                _persist_event(game_id, seq, ev)
                bus.publish(game_id, event_to_dict(ev))
            # progress every ~2%
            progress = 0.0
            if duration_hint:
                progress = min(0.99, last_t / float(duration_hint))
            elif total_frames:
                progress = min(0.99, getattr(obs, "frame_idx", 0) / float(total_frames))
            if progress - last_progress >= 0.02:
                last_progress = progress
                _set_progress(game_id, progress)

        for ev in engine.finalize():
            seq += 1
            events.append(ev)
            _persist_event(game_id, seq, ev)
            bus.publish(game_id, event_to_dict(ev))

        duration_s = float(duration_hint) if duration_hint else last_t

        analytics = _compute_analytics(game_id, observations, events, players, ball_cells)
        highlights = _extract_highlights(game_id, events, video_path, observations)
        _render_tts(game_id, events)

        with get_conn() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO analytics (game_id, json) VALUES (?, ?)",
                (game_id, analytics.model_dump_json()),
            )
            conn.execute("DELETE FROM highlights WHERE game_id = ?", (game_id,))
            for h in highlights:
                conn.execute(
                    "INSERT INTO highlights (highlight_id, game_id, t_start, t_end, label,"
                    " video_url, thumb_url) VALUES (?,?,?,?,?,?,?)",
                    (
                        h["highlight_id"],
                        game_id,
                        h["t_start"],
                        h["t_end"],
                        h["label"],
                        h.get("video_url"),
                        h.get("thumb_url"),
                    ),
                )
            conn.execute(
                "UPDATE games SET status = 'done', progress = 1.0, duration_s = ?,"
                " score_a = ?, score_b = ? WHERE game_id = ?",
                (duration_s, engine.score.team_a, engine.score.team_b, game_id),
            )
        bus.publish(game_id, {"type": "status", "status": "done", "progress": 1.0})
    except Exception as exc:  # noqa: BLE001 — job boundary
        traceback.print_exc()
        try:
            with get_conn() as conn:
                conn.execute(
                    "UPDATE games SET status = 'error', error = ? WHERE game_id = ?",
                    (str(exc), game_id),
                )
        except Exception:
            pass
        bus.publish(game_id, {"type": "status", "status": "error", "error": str(exc)})
    finally:
        bus.close(game_id)
