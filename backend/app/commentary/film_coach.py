"""Film Room AI coach — OpenAI when available, deterministic engine otherwise.

Mirrors apps/server/src/services/filmCoach.ts so the Python backend on :8787
powers the web Film Room without requiring the Express stub.
"""
from __future__ import annotations

import json
import re
from typing import Any, Optional

from app.commentary.generator import _chat, llm_enabled


def _mode_voice(mode: str) -> str:
    if mode == "rookie":
        return (
            "You are a youth coach talking to a 12-year-old. Simple words. "
            "Teach ONE concrete thing to watch (feet, spacing, help defense, balance)."
        )
    if mode == "hype":
        return (
            "Broadcast hype energy — short, punchy, excited. Still accurate to the live play. "
            "No empty slogans."
        )
    return (
        "You are an NBA film scout. Tactical and precise. Name the action "
        "(closeout, seal, PnR coverage, catch-and-shoot, advantage)."
    )


def _line_system(mode: str) -> str:
    return (
        f"You are Ortho, Anact's AI film coach. {_mode_voice(mode)} "
        "Reply with ONE color-commentary line only. Hard rules: "
        "(1) React to the LIVE last event and live score — not the final box score alone. "
        "(2) Max 18 words. (3) No emojis. (4) No generic advice like 'practice hard' or 'teamwork'. "
        "(5) Include a concrete watch cue."
    )


def _ask_system(mode: str) -> str:
    return (
        f"You are Ortho, Anact's AI film coach inside a highlight replay. {_mode_voice(mode)} "
        "Answer in 2-4 short sentences. Hard rules: "
        "(1) Ground the answer in THIS game, these players, and the live Ortho moment when given. "
        "(2) Prefer concrete film cues: feet, contest, help timing, spacing, seal, closeout. "
        "(3) If asked what to watch next, give a specific visual cue. "
        "(4) No markdown lists unless needed. No emojis."
    )


def _hash(s: str) -> int:
    h = 2166136261
    for ch in s:
        h ^= ord(ch)
        h = (h * 16777619) & 0xFFFFFFFF
    return h


def _pick(arr: list, seed: int) -> Any:
    return arr[abs(seed) % len(arr)]


def _ctx_line(f: dict[str, Any]) -> str:
    team_a = f.get("teamA") or {}
    team_b = f.get("teamB") or {}
    parts = [
        f"Game: {f.get('title')} ({team_a.get('tricode')} {team_a.get('final')}–{team_b.get('final')} {team_b.get('tricode')}).",
        str(f.get("headline") or ""),
        f"Star line: {f.get('starLine') or ''}.",
    ]
    tags = f.get("tags") or []
    if tags:
        parts.append(f"Tags: {', '.join(map(str, tags))}.")
    if f.get("scoreA") is not None:
        parts.append(
            f"Live Ortho score Q{f.get('quarter') or '?'} {f.get('clock') or ''}: "
            f"{team_a.get('tricode')} {f.get('scoreA')}–{f.get('scoreB')} {team_b.get('tricode')}."
        )
    if f.get("lastEvent"):
        parts.append(f"Last event: {f.get('lastEvent')}.")
    leaders = f.get("boxLeaders") or []
    if leaders:
        parts.append(
            "Box: "
            + "; ".join(f"{b.get('name')} {b.get('line')}" for b in leaders if isinstance(b, dict))
            + "."
        )
    return " ".join(p for p in parts if p)


def _parse_json(text: str) -> Any:
    cleaned = re.sub(r"```json|```", "", text).strip()
    return json.loads(cleaned)


def _film_intel(film_id: str) -> dict[str, str]:
    table = {
        "embiid-70": {
            "rookie": "Embiid seals deep, then rises — size + balance.",
            "scout": "Punish drop coverage; seal Wemby and finish through contact.",
            "hype": "SEVENTY-POINT ENERGY — Embiid is unguardable!",
        },
        "luka-73": {
            "rookie": "Luka slows down, then attacks the closeout.",
            "scout": "Step-back threes punish overhelping on the drive.",
            "hype": "73-POINT TAKEOVER — Luka owns the night!",
        },
        "wemby-5x5": {
            "rookie": "Wemby times the block — jump straight up, don't lean.",
            "scout": "Verticality + steal lanes: elite two-way processing.",
            "hype": "5×5 FREAK SHOW — every column filled!",
        },
        "finals-g5-2024": {
            "rookie": "Championship closeouts: contest without fouling.",
            "scout": "Boston's help chain and weak-side tags seal the series.",
            "hype": "BANNER 18 — Celtics slam the door!",
        },
        "sga-thunder": {
            "rookie": "SGA uses the mid-range when the paint packs in.",
            "scout": "Pull-up midrange after the PnR — elite shot diet.",
            "hype": "SGA ICE IN HIS VEINS — series even!",
        },
    }
    return table.get(
        film_id,
        {
            "rookie": "Watch balance before the shot.",
            "scout": "Advantage creation beats raw athleticism.",
            "hype": "THIS HIGHLIGHT IS COOKING!",
        },
    )


def deterministic_coach_line(f: dict[str, Any]) -> str:
    mode = f.get("mode") or "scout"
    team_a = f.get("teamA") or {}
    team_b = f.get("teamB") or {}
    a = team_a.get("tricode") or "A"
    b = team_b.get("tricode") or "B"
    sa = int(f.get("scoreA") or 0)
    sb = int(f.get("scoreB") or 0)
    event = str(f.get("lastEvent") or "the last make")
    qtr = f.get("quarter") or "?"
    seed = _hash(f"{f.get('id')}|{sa}|{sb}|{event}|{mode}")
    lead = "tied" if sa == sb else (f"{a} by {sa - sb}" if sa > sb else f"{b} by {sb - sa}")
    intel = _film_intel(str(f.get("id") or ""))
    banks = {
        "rookie": [
            f"After {event}: {lead}. Watch the helper's first step.",
            f"Q{qtr} {a} {sa}–{sb} {b}. Good shot = balance + space — check the feet.",
            f"{event}. Next: does defense get a body on the catch?",
            f"{intel['rookie']} Score is {lead}.",
        ],
        "scout": [
            f"{lead} after {event}. Hunt the late closeout / help lag.",
            f"Q{qtr} {a} {sa}–{sb} {b}. Coverage read: switch, drop, or hedge?",
            f"Film cue on {event}: shoulder set before the release.",
            f"{intel['scout']} Live {a} {sa}–{sb} {b}.",
        ],
        "hype": [
            f"BANG — {event}! {lead} and the reel is tilting!",
            f"{a} {sa}–{sb} {b}! {event} — KEEP IT ROLLING!",
            f"TAKEOVER beat: {event}. Crowd noise meter broken!",
            f"{intel['hype']} {lead}!",
        ],
    }
    return _pick(banks.get(mode) or banks["scout"], seed)


async def generate_coach_line(f: dict[str, Any]) -> dict[str, str]:
    mode = f.get("mode") or "scout"
    if llm_enabled():
        text = await _chat(
            _line_system(mode),
            _ctx_line(f) + "\nWrite the live color line now.",
            55,
        )
        if text:
            cleaned = text.strip().strip("\"'")
            low = cleaned.lower()
            if not any(
                bad in low
                for bad in (
                    "practice hard",
                    "believe in yourself",
                    "teamwork makes",
                    "never give up",
                    "hard work pays",
                )
            ):
                return {"text": cleaned, "source": "llm"}
    return {"text": deterministic_coach_line(f), "source": "engine"}


def deterministic_ask(f: dict[str, Any], question: str) -> str:
    q = question.lower()
    mode = f.get("mode") or "scout"
    leaders = f.get("boxLeaders") or []
    star_line = str(f.get("starLine") or "")
    star = (leaders[0].get("name") if leaders and isinstance(leaders[0], dict) else None) or (
        star_line.split(":")[0].strip() if star_line else "the star"
    )
    team_a = f.get("teamA") or {}
    team_b = f.get("teamB") or {}
    intel = _film_intel(str(f.get("id") or ""))
    live = ""
    if f.get("scoreA") is not None:
        live = (
            f" Live: {team_a.get('tricode')} {f.get('scoreA')}–{f.get('scoreB')} "
            f"{team_b.get('tricode')} Q{f.get('quarter') or '?'}."
        )
    last = str(f.get("lastEvent") or "")

    if re.search(r"why|good shot|open|contest", q):
        if mode == "rookie":
            return (
                f"A good shot is open or on-balance. Watch {star}'s feet land under the body"
                f"{' after ' + last if last else ''}. That's why it dropped.{live}"
            )
        return (
            f"Shot quality = balance, contest distance, and advantage. "
            f"{star}'s early elevation shows up here"
            f"{' on: ' + last if last else ''}.{live}"
        )
    if re.search(r"pick|pnr|screen|roll", q):
        return (
            "Pick-and-roll: screener sets an angle, ball handler reads the big. "
            f"Watch switch / drop / hedge — then punish the gap. {intel['scout']}"
        )
    if re.search(r"defense|stop|should|spurs|hawks|mavericks|celtics", q):
        return (
            f"Earlier help and a body on the catch. Late closeouts created the damage in "
            f"{f.get('title')}. {intel['scout']}{live}"
        )
    if re.search(r"three|3\b|deep", q):
        return (
            "Threes stretch help. One extra swing pass and the closeout arrives late — "
            f"that's the spacing lesson here.{live}"
        )
    if re.search(r"wemby|embiid|luka|tatum|sga|shai|advantage|matchup", q):
        return f"{intel[mode if mode in intel else 'scout']} {star_line}.{live}"
    if re.search(r"final|score|who won|winner", q):
        return (
            f"Final: {team_a.get('tricode')} {team_a.get('final')}–{team_b.get('final')} "
            f"{team_b.get('tricode')}. {f.get('headline')}"
        )
    if re.search(r"watch|next|look for|cue", q):
        return (
            f"Next cue: helper's first step and whether the ball finds the open man after "
            f"{last or 'this make'}. {intel['rookie']}{live}"
        )
    if mode == "hype":
        return f"{f.get('headline')} {star} owns this tape — {intel['hype']}"
    return f"{f.get('headline')} Focus on {star}: {star_line}. {intel['scout']}{live}"


async def answer_film_question(f: dict[str, Any], question: str) -> dict[str, str]:
    mode = f.get("mode") or "scout"
    q = (question or "").strip()[:400]
    if not q:
        return {
            "text": "Ask me anything about this film — shot quality, defense, or what to practice.",
            "source": "engine",
        }
    if llm_enabled():
        text = await _chat(
            _ask_system(mode),
            f"{_ctx_line(f)}\n\nStudent question: {q}",
            220,
        )
        if text:
            return {"text": text, "source": "llm"}
    return {"text": deterministic_ask(f, q), "source": "engine"}


def deterministic_moment(f: dict[str, Any]) -> dict[str, str]:
    mode = f.get("mode") or "scout"
    leaders = f.get("boxLeaders") or []
    star = (leaders[0].get("name") if leaders and isinstance(leaders[0], dict) else None) or "the star"
    if mode == "rookie":
        return {
            "title": "Teachable moment",
            "what": f"{star} just scored — the defense was a step late.",
            "why": "Late help = open look. Early feet beat talent.",
            "watchNext": "On the next trip, watch who helps first from the weak side.",
        }
    if mode == "hype":
        return {
            "title": "MOMENT ALERT",
            "what": f"{star} just ripped the reel open!",
            "why": "Momentum swings when you punish soft coverage.",
            "watchNext": "Stay locked — the counterpunch is coming.",
        }
    return {
        "title": "Film break",
        "what": str(f.get("lastEvent") or f"{star} creates an advantage."),
        "why": "Advantage creation + spacing beat raw athleticism on this possession.",
        "watchNext": "Track the helper's first step and whether the ball finds the open man.",
    }


async def generate_moment(f: dict[str, Any]) -> dict[str, Any]:
    mode = f.get("mode") or "scout"
    if llm_enabled():
        text = await _chat(
            f"You are Ortho film coach. {_mode_voice(mode)} Reply ONLY as JSON: "
            '{"title":"...","what":"...","why":"...","watchNext":"..."} — each value one short sentence. '
            "Ground in the live last event and this specific game. Teach a real film cue.",
            _ctx_line(f),
            180,
        )
        if text:
            try:
                data = _parse_json(text)
                if data.get("what") and data.get("why") and data.get("watchNext"):
                    return {
                        "moment": {
                            "title": data.get("title") or "Teachable moment",
                            "what": data["what"],
                            "why": data["why"],
                            "watchNext": data["watchNext"],
                        },
                        "source": "llm",
                    }
            except Exception:
                pass
    return {"moment": deterministic_moment(f), "source": "engine"}


def deterministic_quiz(f: dict[str, Any]) -> dict[str, Any]:
    seed = _hash(f"{f.get('id')}|quiz|{f.get('scoreA')}|{f.get('quarter')}")
    leaders = f.get("boxLeaders") or []
    star_line = str(f.get("starLine") or "")
    star = (leaders[0].get("name") if leaders and isinstance(leaders[0], dict) else None) or "the star"
    team_a = f.get("teamA") or {}
    team_b = f.get("teamB") or {}
    quizzes = [
        {
            "id": f"q-{seed}-0",
            "question": "After this stretch, who is dictating pace?",
            "options": [star, team_b.get("name") or "Opponent", "The referees", "Random variance"],
            "correctIndex": 0,
            "explain": f"{star} owns the initiative — {star_line}.",
        },
        {
            "id": f"q-{seed}-1",
            "question": "Best defensive fix for the next possession?",
            "options": [
                "Earlier help + body on the catch",
                "Ignore the ball handler",
                "Hack-a whoever",
                "Zone with no communication",
            ],
            "correctIndex": 0,
            "explain": "Late closeouts created this damage. Early feet and talk fix it.",
        },
        {
            "id": f"q-{seed}-2",
            "question": f"Final score of {f.get('title')}?",
            "options": [
                f"{team_a.get('final')}–{team_b.get('final')}",
                f"{(team_a.get('final') or 0) + 7}–{(team_b.get('final') or 0) - 3}",
                f"{team_b.get('final')}–{team_a.get('final')}",
                "Went to OT 120–118",
            ],
            "correctIndex": 0,
            "explain": f"{team_a.get('tricode')} {team_a.get('final')}–{team_b.get('final')} {team_b.get('tricode')}.",
        },
        {
            "id": f"q-{seed}-3",
            "question": "What makes this a 'good shot' in film study?",
            "options": [
                "Balance + space (or clear advantage)",
                "Any contested fadeaway",
                "Only dunks",
                "Whatever the crowd cheers",
            ],
            "correctIndex": 0,
            "explain": "Shot quality = balance, contest, and whether the advantage was real.",
        },
    ]
    return _pick(quizzes, seed)


async def generate_quiz(f: dict[str, Any]) -> dict[str, Any]:
    mode = f.get("mode") or "scout"
    if llm_enabled():
        text = await _chat(
            f"You are Ortho film coach writing a multiple-choice quiz. {_mode_voice(mode)} "
            'Reply ONLY JSON: {"question":"...","options":["a","b","c","d"],"correctIndex":0,"explain":"..."}. '
            "Prefer film-study questions (shot quality, defense reads, spacing) about THIS game — "
            "not pure trivia unless it teaches.",
            _ctx_line(f),
            220,
        )
        if text:
            try:
                data = _parse_json(text)
                opts = data.get("options") or []
                if data.get("question") and isinstance(opts, list) and len(opts) >= 2:
                    correct = max(0, min(len(opts) - 1, int(data.get("correctIndex") or 0)))
                    return {
                        "quiz": {
                            "id": f"llm-{_hash(str(data['question']))}",
                            "question": data["question"],
                            "options": [str(o) for o in opts[:4]],
                            "correctIndex": correct,
                            "explain": data.get("explain") or "Solid film IQ.",
                        },
                        "source": "llm",
                    }
            except Exception:
                pass
    return {"quiz": deterministic_quiz(f), "source": "engine"}


def deterministic_chapters(f: dict[str, Any], timeline: list[dict[str, Any]]) -> list[dict[str, Any]]:
    team_a = f.get("teamA") or {}
    team_b = f.get("teamB") or {}
    game_ms = 48 * 60 * 1000
    if not timeline:
        return [
            {"id": "tip", "title": "Tip-off energy", "blurb": f.get("subtitle") or "", "t": 0, "quarter": 1},
            {
                "id": "star",
                "title": "Star takeover",
                "blurb": f.get("starLine") or "",
                "t": int(0.45 * game_ms),
                "quarter": 2,
            },
            {
                "id": "close",
                "title": "Closing stretch",
                "blurb": f.get("headline") or "",
                "t": int(0.78 * game_ms),
                "quarter": 4,
            },
        ]

    labels = ["Opening salvo", "Midgame chess", "Third-quarter push", "Closing statement"]
    chapters: list[dict[str, Any]] = []
    for q in range(1, 5):
        ev = [e for e in timeline if int(e.get("quarter") or 0) == q]
        if not ev:
            continue
        mid = ev[len(ev) // 2]
        end = ev[-1]
        chapters.append(
            {
                "id": f"q{q}",
                "title": f"Q{q} · {labels[q - 1]}",
                "blurb": (
                    f"{team_a.get('tricode')} {end.get('scoreA')}–{end.get('scoreB')} "
                    f"{team_b.get('tricode')} · {mid.get('text')}"
                ),
                "t": int(ev[0].get("t") or 0),
                "quarter": q,
            }
        )

    best = {"start": 0, "pts": 0, "team": "A"}
    for i, _ in enumerate(timeline):
        base_a = timeline[i - 1]["scoreA"] if i > 0 else 0
        base_b = timeline[i - 1]["scoreB"] if i > 0 else 0
        for j in range(i, min(len(timeline), i + 8)):
            d_a = int(timeline[j].get("scoreA") or 0) - int(base_a or 0)
            d_b = int(timeline[j].get("scoreB") or 0) - int(base_b or 0)
            if d_a >= 8 and d_a > best["pts"]:
                best = {"start": int(timeline[i].get("t") or 0), "pts": d_a, "team": "A"}
            if d_b >= 8 and d_b > best["pts"]:
                best = {"start": int(timeline[i].get("t") or 0), "pts": d_b, "team": "B"}
    if best["pts"] >= 8:
        name = team_a.get("name") if best["team"] == "A" else team_b.get("name")
        chapters.append(
            {
                "id": "run",
                "title": f"{name} {best['pts']}-0 surge",
                "blurb": "Momentum chapter — Ortho flags the scoring burst.",
                "t": best["start"],
                "quarter": min(4, best["start"] // (12 * 60_000) + 1),
            }
        )

    chapters.sort(key=lambda c: c["t"])
    out: list[dict[str, Any]] = []
    for c in chapters:
        if any(abs(x["t"] - c["t"]) < 90_000 for x in out):
            continue
        out.append(c)
    return out[:6]


async def generate_chapters(f: dict[str, Any], timeline: list[dict[str, Any]]) -> dict[str, Any]:
    base = deterministic_chapters(f, timeline)
    mode = f.get("mode") or "scout"
    if llm_enabled() and base:
        text = await _chat(
            "You rename film-study chapters. Reply ONLY JSON array of "
            '{"id","title","blurb"} matching the same ids. Titles max 6 words, blurbs max 14 words. '
            f"Mode: {mode}.",
            f"Game: {f.get('title')}. Chapters: {json.dumps([{k: c[k] for k in ('id', 'title', 'blurb', 't')} for c in base])}",
            280,
        )
        if text:
            try:
                arr = _parse_json(text)
                if isinstance(arr, list):
                    remap = {x.get("id"): x for x in arr if isinstance(x, dict)}
                    renamed = []
                    for c in base:
                        m = remap.get(c["id"]) or {}
                        renamed.append(
                            {
                                **c,
                                "title": (m.get("title") or c["title"]).strip(),
                                "blurb": (m.get("blurb") or c["blurb"]).strip(),
                            }
                        )
                    return {"chapters": renamed, "source": "llm"}
            except Exception:
                pass
    return {"chapters": base, "source": "engine"}


def deterministic_recap(f: dict[str, Any]) -> dict[str, Any]:
    leaders = f.get("boxLeaders") or []
    star_line = str(f.get("starLine") or "")
    star = (leaders[0].get("name") if leaders and isinstance(leaders[0], dict) else None) or (
        star_line.split(":")[0].strip() if star_line else "Film MVP"
    )
    tags = [str(t) for t in (f.get("tags") or [])]
    grade = (
        "A+"
        if any(re.search(r"Championship|Career-high|70-point|Finals", t, re.I) for t in tags)
        else "A"
    )
    return {
        "star": star,
        "takeaways": [
            f"{star} set the tone — {star_line}.",
            "Spacing + early advantage beats late help defense.",
            "Finish possessions; sprint back — momentum is a choice.",
        ],
        "drill": "3-man weave → catch-and-shoot threes (make 8), then closeout + contest without fouling.",
        "grade": grade,
    }


async def generate_recap(f: dict[str, Any]) -> dict[str, Any]:
    mode = f.get("mode") or "scout"
    if llm_enabled():
        text = await _chat(
            f"You are Ortho writing a post-film scouting card. {_mode_voice(mode)} "
            'Reply ONLY JSON: {"star":"...","takeaways":["...","...","..."],"drill":"...","grade":"A|A+|B+"}.',
            _ctx_line(f),
            260,
        )
        if text:
            try:
                data = _parse_json(text)
                if data.get("star") and isinstance(data.get("takeaways"), list) and data.get("drill"):
                    return {
                        "recap": {
                            "star": str(data["star"]),
                            "takeaways": [str(x) for x in data["takeaways"][:3]],
                            "drill": str(data["drill"]),
                            "grade": str(data.get("grade") or "A"),
                        },
                        "source": "llm",
                    }
            except Exception:
                pass
    return {"recap": deterministic_recap(f), "source": "engine"}


def as_film_context(body: dict[str, Any]) -> Optional[dict[str, Any]]:
    film_id = str(body.get("id") or "")
    title = str(body.get("title") or "")
    team_a = body.get("teamA")
    team_b = body.get("teamB")
    if not film_id or not title:
        return None
    if not isinstance(team_a, dict) or not team_a.get("tricode"):
        return None
    if not isinstance(team_b, dict) or not team_b.get("tricode"):
        return None
    mode = str(body.get("mode") or "scout")
    if mode not in ("rookie", "scout", "hype"):
        mode = "scout"
    return {
        "id": film_id,
        "title": title,
        "subtitle": str(body.get("subtitle") or ""),
        "headline": str(body.get("headline") or ""),
        "starLine": str(body.get("starLine") or ""),
        "tags": [str(t) for t in body.get("tags") or []] if isinstance(body.get("tags"), list) else [],
        "teamA": team_a,
        "teamB": team_b,
        "boxLeaders": body.get("boxLeaders") if isinstance(body.get("boxLeaders"), list) else [],
        "scoreA": body.get("scoreA") if isinstance(body.get("scoreA"), (int, float)) else None,
        "scoreB": body.get("scoreB") if isinstance(body.get("scoreB"), (int, float)) else None,
        "quarter": body.get("quarter") if isinstance(body.get("quarter"), (int, float)) else None,
        "clock": body.get("clock") if isinstance(body.get("clock"), str) else None,
        "lastEvent": body.get("lastEvent") if isinstance(body.get("lastEvent"), str) else None,
        "mode": mode,
    }
