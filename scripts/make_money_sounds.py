"""Synthesise the Money Rain sounds (no external samples): a bright, celebratory 'money lands' jingle.

  money_soft.wav      ~1.0 s  — brief / subtle rain: snappy thump + quick rising C-major run into a sparkling high chord
  money_celebrate.wav ~2.4 s  — celebrate: thump, two-octave rising flourish, big bright chord with shimmer + coin glitter

Run:  python3 scripts/make_money_sounds.py   (writes to frontend/assets/sounds/)
"""
from __future__ import annotations

import os
import wave

import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), "..", "frontend", "assets", "sounds")


def env(n: int, attack: float, decay: float, sustain: float = 0.0) -> np.ndarray:
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    d = np.exp(-t / max(decay, 1e-4))
    return a * np.maximum(d, sustain)


def bell(freq: float, dur: float, gain: float = 1.0, bright: float = 1.0) -> np.ndarray:
    """Soft bell: fundamental + gently detuned partials, each decaying faster than the last."""
    n = int(SR * dur)
    t = np.arange(n) / SR
    partials = [(1.0, 1.0, 1.0), (2.0, 0.42 * bright, 0.55), (3.01, 0.18 * bright, 0.35), (4.2, 0.08 * bright, 0.25)]
    out = np.zeros(n)
    for ratio, amp, dec in partials:
        out += amp * np.sin(2 * np.pi * freq * ratio * t + 0.3 * ratio) * env(n, 0.004, dur * dec * 0.6)
    # slow vibrato for warmth
    out *= 1 + 0.015 * np.sin(2 * np.pi * 5.5 * t)
    return gain * out


def thump(dur: float = 0.35, gain: float = 1.0) -> np.ndarray:
    """A felt-mallet thump — pitch drops from 180 Hz to 60 Hz. Gives the sound weight and confidence."""
    n = int(SR * dur)
    t = np.arange(n) / SR
    f = 60 + 120 * np.exp(-t * 22)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * env(n, 0.002, 0.12)
    click = np.random.default_rng(3).normal(0, 1, n) * env(n, 0.0005, 0.012) * 0.25
    return gain * (body + lowpass(click, 1800))


def lowpass(x: np.ndarray, cutoff: float) -> np.ndarray:
    rc = 1 / (2 * np.pi * cutoff)
    alpha = (1 / SR) / (rc + 1 / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc += alpha * (v - acc)
        y[i] = acc
    return y


def flutter(dur: float, gain: float = 1.0, seed: int = 7, bursts: int = 6) -> np.ndarray:
    """Paper flutter — short band-passed noise puffs, like bundles of notes tumbling through the air."""
    rng = np.random.default_rng(seed)
    n = int(SR * dur)
    out = np.zeros(n)
    for i in range(bursts):
        start = int(rng.uniform(0.02, dur * 0.75) * SR)
        ln = int(rng.uniform(0.035, 0.09) * SR)
        if start + ln >= n:
            continue
        puff = rng.normal(0, 1, ln) * env(ln, 0.004, 0.03)
        puff = lowpass(puff, rng.uniform(2200, 4200)) - lowpass(puff, 500)
        out[start : start + ln] += puff * rng.uniform(0.5, 1.0)
    return gain * out


def mix(parts: list[tuple[np.ndarray, float]], total: float) -> np.ndarray:
    n = int(SR * total)
    out = np.zeros(n)
    for sig, at in parts:
        s = int(at * SR)
        ln = min(len(sig), n - s)
        if ln > 0:
            out[s : s + ln] += sig[:ln]
    # soft-clip for punch + normalise to -0.5 dBFS (bright and loud, never harsh)
    out = np.tanh(out * 1.35)
    out *= 0.94 / max(np.max(np.abs(out)), 1e-6)
    # final fade so nothing clicks at the end
    tail = int(0.04 * SR)
    out[-tail:] *= np.linspace(1, 0, tail)
    return out


def write(name: str, data: np.ndarray) -> None:
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name)
    pcm = (np.clip(data, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f"wrote {path} ({os.path.getsize(path) // 1024} KB, {len(data) / SR:.2f} s)")


def coin(freq: float, dur: float = 0.18, gain: float = 1.0) -> np.ndarray:
    """Coin 'ting' — a bright, fast-decaying metallic pair of partials (the sparkle on top of the jingle)."""
    n = int(SR * dur)
    t = np.arange(n) / SR
    return gain * (np.sin(2 * np.pi * freq * t) + 0.45 * np.sin(2 * np.pi * freq * 2.76 * t)) * env(n, 0.001, dur * 0.3)


def sparkle(dur: float, gain: float = 1.0, seed: int = 9, count: int = 10, lo: float = 2200.0, hi: float = 4800.0) -> list[tuple[np.ndarray, float]]:
    """A scatter of coin tings across the tail — glittering, not noisy."""
    rng = np.random.default_rng(seed)
    return [(coin(float(rng.uniform(lo, hi)), 0.16, gain * float(rng.uniform(0.35, 0.8))), float(rng.uniform(0.0, dur))) for _ in range(count)]


def flourish(notes: list[float], start: float, step: float, dur: float, gain: float, bright: float = 1.3) -> list[tuple[np.ndarray, float]]:
    """A fast rising run — each bell lands `step` seconds after the last and rings into the next."""
    return [(bell(f, dur, gain * (0.8 + 0.2 * i / max(len(notes) - 1, 1)), bright=bright), start + i * step) for i, f in enumerate(notes)]


C5, D5, E5, G5, A5, B5 = 523.25, 587.33, 659.25, 783.99, 880.0, 987.77
C6, D6, E6, G6, A6, C7, E7, G7 = 1046.5, 1174.7, 1318.5, 1568.0, 1760.0, 2093.0, 2637.0, 3136.0

# Bright celebratory jingle (brief / subtle): a snappy thump, a quick rising C-major run that lands on a sparkling
# high chord — energetic and confident, over in under a second.
soft = mix(
    [
        (thump(0.28, 1.0), 0.0),
        (flutter(0.9, 0.2, seed=11, bursts=6), 0.03),
        *flourish([C6, E6, G6], 0.04, 0.07, 0.55, 0.62),
        (bell(C7, 0.75, 0.6, bright=1.2), 0.26),
        (bell(E7, 0.7, 0.3, bright=1.0), 0.26),
        *sparkle(0.55, 0.22, seed=13, count=6),
    ],
    1.0,
)
write("money_soft.wav", soft)

# Celebrate: a bold thump, a long rising flourish (two octaves of C major), a big bright chord with a shimmering
# tail, a second thump under the chord, and coins glittering all the way out.
celebrate = mix(
    [
        (thump(0.35, 1.1), 0.0),
        (flutter(2.2, 0.26, seed=5, bursts=14), 0.02),
        *flourish([C5, E5, G5, C6, E6, G6, C7], 0.05, 0.085, 0.7, 0.55),
        (thump(0.32, 0.8), 0.62),
        (bell(C6, 1.7, 0.6, bright=1.1), 0.64),
        (bell(E6, 1.7, 0.55, bright=1.1), 0.64),
        (bell(G6, 1.8, 0.5, bright=1.0), 0.66),
        (bell(C7, 1.9, 0.45, bright=1.0), 0.68),
        (bell(E7, 1.3, 0.2, bright=0.8), 0.9),
        (bell(G7, 1.3, 0.14, bright=0.7), 1.05),
        *sparkle(1.6, 0.26, seed=21, count=14),
    ],
    2.4,
)
write("money_celebrate.wav", celebrate)
