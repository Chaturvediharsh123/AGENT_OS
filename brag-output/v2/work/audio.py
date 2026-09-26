"""60s soundtrack for the AgentOS v2 video: 112 BPM, A minor, SFX in key. Writes audio.wav."""
import wave
import numpy as np

SR, DUR = 44100, 60.0
N = int(SR * DUR)
rng = np.random.default_rng(11)
music = np.zeros((N, 2)); sfx = np.zeros((N, 2))
BEAT = 60 / 112
DROP = 6.0
GRID0 = DROP - 12 * BEAT
note = lambda m: 440 * 2 ** ((m - 69) / 12)


def lp(x, a):
    y = np.empty_like(x); acc = 0.0
    for i, v in enumerate(x):
        acc += a * (v - acc); y[i] = acc
    return y


def add(buf, start, sig, gain=1.0, pan=0.0):
    i = int(round(start * SR))
    if i < 0:
        sig = sig[-i:]; i = 0
    if i >= N or not len(sig): return
    sig = sig[: N - i]
    buf[i:i + len(sig), 0] += sig * gain * np.sqrt(.5 * (1 - pan))
    buf[i:i + len(sig), 1] += sig * gain * np.sqrt(.5 * (1 + pan))


def env(n, a, r):
    e = np.ones(n); na, nr = int(a * SR), int(r * SR)
    if na: e[:na] = np.linspace(0, 1, na)
    if nr: e[-nr:] *= np.linspace(1, 0, nr)
    return e


def tone(f, dur, decay, harm=(1, .3)):
    n = int(dur * SR); tt = np.arange(n) / SR
    x = sum(a * np.sin(2 * np.pi * f * (k + 1) * tt) for k, a in enumerate(harm))
    return x * np.exp(-tt * decay) * env(n, .004, .03)


def swell(dur, peak=.8, cut=.06):
    n = int(dur * SR); x = lp(rng.standard_normal(n), cut)
    e = np.minimum(np.arange(n) / (n * peak), 1) ** 2
    e[int(n * peak):] = np.linspace(1, 0, n - int(n * peak))
    return x * e


def kick():
    n = int(.45 * SR); tt = np.arange(n) / SR
    f = 48 + 95 * np.exp(-tt * 32)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 7)


def hat(d=.07):
    n = int(d * SR); x = rng.standard_normal(n); x = x - lp(x, .45)
    return x * np.exp(-np.arange(n) / SR * 55)


def clap():
    n = int(.25 * SR); x = lp(rng.standard_normal(n), .35); x = x - lp(x, .08)
    tt = np.arange(n) / SR
    e = np.exp(-tt * 22) + .5 * np.exp(-np.maximum(tt - .012, 0) * 22) * (tt > .012)
    return x * e


def in_(t, *spans):
    return any(a <= t < b for a, b in spans)


CHORDS = [[57, 60, 64, 69], [53, 57, 60, 65], [48, 55, 60, 64], [55, 59, 62, 67]]
ROOTS = [45, 41, 48, 43]
BAR = 4 * BEAT

# ---- pad + bass + arp, bar by bar
k, start = 0, GRID0
while start < DUR:
    ci = k % 4; L = BAR + .35; n = int(L * SR); tt = np.arange(n) / SR
    pad = np.zeros(n)
    for m in CHORDS[ci]:
        for d in (-.07, .07):
            pad += 2 * ((tt * note(m) * 2 ** (d / 12)) % 1) - 1
    bright = .02 if start < DROP - .01 or in_(start, (30, 36)) else .045
    pad = lp(pad / 8, bright) * env(n, .45, .5)
    full = in_(start + .01, (DROP, 30), (36, 50.9))
    pg = .5 if full else 1.05
    add(music, start, pad, pg, -.25); add(music, start + .012, pad, pg, .25)
    if full:
        b = np.sin(2 * np.pi * note(ROOTS[ci] - 12) * tt) + .25 * np.sin(4 * np.pi * note(ROOTS[ci] - 12) * tt)
        add(music, start, b * env(n, .02, .3), .42)
    # 8th-note arpeggio from the app section on (also through the breakdown)
    if in_(start + .01, (15.0 - BAR, 50.9)):
        seq = [CHORDS[ci][j % 4] + 12 * (j // 4 % 2) for j in (0, 1, 2, 3, 4, 3, 2, 1)]
        for j, m in enumerate(seq):
            at = start + j * BEAT / 2
            if at < 15.0 or at >= 50.9: continue
            g = .15 if in_(at, (30, 36)) else .1
            add(music, at, tone(note(m + 12), .34, 9, (1, .45, .15)), g, .35 if j % 2 else -.35)
    k += 1; start += BAR

# ---- drums
b = 0
while GRID0 + b * BEAT < DUR:
    bt = GRID0 + b * BEAT
    if in_(bt + .005, (DROP, 30), (36, 50.9)):
        add(music, bt, kick(), .85)
        if bt >= 10.4:
            add(music, bt + BEAT / 2, hat(), .12, .3)
            add(music, bt + BEAT / 4, hat(.04), .04, -.3)
            add(music, bt + 3 * BEAT / 4, hat(.04), .04, -.3)
        if bt >= 15.0 and b % 2 == 1:
            add(music, bt, clap(), .22, .1)
    b += 1

# ---- SFX
for i, tm in enumerate((.25, .8, 1.35)):                       # hook lines
    add(sfx, tm, tone(note([69, 72, 76][i]), .6, 6, (1, .35, .1)), .22, -.2 + .2 * i)
add(sfx, 2.55, swell(.55, .5, .09), .25)                        # strike-through
for i in range(4):                                               # "Stop asking one AI."
    add(sfx, 3.35 + i * .17, tone(note([57, 60, 64, 69][i]), .35, 12, (1, .5, .2)), .28, -.3 + .2 * i)
add(sfx, DROP - .85, swell(.87, .97, .12), .38)                  # riser
add(sfx, DROP, tone(note(33), 1.6, 2.6, (1, .5, .2)), .5)        # boom
for i in range(4):                                               # avatars arrive
    add(sfx, 6.35 + i * .14, tone(note([81, 84, 88, 93][i]), .5, 8), .12, -.45 + .3 * i)
for tm in (10.3, 14.9, 29.9, 38.9, 41.9, 46.4, 50.8):           # scene whooshes
    add(sfx, tm - .3, swell(.55, .6, .05), .22, .15)
for i in range(6):                                               # agent cards
    add(sfx, 10.9 + i * .16, tone(note([76, 79, 81, 84, 86, 88][i]), .15, 30), .07, -.3 + .12 * i)
t = 16.8
while t < 19.3:                                                  # typing
    add(sfx, t, tone(note(84 + 2 * int(rng.integers(0, 3))), .03, 90, (1,)), .045, float(rng.uniform(-.3, .3)))
    t += .07 + float(rng.uniform(0, .035))
for tm in (20.35, 21.5, 40.2):                                    # clicks
    add(sfx, tm, tone(note(57), .1, 50, (1, .6, .3)), .3); add(sfx, tm + .02, tone(note(81), .25, 14), .14)
for tm in (21.6, 40.35):                                          # toasts
    add(sfx, tm, tone(note(81), .8, 5, (1, .2)), .14, -.15); add(sfx, tm + .07, tone(note(88), .8, 5, (1, .2)), .11, .15)
for i in range(4):                                                # pipeline completions
    add(sfx, 23.3 + (i + 1) * 1.4, tone(note([81, 84, 86, 88][i]), .6, 7, (1, .25, .1)), .18, -.3 + .2 * i)
add(sfx, 35.1, swell(.9, .95, .1), .3)                            # back from breakdown
add(sfx, 42.45, tone(note(45), .18, 30, (1, .4)), .3)             # Ctrl+K thock
add(sfx, 42.55, swell(.35, .3, .07), .15)
for i in range(6):                                                # palette typing
    add(sfx, 43.0 + i * .12, tone(note(88), .03, 90, (1,)), .05)
add(sfx, 43.85, tone(note(93), .5, 8), .1)
for i in range(4):                                                # montage hits
    tm = 51.45 + i * .536
    add(sfx, tm, kick(), .7); add(sfx, tm, tone(note([69, 72, 76, 81][i]), .7, 5, (1, .4, .15)), .2)
n = int(5.4 * SR); tt = np.arange(n) / SR                         # outro chord
fin = sum(np.sin(2 * np.pi * note(m) * tt) + .3 * np.sin(4 * np.pi * note(m) * tt) for m in (45, 57, 60, 64, 69, 76))
add(sfx, 54.6, fin * np.exp(-tt * .55) * env(n, .01, .5) / 6, .55)
add(sfx, 54.6, kick(), .8); add(sfx, 54.6, swell(.4, .02, .08), .2)

# ---- mix
mix = music * .9 + sfx * .75
t_all = np.arange(N) / SR
mix *= (np.clip((DUR - t_all) / .9, 0, 1) * np.clip(t_all / .04, 0, 1))[:, None]
mix = np.tanh(mix / np.max(np.abs(mix)) * 1.4) * .89
with wave.open("audio.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype(np.int16).tobytes())
for s in range(0, 60, 3):
    seg_ = mix[s * SR:(s + 3) * SR]
    print(f"{s:2d}s rms {np.sqrt((seg_ ** 2).mean()):.3f} peak {np.abs(seg_).max():.3f}")
