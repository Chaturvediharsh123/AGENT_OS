"""Synthesise the soundtrack: 112 BPM, A minor, with SFX in key. Writes audio.wav."""
import wave
import numpy as np

SR, DUR = 44100, 21.0
N = int(SR * DUR)
t_all = np.arange(N) / SR
rng = np.random.default_rng(7)
music = np.zeros((N, 2))
sfx = np.zeros((N, 2))

BPM = 112
BEAT = 60 / BPM
DROP = 2.8                        # reveal lands on a downbeat
GRID0 = DROP - 6 * BEAT           # grid start before 0 so beats align to DROP
note = lambda m: 440 * 2 ** ((m - 69) / 12)

def lp(x, a):                      # one-pole low-pass, a in (0,1)
    y = np.empty_like(x); acc = 0.0
    for i, v in enumerate(x):
        acc += a * (v - acc); y[i] = acc
    return y

def add(buf, start, sig, gain=1.0, pan=0.0):
    i = int(start * SR)
    if i >= N: return
    sig = sig[: N - i]
    l, r = np.sqrt(0.5 * (1 - pan)), np.sqrt(0.5 * (1 + pan))
    buf[i:i + len(sig), 0] += sig * gain * l
    buf[i:i + len(sig), 1] += sig * gain * r

def env(n, a, r, sus=1.0):
    e = np.ones(n) * sus
    na, nr = int(a * SR), int(r * SR)
    e[:na] = np.linspace(0, sus, na) if na else e[:na]
    if nr: e[-nr:] *= np.linspace(1, 0, nr)
    return e

# ---- chords: Am F C G, 4 beats each
CHORDS = [[57, 60, 64, 69], [53, 57, 60, 65], [48, 55, 60, 64], [55, 59, 62, 67]]
ROOTS = [45, 41, 48, 43]
bar = 4 * BEAT
k = 0
start = GRID0
while start < DUR:
    ci = k % 4
    L = bar + 0.3
    n = int(L * SR); tt = np.arange(n) / SR
    pad = np.zeros(n)
    for m in CHORDS[ci]:
        for d in (-0.08, 0.08):
            f = note(m) * 2 ** (d / 12)
            pad += 2 * ((tt * f) % 1) - 1          # saw
    pad = lp(pad / 8, 0.035) * env(n, 0.5, 0.6)
    s = max(start, 0); off = int((s - start) * SR)
    add(music, s, pad[off:], 0.55, -0.2)
    add(music, s, np.roll(pad, 300)[off:], 0.55, 0.2)
    # sub bass from the drop until the outro
    if start >= DROP - 0.01 and start < 18.1:
        b = np.sin(2 * np.pi * note(ROOTS[ci] - 12) * tt) * env(n, 0.02, 0.3)
        add(music, start, b, 0.5)
    k += 1; start += bar

# ---- drums
def kick():
    n = int(0.45 * SR); tt = np.arange(n) / SR
    f = 50 + 90 * np.exp(-tt * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 7)

def hat():
    n = int(0.08 * SR)
    x = rng.standard_normal(n)
    x = x - lp(x, 0.4)                               # crude high-pass
    return x * np.exp(-np.arange(n) / SR * 60)

b = 0
while GRID0 + b * BEAT < DUR:
    bt = GRID0 + b * BEAT
    if DROP - 0.01 <= bt < 18.15:
        add(music, bt, kick(), 0.85)
        if bt >= 6.0 - 0.01:
            add(music, bt + BEAT / 2, hat(), 0.12, 0.3)
    b += 1

# ---- SFX, all from A-minor pentatonic
def tone(f, dur, decay, harm=(1, 0.3)):
    n = int(dur * SR); tt = np.arange(n) / SR
    x = sum(a * np.sin(2 * np.pi * f * (i + 1) * tt) for i, a in enumerate(harm))
    return x * np.exp(-tt * decay) * env(n, 0.004, 0.02)

def noise_swell(dur, peak_at=0.85, cutoff=0.08):
    n = int(dur * SR)
    x = lp(rng.standard_normal(n), cutoff)
    e = np.minimum(np.arange(n) / (n * peak_at), 1) ** 2
    e[int(n * peak_at):] = np.linspace(1, 0, n - int(n * peak_at))
    return x * e

# hook word pops
for i, tm in enumerate([0.15, 0.31, 0.47, 0.63]):
    add(sfx, tm, tone(note([69, 72, 74, 76][i]), 0.25, 18), 0.22, -0.2 + 0.13 * i)
# riser into the drop + low boom
add(sfx, DROP - 0.7, noise_swell(0.72, 0.97, 0.12), 0.35)
add(sfx, DROP, tone(note(33), 1.2, 3, (1, 0.5, 0.2)), 0.45)
# transitions: soft whooshes
for tm in (5.75, 10.95, 15.15, 17.95):
    add(sfx, tm, noise_swell(0.5, 0.6, 0.05), 0.28, 0.2)
# typing ticks
tt_ = 6.55
while tt_ < 9.2:
    add(sfx, tt_, tone(note(81 + int(rng.integers(0, 3)) * 2), 0.03, 90, (1,)) , 0.05, float(rng.uniform(-.3, .3)))
    tt_ += 0.085 + float(rng.uniform(0, 0.04))
# crew chips on
for i in range(4):
    add(sfx, 9.35 + i * 0.14, tone(note([76, 79, 81, 84][i]), 0.18, 25), 0.12, -0.3 + 0.2 * i)
# dispatch click
add(sfx, 10.55, tone(note(57), 0.12, 45, (1, .6, .3)), 0.35)
add(sfx, 10.57, tone(note(81), 0.3, 12), 0.18)
# pipeline completions
P0, STEP = 11.75, 0.78
for i in range(4):
    add(sfx, P0 + (i + 1) * STEP, tone(note([81, 84, 86, 88][i]), 0.5, 9, (1, .25, .1)), 0.2, -0.3 + 0.2 * i)
# export chime
add(sfx, 16.35, tone(note(81), 1.0, 4, (1, .2)), 0.18, -0.15)
add(sfx, 16.42, tone(note(88), 1.0, 4, (1, .2)), 0.14, 0.15)
# outro chord: Am, long
n = int(3.0 * SR); tt = np.arange(n) / SR
fin = sum(np.sin(2 * np.pi * note(m) * tt) + 0.3 * np.sin(4 * np.pi * note(m) * tt) for m in (45, 57, 60, 64, 69))
add(sfx, 18.2, fin * np.exp(-tt * 1.1) * env(n, 0.01, 0.3) / 5, 0.5)
add(sfx, 18.2, kick(), 0.8)

# ---- mix: sfx sits under music, fade tail, soft-limit
mix = music * 0.9 + sfx * 0.75
fade = np.clip((DUR - t_all) / 0.6, 0, 1)[:, None]
fadein = np.clip(t_all / 0.05, 0, 1)[:, None]
mix = mix * fade * fadein
mix = np.tanh(mix / np.max(np.abs(mix)) * 1.4) * 0.89
pcm = (mix * 32767).astype(np.int16)
with wave.open("audio.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
print("audio.wav written", pcm.shape)
