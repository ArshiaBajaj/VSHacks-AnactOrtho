"""API layer. register_routes() wires every router onto the app."""
from __future__ import annotations

import asyncio

from fastapi import FastAPI


def register_routes(app: FastAPI) -> None:
    from app.api.common import register_error_handlers
    from app.api.routes_compat import router as compat_router
    from app.api.routes_games import router as games_router
    from app.api.routes_live import router as live_router
    from app.api.routes_meta import router as meta_router
    from app.api.routes_players import router as players_router
    from app.api.routes_share import router as share_router
    from app.api.ws import router as ws_router

    register_error_handlers(app)

    app.include_router(meta_router, prefix="/api")
    app.include_router(games_router, prefix="/api")
    app.include_router(players_router, prefix="/api")  # roster CRUD (/api/roster)
    app.include_router(share_router, prefix="/api")
    app.include_router(compat_router, prefix="/api")  # NBA data, films, scout cards
    app.include_router(live_router, prefix="/api")  # live sessions, identify, leaderboards
    app.include_router(ws_router)

    @app.on_event("startup")
    async def _startup() -> None:
        # bind the server loop so worker threads can publish live events
        from app.engine.events import bus
        from app.workers.sample import ensure_sample_game

        bus.bind_loop(asyncio.get_running_loop())
        ensure_sample_game()
