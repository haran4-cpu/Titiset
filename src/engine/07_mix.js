/* ===================== MIXER + MASTER =====================
   Deck mixer: 11 channel strips (high-pass for everything that is not kick / bass / fx, gain, mute, sends), a
   musically-shaped sidechain (kick-triggered pump curve, not a detector — it is sample-exact and never misses),
   drum-bus glue, DJ 3-band kill EQ + filter knob, fader.
   Master: shared reverb + tempo-synced ping-pong (per-deck sends), glue compressor, low-end mono (side high-pass),
   loudness gain, transient soft-clip, true-peak lookahead limiter, BS.1770 meters. */
const NCH = 11;
const CH_HP = [0, 140, 260, 160, 0, 170, 130, 190, 230, 0, 0]; // channel high-pass (Hz); 0 = none (kick, bass, fx carry the lows)
const CH_DUCK = [0, 0, 0, 0.3, 1, 1, 1, 1, 1, 0.6, 0.5]; // how much each channel follows the sidechain pump (× genre amount)
// default balance relative to the kick (dB) — overwritten by measured calibration per genre (tools/calibrate)
const BAL_DEFAULT = [0, -4, -11, -11, -2, -8, -12, -7, -10, -12, -16];

// channel character (per strip, before the fader): a transient shaper (fast/slow envelope ratio — the attack of a hit is lifted,
// the body is not) and a saturator. The saturator is level-independent: its input is normalised to the channel's own recent
// peak (1.5 s release), so `sat` sets how hard the PEAKS are driven whatever the instrument's raw level is; the small-signal
// gain stays 1 (the strip balance and calibration still hold). Algebraic sigmoid x/√(1+x²) with first-order anti-derivative anti-aliasing
// (ADAA: no fold-back fizz from the added harmonics) and a small bias for even harmonics (warmth), DC-blocked after.
// Defaults per channel × genre heat / punch (score.mix.heat, score.mix.punch; 0…2, 1 = genre default).
const CH_SAT = [0.22, 0.2, 0, 0.12, 0.45, 0.2, 0.08, 0.28, 0.18, 0, 0];
const CH_TR = [0.12, 0.45, 0.2, 0.35, 0, 0, 0, 0, 0, 0, 0];
const CH_BIAS = [0, 0, 0, 0, 0.12, 0.12, 0.1, 0.08, 0.05, 0, 0];
// parallel amount: the bass is saturated in parallel (half wet) — its harmonics come up, its waveform keeps its shape
const CH_WET = [1, 1, 1, 1, 0.5, 1, 1, 1, 1, 1, 1];
function scF(u) { return u / Math.sqrt(1 + u * u); } // algebraic sigmoid: smooth everywhere (a hard-knee clipper flattened
function scA(u) { return Math.sqrt(1 + u * u); }      // slow bass waves into plateaus with corners — measured as clicks)
// one strip's character for channel c (also used by the composer's level matching, so presets are matched as they will sound)
function stripCharacter(s, c, h, p, sr) { s.sat = clamp(CH_SAT[c] * h, 0, 1); s.bias = CH_BIAS[c] * Math.min(1, h); s.wet = CH_WET[c]; s.tr = clamp(CH_TR[c] * p, 0, 1.2);
  s.kF = 1 - Math.exp(-1 / (0.0004 * sr)); s.kFr = 1 - Math.exp(-1 / (0.045 * sr)); s.kS = 1 - Math.exp(-1 / (0.014 * sr)); s.kP = Math.exp(-1 / (1.5 * sr)); s.kL = 1 - Math.exp(-TAU * Math.min(0.45 * sr, 17000 - 9000 * s.sat) / sr); }
class Strip { constructor() { this.hpL = new Biquad(); this.hpR = new Biquad(); this.hpF = 0; this.g = 1; this.gs = 1; this.gp = 1; this.mute = 0; this.rev = 0; this.dly = 0; this.ech = 0; this.rsn = 0; this.shm = 0; this.revAdd = 0;
    this.sat = 0; this.bias = 0; this.tr = 0; this.pk = 1e-3; this.u1l = 0; this.u1r = 0; this.dcl = 0; this.dcr = 0; this.dyl = 0; this.dyr = 0; this.ef = 0; this.es = 0; this.ol = 0; this.or = 0; this.kF = 0; this.kFr = 0; this.kS = 0; this.kP = 0; this.kL = 1; this.lpl = 0; this.lpr = 0; this.ks = 1; this.wet = 1; this.trG = 1; shape(this); }
  // coefficients are set by DeckMix (sample-rate dependent): this.kF, this.kFr, this.kS, this.kP
  // channel-major block pass (high-pass, transient shaper, saturator) in place on the channel buffers; state in locals
  block(L, R, n) { const hp = this.hpF > 0, tr = this.tr, sat = this.sat; if (!hp && !tr && !sat) return;
    // a silent channel with settled filters costs nothing (most channels are silent most of the time); envelopes just decay
    if (L[0] === 0 && L[n - 1] === 0 && R[0] === 0 && Math.abs(this.lpl) + Math.abs(this.lpr) + Math.abs(this.dyl) + Math.abs(this.dyr) < 1e-7 && (!hp || Math.abs(this.hpL.z1) + Math.abs(this.hpL.z2) + Math.abs(this.hpR.z1) + Math.abs(this.hpR.z2) < 1e-9)) {
      let z = true; for (let i = 0; i < n; i++) if (L[i] !== 0 || R[i] !== 0) { z = false; break; }
      if (z) { const d = Math.pow(1 - this.kFr, n); this.ef = this.ef * d < 1e-12 ? 0 : this.ef * d; this.es = this.es * d < 1e-12 ? 0 : this.es * d; this.pk = Math.max(1e-4, this.pk * Math.pow(this.kP, n)); this.trG = 1; return; } }
    if (hp) { this.hpL.block(L, n); this.hpR.block(R, n); } if (!tr && !sat) return; // (v9.1: the high-pass as a block pass — a per-sample call per channel was 9 % of the engine with the strips)
    const wet = this.wet, kF = this.kF, kFr = this.kFr, kS = this.kS, kP = this.kP, kL = this.kL, bs = this.bias, fb = scF(bs), h = 0.45 + 1.4 * sat;
    let ef = this.ef, es = this.es, pk = this.pk, ks = this.ks, trG = this.trG, trD = 0, u1l = this.u1l, u1r = this.u1r, dcl = this.dcl, dcr = this.dcr, dyl = this.dyl, dyr = this.dyr, lpl = this.lpl, lpr = this.lpr, sA1l = scA(u1l), sA1r = scA(u1r);
    for (let i = 0; i < n; i++) { let xl = L[i], xr = R[i];
      if (tr) { const a = Math.max(xl < 0 ? -xl : xl, xr < 0 ? -xr : xr); ef += (a > ef ? kF : kFr) * (a - ef); es += (a > es ? kS : kFr) * (a - es);
        if ((i & 7) === 0) { let g = Math.pow((ef + 1e-5) / (es + 1e-5), tr); g = g < 0.7 ? 0.7 : g > 1.9 ? 1.9 : g; trD = (g - trG) / 8; } // gain at control rate (every 8 samples), ramped
        trG += trD; xl *= trG; xr *= trG; }
      if (sat) { const b = Math.max(xl < 0 ? -xl : xl, xr < 0 ? -xr : xr); pk = b > pk ? b : pk * kP; if (pk < 1e-4) pk = 1e-4;
        ks += (h / pk - ks) * 0.03; const k = ks, ul = xl * k + bs, ur = xr * k + bs, dl = ul - u1l, dr = ur - u1r, sAl = scA(ul), sAr = scA(ur);
        let yl = (dl > 1e-5 || dl < -1e-5) ? (sAl - sA1l) / dl : scF((ul + u1l) * 0.5), yr = (dr > 1e-5 || dr < -1e-5) ? (sAr - sA1r) / dr : scF((ur + u1r) * 0.5);
        u1l = ul; u1r = ur; sA1l = sAl; sA1r = sAr; yl = (yl - fb) / k; yr = (yr - fb) / k;
        if (bs) { const zl = yl - dcl + 0.9993 * dyl, zr = yr - dcr + 0.9993 * dyr; dcl = yl; dcr = yr; dyl = zl; dyr = zr; yl = zl; yr = zr; }
        lpl += (yl - lpl) * kL; lpr += (yr - lpr) * kL; xl += (lpl - xl) * wet; xr += (lpr - xr) * wet; }
      L[i] = xl; R[i] = xr; }
    this.ef = ef; this.es = es; this.pk = pk; this.ks = ks; this.trG = trG; this.u1l = u1l; this.u1r = u1r; this.dcl = dcl; this.dcr = dcr; this.dyl = dyl; this.dyr = dyr; this.lpl = lpl; this.lpr = lpr; } }
// ---- performance FX rack (per deck, after the DJ EQ / filter): sweep (LFO filter), phaser, flanger, echo (filtered 3/16 delay
// with feedback), crush, gate (grid-locked 1/16 trance gate). Tempo-synced; each fades in/out over ~20 ms (no clicks) and is
// skipped entirely while off. amt 0…1 is the one knob a controller maps.
// ---- BEAT FX (v9.3) ----
// One unit per deck (on the deck's sum, before the fader) and one per deck for a single part (the "target": the snare alone, the
// chords alone…). Every effect has On (optionally quantized to the next beat), Beat (its musical length) and Depth; some have more
// (Delay: feedback, tone in the loop, ping-pong, tape wobble; Reverb: size, damping, pre-delay, freeze; Filter: LP / HP / BP and
// resonance). The echoes and the reverb keep ringing after they are switched off until their tail has died (no cut tails).
// 0–5 keep their 9.2 names and sound at their 9.2 defaults; 'echo' is the 9.2 3/16 echo (the Color FX "Dub" uses it).
const FX_NAMES = ['sweep', 'phaser', 'flanger', 'echo', 'crush', 'gate', 'delay', 'dub', 'reverb', 'noise'];
const FX_N = FX_NAMES.length, FX_TAIL = new Uint8Array([0, 0, 0, 1, 0, 0, 1, 1, 1, 0]);
const FX_BEATS = [0.25, 0.5, 0.75, 1, 1.5, 2, 4, 8, 1 / 3, 2 / 3, 16, 32]; // Beat choices, in beats: 1/16, 1/8, 3/16, 1/4, 3/8, 1/2, 1 bar, 2 bars, 1/8T, 1/4T, 4 bars, 8 bars
const FX_BEAT0 = [8, 4, 8, 0.75, 0, 0.25, 0.75, 0.75, 0, 8]; // each effect's default Beat (0: none): 9.2's sweep 8 beats, phaser 4, flanger 8…
const FX_DEF = { fb: 0.55, tone: 0, pp: 1, wob: 0, size: 0.6, damp: 0.4, pre: 0.02, freeze: 0, type: 0, res: 0.41 }; // (res 0.41 = the 9.2 sweep's Q 2.2; until a Beat is chosen the sweep keeps its 9.2 speed from the amount)
const GATE_PAT = [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1];
const REV_LEN = [1557, 1617, 1491, 1422], REV_AP = [142, 379, 107, 277];
class DeckFX {
  constructor(sr) { this.sr = sr; const N = FX_N; this.on = new Uint8Array(N); this.pend = new Int8Array(N).fill(-1); this.amt = new Float32Array([0.6, 0.6, 0.6, 0.5, 0.5, 0.8, 0.5, 0.6, 0.45, 0.5]); this.w = new Float32Array(N);
    this.beat = Float32Array.from(FX_BEAT0); this.p = Array.from({ length: N }, () => Object.assign({}, FX_DEF)); this.tailPk = new Float32Array(N); this.tailN = new Int32Array(N); this.lastBi = -1; this.bSet = new Uint8Array(N); this.rvDirty = 1;
    this.active = 0; this.ol = 0; this.or = 0; this.bpm = 124;
    this.swL = new Svf(); this.swR = new Svf(); this.apx = new Float32Array(8); this.apy = new Float32Array(8); this.phFb = [0, 0];
    this.flL = new Float32Array(2048); this.flR = new Float32Array(2048); this.flI = 0; this.ecL = null; this.ecR = null; this.ecI = 0; this.ecHl = 0; this.ecHr = 0; this.ecLl = 0; this.ecLr = 0;
    this.crC = 0; this.crL = 0; this.crR = 0; this.gEnv = 1; this.ctl = 0;
    // delay (4 s), dub (2 s): stereo lines, the delay time glides (no zipper when Beat or the tempo moves), filters in the loop
    this.dlL = null; this.dlR = null; this.dlI = 0; this.dlD = sr * 0.3; this.dlLp = [0, 0]; this.dlHp = [0, 0]; this.dlPh = 0;
    this.dbL = null; this.dbR = null; this.dbI = 0; this.dbD = sr * 0.3; this.dbLp = [0, 0]; this.dbHp = [0, 0]; this.dbAp = new Float32Array(Math.round(sr * 0.012)); this.dbApI = 0;
    // reverb: pre-delay, two diffusers per side, a 4-line feedback delay network with damping
    const sc = sr / 44100; this.rvPre = new Float32Array(Math.round(sr * 0.12) + 1); this.rvPI = 0; this.rvAp = REV_AP.map((d) => new Float32Array(Math.round(d * sc) + 1)); this.rvApI = new Int32Array(4);
    this.rvL = REV_LEN.map((d) => new Float32Array(Math.round(d * 1.6 * sc) + 2)); this.rvI = new Int32Array(4); this.rvLen = new Int32Array(4); this.rvLp = new Float64Array(4); this.rvG = 0.8; this.rvDa = 0.3;
    this.nzS = 12345; this.nzBp = new Svf(); this.nzT = 0; this.nzK = -1; shape(this); }
  // i: the effect; on (and q: wait for the next beat); amt: Depth 0…1; beat: an index into FX_BEATS (or beats); p: its own parameters
  // beat: an index into FX_BEATS (the panel's choices); beats: a length in beats (the transitions' riser)
  set(i, on, amt, beat, p, q, beats) { if (i < 0 || i >= FX_N) return; if (amt != null) this.amt[i] = clamp(amt, 0, 1);
    if (beat != null && beat >= 0 && beat < FX_BEATS.length) { this.beat[i] = FX_BEATS[beat | 0]; this.bSet[i] = 1; } if (beats != null) { this.beat[i] = clamp(beats, 1 / 8, 64); this.bSet[i] = 1; }
    if (p && typeof p === 'object') { const P = this.p[i]; for (const k in FX_DEF) if (typeof p[k] === 'number' && Number.isFinite(p[k])) P[k] = p[k]; if (i === 8) this.rvDirty = 1; }
    if (on != null) { if (q) { this.pend[i] = on ? 1 : 0; if (!this.active) this.lastBi = NaN; } else this.flip(i, on); } this.active = 1; }
  flip(i, on) { if (on && !this.on[i] && this.w[i] < 1e-4 && this.tailN[i] <= 0) { if (i === 3 && this.ecL) { this.ecL.fill(0); this.ecR.fill(0); } if (i === 2) { this.flL.fill(0); this.flR.fill(0); } if (i === 9) this.nzT = 0; }
    if (on && i === 3 && !this.ecL) { this.ecL = new Float32Array(this.sr * 3); this.ecR = new Float32Array(this.sr * 3); } if (on && i === 6 && !this.dlL) { this.dlL = new Float32Array(this.sr * 4); this.dlR = new Float32Array(this.sr * 4); } if (on && i === 7 && !this.dbL) { this.dbL = new Float32Array(this.sr * 2); this.dbR = new Float32Array(this.sr * 2); } // (the long lines are made on first use: an analysis deck never needs them)
    this.on[i] = on ? 1 : 0; this.pend[i] = -1; if (on && FX_TAIL[i]) this.tailN[i] = 1; if (!on && i === 8 && this.p[8].freeze) { this.p[8].freeze = 0; this.rvDirty = 1; } } // (a frozen reverb thaws when switched off: its tail then dies)
  // (live engines) the long lines made up front, off the audio path: echo, delay, dub — only those this unit can use
  prealloc(echo, delay, dub) { const sr = this.sr; if (echo && !this.ecL) { this.ecL = new Float32Array(sr * 3); this.ecR = new Float32Array(sr * 3); } if (delay && !this.dlL) { this.dlL = new Float32Array(sr * 4); this.dlR = new Float32Array(sr * 4); } if (dub && !this.dbL) { this.dbL = new Float32Array(sr * 2); this.dbR = new Float32Array(sr * 2); } }
  // the time of a Beat at this tempo, in samples, inside the line
  dTime(i, cap) { return Math.min(cap - 2, Math.max(16, this.beat[i] * 60 / this.bpm * this.sr)); }
  run(xl, xr, beat) { const sr = this.sr, A = this.amt, W = this.w; let yl = xl, yr = xr, any = 0;
    if ((this.ctl & 31) === 0) { const bi = Math.floor(beat); if (bi !== this.lastBi) { const fresh = this.lastBi !== this.lastBi; this.lastBi = bi; if (!fresh) for (let k = 0; k < FX_N; k++) if (this.pend[k] >= 0) this.flip(k, this.pend[k]); } }
    for (let k = 0; k < FX_N; k++) { const tgt = this.on[k] ? 1 : 0; W[k] += (tgt - W[k]) * 0.0012; if (W[k] < 1e-4 && !tgt) { W[k] = 0; if (!FX_TAIL[k] || this.tailN[k] <= 0) { if (this.pend[k] > 0) any = 1; continue; } } any = 1; const w = W[k];
      if (k === 0) { // filter sweep: a resonant LP / HP / BP riding an LFO of Beat (9.2: 2–8 beats from the amount)
        const P = this.p[0]; if ((this.ctl & 15) === 0) { const rate = this.bSet[0] ? this.beat[0] : 8 / (1 + 3 * A[0]), ph = (beat / rate) % 1, lfo = 0.5 - 0.5 * Math.cos(TAU * ph), f = 220 * Math.pow(2, lfo * (2 + 4.5 * A[0])), q = 0.8 + 3.4 * P.res; this.swL.set(P.type === 1 ? f * 3 : f, q, sr); this.swR.set(P.type === 1 ? f * 3 : f, q, sr); }
        this.swL.run(yl); this.swR.run(yr); const t = P.type, ol = t === 1 ? this.swL.hp : t === 2 ? this.swL.bp * 1.6 : this.swL.lp, or = t === 1 ? this.swR.hp : t === 2 ? this.swR.bp * 1.6 : this.swR.lp; yl += (ol - yl) * w; yr += (or - yr) * w; }
      else if (k === 1) { // phaser: 4 first-order all-passes swept 250 Hz … 3 kHz over Beat, feedback
        const ph = (beat / this.beat[1]) % 1, f = 250 * Math.pow(12, 0.5 - 0.5 * Math.cos(TAU * ph)), t = Math.tan(Math.PI * f / sr), a = (t - 1) / (t + 1), fb = 0.35 + 0.45 * A[1];
        let l = yl + this.phFb[0] * fb, r = yr + this.phFb[1] * fb; for (let st = 0; st < 4; st++) { const ol = a * l + this.apx[st] - a * this.apy[st]; this.apx[st] = l; this.apy[st] = ol; l = ol; const or2 = a * r + this.apx[4 + st] - a * this.apy[4 + st]; this.apx[4 + st] = r; this.apy[4 + st] = or2; r = or2; }
        this.phFb[0] = l; this.phFb[1] = r; yl += ((yl + l) * 0.5 - yl) * w; yr += ((yr + r) * 0.5 - yr) * w; }
      else if (k === 2) { // flanger: 0.5–4.5 ms modulated delay over Beat, feedback
        const ph = (beat / this.beat[2]) % 1, d = (0.0005 + 0.004 * (0.5 - 0.5 * Math.cos(TAU * ph))) * sr, fb = 0.3 + 0.5 * A[2], i0 = this.flI, rp = i0 - d, ri = Math.floor(rp), fr = rp - ri, m = 2047;
        const dl = this.flL[ri & m] * (1 - fr) + this.flL[(ri + 1) & m] * fr, dr = this.flR[ri & m] * (1 - fr) + this.flR[(ri + 1) & m] * fr; this.flL[i0 & m] = yl + dl * fb; this.flR[i0 & m] = yr + dr * fb; this.flI = (i0 + 1) & m;
        yl += ((yl + dl) * 0.5 - yl) * w; yr += ((yr + dr) * 0.5 - yr) * w; }
      else if (k === 3) { // echo (9.2): ping-pong of Beat (3/16), feedback 0.35–0.75 through a band-pass loop (it darkens as it repeats)
        const n = this.ecL.length, d = Math.min(n - 1, Math.round(this.beat[3] * 60 / this.bpm * sr)), ri = (this.ecI - d + n) % n, fb = 0.35 + 0.4 * A[3];
        let el = this.ecR[ri], er = this.ecL[ri]; this.ecHl += (el - this.ecHl) * 0.02; this.ecHr += (er - this.ecHr) * 0.02; el -= this.ecHl; er -= this.ecHr; this.ecLl += (el - this.ecLl) * 0.45; this.ecLr += (er - this.ecLr) * 0.45; el = this.ecLl; er = this.ecLr;
        this.ecL[this.ecI] = yl * w + el * fb; this.ecR[this.ecI] = yr * w + er * fb; this.ecI = (this.ecI + 1) % n; yl += el * 0.8; yr += er * 0.8; this.tail(k, el, er); }
      else if (k === 4) { // crush: sample-rate reduction + bit depth
        const hold = 1 + Math.floor(A[4] * 14), q = Math.pow(2, 12 - 8 * A[4]); if (this.crC-- <= 0) { this.crC = hold - 1; this.crL = Math.round(yl * q) / q; this.crR = Math.round(yr * q) / q; } yl += (this.crL - yl) * w; yr += (this.crR - yr) * w; }
      else if (k === 5) { // gate / trans: grid-locked chops of Beat (9.2: the 1/16 pattern), 2 ms edges
        const b = this.beat[5], st = Math.floor(beat / b), tgt = b <= 0.25 ? (GATE_PAT[st & 15] ? 1 : 1 - A[5]) : ((beat / b) % 1 < 0.5 ? 1 : 1 - A[5]); this.gEnv += (tgt - this.gEnv) * 0.012; const g = 1 + (this.gEnv - 1) * w; yl *= g; yr *= g; }
      else if (k === 6) { // DELAY: Beat (1/16 … 2 bars, dotted, triplets), feedback, tone in the loop (dark ← 0 → thin), ping-pong, tape wobble
        const P = this.p[6], L = this.dlL, R = this.dlR, n = L.length, tgtD = this.dTime(6, n); this.dlD += (tgtD - this.dlD) * 0.0004; this.dlPh += 0.6 / sr; if (this.dlPh > 1) this.dlPh -= 1;
        const d = this.dlD * (1 + P.wob * 0.004 * Math.sin(TAU * this.dlPh) + P.wob * 0.0015 * Math.sin(TAU * this.dlPh * 2.7)), rp = this.dlI - d + n, ri = Math.floor(rp), fr = rp - ri, i0 = ri % n, i1 = (ri + 1) % n;
        let el = L[i0] + (L[i1] - L[i0]) * fr, er = R[i0] + (R[i1] - R[i0]) * fr; const tn = P.tone, lpA = tn < 0 ? 0.05 + 0.9 * Math.pow(1 + tn, 2) : 0.95, hpA = tn > 0 ? 0.002 + 0.08 * tn * tn : 0.002;
        this.dlLp[0] += (el - this.dlLp[0]) * lpA; this.dlLp[1] += (er - this.dlLp[1]) * lpA; el = this.dlLp[0]; er = this.dlLp[1]; this.dlHp[0] += (el - this.dlHp[0]) * hpA; this.dlHp[1] += (er - this.dlHp[1]) * hpA; el -= this.dlHp[0]; er -= this.dlHp[1];
        const fb = clamp(P.fb, 0, 0.95), il = (P.pp ? (xl + xr) * 0.5 : xl) * w, ir = P.pp ? 0 : xr * w;
        L[this.dlI] = il + (P.pp ? er : el) * fb; R[this.dlI] = ir + (P.pp ? el : er) * fb; this.dlI = (this.dlI + 1) % n; const g = 0.3 + 0.9 * A[6]; yl += el * g; yr += er * g; this.tail(k, el, er); }
      else if (k === 7) { // DUB ECHO: a dark, saturating loop with a little spring smear; Depth pushes the feedback to the edge of runaway
        const L = this.dbL, R = this.dbR, n = L.length, tgtD = this.dTime(7, n); this.dbD += (tgtD - this.dbD) * 0.0004; const rp = this.dbI - this.dbD + n, ri = Math.floor(rp), fr = rp - ri, i0 = ri % n, i1 = (ri + 1) % n;
        let el = L[i0] + (L[i1] - L[i0]) * fr, er = R[i0] + (R[i1] - R[i0]) * fr; this.dbLp[0] += (el - this.dbLp[0]) * 0.18; this.dbLp[1] += (er - this.dbLp[1]) * 0.18; el = this.dbLp[0]; er = this.dbLp[1];
        this.dbHp[0] += (el - this.dbHp[0]) * 0.012; this.dbHp[1] += (er - this.dbHp[1]) * 0.012; el -= this.dbHp[0]; er -= this.dbHp[1];
        const ap = this.dbAp, aj = this.dbApI, ao = ap[aj], av = el + ao * 0.5; ap[aj] = av; el = ao - av * 0.5; this.dbApI = (aj + 1) % ap.length;
        const fb = 0.55 + 0.47 * A[7]; L[this.dbI] = Math.tanh((xl + xr) * 0.5 * w + er * fb); R[this.dbI] = Math.tanh(el * fb); this.dbI = (this.dbI + 1) % n; yl += el * 0.9; yr += er * 0.9; this.tail(k, el, er); }
      else if (k === 8) { // REVERB: pre-delay, diffusion, 4-line FDN; Beat sets nothing; size, damping, freeze
        const P = this.p[8]; if (this.rvDirty) this.revCfg(P);
        const pre = this.rvPre, pn = pre.length, pd = Math.min(pn - 1, Math.round(clamp(P.pre, 0, 0.1) * sr)), inp = P.freeze ? 0 : (xl + xr) * 0.5 * w; pre[this.rvPI] = inp; let x = pre[(this.rvPI - pd + pn) % pn]; this.rvPI = (this.rvPI + 1) % pn;
        for (let a = 0; a < 2; a++) { const b = this.rvAp[a], j = this.rvApI[a], o = b[j], v = x + o * 0.6; b[j] = v; x = o - v * 0.6; this.rvApI[a] = (j + 1) % b.length; }
        const Ls = this.rvL, I = this.rvI, Ln = this.rvLen, lp = this.rvLp, da = this.rvDa, g = this.rvG; const o0 = Ls[0][I[0]], o1 = Ls[1][I[1]], o2 = Ls[2][I[2]], o3 = Ls[3][I[3]];
        lp[0] += (o0 - lp[0]) * da; lp[1] += (o1 - lp[1]) * da; lp[2] += (o2 - lp[2]) * da; lp[3] += (o3 - lp[3]) * da; const a0 = lp[0], a1 = lp[1], a2 = lp[2], a3 = lp[3];
        const h0 = (a0 + a1 + a2 + a3) * 0.5, h1 = (a0 - a1 + a2 - a3) * 0.5, h2 = (a0 + a1 - a2 - a3) * 0.5, h3 = (a0 - a1 - a2 + a3) * 0.5;
        Ls[0][I[0]] = x + h0 * g; Ls[1][I[1]] = x + h1 * g; Ls[2][I[2]] = h2 * g; Ls[3][I[3]] = h3 * g; for (let q = 0; q < 4; q++) { I[q]++; if (I[q] >= Ln[q]) I[q] = 0; }
        let el = o0 + o2 * 0.7, er = o1 + o3 * 0.7; const d = this.rvAp[2], dj = this.rvApI[2], dO = d[dj], dv = er + dO * 0.5; d[dj] = dv; er = dO - dv * 0.5; this.rvApI[2] = (dj + 1) % d.length;
        const gw = 0.9 * A[8]; yl += el * gw; yr += er * gw; this.tail(k, el, er); }
      else { // NOISE SWEEP: band-passed noise rising over Beat (4 … 32 beats), then holding at the top; Depth = its level
        let s = this.nzS; s = (Math.imul(s, 1664525) + 1013904223) | 0; this.nzS = s; const nz = s / 2147483648, u = this.nzK >= 0 ? this.nzK : Math.min(1, this.nzT / (this.beat[9] * 60 / this.bpm * sr)); this.nzT++; /* (nzK: the Color FX knob holds the sweep where it is turned) */
        if ((this.ctl & 15) === 0) this.nzBp.set(300 * Math.pow(40, u), 1.4 + 2 * u, sr); this.nzBp.run(nz); const v = this.nzBp.bp * (0.25 + 0.75 * u) * A[9] * 0.5 * w; yl += v; yr += v; } }
    this.ctl++; this.ol = yl; this.or = yr; if (!any) this.active = 0; }
  // a tail effect runs on after it is switched off while its tail is audible (peak over 4096 samples above −100 dBFS)
  tail(k, el, er) { const a = Math.max(el < 0 ? -el : el, er < 0 ? -er : er); if (a > this.tailPk[k]) this.tailPk[k] = a; if (++this.tailN[k] >= 4096) { this.tailN[k] = this.on[k] || this.tailPk[k] > 1e-5 ? 1 : 0; this.tailPk[k] = 0; if (!this.tailN[k]) this.clearTail(k); } }
  clearTail(k) { if (k === 6 && this.dlL) { this.dlL.fill(0); this.dlR.fill(0); } else if (k === 7 && this.dbL) { this.dbL.fill(0); this.dbR.fill(0); } else if (k === 8) { for (const b of this.rvL) b.fill(0); this.rvLp.fill(0); } }
  revCfg(P) { const sc = this.sr / 44100, sz = clamp(P.size, 0, 1); for (let q = 0; q < 4; q++) { this.rvLen[q] = Math.max(8, Math.min(this.rvL[q].length - 1, Math.round(REV_LEN[q] * (0.45 + 1.1 * sz) * sc))); if (this.rvI[q] >= this.rvLen[q]) this.rvI[q] = 0; }
    const t60 = 0.4 + 7 * sz * sz, avg = (this.rvLen[0] + this.rvLen[1] + this.rvLen[2] + this.rvLen[3]) / 4; this.rvG = P.freeze ? 1 : Math.pow(10, -3 * avg / (t60 * this.sr)); this.rvDa = P.freeze ? 1 : 0.85 - 0.75 * clamp(P.damp, 0, 1); this.rvDirty = 0; }
}
class DeckMix {
  constructor(sr) { this.sr = sr; this.s = Array.from({ length: NCH }, () => new Strip()); this.bufL = Array.from({ length: NCH }, () => new Float32Array(128)); this.bufR = Array.from({ length: NCH }, () => new Float32Array(128));
    this.scDepth = 0.4; this.bassDuck = 0; this.scLen = 1; this.scT = 1e9; this.scPend = -1; this.bpm = 124; this.pfxs = new Array(NCH).fill(null); /* (v10) a Beat FX unit per part, made on first use: an effect on the bass keeps running while you set one on the chords */ this.mangleP = new Array(NCH).fill(null); /* (v10) and a Mangle unit per part */ this.tfx = new DeckFX(sr); this.txg = new Float32Array(NCH).fill(1); this.ug = new Float32Array(NCH).fill(1); this.ul = new Float32Array(NCH).fill(1); this.hpMul = new Float32Array(NCH).fill(1); this.uTr = new Float32Array(NCH); this.uSat = new Float32Array(NCH); this.cfx = new DeckFX(sr); this.colorKind = 'filter'; this.drumComp = new Comp(sr); this.drumComp.set(-14, 2, 0.008, 0.12, 1); this.pumpA = new Float64Array(128); for (const k of ['adL', 'adR', 'abL', 'abR', 'amL', 'amR', 'hbL', 'hbR', 'arL', 'arR', 'asL', 'asR']) this[k] = new Float64Array(128); this.choHot = 0; this.eqHot = 0; /* (v9.1) the mixer's buses, summed in doubles */ this.heat = 1; this.punch = 1; this.eco = 0;
    this.eqLowL = new Biquad(); this.eqLowR = new Biquad(); this.eqMidL = new Biquad(); this.eqMidR = new Biquad(); this.eqHiL = new Biquad(); this.eqHiR = new Biquad(); this.filtL = new Svf(); this.filtR = new Svf();
    this.low = 0; this.mid = 0; this.high = 0; this.lowS = 0; this.midS = 0; this.highS = 0; this.filter = 0; this.filterS = 0; this.fader = 1; this.faderS = 1; this.user = 1; this.userS = 1; this.trimS = 1; this.autoHP = 0; this.revBoost = 1; this.trim = 1; this.throwT = 0; this.secDb = 0; this.secG = 1; this.secS = 1; this.secK = 0.0002; this.dfx = new DeckFX(sr); this.beat0 = 0; this.eg = new Float32Array(NCH).fill(1); this.tone = null; this.tq = [new Biquad(), new Biquad(), new Biquad(), new Biquad(), new Biquad(), new Biquad(), new Biquad(), new Biquad()]; this.sideHP = new Biquad(); this.wideG = 0;
    this.outL = new Float32Array(128); this.outR = new Float32Array(128); this.preL = new Float32Array(128); this.preR = new Float32Array(128); this.revL = new Float32Array(128); this.revR = new Float32Array(128); this.dlyL = new Float32Array(128); this.dlyR = new Float32Array(128);
    this.echoBase = 0; this.peak = new Float32Array(NCH); this.cap = null; this.capI = 0; this.echo = new HarmonicEcho(sr); this.reso = new ChordResonator(sr); this.shim = new Shimmer(sr); this.motion = new MotionInsert(sr); this.mangle = new Mangler(sr); this.eL = new Float32Array(128); this.eR = new Float32Array(128); this.zL = new Float32Array(128); this.zR = new Float32Array(128); this.hL = new Float32Array(128); this.hR = new Float32Array(128); this.anySend = 0; this.cho = new Chorus(sr); this.cho.depth = 0.0025; this.choMix = 0.4; this.choHL = new Biquad(); this.choHR = new Biquad(); this.choHL.set('hp', 250, 0.707, 0, sr); this.choHR.set('hp', 250, 0.707, 0, sr); shape(this); this.setEq(); for (let c = 0; c < NCH; c++) this.setHP(c, CH_HP[c]); this.setBalance(BAL_DEFAULT, 0); }
  setHP(c, f) { const s = this.s[c]; if (Math.abs(f - s.hpF) < 0.5) return; s.hpF = f; if (f > 0) { s.hpL.set('hp', f, 0.707, 0, this.sr); s.hpR.set('hp', f, 0.707, 0, this.sr); } }
  setBalance(db, trimDb) { for (let c = 0; c < NCH; c++) this.s[c].g = dbToGain(db[c]); this.trim = dbToGain(trimDb || 0); }
  // Echo knob (mix.echo): 0…1 the return of what the score sends to the harmonic echo, 1…2 also sends the music parts in (it works on any track)
  setSends(mix) { for (let c = 0; c < NCH; c++) { const s = this.s[c]; s.rev = 0; s.dly = 0; }
    const v = mix.verb, d = mix.delay, dv = mix.drumVerb != null ? mix.drumVerb : 1; const S = this.s; S[1].rev = v * 0.9 * dv; S[2].rev = v * 0.3 * dv; S[3].rev = v * 0.7 * dv; /* drumVerb: the family's drums stay drier (dnb, breaks, techno, bass music) */ S[5].rev = v * 1.2; S[6].rev = v * 1.6; S[7].rev = v * 1.3; S[8].rev = v * 1.4; S[9].rev = v * 1.8; S[10].rev = v * 0.6;
    S[5].dly = d * 0.6; S[7].dly = d * 1.2; S[8].dly = d * 1.1; S[3].dly = d * 0.3; S[1].dly = d * 0.15; const ea = mix.echo != null ? mix.echo : 1;
    // (v9.2) bassDuck: the genres whose bass SUSTAINS under the kick (UKG, breakbeat, dubstep, afro house, DnB, deep house) duck the
    // bass alone, deeper (0.7–0.9) — measured on 9.1, its sub sat 0.3–6 dB under the kick's first 60 ms there (13–24 dB elsewhere): the
    // two collided; the genre's pump on the other channels stays as it was
    this.bassDuck = mix.bassDuck || 0; this.echo.wet = 1.5 * Math.min(1, ea); this.echoBase = Math.max(0, ea - 1) * 0.4; this.scDepth = mix.sc; this.setCharacter(mix.heat, mix.punch); }
  // eco (CPU watchdog): the character stages are the first thing to go when the audio thread runs out of time; values are kept
  setEco(on) { this.eco = on ? 1 : 0; this.setCharacter(this.heat, this.punch); }
  setCharacter(heat, punch) { const h = heat == null ? 1 : heat, p = punch == null ? 1 : punch, sr = this.sr, on = this.eco ? 0 : 1; this.heat = h; this.punch = p;
    for (let c = 0; c < NCH; c++) { const s = this.s[c]; stripCharacter(s, c, h * on, p * on, sr); if (this.uTr && (this.uTr[c] || this.uSat[c])) { s.tr = clamp(s.tr + 0.9 * this.uTr[c], 0, 1.6); s.kS = 1 - Math.exp(-1 / ((0.014 - 0.0105 * this.uTr[c]) * sr)); s.sat = clamp(s.sat + 0.75 * this.uSat[c], 0, 1); s.kL = 1 - Math.exp(-TAU * Math.min(0.45 * sr, 17000 - 9000 * s.sat) / sr); } } } /* (v9.5) a drum's Snap and Drive knobs add to the channel's character */
  kick(off) { this.scPend = off; }
  // arrangement dynamics: the section's level relative to the drop (dB). Into a drop it lands in ~4 ms (with the impact);
  // everything else glides (quieter over ~0.2 s, louder over ~0.4 s) so a section change is a move, not a jump.
  // per-genre tone (mastering EQ, measured by tools/tone_cal.cjs): sub shelf 70 Hz, low-mid box 300 Hz, presence 3.5 kHz, air
  // shelf 8 kHz (dB), and `wide`: extra side gain above 2.5 kHz (dB) — measured before: most genres had 6–15 dB too little sub,
  // the hard ones +5–8 dB fizz, and the highs 10–20 dB narrower than modern masters
  setTone(t) { this.tone = t && (t.sub || t.box || t.pres || t.air || t.wide) ? t : null; if (!this.tone) return; const sr = this.sr, q = this.tq;
    for (let c = 0; c < 2; c++) { q[c * 4].set('ls', 70, 0.7, t.sub || 0, sr); q[c * 4 + 1].set('pk', 300, 0.9, t.box || 0, sr); q[c * 4 + 2].set('pk', 3500, 0.8, t.pres || 0, sr); q[c * 4 + 3].set('hs', 8000, 0.7, t.air || 0, sr); }
    this.sideHP.set('hp', 2500, 0.707, 0, sr); this.wideG = dbToGain(t.wide || 0) - 1; }
  setSection(db, fast) { if (Math.abs(db - this.secDb) < 0.01 && !fast) return; const g = dbToGain(db); this.secK = 1 / ((fast ? 0.004 : g < this.secS ? 0.18 : 0.38) * this.sr); this.secDb = db; this.secG = g; }
  setEq() { const sr = this.sr; this.eqLowL.set('ls', 200, 0.7, this.lowS, sr); this.eqLowR.set('ls', 200, 0.7, this.lowS, sr); this.eqMidL.set('pk', 1000, 0.6, this.midS, sr); this.eqMidR.set('pk', 1000, 0.6, this.midS, sr); this.eqHiL.set('hs', 3500, 0.7, this.highS, sr); this.eqHiR.set('hs', 3500, 0.7, this.highS, sr); }
  // n samples: channel buffers already rendered by the instruments
  // (v9.3) COLOR FX: the filter knob with a colour. Centre = off; left = low-pass side, right = high-pass side. Filter is the 9.2
  // filter; Dub, Space, Noise and Crush add their effect by how far the knob is turned, with a gentler filter under it.
  setColor(kind, v) { const C = { dub: 7, space: 8, noise: 9, crush: 4 }, X = this.cfx; if (kind && kind !== this.colorKind) { const o = C[this.colorKind]; if (o != null) X.set(o, false); if (this.colorKind === 'noise') X.nzK = -1; this.colorKind = kind; }
    if (v == null) return; v = clamp(v, -1, 1); const a = Math.abs(v), k = C[this.colorKind]; this.filter = this.colorKind === 'filter' || k == null ? v : v * 0.55;
    if (k != null) { const on = a > 0.03; X.set(k, on, k === 7 ? a * 0.8 : a, k === 7 ? 2 : null); if (k === 9 && on) X.nzK = a; if (k === 8) { X.p[8].size = 0.4 + 0.5 * a; X.rvDirty = 1; } } } /* (Noise holds the knob's sweep while it fades out) */
  mix(n) {
    const S = this.s, sr = this.sr, beat = 60 / this.bpm, scR = Math.max(0.06, beat * 0.42) * sr, scA = 0.002 * sr, depth = this.scDepth;
    // smoothed DJ controls (per block)
    let eqDirty = false; const sm = (cur, tgt) => { const d = tgt - cur; if (Math.abs(d) < 0.05) return tgt; eqDirty = true; return cur + d * 0.25; };
    this.lowS = sm(this.lowS, this.low); this.midS = sm(this.midS, this.mid); this.highS = sm(this.highS, this.high); if (eqDirty) this.setEq();
    this.filterS += (this.filter - this.filterS) * 0.2; const fa = this.filterS;
    if (fa < -0.02) { const f = 20000 * Math.pow(0.012, -fa); this.filtL.set(f, 0.9, sr); this.filtR.set(f, 0.9, sr); } else if (fa > 0.02) { const f = 20 * Math.pow(250, fa); this.filtL.set(f, 0.9, sr); this.filtR.set(f, 0.9, sr); }
    // a channel's gain (its mute, its layer level, the energy macro) moves 35 % of the way per block, and (v9.2) as a ramp INSIDE the
    // block from where it stood (gp) to where it goes (gs): stepped once per block, a mute clicked (a 35 % step on a bass note)
    for (let c = 0; c < NCH; c++) { const s = S[c]; s.gp = s.gs; s.gs += ((s.mute ? 0 : s.g * this.eg[c] * this.txg[c] * this.ug[c] * this.ul[c]) - s.gs) * 0.35; if (c >= 5 && c <= 8 || c === 2 || c === 3 || c === 1) this.setHP(c, Math.max(CH_HP[c] * this.hpMul[c], c >= 5 && c <= 8 ? this.autoHP : this.autoHP * 0.35)); }
    const oL = this.outL, oR = this.outR, rL = this.revL, rR = this.revR, dL = this.dlyL, dR = this.dlyR, rb = this.revBoost;
    const EL = this.eL, ER = this.eR, ZL = this.zL, ZR = this.zR, HL = this.hL, HR = this.hR; let snd = 0; for (let c = 0; c < NCH; c++) if (S[c].ech || S[c].rsn || S[c].shm) { snd = 1; break; }
    if (snd || this.anySend) { EL.fill(0, 0, n); ER.fill(0, 0, n); ZL.fill(0, 0, n); ZR.fill(0, 0, n); HL.fill(0, 0, n); HR.fill(0, 0, n); } this.anySend = snd;
    { const G = this.mangle; if (G.hL) { G.bpm = this.bpm; G.mask = this.reso.mask; G.root = this.reso.root; if (G.target >= 0 && G.target < NCH) G.block(this.bufL[G.target], this.bufR[G.target], n, this.beat0); } } // (v9.5) MANGLE on one part
    for (let c = 0; c < NCH; c++) { const G = this.mangleP[c]; if (!G || !G.hL) continue; G.bpm = this.bpm; G.mask = this.reso.mask; G.root = this.reso.root; G.block(this.bufL[c], this.bufR[c], n, this.beat0); } // (v10) MANGLE on every part that has a unit
    for (let c = 0; c < NCH; c++) { const X = this.pfxs[c]; if (!X || !X.active) continue; const bL = this.bufL[c], bR = this.bufR[c], b0 = this.beat0, bi = this.bpm / 60 / sr; X.bpm = this.bpm; for (let i = 0; i < n; i++) { X.run(bL[i], bR[i], b0 + i * bi); bL[i] = X.ol; bR[i] = X.or; } } // (v9.3) Beat FX on a part — (v10) on every part that has one
    for (let c = 0; c < NCH; c++) S[c].block(this.bufL[c], this.bufR[c], n);
    // (v9.1) CHANNEL-MAJOR: each channel in one pass over the block — its gain, duck, sends and bus in locals — into buses summed in
    // doubles in the same order as before (channel by channel), so the result is the same; a silent channel costs one comparison
    // per sample. Before, every sample walked all 11 channels re-reading a dozen fields of each: the mixer was a third of the engine.
    const PU = this.pumpA, AdL = this.adL, AdR = this.adR, AbL = this.abL, AbR = this.abR, AmL = this.amL, AmR = this.amR, AhL = this.hbL, AhR = this.hbR, ArL = this.arL, ArR = this.arR, AsL = this.asL, AsR = this.asR, thr0 = Math.min(n, this.throwT);
    { let scT = this.scT, scPend = this.scPend; for (let i = 0; i < n; i++) { if (scPend === i) { scT = 0; scPend = -1; } const t = scT++; let pump = 0; if (t < scA) pump = t / scA; else if (t < scA + scR) { const u = 1 - (t - scA) / scR; pump = u * u; } PU[i] = pump; } this.scT = scT; this.scPend = scPend; } // the sidechain pump of this block
    AdL.fill(0, 0, n); AdR.fill(0, 0, n); AbL.fill(0, 0, n); AbR.fill(0, 0, n); AmL.fill(0, 0, n); AmR.fill(0, 0, n); AhL.fill(0, 0, n); AhR.fill(0, 0, n); ArL.fill(0, 0, n); ArR.fill(0, 0, n); AsL.fill(0, 0, n); AsR.fill(0, 0, n);
    let hAny = false; const capA = this.cap, PK = this.peak;
    for (let c = 0; c < NCH; c++) { const s = S[c], bL = this.bufL[c], bR = this.bufR[c], g0 = s.gp, gd = (s.gs - s.gp) / n, dk = c === 4 && this.bassDuck > 0 ? this.bassDuck : depth * CH_DUCK[c], rv = s.rev || s.revAdd ? (s.rev + s.revAdd) * rb : 0, dy = s.dly, ec = snd ? s.ech : 0, rs = snd ? s.rsn : 0, sh = snd ? s.shm : 0, cp = capA ? capA[c] : null;
      const tL = c <= 3 ? AdL : c === 4 ? AbL : AmL, tR = c <= 3 ? AdR : c === 4 ? AbR : AmR, harm = c === 5 || c === 6; let pk = PK[c];
      for (let i = 0; i < n; i++) { let xl = bL[i], xr = bR[i]; if (xl === 0 && xr === 0) continue;
        const g = (g0 + gd * (i + 1)) * (1 - dk * PU[i]); xl *= g; xr *= g; // (gd = 0 while the gain holds: the same product as before)
        const a = xl > 0 ? xl : -xl; if (a > pk) pk = a;
        if (cp) { cp[2 * i] = xl; cp[2 * i + 1] = xr; }
        tL[i] += xl; tR[i] += xr; if (harm) { AhL[i] += xl; AhR[i] += xr; hAny = true; }
        if (rv) { ArL[i] += xl * rv; ArR[i] += xr * rv; } if (dy) { AsL[i] += xl * dy; AsR[i] += xr * dy; }
        if (ec) { EL[i] += xl * ec; ER[i] += xr * ec; } if (rs) { ZL[i] += xl * rs; ZR[i] += xr * rs; } if (sh) { HL[i] += xl * sh; HR[i] += xr * sh; } }
      PK[c] = pk; }
    for (let i = 0; i < thr0; i++) { AsL[i] += AmL[i] * 0.9; AsR[i] += AmR[i] * 0.9; ArL[i] += AmL[i] * 0.5; ArR[i] += AmR[i] * 0.5; } this.throwT -= thr0; // delay/reverb throw (performance)
    // stereo ensemble on chords + pad (cross-fed: the left wet goes right) — width without phasey mono collapse; only above 220 Hz.
    // Its delay reads are skipped once its input has been silent for longer than its delay line (it then holds only zeros); the LFO
    // keeps turning, so the ensemble comes back exactly where it would have been
    if (!hAny && this.choHot <= 0) { const cho = this.cho, inc = cho.inc; let ph = cho.ph; for (let i = 0; i < n; i++) { ph += inc; if (ph >= 1) ph -= 1; } cho.ph = ph; }
    else { this.choHot = hAny ? 4096 : this.choHot - n; const cho = this.cho, cm = this.choMix; this.choHL.block(AhL, n); this.choHR.block(AhR, n);
      for (let i = 0; i < n; i++) { cho.run(AhL[i], AhR[i]); const wl = cho.outR * cm, wr = cho.outL * cm; AmL[i] += wl; AmR[i] += wr; if (i < thr0) { AsL[i] += wl * 0.9; AsR[i] += wr * 0.9; ArL[i] += wl * 0.5; ArR[i] += wr * 0.5; } } } // (a throw sends the ensemble too)
    // drum bus glue (gentle: the sound of the kit stays, the hits sit together) — stereo-linked, the same gain law as per sample
    this.drumComp.block(AdL, AdR, n);
    for (let i = 0; i < n; i++) { oL[i] = AdL[i] + AbL[i] + AmL[i]; oR[i] = AdR[i] + AbR[i] + AmR[i]; rL[i] = ArL[i]; rR[i] = ArR[i]; dL[i] = AsL[i]; dR[i] = AsR[i]; }
    // the harmonic FX buses return into the deck sum (before the tone EQ, the DJ EQ and the fader: the DJ's controls act on them
    // too), then the motion insert (repeat / tape / shifter) runs on everything. Idle units cost nothing.
    this.echo.bpm = this.bpm; this.motion.bpm = this.bpm; this.echo.block(EL, ER, oL, oR, n, this.beat0); if (ECO.level < 2) { this.reso.block(ZL, ZR, oL, oR, n); this.shim.block(HL, HR, oL, oR, n); } this.motion.block(oL, oR, n); { const G = this.mangle; if (G.hL && (G.target < 0 || G.target >= NCH)) G.block(oL, oR, n, this.beat0); } /* (v9.5) MANGLE on the whole deck */
    // the rest runs stage by stage over the whole block (same order, same result): measured, per-sample calls into ~14 filters
    // from this function were not inlined and every returned sample was boxed — tens of MB of garbage per second on the
    // audio thread. Block passes keep state in locals and write in place.
    if (this.tone) { const q = this.tq; for (let k = 0; k < 4; k++) { q[k].block(oL, n); q[k + 4].block(oR, n); }
      if (this.wideG) { const c = this.sideHP.c, b0 = c[0], b1 = c[1], b2 = c[2], a1 = c[3], a2 = c[4], wg = this.wideG; let z1 = c[5], z2 = c[6]; for (let i = 0; i < n; i++) { const v = (oL[i] - oR[i]) * 0.5, y = b0 * v + z1; z1 = b1 * v - a1 * y + z2; z2 = b2 * v - a2 * y; const sd = y * wg; oL[i] += sd; oR[i] -= sd; } c[5] = z1; c[6] = z2; } }
    // DJ EQ + filter knob
    const eqFlat = this.lowS === 0 && this.midS === 0 && this.highS === 0; // a flat DJ EQ is the identity: it runs only while it is turned, and for a moment after (its filters settle)
    if (!eqFlat || this.eqHot > 0) { this.eqHot = eqFlat ? this.eqHot - n : 8192; this.eqLowL.block(oL, n); this.eqMidL.block(oL, n); this.eqHiL.block(oL, n); this.eqLowR.block(oR, n); this.eqMidR.block(oR, n); this.eqHiR.block(oR, n); }
    if (fa < -0.02 || fa > 0.02) { const fL = this.filtL, fR = this.filtR, lp = fa < 0; for (let i = 0; i < n; i++) { fL.run(oL[i]); fR.run(oR[i]); oL[i] = lp ? fL.lp : fL.hp; oR[i] = lp ? fR.lp : fR.hp; } }
    if (this.cfx.active) { const X = this.cfx, b0 = this.beat0, bi = this.bpm / 60 / sr; X.bpm = this.bpm; for (let i = 0; i < n; i++) { X.run(oL[i], oR[i], b0 + i * bi); oL[i] = X.ol; oR[i] = X.or; } } // (v9.3) the Color FX
    if (this.tfx.active) { const X = this.tfx, b0 = this.beat0, bi = this.bpm / 60 / sr; X.bpm = this.bpm; for (let i = 0; i < n; i++) { X.run(oL[i], oR[i], b0 + i * bi); oL[i] = X.ol; oR[i] = X.or; } } // (v9.3) the transition's FX
    if (this.dfx.active) { const X = this.dfx, b0 = this.beat0, bi = this.bpm / 60 / sr; X.bpm = this.bpm; for (let i = 0; i < n; i++) { X.run(oL[i], oR[i], b0 + i * bi); oL[i] = X.ol; oR[i] = X.or; } }
    let faderS = this.faderS, userS = this.userS, trimS = this.trimS, secS = this.secS; const fader = this.fader, user = this.user, trim = this.trim, secG = this.secG, secK = this.secK, pL = this.preL, pR = this.preR;
    for (let i = 0; i < n; i++) { faderS += (fader - faderS) * 0.002; userS += (user - userS) * 0.002; trimS += (trim - trimS) * 0.00002; secS += (secG - secS) * secK; const pg = trimS * secS, fg = faderS * userS * pg;
      pL[i] = oL[i] * pg; pR[i] = oR[i] * pg; oL[i] *= fg; oR[i] *= fg; rL[i] *= fg; rR[i] *= fg; dL[i] *= fg; dR[i] *= fg; } // pre-fader copy = the headphone cue
    this.faderS = faderS; this.userS = userS; this.trimS = trimS; this.secS = secS;
  }
}

// ---- loudness meter (ITU-R BS.1770: K-weighting, 400 ms momentary, 3 s short-term, gated integrated) ----
class Loudness {
  constructor(sr) { this.sr = sr; this.k1L = new Biquad(); this.k1R = new Biquad(); this.k2L = new Biquad(); this.k2R = new Biquad();
    for (const b of [this.k1L, this.k1R]) b.set('hs', 1681.97, 0.7072, 3.9998, sr); for (const b of [this.k2L, this.k2R]) b.set('hp', 38.13, 0.5003, 0, sr);
    this.blk = Math.round(sr * 0.1); this.acc = 0; this.cnt = 0; this.ring = new Float64Array(30); this.ri = 0; this.nb = 0; this.momentary = -70; this.short = -70;
    this.hist = new Float64Array(6000); this.hn = 0; this.tL = new Float64Array(128); this.tR = new Float64Array(128); shape(this); }
  push(l, r) { const a = this.k2L.run(this.k1L.run(l)), b = this.k2R.run(this.k1R.run(r)); this.acc += a * a + b * b; if (++this.cnt === this.blk) this.flush(); }
  block(L, R, n) { const a = this.tL, b = this.tR; for (let i = 0; i < n; i++) { a[i] = L[i]; b[i] = R[i]; } this.k1L.block(a, n); this.k2L.block(a, n); this.k1R.block(b, n); this.k2R.block(b, n);
    let acc = this.acc, cnt = this.cnt; const blk = this.blk; for (let i = 0; i < n; i++) { acc += a[i] * a[i] + b[i] * b[i]; if (++cnt === blk) { this.acc = acc; this.cnt = cnt; this.flush(); acc = this.acc; cnt = this.cnt; } } this.acc = acc; this.cnt = cnt; }
  flush() { const ms = this.acc / this.cnt; this.acc = 0; this.cnt = 0; this.ring[this.ri] = ms; this.ri = (this.ri + 1) % 30; this.nb++;
    let m = 0; for (let k = 1; k <= 4; k++) m += this.ring[(this.ri - k + 30) % 30]; m /= 4; this.momentary = -0.691 + 10 * Math.log10(m + 1e-12);
    let s = 0; const ns = Math.min(30, this.nb); for (let k = 1; k <= ns; k++) s += this.ring[(this.ri - k + 30) % 30]; s /= ns; this.short = -0.691 + 10 * Math.log10(s + 1e-12);
    if (this.nb % 1 === 0 && this.hn < this.hist.length && this.nb >= 4) this.hist[this.hn++] = m; }
  integrated() { let s = 0, c = 0; for (let i = 0; i < this.hn; i++) { const l = -0.691 + 10 * Math.log10(this.hist[i] + 1e-12); if (l > -70) { s += this.hist[i]; c++; } } if (!c) return -70;
    const rel = -0.691 + 10 * Math.log10(s / c) - 10; s = 0; c = 0; for (let i = 0; i < this.hn; i++) { const l = -0.691 + 10 * Math.log10(this.hist[i] + 1e-12); if (l > rel && l > -70) { s += this.hist[i]; c++; } } return c ? -0.691 + 10 * Math.log10(s / c) : -70; }
  reset() { this.hn = 0; this.nb = 0; this.ring.fill(0); }
}

class Master {
  constructor(sr) { this.sr = sr; this.rev = new Reverb(sr); this.dly = new PingPong(sr); this.glue = new Comp(sr); this.glue.set(-10, 1.8, 0.02, 0.25, 0);
    this.sideHP = new Biquad(); this.sideHP.set('hp', 160, 0.541, 0, sr); this.sideHP2 = new Biquad(); this.sideHP2.set('hp', 160, 1.307, 0, sr); /* 4th-order Butterworth on the side channel */ this.lim = new Limiter(sr); this.lim.setCeiling(-1.25); /* −1.25 dB at the detector = ≤ −1.0 dBTP measured to BS.1770 (the gain moves within a peak) */ this.meter = new Loudness(sr);
    this.gain = 1; this.gainS = 1; this.dcX = 0; this.dcY = 0; this.dcR = Math.exp(-TAU * 5 / sr); /* DC blocker on the mid, 5 Hz, BEFORE the clip and the limiter: any filter after the limiter moves the bass's phase against the top and lifts the true peak (measured: +1.1 dB) */ this.clip = dbToGain(-0.2); this.tpk = 0; this.corrA = 0; this.corrB = 0; this.corrC = 0; this.gr = 1; this.delayFb = 0.38; this.sideBuf = new Float32Array(128); this.sL = new Float32Array(128); this.sR = new Float32Array(128); this.eL = new Float32Array(128); this.eR = new Float32Array(128); this.cap = null; this.rep = null; shape(this); this.rev.setTime(2.4, 0.4); this.rev.setPre(0.025); }
  setTempo(bpm) { this.dly.setTime(Math.min(2, (60 / bpm) * 0.75)); } // dotted eighth
  setSpace(t60, damp) { this.rev.setTime(t60, damp); }
  setLoudness(db) { this.gain = dbToGain(db); }
  // decks: array of DeckMix with outL/outR/revL/... already filled; out: Float32Array L, R
  run(decks, nd, L, R, n) {
    const rev = this.rev, dly = this.dly, lim = this.lim, clip = this.clip, glue = this.glue; dly.fb = this.delayFb;
    // the decks summed into the dry bus and the two send buses, then the delay and the reverb as blocks (same order per sample:
    // the delay's output feeds the reverb's input) — no per-sample calls with number arguments (each boxed two heap numbers)
    const SL = this.sL, SR = this.sR, EL = this.eL, ER = this.eR;
    for (let i = 0; i < n; i++) { let xl = 0, xr = 0, el = 0, er = 0, sl = 0, sr = 0;
      for (let k = 0; k < nd; k++) { const d = decks[k]; xl += d.outL[i]; xr += d.outR[i]; el += d.revL[i]; er += d.revR[i]; sl += d.dlyL[i]; sr += d.dlyR[i]; }
      L[i] = xl; R[i] = xr; EL[i] = el; ER[i] = er; SL[i] = sl; SR[i] = sr; }
    dly.block(SL, SR, n); const dL = dly.oL, dR = dly.oR; for (let i = 0; i < n; i++) { EL[i] += dL[i] * 0.25; ER[i] += dR[i] * 0.25; }
    rev.block(EL, ER, n); const rL = rev.oL, rR = rev.oR;
    for (let i = 0; i < n; i++) { L[i] += rL[i] + dL[i] * 0.85; R[i] += rR[i] + dR[i] * 0.85; } // the tempo delay at 0.85: measured 28–33 dB under the mix at 0.55 (heard as gone)
    const cap = this.cap; glue.block(L, R, n, cap ? cap.g : null); // glue (stereo-linked) · cap: the stems export records the gain curve the mix gets (see runReplay)
    // then stage by stage over the block (same result; no per-sample calls that box their return value)
    const sd = this.sideBuf; for (let i = 0; i < n; i++) sd[i] = (L[i] - R[i]) * 0.5; this.sideHP.block(sd, n); this.sideHP2.block(sd, n); // low-end mono: the side channel high-passed
    // the mid through a DC blocker (one pole at 5 Hz: −0.1 dB at 31 Hz): short low notes whose sub starts on the same phase every time
    // (the psy and techno rolls, the kicks) add up to a DC offset of 0.01–0.017 at the master — measured, v9 — which eats headroom.
    // The clip and the limiter leave a residue (0.004–0.005 on the psy and techno drops): what a mastering chain leaves too
    let gainS = this.gainS, dx = this.dcX, dy = this.dcY; const gain = this.gain, dr = this.dcR;
    for (let i = 0; i < n; i++) { const m0 = (L[i] + R[i]) * 0.5, m = m0 - dx + dr * dy; dx = m0; dy = m; gainS += (gain - gainS) * 0.0005; const xl = (m + sd[i]) * gainS, xr = (m - sd[i]) * gainS, yl = softClip(xl, clip), yr = softClip(xr, clip); L[i] = yl; R[i] = yr; // transient soft clip before the limiter
      if (cap) { cap.g[i] *= gainS; if (yl !== xl || yr !== xr) cap.clipAt(cap.t + i, yl / xl, yr / xr); } } // (the clip's gain on the samples it shaped — a few in a hundred, on the transients)
    if (dy < 1e-20 && dy > -1e-20) dy = 0; this.gainS = gainS; this.dcX = dx; this.dcY = dy;
    lim.block(L, R, n, cap ? cap.l : null);
    if (cap) { const t = cap.t, g1 = cap.g1, g2 = cap.g2; for (let i = 0; i < n; i++) { const j = t + i; if ((j & 7) === 0) { g1[j >> 3] = cap.g[i]; g2[j >> 3] = cap.l[i]; } } cap.t = t + n; }
    this.meter.block(L, R, n); let tpk = this.tpk, cA = this.corrA, cB = this.corrB, cC = this.corrC;
    for (let i = 0; i < n; i++) { const yl = L[i], yr = R[i]; cA += yl * yr; cB += yl * yl; cC += yr * yr; } if (lim.outTP > tpk) tpk = lim.outTP; lim.outTP = 0; // the meter shows the TRUE peak of what leaves (the limiter's own 4× measurement × its gain; it showed the sample peak)
    this.tpk = tpk; this.corrA = cA; this.corrB = cB; this.corrC = cC;
    this.gr = lim.gr;
  }
  // (v9.2, the stems export) the same bus with its dynamics REPLAYED: the glue × level curve (g1, knots every 8 samples, at the
  // time a sample enters), the soft clip's gain on the samples it shaped, and the limiter's gain (g2, at the time a sample leaves,
  // after the limiter's own delay) — what the mix itself got, recorded by run() in the mix pass. A stem through this bus comes out
  // exactly as it sits inside the mix, so the stems add up to the mix.
  runReplay(decks, nd, L, R, n) { const P = this.rep, g1 = P.g1, g2 = P.g2, t = P.t, rev = this.rev, dly = this.dly, C = P.clip; dly.fb = this.delayFb; let ck = P.ck;
    const SL = this.sL, SR = this.sR, EL = this.eL, ER = this.eR;
    for (let i = 0; i < n; i++) { let xl = 0, xr = 0, el = 0, er = 0, sl = 0, sr = 0;
      for (let k = 0; k < nd; k++) { const d = decks[k]; xl += d.outL[i]; xr += d.outR[i]; el += d.revL[i]; er += d.revR[i]; sl += d.dlyL[i]; sr += d.dlyR[i]; }
      L[i] = xl; R[i] = xr; EL[i] = el; ER[i] = er; SL[i] = sl; SR[i] = sr; }
    dly.block(SL, SR, n); const dL = dly.oL, dR = dly.oR; for (let i = 0; i < n; i++) { EL[i] += dL[i] * 0.25; ER[i] += dR[i] * 0.25; }
    rev.block(EL, ER, n); const rL = rev.oL, rR = rev.oR;
    for (let i = 0; i < n; i++) { const j = t + i, k = j >> 3, f = (j & 7) * 0.125, G = g1[k] + (g1[k + 1] - g1[k]) * f; L[i] = (L[i] + rL[i] + dL[i] * 0.85) * G; R[i] = (R[i] + rR[i] + dR[i] * 0.85) * G; }
    const sd = this.sideBuf; for (let i = 0; i < n; i++) sd[i] = (L[i] - R[i]) * 0.5; this.sideHP.block(sd, n); this.sideHP2.block(sd, n);
    let dx = this.dcX, dy = this.dcY; const dr = this.dcR, ql = P.ql, qr = P.qr, QN = ql.length; let w = P.w;
    for (let i = 0; i < n; i++) { const m0 = (L[i] + R[i]) * 0.5, m = m0 - dx + dr * dy; dx = m0; dy = m;
      let xl = m + sd[i], xr = m - sd[i]; const j0 = t + i; while (ck < C.n && C.at[ck] < j0) ck++; if (ck < C.n && C.at[ck] === j0) { xl *= C.l[ck]; xr *= C.r[ck]; } // the soft clip's gain where it shaped the mix
      const ol = ql[w], or = qr[w]; ql[w] = xl; qr[w] = xr; if (++w === QN) w = 0; // the limiter's delay
      const j = t + i, k = j >> 3, f = (j & 7) * 0.125, G = g2[k] + (g2[k + 1] - g2[k]) * f; L[i] = ol * G; R[i] = or * G; }
    if (dy < 1e-20 && dy > -1e-20) dy = 0; this.dcX = dx; this.dcY = dy; P.w = w; P.t = t + n; P.ck = ck; }
}
function softClip(x, c) { const k = c * 0.7, a = x < 0 ? -x : x; if (a <= k) return x; const over = (a - k) / (c - k); const y = over >= 1.5 ? c : k + (c - k) * (over - over * over * over * 4 / 27); return x < 0 ? -y : y; }
