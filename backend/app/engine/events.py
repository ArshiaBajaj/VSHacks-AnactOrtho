"""Per-game asyncio pub/sub event bus.

The processor runs in a worker thread; WebSocket handlers run on the event
loop. `publish()` is therefore thread-safe: it hands items to subscriber
queues via `loop.call_soon_threadsafe`. Items are plain JSON-ready dicts
(event payloads or status payloads); `CLOSE` is a sentinel object broadcast
by `close()` to tell subscribers the stream is over.
"""
from __future__ import annotations

import asyncio
import threading
from typing import Any

#: Sentinel broadcast on `close(game_id)` — never sent over the wire.
CLOSE: Any = object()


class EventBus:
    """Fan-out pub/sub keyed by game_id. One asyncio.Queue per subscriber."""

    def __init__(self) -> None:
        self._subs: dict[str, list[asyncio.Queue]] = {}
        self._lock = threading.Lock()
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """Bind the server event loop (called once at app startup)."""
        self._loop = loop

    def subscribe(self, game_id: str) -> asyncio.Queue:
        """Register a new subscriber queue for a game. Call from async code."""
        if self._loop is None:
            try:
                self._loop = asyncio.get_running_loop()
            except RuntimeError:
                pass
        q: asyncio.Queue = asyncio.Queue()
        with self._lock:
            self._subs.setdefault(game_id, []).append(q)
        return q

    def unsubscribe(self, game_id: str, q: asyncio.Queue) -> None:
        """Remove a subscriber queue (idempotent)."""
        with self._lock:
            lst = self._subs.get(game_id)
            if lst is not None:
                if q in lst:
                    lst.remove(q)
                if not lst:
                    self._subs.pop(game_id, None)

    def publish(self, game_id: str, item: Any) -> None:
        """Deliver `item` to every subscriber. Safe from any thread."""
        with self._lock:
            queues = list(self._subs.get(game_id, ()))
            loop = self._loop
        if not queues or loop is None or loop.is_closed():
            return
        for q in queues:
            try:
                loop.call_soon_threadsafe(q.put_nowait, item)
            except RuntimeError:
                pass  # loop shut down mid-publish

    def close(self, game_id: str) -> None:
        """Broadcast the CLOSE sentinel — subscribers should stop reading."""
        self.publish(game_id, CLOSE)


#: Process-wide singleton used by the processor, simulate task, and WS routes.
bus = EventBus()
