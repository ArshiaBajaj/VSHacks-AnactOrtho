"""Pure-logic GameEngine tests: no video, no CV stack. Synthetic
FrameObservation sequences (tests/helpers.py) drive the engine and we assert
the CONTRACT events (app/models.py EventType) come out.

Engine modules are core: imports happen inside tests so collection stays
clean while code lands, but a missing module is a hard FAILURE, not a skip.
"""
from __future__ import annotations

import threading

from tests import helpers as H


# ---------------------------------------------------------------------------
# (a) shot arc into the hoop -> shot_attempt then score, score increments
# ---------------------------------------------------------------------------

def test_shot_then_score():
    engine = H.make_engine()
    events = H.run_engine(engine, H.shot_sequence())
    types = [H.etype(e) for e in events]

    assert "shot_attempt" in types, f"no shot_attempt emitted; got {types}"
    assert "score" in types, f"no score emitted; got {types}"
    assert types.index("shot_attempt") < types.index("score"), (
        "shot_attempt must precede the score it produces"
    )

    score_event = events[types.index("score")]
    after = H.escore(score_event)
    assert after is not None, "score events must carry score_after"
    assert sum(after) >= 1, f"score_after must reflect the made basket: {after}"


def test_no_score_without_a_shot():
    engine = H.make_engine()
    events = H.run_engine(engine, H.neutral_sequence(0, n=45), finalize=False)
    types = [H.etype(e) for e in events]
    assert "score" not in types
    assert "shot_attempt" not in types


# ---------------------------------------------------------------------------
# (b) out of bounds + hysteresis
# ---------------------------------------------------------------------------

def test_out_of_bounds_triggers_whistle():
    engine = H.make_engine()
    events = H.run_engine(engine, H.oob_sequence(frames_outside=8), finalize=False)
    types = [H.etype(e) for e in events]
    assert "out_of_bounds" in types, f"ball outside court width for 8 frames must be OOB; got {types}"
    assert "whistle" in types, f"OOB must come with a whistle; got {types}"


def test_oob_hysteresis_two_frames_no_whistle():
    engine = H.make_engine()
    events = H.run_engine(engine, H.oob_sequence(frames_outside=2), finalize=False)
    types = [H.etype(e) for e in events]
    assert "out_of_bounds" not in types, f"2-frame blip must NOT trigger OOB; got {types}"
    assert "whistle" not in types, f"2-frame blip must NOT trigger a whistle; got {types}"


# ---------------------------------------------------------------------------
# (c) three consecutive scores by the same team -> streak
# ---------------------------------------------------------------------------

def test_streak_after_three_consecutive_scores():
    engine = H.make_engine()
    obs = []
    idx = 0
    for _ in range(3):
        seq = H.shot_sequence(start_idx=idx, team="a")
        obs.extend(seq)
        idx = seq[-1].frame_idx + 1
        # Realistic spacing between possessions (a few seconds of dribbling).
        gap = H.neutral_sequence(idx, n=90)
        obs.extend(gap)
        idx = gap[-1].frame_idx + 1

    events = H.run_engine(engine, obs, finalize=False)
    types = [H.etype(e) for e in events]
    assert types.count("score") >= 3, f"expected 3 scores before checking streak; got {types}"
    assert "streak" in types, f"3 consecutive scores by one team must emit a streak; got {types}"


# ---------------------------------------------------------------------------
# (d) target score reached -> game_end
# ---------------------------------------------------------------------------

def test_game_end_at_target_score():
    # Skips (with a clear message) only if no constructor style accepts
    # target_score; the kwarg spelling is not itself the contract.
    engine = H.make_engine(target_score=2)
    obs = []
    idx = 0
    for _ in range(4):  # more than enough buckets to pass a target of 2
        seq = H.shot_sequence(start_idx=idx, team="a")
        obs.extend(seq)
        idx = seq[-1].frame_idx + 1
        gap = H.neutral_sequence(idx, n=90)
        obs.extend(gap)
        idx = gap[-1].frame_idx + 1

    events = H.run_engine(engine, obs)  # finalize() allowed to emit game_end
    types = [H.etype(e) for e in events]
    assert types.count("score") >= 2, f"engine never reached the target score; got {types}"
    assert "game_end" in types, f"reaching target score must end the game; got {types}"


# ---------------------------------------------------------------------------
# EventBus: subscribe(game_id) -> queue, publish(game_id, item) fan-out.
# Async tests (asyncio_mode=auto) because delivery rides the event loop.
# ---------------------------------------------------------------------------

import asyncio  # noqa: E402


async def _drain(q, n, timeout=3.0):
    items = []
    for _ in range(n):
        items.append(await asyncio.wait_for(q.get(), timeout))
    return items


async def test_event_bus_roundtrip():
    from app.engine.events import EventBus

    bus = EventBus()
    q = bus.subscribe("g_test")
    message = {"type": "score", "t": 1.0}
    bus.publish("g_test", message)
    items = await _drain(q, 1)
    assert items == [message]

    # Publishing to a different game must not reach this subscriber.
    bus.publish("g_other", {"type": "score", "t": 2.0})
    await asyncio.sleep(0.05)
    assert q.empty(), "subscriber received a message for a game it never subscribed to"


async def test_event_bus_threadsafe_publish():
    from app.engine.events import EventBus

    bus = EventBus()
    q = bus.subscribe("g_test")

    n = 25

    def _worker():
        for i in range(n):
            bus.publish("g_test", {"type": "commentary", "i": i})

    thread = threading.Thread(target=_worker)
    thread.start()
    items = await _drain(q, n, timeout=5.0)
    thread.join(timeout=5.0)
    assert not thread.is_alive(), "publish from a worker thread deadlocked"
    assert [m["i"] for m in items] == list(range(n)), "messages lost or reordered across threads"
