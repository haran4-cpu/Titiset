/* ===================== MANGLE — sound-design inserts that know the beat and the key (v9.5) =====================
   Two slots (A and B) on the whole deck or on one part, each one of eight engines, a Macro that sweeps each engine along a
   designed path, and a Morph that crossfades A into B. Every engine is locked to the deck's beat (the audio clock, never a
   timer) and reads the chord the score is playing (the resonator's pitch-class mask), so what it adds stays in time and in key.
   SLICE     the last bar cut into 1/32 … 1/4 slices and re-played on the grid in a new order: reversed, half-speed, doubled,
             stuttered, tape-stopped, pitched by consonant intervals, gated. Chaos = how much is changed; Hold keeps one bar,
             off follows the music (each bar is cut from the one before it).
   GRAIN     a cloud of up to 24 grains read from the last second (or a frozen second), pitched to unison, octaves, the chord
             tones or a shimmer stack, some reversed; spawned on a grid of the beat.
   SPECTRAL  a 1024-point short-time Fourier transform (hop 256): FREEZE holds a spectrum and lets it ring; BLUR smears it in
             time; KEY keeps only what sits on the chord's pitch classes (drums and noise come back as harmony); PARTIALS keeps
             the strongest few peaks (glass, robots). Tilt, a spectral shift of ±12 semitones and Sparkle on top.
   STEPS     a pitched multi-tap echo on the grid: each repeat is an earlier beat division re-played, like a tape at another speed,
             a chord tone higher (or lower, bouncing, wandering) — exactly in tune, shorter as it climbs.
   SPIRAL    an endless shifter: three pitch-shifted copies glide through an octave with Shepard gains (it rises or falls for
             ever), free or locked to 1–8 bars, with feedback.
   RING      ring and frequency modulation by a carrier on the chord's root, fifth or third (or arpeggiating the chord on
             the 16ths), so the sidebands stay related to the harmony.
   VOWEL     three formant filters morphing A–E–I–O–U, by the Macro or a beat-locked LFO, with drive: a talkbox.
   FOLD      a wavefolder into a sample-and-hold whose rate is a harmonic of the chord's root (the aliasing lands on the key).
   A slot fades in and out over 8 ms; an engine that is off costs nothing; the input history (3 s) is written while the unit is
   allocated (on first use, or up front for live engines). */
const MG_MODES = ['slice', 'grain', 'spectral', 'steps', 'spiral', 'ring', 'vowel', 'fold'];
// per engine: [Macro label, a, b, c, [the four choices of `sub`], hold label or '']
const MG_SPEC = {
  slice: ['Chaos', 'Pattern', 'Pitch', 'Gate', ['1/32', '1/16', '1/8', '1/4'], 'Hold'],
  grain: ['Density', 'Spray', 'Size', 'Reverse', ['Unison', 'Octaves', 'Chord', 'Shimmer'], 'Freeze'],
  spectral: ['Amount', 'Tilt', 'Shift', 'Sparkle', ['Freeze', 'Blur', 'Key', 'Partials'], ''],
  steps: ['Repeats', 'Time', 'Tone', 'Spread', ['Up', 'Down', 'Bounce', 'Wander'], ''],
  spiral: ['Depth', 'Speed', 'Feedback', 'Tone', ['Rise', 'Fall', 'Rise · bars', 'Fall · bars'], ''],
  ring: ['Depth', 'FM', 'Octave', 'Tone', ['Root', 'Fifth', 'Third', 'Arp'], ''],
  vowel: ['Vowel', 'LFO', 'Resonance', 'Drive', ['Hand', '1 bar', '1/2', '1/4'], ''],
  fold: ['Drive', 'Fold', 'Crush', 'Tone', ['Free', '× 4', '× 8', '× 16'], ''],
};
const MG_DEF = { mode: 0, macro: 0.5, a: 0.5, b: 0.5, c: 0.5, sub: 1, hold: 1 };
const MG_AGC = [0, 0, 0, 0, 0, 1, 1, 1]; // engines whose level is matched to their input by a slow follower (ring, vowel, fold)
const MG_HN = 1 << 17, MG_HM = MG_HN - 1; // the input history: 2^17 samples (≈ 3 s at 44.1 kHz)
const MG_FN = 1024, MG_FH = 256, MG_FB = 10; // the spectral frame, hop and log2(frame)
const MG_TW = (() => { const c = new Float64Array(MG_FN / 2), s = new Float64Array(MG_FN / 2); for (let i = 0; i < MG_FN / 2; i++) { c[i] = Math.cos(-TAU * i / MG_FN); s[i] = Math.sin(-TAU * i / MG_FN); } return { c, s }; })();
const MG_REV = (() => { const r = new Uint16Array(MG_FN); for (let i = 0; i < MG_FN; i++) { let x = i, y = 0; for (let b = 0; b < MG_FB; b++) { y = (y << 1) | (x & 1); x >>= 1; } r[i] = y; } return r; })();
const MG_WIN = (() => { const w = new Float64Array(MG_FN); for (let i = 0; i < MG_FN; i++) w[i] = 0.5 - 0.5 * Math.cos(TAU * i / MG_FN); return w; })();
// in-place complex FFT of size MG_FN (inv: the inverse, unscaled)
function mgFft(re, im, inv) { const N = MG_FN, R = MG_REV; for (let i = 0; i < N; i++) { const j = R[i]; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  const C = MG_TW.c, S = MG_TW.s, sg = inv ? -1 : 1;
  for (let len = 2; len <= N; len <<= 1) { const h = len >> 1, st = N / len; for (let i = 0; i < N; i += len) for (let k = 0; k < h; k++) { const wr = C[k * st], wi = S[k * st] * sg, a = i + k, b = a + h, xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr; re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi; } } }
function mgHash(a, b) { let h = Math.imul((a | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b | 0) + 0x632be5ab, 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return (h >>> 0) / 4294967296; }
// the chord tones of a pitch-class mask, as semitones over its root (0 first), at most 5
function mgTones(mask, root, out) { let n = 0; for (let k = 0; k < 12 && n < 5; k++) if (mask & (1 << ((root + k) % 12))) out[n++] = k; if (!n) { out[0] = 0; out[1] = 7; n = 2; } return n; }
const MG_VOW = [[800, 1150, 2900, 0, -4, -20], [530, 1840, 2480, 0, -9, -12], [270, 2290, 3010, 0, -12, -14], [450, 800, 2830, 0, -2, -24], [325, 700, 2530, 0, -6, -28]]; // F1 F2 F3 (Hz), their levels (dB): A E I O U
const MG_SLICE = [0.125, 0.25, 0.5, 1], MG_STEPDIV = [0.25, 0.5, 0.75, 1, 1.5], MG_PITCH = [12, -12, 7, -5, 5, -7];
class MangleSlot {
  constructor(sr) { this.sr = sr; this.on = 0; this.g = 0; Object.assign(this, MG_DEF); this.pend = -1; this.pendSub = -1; this.oL = new Float32Array(128); this.oR = new Float32Array(128);
    // slice
    this.lpL = null; this.lpR = null; this.lpN = 0; this.lpBar = -1e9; this.lpSeed = 0; this.slS = -1; this.slSrc = 0; this.slOp = 0; this.slRat = 1; this.slOn = 1; this.slIn = 1; this.slOut = 1;
    // grain
    this.gn = 24; this.gPos = new Float64Array(24); this.gInc = new Float64Array(24); this.gLen = new Float64Array(24); this.gT = new Float64Array(24); this.gPan = new Float64Array(24); this.gOn = new Uint8Array(24); this.gA = new Float64Array(24); this.gzL = new Float64Array(24); this.gzR = new Float64Array(24); this.gNext = 0; this.gk = 0; this.fzL = null; this.fzR = null; this.fzOn = 0; this.fzN = 0;
    // spectral (per channel: the input ring, the output accumulator, the frame arrays, the held / smoothed magnitudes, phases)
    this.spIn = null; this.spOut = null; this.spRe = null; this.spIm = null; this.spMag = null; this.spHold = null; this.spPh = null; this.spW = null; this.spHop = 0; this.spPos = 0; this.spHeld = 0; this.spMask = -1; this.spComp = new Float64Array(2); this.spFresh = 1; this.fzI = 0; this.fzO = 0; this.fzG = 1; this.spOutM = null; this.spOutP = null;
    // steps (6 taps per side), spiral (3 voices per side)
    this.ps = null; this.tpLp = new Float64Array(12); this.spFb = new Float64Array(2); this.sph = 0;
    // ring, vowel, fold
    this.rph = 0; this.rf = 110; this.vf = null; this.vk = 0; this.vF = new Float64Array(6); this.vG = new Float64Array(3); this.fH = new Float64Array(2); this.fPh = 0; this.fX = new Float64Array(2); this.toneLp = new Float64Array(2);
    this.agcI = 1e-6; this.agcO = 1e-6; this.agcG = 1; this.pkIn = 0; this.tones = new Int8Array(5); this.nt = 2; shape(this); }
  // a new engine or choice while the slot sounds: it fades to the dry signal (8 ms), changes, and fades back in
  set(p) { if (!p) return; let mode = this.pend >= 0 ? this.pend : this.mode, sub = this.pendSub >= 0 ? this.pendSub : this.sub;
    if (typeof p.mode === 'string') { const i = MG_MODES.indexOf(p.mode); if (i >= 0) mode = i; } else if (typeof p.mode === 'number' && Number.isFinite(p.mode)) mode = clamp(p.mode | 0, 0, 7);
    if (typeof p.sub === 'number' && Number.isFinite(p.sub)) sub = clamp(p.sub | 0, 0, 3);
    for (const k of ['macro', 'a', 'b', 'c', 'hold']) if (typeof p[k] === 'number' && Number.isFinite(p[k])) this[k] = clamp(p[k], 0, 1);
    if (mode !== this.mode || sub !== this.sub) { if (this.g > 1e-4) { this.pend = mode; this.pendSub = sub; } else { this.mode = mode; this.sub = sub; this.pend = -1; this.pendSub = -1; this.reset(); } }
    if (p.on != null) { const was = this.on; this.on = p.on ? 1 : 0; if (this.on && !was && this.g < 1e-3) this.reset(); } }
  reset() { this.lpBar = -1e9; this.slS = -1; this.gOn.fill(0); this.gNext = -1; this.spHeld = 0; this.spPos = 0; this.spHop = 0; this.spFresh = 1; this.spComp.fill(0); this.fzI = 0; this.fzO = 0; this.fzG = 1; if (this.spOut) { this.spOut[0].fill(0); this.spOut[1].fill(0); this.spIn[0].fill(0); this.spIn[1].fill(0); this.spMag[0].fill(0); this.spMag[1].fill(0); } this.spFb.fill(0); this.fzOn = 0; this.agcG = 1; this.agcI = 1e-6; this.agcO = 1e-6; if (this.ps) for (const p of this.ps) p.b.fill(0); }
}
class Mangler {
  constructor(sr) { this.sr = sr; this.s = [new MangleSlot(sr), new MangleSlot(sr)]; this.morph = 0; this.mS = 0; this.wet = 1; this.target = -1; this.hL = null; this.hR = null; this.hw = 0; this.active = 0; this.bpm = 124; this.mask = 0x91; this.root = 0;
    this.tL = new Float32Array(128); this.tR = new Float32Array(128); this.stepSemis = new Float64Array(6); this.stepRat = new Float64Array(6); this.hAbs = 0; this.slP = new Float64Array(4); this.slQ = new Float64Array(4); shape(this); }
  alloc() { if (this.hL) return; this.hL = new Float32Array(MG_HN); this.hR = new Float32Array(MG_HN); }
  // the long buffers of every engine, made up front (live engines: off the audio path) or on first use
  prealloc() { this.alloc(); for (const S of this.s) for (let m = 0; m < 8; m++) this.need(S, m); }
  need(S, m) { const sr = this.sr;
    if (m === 0 && !S.lpL) { S.lpL = new Float32Array(Math.ceil(sr * 4.2)); S.lpR = new Float32Array(Math.ceil(sr * 4.2)); }
    if (m === 1 && !S.fzL) { S.fzL = new Float32Array(sr); S.fzR = new Float32Array(sr); }
    if (m === 2 && !S.spIn) { const A = () => [new Float64Array(MG_FN), new Float64Array(MG_FN)]; S.spIn = A(); S.spOut = A(); S.spRe = new Float64Array(MG_FN); S.spIm = new Float64Array(MG_FN); S.spMag = A(); S.spHold = A(); S.spPh = A(); S.spW = new Float64Array(MG_FN / 2 + 1); S.spOutM = new Float64Array(MG_FN / 2 + 1); S.spOutP = new Float64Array(MG_FN / 2 + 1); }
    if (m === 4 && !S.ps) S.ps = Array.from({ length: 6 }, () => new PitchShift(sr, 30)); }
  // { slot, on, mode, macro, a, b, c, sub, hold } · { morph } · { wet } · { target }
  set(m) { if (m.slot != null) { const S = this.s[m.slot ? 1 : 0]; S.set(m); if (S.on) { this.alloc(); this.need(S, S.mode); if (S.pend >= 0) this.need(S, S.pend); } }
    if (typeof m.morph === 'number') this.morph = clamp(m.morph, 0, 1); if (typeof m.wet === 'number') this.wet = clamp(m.wet, 0, 1); if (m.target != null) this.target = m.target | 0; this.active = 1; }
  stop() { this.s[0].on = 0; this.s[1].on = 0; }
  // L, R: the signal, processed in place; beat0: the deck's beat at the block's first sample
  block(L, R, n, beat0) { const H = this.hL; if (!H) return; const HR = this.hR, w0 = this.hAbs; for (let i = 0; i < n; i++) { const j = (w0 + i) & MG_HM; H[j] = L[i]; HR[j] = R[i]; } this.hAbs = w0 + n;
    const A = this.s[0], B = this.s[1], aA = A.on || A.g > 1e-4, aB = B.on || B.g > 1e-4; if (!aA && !aB) { this.active = 0; A.g = 0; B.g = 0; this.mS = 0; return; } this.active = 1;
    const sr = this.sr, bInc = this.bpm / 60 / sr, spb = sr * 60 / this.bpm;
    // the morph glides (30 ms) to where it is set while both slots play, to the one that plays when only one does
    this.mS += ((A.on && B.on ? this.morph : B.on ? 1 : A.on ? 0 : this.mS) - this.mS) * Math.min(1, n / (0.03 * sr)); const m = this.mS;
    // half linear, half constant power: two different sounds (uncorrelated) dip 1.4 dB at the middle, two alike rise 1.6 dB
    const gA = 0.5 * (1 - m + Math.cos(m * Math.PI / 2)), gB = 0.5 * (m + Math.sin(m * Math.PI / 2)), TL = this.tL, TR = this.tR; TL.fill(0, 0, n); TR.fill(0, 0, n); const k = 1 / (0.008 * sr);
    for (let q = 0; q < 2; q++) { const S = this.s[q], gm = q ? gB : gA, alive = q ? aB : aA; if (gm < 1e-6) { if (!alive || S.pend >= 0) S.g = 0; if (S.pend >= 0) { S.mode = S.pend; S.sub = S.pendSub; S.pend = -1; S.pendSub = -1; S.reset(); this.need(S, S.mode); } continue; } /* (a slot the morph has faded out changes at once) */
      if (!alive) { S.g = 0; for (let i = 0; i < n; i++) { TL[i] += L[i] * gm; TR[i] += R[i] * gm; } continue; } S.nt = mgTones(this.mask, this.root, S.tones);
      if (S.pend >= 0 && S.g < 1e-4) { S.mode = S.pend; S.sub = S.pendSub; S.pend = -1; S.pendSub = -1; S.reset(); this.need(S, S.mode); }
      this.run(S, L, R, n, beat0, bInc, spb, w0); const oL = S.oL, oR = S.oR, tg = S.on && S.pend < 0 ? 1 : 0; let g = S.g;
      if (MG_AGC[S.mode]) { let ei = 0, eo = 0; for (let i = 0; i < n; i++) { ei += L[i] * L[i] + R[i] * R[i]; eo += oL[i] * oL[i] + oR[i] * oR[i]; } const a = Math.min(1, n / (0.25 * sr)); S.agcI += (ei / n - S.agcI) * a; S.agcO += (eo / n - S.agcO) * a;
        if (S.agcI > 1e-8) S.agcG = clamp(Math.sqrt(S.agcI / (S.agcO + 1e-12)), 0.35, 4); const ag = S.agcG; let pk = 0; for (let i = 0; i < n; i++) { const a = L[i] < 0 ? -L[i] : L[i], b = R[i] < 0 ? -R[i] : R[i]; if (a > pk) pk = a; if (b > pk) pk = b; } S.pkIn = Math.max(pk, S.pkIn * Math.exp(-n / sr));
        const lim = Math.max(1e-4, 1.6 * S.pkIn), il = 1 / lim; for (let i = 0; i < n; i++) { oL[i] = lim * tanh(oL[i] * ag * il); oR[i] = lim * tanh(oR[i] * ag * il); } } /* (and a soft ceiling 4 dB over the input's peak: resonances and folds cannot jump out) */
      for (let i = 0; i < n; i++) { g += clamp(tg - g, -k, k); TL[i] += (L[i] + (oL[i] - L[i]) * g) * gm; TR[i] += (R[i] + (oR[i] - R[i]) * g) * gm; } S.g = g; }
    const w = this.wet; for (let i = 0; i < n; i++) { L[i] += (TL[i] - L[i]) * w; R[i] += (TR[i] - R[i]) * w; } }
  run(S, L, R, n, beat0, bInc, spb, w0) { switch (S.mode) {
    case 0: this.slice(S, L, R, n, beat0, bInc, spb, w0); break; case 1: this.grain(S, L, R, n, beat0, bInc, spb, w0); break; case 2: this.spectral(S, L, R, n, w0); break;
    case 3: this.steps(S, L, R, n, beat0, bInc, spb, w0); break; case 4: this.spiral(S, L, R, n, beat0, bInc); break; case 5: this.ring(S, L, R, n, beat0, bInc, w0); break; case 6: this.vowel(S, L, R, n, beat0, bInc); break; default: this.fold(S, L, R, n); } }
  // ---- SLICE ----
  capture(S, beat, i, spb, w0) { const bar = Math.floor(beat / 4), len = Math.min(S.lpL.length - 1, Math.round(4 * spb)), ago = Math.round((beat - (bar - 1) * 4) * spb), st = w0 + i - ago, H = this.hL, HR = this.hR;
    for (let k = 0; k < len; k++) { const j = (st + k) & MG_HM; S.lpL[k] = H[j]; S.lpR[k] = HR[j]; } S.lpN = len; S.lpBar = bar; }
  // the slice s of a bar, decided by the pattern seed (so a pattern repeats; above Chaos 0.7 it alternates over two bars):
  // its source slice, its op (0 as played · 1 reverse · 2 half speed · 3 double · 4 stutter 1/4 · 5 stutter 1/8 · 6 tape stop),
  // its pitch ratio and whether it sounds. Written into out[0..3].
  sliceAt(S, seed, s, ns, out) { const chaos = S.macro; out[0] = mgHash(seed, s) < chaos * 0.6 ? Math.floor(mgHash(seed + 7, s) * ns) : s; out[1] = mgHash(seed + 13, s) < chaos ? 1 + Math.floor(mgHash(seed + 29, s) * 6) : 0;
    out[2] = mgHash(seed + 41, s) < S.b * 0.8 ? Math.pow(2, MG_PITCH[Math.floor(mgHash(seed + 53, s) * 6)] / 12) : 1; out[3] = mgHash(seed + 67, s) < 0.15 * chaos ? 0 : 1; }
  slice(S, L, R, n, beat0, bInc, spb, w0) { this.need(S, 0); const sb = MG_SLICE[S.sub], ns = Math.round(4 / sb), oL = S.oL, oR = S.oR, fe = 0.0015 * this.sr, fi = 0.0004 * this.sr, P = this.slP, Q = this.slQ;
    for (let i = 0; i < n; i++) { const beat = beat0 + i * bInc, bar = Math.floor(beat / 4);
      if (S.lpBar < -1e8 || (!S.hold && bar !== S.lpBar)) { const fresh = S.lpBar < -1e8; this.capture(S, beat, i, spb, w0); S.slS = fresh ? -1 : -2; } /* (-2: following, the new bar carries on from the last one) */
      const u = (beat - bar * 4) / sb, s = Math.min(ns - 1, Math.floor(u)), slen = S.lpN / ns, t = (u - s) * slen;
      if (s !== S.slS) { const seed = Math.floor(S.a * 15.99) * 977 + (S.macro > 0.7 ? (bar & 1) * 131 : 0), prev = S.slS === -2 ? ns - 1 : S.slS;
        this.sliceAt(S, seed, s, ns, P); S.slSrc = P[0]; S.slOp = P[1]; S.slRat = P[2]; S.slOn = P[3];
        // a slice that simply carries on from the one before (the next source slice, as played) needs no fade between them
        const plain = (x) => x[1] === 0 && x[2] === 1 && x[3] === 1; this.sliceAt(S, seed, (s + ns - 1) % ns, ns, Q); S.slIn = !(prev >= 0 && plain(P) && plain(Q) && P[0] === (Q[0] + 1) % ns && (P[0] !== 0 || !S.hold));
        this.sliceAt(S, seed, (s + 1) % ns, ns, Q); S.slOut = !(plain(P) && plain(Q) && Q[0] === (P[0] + 1) % ns && (Q[0] !== 0 || !S.hold)) || S.c > 0.01; S.slS = s; }
      const op = S.slOp, dur = slen * (1 - 0.75 * S.c); let seg = slen, tt = t;
      if (op === 4 || op === 5) { seg = slen / (op === 4 ? 4 : 8); tt = t % seg; }
      let p = op === 1 ? slen - 1 - tt : op === 2 ? tt * 0.5 : op === 3 ? (tt * 2) % slen : op === 6 ? tt * (1 - 0.5 * tt / slen) : tt;
      let cyc = op === 4 || op === 5 ? tt : t, cut = op === 4 || op === 5 || op === 3; if (op === 3) { cyc = (tt * 2) % slen / 2; seg = slen / 2; }
      if (S.slRat !== 1) { const sl = slen / S.slRat; p = (p * S.slRat) % slen; if (sl < seg) { seg = sl; cyc = cyc % sl; cut = true; } }
      const fin = cut || S.slIn ? cyc / fi : 1, fout = cut ? (seg - cyc) / fe : S.slOut ? (Math.min(dur, slen) - t) / fe : t < dur ? 1 : 0, e = S.slOn ? clamp(Math.min(fin, fout, 1), 0, 1) : 0;
      const x = S.slSrc * slen + clamp(p, 0, slen - 1.001), xi = x | 0, fr = x - xi; oL[i] = (S.lpL[xi] + (S.lpL[xi + 1] - S.lpL[xi]) * fr) * e; oR[i] = (S.lpR[xi] + (S.lpR[xi + 1] - S.lpR[xi]) * fr) * e; } }
  // ---- GRAIN ----
  grain(S, L, R, n, beat0, bInc, spb, w0) { this.need(S, 1); const sr = this.sr, oL = S.oL, oR = S.oR, gpb = 2 * Math.pow(12, S.macro), size = (0.02 + 0.23 * S.b * S.b) * sr, spray = S.a * sr * 0.9, H = S.hold ? null : this.hL, HR = this.hR;
    if (S.hold && !S.fzOn) { const N = S.fzL.length; for (let k = 0; k < N; k++) { const j = (w0 - N + k) & MG_HM; S.fzL[k] = this.hL[j]; S.fzR[k] = HR[j]; } S.fzOn = 1; } if (!S.hold) S.fzOn = 0;
    const overlap = Math.max(1, gpb * (size / spb)), ng = 1.2 / Math.sqrt(overlap);
    for (let i = 0; i < n; i++) { const beat = beat0 + i * bInc; if (S.gNext < 0 || S.gNext > beat + 4) S.gNext = Math.ceil(beat * gpb) / gpb;
      if (beat >= S.gNext) { S.gNext += 1 / gpb; const g = S.gk = (S.gk + 1) % S.gn, r1 = noise() * 0.5 + 0.5, r2 = noise() * 0.5 + 0.5; let st = 0;
        switch (S.sub) { case 1: st = [0, 12, -12][Math.floor(r2 * 2.999)]; break; case 2: st = S.tones[Math.floor(r2 * (S.nt - 0.001))] + (r1 < 0.3 ? -12 : 0); break; case 3: st = [0, 12, 19, 7][Math.floor(r2 * 3.999)]; break; default: st = (r2 - 0.5) * 0.2; }
        const up = Math.pow(2, st / 12), inc = up * (up <= 2.01 && noise() < S.c * 2 - 1 ? -1 : 1), back = size * Math.max(1, Math.abs(inc)) + 64 + r1 * spray;
        S.gPos[g] = S.hold ? Math.max(0, Math.min(S.fzL.length - size * 2 - 2, S.fzL.length - back)) + (inc < 0 ? size * Math.abs(inc) : 0) : w0 + i - back + (inc < 0 ? size * Math.abs(inc) : 0); S.gInc[g] = inc; S.gLen[g] = size; S.gT[g] = 0; S.gPan[g] = 0.5 + 0.4 * noise(); S.gOn[g] = 1; S.gA[g] = up > 1.05 ? 1 - Math.exp(-TAU * 0.42 / up) : inc < 0 ? 1 - Math.exp(-TAU * 4500 / sr) : 1; /* (a reversed grain is smoothed too: a hit read backwards ends in a cliff) */ S.gzL[g] = 0; S.gzR[g] = 0; } /* (a grain read faster is smoothed under its new Nyquist: a one-pole at 0.42·rate/ratio) */
      let yl = 0, yr = 0;
      for (let g = 0; g < S.gn; g++) { if (!S.gOn[g]) continue; const u = S.gT[g] / S.gLen[g]; if (u >= 1) { S.gOn[g] = 0; continue; } const wv = sin1(u * 0.5), win = wv * wv * ng, p = S.gPos[g] + S.gT[g] * S.gInc[g]; let a, b;
        if (H) { const x = p, xi = Math.floor(x), fr = x - xi, j0 = xi & MG_HM, j1 = (xi + 1) & MG_HM; a = H[j0] + (H[j1] - H[j0]) * fr; b = HR[j0] + (HR[j1] - HR[j0]) * fr; }
        else { const N = S.fzL.length, x = clamp(p, 0, N - 2), xi = x | 0, fr = x - xi; a = S.fzL[xi] + (S.fzL[xi + 1] - S.fzL[xi]) * fr; b = S.fzR[xi] + (S.fzR[xi + 1] - S.fzR[xi]) * fr; }
        const ga = S.gA[g]; if (ga < 1) { S.gzL[g] += (a - S.gzL[g]) * ga; S.gzR[g] += (b - S.gzR[g]) * ga; a = S.gzL[g]; b = S.gzR[g]; }
        const pn = S.gPan[g]; yl += (a * (1 - pn) + b * (1 - pn) * 0.4) * win * 1.4; yr += (b * pn + a * pn * 0.4) * win * 1.4; S.gT[g]++; }
      oL[i] = yl; oR[i] = yr; } }
  // ---- SPECTRAL ----
  spectral(S, L, R, n, w0) { this.need(S, 2); const oL = S.oL, oR = S.oR;
    if (S.spFresh) { S.spFresh = 0; S.spPos = 0; S.spHop = 0; for (let k = 0; k < MG_FN; k++) { const j = (w0 - MG_FN + k) & MG_HM; S.spIn[0][k] = this.hL[j]; S.spIn[1][k] = this.hR[j]; } }
    for (let i = 0; i < n; i++) { const p = S.spPos; S.spIn[0][p] = L[i]; S.spIn[1][p] = R[i]; oL[i] = S.spOut[0][p] * 0.6667; oR[i] = S.spOut[1][p] * 0.6667; S.spOut[0][p] = 0; S.spOut[1][p] = 0; S.spPos = (p + 1) & (MG_FN - 1);
      if (++S.spHop >= MG_FH) { S.spHop = 0; this.frame(S, 0); this.frame(S, 1); S.spHeld = Math.min(64, S.spHeld + 1); } }
    // a frozen spectrum (Amount over 0.5) sounds at the level its input had while it was held: the held frames' phases no longer add
    // up as the input's did, so its output is followed and brought to that level (within −6 … +10 dB, gliding)
    if (S.sub === 0 && S.macro > 0.5) { let ei = 0, eo = 0; for (let i = 0; i < n; i++) { ei += L[i] * L[i] + R[i] * R[i]; eo += oL[i] * oL[i] + oR[i] * oR[i]; } if (S.spHeld < 16) S.fzI += (ei / n - S.fzI) * 0.1; else { S.fzO += (eo / n - S.fzO) * 0.05; if (S.fzO > 1e-12) S.fzG += (clamp(Math.sqrt(S.fzI / S.fzO), 0.5, 3.2) - S.fzG) * 0.05; }
      const g = S.fzG; for (let i = 0; i < n; i++) { oL[i] *= g; oR[i] *= g; } } }
  frame(S, ch) { const N = MG_FN, Hn = N / 2, re = S.spRe, im = S.spIm, inp = S.spIn[ch], pos = S.spPos, W = MG_WIN, sr = this.sr, sub = S.sub, amt = S.macro;
    for (let i = 0; i < N; i++) { re[i] = inp[(pos + i) & (N - 1)] * W[i]; im[i] = 0; } mgFft(re, im, false);
    const mag = S.spMag[ch], hold = S.spHold[ch], ph = S.spPh[ch], OM = S.spOutM, OP = S.spOutP; let ein = 0, eout = 0;
    if (sub === 2 && (S.spMask !== this.mask * 16 + this.root)) { S.spMask = this.mask * 16 + this.root; for (let k = 1; k <= Hn; k++) { const f = k * sr / N, m = 12 * Math.log2(f / 440) + 69; let d = 12; for (let pc = 0; pc < 12; pc++) if (this.mask & (1 << pc)) { const x = (((m - pc) % 12) + 12) % 12, y = Math.min(x, 12 - x); if (y < d) d = y; } S.spW[k] = f < 160 ? 0 : d; } S.spW[0] = 0; } /* (under 160 Hz a bin is wider than a semitone: the kick and the sub pass as they are) */
    const wid = 0.25 + 2.5 * (1 - amt) * (1 - amt), tilt = (S.a - 0.5) * 1.6, sp = S.c, blurA = Math.pow(amt, 0.35) * 0.985;
    for (let k = 0; k <= Hn; k++) { const r = re[k], q = im[k], m = Math.sqrt(r * r + q * q), a = Math.atan2(q, r); ein += m * m; let o = m, phase = a;
      if (sub === 0) { if (S.spHeld < 16) hold[k] = Math.sqrt((hold[k] * hold[k] * S.spHeld + m * m) / (S.spHeld + 1)); /* (the held spectrum: the power average of its first 16 frames, 93 ms) */ const adv = TAU * k * MG_FH / N; ph[k] += adv + (noise() * sp * 1.5); o = m + (hold[k] - m) * amt; phase = amt > 0.5 ? ph[k] : a; }
      else if (sub === 1) { mag[k] = mag[k] * blurA + m * (1 - blurA); o = mag[k]; phase = a + noise() * Math.PI * amt * (0.3 + sp); }
      else if (sub === 2) { const d = S.spW[k] / wid; o = m * (1 - amt + amt * Math.exp(-d * d)); }
      if (tilt) o *= Math.pow(Math.max(1, k) / 23.2, tilt);
      if (sp > 0 && sub !== 0) o *= 1 + sp * 1.6 * (noise() > 0.6 ? 1 : -0.4);
      OM[k] = o; OP[k] = phase; }
    if (sub === 3) { // PARTIALS: keep the K strongest local peaks (and their neighbours)
      const K = Math.round(3 + 60 * (1 - amt) * (1 - amt)); mag.fill(0, 0, Hn + 1); let thr = 0; { const tmp = hold; for (let k = 0; k <= Hn; k++) tmp[k] = OM[k]; tmp.subarray(0, Hn + 1).sort(); thr = tmp[Math.max(0, Hn - K * 3)]; }
      let kept = 0; for (let k = 2; k < Hn - 1 && kept < K; k++) if (OM[k] >= thr && OM[k] >= OM[k - 1] && OM[k] >= OM[k + 1]) { mag[k - 1] = OM[k - 1]; mag[k] = OM[k]; mag[k + 1] = OM[k + 1]; kept++; }
      for (let k = 0; k <= Hn; k++) OM[k] = mag[k] * amt + OM[k] * (1 - amt) * (1 - amt); }
    const sh = Math.pow(2, (S.b - 0.5) * 2), shift = Math.abs(S.b - 0.5) > 0.02;
    if (shift) { mag.fill(0, 0, Hn + 1); re.fill(0, 0, Hn + 1); for (let k = 0; k <= Hn; k++) { const t = Math.round(k * sh); if (t > 0 && t <= Hn) { mag[t] += OM[k]; re[t] = OP[k] * sh; } } for (let k = 0; k <= Hn; k++) { OM[k] = mag[k]; OP[k] = re[k]; } } /* (a spectral shift: every bin moved to k·ratio, its phase scaled with it — inharmonic on purpose) */
    for (let k = 0; k <= Hn; k++) { const o = OM[k]; eout += o * o; re[k] = o * Math.cos(OP[k]); im[k] = o * Math.sin(OP[k]); } for (let k = 1; k < Hn; k++) { re[N - k] = re[k]; im[N - k] = -im[k]; } im[0] = 0; im[Hn] = 0;
    // the frame's level held to its input's (a frozen spectrum to where it was held), within ±12 dB, gliding
    const tgt = sub === 0 && amt > 0.5 ? 1 : clamp(Math.sqrt((ein + 1e-12) / (eout + 1e-12)), 0.25, sub === 3 ? 2.2 : sub === 2 ? 4.5 : 4); S.spComp[ch] += (tgt - S.spComp[ch]) * 0.3; const cg = S.spComp[ch] / N;
    mgFft(re, im, true); const out = S.spOut[ch]; for (let i = 0; i < N; i++) out[(pos + i) & (N - 1)] += re[i] * W[i] * cg; }
  // ---- STEPS ---- each repeat is the division (t + 1) divisions back, re-played from the start of the current division at the
  // speed of its interval (a tape at another speed: exactly in tune, shorter when higher), faded at both ends; the dry signal stays
  steps(S, L, R, n, beat0, bInc, spb, w0) { const oL = S.oL, oR = S.oR, H = this.hL, HR = this.hR, div = MG_STEPDIV[Math.min(4, Math.floor(S.a * 4.999))], dS = div * spb, fb = 0.3 + 0.45 * S.macro, lpa = 0.04 + 0.9 * S.b * S.b, sp = S.c, fi = 0.0004 * this.sr, fe = 0.002 * this.sr, st = this.stepSemis, rt = this.stepRat;
    for (let t = 0; t < 6; t++) { st[t] = this.stepAt(S, t); rt[t] = Math.pow(2, st[t] / 12); }
    for (let i = 0; i < n; i++) { const tau = ((beat0 + i * bInc) / div % 1) * dS, seg = w0 + i - tau; let yl = L[i], yr = R[i], g = 0.5;
      for (let t = 0; t < 6; t++) { g *= fb; const r = rt[t], len = Math.min(dS, dS / r), pos = tau * r; if (tau >= len) { continue; }
        const e = Math.min(1, tau / fi, (len - tau) / fe), x = seg - (t + 1) * dS + pos, xi = Math.floor(x), fr = x - xi, j0 = xi & MG_HM, j1 = (xi + 1) & MG_HM;
        const a = (H[j0] + (H[j1] - H[j0]) * fr) * e, b = (HR[j0] + (HR[j1] - HR[j0]) * fr) * e, z = S.tpLp; z[2 * t] += (a - z[2 * t]) * lpa; z[2 * t + 1] += (b - z[2 * t + 1]) * lpa;
        const pan = t & 1 ? 0.5 + 0.5 * sp : 0.5 - 0.5 * sp; yl += z[2 * t] * g * (1 - pan) * 2; yr += z[2 * t + 1] * g * pan * 2; }
      oL[i] = yl; oR[i] = yr; } }
  stepAt(S, t) { const T = S.tones, nt = S.nt; switch (S.sub) { case 1: { const k = t + 1; return Math.max(-24, T[(nt - (k % nt)) % nt] - 12 * Math.ceil(k / nt)); }
    case 2: return t & 1 ? 12 : T[Math.min(nt - 1, 1 + (t >> 1))] || 7; case 3: return T[Math.floor(mgHash(t, nt * 31 + T[1]) * nt)] + (mgHash(t + 9, 3) < 0.4 ? 12 : 0);
    default: { const k = t + 1; return Math.min(24, T[k % nt] + 12 * Math.floor(k / nt)); } } }
  // ---- SPIRAL ----
  spiral(S, L, R, n, beat0, bInc) { this.need(S, 4); const oL = S.oL, oR = S.oR, P = S.ps, sync = S.sub >= 2, dir = S.sub & 1 ? -1 : 1, fb = 0.75 * S.b, lpa = 0.08 + 0.9 * S.c * S.c, bars = [1, 2, 4, 8][Math.min(3, Math.floor(S.a * 3.999))], hz = (0.04 + 0.6 * S.a * S.a) / this.sr, dep = S.macro;
    for (let i = 0; i < n; i++) { if (sync) S.sph = ((beat0 + i * bInc) / (bars * 4)) % 1; else { S.sph += hz; if (S.sph >= 1) S.sph -= 1; }
      const xl = L[i] + S.spFb[0] * fb, xr = R[i] + S.spFb[1] * fb; let yl = 0, yr = 0;
      for (let v = 0; v < 3; v++) { let u = S.sph + v / 3; if (u >= 1) u -= 1; const semi = dir * (u - 0.5) * 12, ratio = Math.pow(2, semi / 12), g = sin1(u * 0.5) * 0.8165;
        yl += P[v].run(xl, ratio) * g; yr += P[v + 3].run(xr, ratio) * g; }
      const z = S.tpLp; z[0] += (yl - z[0]) * lpa; z[1] += (yr - z[1]) * lpa; yl = z[0]; yr = z[1]; S.spFb[0] = yl; S.spFb[1] = yr;
      oL[i] = L[i] * (1 - dep) + tanh(yl) * dep * 1.15; oR[i] = R[i] * (1 - dep) + tanh(yr) * dep * 1.15; } }
  // ---- RING ----
  ring(S, L, R, n, beat0, bInc, w0) { const oL = S.oL, oR = S.oR, sr = this.sr, H = this.hL, HR = this.hR, T = S.tones, oct = Math.round((S.b - 0.5) * 4), dep = S.macro, fm = S.a, lpa = 0.08 + 0.9 * S.c * S.c;
    for (let i = 0; i < n; i++) { let semi = 0; if (S.sub === 1) semi = 7; else if (S.sub === 2) semi = T[1] || 4; else if (S.sub === 3) semi = T[Math.floor((beat0 + i * bInc) * 4) % S.nt];
      let f = 440 * Math.pow(2, ((this.root + semi) - 9) / 12); while (f < 110) f *= 2; while (f >= 220) f /= 2; f *= Math.pow(2, oct); S.rf += (f - S.rf) * 0.003;
      S.rph += S.rf / sr; if (S.rph >= 1) S.rph -= 1; const c = sin1(S.rph + 0.25), s = sin1(S.rph);
      // FM: the signal read through a delay swung by the carrier (index ≈ 2.5 at FM = 1)
      const dm = 2 + fm * 2.5 * sr / (TAU * S.rf) * (1 + s), x = w0 + i - dm, xi = Math.floor(x), fr = x - xi, j0 = xi & MG_HM, j1 = (xi + 1) & MG_HM, ml = H[j0] + (H[j1] - H[j0]) * fr, mr = HR[j0] + (HR[j1] - HR[j0]) * fr;
      const rl = L[i] * c, rr = R[i] * c, el = rl + (ml - rl) * fm, er = rr + (mr - rr) * fm, z = S.toneLp; z[0] += (el - z[0]) * lpa; z[1] += (er - z[1]) * lpa;
      oL[i] = L[i] + (z[0] - L[i]) * dep; oR[i] = R[i] + (z[1] - R[i]) * dep; } }
  // ---- VOWEL ----
  vowel(S, L, R, n, beat0, bInc) { if (!S.vf) S.vf = Array.from({ length: 6 }, () => new Svf()); const oL = S.oL, oR = S.oR, sr = this.sr, F = S.vf, q = 3 + 9 * S.b, drv = 1 + 7 * S.c, dn = 1 / tanh(Math.min(4, drv * 0.5) + 1e-6) * 0.5;
    for (let i = 0; i < n; i++) { if ((S.vk++ & 15) === 0) { let pos = S.macro * 4; if (S.sub) { const per = [4, 2, 1][S.sub - 1], ph = ((beat0 + i * bInc) / per) % 1; pos = clamp(pos + S.a * 2 * sin1(ph), 0, 4); }
        const k = Math.min(3, Math.floor(pos)), u = pos - k, V0 = MG_VOW[k], V1 = MG_VOW[k + 1];
        for (let f = 0; f < 3; f++) { const hz = V0[f] * Math.pow(V1[f] / V0[f], u), gd = V0[f + 3] + (V1[f + 3] - V0[f + 3]) * u; F[f].set(hz, q, sr); F[f + 3].set(hz * 1.012, q, sr); S.vG[f] = dbToGain(gd) / q * 2.2; } }
      const xl = tanh(L[i] * drv * 0.5) * dn * 2, xr = tanh(R[i] * drv * 0.5) * dn * 2; let yl = 0, yr = 0;
      for (let f = 0; f < 3; f++) { F[f].run(xl); F[f + 3].run(xr); yl += F[f].bp * S.vG[f]; yr += F[f + 3].bp * S.vG[f]; }
      oL[i] = yl; oR[i] = yr; } }
  // ---- FOLD ----
  fold(S, L, R, n) { const oL = S.oL, oR = S.oR, sr = this.sr, drv = 1 + 15 * S.macro * S.macro, fa = S.a, cr = S.b, lpa = 0.06 + 0.9 * S.c * S.c, hm = [0, 4, 8, 16][S.sub];
    let fh = 0; if (hm) { let f = 440 * Math.pow(2, (this.root - 9) / 12); while (f < 55) f *= 2; while (f >= 110) f /= 2; fh = f * hm / sr; } else fh = (800 + 7000 * (1 - cr)) / sr;
    for (let i = 0; i < n; i++) { const X = S.fX; let yl = 0, yr = 0;
      for (let h = 0; h < 2; h++) { const xl = h ? L[i] : (L[i] + X[0]) * 0.5, xr = h ? R[i] : (R[i] + X[1]) * 0.5, ul = xl * drv, ur = xr * drv; // 2× oversampled: the half-sample point, then the sample
        yl += (tanh(ul) * (1 - fa) + sin1((ul * 0.25) % 1 + 1) * fa) * 0.5; yr += (tanh(ur) * (1 - fa) + sin1((ur * 0.25) % 1 + 1) * fa) * 0.5; }
      X[0] = L[i]; X[1] = R[i];
      S.fPh += fh; if (S.fPh >= 1) { S.fPh -= Math.floor(S.fPh); S.fH[0] = yl; S.fH[1] = yr; } yl += (S.fH[0] - yl) * cr; yr += (S.fH[1] - yr) * cr;
      const z = S.toneLp; z[0] += (yl - z[0]) * lpa; z[1] += (yr - z[1]) * lpa; oL[i] = z[0]; oR[i] = z[1]; } }
}
