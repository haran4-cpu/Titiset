/* ===================== WAVETABLES =====================
   The modern-synth oscillator: a table of FRAMES (single cycles) that the voice morphs through (position 0…1, moved by an
   envelope and a tempo-locked LFO). Every frame is built from harmonic spectra (integer partials only: every table is in
   tune, chords stay chords) and stored band-limited per octave (mip levels), so a high note never aliases and a low note
   keeps all its harmonics. Built once, on first use (a few tens of ms per table off the audio clock: the Stable engine
   builds them in its worker; warm-up builds them before anything plays).
   Tables: 0 analog (sine → saw) · 1 pulse (square → thin pulse) · 2 vocal (formant vowels a e i o u) · 3 sync (hard-sync
   sweep) · 4 fm (2-op FM, index rising, integer ratio) · 5 organ (drawbar mixes → bell partials) · 6 growl (moving formant
   with phase twists — neuro / bass house) · 7 glass (odd partials, hollow → bright). */
const WT_N = 2048, WT_F = 8, WT_L = 8, WT_NAMES = ['analog', 'pulse', 'vocal', 'sync', 'fm', 'organ', 'growl', 'glass'];
const WT = new Array(WT_NAMES.length).fill(null);
function wtFft(re, im, inv) { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) { const a = (inv ? 2 : -2) * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } } } }
// harmonic spectrum of frame u (0…1) of table t: amplitude and phase of harmonic h (1-based)
function wtBessel(n, x) { let s = 0, f = 1; for (let k = 0; k < 20; k++) { if (k > 0) f *= k; let g = 1; for (let j = 1; j <= k + n; j++) g *= j; s += (k % 2 ? -1 : 1) * Math.pow(x / 2, 2 * k + n) / (f * g); } return s; }
const WT_VOW = [[800, 1150, 2900], [400, 1600, 2700], [300, 2200, 3000], [450, 800, 2830], [325, 700, 2530]];
function wtSpec(t, u, h) {
  switch (t) {
    case 0: { const lim = 1 + Math.pow(2, u * 10); const w = h <= lim ? 1 : Math.exp(-(h - lim) / (1 + lim * 0.15)); return [w / h, 0]; } // sine → saw: the harmonics come in from the bottom
    case 1: { const pw = 0.5 - 0.42 * u; return [Math.abs(Math.sin(Math.PI * h * pw)) / h * 1.4, Math.sin(Math.PI * h * pw) < 0 ? Math.PI : 0]; }
    case 2: { const x = u * 4, i = Math.min(3, Math.floor(x)), fr = x - i, F = WT_VOW[i].map((f, k) => f + (WT_VOW[i + 1][k] - f) * fr), f = h * 110; // vowels at a 110 Hz voice
      let a = 0; for (let k = 0; k < 3; k++) { const bw = 80 + 40 * k, d = (f - F[k]) / bw; a += [1, 0.6, 0.3][k] / (1 + d * d); } return [a * Math.pow(h, -0.4) * 0.6 + 0.9 / h, 0]; } // the formants over a saw-like body: the fundamental always leads (the pitch is never ambiguous)
    case 3: { const r = 1 + u * 5; let re = 0, im = 0; // hard sync: a saw at ratio r reset every cycle — closed-form harmonic coefficients
      const c = 2 * Math.PI * r; const k = h * 2 * Math.PI; const den = (c * c - k * k) || 1e-9; re = -(c * Math.sin(c)) / den; im = (c * (1 - Math.cos(c))) / den; const a = Math.hypot(re, im) / Math.max(1, r * 0.35); return [a / Math.sqrt(h), Math.atan2(im, re)]; }
    case 4: { const ratio = 2, idx = 0.2 + u * 4.5; let a = 0; for (let n = -12; n <= 12; n++) { if (1 + n * ratio === h || -(1 + n * ratio) === h) a += (1 + n * ratio > 0 ? 1 : -1) * wtBessel(Math.abs(n), idx) * (n < 0 && n % 2 ? -1 : 1); } return [Math.abs(a), a < 0 ? Math.PI : 0]; }
    case 5: { const D = [[1, 0.8, 0, 0.5, 0, 0.3, 0, 0.2], [1, 0.5, 0.8, 0.6, 0.2, 0.5, 0, 0.4], [0.6, 0.3, 0.2, 1, 0, 0.6, 0, 0.8], [0.5, 0, 0, 0.7, 0, 0, 0, 0.6]]; const x = u * 3, i = Math.min(2, Math.floor(x)), fr = x - i;
      const row = (r) => (h <= 8 ? r[h - 1] : (h === 12 || h === 16 ? r[7] * 0.4 : 0)); const bell = u > 0.7 && (h === 3 || h === 5 || h === 7 || h === 9) ? (u - 0.7) * 1.6 / h : 0; return [(row(D[i]) * (1 - fr) + row(D[i + 1]) * fr) / Math.sqrt(h) + bell, 0]; }
    case 6: { const fc = 4 + u * 26, bw = 2 + u * 3, d = (h - fc) / bw; const a = (1 / h + 1.6 / (1 + d * d) / Math.sqrt(h)); return [a, (h * h * 0.37 * (1 + u)) % (2 * Math.PI)]; }
    case 7: { if (!(h & 1)) return [0, 0]; const lim = 3 + u * 40; return [(h <= lim ? 1 : Math.exp(-(h - lim) / 6)) / Math.pow(h, 0.75), 0]; }
  }
  return [h === 1 ? 1 : 0, 0];
}
// table t → Float32Array[WT_L][WT_F*WT_N]; level k keeps harmonics ≤ (WT_N/2) >> k; every frame normalised to the same RMS
function wtBuild(t) { const lv = []; const re = new Float64Array(WT_N), im = new Float64Array(WT_N); const spec = [];
  for (let f = 0; f < WT_F; f++) { const u = f / (WT_F - 1), row = []; for (let h = 1; h < WT_N / 2; h++) row.push(wtSpec(t, u, h)); spec.push(row); }
  for (let k = 0; k < WT_L; k++) { const out = new Float32Array(WT_F * WT_N), hmax = (WT_N / 2) >> k;
    for (let f = 0; f < WT_F; f++) { re.fill(0); im.fill(0); let pw = 0;
      for (let h = 1; h < Math.min(hmax, WT_N / 2); h++) { const [a, ph] = spec[f][h - 1]; if (!a) continue; re[h] = a * Math.cos(ph - Math.PI / 2); im[h] = a * Math.sin(ph - Math.PI / 2); re[WT_N - h] = re[h]; im[WT_N - h] = -im[h]; pw += a * a; }
      wtFft(re, im, true); let ms = 0; for (let i = 0; i < WT_N; i++) ms += re[i] * re[i]; const g = pw > 0 && ms > 0 ? 0.5 / Math.sqrt(ms / WT_N) : 0; // the same RMS for every frame: a morph is a timbre change, never a level change
      for (let i = 0; i < WT_N; i++) out[f * WT_N + i] = re[i] * g; }
    lv.push(out); }
  return lv; }
function wtGet(t) { t = t | 0; if (t < 0 || t >= WT.length) t = 0; if (!WT[t]) WT[t] = wtBuild(t); return WT[t]; }
// mip level for a fundamental f (Hz): the richest level whose top harmonic stays under 0.45·sr
function wtLevel(f, sr) { const allowed = 0.45 * sr / Math.max(1, f); let k = 0; while (k < WT_L - 1 && ((WT_N / 2) >> k) > allowed) k++; return k; }
