"""
HooperIQ Phase 2 — FastAPI audio assessment router (optional microservice).

Run (from repo root, with deps installed):
  uvicorn hooperiq.ai_service.main:app --reload --port 8790

The web app does NOT require this — it grades locally and can call
apps/server POST /api/hooperiq/assess instead.
"""

from __future__ import annotations

import re
from typing import Any

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = FastAPI(title="HooperIQ AI Assess", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class AssessBody(BaseModel):
    play_id: str | None = None
    user_id: str | None = None
    transcript: str = ""
    true_read: str = ""
    answer_keywords: list[str] = Field(default_factory=list)


class AssessResult(BaseModel):
    score: int
    feedback: str
    keywords_matched: list[str]


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]", " ", s.lower())).strip()


def grade(transcript: str, true_read: str, keywords: list[str]) -> AssessResult:
    text = _norm(transcript)
    kws = [_norm(k) for k in keywords if k]
    matched: list[str] = []
    hits = 0
    for kw in kws:
        parts = [w for w in kw.split(" ") if len(w) > 2]
        if kw and (kw in text or (parts and all(p in text for p in parts))):
            hits += 1
            matched.append(kw)
    ratio = hits / len(kws) if kws else 0.0
    score = int(round(25 + ratio * 70)) if len(text) >= 3 else 35
    score = max(0, min(100, score))
    lead = (true_read.split(".")[0] if true_read else "Review the coverage").strip()
    if score >= 85:
        feedback = "Elite tactical accuracy — coverage and next action both land."
    elif score >= 70:
        feedback = f"Strong. Polish: {lead[:140]}."
    elif score >= 45:
        feedback = f"Partial read. Focus: {lead[:140]}."
    else:
        feedback = f"Missed core idea. {lead[:160]}."
    return AssessResult(score=score, feedback=feedback, keywords_matched=matched[:8])


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "service": "hooperiq-ai", "whisper": "stub"}


@app.post("/assess", response_model=AssessResult)
def assess_json(body: AssessBody) -> AssessResult:
    return grade(body.transcript, body.true_read, body.answer_keywords)


@app.post("/assess/audio", response_model=AssessResult)
async def assess_audio(
    play_id: str = Form(""),
    user_id: str = Form(""),
    true_read: str = Form(""),
    answer_keywords: str = Form(""),  # comma-separated
    audio: UploadFile | None = File(None),
) -> AssessResult:
    """
    Accepts .wav/.m4a. Whisper integration is optional via OPENAI_API_KEY;
    without it we return a safe stub transcript grade.
    """
    transcript = ""
    try:
        if audio is not None:
            _ = await audio.read()  # consume upload safely
            # Placeholder: wire OpenAI Whisper here when key present.
            transcript = ""
    except Exception:
        transcript = ""

    kws = [k.strip() for k in answer_keywords.split(",") if k.strip()]
    if not transcript:
        # Soft fail — still return valid JSON so mobile never crashes
        return AssessResult(
            score=40,
            feedback="Audio received but transcription is offline — type your read or enable Whisper.",
            keywords_matched=[],
        )
    return grade(transcript, true_read, kws)
