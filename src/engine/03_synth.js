/* ===================== SYNTH VOICES =====================
   One voice type, many models (selected per instrument kit). Oscillators are PolyBLEP band-limited; filters are
   zero-delay (ladder for analog bass/leads, TPT SVF for poly); envelopes are exponential ADSR. */
const SUPERSAW_DET = [-0.11002313, -0.06288439, -0.01952356, 0, 0.01991221, 0.06216538, 0.10745242];
const ORGAN_R = [0.5, 1, 1.5, 2, 3, 4, 5, 6, 8];
// unison layout per voice count: detune offsets (outer voices further out, like a modern wavetable synth) and stereo pans
const UNI_OFF = [], UNI_PAN = []; for (let U = 1; U <= 7; U++) { const o = [], p = []; for (let k = 0; k < U; k++) { const x = U === 1 ? 0 : 2 * k / (U - 1) - 1; o.push(Math.sign(x) * Math.pow(Math.abs(x), 1.4)); p.push(U === 1 ? 0 : (k % 2 ? -1 : 1) * Math.abs(x) * (0.55 + 0.45 * Math.abs(x))); } UNI_OFF.push(new Float64Array(o)); UNI_PAN.push(new Float64Array(p)); }
const PIANO_FR = [1, 2, 3, 4, 5, 6, 7, 8].map((h) => h * Math.sqrt(1 + 0.0004 * h * h)); // stretched partials (string stiffness)
const VOWELS = { a: [800, 1150, 2900], e: [400, 1600, 2700], i: [300, 2200, 3000], o: [450, 800, 2830], u: [325, 700, 2530] };
// vox: a saw through three resonant band-passes. With Q 9–13 a formant that lands on the fundamental or a strong low
// harmonic boosts it by up to 20 dB ('o' at 450 Hz under an A#4 measured +12 dB over 'a'; 'u' −5 dB), so every vocal
// chop jumped in level with the note and the vowel. Each note is normalised at trigger time: the analytic energy of a
// saw (1/n harmonics) through this exact bank at the note's pitch, against vowel 'a' at 440 Hz.
const FORMANT_Q = [9, 11, 13], FORMANT_W = [1, 0.6, 0.35];
function formantEnergy(f0, F) { let e = 0; for (let n = 1; n * f0 < 9000; n++) { const f = n * f0, a = 1 / n; let re = 0, im = 0;
    for (let i = 0; i < 3; i++) { const r = f / F[i], dr = 1 - r * r, di = r / FORMANT_Q[i], den = dr * dr + di * di; re += FORMANT_W[i] * r * di / den; im += FORMANT_W[i] * r * dr / den; } // band-pass j·r / (1 − r² + j·r/Q)
    e += a * a * (re * re + im * im); } return e; }
const FORMANT_REF = formantEnergy(440, VOWELS.a);
function formantNorm(f0, F) { return clamp(Math.sqrt(FORMANT_REF / Math.max(1e-9, formantEnergy(f0, F))), 0.2, 3); }
const MODEL = { sub: 0, b808: 1, reese: 2, acid: 3, pluck: 4, wobble: 5, fm: 6, organ: 7, log: 8, supersaw: 9, pad: 10, stab: 11, piano: 12, ep: 13, bell: 14, kspluck: 15, vox: 16, hoover: 17, screech: 18, strings: 19, brass: 20, lead: 21, saw: 22, square: 23, wt: 24 };
function dflt() { return { model: 'saw', wave: 0, detune: 0.2, voices: 1, sub: 0, cut: 2000, res: 0.2, envAmt: 0, fAtk: 0.001, fDec: 0.2, fSus: 0, aAtk: 0.002, aDec: 0.3, aSus: 0.8, aRel: 0.15, drive: 1, glide: 0.06, lfoRate: 0, lfoDepth: 0, lfoSync: 0, gain: 1, oct: 0, vowel: 'a', index: 2, ratio: 1, bright: 0.5, width: 0.5, pw: 0.5, keytrack: 0.3, pEnv: 0, pDec: 0.05, noiseAmt: 0, subPost: 0, mCut: 0, mRes: 0, lfoAmp: 0, lfoShape: 0, table: 0, pos: 0, posEnv: 0, posLfo: 0, l2Sync: 0, l2Rate: 0, l2Pitch: 0, uni: 1, spread: 0.6, fold: 0, ftype: 0, vow: 0, vowLfo: 0, mPos: 0, mLfo: 0, mLfoS: 0, tone: 1 }; } // mCut (octaves) / mRes: automation from the score; lfoAmp: tempo-locked volume LFO (0 sine · 1 gate · 2 saw)
const TONE_M = new Uint8Array(32); for (const k of ['sub', 'b808', 'organ', 'piano', 'ep', 'bell', 'kspluck', 'vox']) TONE_M[MODEL[k]] = 1; // models with no filter of their own: they get the TONE low-pass
class Voice {
  constructor(sr) { this.sr = sr; this.on = 0; this.wait = 0; this.len = 0; this.stage = 0; this.env = 0; this.fenv = 0; this.fstage = 0; this.note = 60; this.f = 220; this.ft = 220; this.vel = 1; this.age = 0; this.acc = 0;
    this.ph = new Float64Array(9); this.lad = new Ladder(); this.s1 = new Svf(); this.s2 = new Svf(); this.s3 = new Svf(); this.s4 = new Svf(); this.lfo = 0; this.t = 0; this.gl = 1; this.gr = 1; this.ks = new Float32Array(2400); this.kw = 0; this.kl = 100; this.kz = 0;
    this.mph = 0; this.mph2 = 0; this.sph = 0; this.p = null; this.m = 0; this.cut = 1000; this.pcount = 0; this.relFast = 0; this.ls = 0; this.bright = 1; this.fadeIn = -1; this.atk = 0.002; this.rel = 0.15; this.apx = 0; this.apy = 0; this.vg = 1; this.ag = 1; this.pa = new Float64Array(8); this.pd = new Float64Array(8); this.e1 = 0; this.e2 = 0; this.e3 = 0; this.d1 = 0; this.d2 = 0; this.d3 = 0; shape(this); }
}
class Synth {
  // mono: legato with glide (bass, mono leads); poly: n voices with stealing
  // voices [0, nPlay) play notes; the last two voices only carry hand-over tails: when a sounding voice must be reused
  // (mono retrigger / poly steal) its full state is copied to a tail voice that keeps playing until the new note's
  // exact sample offset and then fades in 4 ms. Nothing is ever cut at the block boundary → no clicks.
  constructor(sr, nVoices, mono) { this.sr = sr; this.mono = !!mono; this.nPlay = mono ? 1 : nVoices; this.v = Array.from({ length: this.nPlay + 2 }, () => new Voice(sr)); this.ti = 0;
    this.p = dflt(); this.m = MODEL.saw; this.bpm = 124; this.clock = 0; this.beat = 0; this.pv = 0; shape(this); wasmVoiceInit(); }
  setKit(k) { this.p = Object.assign(dflt(), k); this.m = MODEL[this.p.model] ?? MODEL.saw; }
  handover(v, off) { if (!v.on || v.env < 1e-4 && v.stage > 0) return; const t = this.v[this.nPlay + this.ti]; this.ti ^= 1; copyVoice(v, t); t.fadeIn = off; }
  trigger(off, note, vel, dur, opt) {
    const P = this.p, sr = this.sr; note += P.oct * 12; const f = mtof(note);
    let v;
    if (this.mono) { v = this.v[0]; const slide = opt && opt.slide && v.on && v.stage < 3;
      if (slide) { v.ft = f; v.len = Math.max(v.len, off + dur); v.note = note; v.acc = opt && opt.accent ? 1 : 0; if (opt && opt.lfo) v.ls = opt.lfo; return; }
      this.handover(v, off);
    } else { v = null; let best = 1e9;
      for (let i = 0; i < this.nPlay; i++) { const c = this.v[i]; if (!c.on) { v = c; break; } const score = c.env * (c.stage === 3 ? 1 : 4) - c.age * 1e-6; if (score < best) { best = score; v = c; } }
      this.handover(v, off); }
    for (let i = 0; i < this.nPlay; i++) this.v[i].age++;
    v.on = 1; v.wait = off; v.len = off + Math.max(1, dur | 0); v.stage = 0; v.env = 0; v.fenv = 0; v.fstage = 0; v.note = note; v.ft = f; v.f = (this.mono && opt && opt.from) ? mtof(opt.from + P.oct * 12) : f;
    v.vel = vel; v.age = 0; v.acc = opt && opt.accent ? 1 : 0; v.t = 0; v.p = P; v.m = this.m; v.relFast = 0; v.fadeIn = -1;
    v.ls = opt && opt.lfo ? opt.lfo : P.lfoSync; v.bright = opt && opt.bright != null ? opt.bright : 1;
    // per-sample decays as multipliers (was: Math.exp / Math.pow per partial per SAMPLE — the piano cost 8 pow + 8 exp + 8 sqrt per sample)
    const m0 = this.m; if (m0 === MODEL.piano) { const kd = P.aDec ? 0.5 / P.aDec : 1; for (let k = 0; k < 8; k++) { const h = k + 1; v.pa[k] = Math.pow(h, -1.1 - (1 - P.bright)); v.pd[k] = Math.exp(-(0.6 + h * 0.9) * kd / sr); } v.e1 = 0.08; v.d1 = Math.exp(-1 / (0.002 * sr)); }
    else if (m0 === MODEL.log) { v.e1 = 0.9; v.d1 = Math.exp(-1 / (0.018 * sr)); v.e2 = 0.35; v.d2 = Math.exp(-1 / (0.05 * sr)); v.e3 = 0.25; v.d3 = Math.exp(-1 / (0.003 * sr)); }
    else if (m0 === MODEL.ep) { v.e1 = 1.6; v.d1 = Math.exp(-1 / (0.18 * sr)); v.e2 = 0.12; v.d2 = Math.exp(-1 / (0.05 * sr)); }
    else if (m0 === MODEL.bell) { v.e1 = 1; v.d1 = Math.exp(-1 / (0.35 * sr)); }
    // envelopes follow the harmonic rhythm: attack ≤ 25 % and release ≤ 35 % of the note (a pad never smears into the next chord)
    v.atk = P.aAtk; v.rel = P.aRel; if (opt && opt.fit) { const sec = dur / sr; v.atk = Math.min(P.aAtk, 0.25 * sec); v.rel = Math.min(P.aRel, Math.max(0.08, 0.35 * sec)); }
    if (this.m === MODEL.wt && P.ftype === 4) v.ks.fill(0, 0, 2400); // comb filter memory
    for (let k = 0; k < 9; k++) v.ph[k] = this.m === MODEL.supersaw || this.m === MODEL.pad || this.m === MODEL.strings || (this.m === MODEL.wt && P.uni > 1) ? noise() * 0.5 + 0.5 : (this.m === MODEL.organ || this.m === MODEL.piano || this.m === MODEL.ep || this.m === MODEL.bell || this.m <= 1 ? 0 : 0.5); // saws start at their zero crossing (no DC step)
    v.lad.reset(); v.s1.reset(); v.s2.reset(); v.s3.reset(); v.mph = 0; v.mph2 = 0; v.sph = 0; v.lfo = 0;
    const pan = opt && opt.pan != null ? opt.pan : 0; v.gl = Math.cos((clamp(pan, -1, 1) + 1) * Math.PI / 4) * 1.414; v.gr = Math.sin((clamp(pan, -1, 1) + 1) * Math.PI / 4) * 1.414;
    if (this.m === MODEL.kspluck) { const per = clamp(sr / f, 9, 2390), Li = Math.floor(per - 0.6), dl = per - Li - 0.5; v.kl = Li; v.kz = (1 - dl) / (1 + dl); v.apx = 0; v.apy = 0; let z = 0; for (let i = 0; i <= Li + 1; i++) { z += (noise() - z) * (0.25 + 0.7 * P.bright); v.ks[i] = z; } v.kw = Li + 2; }
    if (this.m === MODEL.vox) { const F = VOWELS[(opt && opt.vowel) || P.vowel] || VOWELS.a; v.s1.set(F[0], 9, sr); v.s2.set(F[1], 11, sr); v.s3.set(F[2], 13, sr); v.vg = formantNorm(f, F); } else v.vg = 1;
    if (this.m >= X_FIRST) initX(this, v, P, f, opt); // (v9.4) the engines of 03x_engines.js
  }
  releaseAll() { for (const v of this.v) if (v.on) { v.stage = 3; v.len = 0; } }
  render(L, R, n) { const w = WV.ok && !WV.off; this.pv = (this.pv + 1) | 0; for (const v of this.v) if (v.on) { if (v.m >= X_FIRST) this.voiceX(v, L, R, n); else if (w) wasmVoice(this, v, L, R, n); else this.voice(v, L, R, n); } this.clock += n; } // the voice loop in WebAssembly when it loaded (03v_wasm.js), else in JavaScript
  voice(v, L, R, n) {
    // per-voice state lives in locals for the whole block (stored back once at the end): measured, the generic part of this
    // loop (envelopes, glide, LFO, field reads and writes) cost ~38 ns per voice-sample before a single oscillator ran
    const sr = this.sr, inv = 1 / sr, P = v.p, m = v.m;
    const aA = 1 - Math.exp(-1 / (Math.max(0.0005, v.atk) * sr)), aD = Math.exp(-1 / (Math.max(0.005, P.aDec) * sr)), aRn = Math.exp(-1 / (Math.max(0.005, v.rel) * sr)), aRf = Math.exp(-1 / (0.004 * sr));
    const fD = Math.exp(-1 / (Math.max(0.005, P.fDec) * sr)), fA = 1 - Math.exp(-1 / (Math.max(0.0005, P.fAtk) * sr)), gl = P.glide > 0 ? 1 - Math.exp(-1 / (P.glide * sr)) : 1;
    const lsync = P.mLfoS > 0 ? P.mLfoS : v.ls, lfoInc = lsync ? (this.bpm / 60) / lsync / sr : P.lfoRate / sr; // lfoSync = beats per cycle (per voice: wobble rate can change per note); the score's filter-LFO automation overrides it
    const sus = P.aSus, fSus = P.fSus, pEnv = P.pEnv, lfoAmp = P.lfoAmp, ft = v.ft, outG = v.vel * P.gain, gL = v.gl, gR = v.gr;
    let env = v.env, stage = v.stage, fenv = v.fenv, fstage = v.fstage, f = v.f, lfo = v.lfo, tt = v.t, len = v.len, relFast = v.relFast, fadeIn = v.fadeIn, ag = v.ag, alive = 1;
    let i = 0, wT = null, wA = 0, wB = 0, wFr = 0, wPm = 1, wCombD = 100, wCombG = 0;
    const toneOn = TONE_M[m] === 1 && P.tone < 0.999;
    const ssThin = ECO.level >= 2 ? 1 : 0; // eco 2 (the CPU watchdog's last step): a supersaw plays its centre and two outer saws (level-matched), not seven
    const U = m === 24 ? clamp(P.uni | 0, 1, ECO.level >= 2 ? 2 : 7) : 1, uOff = UNI_OFF[U - 1], uPan = UNI_PAN[U - 1], uDet = P.detune * 0.03, uG = 1 / Math.sqrt(U), uW = P.spread * clamp((v.note - 47) / 13, 0, 1);
    while (i < n) {
      if (v.wait > 0) { const w = Math.min(v.wait, n - i); v.wait -= w; len -= w; i += w; if (i >= n) break; }
      const end = Math.min(n, i + (fstage === 0 || tt < 256 ? 4 : 16)); // control rate: filter coefficients every 16 samples (every 4 during attacks: no zipper on fast sweeps)
      let pe = 1, dpe = 0; if (pEnv) { pe = Math.pow(2, pEnv * Math.exp(-(tt * inv) / P.pDec) / 12); dpe = (Math.pow(2, pEnv * Math.exp(-((tt + end - i) * inv) / P.pDec) / 12) - pe) / (end - i); } // pitch envelope: exact at control points, linear between (it was a pow and an exp per sample)
      // filter cutoff: base * keytrack * env + LFO
      const lfd = P.lfoDepth + P.mLfo, lph = P.mLfoS > 0 ? ((this.beat + i * this.bpm / 60 / sr) / P.mLfoS) % 1 : lfo; // the score's filter LFO is locked to the bar: every voice of a chord sweeps together, on the grid
      const kt = Math.pow(f / 261.6, P.keytrack), lf = lfd ? (m === MODEL.wobble ? 0.5 - 0.5 * Math.cos(TAU * lph) : sin1(lph)) * lfd : 0;
      let cut = P.cut * v.bright * kt * Math.pow(2, (P.envAmt * (1 + v.acc * 0.6)) * fenv + (m === MODEL.wobble ? lf * 5 - 1 : lf * 2) + P.mCut);
      cut = clamp(cut, 20, sr * 0.45); v.cut = cut;
      if (m === 24) { // wavetable: LFO 2 (tempo-locked to the bar: every voice of a chord moves together, in time), table position, filter
        let l2 = 0; if (P.l2Sync > 0) l2 = sin1(((this.beat + i * this.bpm / 60 / sr) / P.l2Sync) % 1); else if (P.l2Rate > 0) l2 = sin1((tt * inv * P.l2Rate) % 1); // free-running (Hz), from the note's start
        wPm = P.l2Pitch ? Math.pow(2, P.l2Pitch * l2 / 1200) : 1;
        const pos = clamp(P.pos + P.posEnv * fenv + P.posLfo * l2 + P.mPos, 0, 1) * (WT_F - 1), fi = Math.min(WT_F - 2, Math.floor(pos));
        wT = wtGet(P.table)[wtLevel(f * pe * wPm * (1 + 0.03 * P.detune), sr)]; wA = fi * WT_N; wB = wA + WT_N; wFr = pos - fi;
        const q = P.res + P.mRes, ft2 = P.ftype;
        if (ft2 === 0) { v.lad.set(cut, Math.min(0.97, q + v.acc * 0.08), sr); v.lad.drive = P.drive; }
        else if (ft2 === 3) { const x = clamp(P.vow + P.vowLfo * l2, 0, 4), vi = Math.min(3, Math.floor(x)), vf = x - vi, A0 = WT_VOW[vi], A1 = WT_VOW[vi + 1], sh = Math.pow(2, P.mCut * 0.5);
          v.s1.set((A0[0] + (A1[0] - A0[0]) * vf) * sh, 8, sr); v.s2.set((A0[1] + (A1[1] - A0[1]) * vf) * sh, 10, sr); v.s3.set((A0[2] + (A1[2] - A0[2]) * vf) * sh, 12, sr); }
        else if (ft2 === 4) { wCombD = clamp(sr / Math.max(20, f * pe * wPm), 2, 2390); wCombG = 0.55 + 0.43 * clamp(q, 0, 1); v.s1.set(cut, 0.7, sr); }
        else { v.s1.set(cut, 0.6 + q * 2.5, sr); v.s2.set(cut, 0.6 + q * 2.5, sr); } }
      else if (m === MODEL.acid || m === MODEL.reese || m === MODEL.pluck || m === MODEL.wobble || m === MODEL.lead || m === MODEL.saw || m === MODEL.square || m === MODEL.b808 || m === MODEL.hoover) { v.lad.set(cut, Math.min(0.97, P.res + P.mRes + v.acc * 0.08), sr); v.lad.drive = P.drive; }
      else if (m === MODEL.screech) v.s1.set(cut, 4 + (P.res + P.mRes) * 10, sr);
      else if (m !== MODEL.vox) v.s1.set(cut, 0.6 + (P.res + P.mRes) * 2.5, sr);
      if (toneOn) v.s4.set(clamp(110 * Math.pow(2, P.tone * 7.6 + P.mCut + lf * 2 + P.envAmt * 2 * fenv), 40, sr * 0.45), 0.6 + (P.res + P.mRes) * 2.2, sr); // TONE: the filter of the models that have none of their own (EP, piano, organ, bell, plucked string, vox, sub, 808) — open (1) = untouched
      for (; i < end; i++) {
        // envelopes
        if (stage === 0) { env += (1.05 - env) * aA; if (env >= 1) { env = 1; stage = 1; } }
        else if (stage === 1) { env = sus + (env - sus) * aD; }
        else { env *= relFast ? aRf : aRn; if (env < 3e-3 && stage === 3) relFast = 1; if (env < 1e-4) { alive = 0; break; } } // a tail under -50 dB fades out in ~15 ms (it ran up to 9 s per voice: 30–40 % of all synth work was inaudible)
        if (fadeIn >= 0 && fadeIn-- === 0) { relFast = 1; stage = 3; }
        if (stage < 3 && --len <= 0) stage = 3;
        if (fstage === 0) { fenv += (1 - fenv) * fA; if (fenv > 0.98) fstage = 1; } else fenv = fSus + (fenv - fSus) * fD;
        f += (ft - f) * gl; lfo += lfoInc; if (lfo >= 1) lfo -= 1;
        let am = 1; if (lfoAmp) { const ph = P.lfoSync ? ((this.beat + i * this.bpm / 60 / sr) / P.lfoSync) % 1 : lfo, raw = P.lfoShape === 1 ? (ph < 0.5 ? 1 : 0) : P.lfoShape === 2 ? 1 - ph : 0.5 + 0.5 * sin1(ph); ag += (raw - ag) * 0.03; am = 1 - lfoAmp * (1 - ag); }
        const t = tt * inv; tt++;
        const dt = f * pe * wPm * inv; pe += dpe;
        let y = 0;
        switch (m) {
          case 0: { v.ph[0] += dt; if (v.ph[0] >= 1) v.ph[0] -= 1; y = sin1(v.ph[0]) + P.sub * 0.25 * sin1(v.ph[0] * 2); y = tanh(y * P.drive) / tanh(P.drive); break; } // sub
          case 1: { v.ph[0] += dt; if (v.ph[0] >= 1) v.ph[0] -= 1; y = tanh(sin1(v.ph[0]) * P.drive) / Math.min(1, tanh(P.drive)) ; break; } // 808
          case 2: { // reese: 3 detuned saws + sub, ladder
            const d = P.detune * 0.012 * (1 + 0.3 * sin1(lfo * 0.5)); let s = 0;
            for (let k = 0; k < 3; k++) { const dk = dt * (k === 0 ? 1 - d : k === 1 ? 1 + d : 1); v.ph[k] += dk; if (v.ph[k] >= 1) v.ph[k] -= 1; s += 2 * v.ph[k] - 1 - blep(v.ph[k], dk); }
            v.ph[3] += dt; if (v.ph[3] >= 1) v.ph[3] -= 1; y = v.lad.run(s * 0.4) - sin1(v.ph[3]) * P.sub * 0.6; y = tanh(y * 1.2); break; } // (−: in phase with the saws' fundamental)
          case 3: case 4: case 22: case 23: case 21: { // acid / pluck / saw / square / lead: one or two oscillators into the ladder
            v.ph[0] += dt; if (v.ph[0] >= 1) v.ph[0] -= 1; let s;
            if (P.wave === 1 || m === 23) { const pw = P.pw; s = (v.ph[0] < pw ? 1 : -1) + blep(v.ph[0], dt) - blep((v.ph[0] - pw + 1) % 1, dt) + 1 - 2 * pw; } /* (a narrow pulse has a DC offset of 2·pw − 1: with the envelope on it, it was a thump at the note rate under every note — removed) */ else s = 2 * v.ph[0] - 1 - blep(v.ph[0], dt);
            if (P.voices > 1) { const dk = dt * (1 + P.detune * 0.01); v.ph[1] += dk; if (v.ph[1] >= 1) v.ph[1] -= 1; s = (s + 2 * v.ph[1] - 1 - blep(v.ph[1], dk)) * 0.6; }
            let sb = 0; if (P.sub) { v.ph[2] += dt; if (v.ph[2] >= 1) v.ph[2] -= 1; const x = (P.wave === 1 || m === 23 ? P.sub : -P.sub) * sin1(v.ph[2]); s += x * (1 - P.subPost); sb = x * P.subPost; } // the sub in phase with the oscillator's own fundamental (a saw's is −sin: v8 added +sin and CANCELLED the fundamental, −26 dB at sub 0.6, measured) · subPost: it joins after the filter (a resonant ladder takes 6–8 dB off the fundamental)
            y = v.lad.run(s * 0.5) * (1 + v.acc * 0.35) + sb * 0.5; break; }
          case 5: { // wobble: saw + square through an LFO-swept ladder, sub underneath
            v.ph[0] += dt; if (v.ph[0] >= 1) v.ph[0] -= 1; v.ph[1] += dt * 1.003; if (v.ph[1] >= 1) v.ph[1] -= 1;
            const s = (2 * v.ph[0] - 1 - blep(v.ph[0], dt)) * 0.5 + ((v.ph[1] < 0.5 ? 1 : -1) + blep(v.ph[1], dt) - blep((v.ph[1] + 0.5) % 1, dt)) * 0.4;
            v.ph[2] += dt; if (v.ph[2] >= 1) v.ph[2] -= 1; y = tanh(v.lad.run(s) * P.drive) * 0.8 + sin1(v.ph[2]) * P.sub * 0.5; break; }
          case 6: { // fm growl: 2-op FM, LFO-driven index, distortion, band sweep
            v.ph[0] += dt; if (v.ph[0] >= 1) v.ph[0] -= 1; v.mph += dt * P.ratio; if (v.mph >= 1) v.mph -= 1;
            const idx = P.index * (0.4 + 0.6 * (0.5 + 0.5 * sin1(lfo))); const s = sin1(v.ph[0] + idx * sin1(v.mph) * 0.3);
            v.s1.run(tanh(s * P.drive)); y = v.s1.lp * 0.7 + v.s1.bp * 0.5; v.ph[2] += dt; if (v.ph[2] >= 1) v.ph[2] -= 1; y -= sin1(v.ph[2]) * P.sub * 0.5; break; } // (−: at the indices the FM basses use the carrier's fundamental is inverted; +sin cut it by 12–16 dB, measured)
          case 7: { // organ (drawbars) with key-click and a short percussive decay option
            let s = 0; for (let k = 0; k < 9; k++) { const lv = ORGAN_DRAW[k] * (P.bright + (k < 3 ? 0.5 : 0)); if (!lv) continue; v.ph[k] += dt * ORGAN_R[k]; if (v.ph[k] >= 1) v.ph[k] -= 1; s += sin1(v.ph[k]) * lv; }
            y = s * 0.35 + (t < 0.004 ? noise() * 0.05 * (1 - t / 0.004) : 0); break; }
          case 8: { // amapiano log drum: swept sine body + woody overtone + knock
            v.ph[0] += dt * (1 + v.e1); if (v.ph[0] >= 1) v.ph[0] -= 1; v.ph[1] += dt * 2.72; if (v.ph[1] >= 1) v.ph[1] -= 1;
            y = tanh((sin1(v.ph[0]) + sin1(v.ph[1]) * v.e2) * P.drive) + (v.e3 > 1e-6 ? noise() * v.e3 : 0); v.e1 *= v.d1; v.e2 *= v.d2; v.e3 *= v.d3; y = (v.s1.run(y), v.s1.lp); break; }
          case 9: case 10: case 19: { // supersaw / pad / strings: detuned saw stack, SVF low-pass
            const N = m === 9 ? 7 : 3, D = P.detune; let s = 0, sl = 0, srr = 0;
            if (m === 9 && ssThin) { for (let k = 0; k < 7; k += 3) { const off = SUPERSAW_DET[k], dk = dt * (1 + off * D * 1); v.ph[k] += dk; if (v.ph[k] >= 1) v.ph[k] -= 1; const o = 2 * v.ph[k] - 1 - blep(v.ph[k], dk); // eco 2: the centre and the two outer saws, level-matched
                const c = (k === 3 ? 0.5 : 0.28) * 1.33; s += o * c; if (k & 1) sl += o * c; else srr += o * c; } }
            else for (let k = 0; k < N; k++) { const off = m === 9 ? SUPERSAW_DET[k] : (k - 1) * 0.012; const dk = dt * (1 + off * D * (m === 9 ? 1 : 1)); v.ph[k] += dk; if (v.ph[k] >= 1) v.ph[k] -= 1; const o = 2 * v.ph[k] - 1 - blep(v.ph[k], dk);
              const c = m === 9 ? (k === 3 ? 0.5 : 0.28) : 0.45; s += o * c; if (k & 1) sl += o * c; else srr += o * c; }
            v.s1.run(s); y = v.s1.lp; const w = P.width * clamp((v.note - 47) / 13, 0, 1); const side = (sl - srr) * w * 0.35; // width tapers to mono below B2 (no wide lows)
            const yl = (y + side) * env * outG * am, yr = (y - side) * env * outG * am; L[i] += yl * gL; R[i] += yr * gR; continue; }
          case 11: { // stab: saw + square, SVF with fast envelope
            v.ph[0] += dt; if (v.ph[0] >= 1) v.ph[0] -= 1; v.ph[1] += dt * 1.004; if (v.ph[1] >= 1) v.ph[1] -= 1;
            const s = (2 * v.ph[0] - 1 - blep(v.ph[0], dt)) * 0.55 + ((v.ph[1] < 0.5 ? 1 : -1) + blep(v.ph[1], dt) - blep((v.ph[1] + 0.5) % 1, dt)) * 0.35;
            v.s1.run(s); y = v.s1.lp; break; }
          case 12: { // piano: inharmonic additive partials with per-partial decay + hammer
            let s = 0; for (let k = 0; k < 8; k++) { v.ph[k] += dt * PIANO_FR[k]; if (v.ph[k] >= 1) v.ph[k] -= 1; s += sin1(v.ph[k]) * v.pa[k]; v.pa[k] *= v.pd[k]; }
            y = s * 0.6 + (v.e1 > 1e-6 ? noise() * v.e1 : 0); v.e1 *= v.d1; break; }
          case 13: { // electric piano (Rhodes-like FM): 1:1 mod with decaying index + 14:1 tine
            v.mph += dt; if (v.mph >= 1) v.mph -= 1; v.mph2 += dt * 14; if (v.mph2 >= 1) v.mph2 -= 1; v.ph[0] += dt; if (v.ph[0] >= 1) v.ph[0] -= 1;
            const idx = (0.5 + v.e1) * (0.6 + 0.4 * v.vel); y = sin1(v.ph[0] + idx * 0.16 * sin1(v.mph)) + sin1(v.mph2) * v.e2; v.e1 *= v.d1; v.e2 *= v.d2; break; }
          case 14: { // FM bell
            v.mph += dt * P.ratio; if (v.mph >= 1) v.mph -= 1; v.ph[0] += dt; if (v.ph[0] >= 1) v.ph[0] -= 1; y = sin1(v.ph[0] + P.index * v.e1 * 0.16 * sin1(v.mph)); v.e1 *= v.d1; break; }
          case 15: { // Karplus-Strong pluck, tuned exactly: period = Li + 0.5 (averaging) + δ (first-order allpass)
            const w = v.kw, i1 = (w - v.kl + 2400) % 2400, i2 = i1 === 0 ? 2399 : i1 - 1; const a = 0.5 * (v.ks[i1] + v.ks[i2]) * (0.993 + 0.006 * P.bright);
            const ap = v.kz * a + v.apx - v.kz * v.apy; v.apx = a; v.apy = ap; v.ks[w] = ap; v.kw = w + 1 === 2400 ? 0 : w + 1; y = ap; break; }
          case 16: { // vox: saw through three formant band-passes (vocal chop)
            v.ph[0] += dt; if (v.ph[0] >= 1) v.ph[0] -= 1; const s = 2 * v.ph[0] - 1 - blep(v.ph[0], dt);
            v.s1.run(s); v.s2.run(s); v.s3.run(s); y = (v.s1.bp * 1.0 + v.s2.bp * 0.6 + v.s3.bp * 0.35) * v.vg; break; }
          case 17: { // hoover: detuned saws + PWM with a dipping pitch envelope
            const d = P.detune * 0.02; let s = 0; for (let k = 0; k < 3; k++) { const dk = dt * (1 + (k - 1) * d); v.ph[k] += dk; if (v.ph[k] >= 1) v.ph[k] -= 1; s += 2 * v.ph[k] - 1 - blep(v.ph[k], dk); }
            const pw = 0.5 + 0.35 * sin1(lfo); v.ph[3] += dt * 0.5; if (v.ph[3] >= 1) v.ph[3] -= 1; s += ((v.ph[3] < pw ? 1 : -1)) * 0.5; y = v.lad.run(s * 0.35); break; }
          case 18: { // screech: driven saw through a resonant swept band-pass; the two saws 12 cents apart, centred on the note (v8 had one in tune and one 12 cents sharp: the voice sat 6 cents sharp)
            v.ph[0] += dt * 0.9965182684649139; if (v.ph[0] >= 1) v.ph[0] -= 1; v.ph[1] += dt * 1.003493896344168; if (v.ph[1] >= 1) v.ph[1] -= 1; const s = (2 * v.ph[0] - 1) + (2 * v.ph[1] - 1);
            v.s1.run(tanh(s * P.drive)); y = tanh(v.s1.bp * 2.5) * 0.6; break; }
          case 24: { // wavetable unison: up to 7 detuned copies (spread in stereo), sub, noise, wavefolder, then the chosen filter
            let s = 0, sl = 0, sr2 = 0; const T = wT;
            for (let k = 0; k < U; k++) { const dk = dt * (1 + uOff[k] * uDet); let p0 = v.ph[k] + dk; if (p0 >= 1) p0 -= 1; v.ph[k] = p0; const x = p0 * WT_N, i0 = x | 0, a = x - i0, i1 = (i0 + 1) & (WT_N - 1);
              const ya = T[wA + i0] + (T[wA + i1] - T[wA + i0]) * a, yb = T[wB + i0] + (T[wB + i1] - T[wB + i0]) * a, o = ya + (yb - ya) * wFr; s += o; if (uPan[k] > 0) sl += o * uPan[k]; else sr2 -= o * uPan[k]; }
            s *= uG; if (P.sub) { v.ph[8] += dt; if (v.ph[8] >= 1) v.ph[8] -= 1; s += sin1(v.ph[8]) * P.sub * 0.7; } /* a sine ON the fundamental: it anchors the pitch under any table */ if (P.noiseAmt) s += noise() * P.noiseAmt * 0.5; // breath
            if (P.fold) s = s * (1 - P.fold) + sin1(s * (1 + 5 * P.fold) * 0.25) * P.fold * 0.8; // wavefolder: harmonics that move with the level
            const ftp = P.ftype; let side = (sl - sr2) * uG * uW;
            if (ftp === 0) { y = v.lad.run(s * 0.6) * 1.4; side *= clamp(v.cut / 4000, 0.15, 1); }
            else if (ftp === 1) { v.s1.run(s); y = v.s1.bp * 1.4; v.s2.run(side); side = v.s2.bp * 1.4; }
            else if (ftp === 2) { v.s1.run(s); y = v.s1.hp; v.s2.run(side); side = v.s2.hp; }
            else if (ftp === 3) { v.s1.run(s); v.s2.run(s); v.s3.run(s); y = (v.s1.bp + v.s2.bp * 0.7 + v.s3.bp * 0.4) * 0.38 + s * 0.4; side *= 0.3; } // the vowel over the dry tone: the fundamental stays (a pure formant bank made the 3rd harmonic the heard pitch)
            else { const w = v.kw, rp = w - wCombD, ri = Math.floor(rp), fr2 = rp - ri, j0 = (ri + 2400) % 2400, j1 = (j0 + 1) % 2400, d = v.ks[j0] + (v.ks[j1] - v.ks[j0]) * fr2; // comb tuned to the note
              const cy = s + d * wCombG; v.ks[w] = cy; v.kw = w + 1 === 2400 ? 0 : w + 1; v.s1.run(cy); y = v.s1.lp * (1 - wCombG) * 2.2; side *= 0.4; }
            const gg = env * outG * am; L[i] += (y + side) * gg * gL; R[i] += (y - side) * gg * gR; continue; }
          case 20: { // brass: saw pair, filter opens on the attack
            const d0 = dt * 0.997, d1 = dt * 1.003; v.ph[0] += d0; if (v.ph[0] >= 1) v.ph[0] -= 1; v.ph[1] += d1; if (v.ph[1] >= 1) v.ph[1] -= 1; const s = (2 * v.ph[0] - 1 - blep(v.ph[0], d0)) + (2 * v.ph[1] - 1 - blep(v.ph[1], d1));
            v.s1.run(s * 0.5); y = v.s1.lp; break; }
        }
        if (toneOn) { v.s4.run(y); y = v.s4.lp; }
        y *= env * outG * am; L[i] += y * gL; R[i] += y * gR;
      }
      if (!alive) break;
    }
    v.env = env; v.stage = stage; v.fenv = fenv; v.fstage = fstage; v.f = f; v.lfo = lfo; v.t = tt; v.len = len; v.relFast = relFast; v.fadeIn = fadeIn; v.ag = ag;
    if (!alive) { v.on = 0; v.relFast = 0; v.fadeIn = -1; }
  }
}
function copySvf(x, y) { y.ic1 = x.ic1; y.ic2 = x.ic2; y.g = x.g; y.k = x.k; y.a1 = x.a1; y.a2 = x.a2; y.a3 = x.a3; }
function copyVoice(a, b) { // complete state copy (no allocation) — used for click-free hand-over
  b.on = a.on; b.stage = a.stage; b.env = a.env; b.fenv = a.fenv; b.fstage = a.fstage; b.f = a.f; b.ft = a.ft; b.note = a.note; b.vel = a.vel; b.acc = a.acc; b.t = a.t; b.p = a.p; b.m = a.m;
  b.gl = a.gl; b.gr = a.gr; b.ls = a.ls; b.bright = a.bright; b.lfo = a.lfo; b.mph = a.mph; b.mph2 = a.mph2; b.sph = a.sph; b.cut = a.cut; b.len = a.len; b.wait = 0; b.relFast = a.relFast; b.age = 0; b.atk = a.atk; b.rel = a.rel; b.vg = a.vg;
  for (let k = 0; k < 9; k++) b.ph[k] = a.ph[k];
  const L1 = a.lad, L2 = b.lad; L2.s1 = L1.s1; L2.s2 = L1.s2; L2.s3 = L1.s3; L2.s4 = L1.s4; L2.g = L1.g; L2.G = L1.G; L2.k = L1.k; L2.drive = L1.drive;
  copySvf(a.s1, b.s1); copySvf(a.s2, b.s2); copySvf(a.s3, b.s3); copySvf(a.s4, b.s4);
  for (let k = 0; k < 8; k++) { b.pa[k] = a.pa[k]; b.pd[k] = a.pd[k]; } b.e1 = a.e1; b.e2 = a.e2; b.e3 = a.e3; b.d1 = a.d1; b.d2 = a.d2; b.d3 = a.d3;
  if (a.m === MODEL.kspluck || a.m === MODEL.wt || a.m === MODEL.grain || a.m === MODEL.pluck2) { b.ks.set(a.ks); b.kl = a.kl; b.kw = a.kw; b.kz = a.kz; b.apx = a.apx; b.apy = a.apy; } }
const ORGAN_DRAW = [0.8, 1, 0.6, 0.8, 0.5, 0.4, 0.2, 0.15, 0.25];
