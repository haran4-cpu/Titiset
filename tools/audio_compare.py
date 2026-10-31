#!/usr/bin/env python3
"""Two renderings of the same music, compared the way an ear would: A = what the real engine played in a browser, B = the same engine offline.
The engine's white noise comes from one shared generator whose position depends on how many blocks were rendered before, so hi-hats and snare noise are never the same
sample for sample. What must agree is what is not random:
  * the low band (20-250 Hz: kick, sub, bass) waveform for waveform: correlation, gain, null depth
  * the loudness of every third-octave band, long-term: the spectrum
  * the time envelope of every third-octave band: the hats hit when they should, the sweeps sweep when they should
  * the stereo image: the side/mid energy ratio
Usage: audio_compare.py A.wav B.wav   (same length, aligned)  ->  one JSON object on stdout
"""
import sys, json
import numpy as np
from scipy.io import wavfile
from scipy import signal


def load(p):
    sr, x = wavfile.read(p)
    if x.dtype.kind == 'i':
        x = x.astype(np.float64) / np.iinfo(x.dtype).max
    else:
        x = x.astype(np.float64)
    if x.ndim == 1:
        x = np.stack([x, x], 1)
    return sr, x


def band_wave(a, b, sr, lo, hi):
    sos = signal.butter(4, [lo, hi], btype='band', fs=sr, output='sos')
    x, y = signal.sosfiltfilt(sos, a), signal.sosfiltfilt(sos, b)
    c = float(np.corrcoef(x, y)[0, 1]); g = float((x @ y) / (y @ y + 1e-30))
    null = float(10 * np.log10(np.sum((x - g * y) ** 2) / (np.sum(x ** 2) + 1e-30) + 1e-30))
    rms = lambda v: float(20 * np.log10(np.sqrt(np.mean(v ** 2)) + 1e-12))
    return {'corr': round(c, 4), 'gainDb': round(20 * np.log10(abs(g) + 1e-12), 2), 'nullDb': round(null, 1), 'levelDiffDb': round(rms(x) - rms(y), 2)}


def third_octaves(lo=100.0, hi=14000.0):
    c = []
    f = lo
    while f <= hi:
        c.append(f)
        f *= 2 ** (1 / 3)
    return c


def main():
    sr, A = load(sys.argv[1])
    sr2, B = load(sys.argv[2])
    assert sr == sr2
    n = min(len(A), len(B))
    A, B = A[:n], B[:n]
    ma, mb = A.mean(1), B.mean(1)
    out = {'sr': sr, 'seconds': round(n / sr, 2), 'sub': band_wave(ma, mb, sr, 20, 80), 'bass': band_wave(ma, mb, sr, 80, 250)}
    # third-octave bands, long-term level and time envelope (frames of 2048 samples, hop 1024)
    f, t, Za = signal.stft(ma, fs=sr, nperseg=2048, noverlap=1024, window='hann')
    _, _, Zb = signal.stft(mb, fs=sr, nperseg=2048, noverlap=1024, window='hann')
    Pa, Pb = np.abs(Za) ** 2, np.abs(Zb) ** 2
    diffs, corrs, rows = [], [], []
    for fc in third_octaves():
        lo, hi = fc / 2 ** (1 / 6), fc * 2 ** (1 / 6)
        k = (f >= lo) & (f < hi)
        if k.sum() < 2:
            continue
        ea, eb = Pa[k].sum(0), Pb[k].sum(0)
        d = 10 * np.log10((ea.mean() + 1e-20) / (eb.mean() + 1e-20))
        la, lb = 10 * np.log10(ea + 1e-14), 10 * np.log10(eb + 1e-14)
        c = float(np.corrcoef(la, lb)[0, 1]) if la.std() > 0.5 and lb.std() > 0.5 else float('nan')
        rows.append({'hz': round(fc), 'diffDb': round(float(d), 2), 'envCorr': None if np.isnan(c) else round(c, 3)})
        diffs.append(abs(d))
        if not np.isnan(c):
            corrs.append(c)
    out['bands'] = rows
    out['specMaxDiffDb'] = round(float(max(diffs)), 2)
    out['specMeanDiffDb'] = round(float(np.mean(diffs)), 2)
    out['envCorrMin'] = round(float(min(corrs)), 3) if corrs else None
    out['envCorrMean'] = round(float(np.mean(corrs)), 3) if corrs else None
    # stereo image
    sd = lambda X: float(10 * np.log10(np.sum(((X[:, 0] - X[:, 1]) / 2) ** 2) / (np.sum(((X[:, 0] + X[:, 1]) / 2) ** 2) + 1e-20) + 1e-20))
    out['sideMidDb'] = {'a': round(sd(A), 1), 'b': round(sd(B), 1), 'diff': round(sd(A) - sd(B), 1)}
    print(json.dumps(out))


main()
