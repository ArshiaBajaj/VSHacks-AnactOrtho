"""Shot chart derivation from stored game events.

Shots are reconstructed from the persisted event stream:
- every `shot_attempt` event is a shot; it counts as MADE when a `score`
  event of a compatible team follows within MADE_WINDOW_S seconds (the score
  supplies team/player/points where the attempt lacks them);
- `score` events with no matching attempt (e.g. the scripted g_sample game,
  whose timeline has no shot_attempt events at all) still become made shots
  so the chart renders for every game.

Positions are court-space meters over the half court
[0, COURT_LENGTH_M / 2] x [0, COURT_WIDTH_M]. Events do not currently persist
per-shot coordinates, so when an event carries none we synthesize a
deterministic, plausible spot from the shot value (inside vs beyond the
6.75 m arc) with jitter seeded by the event id; those shots are flagged
`"approx": true`. If a future engine attaches `x`/`y` (or `court_xy`) to the
event dict it is used verbatim with `"approx": false`.
"""
from __future__ import annotations

import math
import random
import zlib
from typing import Any, Optional

from ..cv.types import COURT_LENGTH_M, COURT_WIDTH_M

HALF_COURT_LENGTH_M = COURT_LENGTH_M / 2.0  # 14.325
MADE_WINDOW_S = 2.0
THREE_POINT_ARC_M = 6.75
# Rim center: 1.575 m from the baseline, on the court's long axis midline.
HOOP_X_M = 1.575
HOOP_Y_M = COURT_WIDTH_M / 2.0
_EDGE_MARGIN_M = 0.3


def _scoring_values(scoring: Optional[str]) -> tuple[int, int]:
    """(inside_value, outside_value) for the game's scoring rules."""
    if scoring == "2s_and_3s":
        return 2, 3
    return 1, 2  # "1s_and_2s" default


def _event_position(event: dict[str, Any]) -> Optional[tuple[float, float]]:
    """Court-space position carried on the event itself, if any."""
    for kx, ky in (("x", "y"), ("court_x", "court_y")):
        if isinstance(event.get(kx), (int, float)) and isinstance(event.get(ky), (int, float)):
            return float(event[kx]), float(event[ky])
    xy = event.get("court_xy")
    if isinstance(xy, (list, tuple)) and len(xy) == 2:
        try:
            return float(xy[0]), float(xy[1])
        except (TypeError, ValueError):
            return None
    return None


def _synth_position(event_id: str, shot_value: int, outside_value: int) -> tuple[float, float]:
    """Deterministic plausible shot spot seeded by the event id."""
    rnd = random.Random(zlib.crc32((event_id or "e").encode("utf-8")))
    if shot_value >= outside_value:
        dist = rnd.uniform(THREE_POINT_ARC_M + 0.15, THREE_POINT_ARC_M + 1.6)
        theta = rnd.uniform(-0.9, 0.9)  # keep long shots on the court
    else:
        dist = rnd.uniform(1.0, THREE_POINT_ARC_M - 0.75)
        theta = rnd.uniform(-1.25, 1.25)
    x = HOOP_X_M + dist * math.cos(theta)
    y = HOOP_Y_M + dist * math.sin(theta)
    x = min(max(x, _EDGE_MARGIN_M), HALF_COURT_LENGTH_M - _EDGE_MARGIN_M)
    y = min(max(y, _EDGE_MARGIN_M), COURT_WIDTH_M - _EDGE_MARGIN_M)
    return round(x, 2), round(y, 2)


def _shot(event: dict[str, Any], made: bool, points: int, outside_value: int,
          team: Optional[str], player_id: Optional[str]) -> dict[str, Any]:
    pos = _event_position(event)
    approx = pos is None
    if pos is None:
        pos = _synth_position(event.get("event_id") or "", points, outside_value)
    return {
        "t": round(float(event.get("t") or 0.0), 2),
        "player_id": player_id,
        "team": team,
        "made": made,
        "points": points,
        "x": pos[0],
        "y": pos[1],
        "approx": approx,
    }


def build_shotchart(game_id: str, scoring: Optional[str],
                    events: list[dict[str, Any]]) -> dict[str, Any]:
    """Reconstruct the shot chart for a game from its ordered event dicts.

    `events` are /events-shaped dicts in timeline order. Returns
    {"game_id", "shots": [...]} with shots sorted by t; empty list when the
    game has no shot activity.
    """
    inside_value, outside_value = _scoring_values(scoring)
    attempts = [e for e in events if e.get("type") == "shot_attempt"]
    scores = [e for e in events if e.get("type") == "score"]

    shots: list[dict[str, Any]] = []
    matched_scores: set[int] = set()  # indices into `scores`

    for att in attempts:
        att_t = float(att.get("t") or 0.0)
        match_idx: Optional[int] = None
        for i, sc in enumerate(scores):
            if i in matched_scores:
                continue
            dt = float(sc.get("t") or 0.0) - att_t
            if dt < 0:
                continue
            if dt > MADE_WINDOW_S:
                break  # scores are in timeline order; nothing later can match
            if att.get("team") and sc.get("team") and att["team"] != sc["team"]:
                continue
            match_idx = i
            break
        if match_idx is not None:
            matched_scores.add(match_idx)
            sc = scores[match_idx]
            shots.append(_shot(
                att,
                made=True,
                points=int(sc.get("points") or att.get("points") or inside_value),
                outside_value=outside_value,
                team=att.get("team") or sc.get("team"),
                player_id=att.get("player_id") or sc.get("player_id"),
            ))
        else:
            shots.append(_shot(
                att,
                made=False,
                points=int(att.get("points") or inside_value),
                outside_value=outside_value,
                team=att.get("team"),
                player_id=att.get("player_id"),
            ))

    # Scores with no shot_attempt (or games with no attempt events at all)
    # are still made shots — every make implies an attempt.
    for i, sc in enumerate(scores):
        if i in matched_scores:
            continue
        shots.append(_shot(
            sc,
            made=True,
            points=int(sc.get("points") or inside_value),
            outside_value=outside_value,
            team=sc.get("team"),
            player_id=sc.get("player_id"),
        ))

    shots.sort(key=lambda s: s["t"])
    return {"game_id": game_id, "shots": shots}
