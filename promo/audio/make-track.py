"""Skills Hub 宣传片配乐：纯 numpy/scipy 合成，节拍网格与画面共用 src/cues.json。

F 小调，120 BPM（一拍 0.5s，一小节 2s）。所有音色都是算出来的，无采样、无版权素材。
输出 out/track.wav（48kHz 立体声 16bit）。

  python3 audio/make-track.py
"""

import json
import os
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, fftconvolve, sosfilt

ROOT = Path(__file__).resolve().parent.parent
CUES = json.loads((ROOT / "src" / "cues.json").read_text(encoding="utf-8"))
OUT = ROOT / "out"

SR = 48000
BPM = CUES["bpm"]
BEAT = 60.0 / BPM
TOTAL_BEATS = CUES["beats"]
N = int(TOTAL_BEATS * BEAT * SR) + SR  # 尾部多留 1s，最后裁掉
RNG = np.random.default_rng(20260815)  # 第一次同步会的日期当种子：结果可复现


def at(beat: float) -> int:
    return int(round(beat * BEAT * SR))


def secs(s: float) -> np.ndarray:
    return np.arange(int(s * SR)) / SR


def midi(m: float) -> float:
    return 440.0 * 2 ** ((m - 69) / 12)


def filt(x: np.ndarray, kind: str, freq, order: int = 2) -> np.ndarray:
    sos = butter(order, freq, btype=kind, fs=SR, output="sos")
    return sosfilt(sos, x, axis=-1)


def sweep_filter(x: np.ndarray, f0: float, f1: float, kind: str = "bandpass", block: int = 512) -> np.ndarray:
    """分块近似时变滤波：中心频率按指数从 f0 走到 f1。"""
    out = np.zeros_like(x)
    nb = max(1, len(x) // block)
    for i in range(nb + 1):
        s, e = i * block, min(len(x), (i + 1) * block)
        if s >= e:
            break
        f = f0 * (f1 / f0) ** (i / max(1, nb))
        if kind == "bandpass":
            band = [max(20.0, f * 0.7), min(SR / 2 - 100, f * 1.4)]
            out[s:e] = filt(x[max(0, s - 2048):e], "bandpass", band)[-(e - s):]
        else:
            out[s:e] = filt(x[max(0, s - 2048):e], kind, min(SR / 2 - 100, f))[-(e - s):]
    return out


class Bus:
    def __init__(self) -> None:
        self.x = np.zeros((2, N))

    def add(self, sig: np.ndarray, beat: float, gain: float = 1.0, pan: float = 0.0) -> None:
        i = at(beat)
        if i >= N:
            return
        if sig.ndim == 1:
            l, r = np.sqrt((1 - pan) / 2), np.sqrt((1 + pan) / 2)
            sig = np.stack([sig * l * 1.414, sig * r * 1.414])
        n = min(sig.shape[1], N - i)
        self.x[:, i:i + n] += sig[:, :n] * gain


drums, bass, music, fx = Bus(), Bus(), Bus(), Bus()

# ---------------------------------------------------------------- 音色


def kick(power: float = 1.0) -> np.ndarray:
    t = secs(0.55)
    f = 44 + 120 * np.exp(-t / 0.035)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (0.26 * power))
    click = filt(RNG.standard_normal(len(t)), "highpass", 2500) * np.exp(-t / 0.004) * 0.35
    return np.tanh(1.6 * (body + click)) * power


def heartbeat() -> np.ndarray:
    t = secs(0.7)
    f = 38 + 60 * np.exp(-t / 0.05)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.22)


def snare() -> np.ndarray:
    t = secs(0.35)
    tone = np.sin(2 * np.pi * 185 * t) * np.exp(-t / 0.05) * 0.6
    noise = filt(RNG.standard_normal(len(t)), "bandpass", [1200, 9000]) * np.exp(-t / 0.13)
    return np.tanh(1.3 * (tone + noise))


def clap() -> np.ndarray:
    t = secs(0.4)
    env = np.zeros_like(t)
    for d in (0.0, 0.011, 0.022):
        env += (t >= d) * np.exp(-np.clip(t - d, 0, None) / 0.008)
    env += (t >= 0.03) * np.exp(-np.clip(t - 0.03, 0, None) / 0.14)
    return filt(RNG.standard_normal(len(t)), "bandpass", [900, 4200]) * env * 0.8


def hat(open_: bool = False) -> np.ndarray:
    t = secs(0.45 if open_ else 0.08)
    return filt(RNG.standard_normal(len(t)), "bandpass", [7000, 14000]) * np.exp(-t / (0.22 if open_ else 0.022)) * 0.7


def crash(length: float = 2.6) -> np.ndarray:
    t = secs(length)
    n = filt(RNG.standard_normal(len(t)), "highpass", 3500) * np.exp(-t / 0.9)
    ring = sum(np.sin(2 * np.pi * f * t + RNG.uniform(0, 6)) for f in (3120, 4470, 5310, 6870)) * 0.05
    return (n + ring * np.exp(-t / 0.6)) * 0.7


def sub_boom(length: float = 2.8, f_hi: float = 62, f_lo: float = 32) -> np.ndarray:
    t = secs(length)
    f = f_lo + (f_hi - f_lo) * np.exp(-t / 0.35)
    return np.tanh(1.8 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 1.0))


def saw_additive(freq: float, t: np.ndarray, harmonics: int = 24, bright=None) -> np.ndarray:
    """带限锯齿：谐波叠加，高于奈奎斯特的谐波直接丢弃。bright(k, t) 给每个谐波随时间的包络。"""
    out = np.zeros_like(t)
    for k in range(1, harmonics + 1):
        if k * freq > SR / 2 - 1000:
            break
        amp = 1.0 / k
        if bright is not None:
            amp = amp * bright(k, t)
        out += amp * np.sin(2 * np.pi * k * freq * t)
    return out


def pluck(m: float, length: float = 0.45) -> np.ndarray:
    t = secs(length)
    f = midi(m)
    return saw_additive(f, t, 18, lambda k, tt: np.exp(-tt * (6 + 2.2 * k))) * 0.5


def blip(m: float, length: float = 0.18) -> np.ndarray:
    t = secs(length)
    f = midi(m)
    return (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)) * np.exp(-t / 0.05) * np.minimum(1, t / 0.002)


def stab(notes, length: float = 0.9, bright_decay: float = 0.25) -> np.ndarray:
    t = secs(length)
    out = np.zeros_like(t)
    for m in notes:
        for det in (-0.08, 0.0, 0.08):
            out += saw_additive(midi(m + det), t, 20, lambda k, tt: np.exp(-tt * k / (bright_decay * 12)))
    env = np.minimum(1, t / 0.004) * np.exp(-t / (length * 0.35))
    return np.tanh(out * env * 0.25)


def pad(notes, length: float, attack: float = 0.6, release: float = 0.8, cutoff: float = 2200) -> np.ndarray:
    t = secs(length)
    left, right = np.zeros_like(t), np.zeros_like(t)
    for m in notes:
        for i, det in enumerate((-0.12, -0.04, 0.05, 0.13)):
            v = saw_additive(midi(m + det), t, 14)
            if i % 2:
                left += v
            else:
                right += v
    env = np.minimum(1, t / attack) * np.minimum(1, np.clip(length - t, 0, None) / release)
    sig = np.stack([left, right]) * env * 0.09
    return filt(sig, "lowpass", cutoff)


def bass_note(m: float, length: float, reese: bool = False) -> np.ndarray:
    t = secs(length)
    f = midi(m)
    if reese:
        v = saw_additive(f * 0.994, t, 30) + saw_additive(f * 1.006, t, 30)
        v = np.tanh(filt(v, "lowpass", 900) * 1.4)
    else:
        v = saw_additive(f, t, 16, lambda k, tt: np.exp(-tt * k * 1.5)) + 0.6 * np.sin(2 * np.pi * f * t)
    env = np.minimum(1, t / 0.004) * np.minimum(1, np.clip(length - t, 0, None) / 0.02)
    return v * env * 0.55


def riser(length: float, f0: float = 300, f1: float = 9000) -> np.ndarray:
    t = secs(length)
    n = sweep_filter(RNG.standard_normal(len(t)), f0, f1)
    tone_f = 180 * (12 ** (t / length))
    tone = np.sin(2 * np.pi * np.cumsum(tone_f) / SR) * 0.25
    env = (t / length) ** 2.2
    return (n * 0.9 + tone) * env


def whoosh(length: float = 0.6) -> np.ndarray:
    t = secs(length)
    n = RNG.standard_normal(len(t))
    half = len(t) // 2
    up = sweep_filter(n[:half], 400, 6000)
    down = sweep_filter(n[half:], 6000, 900)
    env = np.sin(np.pi * t / length) ** 2
    return np.concatenate([up, down]) * env * 0.6


def reverse_swell(length: float) -> np.ndarray:
    return crash(length)[::-1] * np.linspace(0, 1, int(length * SR)) ** 1.5


def clack() -> np.ndarray:
    """模块「咔」地插进内核：短噪声 + 非谐金属共振。"""
    t = secs(0.5)
    n = filt(RNG.standard_normal(len(t)), "bandpass", [1500, 7000]) * np.exp(-t / 0.012)
    ring = sum(np.sin(2 * np.pi * f * t) for f in (1860, 2790, 4133)) * np.exp(-t / 0.09) * 0.2
    body = np.sin(2 * np.pi * 95 * t) * np.exp(-t / 0.06) * 0.8
    return n + ring + body


def type_click() -> np.ndarray:
    t = secs(0.03)
    return filt(RNG.standard_normal(len(t)), "bandpass", [2000, 6000]) * np.exp(-t / 0.004) * 0.6


def tom(m: float) -> np.ndarray:
    t = secs(0.6)
    f = midi(m) * (1 + 0.6 * np.exp(-t / 0.03))
    return np.tanh(1.5 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.22))


def shimmer(notes, length: float = 3.0) -> np.ndarray:
    t = secs(length)
    out = np.zeros_like(t)
    for i, m in enumerate(notes):
        d = i * 0.06
        tt = np.clip(t - d, 0, None)
        out += (t >= d) * np.sin(2 * np.pi * midi(m) * t) * np.exp(-tt / 1.1) * np.minimum(1, tt / 0.01)
    return out * 0.18


# ---------------------------------------------------------------- 和声

CHORDS = {
    "Fm": [53, 56, 60], "Db": [49, 53, 56], "Ab": [56, 60, 63], "Eb": [51, 55, 58],
    "Bbm": [58, 61, 65], "C": [48, 52, 55], "Abmaj": [56, 60, 63, 67],
}
# 每小节（4 拍）一个和弦，对应 cues.json 的段落
BARS = (
    ["Fm", "Fm"]                                  # intro   b0–8
    + ["Fm", "Db", "Ab", "Eb"]                    # growth  b8–24
    + ["Fm", "Db", "Bbm", "C"]                    # chaos   b24–40
    + ["Fm"]                                      # title   b40–44
    + ["Db", "Ab", "Eb", "Fm", "Db", "Ab", "Eb", "C"]  # system  b44–76
    + ["Fm", "Db", "Ab"]                          # extend  b76–88
    + ["Eb", "C"]                                 # team    b88–96
    + ["Db", "Eb"]                                # beyond  b96–104
    + ["Abmaj", "Abmaj", "Abmaj"]                 # finale  b104–114（落到关系大调：远景）
)


def chord(bar: int):
    return CHORDS[BARS[min(bar, len(BARS) - 1)]]


def root(bar: int) -> int:
    notes = chord(bar)
    return notes[0] - 24 if notes[0] >= 50 else notes[0] - 12


def in_silence(b: float) -> bool:
    return any(s <= b < e for s, e in CUES["silences"])


kicks: list[float] = []


def K(b: float, power: float = 1.0) -> None:
    if in_silence(b):
        return
    drums.add(kick(power), b, 0.95)
    kicks.append(b)


# ---------------------------------------------------------------- 编曲

# intro b0–8：心跳 + 低垫 + 打字声（与画面 typing 同步：b1–b3 键入 21 个字符）
for b in (0, 2, 4, 6):
    drums.add(heartbeat(), b, 0.8)
    drums.add(heartbeat(), b + 0.3, 0.45)
music.add(pad(chord(0), 8 * BEAT + 0.4, attack=2.5, cutoff=900), 0, 0.9)
for i in range(21):
    fx.add(type_click(), 1 + i * (2 / 21) + RNG.uniform(-0.02, 0.02), 0.5, pan=RNG.uniform(-0.3, 0.3))
fx.add(riser(2 * BEAT, 800, 6000), 6, 0.35)

# growth b8–24：四踩进场，卡片每两拍翻倍（上行 blip）
for b in range(8, 24):
    K(b)
    if b >= 12:
        drums.add(hat(), b + 0.5, 0.35, pan=0.2)
    if b >= 16 and b % 2 == 1:
        drums.add(clap(), b, 0.55)
for i, b in enumerate(range(8, 24, 2)):
    fx.add(blip(72 + [0, 3, 7, 12, 15, 19, 24, 27][i]), b, 0.28)
for bar in range(2, 6):
    music.add(pad(chord(bar), 4 * BEAT + 0.3, attack=0.4, cutoff=1800), bar * 4, 0.7)
    notes = chord(bar)
    arp = [notes[0] + 12, notes[1] + 12, notes[2] + 12, notes[0] + 24]
    for s in range(16):
        b = bar * 4 + s * 0.25
        g = 0.12 + 0.18 * (b - 8) / 16
        music.add(pluck(arp[s % 4] + (12 if s % 8 >= 6 else 0)), b, g, pan=0.35 * np.sin(s))
    for s in range(4):
        bass.add(bass_note(root(bar), BEAT * 0.45), bar * 4 + s + 0.5, 0.6)
for s in range(8):
    drums.add(snare(), 22 + s * 0.25, 0.15 + 0.05 * s)
fx.add(whoosh(1.0), 23, 0.5)

# chaos b24–40：reese 低音、军鼓、切片故障、三记重音「很多 / 很怪 / 没人知道」
drums.add(crash(), 24, 0.6)
fx.add(sub_boom(1.6), 24, 0.6)
for b in range(24, 40):
    K(b, 1.05)
    if b % 2 == 1 and b < 38:
        drums.add(snare(), b, 0.7)
    for s in range(4):
        if not in_silence(b + s * 0.25):
            drums.add(hat(), b + s * 0.25, 0.22 if s % 2 else 0.3, pan=-0.25)
for bar in range(6, 10):
    for s in range(8):
        b = bar * 4 + s * 0.5
        if b < 39.5:
            bass.add(bass_note(root(bar), BEAT * 0.48, reese=True), b, 0.75)
    music.add(pad(chord(bar), 4 * BEAT, attack=0.1, cutoff=1400), bar * 4, 0.55)
for b in (28, 30, 32, 34):
    fx.add(whoosh(0.4), b - 0.35, 0.35)
for b, nm in ((36, "Fm"), (37, "Db"), (38, "C")):
    music.add(stab([n + 12 for n in CHORDS[nm]] + [CHORDS[nm][0]], 0.9), b, 0.6)
    fx.add(sub_boom(0.9, 70, 40), b, 0.55)
for s in range(12):
    drums.add(snare(), 38 + s * 0.125, 0.2 + 0.04 * s)
fx.add(riser(7.5 * BEAT, 250, 11000), 32, 0.6)
fx.add(reverse_swell(1.2), 40 - 1.2 / BEAT, 0.7)

# title b40–44：大冲击 + Logo 微光
drums.add(crash(3.5), 40, 0.9)
fx.add(sub_boom(3.2), 40, 1.0)
music.add(stab([41, 53, 56, 60, 65], 2.2, bright_decay=0.5), 40, 0.75)
music.add(pad(chord(10), 4 * BEAT + 0.8, attack=0.05, release=1.2, cutoff=2600), 40, 0.8)
fx.add(shimmer([77, 80, 84, 89, 92], 3.0), 40.5, 0.8)
fx.add(blip(84, 0.4), 42, 0.25)
fx.add(reverse_swell(0.9), 44 - 0.9 / BEAT, 0.45)

# system b44–76：主律动，四章节每章 8 拍，章首 crash + whoosh
for b in range(44, 76):
    K(b)
    if b % 2 == 1:
        drums.add(clap(), b, 0.6)
    for s in range(4):
        drums.add(hat(open_=(s == 2)), b + s * 0.25, [0.28, 0.16, 0.22, 0.16][s], pan=0.25 if s % 2 else -0.15)
for b in (44, 52, 60, 68):
    drums.add(crash(2.0), b, 0.45)
    fx.add(whoosh(0.6), b - 0.6, 0.4)
for bar in range(11, 19):
    notes = chord(bar)
    music.add(pad(notes, 4 * BEAT + 0.2, attack=0.2, cutoff=2400), bar * 4, 0.6)
    r = root(bar)
    for s in range(16):
        b = bar * 4 + s * 0.25
        m = r + (12 if s % 4 == 2 else 0)
        if s % 4 != 0:
            bass.add(bass_note(m, BEAT * 0.22), b, 0.55)
    arp = [notes[0] + 12, notes[2] + 12, notes[1] + 24, notes[2] + 12]
    for s in range(8):
        music.add(pluck(arp[s % 4], 0.35), bar * 4 + s * 0.5 + 0.25, 0.14, pan=-0.4 if s % 2 else 0.4)
# 链：8 个客户端节点逐拍点亮，上行音阶
for i, b in enumerate(range(52, 60)):
    fx.add(blip([65, 68, 72, 75, 77, 80, 84, 87][i], 0.25), b, 0.25, pan=-0.6 + i * 0.17)
# 看：界面进场
fx.add(whoosh(0.9), 59.6, 0.5)
for b in (61, 63, 65):
    fx.add(blip(89, 0.12), b + 0.5, 0.15)

# extend b76–88：四个接口模块逐拍插入内核
drums.add(crash(2.2), 76, 0.55)
for b in range(76, 88):
    K(b)
    if b % 2 == 1:
        drums.add(clap(), b, 0.55)
    drums.add(hat(), b + 0.5, 0.3)
for b in (77, 79, 81, 83):
    fx.add(clack(), b, 0.7)
    fx.add(sub_boom(0.5, 90, 50), b, 0.35)
for bar in range(19, 22):
    notes = chord(bar)
    music.add(pad(notes, 4 * BEAT + 0.2, attack=0.3, cutoff=2000), bar * 4, 0.6)
    for s in range(16 if bar == 21 else 8):
        step = 0.25 if bar == 21 else 0.5
        music.add(pluck([notes[0] + 12, notes[1] + 12, notes[2] + 12, notes[0] + 24][s % 4], 0.3), bar * 4 + s * step, 0.13)
    for s in range(4):
        bass.add(bass_note(root(bar), BEAT * 0.45), bar * 4 + s + 0.5, 0.55)
fx.add(riser(2 * BEAT, 500, 8000), 86, 0.35)

# team b88–96：轻一点的律动，尾部过门进入远景
drums.add(crash(2.0), 88, 0.45)
for b in range(88, 96):
    K(b, 0.95)
    if b % 2 == 1:
        drums.add(clap(), b, 0.5)
    drums.add(hat(), b + 0.5, 0.26)
    drums.add(hat(), b + 0.75, 0.14)
for bar in (22, 23):
    notes = chord(bar)
    music.add(pad(notes, 4 * BEAT + 0.2, attack=0.2, cutoff=2600), bar * 4, 0.6)
    for s in range(8):
        bass.add(bass_note(root(bar), BEAT * 0.22), bar * 4 + s * 0.5 + 0.25, 0.5)
for i, m in enumerate((45, 43, 41, 38)):
    drums.add(tom(m), 94 + i * 0.5, 0.5)
fx.add(reverse_swell(1.0), 96 - 1.0 / BEAT, 0.6)

# beyond b96–104：远景推进，三记重音「Skills / 连接 / 一切」
drums.add(crash(3.0), 96, 0.8)
fx.add(sub_boom(2.0), 96, 0.8)
for b in range(96, 104):
    K(b, 1.05)
    for s in (0.5,):
        drums.add(tom(40), b + s, 0.25)
for bar in (24, 25):
    notes = chord(bar)
    music.add(pad(notes + [notes[0] + 12], 4 * BEAT + 0.2, attack=0.1, cutoff=3200), bar * 4, 0.75)
    for s in range(16):
        music.add(pluck([notes[0] + 24, notes[1] + 24, notes[2] + 24, notes[1] + 12][s % 4], 0.3), bar * 4 + s * 0.25, 0.14)
    for s in range(8):
        bass.add(bass_note(root(bar), BEAT * 0.45, reese=True), bar * 4 + s * 0.5, 0.45)
for b, nm in ((98, "Db"), (100, "Eb"), (102, "Eb")):
    music.add(stab([n + 12 for n in CHORDS[nm]] + [CHORDS[nm][0]], 1.0), b, 0.5)
    fx.add(sub_boom(1.0, 70, 38), b, 0.55)
fx.add(riser(3.5 * BEAT, 300, 12000), 100, 0.55)
fx.add(reverse_swell(1.0), 104 - 1.0 / BEAT, 0.8)

# finale b104–114：定版冲击，关系大调长音收尾
drums.add(crash(5.0), 104, 1.0)
fx.add(sub_boom(4.0, 60, 30), 104, 1.0)
music.add(stab([44, 56, 60, 63, 67, 72], 3.0, bright_decay=0.6), 104, 0.7)
music.add(pad([44, 56, 60, 63, 67], 10 * BEAT, attack=0.05, release=3.0, cutoff=3000), 104, 0.9)
fx.add(shimmer([80, 84, 87, 91, 96, 99], 4.5), 104.5, 0.9)
fx.add(blip(96, 0.6), 110, 0.12)

# ---------------------------------------------------------------- 混音

t_all = np.arange(N) / SR
side = np.ones(N)
for b in kicks:
    i = at(b)
    n = min(int(0.35 * SR), N - i)
    tt = np.arange(n) / SR
    side[i:i + n] = np.minimum(side[i:i + n], 1 - 0.6 * np.exp(-tt / 0.1))

bass.x *= side
music.x *= side
bass.x = filt(bass.x, "highpass", 30)

dry = drums.x + bass.x * 0.9 + music.x + fx.x * 0.85

ir_t = secs(2.4)
ir = np.stack([
    filt(RNG.standard_normal(len(ir_t)), "lowpass", 5000) * np.exp(-ir_t / 0.55),
    filt(RNG.standard_normal(len(ir_t)), "lowpass", 5000) * np.exp(-ir_t / 0.55),
])
ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
send = music.x * 0.45 + fx.x * 0.5 + drums.x * 0.08
wet = np.stack([fftconvolve(send[c], ir[c])[:N] for c in range(2)]) * 0.55

mix = dry + wet
mix = filt(mix, "highpass", 24)
mix = filt(mix, "lowpass", 15000)

# 静默段：硬切（画面同时黑场）；保留混响尾和反向铺垫，让「吸气」更明显
for s, e in CUES["silences"]:
    i0, i1 = at(s), at(e)
    ramp = np.linspace(1, 0, 240)
    mix[:, i0:i0 + 240] *= ramp
    mix[:, i0 + 240:i1] *= 0.0
    mix[:, i0 + 240:i1] += fx.x[:, i0 + 240:i1] * 0.85 + wet[:, i0 + 240:i1] * 0.4

# 故障切片：把 1/32 拍的碎片重复几遍（混乱段）
for b in (31.5, 35.5, 38.75):
    i = at(b)
    L = int(BEAT / 8 * SR)
    grain = mix[:, i:i + L].copy()
    for r in range(4):
        mix[:, i + r * L:i + (r + 1) * L] = grain * (1 - 0.12 * r)

# 母带：软削波 + 峰值归一
mix = np.tanh(mix * 0.9)
mix = mix[:, : int(TOTAL_BEATS * BEAT * SR)]
fade = int(1.2 * SR)
mix[:, -fade:] *= np.linspace(1, 0, fade) ** 2
mix /= np.abs(mix).max() / 0.89

OUT.mkdir(exist_ok=True)
wavfile.write(OUT / "track.wav", SR, (mix.T * 32767).astype(np.int16))

rms = lambda x: 20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-9)  # noqa: E731
print(f"wrote {OUT / 'track.wav'}  {mix.shape[1] / SR:.2f}s  rms={rms(mix):.1f} dBFS")
for sec in CUES["sections"]:
    a, b = at(sec["start"]), at(sec["end"])
    print(f"  {sec['id']:<7} b{sec['start']:>3}-{sec['end']:<3} rms={rms(mix[:, a:b]):6.1f} dBFS")
