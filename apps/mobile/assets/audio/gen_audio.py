#!/usr/bin/env python3
"""Generates short placeholder WAV cues for the mobile app's audio module.

These are synthesized tones (no external assets/licensing needed) — good
enough for demo purposes. Swap them for real recordings any time; the
loader in `src/audio/whistle.ts` just needs three files with these names.

Usage: python3 gen_audio.py
"""
from __future__ import annotations

import math
import struct
import wave
from pathlib import Path

SAMPLE_RATE = 44100
OUT_DIR = Path(__file__).parent


def write_wav(path: Path, samples: list[float]) -> None:
    with wave.open(str(path), "w") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(SAMPLE_RATE)
        frames = b"".join(
            struct.pack("<h", int(max(-1.0, min(1.0, s)) * 32767)) for s in samples
        )
        f.writeframes(frames)


def envelope(i: int, n: int, attack: int, release: int) -> float:
    if i < attack:
        return i / max(1, attack)
    if i > n - release:
        return max(0.0, (n - i) / max(1, release))
    return 1.0


def whistle(duration: float = 0.9) -> list[float]:
    """Two-tone referee whistle sweep — classic ~2.8kHz + 3.4kHz beat."""
    n = int(SAMPLE_RATE * duration)
    out = []
    for i in range(n):
        t = i / SAMPLE_RATE
        env = envelope(i, n, attack=int(0.01 * SAMPLE_RATE), release=int(0.25 * SAMPLE_RATE))
        sweep = 2600 + 500 * math.sin(2 * math.pi * 6 * t)
        s = 0.6 * math.sin(2 * math.pi * sweep * t) + 0.25 * math.sin(2 * math.pi * (sweep * 1.5) * t)
        out.append(s * env)
    return out


def score_blip(duration: float = 0.28) -> list[float]:
    """Bright ascending two-note chime for a made basket."""
    n = int(SAMPLE_RATE * duration)
    out = []
    notes = [880.0, 1174.7]  # A5 -> D6
    split = n // 2
    for i in range(n):
        t = i / SAMPLE_RATE
        freq = notes[0] if i < split else notes[1]
        local_i = i if i < split else i - split
        local_n = split if i < split else n - split
        env = envelope(local_i, local_n, attack=int(0.005 * SAMPLE_RATE), release=int(0.12 * SAMPLE_RATE))
        s = 0.5 * math.sin(2 * math.pi * freq * t)
        out.append(s * env)
    return out


def crowd_shimmer(duration: float = 1.1, seed: int = 7) -> list[float]:
    """Filtered noise burst standing in for a crowd cheer shimmer."""
    n = int(SAMPLE_RATE * duration)
    out = []
    state = seed / 1000.0
    prev = 0.0
    for i in range(n):
        env = envelope(i, n, attack=int(0.08 * SAMPLE_RATE), release=int(0.6 * SAMPLE_RATE))
        # cheap deterministic pseudo-noise (LCG) low-passed for a "shimmer" feel
        state = (state * 9301 + 49297) % 233280
        white = (state / 233280.0) * 2 - 1
        prev = prev * 0.85 + white * 0.15
        out.append(prev * 0.7 * env)
    return out


def main() -> None:
    write_wav(OUT_DIR / "whistle.wav", whistle())
    write_wav(OUT_DIR / "score.wav", score_blip())
    write_wav(OUT_DIR / "crowd.wav", crowd_shimmer())
    print("Wrote whistle.wav, score.wav, crowd.wav to", OUT_DIR)


if __name__ == "__main__":
    main()
