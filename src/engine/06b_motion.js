/* ===================== MOTION FX — the harmonic effects rack (per deck) =====================
   Effects that know the music. The score carries the chord (pitch-class mask + root on every chord change) and the
   composer writes automation for every send and parameter, so the effects are part of the arrangement, not a filter
   over it — and the DJ can play the same units live.
   ECHO      tempo-synced stereo delay (1/16 … 1/2, dotted, triplet) with a PITCH SHIFTER in its feedback: every repeat can
             climb an octave, a fifth or a fourth (always consonant intervals) or fall an octave; band-limited loop with a
             tempo-locked filter LFO (the dub sweep), ping-pong, a little tape wow. Sends: lead, arp, chords, percussion.
   RESONATOR four comb filters TUNED TO THE CURRENT CHORD (root, third, fifth, colour tone over two octaves), re-tuned on every
             chord change: drums and noise sent here come back as harmony — the psychedelic trick of turning rhythm into
             chords. Decay and damping are automatable.
   SHIMMER   an octave-up pitch shifter inside a diffuse feedback loop: an angelic tail that rises out of pads and leads.
   MOTION    deck inserts for transitions: beat REPEAT (1/4 … 1/32, the last slice re-triggered on the grid), TAPE stop (the
             deck slows to a halt), frequency SHIFTER (a Hilbert-transform shift with feedback: the barber-pole swirl).
   All units cost nothing when nothing is sent and their tails have died. */
// ---- granular pitch shifter: two read taps sweeping through a short window, crossfaded (sin² windows) — ratio fixed per call
class PitchShift {
  constructor(sr, winMs) { this.sr = sr; this.N = 4096; this.b = new Float32Array(this.N); this.w = 0; this.W = Math.round((winMs || 60) * sr / 1000); this.ph = 0; shape(this); }
  run(x, ratio) { const N = this.N, b = this.b; b[this.w] = x; const W = this.W; this.ph += (1 - ratio) / W; if (this.ph >= 1) this.ph -= 1; else if (this.ph < 0) this.ph += 1;
    const d1 = this.ph * W + 2, p2 = this.ph + 0.5 >= 1 ? this.ph - 0.5 : this.ph + 0.5, d2 = p2 * W + 2;
    let r = this.w - d1; if (r < 0) r += N; let i = r | 0, f = r - i; const a = b[i] + (b[(i + 1) & (N - 1)] - b[i]) * f;
    r = this.w - d2; if (r < 0) r += N; i = r | 0; f = r - i; const c = b[i] + (b[(i + 1) & (N - 1)] - b[i]) * f;
    const g1 = sin1(this.ph * 0.5), g2 = sin1(p2 * 0.5); // sin windows: g1² + g2² = 1 (constant power)
    this.w = (this.w + 1) & (N - 1); return a * g1 + c * g2; }
}
const ECHO_DIV = [0.75, 0.5, 1, 1.5, 0.25, 2, 1 / 3, 2 / 3, 3]; // in beats: 3/16, 1/8, 1/4, 3/8, 1/16, 1/2, 1/8T, 1/4T, 3/4
const ECHO_PITCH = [0, 12, 7, 5, -12, 19]; // semitones per repeat: none, octave, fifth, fourth, octave down, octave+fifth
class HarmonicEcho {
  constructor(sr) { this.sr = sr; const n = Math.round(sr * 2.2); this.l = new Float32Array(n); this.r = new Float32Array(n); this.n = n; this.w = 0; this.d = sr * 0.36; this.dS = this.d;
    this.fb = 0.45; this.pitch = 0; this.div = 0; this.lfo = 0; this.bpm = 124; this.psL = new PitchShift(sr, 70); this.psR = new PitchShift(sr, 70); this.hpL = 0; this.hpR = 0; this.lpL = 0; this.lpR = 0; this.ka = 0.3; this.wow = 0; this.e = 0; this.quiet = 1e9; this.wet = 1.5; shape(this); } // wet: return level (the deck's Echo knob scales it)
  setDiv(k) { this.div = clamp(k | 0, 0, ECHO_DIV.length - 1); }
  block(xL, xR, oL, oR, n, beat0) { // xL/xR: send bus (read), oL/oR: deck sum (wet added in place)
    let inE = 0; for (let i = 0; i < n; i++) inE += xL[i] * xL[i] + xR[i] * xR[i]; if (inE > 1e-12) this.quiet = 0; else this.quiet += n; if (this.quiet > this.dS + 256 && this.e < 1e-9 && !ECO.exact) return; // idle: nothing sent, the line has played out, the tail is gone
    const sr = this.sr, N = this.n, L = this.l, R = this.r, fb = clamp(this.fb, 0, 0.92), ratio = Math.pow(2, ECHO_PITCH[clamp(this.pitch | 0, 0, ECHO_PITCH.length - 1)] / 12), shift = ratio !== 1;
    const tgt = clamp(ECHO_DIV[this.div] * 60 / this.bpm * sr, 64, N - 8); const bInc = this.bpm / 60 / sr; let e = this.e * 0.5;
    for (let i = 0; i < n; i++) { this.dS += (tgt - this.dS) * 0.0004; this.wow += 0.9 / sr; if (this.wow >= 1) this.wow -= 1; const d = this.dS * (1 + 0.0012 * sin1(this.wow));
      let rp = this.w - d; if (rp < 0) rp += N; const ri = rp | 0, fr = rp - ri, rj = ri + 1 === N ? 0 : ri + 1; let a = L[ri] + (L[rj] - L[ri]) * fr, b = R[ri] + (R[rj] - R[ri]) * fr;
      // the loop: band-limited (HP ~200 Hz, LP swept by the tempo-locked LFO), pitch-shifted, cross-fed (ping-pong)
      const lf = this.lfo ? 0.5 + 0.5 * sin1(((beat0 + i * bInc) / 4) % 1) * this.lfo : 1, ka = this.ka * (0.25 + 0.75 * lf);
      this.hpL += (a - this.hpL) * 0.028; this.hpR += (b - this.hpR) * 0.028; let fl = a - this.hpL, fr2 = b - this.hpR; this.lpL += (fl - this.lpL) * ka; this.lpR += (fr2 - this.lpR) * ka; fl = this.lpL; fr2 = this.lpR;
      if (shift) { fl = this.psL.run(fl, ratio); fr2 = this.psR.run(fr2, ratio); }
      L[this.w] = (xL[i] + xR[i]) * 0.5 + fr2 * fb; R[this.w] = fl * fb; this.w = this.w + 1 === N ? 0 : this.w + 1; // ping-pong: in on the left, the repeats cross
      const w = 0.9 * this.wet; oL[i] += a * w; oR[i] += b * w; e += a * a + b * b; }
    this.e = e / n; }
}
// four combs tuned to the chord (two per side, voiced over two octaves); a new chord re-tunes them through a 30 ms glide
class ChordResonator {
  constructor(sr) { this.sr = sr; this.N = 2048; this.b = Array.from({ length: 4 }, () => new Float32Array(2048)); this.w = 0; this.d = new Float64Array([200, 160, 134, 100]); this.dT = new Float64Array([200, 160, 134, 100]); this.z = new Float64Array(4);
    this.decay = 0.6; this.damp = 0.35; this.e = 0; this.quiet = 1e9; this.mask = 0x91; this.root = 0; shape(this); this.setChord(0x91, 0); }
  setChord(mask, root) { if (!mask) return; this.mask = mask; this.root = root; const pcs = []; for (let k = 0; k < 12; k++) if (mask & (1 << ((root + k) % 12))) pcs.push((root + k) % 12);
    const pick = [pcs[0], pcs[Math.min(2, pcs.length - 1)] ?? pcs[0], pcs[1] ?? pcs[0], pcs[pcs.length - 1]]; const base = [0, 0, 1, 1]; // root, fifth-ish, third an octave up, colour tone an octave up
    for (let v = 0; v < 4; v++) { let f = 440 * Math.pow(2, (pick[v] - 9) / 12); while (f < 98) f *= 2; while (f > 196) f /= 2; f *= base[v] ? 2 : 1; this.dT[v] = clamp(this.sr / f, 8, this.N - 4); } }
  block(xL, xR, oL, oR, n) { let inE = 0; for (let i = 0; i < n; i++) inE += xL[i] * xL[i] + xR[i] * xR[i]; if (inE > 1e-12) this.quiet = 0; else this.quiet += n; if (this.quiet > 2048 && this.e < 1e-9 && !ECO.exact) return;
    const N = this.N, g = clamp(0.8 + 0.195 * this.decay, 0, 0.995), dmp = clamp(this.damp, 0, 0.95), B = this.b, D = this.d, T = this.dT, Z = this.z; let e = this.e * 0.5;
    for (let i = 0; i < n; i++) { let yl = 0, yr = 0; const w = this.w;
      for (let v = 0; v < 4; v++) { D[v] += (T[v] - D[v]) * 0.0008; let rp = w - D[v]; if (rp < 0) rp += N; const ri = rp | 0, fr = rp - ri, bb = B[v], s = bb[ri] + (bb[(ri + 1) & (N - 1)] - bb[ri]) * fr;
        Z[v] += (s - Z[v]) * (1 - dmp); const x = (v & 1 ? xR[i] : xL[i]); bb[w] = x * 0.35 + Z[v] * g; if (v & 1) yr += Z[v]; else yl += Z[v]; }
      this.w = (w + 1) & (N - 1); yl *= 0.5; yr *= 0.5; oL[i] += yl; oR[i] += yr; e += yl * yl + yr * yr; }
    this.e = e / n; }
}
// octave-up shifter inside a diffusing feedback loop (4 all-passes + 120 ms delay, damped): the rising tail
class Shimmer {
  constructor(sr) { this.sr = sr; this.ps = new PitchShift(sr, 80); this.ap = [347, 513, 769, 1031].map((d) => ({ b: new Float32Array(2048), d: Math.round(d * sr / 48000), w: 0 })); this.N = 8192; this.dl = new Float32Array(this.N); this.w = 0; this.D = Math.round(0.12 * sr);
    this.fb = 0.62; this.lp = 0; this.e = 0; this.ph = 0; this.quiet = 1e9; shape(this); }
  block(xL, xR, oL, oR, n) { let inE = 0; for (let i = 0; i < n; i++) inE += xL[i] * xL[i] + xR[i] * xR[i]; if (inE > 1e-12) this.quiet = 0; else this.quiet += n; if (this.quiet > this.D + 4096 && this.e < 1e-9 && !ECO.exact) return;
    const N = this.N, A = this.ap, fb = clamp(this.fb, 0, 0.8); let e = this.e * 0.5;
    for (let i = 0; i < n; i++) { let rp = this.w - this.D; if (rp < 0) rp += N; const tail = this.dl[rp];
      let x = (xL[i] + xR[i]) * 0.5 + this.ps.run(tail, 2) * fb; this.lp += (x - this.lp) * 0.35; x = this.lp;
      for (let k = 0; k < 4; k++) { const a = A[k], j = (a.w - a.d + 2048) & 2047, v = a.b[j], y = -0.6 * x + v; a.b[a.w] = x + 0.6 * y; a.w = (a.w + 1) & 2047; x = y; }
      this.dl[this.w] = x; this.w = (this.w + 1) & (N - 1); this.ph += 0.13 / this.sr; if (this.ph >= 1) this.ph -= 1; const pan = 0.5 + 0.35 * sin1(this.ph); // the tail drifts across the stereo field
      oL[i] += tail * (1 - pan) * 0.9; oR[i] += tail * pan * 0.9; e += tail * tail; }
    this.e = e / n; }
}
// ---- deck inserts for transitions: beat repeat, tape stop, frequency shifter. Each fades in/out over ~6 ms.
const REPEAT_DIV = [0, 1, 0.5, 0.25, 0.125, 0.75]; // in beats: off, 1/4, 1/8, 1/16, 1/32, 3/16
// Hilbert pair (Olli Niemitalo's 4+4 all-pass approximation, 90° over ~20 Hz – 20 kHz)
const HILB_A = [0.6923878, 0.9360654322959, 0.9882295226860, 0.9987488452737], HILB_B = [0.4021921162426, 0.8561710882420, 0.9722909545651, 0.9952884791278];
class MotionInsert {
  constructor(sr) { this.sr = sr; this.N = 1 << 17; this.bL = new Float32Array(this.N); this.bR = new Float32Array(this.N); this.w = 0;
    this.rep = 0; this.repLen = 0; this.repStart = 0; this.repPos = 0; this.repG = 0; this.tape = 1; this.tapeRate = 0; this.tapeR = 0; this.tapeG = 0; this.shift = 0; this.shiftFb = 0; this.shG = 0; this.sph = 0; this.bpm = 124;
    this.hs = new Float64Array(68); this.hr = 0; this.hi = 0; this.tapePos = 0; this.fbL = 0; this.fbR = 0; this.active = 0; shape(this); }
  setRepeat(code, beat) { const div = REPEAT_DIV[clamp(code | 0, 0, REPEAT_DIV.length - 1)]; if (!div) { this.rep = 0; return; } const len = Math.round(div * 60 / this.bpm * this.sr);
    if (!this.rep || len !== this.repLen) { this.repLen = Math.min(len, this.N >> 2); this.repStart = (this.w - this.repLen + this.N) % this.N; this.repPos = 0; } this.rep = 1; this.active = 1; }
  // Hilbert pair for one channel (ch 0 / 1): two chains of 2nd-order all-passes in z⁻² (y = a²·(x + y[n−2]) − x[n−2]); the A chain is
  // delayed one sample. Writes this.hr (in phase) and this.hi (90° behind).
  hilb(x, ch) { const S = this.hs, o = ch * 34; let a = x, b = x;
    for (let k = 0; k < 4; k++) { const j = o + k * 4, c = HILB_A[k] * HILB_A[k], y = c * (a + S[j + 3]) - S[j + 1]; S[j + 1] = S[j]; S[j] = a; S[j + 3] = S[j + 2]; S[j + 2] = y; a = y; }
    for (let k = 0; k < 4; k++) { const j = o + 16 + k * 4, c = HILB_B[k] * HILB_B[k], y = c * (b + S[j + 3]) - S[j + 1]; S[j + 1] = S[j]; S[j] = b; S[j + 3] = S[j + 2]; S[j + 2] = y; b = y; }
    this.hr = S[o + 32]; S[o + 32] = a; this.hi = b; }
  block(L, R, n) { const N = this.N, bL = this.bL, bR = this.bR, sr = this.sr;
    const on = this.rep || this.tapeRate || this.tape < 0.999 || this.tapeR || this.shift !== 0 || this.repG > 1e-4 || this.tapeG > 1e-4 || this.shG > 1e-4;
    if (!on) { for (let i = 0; i < n; i++) { bL[this.w] = L[i]; bR[this.w] = R[i]; this.w = (this.w + 1) & (N - 1); } this.active = 0; this.tapeR = 0; this.tapePos = 0; return; }
    const kG = 1 / (0.006 * sr);
    for (let i = 0; i < n; i++) { const xl = L[i], xr = R[i]; bL[this.w] = xl; bR[this.w] = xr; let yl = xl, yr = xr; if (this.tapeRate) this.tape = clamp(this.tape + this.tapeRate, 0, 1);
      // beat repeat: replay the captured slice on the grid
      const rg = this.rep ? 1 : 0; this.repG += clamp(rg - this.repG, -kG, kG);
      if (this.repG > 1e-4) { const j = (this.repStart + this.repPos) % N, edge = Math.min(1, Math.min(this.repPos, this.repLen - this.repPos) / (0.002 * sr)); const sl = bL[j] * edge, sR = bR[j] * edge; this.repPos++; if (this.repPos >= this.repLen) this.repPos = 0;
        yl += (sl - yl) * this.repG; yr += (sR - yr) * this.repG; }
      // tape stop: a read head that slows down behind the write head (pitch and time fall together)
      if (this.tape < 0.999 || this.tapeR) { if (!this.tapeR) { this.tapeR = 1; this.tapePos = 0; } this.tapePos = Math.min(N - 8192, this.tapePos + 1 - this.tape); // how far the head has fallen behind
        const rp = (this.w - this.tapePos + N * 4) % N, ri = Math.floor(rp), fr = rp - ri, a = bL[ri] + (bL[(ri + 1) & (N - 1)] - bL[ri]) * fr, b = bR[ri] + (bR[(ri + 1) & (N - 1)] - bR[ri]) * fr;
        const g = this.tape < 0.03 ? this.tape / 0.03 : 1; this.tapeG += clamp(1 - this.tapeG, -kG, kG); yl = a * g; yr = b * g; if (this.tape >= 0.999) { this.tapeR = 0; this.tapeG = 0; } }
      // frequency shifter (left up, right down: the swirl), with feedback
      const sg = this.shift !== 0 ? 1 : 0; this.shG += clamp(sg - this.shG, -kG, kG);
      if (this.shG > 1e-4) { this.sph += this.shift / sr; if (this.sph >= 1) this.sph -= 1; else if (this.sph < 0) this.sph += 1; const c = sin1(this.sph + 0.25), s = sin1(this.sph), fbk = clamp(this.shiftFb, 0, 0.85);
        this.hilb(yl + this.fbL * fbk, 0); const ul = this.hr * c - this.hi * s; this.hilb(yr + this.fbR * fbk, 1); const ur = this.hr * c + this.hi * s; this.fbL = ul; this.fbR = ur;
        yl += (ul - yl) * this.shG * 0.85; yr += (ur - yr) * this.shG * 0.85; }
      L[i] = yl; R[i] = yr; this.w = (this.w + 1) & (N - 1); } }
}
