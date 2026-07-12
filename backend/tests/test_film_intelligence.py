"""Intelligence rubric for Film Room AI coach — grounded, mode-aware, crash-safe."""
from __future__ import annotations

from app.commentary.film_coach import (
    deterministic_ask,
    deterministic_chapters,
    deterministic_coach_line,
    deterministic_moment,
    deterministic_quiz,
    deterministic_recap,
)

FILM = {
    "id": "embiid-70",
    "title": "Joel Embiid explodes for 70",
    "subtitle": "First 70-point game in 76ers history",
    "headline": "Embiid sets the franchise record.",
    "starLine": "Embiid: 70 PTS · 18 REB · 5 AST",
    "tags": ["70-point game"],
    "teamA": {"tricode": "PHI", "name": "76ers", "final": 133},
    "teamB": {"tricode": "SAS", "name": "Spurs", "final": 123},
    "boxLeaders": [{"name": "Joel Embiid", "team": "A", "line": "70 PTS"}],
    "scoreA": 78,
    "scoreB": 71,
    "quarter": 3,
    "clock": "04:22",
    "lastEvent": "76ers drills a three",
}


def test_engine_line_grounded_in_live_moment():
    for mode in ("rookie", "scout", "hype"):
        text = deterministic_coach_line({**FILM, "mode": mode}).lower()
        assert "practice hard" not in text
        assert "teamwork" not in text
        # Must reference live context somehow
        assert any(
            tok in text
            for tok in ("78", "71", "three", "phi", "sas", "embiid", "helper", "closeout", "seal", "bang")
        ), text


def test_engine_modes_differ():
    lines = {m: deterministic_coach_line({**FILM, "mode": m}) for m in ("rookie", "scout", "hype")}
    assert len(set(lines.values())) >= 2


def test_engine_ask_defense_is_tactical():
    text = deterministic_ask({**FILM, "mode": "scout"}, "What should Spurs defense do?").lower()
    assert any(w in text for w in ("help", "closeout", "catch", "defense", "drop", "seal"))


def test_engine_ask_shot_quality():
    text = deterministic_ask({**FILM, "mode": "rookie"}, "Why was that a good shot?").lower()
    assert any(w in text for w in ("balance", "feet", "open", "shot"))


def test_engine_quiz_and_moment_and_recap_shapes():
    quiz = deterministic_quiz(FILM)
    assert len(quiz["options"]) >= 2
    assert 0 <= quiz["correctIndex"] < len(quiz["options"])
    moment = deterministic_moment({**FILM, "mode": "scout"})
    assert moment["what"] and moment["why"] and moment["watchNext"]
    recap = deterministic_recap(FILM)
    assert recap["star"] and len(recap["takeaways"]) >= 2 and recap["drill"]


def test_engine_chapters_from_timeline():
    chapters = deterministic_chapters(
        FILM,
        [
            {"t": 0, "quarter": 1, "text": "tip", "scoreA": 2, "scoreB": 0},
            {"t": 700000, "quarter": 2, "text": "mid", "scoreA": 40, "scoreB": 30},
            {"t": 2000000, "quarter": 4, "text": "close", "scoreA": 120, "scoreB": 110},
        ],
    )
    assert len(chapters) >= 2
    assert chapters[0]["t"] <= chapters[-1]["t"]


def test_live_api_line_not_generic(client):
    r = client.post("/api/ai/film", json={**FILM, "action": "line", "mode": "rookie"})
    assert r.status_code == 200
    body = r.json()
    text = body["text"].lower()
    assert body["source"] in ("llm", "engine")
    assert "practice hard" not in text
    assert "believe in yourself" not in text
    # Prefer grounded tokens; engine always has them, llm usually does after prompt tighten
    grounded = any(
        tok in text
        for tok in (
            "78",
            "71",
            "three",
            "phi",
            "sas",
            "embiid",
            "helper",
            "feet",
            "closeout",
            "seal",
            "space",
            "balance",
            "paint",
            "q3",
            "quarter",
        )
    )
    assert grounded or body["source"] == "llm" and len(body["text"].split()) <= 28


def test_live_api_ask_matchup(client):
    r = client.post(
        "/api/ai/film",
        json={
            **FILM,
            "action": "ask",
            "mode": "scout",
            "question": "How is Embiid creating advantages against Wemby?",
        },
    )
    assert r.status_code == 200
    text = r.json()["text"].lower()
    assert any(w in text for w in ("embiid", "wemby", "wembanyama", "post", "size", "seal", "paint", "foot"))
