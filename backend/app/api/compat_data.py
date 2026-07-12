"""Canned NBA data + film-room timeline builder.

Faithful Python port of apps/server/src/data/{teams,players,films}.ts —
every record kept, camelCase keys preserved (these dicts are serialized
directly to the frontend), and the mulberry32 PRNG replicated bit-for-bit so
a given film id yields the same replay timeline as the TS server.
"""
from __future__ import annotations

import math
from typing import Any, Optional

# ---------------------------------------------------------------------------
# Teams (data/teams.ts)
# ---------------------------------------------------------------------------

TEAMS: list[dict[str, Any]] = [
    {"tricode": "DAL", "name": "Mavericks", "city": "Dallas", "conference": "West", "primary": "#00538C", "secondary": "#B8C4CA"},
    {"tricode": "BOS", "name": "Celtics", "city": "Boston", "conference": "East", "primary": "#007A33", "secondary": "#BA9653"},
    {"tricode": "OKC", "name": "Thunder", "city": "Oklahoma City", "conference": "West", "primary": "#007AC1", "secondary": "#EF3B24"},
    {"tricode": "MIL", "name": "Bucks", "city": "Milwaukee", "conference": "East", "primary": "#00471B", "secondary": "#EEE1C6"},
    {"tricode": "PHI", "name": "76ers", "city": "Philadelphia", "conference": "East", "primary": "#006BB6", "secondary": "#ED174C"},
    {"tricode": "DEN", "name": "Nuggets", "city": "Denver", "conference": "West", "primary": "#0E2240", "secondary": "#FEC524"},
    {"tricode": "NYK", "name": "Knicks", "city": "New York", "conference": "East", "primary": "#006BB6", "secondary": "#F58426"},
    {"tricode": "PHX", "name": "Suns", "city": "Phoenix", "conference": "West", "primary": "#1D1160", "secondary": "#E56020"},
    {"tricode": "MIN", "name": "Timberwolves", "city": "Minnesota", "conference": "West", "primary": "#0C2340", "secondary": "#236192"},
    {"tricode": "GSW", "name": "Warriors", "city": "Golden State", "conference": "West", "primary": "#1D428A", "secondary": "#FFC72C"},
    {"tricode": "LAL", "name": "Lakers", "city": "Los Angeles", "conference": "West", "primary": "#552583", "secondary": "#FDB927"},
    {"tricode": "LAC", "name": "Clippers", "city": "Los Angeles", "conference": "West", "primary": "#C8102E", "secondary": "#1D428A"},
    {"tricode": "SAC", "name": "Kings", "city": "Sacramento", "conference": "West", "primary": "#5A2D81", "secondary": "#63727A"},
    {"tricode": "IND", "name": "Pacers", "city": "Indiana", "conference": "East", "primary": "#002D62", "secondary": "#FDBB30"},
    {"tricode": "CLE", "name": "Cavaliers", "city": "Cleveland", "conference": "East", "primary": "#860038", "secondary": "#FDBB30"},
    {"tricode": "SAS", "name": "Spurs", "city": "San Antonio", "conference": "West", "primary": "#C4CED4", "secondary": "#000000"},
    {"tricode": "ORL", "name": "Magic", "city": "Orlando", "conference": "East", "primary": "#0077C0", "secondary": "#C4CED4"},
    {"tricode": "ATL", "name": "Hawks", "city": "Atlanta", "conference": "East", "primary": "#E03A3E", "secondary": "#26282A"},
    {"tricode": "NOP", "name": "Pelicans", "city": "New Orleans", "conference": "West", "primary": "#0C2340", "secondary": "#C8102E"},
]

_TEAMS_BY_TRICODE = {t["tricode"]: t for t in TEAMS}


def team_color(tricode: str) -> str:
    t = _TEAMS_BY_TRICODE.get(tricode)
    return t["primary"] if t else "#64748b"


def team_name(tricode: str) -> str:
    t = _TEAMS_BY_TRICODE.get(tricode)
    return f"{t['city']} {t['name']}" if t else tricode


# ---------------------------------------------------------------------------
# Players (data/players.ts) — real 2023-24 regular-season per-game averages
# ---------------------------------------------------------------------------

_RAW_PLAYERS: list[dict[str, Any]] = [
    {"id": "luka-doncic", "name": "Luka Dončić", "team": "DAL", "position": "PG", "jersey": 77, "heightCm": 201, "ppg": 33.9, "rpg": 9.2, "apg": 9.8, "spg": 1.4, "bpg": 0.5, "fgPct": 48.7, "tpPct": 38.2, "ftPct": 78.6, "gamesPlayed": 70},
    {"id": "sga", "name": "Shai Gilgeous-Alexander", "team": "OKC", "position": "PG", "jersey": 2, "heightCm": 198, "ppg": 30.1, "rpg": 5.5, "apg": 6.2, "spg": 2.0, "bpg": 0.9, "fgPct": 53.5, "tpPct": 35.3, "ftPct": 87.4, "gamesPlayed": 75},
    {"id": "giannis", "name": "Giannis Antetokounmpo", "team": "MIL", "position": "PF", "jersey": 34, "heightCm": 211, "ppg": 30.4, "rpg": 11.5, "apg": 6.5, "spg": 1.2, "bpg": 1.1, "fgPct": 61.1, "tpPct": 27.4, "ftPct": 65.7, "gamesPlayed": 73},
    {"id": "embiid", "name": "Joel Embiid", "team": "PHI", "position": "C", "jersey": 21, "heightCm": 213, "ppg": 34.7, "rpg": 11.0, "apg": 5.6, "spg": 1.2, "bpg": 1.7, "fgPct": 52.9, "tpPct": 38.8, "ftPct": 88.3, "gamesPlayed": 39},
    {"id": "jokic", "name": "Nikola Jokić", "team": "DEN", "position": "C", "jersey": 15, "heightCm": 211, "ppg": 26.4, "rpg": 12.4, "apg": 9.0, "spg": 1.4, "bpg": 0.9, "fgPct": 58.3, "tpPct": 35.9, "ftPct": 81.7, "gamesPlayed": 79},
    {"id": "brunson", "name": "Jalen Brunson", "team": "NYK", "position": "PG", "jersey": 11, "heightCm": 188, "ppg": 28.7, "rpg": 3.6, "apg": 6.7, "spg": 0.9, "bpg": 0.2, "fgPct": 47.9, "tpPct": 40.1, "ftPct": 84.7, "gamesPlayed": 77},
    {"id": "tatum", "name": "Jayson Tatum", "team": "BOS", "position": "SF", "jersey": 0, "heightCm": 203, "ppg": 26.9, "rpg": 8.1, "apg": 4.9, "spg": 1.0, "bpg": 0.6, "fgPct": 47.1, "tpPct": 37.6, "ftPct": 83.3, "gamesPlayed": 74},
    {"id": "durant", "name": "Kevin Durant", "team": "PHX", "position": "SF", "jersey": 35, "heightCm": 208, "ppg": 27.1, "rpg": 6.6, "apg": 5.0, "spg": 0.9, "bpg": 1.2, "fgPct": 52.3, "tpPct": 41.3, "ftPct": 85.6, "gamesPlayed": 75},
    {"id": "booker", "name": "Devin Booker", "team": "PHX", "position": "SG", "jersey": 1, "heightCm": 196, "ppg": 27.1, "rpg": 4.5, "apg": 6.9, "spg": 0.9, "bpg": 0.4, "fgPct": 49.2, "tpPct": 36.4, "ftPct": 88.6, "gamesPlayed": 68},
    {"id": "ant", "name": "Anthony Edwards", "team": "MIN", "position": "SG", "jersey": 5, "heightCm": 193, "ppg": 25.9, "rpg": 5.4, "apg": 5.1, "spg": 1.3, "bpg": 0.5, "fgPct": 46.1, "tpPct": 35.7, "ftPct": 83.6, "gamesPlayed": 79},
    {"id": "curry", "name": "Stephen Curry", "team": "GSW", "position": "PG", "jersey": 30, "heightCm": 188, "ppg": 26.4, "rpg": 4.5, "apg": 5.1, "spg": 0.7, "bpg": 0.4, "fgPct": 45.0, "tpPct": 40.8, "ftPct": 92.3, "gamesPlayed": 74},
    {"id": "lebron", "name": "LeBron James", "team": "LAL", "position": "SF", "jersey": 23, "heightCm": 206, "ppg": 25.7, "rpg": 7.3, "apg": 8.3, "spg": 1.3, "bpg": 0.5, "fgPct": 54.0, "tpPct": 41.0, "ftPct": 75.0, "gamesPlayed": 71},
    {"id": "ad", "name": "Anthony Davis", "team": "LAL", "position": "PF", "jersey": 3, "heightCm": 208, "ppg": 24.7, "rpg": 12.6, "apg": 3.5, "spg": 1.2, "bpg": 2.3, "fgPct": 55.6, "tpPct": 27.1, "ftPct": 81.6, "gamesPlayed": 76},
    {"id": "kawhi", "name": "Kawhi Leonard", "team": "LAC", "position": "SF", "jersey": 2, "heightCm": 201, "ppg": 23.7, "rpg": 6.1, "apg": 3.6, "spg": 1.6, "bpg": 0.9, "fgPct": 52.5, "tpPct": 41.7, "ftPct": 88.5, "gamesPlayed": 68},
    {"id": "dame", "name": "Damian Lillard", "team": "MIL", "position": "PG", "jersey": 0, "heightCm": 188, "ppg": 24.3, "rpg": 4.4, "apg": 7.0, "spg": 1.0, "bpg": 0.3, "fgPct": 42.4, "tpPct": 35.4, "ftPct": 92.0, "gamesPlayed": 73},
    {"id": "fox", "name": "De'Aaron Fox", "team": "SAC", "position": "PG", "jersey": 5, "heightCm": 191, "ppg": 26.6, "rpg": 4.6, "apg": 5.6, "spg": 2.0, "bpg": 0.4, "fgPct": 46.5, "tpPct": 36.9, "ftPct": 73.8, "gamesPlayed": 74},
    {"id": "sabonis", "name": "Domantas Sabonis", "team": "SAC", "position": "C", "jersey": 10, "heightCm": 211, "ppg": 19.4, "rpg": 13.7, "apg": 8.2, "spg": 0.9, "bpg": 0.6, "fgPct": 59.4, "tpPct": 37.9, "ftPct": 70.4, "gamesPlayed": 82},
    {"id": "haliburton", "name": "Tyrese Haliburton", "team": "IND", "position": "PG", "jersey": 0, "heightCm": 196, "ppg": 20.1, "rpg": 3.9, "apg": 10.9, "spg": 1.2, "bpg": 0.7, "fgPct": 47.7, "tpPct": 36.4, "ftPct": 85.5, "gamesPlayed": 69},
    {"id": "mitchell", "name": "Donovan Mitchell", "team": "CLE", "position": "SG", "jersey": 45, "heightCm": 185, "ppg": 26.6, "rpg": 5.1, "apg": 6.1, "spg": 1.8, "bpg": 0.5, "fgPct": 46.2, "tpPct": 36.8, "ftPct": 86.6, "gamesPlayed": 55},
    {"id": "wemby", "name": "Victor Wembanyama", "team": "SAS", "position": "C", "jersey": 1, "heightCm": 224, "ppg": 21.4, "rpg": 10.6, "apg": 3.9, "spg": 1.2, "bpg": 3.6, "fgPct": 46.5, "tpPct": 32.5, "ftPct": 79.6, "gamesPlayed": 71},
    {"id": "jbrown", "name": "Jaylen Brown", "team": "BOS", "position": "SG", "jersey": 7, "heightCm": 198, "ppg": 23.0, "rpg": 5.5, "apg": 3.6, "spg": 1.2, "bpg": 0.5, "fgPct": 49.9, "tpPct": 35.4, "ftPct": 70.3, "gamesPlayed": 70},
    {"id": "paolo", "name": "Paolo Banchero", "team": "ORL", "position": "PF", "jersey": 5, "heightCm": 208, "ppg": 22.6, "rpg": 6.9, "apg": 5.4, "spg": 0.9, "bpg": 0.6, "fgPct": 45.5, "tpPct": 33.9, "ftPct": 72.5, "gamesPlayed": 80},
    {"id": "trae", "name": "Trae Young", "team": "ATL", "position": "PG", "jersey": 11, "heightCm": 185, "ppg": 25.7, "rpg": 2.8, "apg": 10.8, "spg": 1.3, "bpg": 0.2, "fgPct": 43.0, "tpPct": 37.3, "ftPct": 85.8, "gamesPlayed": 54},
    {"id": "zion", "name": "Zion Williamson", "team": "NOP", "position": "PF", "jersey": 1, "heightCm": 198, "ppg": 22.9, "rpg": 5.8, "apg": 5.0, "spg": 1.1, "bpg": 0.7, "fgPct": 57.0, "tpPct": 33.3, "ftPct": 70.5, "gamesPlayed": 70},
]

PLAYERS: list[dict[str, Any]] = [{**p, "teamName": team_name(p["team"])} for p in _RAW_PLAYERS]

_PLAYERS_BY_ID = {p["id"]: p for p in PLAYERS}

LEADER_CATEGORIES = ("ppg", "rpg", "apg", "spg", "bpg")


def player_by_id(pid: str) -> Optional[dict[str, Any]]:
    return _PLAYERS_BY_ID.get(pid)


def leaders(category: str, limit: int = 10) -> list[dict[str, Any]]:
    return sorted(PLAYERS, key=lambda p: p[category], reverse=True)[:limit]


# ---------------------------------------------------------------------------
# Films (data/films.ts) — real famous 2023-24 games, deterministic replays
# ---------------------------------------------------------------------------

_FILM_SEEDS: list[dict[str, Any]] = [
    {
        "id": "luka-73",
        "title": "Luka Dončić drops 73",
        "subtitle": "3rd-highest single-game total in NBA history",
        "date": "2024-01-26",
        "season": "2023-24",
        "a": {"tricode": "DAL", "name": "Mavericks", "final": 148},
        "b": {"tricode": "ATL", "name": "Hawks", "final": 143},
        "headline": "Luka pours in 73 to outduel Atlanta in a shootout for the ages.",
        "starLine": "Dončić: 73 PTS · 10 REB · 7 AST · 25/33 FG",
        "youtubeUrl": "https://www.youtube.com/watch?v=GRblNTXolvo",
        "tags": ["Career-high", "Shootout", "MVP form"],
        "boxLeaders": [
            {"name": "Luka Dončić", "team": "A", "line": "73 PTS · 10 REB · 7 AST"},
            {"name": "Trae Young", "team": "B", "line": "22 PTS · 15 AST"},
            {"name": "Dejounte Murray", "team": "B", "line": "23 PTS · 6 AST"},
        ],
    },
    {
        "id": "embiid-70",
        "title": "Joel Embiid explodes for 70",
        "subtitle": "First 70-point game in 76ers history",
        "date": "2024-01-22",
        "season": "2023-24",
        "a": {"tricode": "PHI", "name": "76ers", "final": 133},
        "b": {"tricode": "SAS", "name": "Spurs", "final": 123},
        "headline": "Embiid sets the franchise record and outscores Wembanyama's Spurs by himself in stretches.",
        "starLine": "Embiid: 70 PTS · 18 REB · 5 AST · 24/41 FG",
        "youtubeUrl": "https://www.youtube.com/watch?v=9SjvZPFiDH0",
        "tags": ["Franchise record", "70-point game", "Big-man clinic"],
        "boxLeaders": [
            {"name": "Joel Embiid", "team": "A", "line": "70 PTS · 18 REB · 5 AST"},
            {"name": "Victor Wembanyama", "team": "B", "line": "33 PTS · 7 REB · 6 BLK"},
            {"name": "Devin Vassell", "team": "B", "line": "25 PTS"},
        ],
    },
    {
        "id": "finals-g5-2024",
        "title": "2024 NBA Finals · Game 5",
        "subtitle": "Celtics clinch banner 18",
        "date": "2024-06-17",
        "season": "2023-24 Playoffs",
        "a": {"tricode": "BOS", "name": "Celtics", "final": 106},
        "b": {"tricode": "DAL", "name": "Mavericks", "final": 88},
        "headline": "Boston closes the series 4-1; Jaylen Brown takes Finals MVP.",
        "starLine": "Brown: 21 PTS · Tatum: 31 PTS, 11 AST, 8 REB",
        "youtubeUrl": "https://www.youtube.com/watch?v=6kW6N2Ax9XA",
        "tags": ["Championship", "Finals MVP", "Clincher"],
        "boxLeaders": [
            {"name": "Jayson Tatum", "team": "A", "line": "31 PTS · 11 AST · 8 REB"},
            {"name": "Jaylen Brown", "team": "A", "line": "21 PTS · Finals MVP"},
            {"name": "Kyrie Irving", "team": "B", "line": "15 PTS"},
        ],
    },
    {
        "id": "wemby-5x5",
        "title": "Wembanyama's historic 5×5",
        "subtitle": "Youngest player ever with a 5×5 game",
        "date": "2024-01-13",
        "season": "2023-24",
        "a": {"tricode": "SAS", "name": "Spurs", "final": 130},
        "b": {"tricode": "DET", "name": "Pistons", "final": 108},
        "headline": "Victor stuffs every column and anchors the paint like a franchise cornerstone.",
        "starLine": "Wembanyama: 27 PTS · 10 REB · 5 AST · 5 STL · 5 BLK",
        "youtubeUrl": "https://www.youtube.com/watch?v=D2-ZVVxU1Wk",
        "tags": ["Rookie", "Two-way", "History"],
        "boxLeaders": [
            {"name": "Victor Wembanyama", "team": "A", "line": "27 PTS · 10 REB · 5 STL · 5 BLK"},
            {"name": "Devin Vassell", "team": "A", "line": "20 PTS"},
            {"name": "Cade Cunningham", "team": "B", "line": "31 PTS · 7 AST"},
        ],
    },
    {
        "id": "sga-thunder",
        "title": "SGA leads the 1-seed Thunder",
        "subtitle": "MVP-caliber two-way masterclass · West semis G4",
        "date": "2024-05-13",
        "season": "2023-24 Playoffs",
        "a": {"tricode": "OKC", "name": "Thunder", "final": 100},
        "b": {"tricode": "DAL", "name": "Mavericks", "final": 96},
        "headline": "Shai's mid-range and defense even the series 2–2 in Dallas.",
        "starLine": "Gilgeous-Alexander: 34 PTS · 8 REB · 5 AST",
        "youtubeUrl": "https://www.youtube.com/watch?v=4g98FQb54No",
        "tags": ["MVP race", "Playoffs", "Two-way"],
        "boxLeaders": [
            {"name": "Shai Gilgeous-Alexander", "team": "A", "line": "34 PTS · 8 REB · 5 AST"},
            {"name": "Chet Holmgren", "team": "A", "line": "15 PTS · 9 REB"},
            {"name": "Luka Dončić", "team": "B", "line": "29 PTS · 10 REB · 5 AST"},
        ],
    },
]

QUARTER_MS = 12 * 60 * 1000
GAME_MS = 4 * QUARTER_MS

_U32 = 0xFFFFFFFF


def _imul(a: int, b: int) -> int:
    """JS Math.imul as a uint32 bit pattern."""
    return (a * b) & _U32


def _rng(seed_str: str):
    """mulberry32 seeded like the TS version — identical output sequence."""
    h = (1779033703 ^ len(seed_str)) & _U32
    for ch in seed_str:
        h = _imul(h ^ ord(ch), 3432918353)
        h = ((h << 13) & _U32) | (h >> 19)
    a = h

    def rand() -> float:
        nonlocal a
        a = (a + 0x6D2B79F5) & _U32
        t = _imul(a ^ (a >> 15), (1 | a) & _U32)
        t = ((t + _imul(t ^ (t >> 7), (61 | t) & _U32)) ^ t) & _U32
        return (t ^ (t >> 14)) / 4294967296

    return rand


def _clock_for(t_in_quarter: int) -> str:
    remaining = max(0, QUARTER_MS - t_in_quarter)
    total = remaining // 1000
    return f"{total // 60:02d}:{total % 60:02d}"


def _team_label(seed: dict[str, Any], team: str) -> str:
    return seed["a"]["name"] if team == "A" else seed["b"]["name"]


def _build_timeline(seed: dict[str, Any]) -> list[dict[str, Any]]:
    """Port of buildTimeline(): same PRNG draws, same events, same order."""
    rand = _rng(seed["id"])
    events: list[dict[str, Any]] = []
    score_a = 0
    score_b = 0
    streak_team: Optional[str] = None
    streak = 0

    def emit_scores_for_team(target: int) -> list[int]:
        remaining = target
        buckets: list[int] = []
        while remaining > 0:
            if remaining >= 3 and rand() < 0.36:
                buckets.append(3)
                remaining -= 3
            elif remaining >= 2:
                buckets.append(2)
                remaining -= 2
            else:
                buckets.append(1)
                remaining -= 1
        return buckets

    buckets_a = emit_scores_for_team(seed["a"]["final"])
    buckets_b = emit_scores_for_team(seed["b"]["final"])

    baskets = [{"team": "A", "pts": p} for p in buckets_a] + [
        {"team": "B", "pts": p} for p in buckets_b
    ]
    for i in range(len(baskets) - 1, 0, -1):
        j = math.floor(rand() * (i + 1))
        baskets[i], baskets[j] = baskets[j], baskets[i]

    for idx, b in enumerate(baskets):
        t = math.floor(((idx + 0.5) / len(baskets)) * GAME_MS)
        quarter = min(4, t // QUARTER_MS + 1)
        t_in_quarter = t - (quarter - 1) * QUARTER_MS
        if b["team"] == "A":
            score_a += b["pts"]
        else:
            score_b += b["pts"]

        if streak_team == b["team"]:
            streak += 1
        else:
            streak_team = b["team"]
            streak = 1

        if b["pts"] == 3:
            text = f"{_team_label(seed, b['team'])} drills a three"
        elif b["pts"] == 2:
            text = f"{_team_label(seed, b['team'])} finishes at the rim"
        else:
            text = f"{_team_label(seed, b['team'])} at the line"
        events.append(
            {
                "id": f"{seed['id']}-s{idx}",
                "t": t,
                "quarter": quarter,
                "clock": _clock_for(t_in_quarter),
                "kind": "score",
                "team": b["team"],
                "scoreA": score_a,
                "scoreB": score_b,
                "value": b["pts"],
                "text": text,
            }
        )

        if streak >= 4:
            events.append(
                {
                    "id": f"{seed['id']}-run{idx}",
                    "t": t + 400,
                    "quarter": quarter,
                    "clock": _clock_for(t_in_quarter),
                    "kind": "streak",
                    "team": b["team"],
                    "scoreA": score_a,
                    "scoreB": score_b,
                    "value": streak,
                    "text": f"{_team_label(seed, b['team'])} on a {streak}-basket run — timeout territory",
                }
            )
            streak = 0
        if rand() < 0.05:
            events.append(
                {
                    "id": f"{seed['id']}-wh{idx}",
                    "t": t + 700,
                    "quarter": quarter,
                    "clock": _clock_for(t_in_quarter),
                    "kind": "whistle",
                    "team": "B" if b["team"] == "A" else "A",
                    "scoreA": score_a,
                    "scoreB": score_b,
                    "text": "Anact Ortho flags a boundary crossing — auto-whistle",
                }
            )

    events.sort(key=lambda e: e["t"])
    return events


def _to_game(s: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": s["id"],
        "title": s["title"],
        "subtitle": s["subtitle"],
        "date": s["date"],
        "season": s["season"],
        "teamA": {"tricode": s["a"]["tricode"], "name": s["a"]["name"], "color": team_color(s["a"]["tricode"]), "final": s["a"]["final"]},
        "teamB": {"tricode": s["b"]["tricode"], "name": s["b"]["name"], "color": team_color(s["b"]["tricode"]), "final": s["b"]["final"]},
        "headline": s["headline"],
        "starLine": s["starLine"],
        "youtubeUrl": s["youtubeUrl"],
        "durationMs": GAME_MS,
        "tags": s["tags"],
    }


def list_films() -> list[dict[str, Any]]:
    return [_to_game(s) for s in _FILM_SEEDS]


def film_detail(film_id: str) -> Optional[dict[str, Any]]:
    seed = next((s for s in _FILM_SEEDS if s["id"] == film_id), None)
    if seed is None:
        return None
    return {**_to_game(seed), "timeline": _build_timeline(seed), "boxLeaders": seed["boxLeaders"]}
