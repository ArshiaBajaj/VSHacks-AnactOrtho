"""Shared Pydantic schemas — the single source of truth for API shapes.

Both the CV/analytics side and the API/engine side import from here.
Keep in sync with API_CONTRACT.md.
"""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class GameStatus(str, Enum):
    queued = "queued"
    processing = "processing"
    done = "done"
    error = "error"


class EventType(str, Enum):
    game_start = "game_start"
    game_end = "game_end"
    score = "score"
    shot_attempt = "shot_attempt"
    out_of_bounds = "out_of_bounds"
    whistle = "whistle"
    streak = "streak"
    commentary = "commentary"
    possession_change = "possession_change"
    status = "status"  # WS-only


class Score(BaseModel):
    team_a: int = 0
    team_b: int = 0


class GameEvent(BaseModel):
    event_id: str
    t: float = Field(description="Seconds from start of video")
    type: EventType
    team: Optional[str] = None  # "a" | "b"
    player_id: Optional[str] = None
    points: Optional[int] = None
    score_after: Optional[Score] = None
    text: Optional[str] = None
    audio_url: Optional[str] = None


class PlayerIn(BaseModel):
    name: str
    position: Optional[str] = None
    height_cm: Optional[float] = None
    jersey_hint: Optional[str] = None


class Player(PlayerIn):
    player_id: str


class Heatmap(BaseModel):
    grid_w: int = 30
    grid_h: int = 17
    cells: list[list[int]] = Field(default_factory=list, description="Sparse [x, y, count] triples")


class PlayerAnalytics(BaseModel):
    player_id: str
    name: str
    points: int = 0
    shot_attempts: int = 0
    shots_made: int = 0
    max_vertical_jump_cm: Optional[float] = None
    avg_shot_release_velocity_ms: Optional[float] = None
    top_speed_ms: Optional[float] = None
    distance_covered_m: Optional[float] = None
    heatmap: Heatmap = Field(default_factory=Heatmap)


class TeamStats(BaseModel):
    points: int = 0
    fg_attempts: int = 0
    fg_made: int = 0


class GameAnalytics(BaseModel):
    game_id: str
    team_stats: dict[str, TeamStats] = Field(default_factory=dict)
    players: list[PlayerAnalytics] = Field(default_factory=list)
    ball_heatmap: Heatmap = Field(default_factory=Heatmap)


class Highlight(BaseModel):
    highlight_id: str
    t_start: float
    t_end: float
    label: str
    video_url: Optional[str] = None
    thumb_url: Optional[str] = None


class GameSummary(BaseModel):
    game_id: str
    title: Optional[str] = None
    status: GameStatus = GameStatus.queued
    created_at: Optional[datetime] = None
    duration_s: Optional[float] = None
    final_score: Optional[Score] = None


class GameDetail(GameSummary):
    progress: float = 0.0
    error: Optional[str] = None
    players: list[Player] = Field(default_factory=list)


class ShareLink(BaseModel):
    share_token: str
    share_url: str
