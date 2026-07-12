"""Built-in demo game `g_sample`.

Seeded once at startup: a completed 10-minute pickup game to 21 (1s and 2s)
with a scripted, realistic event timeline (~60-80 events), a plausible
analytics blob, two roster players, and empty highlights. The frontend uses
this with POST /api/games/g_sample/simulate to develop the live UI without a
real video.
"""
from __future__ import annotations

import random

from app.commentary.generator import CommentaryRequest, deterministic_commentary
from app.db import get_conn
from app.models import GameAnalytics, Heatmap, PlayerAnalytics, TeamStats

SAMPLE_GAME_ID = "g_sample"
_TEAM_NAMES = {"a": "Team A", "b": "Team B"}
_PLAYERS = [
    ("p_sample_1", "Jordan Reyes", "PG", 180.0, "red shirt", "a"),
    ("p_sample_2", "Alex Kim", "SF", 188.0, "blue shirt", "b"),
]


def _commentary_text(rnd: random.Random, event: str, team: str, value: int, sa: int, sb: int) -> str:
    style = rnd.choice(["playground", "playground", "hype", "broadcast"])
    return deterministic_commentary(
        CommentaryRequest(
            event=event,
            team=team.upper(),
            teamName=_TEAM_NAMES[team],
            value=value,
            scoreA=sa,
            scoreB=sb,
            style=style,
        )
    )


def _build_timeline() -> tuple[list[dict], int, int, float]:
    """Deterministic scripted game: returns (events, score_a, score_b, duration)."""
    rnd = random.Random(8)
    events: list[dict] = []
    seq = 0
    sa = sb = 0
    streak_team = None
    streak_n = 0
    t = 0.0
    duration = 600.0

    def ev(t: float, etype: str, **kw) -> dict:
        nonlocal seq
        seq += 1
        d = {
            "event_id": f"e_{seq:04d}",
            "t": round(t, 2),
            "type": etype,
            "team": None,
            "player_id": None,
            "points": None,
            "score_a": None,
            "score_b": None,
            "text": None,
            "audio_url": None,
        }
        d.update(kw)
        return d

    events.append(ev(0.0, "game_start", score_a=0, score_b=0))

    basket_i = 0
    while sa < 21 and sb < 21:
        t += rnd.uniform(11.0, 22.0)
        if t > duration - 15:
            t = duration - 15 + rnd.uniform(0, 5)
        basket_i += 1
        # keep it close, team A pulls away late
        bias_a = 0.5 if sa < 15 else 0.6
        team = "a" if rnd.random() < bias_a else "b"
        points = rnd.choice([1, 1, 2])
        player = "p_sample_1" if team == "a" else "p_sample_2"
        if team == "a":
            sa += points
        else:
            sb += points

        # occasional whistle sequence before a basket
        if basket_i % 6 == 3:
            wt = t - rnd.uniform(4.0, 8.0)
            other = "b" if team == "a" else "a"
            events.append(ev(wt, "whistle", team=other, score_a=sa - points if team == "a" else sa, score_b=sb - points if team == "b" else sb))
            events.append(ev(wt, "out_of_bounds", team=other))
            events.append(
                ev(wt, "commentary", team=other, text=_commentary_text(rnd, "whistle", other, 0, sa, sb))
            )
            events.append(ev(wt + 1.0, "possession_change", team=other, player_id="p_sample_2" if other == "b" else "p_sample_1"))

        events.append(
            ev(t, "score", team=team, player_id=player, points=points, score_a=sa, score_b=sb)
        )
        events.append(
            ev(t, "commentary", team=team, text=_commentary_text(rnd, "score", team, points, sa, sb))
        )
        if team == streak_team:
            streak_n += 1
        else:
            streak_team = team
            streak_n = 1
        if streak_n >= 3:
            events.append(ev(t + 0.5, "streak", team=team, points=streak_n, score_a=sa, score_b=sb))
            events.append(
                ev(t + 0.5, "commentary", team=team, text=_commentary_text(rnd, "streak", team, streak_n, sa, sb))
            )

    end_t = min(duration, t + 3.0)
    events.append(ev(end_t, "game_end", score_a=sa, score_b=sb))
    events.sort(key=lambda e: e["t"])
    # stretch the timeline so the game fills ~10 minutes of "video"
    last_t = events[-1]["t"]
    if last_t > 0:
        scale = (duration - 8.0) / last_t
        for e in events:
            e["t"] = round(e["t"] * scale, 2)
    return events, sa, sb, duration


def _sample_analytics(events: list[dict], sa: int, sb: int) -> GameAnalytics:
    rnd = random.Random(11)

    def heat(cx: int, cy: int, n: int) -> Heatmap:
        cells: dict[tuple[int, int], int] = {}
        for _ in range(n):
            x = min(29, max(0, int(rnd.gauss(cx, 4))))
            y = min(16, max(0, int(rnd.gauss(cy, 3))))
            cells[(x, y)] = cells.get((x, y), 0) + 1
        return Heatmap(cells=[[x, y, c] for (x, y), c in sorted(cells.items())])

    def player_stats(pid: str, name: str, team: str) -> PlayerAnalytics:
        scores = [e for e in events if e["type"] == "score" and e["team"] == team]
        points = sum(e["points"] or 0 for e in scores)
        made = len(scores)
        attempts = made + rnd.randint(3, 8)
        return PlayerAnalytics(
            player_id=pid,
            name=name,
            points=points,
            shot_attempts=attempts,
            shots_made=made,
            max_vertical_jump_cm=round(rnd.uniform(42, 61), 1),
            avg_shot_release_velocity_ms=round(rnd.uniform(5.2, 7.4), 2),
            top_speed_ms=round(rnd.uniform(4.6, 6.3), 2),
            distance_covered_m=round(rnd.uniform(900, 1500), 1),
            heatmap=heat(6 if team == "a" else 9, 8, 260),
        )

    attempts_a = sum(1 for e in events if e["type"] == "score" and e["team"] == "a") + 7
    attempts_b = sum(1 for e in events if e["type"] == "score" and e["team"] == "b") + 6
    return GameAnalytics(
        game_id=SAMPLE_GAME_ID,
        team_stats={
            "team_a": TeamStats(
                points=sa,
                fg_attempts=attempts_a,
                fg_made=sum(1 for e in events if e["type"] == "score" and e["team"] == "a"),
            ),
            "team_b": TeamStats(
                points=sb,
                fg_attempts=attempts_b,
                fg_made=sum(1 for e in events if e["type"] == "score" and e["team"] == "b"),
            ),
        },
        players=[
            player_stats("p_sample_1", "Jordan Reyes", "a"),
            player_stats("p_sample_2", "Alex Kim", "b"),
        ],
        ball_heatmap=heat(7, 8, 600),
    )


def ensure_sample_game() -> None:
    """Insert the g_sample fixture if it does not exist. Idempotent."""
    with get_conn() as conn:
        row = conn.execute(
            "SELECT game_id FROM games WHERE game_id = ?", (SAMPLE_GAME_ID,)
        ).fetchone()
        if row is not None:
            return

        events, sa, sb, duration = _build_timeline()
        analytics = _sample_analytics(events, sa, sb)

        conn.execute(
            "INSERT INTO games (game_id, title, status, progress, duration_s, score_a,"
            " score_b, target_score, scoring, video_path)"
            " VALUES (?,?,?,?,?,?,?,?,?,?)",
            (SAMPLE_GAME_ID, "Sample pickup game (demo)", "done", 1.0, duration, sa, sb, 21, "1s_and_2s", None),
        )
        for pid, name, pos, height, hint, _team in _PLAYERS:
            conn.execute(
                "INSERT OR IGNORE INTO players (player_id, name, position, height_cm, jersey_hint)"
                " VALUES (?,?,?,?,?)",
                (pid, name, pos, height, hint),
            )
            conn.execute(
                "INSERT OR IGNORE INTO game_players (game_id, player_id) VALUES (?, ?)",
                (SAMPLE_GAME_ID, pid),
            )
        for seq, e in enumerate(events, start=1):
            conn.execute(
                "INSERT INTO events (event_id, game_id, seq, t, type, team, player_id,"
                " points, score_a, score_b, text, audio_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    e["event_id"],
                    SAMPLE_GAME_ID,
                    seq,
                    e["t"],
                    e["type"],
                    e["team"],
                    e["player_id"],
                    e["points"],
                    e["score_a"],
                    e["score_b"],
                    e["text"],
                    e["audio_url"],
                ),
            )
        conn.execute(
            "INSERT OR REPLACE INTO analytics (game_id, json) VALUES (?, ?)",
            (SAMPLE_GAME_ID, analytics.model_dump_json()),
        )
