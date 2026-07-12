"""Compat surface: the FastAPI backend must also serve the Express server's
endpoints with EXACT camelCase shapes (apps/server/src/routes.ts + types.ts),
because the web client (apps/web/src/lib/api.ts) talks to these directly.

These are core contract tests: app.main must import (the `client` fixture
hard-fails otherwise, no skips).
"""
from __future__ import annotations

import json

from tests.helpers import SCOUT_PLAYER_NAME, error_code, scout_card_payload


# ---------------------------------------------------------------------------
# /api/health
# ---------------------------------------------------------------------------

def test_health_shape(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body.get("ok") is True
    counts = body.get("counts") or {}
    assert counts.get("players", 0) > 0
    assert counts.get("films", 0) > 0
    assert body.get("llm") in {"enabled", "offline-fallback"}


def test_health_llm_offline_without_key(client):
    # conftest guarantees OPENAI_API_KEY is unset.
    assert client.get("/api/health").json().get("llm") == "offline-fallback"


# ---------------------------------------------------------------------------
# /api/films
# ---------------------------------------------------------------------------

def _films(client) -> list[dict]:
    r = client.get("/api/films")
    assert r.status_code == 200
    films = r.json()["films"]
    assert isinstance(films, list) and films, "film list must be non-empty"
    return films


def test_films_list_shape(client):
    for film in _films(client):
        assert film["id"]
        assert film["title"]
        assert film["teamA"]["tricode"]
        assert isinstance(film["durationMs"], (int, float)) and film["durationMs"] > 0


def test_film_detail_timeline_and_leaders(client):
    film_id = _films(client)[0]["id"]
    r = client.get(f"/api/films/{film_id}")
    assert r.status_code == 200
    film = r.json()["film"]
    timeline = film["timeline"]
    assert isinstance(timeline, list) and timeline
    for ev in timeline:
        assert isinstance(ev["t"], (int, float))
        assert isinstance(ev["kind"], str) and ev["kind"]
        assert ev["team"] in ("A", "B")
        assert isinstance(ev["scoreA"], (int, float))
        assert isinstance(ev["scoreB"], (int, float))
        assert isinstance(ev["text"], str)
    assert isinstance(film["boxLeaders"], list) and film["boxLeaders"]


def test_film_unknown_404(client):
    r = client.get("/api/films/nope_no_such_film")
    assert r.status_code == 404
    assert error_code(r) == "film_not_found"


# ---------------------------------------------------------------------------
# /api/players (NBA canned data) + /api/leaders + /api/teams
# ---------------------------------------------------------------------------

def test_players_canned_list_shape(client):
    r = client.get("/api/players")
    assert r.status_code == 200
    body = r.json()
    assert "season" in body
    players = body["players"]
    assert isinstance(players, list) and players
    assert body["count"] == len(players)


def test_players_search_filters(client):
    players = client.get("/api/players").json()["players"]
    target = players[0]["name"]
    q = target.lower()
    r = client.get("/api/players", params={"search": q})
    assert r.status_code == 200
    filtered = r.json()["players"]
    assert filtered, f"search for {q!r} should return the player itself"
    for p in filtered:
        assert q in p["name"].lower() or q in p["team"].lower()
    assert any(p["name"] == target for p in filtered)


def test_leaders_ppg_sorted_and_limited(client):
    r = client.get("/api/leaders", params={"category": "ppg", "limit": 5})
    assert r.status_code == 200
    body = r.json()
    assert body["category"] == "ppg"
    leaders = body["leaders"]
    assert 0 < len(leaders) <= 5
    ppgs = [p["ppg"] for p in leaders]
    assert ppgs == sorted(ppgs, reverse=True), "leaders must be sorted desc by ppg"


def test_leaders_invalid_category_falls_back(client):
    r = client.get("/api/leaders", params={"category": "definitely_not_a_stat"})
    assert r.status_code == 200
    assert r.json()["category"] == "ppg"


def test_teams(client):
    r = client.get("/api/teams")
    assert r.status_code == 200
    teams = r.json()["teams"]
    assert isinstance(teams, list) and teams
    assert all(t.get("tricode") for t in teams)


# ---------------------------------------------------------------------------
# /api/commentary
# ---------------------------------------------------------------------------

def test_commentary_engine_source(client):
    r = client.post(
        "/api/commentary",
        json={"event": "score", "teamName": "Red", "scoreA": 5, "scoreB": 3},
    )
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body["text"], str) and body["text"].strip()
    # No OPENAI_API_KEY in the test env, so the deterministic engine answers.
    assert body["source"] == "engine"
    # Score events append the running score line.
    assert "5-3" in body["text"]


def test_commentary_missing_event_rejected(client):
    r = client.post("/api/commentary", json={"teamName": "Red"})
    # routes.ts documents 400; FastAPI-native validation would give 422.
    assert r.status_code in (400, 422)


# ---------------------------------------------------------------------------
# /api/ai/scouting-report
# ---------------------------------------------------------------------------

def test_ai_scouting_report(client):
    r = client.post("/api/ai/scouting-report", json=scout_card_payload())
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body["text"], str) and body["text"].strip()
    assert body["source"] == "engine"
    assert SCOUT_PLAYER_NAME in body["text"]


def test_ai_scouting_report_missing_player_rejected(client):
    r = client.post("/api/ai/scouting-report", json={"sport": "basketball"})
    assert r.status_code in (400, 422)


# ---------------------------------------------------------------------------
# /api/scout/profiles (persisted, shareable scout cards)
# ---------------------------------------------------------------------------

def test_scout_profiles_flow(client):
    payload = scout_card_payload()  # no "report" key: server must auto-fill
    created = client.post("/api/scout/profiles", json=payload)
    assert created.status_code == 201
    card = created.json()["card"]
    assert card["id"]
    assert isinstance(card.get("report"), str) and card["report"].strip(), (
        "server must attach a scouting report when the card has none"
    )

    listed = client.get("/api/scout/profiles")
    assert listed.status_code == 200
    body = listed.json()
    assert body["count"] == len(body["cards"]) >= 1
    assert any(c["id"] == card["id"] for c in body["cards"])

    got = client.get(f"/api/scout/profiles/{card['id']}")
    assert got.status_code == 200
    fetched = got.json()["card"]
    assert fetched["id"] == card["id"]
    assert SCOUT_PLAYER_NAME in json.dumps(fetched)


def test_scout_profile_unknown_404(client):
    assert client.get("/api/scout/profiles/does-not-exist").status_code == 404
