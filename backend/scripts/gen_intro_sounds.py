"""Synthesise the app-open intro sound (no samples needed):

  intro_door.wav — a subtle door opening: a soft latch release, then a gentle wooden hinge creak that
                   swells and settles as the door in the AMASS logo swings ajar (~0.9 s).

Run: python3 scripts/gen_intro_sounds.py   → writes to frontend/assets/sounds/
"""
import os
import wave

import numpy as np

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "assets", "sounds")
SR = 22050


def save(name: str, y: np.ndarray, peak: float):
    y = y / (np.max(np.abs(y)) or 1.0) * peak
    pcm = (np.clip(y, -1, 1) * 32767).astype("<i2")
    with wave.open(os.path.join(OUT, name), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print("wrote", name, f"{len(y) / SR:.2f}s", os.path.getsize(os.path.join(OUT, name)) // 1024, "KB")


def lowpass(x: np.ndarray, cutoff_hz) -> np.ndarray:
    """One-pole low-pass; `cutoff_hz` may be a scalar or a per-sample array."""
    cutoff = np.broadcast_to(np.asarray(cutoff_hz, dtype=float), x.shape)
    alpha = 1 - np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += alpha[i] * (x[i] - acc)
        y[i] = acc
    return y


def door_open(duration=0.9):
    n = int(SR * duration)
    t = np.linspace(0, duration, n, endpoint=False)
    rng = np.random.default_rng(11)

    # 1) Latch release — a tiny damped tick with a touch of noise, right at the start.
    tick = (np.sin(2 * np.pi * 1350 * t) * 0.7 + np.sin(2 * np.pi * 2100 * t) * 0.3) * np.exp(-t * 90)
    tick += rng.standard_normal(n) * np.exp(-t * 260) * 0.5
    tick *= 0.35

    # 2) Hinge creak — stick-slip friction: a low wobbling tone with a handful of harmonics, whose
    #    amplitude flutters (the "grain" of a creak), swelling as the door moves and settling as it stops.
    start, length = 0.10, 0.62
    u = np.clip((t - start) / length, 0, 1)  # 0→1 across the creak
    f0 = 165 + 55 * np.sin(np.pi * u) + 9 * np.sin(2 * np.pi * 6.5 * t)  # pitch rises then eases, slight vibrato
    phase = 2 * np.pi * np.cumsum(f0) / SR
    creak = sum(np.sin(k * phase) / (k ** 1.35) for k in range(1, 7))
    flutter = 0.72 + 0.28 * np.sin(2 * np.pi * 31 * t + 1.3 * np.sin(2 * np.pi * 4 * t))
    env = np.sin(np.pi * u) ** 1.4 * (t >= start) * (t <= start + length)
    creak = creak * flutter * env
    creak = lowpass(creak, 900 + 1400 * np.sin(np.pi * u))  # soften the top end

    # 3) Hinge air — faint, band-limited noise that follows the movement.
    hiss = lowpass(rng.standard_normal(n), 2600) - lowpass(rng.standard_normal(n), 700)
    hiss *= env * 0.08

    y = tick + creak * 0.9 + hiss
    fade = int(0.05 * SR)
    y[-fade:] *= np.linspace(1, 0, fade)
    return y


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    save("intro_door.wav", door_open(), peak=0.42)
