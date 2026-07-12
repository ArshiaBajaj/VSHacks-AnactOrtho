"""Offline text-to-speech via pyttsx3 (SAPI5 on Windows).

pyttsx3 is not thread-safe and its engines do not like being re-entered, so
all synthesis is serialized behind a module lock and each call builds a fresh
engine. Every failure mode returns False — callers then leave audio_url None.
"""
from __future__ import annotations

import os
import threading
from pathlib import Path

_LOCK = threading.Lock()


def synth_wav(text: str, out_path: str | Path) -> bool:
    """Render `text` to a wav file at `out_path`. Returns True on success."""
    if not text:
        return False
    out_path = Path(out_path)
    try:
        import pyttsx3

        out_path.parent.mkdir(parents=True, exist_ok=True)
        with _LOCK:
            engine = pyttsx3.init()
            try:
                engine.save_to_file(text, str(out_path))
                engine.runAndWait()
            finally:
                try:
                    engine.stop()
                except Exception:
                    pass
        return out_path.exists() and out_path.stat().st_size > 0
    except Exception:
        try:
            if out_path.exists() and out_path.stat().st_size == 0:
                os.remove(out_path)
        except Exception:
            pass
        return False
