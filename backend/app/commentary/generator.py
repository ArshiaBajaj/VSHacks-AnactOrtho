"""Commentary + scouting-report generation.

Deterministic phrase banks ported VERBATIM from apps/server/src/services/ai.ts
(same strings, same pick(seed) logic), plus an optional LLM layer: when
OPENAI_API_KEY is set we call OpenAI chat completions with the same prompts as
the TS server and fall back to the deterministic engine on any failure.
"""
from __future__ import annotations

import math
import os
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Optional

from pydantic import BaseModel

OPENAI_URL = "https://api.openai.com/v1/chat/completions"


def llm_enabled() -> bool:
    return bool(os.environ.get("OPENAI_API_KEY"))


async def _chat(system: str, user: str, max_tokens: int = 320) -> Optional[str]:
    """POST to OpenAI chat completions. Returns None on any failure."""
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        return None
    model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
    try:
        import httpx

        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.post(
                OPENAI_URL,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {key}",
                },
                json={
                    "model": model,
                    "max_tokens": max_tokens,
                    "temperature": 0.7,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                },
            )
            if res.status_code != 200:
                return None
            data = res.json()
            text = (data.get("choices") or [{}])[0].get("message", {}).get("content")
            return text.strip() if isinstance(text, str) else None
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Commentary
# ---------------------------------------------------------------------------


class CommentaryRequest(BaseModel):
    """Mirror of the TS CommentaryRequest (camelCase fields, as on the wire)."""

    event: str  # "score" | "streak" | "jump" | "whistle" | "steal" | "highlight"
    team: Optional[str] = None  # "A" | "B"
    teamName: Optional[str] = None
    value: Optional[float] = None
    scoreA: Optional[int] = None
    scoreB: Optional[int] = None
    style: Optional[str] = None  # "playground" | "broadcast" | "hype"


PHRASES: dict[str, dict[str, list[str]]] = {
    "playground": {
        "score": ["Bucket! Get that man some water.", "Cash. Money. Splash.", "And-1 energy, put it on the board.", "Cooked him — that's a bucket."],
        "streak": ["They can't miss right now!", "Somebody call timeout, this is a takeover.", "On fire — the court is theirs."],
        "jump": ["Elevator's broken, kid took the stairs to the roof.", "Get up! That's air time.", "Hang time for days."],
        "whistle": ["Ball's out — check it up.", "Off the line, we resetting.", "Out of bounds, other ball."],
        "steal": ["Picked his pocket!", "Hands like a thief in the night.", "Takeaway and gone."],
        "highlight": ["That's a poster. Frame it.", "SportsCenter top ten, easy.", "Oh, that's nasty."],
    },
    "broadcast": {
        "score": ["Knocks it down, and the lead grows.", "Elevates, releases — good.", "Finds the bottom of the net with confidence."],
        "streak": ["An 8-0 run and the building is electric.", "They've seized all the momentum here.", "A decisive stretch of basketball."],
        "jump": ["Rises up with tremendous elevation.", "Extraordinary vertical explosion on that finish.", "Skies above the defense."],
        "whistle": ["The ball sails out of bounds — turnover.", "Off the mark and out — change of possession.", "Whistle. Ball did cross the line."],
        "steal": ["Reads the passing lane perfectly for the steal.", "Anticipation, and a takeaway.", "Jumps the route — turnover forced."],
        "highlight": ["A signature moment in this one.", "That's a play they'll be replaying tonight.", "Sensational — simply sensational."],
    },
    "hype": {
        "score": ["BANG! Count it!", "SPLASH from deep!", "GET UP! It's good!", "DAGGER!"],
        "streak": ["THEY ARE UNCONSCIOUS RIGHT NOW!", "THE RUN IS ON! TIMEOUT!", "IT'S A TAKEOVER!"],
        "jump": ["OH MY — HE TOOK OFF!", "ABOVE THE RIM! ARE YOU KIDDING?!", "THROW IT DOWN!"],
        "whistle": ["OUT OF BOUNDS — CV CALLS IT INSTANTLY!", "OFF THE LINE! WE RESET!", "GONE! OTHER BALL!"],
        "steal": ["THIEF! GONE THE OTHER WAY!", "PICKED CLEAN!", "TAKEAWAY — HOUSTON, WE HAVE A FASTBREAK!"],
        "highlight": ["POSTERIZED! GOODNIGHT!", "TOP TEN — NUMBER ONE!", "UNREAL! UNREAL!"],
    },
}


def pick(arr: list, seed: float) -> Any:
    """arr[Math.abs(seed) % arr.length] — TS pick() semantics."""
    return arr[int(abs(seed)) % len(arr)]


def _js_num(x: Any) -> str:
    """Render a number the way JS template literals do (21.0 -> '21')."""
    if isinstance(x, float) and x.is_integer():
        return str(int(x))
    return str(x)


def _to_fixed(x: float, digits: int) -> str:
    """JS Number.prototype.toFixed (round half away from zero)."""
    q = Decimal(1).scaleb(-digits) if digits else Decimal(1)
    return str(Decimal(str(x)).quantize(q, rounding=ROUND_HALF_UP))


def _js_round(x: float) -> int:
    """JS Math.round (half towards +Infinity)."""
    return math.floor(x + 0.5)


def deterministic_commentary(req: CommentaryRequest) -> str:
    """Port of deterministicCommentary() — identical output for identical input."""
    style = req.style or "playground"
    bank = PHRASES.get(style) or PHRASES["playground"]
    lst = bank.get(req.event) or bank["highlight"]
    seed = (req.value or 0) + (req.scoreA or 0) * 7 + (req.scoreB or 0) * 13 + len(req.event)
    line = pick(lst, seed)
    if req.event == "score" and req.teamName and req.scoreA is not None and req.scoreB is not None:
        line += f" {req.teamName} — {req.scoreA}-{req.scoreB}."
    return line


async def generate_commentary(req: CommentaryRequest) -> dict[str, str]:
    """LLM commentary when available, deterministic fallback otherwise."""
    if llm_enabled():
        style = req.style or "playground"
        team = req.teamName if req.teamName is not None else (req.team if req.team is not None else "?")
        value = _js_num(req.value) if req.value is not None else "-"
        text = await _chat(
            f"You are a {style} basketball commentator for Anact Ortho. Respond with ONE short, punchy line (max 14 words). No emojis unless hype style.",
            f"Event: {req.event}. Team: {team}. Value: {value}. Score: {req.scoreA or 0}-{req.scoreB or 0}.",
            40,
        )
        if text:
            return {"text": text, "source": "llm"}
    return {"text": deterministic_commentary(req), "source": "engine"}


# ---------------------------------------------------------------------------
# Scouting report
# ---------------------------------------------------------------------------


def deterministic_report(card: dict[str, Any]) -> str:
    """Port of deterministicReport() over a ScoutCard-shaped dict (camelCase)."""
    p = card.get("player") or {}
    points = p.get("points") or 0
    shots = p.get("shots") or 0
    makes = p.get("makes") or 0
    best_jump = float(p.get("bestJumpCm") or 0)
    release_mps = float(p.get("topReleaseMps") or 0)
    distance = float(p.get("distanceM") or 0)
    duration = card.get("duration") or 0
    events = card.get("events") or []

    fg = _js_round((makes / shots) * 100) if shots else 0
    pos = p.get("position") or "combo guard"
    explosive = "elite" if best_jump >= 65 else "above-average" if best_jump >= 50 else "developing"
    release = (
        "a quick, high-velocity release"
        if release_mps >= 9
        else "a compact release with room to add speed"
    )
    motor = "a relentless motor" if distance >= 1500 else "efficient movement"
    if points >= 24:
        verdict = "Projects as a primary scoring option with clear next-level upside."
    elif points >= 14:
        verdict = "Projects as a reliable secondary creator and connector."
    else:
        verdict = "A role player whose value shows up in the margins."

    return " ".join(
        [
            f"PROSPECT REPORT — {p.get('name')} ({pos}).",
            f"Put up {_js_num(points)} points on {fg}% shooting across {len(events)} tracked events in a {_js_round(duration / 60000)}-minute session.",
            f"Athletic profile: {explosive} explosiveness ({_to_fixed(best_jump, 0)}cm measured vertical) paired with {release} ({_to_fixed(release_mps, 1)} m/s). Shows {motor} ({_to_fixed(distance, 0)}m covered).",
            verdict,
            "All metrics captured on-device by Anact Ortho — no wearables, no manual tagging.",
        ]
    )


async def generate_scouting_report(card: dict[str, Any]) -> dict[str, str]:
    """LLM scouting report when available, deterministic fallback otherwise."""
    if llm_enabled():
        p = card.get("player") or {}
        shots = p.get("shots") or 0
        makes = p.get("makes") or 0
        fg = _js_round((makes / shots) * 100) if shots else 0
        text = await _chat(
            "You are an NBA-level scout writing a concise, professional prospect report (about 90-120 words). Be specific and grounded in the numbers provided. No hype clichés.",
            f"Player {p.get('name')}, position {p.get('position') or 'guard'}. "
            f"Session: {_js_num(p.get('points') or 0)} pts on {fg}% FG, "
            f"{_to_fixed(float(p.get('bestJumpCm') or 0), 0)}cm vertical, "
            f"{_to_fixed(float(p.get('topReleaseMps') or 0), 1)} m/s release, "
            f"{_to_fixed(float(p.get('distanceM') or 0), 0)}m covered, "
            f"{_js_num(p.get('jumps') or 0)} jumps, "
            f"over {_js_round((card.get('duration') or 0) / 60000)} minutes.",
            300,
        )
        if text:
            return {"text": text, "source": "llm"}
    return {"text": deterministic_report(card), "source": "engine"}
