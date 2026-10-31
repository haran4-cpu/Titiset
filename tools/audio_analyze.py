#!/usr/bin/env python3
"""Independent audio checks on a rendered or captured WAV (float32 or 16-bit PCM, stereo).

Used by tools/wav_audit.cjs and tools/capture_test.cjs. Needs numpy + scipy (matplotlib only for --png).
Everything here is written without the engine's own code, so it can disagree with the engine's own meters.

  audio_analyze.py <file.wav> [--bpm N] [--scale 0,2,3,5,7,8,10] [--key 7] [--png out.png] [--seconds S]

Prints one JSON object:
  peak, nan, clipped      samples at full scale (>= 0.9999) in either channel, NaN/Inf count
  dc                      mean of each channel (a DC offset eats headroom and thumps on every start and stop)
  silenceMs               longest run of digital silence (|x| < 1e-4 on both channels)
  stutterMs               longest run of one frame held below the limiter ceiling (a driver that under-runs may hold the last sample)
  flatTopMs               longest run of one frame held AT the ceiling (a peak cut flat by the master limiter: information, not a fault)
  replayMs                longest run that equals the sound one buffer earlier (64..4096 samples: an under-run may play the last buffer again)
  tempo                   {est, ratio, strength}: BPM from the onset envelope's autocorrelation; `ratio` = est / expected
  key                     {inKey, other, margin, rank, rootRank}: share of the sustained sound's energy on the claimed scale vs the other 11 transpositions (INFORMATION only:
                          overtones put a major third into every minor-key bass, so this cannot prove a key)
  notes                   {corr, best}: the audio's pitch classes against the score's own notes (with their overtones); best must be 0 = 'not transposed'
  bands                   dB of sub / bass / low-mid / presence / air / top, relative to the whole 20 Hz - 20 kHz energy
"""
import sys, json, argparse
import numpy as np
from scipy.io import wavfile
from scipy import signal


def load(path):
    sr, x = wavfile.read(path)
    if x.dtype == np.int16: x = x.astype(np.float32) / 32768.0
    elif x.dtype == np.int32: x = x.astype(np.float32) / 2147483648.0
    else: x = x.astype(np.float32)
    if x.ndim == 1: x = np.stack([x, x], 1)
    return sr, x[:, :2]


def longest_run(mask):
    """length (in samples) of the longest run of True"""
    if not mask.any(): return 0
    d = np.diff(np.concatenate(([0], mask.view(np.int8), [0])))
    s, e = np.where(d == 1)[0], np.where(d == -1)[0]
    return int((e - s).max())


def replays(x):
    """longest run (samples) in which the stereo signal equals itself one buffer earlier, for the usual buffer sizes: an audio driver that under-runs plays the last buffer again.
    Exact equality over dozens of samples never happens in synthesized music with any content (digital silence is excluded)."""
    best = 0
    pk = float(np.abs(x).max())
    for L in (64, 128, 256, 512, 1024, 2048, 4096):
        if len(x) <= L * 2: continue
        # two flat-topped peaks at the limiter ceiling are 'equal' one buffer apart by design: samples at the ceiling do not count
        eq = np.all(x[L:] == x[:-L], axis=1) & (np.abs(x[L:]).max(axis=1) > 1e-4) & (np.abs(x[L:]).max(axis=1) < 0.98 * pk)
        best = max(best, longest_run(eq))
    return best


def stutter(x, min_len=16):
    """longest run of identical consecutive stereo frames, ignoring silence and the limiter's ceiling (a peak cut flat at the ceiling is a held value by design: it is
    reported separately as flatTopMs). A driver's under-run holds the last sample wherever it happens to be."""
    pk = float(np.abs(x).max())
    nonsil = np.abs(x[1:]).max(axis=1) > 1e-4
    same = np.all(x[1:] == x[:-1], axis=1) & nonsil
    atceil = np.abs(x[1:]).max(axis=1) >= 0.98 * pk
    return longest_run(same & ~atceil), longest_run(same & atceil)


def tempo(mono, sr, bpm):
    """Is the audio periodic at the SCORE's tempo? The onset envelope's autocorrelation is read at k * beat for k = 1..16 and that comb is swept over 0.9x ... 1.1x of the
    expected tempo: when the audio really runs at the stated tempo the comb peaks at 1.00x (any octave error cancels, because the multiples of the beat are all in the comb).
    A beatless piece (ambient pads) has a flat comb and is reported as `pulse: false`, not graded."""
    n, hop = 1024, 256
    f, t, S = signal.stft(mono, sr, nperseg=n, noverlap=n - hop, boundary=None)
    M = np.log1p(np.abs(S[(f > 40) & (f < 8000)]) * 20)
    flux = np.maximum(0, np.diff(M, axis=1)).sum(0)
    flux = flux - flux.mean()
    ac = signal.correlate(flux, flux, mode='full')[len(flux) - 1:]
    ac /= ac[0] + 1e-12
    fps = sr / hop
    lags = np.arange(len(ac))
    scales = np.linspace(0.9, 1.1, 161)
    ks = np.arange(1, 17)
    comb = np.zeros(len(scales))
    if bpm:
        for i, sc in enumerate(scales):
            p = fps * 60 / (bpm * sc)
            q = ks * p
            q = q[q < len(ac) - 1]
            comb[i] = np.interp(q, lags, ac).mean() if len(q) else 0
    best = int(np.argmax(comb))
    prom = float(comb[best] - np.median(comb))
    out = {'bestScale': round(float(scales[best]), 4), 'prominence': round(prom, 3), 'comb': round(float(comb[best]), 3), 'pulse': bool(prom > 0.05)}
    # the autocorrelation's own strongest period between 60 and 220 BPM, for the log
    lo, hi = int(fps * 60 / 220), int(fps * 60 / 60)
    k = int(np.argmax(ac[lo:hi])) + lo
    out['est'] = round(float(60 * fps / k), 2)
    return out


def chroma(mono, sr):
    """12-bin pitch-class energy of the SUSTAINED sound. A spectrogram median-filtered along time keeps notes and drops drum hits (a kick has no key); then every spectral PEAK
    is placed at its interpolated frequency, so a bass note at 49 Hz does not smear over its neighbours the way a plain bin-to-semitone map does (a semitone is 3 Hz wide down there)."""
    from scipy.ndimage import median_filter
    n, hop = 16384, 8192
    f, t, S = signal.stft(mono, sr, nperseg=n, noverlap=n - hop, boundary=None)
    mag = np.abs(S)
    H = median_filter(mag, size=(1, 5), mode='nearest')
    df = sr / n
    c = np.zeros(12)
    lo, hi = int(55 / df), int(2500 / df)
    X = H[lo - 1: hi + 2]                          # one bin of margin each side
    a_, b_, c_ = X[:-2], X[1:-1], X[2:]
    peak = (b_ > a_) & (b_ >= c_) & (b_ > 1e-3 * X.max())
    la, lb, lc = np.log(a_ + 1e-12), np.log(b_ + 1e-12), np.log(c_ + 1e-12)
    den = la - 2 * lb + lc
    delta = np.where(np.abs(den) > 1e-9, 0.5 * (la - lc) / den, 0.0).clip(-0.5, 0.5)
    ks, ts = np.nonzero(peak)
    freq = (ks + lo + delta[ks, ts]) * df
    energy = (b_[ks, ts] ** 2)
    midi = 69 + 12 * np.log2(freq / 440.0)
    pc = np.mod(np.round(midi).astype(int), 12)
    np.add.at(c, pc, energy)
    return c / (c.sum() + 1e-12)


def keycheck(c, scale, key):
    sets = [sorted(((k + s) % 12) for s in scale) for k in range(12)]
    ratios = np.array([c[s].sum() for s in sets])
    claimed = float(ratios[key % 12])
    others = np.delete(ratios, key % 12)
    rank = int(1 + np.sum(ratios > claimed + 1e-9))   # tied sets (a mode and its relative) share a rank
    root = int(1 + np.sum(c > c[key % 12] + 1e-12))     # 1 = the root is the strongest pitch class
    return {'inKey': round(claimed, 3), 'other': round(float(others.mean()), 3), 'margin': round(claimed - float(others.mean()), 3), 'rank': rank, 'rootRank': root,
            'bestOther': round(float(others.max()), 3), 'chroma': [round(float(v), 3) for v in c]}


def notescheck(c, expected):
    """Is the pitch that was written the pitch that is heard? Pearson correlation of the audio's pitch-class energy with the score's (given as 12 numbers), for all 12 transpositions of the
    score's: the right answer is 'no transposition'. A wrong tuning, a transposition bug or a wrong octave table would put the best match elsewhere."""
    e = np.array(expected, dtype=float)
    cor = [float(np.corrcoef(c, np.roll(e, k))[0, 1]) for k in range(12)]
    best = int(np.argmax(cor))
    return {'corr': round(cor[0], 3), 'best': best, 'bestCorr': round(cor[best], 3), 'second': round(float(sorted(cor)[-2]), 3) if best == 0 else round(cor[0], 3)}


def bands(mono, sr):
    n = 8192
    f, P = signal.welch(mono, sr, nperseg=n, noverlap=n // 2)
    tot = P[(f >= 20) & (f <= 20000)].sum() + 1e-18
    out = {}
    for name, (a, b) in {'sub': (20, 60), 'bass': (60, 250), 'lowmid': (250, 2000), 'presence': (2000, 6000), 'air': (6000, 12000), 'top': (16000, 20000)}.items():
        out[name] = round(float(10 * np.log10(P[(f >= a) & (f < b)].sum() / tot + 1e-18)), 1)
    return out


def png(path, mono, sr, seconds=10):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    seg = mono[: int(sr * seconds)]
    f, t, S = signal.spectrogram(seg, sr, nperseg=2048, noverlap=1536, scaling='spectrum')
    db = 10 * np.log10(S + 1e-14)
    fig, ax = plt.subplots(figsize=(11, 4.2), dpi=100)
    ax.pcolormesh(t, f, db, vmin=db.max() - 90, vmax=db.max(), shading='auto', cmap='magma')
    ax.set_yscale('symlog', linthresh=200); ax.set_ylim(30, sr / 2)
    ax.set_yticks([50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]); ax.set_yticklabels(['50', '100', '200', '500', '1k', '2k', '5k', '10k', '20k'])
    ax.set_xlabel('s'); ax.set_ylabel('Hz'); fig.tight_layout(); fig.savefig(path); plt.close(fig)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('wav'); ap.add_argument('--bpm', type=float, default=0); ap.add_argument('--scale', default=''); ap.add_argument('--key', type=int, default=0)
    ap.add_argument('--expected', default='', help='12 comma-separated pitch-class weights of the written notes'); ap.add_argument('--png', default=''); ap.add_argument('--seconds', type=float, default=0, help='analyse only the first S seconds'); ap.add_argument('--skip', type=float, default=0, help='skip the first S seconds (a captured stream starts with the engine warm-up)')
    a = ap.parse_args()
    sr, x = load(a.wav)
    if a.skip: x = x[int(a.skip * sr):]
    if a.seconds: x = x[: int(a.seconds * sr)]
    mono = x.mean(axis=1)
    r = {'sr': sr, 'seconds': round(len(x) / sr, 2)}
    bad = ~np.isfinite(x)
    r['nan'] = int(bad.sum())
    x = np.nan_to_num(x)
    r['peak'] = round(float(np.abs(x).max()), 4)
    r['clipped'] = int((np.abs(x) >= 0.9999).sum())
    r['dc'] = [round(float(x[:, 0].mean()), 5), round(float(x[:, 1].mean()), 5)]
    r['silenceMs'] = round(1000 * longest_run(np.all(np.abs(x) < 1e-4, axis=1)) / sr, 1)
    st, ft = stutter(x)
    r['stutterMs'] = round(1000 * st / sr, 2)
    r['flatTopMs'] = round(1000 * ft / sr, 2)
    r['replayMs'] = round(1000 * replays(x) / sr, 2)
    r['tempo'] = tempo(mono, sr, a.bpm)
    if a.scale or a.expected:
        ch = chroma(mono, sr)
        if a.scale: r['key'] = keycheck(ch, [int(v) for v in a.scale.split(',')], a.key)
        if a.expected: r['notes'] = notescheck(ch, [float(v) for v in a.expected.split(',')])
    r['bands'] = bands(mono, sr)
    if a.png: png(a.png, mono, sr)
    print(json.dumps(r))


if __name__ == '__main__':
    main()
