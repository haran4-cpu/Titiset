/* ===================== DSP primitives ===================== */
// PolyBLEP residual for band-limited saw / square (t = phase in [0,1), dt = phase increment)
function blep(t, dt) { if (t < dt) { t /= dt; return t + t - t * t - 1; } if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; } return 0; }
// Topology-preserving-transform state-variable filter (Zavalishin). mode set per call via outputs.
class Svf {
  constructor() { this.ic1 = 0; this.ic2 = 0; this.g = 0; this.k = 1; this.a1 = 0; this.a2 = 0; this.a3 = 0; this.lp = 0; this.bp = 0; this.hp = 0; shape(this); }
  set(fc, q, sr) { fc = clamp(fc, 10, sr * 0.49); const g = Math.tan(Math.PI * fc / sr); this.g = g; this.k = 1 / Math.max(0.05, q); this.a1 = 1 / (1 + g * (g + this.k)); this.a2 = g * this.a1; this.a3 = g * this.a2; }
  run(x) { const v3 = x - this.ic2, v1 = this.a1 * this.ic1 + this.a2 * v3, v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1; this.ic2 = 2 * v2 - this.ic2; this.lp = v2; this.bp = v1; this.hp = x - this.k * v1 - v2; } // no return value: a double returned from a call V8 does not inline is boxed — a 16-byte heap object per sample per filter (measured: 560 MB of garbage per 30 s of audio). Read .lp / .bp / .hp
  reset() { this.ic1 = 0; this.ic2 = 0; }
}
// 4-pole zero-delay ladder (cascade of TPT one-poles with global feedback, tanh on input) — acid / analog bass + leads
class Ladder {
  constructor() { this.s1 = 0; this.s2 = 0; this.s3 = 0; this.s4 = 0; this.G = 0; this.g = 0; this.k = 0; this.drive = 1; shape(this); }
  set(fc, res, sr) { fc = clamp(fc, 15, sr * 0.45); const g = Math.tan(Math.PI * fc / sr); this.g = g / (1 + g); this.G = this.g * this.g * this.g * this.g; this.k = clamp(res, 0, 1) * 3.9; }
  run(x) { const g = this.g; // estimate output for the feedback path (zero-delay), then run the four stages
    const s = this.s1 * g * g * g + this.s2 * g * g + this.s3 * g + this.s4; const S = s * (1 - g) ;
    let u = (x * this.drive - this.k * (this.G * x * this.drive + S) / (1 + this.k * this.G)); u = tanh(u);
    let v = (u - this.s1) * g; let y1 = v + this.s1; this.s1 = y1 + v;
    v = (y1 - this.s2) * g; let y2 = v + this.s2; this.s2 = y2 + v;
    v = (y2 - this.s3) * g; let y3 = v + this.s3; this.s3 = y3 + v;
    v = (y3 - this.s4) * g; let y4 = v + this.s4; this.s4 = y4 + v;
    return y4 * (1 + this.k * 0.25); }
  reset() { this.s1 = this.s2 = this.s3 = this.s4 = 0; }
}
class OnePole { constructor() { this.z = 0; this.a = 0; shape(this); } set(fc, sr) { this.a = 1 - Math.exp(-TAU * fc / sr); } lp(x) { this.z += (x - this.z) * this.a; return this.z; } hp(x) { this.z += (x - this.z) * this.a; return x - this.z; } }
class DcBlock { constructor() { this.x1 = 0; this.y1 = 0; this.r = 0.9995; shape(this); } run(x) { const y = x - this.x1 + this.r * this.y1; this.x1 = x; this.y1 = y; return y; } }
// RBJ biquad (mixer EQ)
// coefficients and state live in one Float64Array: a double written to an object field per sample was measured to allocate
// a heap number (16 bytes) on every call in the running engine — 34 MB of garbage per 4 s of audio from biquads alone,
// the source of the audio-thread GC pauses. A typed array is written in place.
class Biquad {
  constructor() { this.c = new Float64Array(7); this.c[0] = 1; }
  get z1() { return this.c[5]; } get z2() { return this.c[6]; }
  set(type, f0, q, gainDb, sr) { const w = TAU * clamp(f0, 10, sr * 0.49) / sr, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q), A = Math.pow(10, gainDb / 40); let b0, b1, b2, a0, a1, a2;
    switch (type) {
      case 'lp': b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; break;
      case 'hp': b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; break;
      case 'bp': b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; break;
      case 'pk': b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; break;
      case 'ls': { const s = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) - (A - 1) * cs + s); b1 = 2 * A * ((A - 1) - (A + 1) * cs); b2 = A * ((A + 1) - (A - 1) * cs - s); a0 = (A + 1) + (A - 1) * cs + s; a1 = -2 * ((A - 1) + (A + 1) * cs); a2 = (A + 1) + (A - 1) * cs - s; break; }
      default: { const s = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) + (A - 1) * cs + s); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - s); a0 = (A + 1) - (A - 1) * cs + s; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - s; }
    }
    const c = this.c; c[0] = b0 / a0; c[1] = b1 / a0; c[2] = b2 / a0; c[3] = a1 / a0; c[4] = a2 / a0; }
  run(x) { const c = this.c, y = c[0] * x + c[5]; c[5] = c[1] * x - c[3] * y + c[6]; c[6] = c[2] * x - c[4] * y; return y; }
  reset() { this.c[5] = 0; this.c[6] = 0; }
  block(x, n) { const c = this.c, b0 = c[0], b1 = c[1], b2 = c[2], a1 = c[3], a2 = c[4]; let z1 = c[5], z2 = c[6]; for (let i = 0; i < n; i++) { const v = x[i], y = b0 * v + z1; z1 = b1 * v - a1 * y + z2; z2 = b2 * v - a2 * y; x[i] = y; } c[5] = z1; c[6] = z2; } // in place over a block: no per-sample call
}
// fractional delay line (linear interpolation)
class DelayLine {
  constructor(n) { this.b = new Float32Array(n); this.n = n; this.w = 0; shape(this); }
  push(x) { this.b[this.w] = x; this.w = this.w + 1 === this.n ? 0 : this.w + 1; }
  read(d) { let p = this.w - 1 - d; while (p < 0) p += this.n; const i = Math.floor(p), f = p - i, j = i + 1 === this.n ? 0 : i + 1; return this.b[i] + (this.b[j] - this.b[i]) * f; }
  tap(d) { let p = this.w - 1 - d; if (p < 0) p += this.n; return this.b[p]; } // integer delay, no interpolation
  clear() { this.b.fill(0); }
}
// Feedback-delay-network reverb, true stereo: each side has its own pre-delay and input diffusion (4 all-passes, different
// lengths per side) and feeds its own half of the 8 modulated lines (L → even, R → odd), Householder mixing, damping.
// Early reflections: 6 taps per side off the pre-delay, cross-fed and spread over 7…43 ms — the room is heard before the
// tail, which reads as depth instead of wash. Lows are high-passed out of the input (the tail never smears the sub).
const ER_L = [0.0071, 0.0113, 0.0171, 0.0229, 0.0313, 0.0419], ER_R = [0.0083, 0.0131, 0.0191, 0.0257, 0.0337, 0.0431], ER_G = [0.42, 0.36, 0.3, 0.24, 0.19, 0.15];
class Reverb {
  constructor(sr) {
    const k = sr / 48000; this.sr = sr; this.len = [1447, 1601, 1789, 1951, 2137, 2311, 2551, 2797].map((v) => Math.round(v * k));
    this.lines = this.len.map((l) => new DelayLine(l + 64)); this.lp = new Float32Array(8); this.mod = new Float32Array(8); this.inc = new Float32Array(8);
    for (let i = 0; i < 8; i++) { this.mod[i] = i * 0.13; this.inc[i] = (0.07 + 0.031 * i) / sr; }
    const AL = [142, 107, 379, 277], AR = [151, 113, 397, 263];
    this.ap = AL.map((d) => new DelayLine(Math.round(d * k) + 2)); this.apd = AL.map((d) => Math.round(d * k)); this.apR = AR.map((d) => new DelayLine(Math.round(d * k) + 2)); this.apdR = AR.map((d) => Math.round(d * k));
    this.pre = new DelayLine(Math.round(0.2 * sr)); this.preR = new DelayLine(Math.round(0.2 * sr)); this.preD = Math.round(0.02 * sr);
    this.erL = new Int32Array(ER_L.map((t) => Math.round(t * sr))); this.erR = new Int32Array(ER_R.map((t) => Math.round(t * sr))); this.er = 0.16;
    this.fb = 0.85; this.damp = 0.3; this.size = 0.8; this.hpL = new OnePole(); this.hpR = new OnePole(); this.hpL.set(180, sr); this.hpR.set(180, sr);
    this.o = new Float32Array(8); this.oL = new Float32Array(128); this.oR = new Float32Array(128); this.outL = 0; this.outR = 0; this.inHP = new Biquad(); this.inHP.set('hp', 220, 0.707, 0, sr); this.inHPR = new Biquad(); this.inHPR.set('hp', 220, 0.707, 0, sr); shape(this); this.setTime(2.2, 0.35);
  }
  setTime(t60, damp) { const avg = 2000 * this.sr / 48000; this.fb = clamp(Math.pow(10, -3 * avg / (t60 * this.sr)), 0, 0.97); this.damp = clamp(damp, 0, 0.95); }
  block(xL, xR, n) { const oL = this.oL, oR = this.oR; for (let i = 0; i < n; i++) { this.run(xL[i], xR[i]); oL[i] = this.outL; oR[i] = this.outR; } } // see PingPong.block
  setPre(sec) { this.preD = clamp(Math.round(sec * this.sr), 1, this.pre.n - 2 - Math.round(0.045 * this.sr)); }
  run(xl, xr) {
    let l = this.inHP.run(xl), r = this.inHPR.run(xr); this.pre.push(l); this.preR.push(r);
    let el = 0, er = 0; const pd = this.preD; for (let t = 0; t < 6; t++) { const a = this.pre.tap(pd + this.erL[t]) * ER_G[t], b = this.preR.tap(pd + this.erR[t]) * ER_G[t]; if (t & 1) { el -= a; er += b; } else { el += a; er -= b; } el += b * 0.35; er += a * 0.35; }
    l = this.pre.tap(pd); r = this.preR.tap(pd);
    for (let a = 0; a < 4; a++) { const d = this.ap[a], v = d.tap(this.apd[a] - 1), y = -0.6 * l + v; d.push(l + 0.6 * y); l = y; const dr = this.apR[a], vr = dr.tap(this.apdR[a] - 1), yr = -0.6 * r + vr; dr.push(r + 0.6 * yr); r = yr; }
    l += el * 0.2; r += er * 0.2;
    const o = this.o; let sum = 0;
    for (let i = 0; i < 8; i++) { this.mod[i] += this.inc[i]; if (this.mod[i] >= 1) this.mod[i] -= 1; const d = this.len[i] - 12 + 10 * sin1(this.mod[i]); let v = this.lines[i].read(d); this.lp[i] += (v - this.lp[i]) * (1 - this.damp); o[i] = this.lp[i]; sum += o[i]; }
    sum *= 0.25; // Householder: y_i = x_i - 2/N * sum
    for (let i = 0; i < 8; i++) this.lines[i].push((o[i] - sum) * this.fb + (i & 1 ? r * 0.32 : -l * 0.32));
    this.outL = this.hpL.hp(o[0] + o[2] + o[4] + o[6] + el * this.er) * 0.4; this.outR = this.hpR.hp(o[1] + o[3] + o[5] + o[7] + er * this.er) * 0.4;
  }
  clear() { for (const l of this.lines) l.clear(); for (const a of this.ap) a.clear(); for (const a of this.apR) a.clear(); this.pre.clear(); this.preR.clear(); this.lp.fill(0); }
}
// tempo-synced stereo ping-pong delay with filtered feedback
class PingPong {
  constructor(sr) { this.sr = sr; this.l = new DelayLine(Math.round(sr * 2.1)); this.r = new DelayLine(Math.round(sr * 2.1)); this.d = sr * 0.375; this.dS = sr * 0.375; this.fb = 0.45; this.hp = new OnePole(); this.lp = new OnePole(); this.hp.set(250, sr); this.lp.set(5500, sr); this.oL = new Float32Array(128); this.oR = new Float32Array(128); this.outL = 0; this.outR = 0; shape(this); }
  setTime(sec) { this.d = clamp(sec * this.sr, 64, this.l.n - 4); }
  run(xl, xr) { this.dS += (this.d - this.dS) * 0.0005; const a = this.l.read(this.dS), b = this.r.read(this.dS);
    const fbv = this.lp.lp(this.hp.hp(b)) * this.fb; this.l.push((xl + xr) * 0.5 + fbv); this.r.push(a * this.fb + 0.0); this.outL = a; this.outR = b; }
  clear() { this.l.clear(); this.r.clear(); }
  // block form: the per-sample run() is inlined here, so its double arguments are never boxed (a per-sample call from another
  // function boxed both arguments: 16 bytes × 2 per sample)
  block(xL, xR, n) { const oL = this.oL, oR = this.oR; for (let i = 0; i < n; i++) { this.run(xL[i], xR[i]); oL[i] = this.outL; oR[i] = this.outR; } }
}
// stereo chorus (pads / ensembles)
class Chorus {
  constructor(sr) { this.sr = sr; this.dl = new DelayLine(Math.round(sr * 0.05)); this.dr = new DelayLine(Math.round(sr * 0.05)); this.ph = 0; this.inc = 0.6 / sr; this.depth = 0.003; this.outL = 0; this.outR = 0; shape(this); }
  run(xl, xr) { this.ph += this.inc; if (this.ph >= 1) this.ph -= 1; const b = 0.012 * this.sr, dp = this.depth * this.sr; this.dl.push(xl); this.dr.push(xr);
    this.outL = this.dl.read(b + dp * sin1(this.ph)); this.outR = this.dr.read(b + dp * sin1(this.ph + 0.25)); }
}
// compressor gain computer (feed-forward, soft knee, log domain). The detector peak is collected per sample, the
// log-domain gain is computed at control rate (every 8 samples) and the linear gain is ramped between frames.
class Comp {
  constructor(sr) { this.sr = sr; this.env = 0; this.at = 0; this.rl = 0; this.thr = -18; this.ratio = 2; this.knee = 6; this.gr = 0; this.makeup = 1; this.pk = 0; this.cnt = 0; this.g = 1; this.gStep = 0; shape(this); this.set(-18, 2, 0.01, 0.15, 0); }
  set(thrDb, ratio, atk, rel, makeupDb) { this.thr = thrDb; this.ratio = ratio; this.at = expCoef(atk, this.sr / 8); this.rl = expCoef(rel, this.sr / 8); this.makeup = dbToGain(makeupDb); }
  gain(det) { if (det > this.pk) this.pk = det;
    if (++this.cnt === 8) { const x = 20 * Math.log10(this.pk + 1e-9); const over = x - this.thr; let y;
      if (over <= -this.knee / 2) y = 0; else if (over >= this.knee / 2) y = over * (1 - 1 / this.ratio); else { const t = over + this.knee / 2; y = (1 - 1 / this.ratio) * t * t / (2 * this.knee); }
      this.env = y > this.env ? y + (this.env - y) * this.at : y + (this.env - y) * this.rl; this.gr = this.env;
      const tg = Math.pow(10, -this.env / 20) * this.makeup; this.gStep = (tg - this.g) / 8; this.pk = 0; this.cnt = 0; }
    this.g += this.gStep; return this.g; }
  // stereo-linked, in place over a block (same arithmetic as gain() per sample, without a boxed return per sample)
  // (gOut, optional: the gain of every sample, for the stems export's gain curve)
  block(L, R, n, gOut) { for (let i = 0; i < n; i++) { const l = L[i], r = R[i], d = Math.max(l < 0 ? -l : l, r < 0 ? -r : r); if (d > this.pk) this.pk = d;
      if (++this.cnt === 8) { const x = 20 * Math.log10(this.pk + 1e-9); const over = x - this.thr; let y;
        if (over <= -this.knee / 2) y = 0; else if (over >= this.knee / 2) y = over * (1 - 1 / this.ratio); else { const t = over + this.knee / 2; y = (1 - 1 / this.ratio) * t * t / (2 * this.knee); }
        this.env = y > this.env ? y + (this.env - y) * this.at : y + (this.env - y) * this.rl; this.gr = this.env;
        const tg = Math.pow(10, -this.env / 20) * this.makeup; this.gStep = (tg - this.g) / 8; this.pk = 0; this.cnt = 0; }
      this.g += this.gStep; L[i] = l * this.g; R[i] = r * this.g; if (gOut) gOut[i] = this.g; } }
}
// lookahead brickwall limiter. need(n) = ceiling / true-peak estimate (4x cubic) of the incoming sample; a sliding
// minimum over L+1 samples (monotonic deque, O(1)) followed by an L-sample box average gives a gain curve that is
// guaranteed to be at or below need(m) during the whole time sample m spends leaving the L-sample delay — the attack
// is a smooth ramp that finishes exactly on the peak (no overshoot, no clipped corners). Release is a one-pole.
// TRUE-PEAK DETECTOR (ITU-R BS.1770-4 style): 4× oversampling by a Kaiser-windowed sinc polyphase interpolator, 16 taps per
// phase. run(l, r) takes the newest sample and returns the largest absolute value — at the sample and at the three points
// between it and the next — for the sample TP_D samples back (the interpolator's delay). The old cubic estimate missed
// inter-sample peaks by 0.5–1.3 dB (measured: masters reached +0.26 dBTP behind a "−1 dB" limiter).
const TP_T = 32, TP_D = 16, TP_H = (() => { const I0 = (x) => { let s = 1, t = 1; for (let k = 1; k < 25; k++) { t *= (x / 2 / k) * (x / 2 / k); s += t; } return s; }, B = 7.5, H = [];
  for (let p = 1; p < 4; p++) { const row = new Float64Array(TP_T); let sum = 0; for (let j = 0; j < TP_T; j++) { const a = TP_T - 1 - TP_D - j + p / 4, w = I0(B * Math.sqrt(Math.max(0, 1 - (a / (TP_D + 0.5)) * (a / (TP_D + 0.5))))) / I0(B); row[j] = (a === 0 ? 1 : Math.sin(Math.PI * a) / (Math.PI * a)) * w; sum += row[j]; }
    for (let j = 0; j < TP_T; j++) row[j] /= sum; H.push(row); } return H; })();
class TruePeak {
  constructor() { this.l = new Float64Array(TP_T * 2); this.r = new Float64Array(TP_T * 2); this.w = 0; shape(this); } // doubled ring: a contiguous window without modulo
  run(xl, xr) { const w = this.w, l = this.l, r = this.r; l[w] = l[w + TP_T] = xl; r[w] = r[w + TP_T] = xr; this.w = w + 1 === TP_T ? 0 : w + 1;
    const o = this.w; // window l[o … o+T-1], oldest first
    let m = Math.abs(l[o + TP_T - 1 - TP_D]); const b = Math.abs(r[o + TP_T - 1 - TP_D]); if (b > m) m = b;
    // phases ¼ and ¾ are mirror images of each other, ½ is symmetric: one pass over the window computes all three
    const h1 = TP_H[0], h2 = TP_H[1]; let a1 = 0, a3 = 0, a2 = 0, b1 = 0, b3 = 0, b2 = 0;
    for (let j = 0, k = TP_T - 1; j < TP_T / 2; j++, k--) { const lj = l[o + j], lk = l[o + k], rj = r[o + j], rk = r[o + k], c = h1[j], e = h1[k], g = h2[j];
      a1 += c * lj + e * lk; a3 += e * lj + c * lk; a2 += g * (lj + lk); b1 += c * rj + e * rk; b3 += e * rj + c * rk; b2 += g * (rj + rk); }
    if (a1 < 0) a1 = -a1; if (a3 < 0) a3 = -a3; if (a2 < 0) a2 = -a2; if (b1 < 0) b1 = -b1; if (b3 < 0) b3 = -b3; if (b2 < 0) b2 = -b2;
    if (a1 > m) m = a1; if (a2 > m) m = a2; if (a3 > m) m = a3; if (b1 > m) m = b1; if (b2 > m) m = b2; if (b3 > m) m = b3;
    return m; } }
class Limiter {
  constructor(sr) { const L = Math.round(sr * 0.005); this.L = L; this.DL = L + TP_D; this.dl = new Float32Array(L + TP_D); this.dr = new Float32Array(L + TP_D); this.w = 0; this.n = 0; this.det = new TruePeak(); this.pkPrev = 0; this.pkD = new Float32Array(L); this.pkW = 0; this.outTP = 0; // the audio waits TP_D more samples: the detector's need for sample m enters the gain curve exactly L samples before m leaves
    this.H = L + 1; this.qv = new Float32Array(this.H + 2); this.qi = new Float64Array(this.H + 2); this.qh = 0; this.qt = 0; this.cap = this.H + 2;
    this.box = new Float64Array(L); this.bi = 0; this.bsum = L; this.box.fill(1); this.g = 1;
    this.rel = 1 - Math.exp(-1 / (0.08 * sr)); this.ceil = dbToGain(-1);
    this.p1 = 0; this.p2 = 0; this.p3 = 0; this.q1 = 0; this.q2 = 0; this.q3 = 0; this.outL = 0; this.outR = 0; this.gr = 1; this.gE = 1; this.k = 0; shape(this); }
  setCeiling(db) { this.ceil = dbToGain(db); }
  block(L, R, n, gOut) { for (let i = 0; i < n; i++) { this.run(L[i], R[i]); L[i] = this.outL; R[i] = this.outR; if (gOut) gOut[i] = this.gE; } } // in place; see PingPong.block (gOut: the gain each sample left with)
  tp(x0, x1, x2, x3) { let m = x2 < 0 ? -x2 : x2; const a = -0.5 * x0 + 1.5 * x1 - 1.5 * x2 + 0.5 * x3, b = x0 - 2.5 * x1 + 2 * x2 - 0.5 * x3, c = -0.5 * x0 + 0.5 * x2;
    for (let k = 1; k < 4; k++) { const t = k / 4, y = ((a * t + b) * t + c) * t + x1; const ay = y < 0 ? -y : y; if (ay > m) m = ay; } return m; }
  run(xl, xr) {
    const pk0 = this.det.run(xl, xr), pk = pk0 > this.pkPrev ? pk0 : this.pkPrev; this.pkPrev = pk0; // an inter-sample peak lies between two samples: both must be held down
    const pw = this.pkW, pkOut = this.pkD[pw]; this.pkD[pw] = pk0; this.pkW = pw + 1 === this.L ? 0 : pw + 1; // the true peak of the sample now leaving (it was measured L samples ago)
    const need = pk > this.ceil ? this.ceil / pk : 1, cap = this.cap, n = this.n;
    while (this.qt !== this.qh) { const b = (this.qt - 1 + cap) % cap; if (this.qv[b] >= need) this.qt = b; else break; }
    this.qv[this.qt] = need; this.qi[this.qt] = n; this.qt = (this.qt + 1) % cap;
    while (this.qi[this.qh] <= n - this.H) this.qh = (this.qh + 1) % cap;
    const held = this.qv[this.qh];
    this.bsum += held - this.box[this.bi]; this.box[this.bi] = held; this.bi = this.bi + 1 === this.L ? 0 : this.bi + 1;
    if (++this.k >= 4096) { this.k = 0; let s = 0; for (let i = 0; i < this.L; i++) s += this.box[i]; this.bsum = s; } // re-sum: no float drift
    const target = this.bsum / this.L;
    if (target < this.g) this.g = target; else this.g += (target - this.g) * this.rel;
    const i = this.w, ol = this.dl[i], or = this.dr[i]; this.dl[i] = xl; this.dr[i] = xr; this.w = i + 1 === this.DL ? 0 : i + 1; this.n = n + 1;
    let yl = ol * this.g, yr = or * this.g, gE = this.g; const m = Math.max(yl < 0 ? -yl : yl, yr < 0 ? -yr : yr); let tpo = pkOut * this.g; if (m > this.ceil) { const k = this.ceil / m; yl *= k; yr *= k; tpo *= k; gE *= k; } if (tpo > this.outTP) this.outTP = tpo; // outTP: the output's true peak (read and reset by the meter)
    this.gr = this.g; this.gE = gE; this.outL = yl; this.outR = yr; }
}
