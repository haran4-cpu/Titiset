/* ===================== FORGE · MORE SYNTHESIS ENGINES (v9.4) =====================
   Eight voices that the 25 models of 03_synth.js do not have, all FORGE's own code:
     fm4    four-operator FM, eight algorithms, feedback, a modulator envelope (DX-style bells, keys, basses, metallic plucks)
     pd     phase distortion (CZ-style): the cosine bent into saw / square / resonant windows, its DCW riding the filter envelope
     add    additive: eight partials with a spectral tilt, odd / even balance, a formant peak, stretch and slow shimmer
     modal  struck resonators: a mallet into four modes of a material (marimba, vibes, glass, bell, kalimba, wood, steel, tube)
     grain  granular cloud: grains of a texture rendered for the note, scanned, jittered and spread in stereo
     hyper  nine drifting saws in two stereo layers (an octave layer optional)
     va     two oscillators (saw / square / triangle / sine) with hard sync, ring and cross modulation
     pluck2 a plucked string (Karplus-Strong) with a pick position and a resonant body
   Every one goes through the same envelopes, glide, LFOs and velocity as the 25, then a filter of its choice (ladder, 12 dB,
   MS-20-style, SEM-style morph, band-pass, formant) and a drive of its choice (soft, tape, fold, crush, tube). They render in
   JavaScript (the WebAssembly voice keeps the 25); the loop keeps its state in locals and allocates nothing. */
Object.assign(MODEL, { fm4: 25, pd: 26, add: 27, modal: 28, grain: 29, hyper: 30, va: 31, pluck2: 32 });
const X_FIRST = 25;
// the new engines' parameters (merged into every kit: a 9.3 kit is unchanged by them)
const DFLT_X = { algo: 0, r1: 1, r2: 1, r3: 2, r4: 3.5, i2: 1, i3: 0.5, i4: 0.3, fb: 0, md: 0.4, ms: 0.25, pdw: 0, dcw: 0.6, tilt: 1, odd: 0.5, fpk: 0, fwd: 1, stretch: 0, shimmer: 0.3,
  mat: 0, hard: 0.5, density: 0.5, gsize: 0.08, scan: 0.25, gjit: 0.15, oct2: 0, osc1: 0, osc2: 0, det2: 0.08, sync: 0, ring: 0, xmod: 0, flt: -1, fmorph: 0, dtype: 0, drv: 0, body: 0.5, pick: 0.3, stereo: 0.5 };
{ const base = dflt; dflt = () => Object.assign(base(), DFLT_X); } // eslint-disable-line no-func-assign
// modal materials: four mode ratios, relative amplitudes and decays (× the voice's decay)
const MODAL_R = [[1, 3.99, 10.65, 2.0], [1, 4.0, 10.0, 2.9], [1, 2.32, 4.25, 6.63], [1, 2.76, 5.40, 8.93], [1, 5.8, 15.0, 3.2], [1, 2.57, 4.2, 6.8], [1, 2.0, 3.0, 4.01], [1, 2.76, 5.4, 8.93]];
const MODAL_A = [[1, 0.35, 0.12, 0.1], [1, 0.5, 0.25, 0.1], [1, 0.6, 0.45, 0.3], [1, 0.8, 0.6, 0.45], [1, 0.3, 0.1, 0.15], [1, 0.5, 0.3, 0.2], [1, 0.6, 0.4, 0.3], [1, 0.7, 0.5, 0.4]];
const MODAL_D = [[1, 0.35, 0.12, 0.5], [1.6, 0.6, 0.3, 0.7], [1.2, 0.8, 0.5, 0.4], [2, 1.4, 1, 0.7], [1, 0.25, 0.1, 0.3], [0.25, 0.15, 0.1, 0.08], [1, 0.6, 0.4, 0.3], [3, 2, 1.4, 1]];
const XS = new Float64Array(16), XR = new Float64Array(8); // per-block scratch (additive amplitudes): filled and used inside one voice's block
const HYPER_D = [-0.12, -0.085, -0.052, -0.022, 0, 0.021, 0.05, 0.083, 0.118];
// the waveform of a VA oscillator at phase p (cycles) with increment dt (band-limited edges)
function vaOsc(w, p, dt, pw) { if (w === 0) return 2 * p - 1 - blep(p, dt); if (w === 1) { let q = p + 1 - pw; if (q >= 1) q -= 1; return (p < pw ? 1 : -1) + blep(p, dt) - blep(q, dt); } if (w === 2) return p < 0.5 ? 4 * p - 1 : 3 - 4 * p; return sin1(p); }
// drive stages: 0 none, 1 soft (tanh), 2 tape (asymmetric), 3 fold, 4 crush (bits + rate), 5 tube (even harmonics)
function xDrive(t, y, a, st) { if (t === 1) { const g = 1 + 6 * a; return tanh(y * g) / Math.min(1, tanh(g)); } if (t === 2) { const g = 1 + 4 * a, z = y * g; return tanh(z + 0.15 * a * z * z) * 0.9; }
  if (t === 3) { const g = 1 + 5 * a; return sin1(y * g * 0.25); } if (t === 5) { const g = 1 + 5 * a, z = y * g; return tanh(z) + 0.12 * a * (tanh(z * z) - 0.5); }
  if (t === 4) { const q = Math.pow(2, 12 - 9 * a); return Math.round(y * q) / q; } return y; }
// note-on set-up of the new engines (called from Synth.trigger)
function initX(S, v, P, f, opt) { const sr = S.sr, m = S.m;
  v.e1 = 1; v.d1 = Math.exp(-1 / (Math.max(0.01, P.md) * sr)); v.e2 = 0; v.e3 = ((v.note * 2654435761) ^ (S.clock | 0)) >>> 0 || 1; v.d3 = 0;
  if (m === MODEL.modal) { const R = MODAL_R[P.mat | 0] || MODAL_R[0], A = MODAL_A[P.mat | 0] || MODAL_A[0], D = MODAL_D[P.mat | 0] || MODAL_D[0], base = Math.max(0.05, P.aDec);
    for (let k = 0; k < 4; k++) { const fk = f * R[k], ok = fk < sr * 0.45, w = TAU * fk / sr, r = ok ? Math.exp(-1 / (base * D[k] * sr)) : 0; v.pd[2 * k] = 2 * r * Math.cos(w); v.pd[2 * k + 1] = r * r; v.ph[k] = ok ? A[k] * Math.sin(w) : 0; v.pa[2 * k] = 0; v.pa[2 * k + 1] = 0; }
    v.e1 = 1; v.d1 = Math.exp(-1 / ((0.0006 + 0.004 * (1 - P.hard)) * sr)); v.e2 = 0.25 + 0.75 * P.hard; }
  else if (m === MODEL.grain) { // the texture the grains read: exactly periodic over the buffer, so a grain can cross its end without a click
    const Lb = 2400, k = Math.max(1, Math.round(Lb * f / sr)), fb = k * sr / Lb; v.kl = Lb; v.d2 = fb; /* read at f / fb: the exact pitch, glide included */ let a = 0, b = 0, c = 0, lp = 0, mx = 1e-9;
    for (let i = 0; i < Lb; i++) { a += k / Lb; if (a >= 1) a -= 1; b += k * 1.0057 / Lb; if (b >= 1) b -= 1; c += 2 * k / Lb; if (c >= 1) c -= 1; const s = (2 * a - 1) * 0.5 + (2 * b - 1) * 0.35 + Math.sin(TAU * c) * 0.3 + noise() * P.noiseAmt; lp += (s - lp) * (0.15 + 0.8 * P.bright); v.ks[i] = lp; mx = Math.max(mx, Math.abs(lp)); }
    for (let i = 0; i < Lb; i++) v.ks[i] /= mx; for (let g = 0; g < 4; g++) { v.ph[g] = (g * 613) % Lb; v.ph[4 + g] = g / 4; } }
  else if (m === MODEL.pluck2) { const per = clamp(sr / f, 9, 2390), Li = Math.floor(per - 0.6), dl = per - Li - 0.5; v.kl = Li; v.kz = (1 - dl) / (1 + dl); v.apx = 0; v.apy = 0; let z = 0; const pk = Math.max(1, Math.round(Li * clamp(P.pick, 0.05, 0.5)));
    for (let i = 0; i <= Li + 1; i++) { z += (noise() - z) * (0.2 + 0.75 * P.bright); v.ks[i] = z; } for (let i = Li + 1; i >= pk; i--) v.ks[i] -= v.ks[i - pk] * 0.9; v.kw = Li + 2; // the pick position: a comb on the excitation
    const bf = 90 + 260 * P.body; v.s2.set(bf, 2.2, sr); v.s3.set(bf * 2.6, 3, sr); v.s2.reset(); v.s3.reset(); }
  else if (m === MODEL.hyper || m === MODEL.va || m === MODEL.pd || m === MODEL.add) { v.d2 = -1; for (let k = 0; k < 9; k++) v.ph[k] = m === MODEL.hyper ? ((Math.imul(k + 1, 2654435761) ^ v.e3) >>> 0) / 4294967296 : 0; for (let k = 0; k < 8; k++) v.pa[k] = 0; } }
// one voice of a new engine, one block (same contract as Synth.voice)
Synth.prototype.voiceX = function (v, L, R, n) {
  const sr = this.sr, inv = 1 / sr, P = v.p, m = v.m;
  const aA = 1 - Math.exp(-1 / (Math.max(0.0005, v.atk) * sr)), aD = Math.exp(-1 / (Math.max(0.005, P.aDec) * sr)), aRn = Math.exp(-1 / (Math.max(0.005, v.rel) * sr)), aRf = Math.exp(-1 / (0.004 * sr));
  const fD = Math.exp(-1 / (Math.max(0.005, P.fDec) * sr)), fA = 1 - Math.exp(-1 / (Math.max(0.0005, P.fAtk) * sr)), gl = P.glide > 0 ? 1 - Math.exp(-1 / (P.glide * sr)) : 1;
  const lsync = P.mLfoS > 0 ? P.mLfoS : v.ls, lfoInc = lsync ? (this.bpm / 60) / lsync / sr : P.lfoRate / sr;
  const sus = P.aSus, fSus = P.fSus, pEnv = P.pEnv, lfoAmp = P.lfoAmp, ft = v.ft, outG = v.vel * P.gain, gL = v.gl, gR = v.gr;
  let env = v.env, stage = v.stage, fenv = v.fenv, fstage = v.fstage, f = v.f, lfo = v.lfo, tt = v.t, len = v.len, relFast = v.relFast, fadeIn = v.fadeIn, ag = v.ag, alive = 1, i = 0;
  // the filter: an explicit type, else the engine's natural one (pluck2 / modal / grain / add: none; the rest: 12 dB low-pass)
  const flt = P.flt >= 0 ? P.flt | 0 : (m === MODEL.pluck2 || m === MODEL.modal || m === MODEL.add || m === MODEL.grain ? 0 : 2), dty = P.dtype | 0, drv = P.drv, wide = P.stereo;
  const vel = v.vel, idxS = (0.45 + 0.55 * vel) * (0.5 + P.bright), eco = ECO.level >= 2;
  const p_body = P.body, p_bright = P.bright, p_density = P.density, p_det2 = P.det2, p_detune = P.detune, p_fmorph = P.fmorph, p_gjit = P.gjit, p_gsize = P.gsize, p_hard = P.hard, p_i2 = P.i2, p_i3 = P.i3, p_i4 = P.i4, p_lfoShape = P.lfoShape, p_lfoSync = P.lfoSync, p_oct2 = P.oct2, p_osc1 = P.osc1, p_osc2 = P.osc2, p_pdw = P.pdw, p_pw = P.pw, p_ring = P.ring, p_scan = P.scan, p_stretch = P.stretch, p_sync = P.sync, p_xmod = P.xmod; // (the kit's values used per sample, in locals: a property load in the sample loop cost twice the FM voice)
  const fmS = P.ms, fmD = v.d1, fmI2 = P.i2 * idxS, fmI3 = P.i3 * idxS, fmI4 = P.i4 * idxS, fmAl = P.algo | 0, fmR1 = P.r1, fmR2 = P.r2, fmR3 = P.r3, fmR4 = P.r4, fmFb = P.fb * 0.5; // (fm4: the block's constants in locals)
  let e1 = v.e1, e2 = v.e2, e3 = v.e3 >>> 0, crushH = 0, crushC = 0, sideLp = v.d3, dcz = v.mph; const r2 = Math.pow(2, P.oct2 + P.det2 / 12), dcA = TAU * 8 * inv; // dcz: the DC blocker (8 Hz) every engine ends with
  while (i < n) {
    if (v.wait > 0) { const w = Math.min(v.wait, n - i); v.wait -= w; len -= w; i += w; if (i >= n) break; }
    const end = Math.min(n, i + (fstage === 0 || tt < 256 ? 4 : 16));
    let pe = 1, dpe = 0; if (pEnv) { pe = Math.pow(2, pEnv * Math.exp(-(tt * inv) / P.pDec) / 12); dpe = (Math.pow(2, pEnv * Math.exp(-((tt + end - i) * inv) / P.pDec) / 12) - pe) / (end - i); }
    const lfd = P.lfoDepth + P.mLfo, lph = P.mLfoS > 0 ? ((this.beat + i * this.bpm / 60 / sr) / P.mLfoS) % 1 : lfo, lf = lfd ? sin1(lph) * lfd : 0;
    const kt = Math.pow(f / 261.6, P.keytrack); let cut = clamp(P.cut * v.bright * kt * Math.pow(2, (P.envAmt * (1 + v.acc * 0.6)) * fenv + lf * 2 + P.mCut), 20, sr * 0.45); v.cut = cut;
    const q = P.res + P.mRes;
    if (flt === 1 || flt === 5) { v.lad.set(cut, Math.min(0.97, q + v.acc * 0.08), sr); v.lad.drive = flt === 5 ? 1.8 + P.drive : P.drive; }
    else if (flt === 2 || flt === 3 || flt === 4 || flt === 6) v.s1.set(cut, (flt === 3 ? 0.8 + q * 6 : 0.6 + q * 2.5), sr);
    else if (flt === 7) { const x = clamp(P.vow + P.vowLfo * lf + fenv * P.envAmt * 0.5, 0, 4), vi = Math.min(3, Math.floor(x)), vf = x - vi, A0 = WT_VOW[vi], A1 = WT_VOW[vi + 1], sh = Math.pow(2, P.mCut * 0.5);
      v.s1.set((A0[0] + (A1[0] - A0[0]) * vf) * sh, 8, sr); v.s2.set((A0[1] + (A1[1] - A0[1]) * vf) * sh, 10, sr); v.s3.set((A0[2] + (A1[2] - A0[2]) * vf) * sh, 12, sr); }
    const sideA = 1 - Math.exp(-TAU * Math.min(cut * 1.2, sr * 0.45) * inv); // the stereo side follows the filter with one pole
    // engine-rate values for this control block
    let dcw = 0; if (m === MODEL.pd) dcw = clamp(P.dcw * (0.35 + 0.65 * fenv) * (0.6 + 0.4 * vel) + P.mCut * 0.15, 0, 0.98);
    if (m === MODEL.add) { const sh = P.shimmer, pk = P.fpk, A = v.pd; if (Math.abs(f - v.d2) > v.d2 * 0.004 || (tt & 2047) < 16) { v.d2 = f; // the partials' amplitudes: only when the pitch has moved (glide), not every block
        for (let k = 0; k < 8; k++) { const h = k + 1, fh = f * h, ev = h & 1 ? 1 : 1 - P.odd; let a = Math.pow(h, -P.tilt) * ev; // odd 1 = odd harmonics only (hollow)
          if (pk > 0) a *= 1 + 3 * Math.exp(-Math.pow(Math.log2(fh / pk) / Math.max(0.2, P.fwd), 2)); A[k] = fh * (1 + P.stretch * h * h * 0.0008) < sr * 0.45 ? a : 0; } }
      for (let k = 0; k < 8; k++) { XS[k] = A[k] && A[k] * (1 + sh * 0.35 * sin1(((tt * inv) * (0.13 + k * 0.071) + k * 0.37) % 1)); XR[k] = (k + 1) * (1 + P.stretch * (k + 1) * (k + 1) * 0.0008); } }
    if (m === MODEL.modal) { const s = v.pa; for (let k = 0; k < 8; k++) if (s[k] < 1e-20 && s[k] > -1e-20) s[k] = 0; } // (a ringing-out resonator would sink into denormals)
    for (; i < end; i++) {
      if (stage === 0) { env += (1.05 - env) * aA; if (env >= 1) { env = 1; stage = 1; } }
      else if (stage === 1) { env = sus + (env - sus) * aD; }
      else { env *= relFast ? aRf : aRn; if (env < 3e-3 && stage === 3) relFast = 1; if (env < 1e-4) { alive = 0; break; } }
      if (fadeIn >= 0 && fadeIn-- === 0) { relFast = 1; stage = 3; }
      if (stage < 3 && --len <= 0) stage = 3;
      if (fstage === 0) { fenv += (1 - fenv) * fA; if (fenv > 0.98) fstage = 1; } else fenv = fSus + (fenv - fSus) * fD;
      f += (ft - f) * gl; lfo += lfoInc; if (lfo >= 1) lfo -= 1;
      let am = 1; if (lfoAmp) { const ph = p_lfoSync ? ((this.beat + i * this.bpm / 60 / sr) / p_lfoSync) % 1 : lfo, raw = p_lfoShape === 1 ? (ph < 0.5 ? 1 : 0) : p_lfoShape === 2 ? 1 - ph : 0.5 + 0.5 * sin1(ph); ag += (raw - ag) * 0.03; am = 1 - lfoAmp * (1 - ag); }
      tt++; const dt = f * pe * inv; pe += dpe;
      let y = 0, side = 0;
      if (m === 25) { // fm4
        const menv = fmS + (1 - fmS) * e1; e1 = e1 > 1e-9 ? e1 * fmD : 0; const I2 = fmI2 * menv, I3 = fmI3 * menv, I4 = fmI4 * menv, al = fmAl;
        const p = v.ph; let q = p[0] + dt * fmR1; p[0] = q - Math.floor(q); q = p[1] + dt * fmR2; p[1] = q - Math.floor(q); q = p[2] + dt * fmR3; p[2] = q - Math.floor(q); q = p[3] + dt * fmR4; p[3] = q - Math.floor(q);
        const o4 = sin1(p[3] + fmFb * e2); e2 = o4;
        if (al === 0) { const o3 = sin1(p[2] + I4 * o4), o2 = sin1(p[1] + I3 * o3); y = sin1(p[0] + I2 * o2); }
        else if (al === 1) { const o3 = sin1(p[2]), o2 = sin1(p[1] + I3 * o3 + I4 * o4); y = sin1(p[0] + I2 * o2); }
        else if (al === 2) { const o3 = sin1(p[2] + I4 * o4), o2 = sin1(p[1]); y = (sin1(p[0] + I2 * o2) + o3) * 0.6; }
        else if (al === 3) { const o3 = sin1(p[2]), o2 = sin1(p[1]); y = sin1(p[0] + I2 * o2 + I3 * o3 + I4 * o4); }
        else if (al === 4) { const c1 = sin1(p[1] + I3 * o4), c2 = sin1(p[2] + I2 * o4); y = (sin1(p[0] + I4 * o4) + c1 + c2) * 0.42; side = (c1 - c2) * 0.2 * wide; }
        else if (al === 5) { const o3 = sin1(p[2] + I4 * o4), o2 = sin1(p[1]); y = sin1(p[0] + I3 * o3 + I2 * o2); }
        else if (al === 6) { const o2 = sin1(p[1]); y = (sin1(p[0] + I2 * o2) + sin1(p[2]) * p_i3 * 0.5 + o4 * p_i4 * 0.5) * 0.6; }
        else { y = (sin1(p[0]) + sin1(p[1]) * p_i2 * 0.6 + sin1(p[2]) * p_i3 * 0.5 + o4 * p_i4 * 0.4) * 0.5; } }
      else if (m === 26) { // pd: two lines, the second detuned, each a cosine bent by the DCW (0 = a sine)
        const p = v.ph, d2 = dt * (1 + p_det2 * 0.01); p[0] += dt; p[0] -= Math.floor(p[0]); p[1] += d2; p[1] -= Math.floor(p[1]); const w = p_pdw | 0; let s0 = 0, s1 = 0;
        for (let k = 0; k < 2; k++) { const x = p[k]; let o;
          if (w === 1) { const xh = x < 0.5 ? x * 2 : x * 2 - 1, d = 1 - 0.95 * dcw, b = xh < d ? xh / d : 1; o = sin1((x < 0.5 ? 0 : 0.5) + 0.5 * b + 0.25); } // square: each half bends to its end early and holds
          else if (w === 2) { o = (x < 0.5 ? 2 * x : 2 - 2 * x) * sin1(x * (1 + 14 * dcw) + 0.25); } // resonant: a sine sweeping inside a triangle window (no jump at the wrap)
          else { const d = 0.5 - 0.49 * dcw, ph2 = x < d ? x * 0.5 / d : 0.5 + (x - d) * 0.5 / (1 - d); o = sin1(ph2 + 0.25); } // saw
          if (k) s1 = o; else s0 = o; }
        y = (s0 + s1) * 0.45; side = (s0 - s1) * 0.3 * wide; }
      else if (m === 27) { // add: eight partials
        const p = v.pa; let s = 0, sd = 0; const nP = eco ? 4 : 8;
        if (!p_stretch) { p[0] += dt; p[0] -= Math.floor(p[0]); const s1 = sin1(p[0]), c2 = 2 * sin1(p[0] + 0.25); let a0 = 0, a1 = s1; // sin((k+1)x) = 2 cos x · sin(kx) − sin((k−1)x)
          for (let k = 0; k < nP; k++) { const o = a1 * XS[k]; s += o; if (k & 1) sd += o; else sd -= o; const a2 = c2 * a1 - a0; a0 = a1; a1 = a2; } }
        else for (let k = 0; k < nP; k++) { const a = XS[k]; if (!a) continue; const q = p[k] + dt * XR[k]; p[k] = q - Math.floor(q); const o = sin1(p[k]) * a; s += o; if (k & 1) sd += o; else sd -= o; }
        y = s * 0.45; side = sd * 0.25 * wide; }
      else if (m === 28) { // modal: the mallet (an impulse, then a short noise) into four two-pole resonators
        let ex = 0; if (tt === 1) ex = e2; e3 = (Math.imul(e3, 1664525) + 1013904223) >>> 0; ex += (e3 / 2147483648 - 1) * e1 * 0.15 * (0.3 + p_hard); e1 = e1 > 1e-9 ? e1 * v.d1 : 0;
        const c = v.pd, s = v.pa; let o = 0;
        for (let k = 0; k < 4; k++) { const y0 = c[2 * k] * s[2 * k] - c[2 * k + 1] * s[2 * k + 1] + ex * v.ph[k]; s[2 * k + 1] = s[2 * k]; s[2 * k] = y0; o += y0; }
        y = o * 0.9; side = (s[2] - s[4]) * 0.3 * wide; }
      else if (m === 29) { // grain: four grains reading the texture, Hann windows, scanning
        const B = v.ks, Lb = v.kl, rate = f * pe / v.d2, gsz = Math.max(0.01, p_gsize), dAge = inv / gsz * (0.6 + 0.8 * p_density); let l = 0, r = 0;
        for (let g = 0; g < 4; g++) { let age = v.ph[4 + g] + dAge; if (age >= 1) { age -= 1; e3 = (Math.imul(e3, 1664525) + 1013904223) >>> 0; const j = e3 / 4294967296; v.ph[g] = (((tt * inv * p_scan * 400) + j * p_gjit * Lb) % Lb + Lb) % Lb; }
          v.ph[4 + g] = age; let pos = v.ph[g] + rate * (1 + (g - 1.5) * p_gjit * 0.004); if (pos >= Lb) pos -= Lb; v.ph[g] = pos;
          const ip = pos | 0, fr = pos - ip, s = B[ip] + (B[ip + 1 < Lb ? ip + 1 : 0] - B[ip]) * fr, wv = 0.5 - 0.5 * sin1(age + 0.25), o = s * wv; if (g & 1) { l += o * (1 - wide * 0.6); r += o; } else { l += o; r += o * (1 - wide * 0.6); } }
        y = (l + r) * 0.4; side = (l - r) * 0.4; }
      else if (m === 30) { // hyper: nine drifting saws, the odd ones left, the even ones right; an octave layer
        const p = v.ph, D = p_detune * 0.9, N = eco ? 3 : 9; let s = 0, sd = 0; if ((tt & 255) === 0) { e3 = (Math.imul(e3, 1664525) + 1013904223) >>> 0; e2 += ((e3 / 2147483648 - 1) * 0.0006 - e2 * 0.02); }
        for (let k = 0; k < N; k++) { const kk = eco ? k * 4 : k, dk = dt * (1 + HYPER_D[kk] * D + e2 * (kk - 4) * 0.3); p[k] += dk; if (p[k] >= 1) p[k] -= 1; const o = 2 * p[k] - 1 - blep(p[k], dk); s += o; if (kk & 1) sd += o; else sd -= o; }
        if (p_oct2) { const d2 = dt * 2.003; v.pa[0] += d2; if (v.pa[0] >= 1) v.pa[0] -= 1; s += (2 * v.pa[0] - 1 - blep(v.pa[0], d2)) * 1.5 * p_oct2; }
        y = s * (eco ? 0.3 : 0.16); side = sd * 0.16 * wide; }
      else if (m === 31) { // va: osc 1 + osc 2 (detune / octave), hard sync, ring, cross-mod
        const p = v.ph, syncR = 1 + p_sync * (3 + 4 * fenv); let d1 = dt * (1 + p_xmod * 0.5 * (p[2] < 0.5 ? 1 : -1)), d2 = dt * r2 * syncR;
        if (d1 < 0) d1 = 0; p[0] += d1; let wrapped = false; if (p[0] >= 1) { p[0] -= 1; wrapped = true; } p[1] += d2; if (p[1] >= 1) p[1] -= 1; if (p_sync > 0 && wrapped) p[1] = p[0] * r2 * syncR; p[2] = p[1];
        const a = vaOsc(p_osc1 | 0, p[0], d1, p_pw), b = vaOsc(p_osc2 | 0, p[1], d2, p_pw); y = (a * (1 - p_ring * 0.5) + b * 0.8 + a * b * p_ring) * 0.5; side = (a - b) * 0.15 * wide; }
      else { // pluck2: the string, then the body
        const w = v.kw, i1 = (w - v.kl + 2400) % 2400, i2 = i1 === 0 ? 2399 : i1 - 1; const a = 0.5 * (v.ks[i1] + v.ks[i2]) * (0.994 + 0.0055 * p_bright);
        const ap = v.kz * a + v.apx - v.kz * v.apy; v.apx = a; v.apy = ap; v.ks[w] = ap; v.kw = w + 1 === 2400 ? 0 : w + 1; v.s2.run(ap); v.s3.run(ap); y = ap * 0.7 + (v.s2.bp * 0.6 + v.s3.bp * 0.35) * p_body; side = v.s3.bp * 0.3 * wide; }
      // the filter
      if (flt === 1 || flt === 5) y = v.lad.run(y);
      else if (flt === 2) { v.s1.run(y); y = v.s1.lp; }
      else if (flt === 3) { v.s1.run(tanh(y * 1.4)); y = tanh(v.s1.lp * 1.2); } // MS-20-style: a hot input and a saturated resonance
      else if (flt === 4) { v.s1.run(y); const mo = p_fmorph; y = mo < 0.5 ? v.s1.lp * (1 - 2 * mo) + (v.s1.lp + v.s1.hp) * 2 * mo : (v.s1.lp + v.s1.hp) * (2 - 2 * mo) + v.s1.hp * (2 * mo - 1); } // SEM-style: low-pass → notch → high-pass
      else if (flt === 6) { v.s1.run(y); y = v.s1.bp * 1.6; }
      else if (flt === 7) { v.s1.run(y); v.s2.run(y); v.s3.run(y); y = (v.s1.bp + v.s2.bp * 0.6 + v.s3.bp * 0.35) * 1.4; }
      if (flt) { sideLp += (side - sideLp) * sideA; if (sideLp < 1e-20 && sideLp > -1e-20) sideLp = 0; side = sideLp; }
      // the drive
      if (dty === 4) { if (crushC-- <= 0) { crushC = (drv * 10) | 0; crushH = xDrive(4, y, drv, 0); } y = crushH; } else if (dty) y = xDrive(dty, y, drv, 0);
      dcz += (y - dcz) * dcA; y -= dcz; const g = env * outG * am, o = y * g, sg = side * g; L[i] += (o - sg) * gL; R[i] += (o + sg) * gR;
    }
    if (!alive) break;
  }
  v.env = env; v.stage = stage; v.fenv = fenv; v.fstage = fstage; v.f = f; v.lfo = lfo; v.t = tt; v.len = len; v.relFast = relFast; v.fadeIn = fadeIn; v.ag = ag; v.e1 = e1; v.e2 = e2; v.e3 = e3; v.d3 = sideLp; v.mph = dcz;
  if (!alive) { v.on = 0; v.relFast = 0; v.fadeIn = -1; } };
