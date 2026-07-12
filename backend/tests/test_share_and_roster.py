"""Own-roster CRUD + public share-token flow.

Compat note: GET /api/players is the NBA canned dataset, so our own player
CRUD lives at /api/roster; but API_CONTRACT.md section 3 documents it at
/api/players. These tests probe /api/roster first and fall back, per the
final-contract-wins rule.
"""
from __future__ import annotations

import json

import pytest


def _create_player(client, payload: dict) -> tuple[str, dict]:
    """Returns (base_path, created_body) using whichever CRUD base exists."""
    r = client.post("/api/roster", json=payload)
    if r.status_code in (200, 201):
        return "/api/roster", r.json()
    r2 = client.post("/api/players", json=payload)
    if r2.status_code in (200, 201):
        return "/api/players", r2.json()
    pytest.fail(
        "no player CRUD endpoint responded: "
        f"POST /api/roster -> {r.status_code}, POST /api/players -> {r2.status_code}"
    )


def _player_id(body: dict) -> str:
    for key in ("player_id", "id"):
        if body.get(key):
            return body[key]
    nested = body.get("player")
    if isinstance(nested, dict):
        for key in ("player_id", "id"):
            if nested.get(key):
                return nested[key]
    pytest.fail(f"create-player response carries no player id: {body}")


def _unwrap_players(body):
    if isinstance(body, list):
        return body
    if isinstance(body, dict):
        for key in ("players", "roster", "items"):
            if isinstance(body.get(key), list):
                return body[key]
    pytest.fail(f"could not find a player list in: {type(body).__name__}")


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

def test_roster_crud(client, fresh_db):
    base, created = _create_player(
        client, {"name": "Test Baller", "position": "PG", "height_cm": 183}
    )
    pid = _player_id(created)

    # Read back by id.
    got = client.get(f"{base}/{pid}")
    assert got.status_code == 200
    assert "Test Baller" in json.dumps(got.json())

    # Appears in the list.
    lst = client.get(base)
    assert lst.status_code == 200
    players = _unwrap_players(lst.json())
    assert any(_matches_id(p, pid) for p in players), f"{pid} missing from {base} list"

    # PATCH updates a field.
    patched = client.patch(f"{base}/{pid}", json={"position": "SG"})
    assert patched.status_code in (200, 204)
    got2 = client.get(f"{base}/{pid}")
    assert got2.status_code == 200
    assert '"SG"' in json.dumps(got2.json()), "PATCHed position must persist"


def _matches_id(player: dict, pid: str) -> bool:
    return player.get("player_id") == pid or player.get("id") == pid


def test_roster_unknown_player_404(client):
    r = client.get("/api/roster/p_zzz_does_not_exist")
    if r.status_code == 404 and not r.text.strip():
        return  # bare 404 acceptable
    if r.status_code != 404:
        # roster base may not exist; the contract fallback is /api/players,
        # where unknown ids must also 404.
        r = client.get("/api/players/p_zzz_does_not_exist")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Share tokens
# ---------------------------------------------------------------------------

def _share(client, base: str, pid: str):
    r = client.post(f"{base}/{pid}/share")
    if r.status_code in (200, 201):
        return r
    other = "/api/players" if base == "/api/roster" else "/api/roster"
    return client.post(f"{other}/{pid}/share")


def test_share_token_flow(client, fresh_db):
    base, created = _create_player(client, {"name": "Share Me Jones", "position": "SF"})
    pid = _player_id(created)

    sr = _share(client, base, pid)
    assert sr.status_code in (200, 201), f"share endpoint failed: {sr.status_code} {sr.text}"
    body = sr.json()
    token = body["share_token"]
    assert token
    assert body.get("share_url"), "share response must include share_url"
    assert token in body["share_url"]

    pub = client.get(f"/api/share/{token}")
    assert pub.status_code == 200
    assert "Share Me Jones" in json.dumps(pub.json()), (
        "public share payload must include the player's name"
    )


def test_share_unknown_token_404(client):
    assert client.get("/api/share/s_zzz_does_not_exist").status_code == 404
