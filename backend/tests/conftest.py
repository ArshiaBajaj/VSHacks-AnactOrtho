"""Shared fixtures for the CourtVision AI backend test suite.

CRITICAL ORDERING: app.config resolves COURTVISION_DATA_DIR at import time,
so the environment is prepared here at the very top of conftest, BEFORE any
app.* module can possibly be imported. Tests therefore never touch the real
backend/data directory.

We also unset OPENAI_API_KEY so every commentary/scouting path exercises the
deterministic "engine" fallback (source == "engine", llm == "offline-fallback").
"""
from __future__ import annotations

import os
import tempfile

_DATA_DIR = tempfile.mkdtemp(prefix="courtvision_tests_")
os.environ["COURTVISION_DATA_DIR"] = _DATA_DIR
os.environ.pop("OPENAI_API_KEY", None)

import pytest  # noqa: E402


@pytest.fixture(scope="session")
def data_dir() -> str:
    """The isolated data dir every app module is pointed at."""
    return _DATA_DIR


@pytest.fixture(scope="session")
def client():
    """TestClient over the real ASGI app.

    app.main is a CORE contract: if it cannot be imported the API tests must
    hard-fail (ImportError surfaces as an error, never a skip). The import is
    done lazily here only so that test COLLECTION stays clean while the two
    coder agents are still landing modules.
    """
    from fastapi.testclient import TestClient

    from app.main import app as fastapi_app

    with TestClient(fastapi_app) as c:
        yield c


# ---------------------------------------------------------------------------
# fresh_db: best-effort isolation between tests that create rows.
# ---------------------------------------------------------------------------

_ID_TABLES = [
    ("games", "game_id"),
    ("players", "player_id"),
    ("shares", "share_token"),
]
_GAME_CHILD_TABLES = ["events", "highlights", "analytics", "game_players"]


def _snapshot_ids() -> dict[str, set]:
    from app import db

    out: dict[str, set] = {}
    with db.get_conn() as conn:
        for table, key in _ID_TABLES:
            try:
                out[table] = {row[0] for row in conn.execute(f"SELECT {key} FROM {table}")}
            except Exception:
                out[table] = set()
    return out


@pytest.fixture()
def fresh_db(client):
    """Yields the app.db module; on teardown deletes any rows the test created
    (games + their child rows, players, shares). Never touches pre-existing
    seed data such as the built-in g_sample game.

    Depends on `client` so the app has started and the schema/sample data are
    guaranteed to exist first.
    """
    from app import db

    before = _snapshot_ids()
    yield db
    after = _snapshot_ids()
    try:
        with db.get_conn() as conn:
            new_games = after.get("games", set()) - before.get("games", set())
            for gid in new_games:
                for child in _GAME_CHILD_TABLES:
                    try:
                        conn.execute(f"DELETE FROM {child} WHERE game_id = ?", (gid,))
                    except Exception:
                        pass
            for table, key in _ID_TABLES:
                for new_id in after.get(table, set()) - before.get(table, set()):
                    try:
                        conn.execute(f"DELETE FROM {table} WHERE {key} = ?", (new_id,))
                    except Exception:
                        pass
    except Exception:
        # Cleanup is best-effort; never fail a test in teardown for this.
        pass
