"""Film Room AI coach endpoint — works offline via deterministic engine."""
from __future__ import annotations


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
    "mode": "scout",
    "scoreA": 40,
    "scoreB": 28,
    "quarter": 2,
    "clock": "06:12",
    "lastEvent": "76ers drills a three",
}


def test_film_ai_line(client):
    r = client.post("/api/ai/film", json={**FILM, "action": "line"})
    assert r.status_code == 200
    body = r.json()
    assert body["source"] in ("engine", "llm")
    assert isinstance(body["text"], str) and len(body["text"]) > 8


def test_film_ai_ask(client):
    r = client.post(
        "/api/ai/film",
        json={**FILM, "action": "ask", "question": "Why was that a good shot?"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["source"] in ("engine", "llm")
    assert "shot" in body["text"].lower() or "balance" in body["text"].lower() or len(body["text"]) > 20


def test_film_ai_moment_quiz_recap_chapters(client):
    for action in ("moment", "quiz", "recap"):
        r = client.post("/api/ai/film", json={**FILM, "action": action})
        assert r.status_code == 200, action
        body = r.json()
        assert body["source"] in ("engine", "llm")
        if action == "moment":
            assert body["moment"]["what"] and body["moment"]["why"]
        if action == "quiz":
            assert len(body["quiz"]["options"]) >= 2
        if action == "recap":
            assert body["recap"]["star"] and body["recap"]["drill"]

    r = client.post(
        "/api/ai/film",
        json={
            **FILM,
            "action": "chapters",
            "timeline": [
                {"t": 0, "quarter": 1, "text": "tip", "scoreA": 2, "scoreB": 0},
                {"t": 700000, "quarter": 2, "text": "mid", "scoreA": 40, "scoreB": 30},
            ],
        },
    )
    assert r.status_code == 200
    assert len(r.json()["chapters"]) >= 1


def test_film_ai_rejects_bad_payload(client):
    r = client.post("/api/ai/film", json={"action": "line"})
    assert r.status_code == 400
    r = client.post("/api/ai/film", json={**FILM, "action": "nope"})
    assert r.status_code == 400
