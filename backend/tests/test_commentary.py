"""Deterministic commentary + scouting report, ported from
apps/server/src/services/ai.ts. The phrase banks below are copied VERBATIM
from ai.ts (em-dashes, punctuation and all) and the seed formula is:

    seed = value + scoreA*7 + scoreB*13 + len(event)
    line = bank[abs(seed) % len(bank)]

Commentary modules are core: imports happen inside tests (clean collection)
but a missing module is a hard FAILURE, not a skip.
"""
from __future__ import annotations

import inspect

import pytest

from tests import helpers as H

# Verbatim from ai.ts PHRASES.playground
PLAYGROUND = {
    "score": [
        "Bucket! Get that man some water.",
        "Cash. Money. Splash.",
        "And-1 energy, put it on the board.",
        "Cooked him — that's a bucket.",
    ],
    "streak": [
        "They can't miss right now!",
        "Somebody call timeout, this is a takeover.",
        "On fire — the court is theirs.",
    ],
    "jump": [
        "Elevator's broken, kid took the stairs to the roof.",
        "Get up! That's air time.",
        "Hang time for days.",
    ],
    "whistle": [
        "Ball's out — check it up.",
        "Off the line, we resetting.",
        "Out of bounds, other ball.",
    ],
    "steal": [
        "Picked his pocket!",
        "Hands like a thief in the night.",
        "Takeaway and gone.",
    ],
    "highlight": [
        "That's a poster. Frame it.",
        "SportsCenter top ten, easy.",
        "Oh, that's nasty.",
    ],
}


def _seed(event: str, value: int = 0, score_a: int = 0, score_b: int = 0) -> int:
    return value + score_a * 7 + score_b * 13 + len(event)


def _pick(bank: list[str], seed: int) -> str:
    return bank[abs(seed) % len(bank)]


def _generator():
    from app.commentary import generator

    return generator


async def _maybe_await(value):
    if inspect.isawaitable(value):
        return await value
    return value


# ---------------------------------------------------------------------------
# deterministic_commentary
# ---------------------------------------------------------------------------

def test_exact_bucket_phrase():
    """seed = 3 + 0 + 0 + len('score')=5 -> 8 % 4 == 0 -> bank index 0."""
    gen = _generator()
    text = H.call_commentary(gen.deterministic_commentary, event="score", value=3, scoreA=0, scoreB=0)
    assert text == "Bucket! Get that man some water."


def test_score_line_appends_team_and_score():
    gen = _generator()
    text = H.call_commentary(
        gen.deterministic_commentary, event="score", teamName="Red", scoreA=5, scoreB=3
    )
    expected = _pick(PLAYGROUND["score"], _seed("score", 0, 5, 3)) + " Red — 5-3."
    assert text == expected


@pytest.mark.parametrize("event", ["jump", "streak", "steal", "whistle", "highlight"])
@pytest.mark.parametrize("value,score_a,score_b", [(0, 0, 0), (1, 2, 1), (2, 7, 4)])
def test_phrase_bank_membership_and_seed(event, value, score_a, score_b):
    gen = _generator()
    text = H.call_commentary(
        gen.deterministic_commentary, event=event, value=value, scoreA=score_a, scoreB=score_b
    )
    bank = PLAYGROUND[event]
    assert text in bank, f"{event} line must come from the playground bank: {text!r}"
    assert text == _pick(bank, _seed(event, value, score_a, score_b)), (
        "line must follow the seed formula value + scoreA*7 + scoreB*13 + len(event)"
    )


def test_unknown_style_falls_back_to_playground():
    gen = _generator()
    text = H.call_commentary(gen.deterministic_commentary, event="steal", style="zen", value=1)
    assert text in PLAYGROUND["steal"]


async def test_generate_commentary_engine_source():
    gen = _generator()
    result = await _maybe_await(
        H.call_commentary(gen.generate_commentary, event="score", teamName="Red", scoreA=5, scoreB=3)
    )
    text, source = H.unpack_text_source(result)
    assert source == "engine", "with OPENAI_API_KEY unset the source must be the engine"
    assert isinstance(text, str) and text.strip()


# ---------------------------------------------------------------------------
# generate_scouting_report (deterministic mode)
# ---------------------------------------------------------------------------

async def test_scouting_report_mentions_name_and_fg_pct():
    gen = _generator()
    card = H.scout_card_payload()  # makes=7, shots=12 -> FG 58%
    try:
        result = await _maybe_await(gen.generate_scouting_report(card))
    except (TypeError, AttributeError, KeyError):
        result = await _maybe_await(gen.generate_scouting_report(**card))
    text, source = H.unpack_text_source(result)
    assert source == "engine"
    assert H.SCOUT_PLAYER_NAME in text
    assert "58" in text and "%" in text, f"report must quote the FG%: {text!r}"


# ---------------------------------------------------------------------------
# TTS: writes a wav OR returns False; must never raise
# ---------------------------------------------------------------------------

def test_synth_wav_never_raises(tmp_path):
    from app.commentary import tts

    out = tmp_path / "line.wav"
    try:
        try:
            ok = tts.synth_wav("Bucket! Count it.", str(out))
        except TypeError:
            ok = tts.synth_wav(text="Bucket! Count it.", out_path=str(out))
    except Exception as exc:  # noqa: BLE001 - the contract IS "never raises"
        pytest.fail(f"synth_wav must degrade gracefully, but raised: {exc!r}")

    assert isinstance(ok, bool), f"synth_wav must return a bool, got {type(ok).__name__}"
    if ok:
        assert out.exists() and out.stat().st_size > 0, (
            "synth_wav returned True but wrote no wav file"
        )
