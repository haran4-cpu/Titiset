/* ===================== TRANSITION FX + TEXTURE =====================
   FX are arrangement devices, scheduled by the composer in musical time: riser (filtered noise + rising tone over
   the whole build), impact (sub boom + noise burst on the drop downbeat), downlifter (falling noise into a break),
   sweep (one-bar noise swell into a section), snare-up (pitch riser on the last build bar), reverse cymbal (a swell
   cut on the downbeat it leads into), crash (on phrase starts and drops).
   v9 adds the "ear candy" of psytrance, techno and bass music, scheduled in key by the composer (x = MIDI note, y = pan):
   zap (an FM pitch dive), rise (an FM up-chirp), bubbles (a run of tiny random-pitched FM blips), swirl (two resonant noise
   bands sweeping against each other while it pans), squelch (one resonant acid-filter shriek on a saw) and laser (a
   bright pitch dive with a resonant comb ring — the 'pew' of psy and electro).
   Texture is a continuous bed (vinyl / air / dark / psy fx) whose level follows the arrangement. */
// metal partials for crash / reverse cymbal (inharmonic square ratios, as in analog cymbal circuits)
const CYM_F = [432, 587.3, 729.1, 1003.7, 1291.5, 1677.9];
class FxVoice { constructor() { this.on = 0; this.kind = 0; this.t = 0; this.dur = 1; this.wait = 0; this.vel = 1; this.ph = 0; this.ph2 = 0; this.b1 = new Svf(); this.b2 = new Svf(); this.z = 0; this.cp = new Float64Array(6); this.pan = 0;
  this.f0 = 0; this.f1 = 0; this.fc = 0; this.idx = 0; this.gl = 1; this.gr = 1; this.nb = 0; this.bf = 0; this.be = 0; this.bk = 0; this.cl = new Float32Array(FX_COMB); this.ci = 0; this.cn = 1; this.kill = 0; shape(this); } }
const FX_COMB = 1200, FX_BUB = [0, 3, 7, 10, 12, 15, 19, 24]; // laser comb memory (samples); bubble pitch set (minor pentatonic-ish, semitones)
// level per kind at velocity 1 (measured so the new kinds sit with the riser and the crash: tools/fx_test.cjs)
const FX_GAIN = [1, 1, 1, 1, 1, 1, 1, 0.33, 0.24, 0.53, 0.4, 0.29, 0.31];
class Fx {
  constructor(sr) { this.sr = sr; this.v = Array.from({ length: 8 }, () => new FxVoice()); this.i = 0; this.gain = 1; this.ctr = 0;
    // the ear candy's own echo: the psy 3/16 ping-pong (0.75 beat), band-limited in its feedback, running only while it rings
    this.eL = new Float32Array(128); this.eR = new Float32Array(128); this.dn = Math.round(sr * 1.6); this.dL = new Float32Array(this.dn); this.dR = new Float32Array(this.dn); this.dw = 0; this.dd = Math.round(sr * 0.31); this.tail = 0; this.hpL = 0; this.hpR = 0; this.lpL = 0; this.lpR = 0; this.eWet = 0.42; this.eFb = 0.48;
    this.killN = Math.max(1, Math.round(sr * 0.005)); this.killK = 1 / this.killN; shape(this); }
  setTempo(bpm) { this.dd = clamp(Math.round(this.sr * 60 / Math.max(40, bpm) * 0.75), 64, this.dn - 2); }
  trigger(off, kind, vel, durSamples, note, pan) { const v = this.v[this.i]; this.i = (this.i + 1) % this.v.length;
    v.on = 1; v.kill = 0; v.kind = kind; v.t = 0; v.wait = off; v.vel = vel * (FX_GAIN[kind] ?? 1); v.dur = Math.max(1, durSamples); v.ph = 0; v.ph2 = 0; v.b1.reset(); v.b2.reset(); v.z = 0; v.pan = noise() * 0.35; for (let k = 0; k < 6; k++) v.cp[k] = (noise() + 1) * 0.5;
    if (kind === 5 || kind === 6) { v.b1.set(kind === 5 ? 7200 : 6400, 0.9, this.sr); v.b2.set(kind === 5 ? 6800 : 5800, 0.9, this.sr); }
    if (kind >= 7) { const u = (noise() + 1) * 0.5, f = note > 0 ? mtof(note) : 220 * Math.pow(2, Math.floor(u * 12) / 12); v.f1 = f; v.nb = -1; v.be = 0; v.idx = 0; v.ci = 0; v.cn = 1;
      v.pan = pan ? clamp(pan, -1, 1) : noise() * 0.7; v.gl = Math.cos((v.pan + 1) * Math.PI / 4) * 1.414; v.gr = Math.sin((v.pan + 1) * Math.PI / 4) * 1.414;
      if (kind === 7 || kind === 12) v.f0 = Math.min(7000, f * (8 + 8 * u)); else if (kind === 8) v.f0 = Math.min(6000, f * 8); else v.f0 = f;
      if (kind === 12) { v.cl.fill(0); v.cn = clamp(Math.round(this.sr / (f * 2)), 8, FX_COMB - 1); } } }
  // (v9.2) a seek / jump / load fades what is sounding over 5 ms — it was cut dead, a step of up to −6 dBFS: a click on every DJ jump —
  // and the ear candy's echo rings out on its own (its delay lines were emptied: the repeats stopped mid-air)
  stopAll() { for (const v of this.v) { if (!v.on) continue; if (v.wait > 0) v.on = 0; else if (!v.kill) v.kill = this.killN; } }
  render(L, R, n) {
    const sr = this.sr, inv = 1 / sr, eL = this.eL, eR = this.eR; let candy = false; eL.fill(0, 0, n); eR.fill(0, 0, n);
    for (const v of this.v) { if (!v.on) continue; const oL = v.kind >= 7 ? eL : L, oR = v.kind >= 7 ? eR : R; if (v.kind >= 7) candy = true;
      for (let i = 0; i < n; i++) { if (v.wait > 0) { v.wait--; continue; }
        const t = v.t * inv, p = v.t / v.dur; v.t++; let yl = 0, yr = 0;
        if ((i & 15) === 0 || v.t === 1) { // control rate filter sweeps
          if (v.kind === 0) { v.b1.set(300 * Math.pow(30, Math.min(1, p)), 1.6, sr); v.b2.set(330 * Math.pow(30, Math.min(1, p)), 1.6, sr); }
          else if (v.kind === 2) { v.b1.set(7000 * Math.pow(0.03, Math.min(1, p)), 1.4, sr); v.b2.set(6400 * Math.pow(0.03, Math.min(1, p)), 1.4, sr); }
          else if (v.kind === 3) { v.b1.set(200 * Math.pow(60, Math.min(1, p)), 0.8, sr); v.b2.set(220 * Math.pow(60, Math.min(1, p)), 0.8, sr); }
          else if (v.kind === 1) { v.b1.set(Math.max(80, 6000 * Math.exp(-t / 0.08)), 0.7, sr); }
          else if (v.kind === 4) { v.b1.set(400 + 4000 * p * p, 2.2, sr); }
          else if (v.kind >= 7) { const q = Math.min(1, p);
            if (v.kind === 7 || v.kind === 12) { v.fc = v.f1 + (v.f0 - v.f1) * Math.exp(-q * 6); v.idx = 2.6 * Math.exp(-q * 4); } // dive: fast at first, landing on the note
            else if (v.kind === 8) { v.fc = v.f1 * Math.pow(v.f0 / v.f1, Math.sqrt(q)); v.idx = 0.4 + 2 * q; }                 // rise: the up-chirp, brighter as it climbs
            else if (v.kind === 10) { const sw = 0.5 - 0.5 * Math.cos(TAU * q), pn = Math.sin(TAU * q * 2) * 0.8; v.b1.set(500 * Math.pow(2, 3.2 * sw), 5, sr); v.b2.set(760 * Math.pow(2, 3.2 * (1 - sw)), 5, sr); v.gl = Math.cos((pn + 1) * Math.PI / 4) * 1.414; v.gr = Math.sin((pn + 1) * Math.PI / 4) * 1.414; }
            else if (v.kind === 11) { const e = q < 0.25 ? q / 0.25 : Math.exp(-(q - 0.25) * 4); v.fc = v.f1 * (1 - 0.06 * q * q); v.b1.set(v.f1 * (1.5 + 22 * e), 9, sr); }
            if (v.kind === 7 || v.kind === 8 || v.kind === 12) { const pn = v.pan * (1 - 2 * q); v.gl = Math.cos((pn + 1) * Math.PI / 4) * 1.414; v.gr = Math.sin((pn + 1) * Math.PI / 4) * 1.414; } } } // zaps fly across the stereo field
        switch (v.kind) {
          case 0: { // riser: noise band sweeping up + an octave-rising sine, amplitude ~ p^2, ends exactly at the drop
            if (p >= 1) { v.on = 0; break; } const a = p * p * v.vel; v.b1.run(noise()); v.b2.run(noise());
            v.ph += (110 * Math.pow(8, p)) * inv; if (v.ph >= 1) v.ph -= 1; const tone = sin1(v.ph) * 0.25 * p;
            yl = (v.b1.bp * 0.9 + tone) * a; yr = (v.b2.bp * 0.9 + tone) * a; break; }
          case 1: { // impact: pitch-dropping sub boom + filtered noise burst
            const fb = 35 + 45 * Math.exp(-t / 0.05); v.ph += fb * inv; if (v.ph >= 1) v.ph -= 1;
            const boom = sin1(v.ph) * Math.exp(-t / 0.55) * 0.9, nz = (v.b1.run(noise()), v.b1.lp) * Math.exp(-t / 0.18) * 0.6;
            yl = yr = (boom + nz) * v.vel; if (t > 3) v.on = 0; break; }
          case 2: { // downlifter
            if (p >= 1) { v.on = 0; break; } const a = (1 - p) * (1 - p) * v.vel * Math.min(1, t / 0.01); v.b1.run(noise()); v.b2.run(noise()); yl = v.b1.bp * a; yr = v.b2.bp * a; break; }
          case 3: { // sweep (noise swell, high-passed upward)
            if (p >= 1) { v.on = 0; break; } const a = Math.pow(p, 3) * v.vel; v.b1.run(noise()); v.b2.run(noise()); yl = v.b1.hp * a * 0.5; yr = v.b2.hp * a * 0.5; break; }
          case 5: case 6: { // 5 reverse cymbal (swells over dur, cut on the beat) · 6 crash (hit on the beat, ~2 s tail)
            let env; if (v.kind === 5) { if (p >= 1) { v.on = 0; break; } env = Math.exp(6 * (p - 1)) * Math.min(1, (1 - p) * v.dur / (0.004 * sr)); } else { env = Math.exp(-t / 0.55) * Math.min(1, t / 0.0015); if (t > 3) { v.on = 0; break; } }
            let m = 0; for (let k = 0; k < 6; k++) { v.cp[k] += CYM_F[k] * inv; if (v.cp[k] >= 1) v.cp[k] -= 1; m += v.cp[k] < 0.5 ? 1 : -1; }
            v.b1.run(m * 0.12 + noise() * 0.7); v.b2.run(-m * 0.12 + noise() * 0.7); const a = env * v.vel * 0.55; yl = v.b1.hp * a * (1 - v.pan); yr = v.b2.hp * a * (1 + v.pan); break; }
          case 4: { // snare-up: a rising resonant buzz
            if (p >= 1) { v.on = 0; break; } v.ph += (180 * Math.pow(4, p)) * inv; if (v.ph >= 1) v.ph -= 1; v.b1.run(2 * v.ph - 1); const a = p * v.vel * 0.35; yl = yr = v.b1.bp * a; break; }
          case 7: case 8: { // zap (dive) / rise (up-chirp): two-operator FM, index falling with the dive (bright tip, pure landing)
            if (p >= 1) { v.on = 0; break; } v.ph += v.fc * inv; if (v.ph >= 1) v.ph -= 1; v.ph2 += v.fc * (v.kind === 7 ? 2 : 1.5) * inv; if (v.ph2 >= 1) v.ph2 -= 1;
            const a = (v.kind === 7 ? (1 - p) * (1 - p) : Math.sin(Math.PI * p)) * Math.min(1, t / 0.0015) * v.vel, y = sin1(v.ph + 0.16 * v.idx * sin1(v.ph2)) * a; yl = y * v.gl; yr = y * v.gr; break; }
          case 9: { // bubbles: six blips over the duration, each a new pitch from the set (seeded by the engine's noise), panned in turn
            if (p >= 1) { v.on = 0; break; } const k = Math.floor(p * 6);
            if (k !== v.nb) { v.nb = k; const u = (noise() + 1) * 0.5; v.bf = v.f1 * 2 * Math.pow(2, FX_BUB[Math.floor(u * FX_BUB.length) % FX_BUB.length] / 12); v.be = 1; v.bk = Math.exp(-1 / (0.014 * sr)); const pn = (k & 1 ? 0.6 : -0.6) * (0.5 + 0.5 * u); v.gl = Math.cos((pn + 1) * Math.PI / 4) * 1.414; v.gr = Math.sin((pn + 1) * Math.PI / 4) * 1.414; }
            v.ph += v.bf * inv; if (v.ph >= 1) v.ph -= 1; v.ph2 += v.bf * 3 * inv; if (v.ph2 >= 1) v.ph2 -= 1; const y = sin1(v.ph + 0.12 * v.be * sin1(v.ph2)) * v.be * v.vel; v.be *= v.bk; yl = y * v.gl; yr = y * v.gr; break; }
          case 10: { // swirl: two resonant noise bands sweeping against each other while the sound pans
            if (p >= 1) { v.on = 0; break; } const a = Math.pow(Math.sin(Math.PI * p), 1.5) * v.vel; v.b1.run(noise()); v.b2.run(noise()); const y = (v.b1.bp + v.b2.bp) * a * 0.5; yl = y * v.gl; yr = y * v.gr; break; }
          case 11: { // squelch: a saw through a screaming resonant low-pass whose cutoff opens and closes once
            if (p >= 1) { v.on = 0; break; } v.ph += v.fc * inv; if (v.ph >= 1) v.ph -= 1; v.b1.run(2 * v.ph - 1); const a = Math.min(1, t / 0.002) * Math.pow(1 - p, 1.2) * v.vel, y = tanh(v.b1.lp * 1.6) * a; yl = y * v.gl; yr = y * v.gr; break; }
          case 12: { // laser: the zap through a short resonant comb (the metallic 'pew' ring)
            if (p >= 1) { v.on = 0; break; } v.ph += v.fc * inv; if (v.ph >= 1) v.ph -= 1; v.ph2 += v.fc * 3 * inv; if (v.ph2 >= 1) v.ph2 -= 1;
            const a = (1 - p) * Math.min(1, t / 0.001) * v.vel, x = sin1(v.ph + 0.2 * v.idx * sin1(v.ph2)) * a, d = v.cl[v.ci], y = x + d * 0.72; v.cl[v.ci] = y; if (++v.ci >= v.cn) v.ci = 0; yl = y * 0.6 * v.gl; yr = y * 0.6 * v.gr; break; }
        }
        if (v.kill) { const g = v.kill * this.killK; yl *= g; yr *= g; if (--v.kill === 0) v.on = 0; } // the 5 ms fade of stopAll()
        yl *= this.gain; yr *= this.gain; oL[i] += yl; oR[i] += yr;
        if (!v.on) break; } }
    if (candy) this.tail = Math.round(sr * 4);
    if (this.tail > 0) { this.tail -= n; const dL = this.dL, dR = this.dR, N = this.dn, d = this.dd, fb = this.eFb, wet = this.eWet;
      for (let i = 0; i < n; i++) { let r = this.dw - d; if (r < 0) r += N; const a = dL[r], b = dR[r];
        // ping-pong: the left tap feeds the right line; the feedback is band-limited (one-pole high-pass ~300 Hz, low-pass ~5 kHz) so repeats darken
        this.lpL += (b - this.lpL) * 0.5; this.hpL += (this.lpL - this.hpL) * 0.042; this.lpR += (a - this.lpR) * 0.5; this.hpR += (this.lpR - this.hpR) * 0.042;
        dL[this.dw] = (eL[i] + eR[i]) * 0.5 + (this.lpL - this.hpL) * fb; dR[this.dw] = (this.lpR - this.hpR) * fb; if (++this.dw >= N) this.dw = 0;
        L[i] += eL[i] + a * wet; R[i] += eR[i] + b * wet; }
      if (this.tail <= 0) { this.dL.fill(0); this.dR.fill(0); this.hpL = this.hpR = this.lpL = this.lpR = 0; } } }
}
// Texture beds — rebuilt. The old beds were raw noise (a hiss, a rumble, decaying digital clicks) and measured as noise: no
// pitch, no relation to the music. Now every bed is musical:
//   vinyl  — surface noise as a record makes it: a dusty band-limited hiss, a dense layer of tiny ticks (exponentially
//            distributed sizes, each a ringing band-pass burst, panned at random) and an occasional deeper pop
//   air    — "harmonic breath": soft noise through narrow resonators tuned to the CURRENT CHORD (3 voices, 600 Hz–2.4 kHz),
//            each breathing on its own slow cycle; on a chord change they re-tune behind a short swell — air in key
//   dark   — the same resonators an octave and a half lower on root + fifth (a drone that follows the harmony) over a
//            filtered sub-rumble kept under 90 Hz
//   psyfx  — tempo-locked resonant zaps: they start on a 16th, sweep down and land on the chord root (×8) — in time, in key
//   rain   — soft droplets (short high band-pass blips at a natural, irregular rate) over a gentle wash
// Chords arrive as texture events (12-bit pitch-class mask + root); level events as before.
const TEX_VOICES = 3;
class Texture {
  constructor(sr) { this.sr = sr; this.kind = 0; this.level = 0; this.target = 0; this.slew = 1 / (sr * 2); this.gain = 1; this.t = 0; this.bpm = 124; this.beat = 0;
    this.res = Array.from({ length: TEX_VOICES * 2 }, () => new Svf()); this.rf = new Float32Array(TEX_VOICES * 2); this.rfNext = new Float32Array(TEX_VOICES * 2); this.ra = new Float32Array(TEX_VOICES * 2); this.rlfo = new Float32Array(TEX_VOICES * 2); this.swap = 0;
    this.hissL = new Svf(); this.hissR = new Svf(); this.hissHL = new Svf(); this.hissHR = new Svf(); this.tick = new Svf(); this.tickR = new Svf(); this.pop = new Svf(); this.rum = new Svf(); this.rum2 = new Svf(); this.drop = new Svf(); this.dropR = new Svf();
    this.tk = 0; this.tkPan = 0; this.pk = 0; this.h2L = 0; this.h2R = 0; this.dk = 0; this.dkPan = 0; this.pinkL = 0; this.pinkR = 0;
    this.zap = 0; this.zf = 0; this.zEnd = 0; this.zp = 0; this.ph = 0; this.zb = new Svf(); this.lastStep = -1; this.root = 0; this.mask = 0x91; this.fg = 0; shape(this); this.setKind(0); this.setChord(0x91, 0); }
  setKind(k) { this.kind = k; const sr = this.sr;
    this.hissL.set(5200, 0.6, sr); this.hissR.set(5600, 0.6, sr); this.hissHL.set(1800, 0.6, sr); this.hissHR.set(1700, 0.6, sr); this.tick.set(3200, 1.2, sr); this.tickR.set(2600, 1.2, sr); this.pop.set(900, 1.2, sr);
    this.rum.set(70, 0.6, sr); this.rum2.set(85, 0.6, sr); this.drop.set(4200, 6, sr); this.dropR.set(3600, 6, sr); this.retune(true); }
  set(kind, level, rampSamples) { if (kind !== this.kind) this.setKind(kind); this.target = level; this.slew = 1 / Math.max(64, rampSamples); }
  // chord: pc mask (bit n = pitch class n, relative to C) and root pc. Voices are spread over the chord tones in register.
  setChord(mask, root) { if (!mask) return; this.mask = mask; this.root = root | 0; this.retune(false); }
  retune(now) { const pcs = []; for (let k = 0; k < 12; k++) if (this.mask & (1 << k)) pcs.push(k); if (!pcs.length) pcs.push(this.root);
    const dark = this.kind === 3, sr = this.sr;
    for (let v = 0; v < TEX_VOICES * 2; v++) { let f;
      if (dark) { const pc = v % 2 ? (this.root + 7) % 12 : this.root; f = 440 * Math.pow(2, (pc - 9) / 12 + (v < 2 ? -1 : v < 4 ? -0.5 : 0)); while (f > 330) f /= 2; while (f < 98) f *= 2; }
      else { const pc = pcs[(v + (v >= TEX_VOICES ? 1 : 0)) % pcs.length]; f = 440 * Math.pow(2, (pc - 9) / 12); const lo = v < TEX_VOICES ? 620 : 1150; while (f < lo) f *= 2; while (f > lo * 2) f /= 2; }
      this.rfNext[v] = f; if (now || this.rf[v] === 0) { this.rf[v] = f; this.res[v].set(f, dark ? 26 : 38, sr); } }
    if (!now) this.swap = 1; }
  render(L, R, n) {
    if (this.kind === 0 || (this.level < 1e-4 && this.target < 1e-4)) { this.level = this.target; this.beat += n * this.bpm / 60 / this.sr; return; }
    const sr = this.sr, inv = 1 / sr, K = this.kind, bInc = this.bpm / 60 * inv;
    for (let i = 0; i < n; i++) {
      const d = this.target - this.level; this.level += Math.abs(d) < this.slew ? d : Math.sign(d) * this.slew; const lv = this.level * this.gain; this.t++; this.beat += bInc;
      let yl = 0, yr = 0;
      if (K === 2 || K === 3) { // harmonic resonators (air / dark): fade out → re-tune → swell back in on a chord change
        if (this.swap) { this.fg -= 1 / (0.25 * sr); if (this.fg <= 0) { this.fg = 0; this.swap = 0; for (let v = 0; v < TEX_VOICES * 2; v++) { this.rf[v] = this.rfNext[v]; this.res[v].set(this.rf[v], K === 3 ? 26 : 38, sr); this.res[v].reset(); } } }
        else if (this.fg < 1) this.fg = Math.min(1, this.fg + 1 / (0.8 * sr));
        const fade = this.fg * this.fg;
        const nl = noise(), nr = noise();
        if ((this.t & 31) === 0) for (let v = 0; v < TEX_VOICES * 2; v++) { this.rlfo[v] += (0.045 + 0.023 * v) * inv * 32; if (this.rlfo[v] >= 1) this.rlfo[v] -= 1; this.ra[v] = (0.35 + 0.65 * (0.5 + 0.5 * sin1(this.rlfo[v] + v * 0.17))) * this.res[v].k; } // breathing at control rate
        for (let v = 0; v < TEX_VOICES * 2; v++) { const r = this.res[v]; r.run(v & 1 ? nr : nl); const y = r.bp * this.ra[v] * fade; if (v & 1) yr += y; else yl += y; }
        const g = K === 3 ? 0.55 : 0.42; yl *= g; yr *= g;
        if (K === 3) { this.rum.run(noise()); this.rum2.run(noise()); yl += this.rum.lp * 0.18; yr += this.rum2.lp * 0.18; }
        else { this.pinkL += (noise() - this.pinkL) * 0.08; this.pinkR += (noise() - this.pinkR) * 0.08; this.hissHL.run(this.pinkL); this.hissHR.run(this.pinkR); yl += this.hissHL.hp * 0.03; yr += this.hissHR.hp * 0.03; } }
      else if (K === 1) { // vinyl surface
        this.pinkL += (noise() - this.pinkL) * 0.42; this.pinkR += (noise() - this.pinkR) * 0.42; this.h2L += (this.pinkL - this.h2L) * 0.22; this.h2R += (this.pinkR - this.h2R) * 0.22; // dust band ≈ 1.8–5 kHz (one-poles)
        yl = (this.pinkL - this.h2L) * 0.06; yr = (this.pinkR - this.h2R) * 0.06;
        const u = (noise() + 1) * 0.5; if (u < 26 * inv) { const z = (noise() + 1) * 0.5, z3 = z * z * z, a = 0.02 + 0.2 * z3 * z3; this.tk = a * (noise() < 0 ? -1 : 1); this.tkPan = noise() * 0.8; } // dust: many tiny ticks, the loud ones rare
        if (u > 1 - 0.22 * inv) { this.pk = 0.28 * (noise() < 0 ? -1 : 1); }                                                         // the odd deeper pop
        this.tick.run(this.tk + 1e-18); this.tickR.run(this.tk + 1e-18); this.tk *= 0.55; if (this.tk < 1e-9 && this.tk > -1e-9) this.tk = 0; this.pop.run(this.pk + 1e-18); this.pk *= 0.93; if (this.pk < 1e-9 && this.pk > -1e-9) this.pk = 0; // (no denormals: decays flush to 0, filters see a tiny offset)
        const tkv = this.tick.bp * this.tick.k * 2.2, popv = this.pop.bp * this.pop.k * 1.2; yl += tkv * (1 - this.tkPan) + popv; yr += this.tickR.bp * this.tickR.k * 2.2 * (1 + this.tkPan) + popv; }
      else if (K === 4) { // psy zaps on the grid, landing on the chord root
        const step = Math.floor(this.beat * 4); if (step !== this.lastStep) { this.lastStep = step; if (this.zap <= 0 && (noise() + 1) * 0.5 < 0.06) { const dur = (1 + Math.floor((noise() + 1) * 1.5)) * 60 / this.bpm / 4 * 2; this.zap = Math.floor(dur * sr); this.zf = 3000 + 3500 * (noise() + 1);
            this.zEnd = 440 * Math.pow(2, (this.root - 9) / 12) * 8; this.zp = noise() * 0.9; } }
        if (this.zap > 0) { this.zap--; this.zf += (this.zEnd - this.zf) * 0.0009; if ((this.t & 15) === 0) this.zb.set(this.zf, 10, sr); this.ph += this.zf * 0.5 * inv; if (this.ph >= 1) this.ph -= 1;
          this.zb.run(2 * this.ph - 1); const y = this.zb.bp * this.zb.k * 0.16 * Math.min(1, this.zap / 600); yl = y * (1 - this.zp); yr = y * (1 + this.zp); }
        this.pinkL += (noise() - this.pinkL) * 0.2; this.hissHL.run(this.pinkL); yl += this.hissHL.hp * 0.008; yr += this.hissHL.hp * 0.008; }
      else if (K === 5) { // rain
        const u = (noise() + 1) * 0.5; if (u < 60 * inv) { this.dk = (0.05 + 0.4 * Math.pow((noise() + 1) * 0.5, 3)) * (noise() < 0 ? -1 : 1); this.dkPan = noise(); this.drop.set(2500 + 3500 * (noise() + 1) * 0.5, 7, sr); }
        this.drop.run(this.dk + 1e-18); this.dk *= 0.4; if (this.dk < 1e-9 && this.dk > -1e-9) this.dk = 0; const y = this.drop.bp * this.drop.k * 2; this.pinkL += (noise() - this.pinkL) * 0.15; this.pinkR += (noise() - this.pinkR) * 0.15; this.hissHL.run(this.pinkL); this.hissHR.run(this.pinkR);
        yl = y * (1 - this.dkPan) + this.hissHL.hp * 0.05; yr = y * (1 + this.dkPan) + this.hissHR.hp * 0.05; }
      L[i] += yl * lv; R[i] += yr * lv; }
  }
}
