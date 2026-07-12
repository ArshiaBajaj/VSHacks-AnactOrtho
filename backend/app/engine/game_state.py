"""GameEngine — deterministic game-rules state machine.

Consumes a stream of FrameObservation (the CV seam, app/cv/types.py) and emits
GameEvent lists per frame. Pure logic: no I/O, no clocks, no randomness, so it
is fully unit-testable by feeding synthetic observations.

Responsibilities:
- possession tracking (nearest player to ball, with hysteresis)
- out-of-bounds detection (court polygon or court-space bounds, 3-frame
  hysteresis, 2 s whistle cooldown)
- shot detection (upward arc, then descent through the hoop region ->
  shot_attempt; continued descent through the region -> score)
- streaks (3+ consecutive scores by one team), game_start/game_end
- commentary events for every score/whistle/streak (deterministic phrases)
"""
from __future__ import annotations

import math
from collections import deque
from typing import Optional

from app.commentary.generator import CommentaryRequest, deterministic_commentary
from app.cv.types import COURT_LENGTH_M, COURT_WIDTH_M, CourtCalibration, FrameObservation
from app.models import EventType, GameEvent, Score

HALF_COURT_LENGTH_M = COURT_LENGTH_M / 2  # half-court games use [0..14.325]
ARC_RADIUS_M = 6.75
HOOP_COURT_XY = (1.575, COURT_WIDTH_M / 2)  # hoop center on the court plane

OOB_FRAMES = 3           # consecutive out frames before a whistle
OOB_COOLDOWN_S = 2.0     # no second whistle within this window
POSSESSION_FRAMES = 3    # consecutive frames before possession flips
RISE_FRAMES = 2          # consecutive upward-velocity frames to call an arc
SHOT_PENDING_S = 0.9     # max time between region entry and a made basket
SHOT_COOLDOWN_S = 2.0    # dead time after a resolved shot
UP_VELOCITY_PX_S = 60.0  # image-space upward speed to start an arc
DEFAULT_HOOP_RADIUS_PX = 25.0


def _point_in_poly(pt: tuple[float, float], poly: list[tuple[float, float]]) -> bool:
    """Ray-casting point-in-polygon test (image space)."""
    x, y = pt
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


class GameEngine:
    """Turns FrameObservation streams into GameEvent streams. Pure logic."""

    def __init__(
        self,
        target_score: int = 21,
        scoring: str = "1s_and_2s",
        style: str = "playground",
        track_to_player: Optional[dict[int, str]] = None,
        team_names: Optional[dict[str, str]] = None,
    ) -> None:
        self.target_score = target_score
        self.scoring = scoring
        self.style = style
        # Default convention (shared with app.analytics): player_id is the
        # string form "p_{track_id}" of the CV track id.
        self.track_to_player = track_to_player or {}
        self.team_names = team_names or {"a": "Team A", "b": "Team B"}
        # points awarded (inside_arc, beyond_arc)
        self.points_map = (1, 2) if scoring == "1s_and_2s" else (2, 3)

        self.score = Score()
        self._seq = 0
        self._started = False
        self._ended = False
        self._last_t = 0.0
        self._cal: Optional[CourtCalibration] = None

        # possession
        self.possession_team: Optional[str] = None
        self.possession_track: Optional[int] = None
        self._poss_pending: Optional[tuple[str, int]] = None
        self._poss_pending_n = 0

        # out of bounds
        self._oob_n = 0
        self._oob_until = -1.0

        # shot detection
        self._ball_hist: deque[tuple[float, float, float]] = deque(maxlen=20)
        self._y_min = math.inf
        self._y_max = -math.inf
        self._rise_n = 0
        self._shot_state = "idle"  # idle | rising | pending
        self._shooter_team: Optional[str] = None
        self._shooter_track: Optional[int] = None
        self._shooter_court_xy: Optional[tuple[float, float]] = None
        self._pending_deadline = 0.0
        self._entry_xy: tuple[float, float] = (0.0, 0.0)
        self._shot_until = -1.0
        self._arc_min_d = math.inf

        # streaks
        self._streak_team: Optional[str] = None
        self._streak_n = 0

    # -- event helpers ------------------------------------------------------

    def _ev(self, t: float, etype: EventType, **kw) -> GameEvent:
        self._seq += 1
        return GameEvent(event_id=f"e_{self._seq:04d}", t=round(t, 3), type=etype, **kw)

    def _player_id(self, track_id: Optional[int]) -> Optional[str]:
        if track_id is None:
            return None
        return self.track_to_player.get(track_id, f"p_{track_id}")

    def _commentary(self, t: float, event: str, team: Optional[str], value: Optional[float]) -> GameEvent:
        req = CommentaryRequest(
            event=event,
            team=team.upper() if team else None,
            teamName=self.team_names.get(team) if team else None,
            value=value,
            scoreA=self.score.team_a,
            scoreB=self.score.team_b,
            style=self.style,
        )
        return self._ev(t, EventType.commentary, team=team, text=deterministic_commentary(req))

    # -- possession ---------------------------------------------------------

    def _nearest_player(self, obs: FrameObservation):
        if not obs.ball or not obs.players:
            return None
        bx, by = obs.ball.image_xy
        best = None
        best_d = math.inf
        for p in obs.players:
            x1, y1, x2, y2 = p.image_bbox
            cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
            d = math.hypot(bx - cx, by - cy)
            reach = max(1.5 * (y2 - y1), 80.0)
            if d < reach and d < best_d:
                best_d = d
                best = p
        return best

    def _update_possession(self, obs: FrameObservation, out: list[GameEvent]) -> None:
        holder = self._nearest_player(obs)
        if holder is None or holder.team is None:
            self._poss_pending = None
            self._poss_pending_n = 0
            return
        if holder.team == self.possession_team:
            self.possession_track = holder.track_id
            self._poss_pending = None
            self._poss_pending_n = 0
            return
        key = (holder.team, holder.track_id)
        if self._poss_pending and self._poss_pending[0] == holder.team:
            self._poss_pending_n += 1
        else:
            self._poss_pending = key
            self._poss_pending_n = 1
        if self._poss_pending_n >= POSSESSION_FRAMES:
            self.possession_team = holder.team
            self.possession_track = holder.track_id
            self._poss_pending = None
            self._poss_pending_n = 0
            out.append(
                self._ev(
                    obs.t,
                    EventType.possession_change,
                    team=holder.team,
                    player_id=self._player_id(holder.track_id),
                )
            )

    # -- out of bounds ------------------------------------------------------

    def _ball_out(self, obs: FrameObservation) -> bool:
        ball = obs.ball
        if ball is None:
            return False
        # Airborne shots leave the court polygon (and their homography
        # projection leaves the court plane) without being out of bounds:
        # ignore OOB while a shot arc is in flight or the ball is high in
        # the frame (upper band of its observed y range).
        if self._shot_state != "idle":
            return False
        if self._y_max - self._y_min > 100:
            if ball.image_xy[1] < self._y_min + 0.35 * (self._y_max - self._y_min):
                return False
        if ball.court_xy is not None:
            x, y = ball.court_xy
            return not (0.0 <= x <= HALF_COURT_LENGTH_M and 0.0 <= y <= COURT_WIDTH_M)
        cal = self._cal
        if cal and cal.boundary_image_poly and len(cal.boundary_image_poly) >= 3:
            return not _point_in_poly(ball.image_xy, cal.boundary_image_poly)
        return False

    def _update_oob(self, obs: FrameObservation, out: list[GameEvent]) -> None:
        if self._ball_out(obs):
            self._oob_n += 1
        else:
            self._oob_n = 0
            return
        if self._oob_n >= OOB_FRAMES and obs.t >= self._oob_until:
            # possession flips to the other team on an out-of-bounds call
            gets_ball = "b" if self.possession_team == "a" else "a" if self.possession_team == "b" else None
            out.append(self._ev(obs.t, EventType.whistle, team=gets_ball))
            out.append(self._ev(obs.t, EventType.out_of_bounds, team=gets_ball))
            out.append(self._commentary(obs.t, "whistle", gets_ball, None))
            self._oob_until = obs.t + OOB_COOLDOWN_S
            self._oob_n = 0

    # -- shot detection -----------------------------------------------------

    def _hoop_region(self) -> Optional[tuple[Optional[float], float, float, bool]]:
        """Returns (hoop_x, region_y, radius, hoop_known) or None if unknowable."""
        cal = self._cal
        if cal and cal.hoop_image_xy is not None:
            r = 1.5 * (cal.hoop_radius_px or DEFAULT_HOOP_RADIUS_PX)
            return cal.hoop_image_xy[0], cal.hoop_image_xy[1], r, True
        # heuristic: "hoop region" is the upper band of where the ball has been
        if self._y_max - self._y_min > 100:
            thresh = self._y_min + 0.22 * (self._y_max - self._y_min)
            return None, thresh, 60.0, False
        return None

    def _in_region(self, x: float, y: float, region) -> bool:
        hx, hy, r, known = region
        if known:
            return math.hypot(x - hx, y - hy) <= r
        return y <= hy

    def _vy(self) -> Optional[float]:
        """Image-space vertical velocity (px/s, +down) over the recent window."""
        if len(self._ball_hist) < 3:
            return None
        t0, _, y0 = self._ball_hist[-3]
        t1, _, y1 = self._ball_hist[-1]
        dt = t1 - t0
        if dt <= 0:
            return None
        return (y1 - y0) / dt

    def _shot_points(self) -> int:
        inside, beyond = self.points_map
        if self._shooter_court_xy is not None:
            d = math.hypot(
                self._shooter_court_xy[0] - HOOP_COURT_XY[0],
                self._shooter_court_xy[1] - HOOP_COURT_XY[1],
            )
            if d > ARC_RADIUS_M:
                return beyond
        return inside

    def _record_score(self, t: float, out: list[GameEvent]) -> None:
        team = self._shooter_team or self.possession_team or "a"
        points = self._shot_points()
        if team == "a":
            self.score.team_a += points
        else:
            self.score.team_b += points
        player_id = self._player_id(self._shooter_track)
        out.append(
            self._ev(
                t,
                EventType.score,
                team=team,
                player_id=player_id,
                points=points,
                score_after=self.score.model_copy(),
            )
        )
        out.append(self._commentary(t, "score", team, points))
        # streaks: 3+ consecutive scores by the same team
        if team == self._streak_team:
            self._streak_n += 1
        else:
            self._streak_team = team
            self._streak_n = 1
        if self._streak_n >= 3:
            out.append(self._ev(t, EventType.streak, team=team, points=self._streak_n))
            out.append(self._commentary(t, "streak", team, self._streak_n))
        # game over?
        if max(self.score.team_a, self.score.team_b) >= self.target_score:
            out.append(self._ev(t, EventType.game_end, score_after=self.score.model_copy()))
            self._ended = True

    def _update_shot(self, obs: FrameObservation, out: list[GameEvent]) -> None:
        ball = obs.ball
        if ball is None:
            return
        x, y = ball.image_xy
        self._ball_hist.append((obs.t, x, y))
        self._y_min = min(self._y_min, y)
        self._y_max = max(self._y_max, y)
        vy = self._vy()
        if vy is None:
            return
        region = self._hoop_region()

        if self._shot_state == "idle":
            if obs.t < self._shot_until:
                return
            if vy < -UP_VELOCITY_PX_S:
                self._rise_n += 1
            else:
                self._rise_n = 0
            if self._rise_n >= RISE_FRAMES:
                self._shot_state = "rising"
                self._rise_n = 0
                self._arc_min_d = math.inf  # closest approach to the hoop
                self._shooter_team = self.possession_team
                self._shooter_track = self.possession_track
                self._shooter_court_xy = None
                if self.possession_track is not None:
                    for p in obs.players:
                        if p.track_id == self.possession_track:
                            self._shooter_court_xy = p.court_xy
                            break
            return

        if self._shot_state == "rising":
            hit = False
            if region is not None:
                if region[3]:
                    hx, hy, r, _ = region
                    self._arc_min_d = min(self._arc_min_d, math.hypot(x - hx, y - hy))
                    # descending at/below hoop level after passing close to it
                    # (closest approach can happen between samples, so we use
                    # the whole arc's minimum distance, not just this frame)
                    hit = vy > 0 and y >= hy and self._arc_min_d <= 1.2 * r
                else:
                    hit = vy > 0 and self._in_region(x, y, region)
            if hit:
                out.append(
                    self._ev(
                        obs.t,
                        EventType.shot_attempt,
                        team=self._shooter_team,
                        player_id=self._player_id(self._shooter_track),
                    )
                )
                self._shot_state = "pending"
                self._pending_deadline = obs.t + SHOT_PENDING_S
                self._entry_xy = (x, y)
            elif vy > 0 and (
                region is None or y > self._y_min + 0.7 * (self._y_max - self._y_min)
            ):
                # descended most of the way back down without meeting the hoop
                # region: abandon the arc (airball / pass, not a shot)
                self._shot_state = "idle"
            return

        if self._shot_state == "pending":
            hoop_known = region is not None and region[3]
            made = False
            if hoop_known:
                hx, hy, r, _ = region
                made = y > hy + 0.8 * r and abs(x - hx) < 1.5 * r
            else:
                made = y > self._entry_xy[1] + 40 and abs(x - self._entry_xy[0]) < 80
            if made:
                self._shot_state = "idle"
                self._shot_until = obs.t + SHOT_COOLDOWN_S
                self._record_score(obs.t, out)
            elif obs.t > self._pending_deadline or vy < -UP_VELOCITY_PX_S:
                # rim-out / timeout: the attempt stands, no score
                self._shot_state = "idle"
                self._shot_until = obs.t + SHOT_COOLDOWN_S / 2

    # -- public API ---------------------------------------------------------

    def process(self, obs: FrameObservation) -> list[GameEvent]:
        """Consume one frame observation; return the events it produced."""
        if self._ended:
            return []
        out: list[GameEvent] = []
        self._last_t = obs.t
        if obs.calibration is not None:
            self._cal = obs.calibration
        if not self._started:
            self._started = True
            out.append(self._ev(obs.t, EventType.game_start, score_after=self.score.model_copy()))
        self._update_possession(obs, out)
        self._update_oob(obs, out)
        self._update_shot(obs, out)
        return out

    def finalize(self) -> list[GameEvent]:
        """Video ended: close the game if the target score was never reached."""
        if self._ended or not self._started:
            return []
        self._ended = True
        return [self._ev(self._last_t, EventType.game_end, score_after=self.score.model_copy())]
