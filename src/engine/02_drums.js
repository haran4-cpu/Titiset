/* ===================== DRUM MODELS =====================
   Every drum is synthesized from first principles of the classic machines and modern sound design:
   kick = swept sine body + transient click + drive; snare = tuned body + filtered noise; clap = multi-burst
   noise; hats = six detuned square oscillators (808/909 metal) through band/high-pass; percussion = pitched
   resonant bodies. Parameters come from the genre kit (see GENRES), voices are preallocated. */
function pickVoice(vs) { let o = vs[0], ot = -1; for (const v of vs) { if (!v.on) return v; if (v.t > ot) { ot = v.t; o = v; } } return o; }
const HAT_RATIOS = [1, 1.4828, 1.8003, 2.5464, 2.6303, 3.8968]; // 205.3/304.4/369.6/522.7/540/800 Hz normalised (808 metal)
class KickVoice { constructor() { this.on = 0; this.t = 0; this.wait = 0; this.ph = 0; this.vel = 1; this.cz = 0; this.lp = 0; this.eP = 0; this.eQ = 0; this.eA = 1; this.eC1 = 0; this.eC2 = 0; this.phC = 0; this.phS = 0; shape(this); } }
class Kick {
  constructor(sr) { this.sr = sr; this.v = [new KickVoice(), new KickVoice()]; this.i = 0;
    this.p = { fEnd: 50, fStart: 220, pDec: 0.035, punch: 0.4, aDec: 0.32, hold: 0.012, click: 0.35, clickF: 3500, drive: 1.6, tail: 0, tailDrive: 1, sub: 0, lp: 9000, gain: 1, rumble: 0, len: 0 };
    this.lpA = 0; this.kP = 0; this.kQ = 0; this.kA = 0; this.kC1 = 0; this.kC2 = 0; this.czk = 0; this.bpm = 124;
    // rumble (techno): the kick through three short dark feedback combs, low-passed, driven, and ducked under the next hit — the
    // reverberated low end that fills the space between the kicks (it was a kit parameter with no sound behind it until v9)
    this.rb0 = new Float32Array(1031); this.rb1 = new Float32Array(1499); this.rb2 = new Float32Array(2203); this.ri0 = 0; this.ri1 = 0; this.ri2 = 0; this.rl1 = 0; this.rl2 = 0; this.rlA = 1 - Math.exp(-TAU * 150 / sr); this.duck = 1; this.dkK = 1 - Math.exp(-1 / (0.07 * sr)); this.dWait = -1; this.rOn = 0;
    shape(this); this.setKit({}); }
  setTempo(bpm) { this.bpm = bpm; this.setKit({}); }
  setKit(k) { Object.assign(this.p, k); const sr = this.sr, P = this.p; this.lpA = 1 - Math.exp(-TAU * P.lp / sr);
    this.kP = Math.exp(-1 / (P.pDec * sr)); this.kQ = Math.exp(-1 / (0.0025 * sr));
    // length in beats (len) → decay constant, compensating the drive's small-signal gain so the -20 dB point of the
    // OUTPUT lands at len beats at any tempo (a kick that rings into the next beat is mud, not weight)
    let dec = P.aDec; if (P.len > 0) { const kd = Math.max(1.0001, P.drive), g = kd / Math.tanh(kd); dec = Math.max(0.02, (P.len * 60 / this.bpm - P.hold) / Math.log(10 * g)); } this.kA = Math.exp(-1 / (dec * sr)); this.kC1 = Math.exp(-1 / (0.0018 * sr)); this.kC2 = Math.exp(-1 / (0.0012 * sr)); this.czk = Math.exp(-1 / (0.005 * sr)); }
  trigger(off, vel) { const v = this.v[this.i]; this.i ^= 1; const o = this.v[this.i]; if (o.on) o.cz = 1; if (this.p.rumble > 0) this.dWait = off; // the previous hit fades in 5 ms (no overlap mud, no click); the rumble ducks under the new one
    v.on = 1; v.t = 0; v.wait = off; v.ph = 0; v.vel = vel; v.cz = 0; v.lp = 0; v.eP = 1; v.eQ = 1; v.eA = 1; v.eC1 = 1; v.eC2 = 1; v.phC = 0; v.phS = 0; }
  render(L, R, n) {
    const sr = this.sr, P = this.p, inv = 1 / sr, kd = P.drive, nd = 1 / tanh(kd), la = this.lpA || 1, atkN = 0.0004 * sr, holdN = P.hold * sr, clickN = 0.012 * sr;
    const fE = P.fEnd, fS = P.fStart - P.fEnd, fQ = P.fStart * P.punch, cf = P.clickF * inv, sf = P.fEnd * inv, cl = P.click * 0.5, sub = P.sub * 0.5, tail = P.tail > 0, g = P.gain;
    for (const v of this.v) { if (!v.on) continue;
      for (let i = 0; i < n; i++) { if (v.wait > 0) { v.wait--; continue; }
        const ts = v.t++; const f = fE + fS * v.eP + fQ * v.eQ; v.eP *= this.kP; v.eQ *= this.kQ;
        v.ph += f * inv; if (v.ph >= 1) v.ph -= 1;
        let a; if (ts < atkN) a = ts / atkN; else if (ts < holdN) a = 1; else { a = v.eA; v.eA *= this.kA; }
        if (v.cz) { a *= v.cz; v.cz *= this.czk; }
        let body = sin1(v.ph);
        if (tail) body = tanh(body * (1 + P.tailDrive * Math.min(1, ts * inv * 8))); // hardstyle / gabber: the tail distorts as it rings
        let y = tanh(body * kd) * nd * a;
        if (sub) { v.phS += sf; if (v.phS >= 1) v.phS -= 1; y += sin1(v.phS) * a * sub; }
        if (ts < clickN && cl > 0) { v.phC += cf; if (v.phC >= 1) v.phC -= 1; y += (noise() * v.eC1 + sin1(v.phC) * v.eC2) * cl; v.eC1 *= this.kC1; v.eC2 *= this.kC2; }
        v.lp += (y - v.lp) * la; y = v.lp * g * v.vel;
        L[i] += y; R[i] += y;
        if (a < 0.0003 && ts > 0.05 * sr) { v.on = 0; break; } }
    }
    if (P.rumble > 0 || this.rOn > 0) { const amt = P.rumble, b0 = this.rb0, b1 = this.rb1, b2 = this.rb2, A = this.rlA, K = this.dkK; let live = 0;
      for (let i = 0; i < n; i++) { if (this.dWait >= 0) { if (this.dWait === 0) this.duck = 0; this.dWait--; }
        const x = L[i], d0 = b0[this.ri0], d1 = b1[this.ri1], d2 = b2[this.ri2]; b0[this.ri0] = x + d0 * 0.72; b1[this.ri1] = x + d1 * 0.72; b2[this.ri2] = x + d2 * 0.72;
        if (++this.ri0 >= 1031) this.ri0 = 0; if (++this.ri1 >= 1499) this.ri1 = 0; if (++this.ri2 >= 2203) this.ri2 = 0;
        this.rl1 += ((d0 + d1 + d2) * 0.33 - this.rl1) * A; this.rl2 += (this.rl1 - this.rl2) * A; this.duck += (1 - this.duck) * K;
        const y = tanh(this.rl2 * 3) * 0.6 * this.duck * amt; L[i] += y; R[i] += y; if (y > 1e-5 || y < -1e-5) live = 1; }
      this.rOn = live || P.rumble > 0 ? 1 : 0; }
  }
}
class NoiseHitVoice { constructor() { this.on = 0; this.t = 0; this.wait = 0; this.vel = 1; this.ph1 = 0; this.ph2 = 0; this.bp = new Svf(); this.hp = new Svf(); this.lp = new Svf(); this.kind = 0; this.pan = 0;
  this.eB = 0; this.eT = 0; this.e1 = 0; this.e2 = 0; this.e3 = 0; this.e4 = 0; this.nb = 0; shape(this); } }
// snare / clap / rim on one instrument (the clap/snare channel). Envelopes are recursive exponentials (one multiply per sample).
class Snare {
  constructor(sr) { this.sr = sr; this.v = Array.from({ length: 6 }, () => new NoiseHitVoice()); this.i = 0;
    this.p = { kind: 'snare', tone: 190, tone2: 330, toneDec: 0.09, toneAmt: 0.55, nDec: 0.16, nHp: 1400, nLp: 8000, snap: 0.5, claps: 3, clapGap: 0.0095, clapF: 1250, clapQ: 1.1, clapTail: 0.18, gain: 1, rimF: 1700, layer: 0 }; shape(this); }
  setKit(k) { Object.assign(this.p, k); }
  // layer (0…1): the other sound of the pair under every hit — a clap under a snare, a snare under a clap — at that level (how a
  // producer stacks a snare: the body and snap of one, the spread of the other)
  trigger(off, vel, kind) { const k = kind === 'clap' ? 1 : kind === 'rim' ? 2 : kind === 'snare' ? 0 : (this.p.kind === 'clap' ? 1 : this.p.kind === 'rim' ? 2 : 0);
    this.start(off, vel, k); if (this.p.layer > 0 && k < 2) this.start(off, vel * this.p.layer, 1 - k); }
  start(off, vel, kind) { const v = pickVoice(this.v); v.on = 1; v.t = 0; v.wait = off; v.vel = vel; v.ph1 = 0; v.ph2 = 0; v.kind = kind;
    const P = this.p, sr = this.sr; v.bp.reset(); v.hp.reset(); v.lp.reset(); v.eB = 0; v.eT = 0; v.e1 = 1; v.e2 = 1; v.e3 = 1; v.e4 = 1; v.nb = 0;
    if (v.kind === 1) { v.bp.set(P.clapF, P.clapQ, sr); v.hp.set(650, 0.7, sr); v.lp.set(7000, 0.7, sr); }
    else if (v.kind === 2) { v.bp.set(P.rimF, 6, sr); v.hp.set(400, 0.7, sr); v.lp.set(9000, 0.7, sr); }
    else { v.hp.set(P.nHp, 0.7, sr); v.lp.set(P.nLp, 0.7, sr); v.bp.set(5000, 0.6, sr); } }
  render(L, R, n) {
    const sr = this.sr, P = this.p, inv = 1 / sr, k = (s) => Math.exp(-1 / (s * sr));
    const kB = k(0.0035), kT = k(P.clapTail), gapN = Math.max(1, Math.round(P.clapGap * sr)), kTone = k(P.toneDec), kN = k(P.nDec), kS = k(0.004), kPd = k(0.006), kR1 = k(0.012), kR2 = k(0.0015);
    const endClap = (P.claps * P.clapGap + P.clapTail * 7) * sr, endSn = Math.max(P.nDec, P.toneDec) * 8 * sr, g = P.gain;
    for (const v of this.v) { if (!v.on) continue;
      for (let i = 0; i < n; i++) { if (v.wait > 0) { v.wait--; continue; }
        const ts = v.t++; let y = 0;
        if (v.kind === 1) { // clap: N bursts (each re-excites the envelope) then a diffuse tail
          const cN = P.claps * gapN;
          if (v.nb < P.claps && ts === v.nb * gapN) { v.eB = 1; v.nb++; }
          if (ts === cN) v.eT = 0.85;
          let e = v.eB; v.eB *= kB; if (ts >= cN) { e += v.eT; v.eT *= kT; } else if (ts > cN - gapN) e += 0.2;
          const nz = noise(); v.bp.run(nz); v.hp.run(v.bp.bp * 1.6 * e); y = (v.lp.run(v.hp.hp), v.lp.lp) * 1.3;
          if (ts > endClap) v.on = 0;
        } else if (v.kind === 2) { // rim / snap: two tuned pings + tick
          v.ph1 += P.rimF * inv; v.ph2 += P.rimF * 0.31 * inv; if (v.ph1 >= 1) v.ph1 -= 1; if (v.ph2 >= 1) v.ph2 -= 1;
          y = (sin1(v.ph1) * 0.7 + sin1(v.ph2) * 0.5) * v.e1 + noise() * v.e2 * 0.4; v.e1 *= kR1; v.e2 *= kR2; v.hp.run(y); y = v.hp.hp;
          if (ts > 0.12 * sr) v.on = 0;
        } else { // snare: tuned body with a small pitch drop + filtered noise with a snap transient
          const pd = 1 + 0.35 * v.e3; v.e3 *= kPd; v.ph1 += P.tone * pd * inv; v.ph2 += P.tone2 * pd * inv; if (v.ph1 >= 1) v.ph1 -= 1; if (v.ph2 >= 1) v.ph2 -= 1;
          const body = (sin1(v.ph1) + 0.6 * sin1(v.ph2)) * v.e1 * P.toneAmt; v.e1 *= kTone;
          v.hp.run(noise()); const nz = (v.lp.run(v.hp.hp), v.lp.lp); const ne = v.e2 * (1 + P.snap * 2 * v.e4); v.e2 *= kN; v.e4 *= kS;
          y = tanh((body + nz * ne * (1 - P.toneAmt * 0.4)) * 1.4);
          if (ts > endSn) v.on = 0;
        }
        y *= v.vel * g; L[i] += y; R[i] += y; if (!v.on) break; } } }
}
// hats: closed / open (choke) / ride / shaker / crash — metal oscillator bank + noise
class MetalVoice { constructor() { this.on = 0; this.t = 0; this.wait = 0; this.vel = 1; this.ph = new Float64Array(6); this.bp = new Svf(); this.hp = new Svf(); this.hp2 = new Svf(); this.dec = 0.05; this.kind = 0; this.pan = 0; this.gl = 1; this.gr = 1; this.atk = 0; this.e = 1; this.e2 = 1; this.k = 0; this.k2 = 0; shape(this); } }
class Hats {
  constructor(sr) { this.sr = sr; this.v = Array.from({ length: 8 }, () => new MetalVoice()); this.i = 0;
    this.p = { base: 410, noise: 0.35, cDec: 0.045, oDec: 0.38, bpF: 10500, hpF: 7200, rideF: 620, rideDec: 1.6, shakF: 8500, shakDec: 0.07, crashDec: 2.2, gain: 1, tone: 0 }; shape(this); }
  setKit(k) { Object.assign(this.p, k); }
  trigger(off, vel, kind, pan) { // kind: 0 closed, 1 open, 2 ride, 3 shaker, 4 crash, 5 pedal
    if (kind === 0 || kind === 5) for (const o of this.v) if (o.on && o.kind === 1 && o.dec > 0.012) { o.dec = 0.012; o.k = Math.exp(-1 / (0.012 * this.sr)); } // choke the open hat
    // one cymbal is one cymbal: a new ride / crash / open-hat strike takes over the ring of the one before it (the older ring
    // fades in 80 ms under the new attack). Measured: rides on 8ths with a 1.6 s decay kept all 8 hat voices ringing
    // (6 oscillators + 3 filters each, every sample) — 11 % of the engine for tails 30–60 dB under the new hit
    if (kind === 1 || kind === 2 || kind === 4) for (const o of this.v) if (o.on && o.kind === kind && o.dec > 0.08) { o.dec = 0.08; o.k = Math.exp(-1 / (0.08 * this.sr)); if (o.e2 > 0) o.k2 = o.k; }
    const v = pickVoice(this.v); const P = this.p, sr = this.sr;
    v.on = 1; v.t = 0; v.wait = off; v.vel = vel; v.kind = kind; for (let k = 0; k < 6; k++) v.ph[k] = noise() * 0.5 + 0.5;
    const pn = clamp(pan || 0, -1, 1); v.gl = Math.cos((pn + 1) * Math.PI / 4) * 1.414; v.gr = Math.sin((pn + 1) * Math.PI / 4) * 1.414; v.atk = 0;
    v.bp.reset(); v.hp.reset(); v.hp2.reset();
    if (kind === 3) { v.dec = P.shakDec; v.bp.set(P.shakF, 0.9, sr); v.hp.set(5000, 0.7, sr); v.atk = 0.006; v.vel *= 0.45; }
    else if (kind === 2) { v.dec = P.rideDec; v.bp.set(P.bpF * 0.75, 0.8, sr); v.hp.set(3500, 0.7, sr); }
    else if (kind === 4) { v.dec = P.crashDec; v.bp.set(7000, 0.5, sr); v.hp.set(3000, 0.7, sr); }
    else { v.dec = kind === 1 ? P.oDec : kind === 5 ? 0.03 : P.cDec; v.bp.set(P.bpF * 0.85, 0.8, sr); v.hp.set(P.hpF * 0.72, 0.7, sr); }
    v.hp2.set(kind === 2 || kind === 4 ? 2500 : P.hpF * 0.5, 0.7, sr); v.e = 1; v.e2 = 1; v.k = Math.exp(-1 / (v.dec * sr)); v.k2 = Math.exp(-1 / ((kind === 2 ? 0.03 : 0.08) * sr)); }
  // (v9.1) a voice's whole state lives in locals for the block: the same arithmetic in the same order as before (Svf.run three
  // times, the six square oscillators, the envelopes) — bit-identical output — without three calls and ~40 object reads and
  // writes per sample per voice. Measured before: the hats were 10 % of the engine on a psytrance drop.
  render(L, R, n) {
    const sr = this.sr, P = this.p, inv = 1 / sr, PN = P.noise, PG = P.gain;
    for (const v of this.v) { if (!v.on) continue;
      const kind = v.kind, metal = kind !== 3, base = kind === 2 ? P.rideF : kind === 4 ? P.base * 1.3 : P.base, ph = v.ph;
      const i0 = base * HAT_RATIOS[0] * inv, i1 = base * HAT_RATIOS[1] * inv, i2 = base * HAT_RATIOS[2] * inv, i3 = base * HAT_RATIOS[3] * inv, i4 = base * HAT_RATIOS[4] * inv, i5 = base * HAT_RATIOS[5] * inv;
      let p0 = ph[0], p1 = ph[1], p2 = ph[2], p3 = ph[3], p4 = ph[4], p5 = ph[5];
      const B = v.bp, H = v.hp, H2 = v.hp2, ba1 = B.a1, ba2 = B.a2, ba3 = B.a3, ha1 = H.a1, ha2 = H.a2, ha3 = H.a3, hk = H.k, ga1 = H2.a1, ga2 = H2.a2, ga3 = H2.a3, gk = H2.k;
      let b1 = B.ic1, b2 = B.ic2, h1 = H.ic1, h2 = H.ic2, g1 = H2.ic1, g2 = H2.ic2;
      let t = v.t, wait = v.wait, ev = v.e, ev2 = v.e2, on = 1; const kk = v.k, kk2 = v.k2, atk = v.atk, vel = v.vel, gl = v.gl, gr = v.gr;
      for (let i = 0; i < n; i++) { if (wait > 0) { wait--; continue; }
        const tt = t * inv; t++; let m = 0;
        if (metal) { p0 += i0; if (p0 >= 1) p0 -= 1; m += p0 < 0.5 ? 1 : -1; p1 += i1; if (p1 >= 1) p1 -= 1; m += p1 < 0.5 ? 1 : -1; p2 += i2; if (p2 >= 1) p2 -= 1; m += p2 < 0.5 ? 1 : -1;
          p3 += i3; if (p3 >= 1) p3 -= 1; m += p3 < 0.5 ? 1 : -1; p4 += i4; if (p4 >= 1) p4 -= 1; m += p4 < 0.5 ? 1 : -1; p5 += i5; if (p5 >= 1) p5 -= 1; m += p5 < 0.5 ? 1 : -1; }
        const nz = noise(), x = metal ? m * (1 - PN) * 0.33 + nz * PN : nz;
        let v3 = x - b2, v1 = ba1 * b1 + ba2 * v3, v2 = b2 + ba2 * b1 + ba3 * v3; b1 = 2 * v1 - b1; b2 = 2 * v2 - b2; // band-pass (Svf.run)
        const xh = v1 * 0.7 + x * 0.3; v3 = xh - h2; v1 = ha1 * h1 + ha2 * v3; v2 = h2 + ha2 * h1 + ha3 * v3; h1 = 2 * v1 - h1; h2 = 2 * v2 - h2; // high-pass
        const xg = xh - hk * v1 - v2; v3 = xg - g2; v1 = ga1 * g1 + ga2 * v3; v2 = g2 + ga2 * g1 + ga3 * v3; g1 = 2 * v1 - g1; g2 = 2 * v2 - g2; // second high-pass
        let y = xg - gk * v1 - v2;
        let e = ev; ev *= kk; if (atk > 0 && tt < atk) e *= tt / atk; if (kind === 2) { e = 0.35 * ev2 + 0.65 * e; ev2 *= kk2; } else if (kind === 4) { e = ev2 * 0.4 + e * 0.6; ev2 *= kk2; }
        y *= e * vel * PG * 1.5; L[i] += y * gl; R[i] += y * gr;
        if (ev < 0.0012 && ((kind !== 2 && kind !== 4) || ev2 < 0.0012)) { on = 0; break; } } // off on the decay envelope only (the attack ramp starts at 0); -58 dB under the hit
      ph[0] = p0; ph[1] = p1; ph[2] = p2; ph[3] = p3; ph[4] = p4; ph[5] = p5; B.ic1 = b1; B.ic2 = b2; H.ic1 = h1; H.ic2 = h2; H2.ic1 = g1; H2.ic2 = g2;
      v.t = t; v.wait = wait; v.e = ev; v.e2 = ev2; if (!on) v.on = 0; } }
}
// percussion: toms, congas/bongos, cowbell, clave/woodblock, tambourine, timbale — pitched bodies + noise
class PercVoice { constructor() { this.on = 0; this.t = 0; this.wait = 0; this.vel = 1; this.ph = 0; this.ph2 = 0; this.f = 200; this.dec = 0.2; this.kind = 0; this.bp = new Svf(); this.gl = 1; this.gr = 1; this.e = 1; this.k = 0; this.ep = 1; this.e3 = 1; this.e4 = 1; this.ph3 = 0; shape(this); } }
const PERC_F = [110, 220, 330, 560, 2500, 1100, 0, 420, 3000, 700, 0, 1450, 190, 85, 0, 120, 70, 330, 160, 95, 2200, 820, 480, 2100, 170, 620, 0, 260, 1050, 0, 0, 105],
  PERC_DEC = [0.32, 0.22, 0.12, 0.09, 0.025, 0.05, 0.12, 0.18, 0.012, 0.22, 0.2, 0.9, 0.3, 0.55, 0.07, 0.22, 0.55, 0.38, 0.3, 0.22, 0.035, 0.06, 0.28, 0.6, 1.6, 0.28, 0.006, 0.12, 0.045, 0.16, 0.08, 0.22]; // no allocation per hit
// the kind index travels in 5 bits of a percussion event (08_deck.js maps it back to a name): 32 kinds at most (v9.4: 16 → 32)
const PERC_KINDS = { tom: 0, conga: 1, bongo: 2, cowbell: 3, clave: 4, wood: 5, tamb: 6, timbale: 7, tick: 8, agogo: 9, guiro: 10, triangle: 11, djembe: 12, taiko: 13, maraca: 14, cajon: 15,
  surdo: 16, tabla: 17, udu: 18, frame: 19, snap: 20, temple: 21, cuica: 22, bell: 23, gong: 24, metal: 25, click: 26, zap: 27, blip: 28, sweep: 29, cabasa: 30, logdrum: 31 };
// level trim per kind on the same velocity (measured: tools/perc_test.cjs). 1 = the level the original nine voices already had
const PERC_TRIM = [1, 1, 1, 1, 1, 1, 1, 1, 1, 0.85, 1.4, 0.57, 0.72, 0.55, 1.7, 0.8, /* v9.4, set against the older kinds by RMS over 150 ms and peak */ 0.9, 0.7, 0.85, 0.8, 0.6, 1.1, 0.9, 0.7, 0.8, 0.8, 1.3, 0.75, 1, 0.3, 1.1, 0.85];
class Perc {
  constructor(sr) { this.sr = sr; this.v = Array.from({ length: 6 }, () => new PercVoice()); this.i = 0; this.p = { gain: 1, pitch: 1, dec: 1, noise: 1 }; shape(this); }
  setKit(k) { Object.assign(this.p, k); }
  trigger(off, vel, kind, note, pan) { const v = pickVoice(this.v); const sr = this.sr;
    v.on = 1; v.t = 0; v.wait = off; v.vel = vel; v.ph = 0; v.ph2 = 0; v.kind = PERC_KINDS[kind] ?? 1; v.bp.reset();
    const pn = clamp(pan || 0, -1, 1); v.gl = Math.cos((pn + 1) * Math.PI / 4) * 1.414; v.gr = Math.sin((pn + 1) * Math.PI / 4) * 1.414;
    const base = note ? mtof(note) : PERC_F[v.kind]; v.f = base * this.p.pitch;
    v.dec = PERC_DEC[v.kind] * (this.p.dec ?? 1); v.vel = vel * PERC_TRIM[v.kind]; v.e = 1; v.k = Math.exp(-1 / (v.dec * sr)); v.ep = 1; v.e3 = 1; v.e4 = 1; v.ph3 = 0;
    if (v.kind === 6) v.bp.set(9000, 0.8, sr); else if (v.kind === 3) v.bp.set(2600, 2.5, sr); else if (v.kind === 10) v.bp.set(3400, 1.4, sr); else if (v.kind === 14) v.bp.set(7000, 0.9, sr); else if (v.kind === 12) v.bp.set(2600, 1, sr); else if (v.kind === 15) v.bp.set(3200, 0.8, sr); else if (v.kind === 19) v.bp.set(1500, 1, sr); else if (v.kind === 20) v.bp.set(2300, 2.2, sr); else if (v.kind === 22) v.bp.set(1100, 2, sr); else if (v.kind === 26) v.bp.set(5200, 1.2, sr); else if (v.kind === 29) v.bp.set(7000, 3, sr); else if (v.kind === 30) v.bp.set(7500, 1, sr); else v.bp.set(v.f * 2.2, 1.2, sr); }
  render(L, R, n) {
    const inv = 1 / this.sr, P = this.p, sr = this.sr, kP = Math.exp(-1 / (0.012 * sr)), k3 = Math.exp(-1 / (0.03 * sr)), k4 = Math.exp(-1 / (0.004 * sr)), kZ = Math.exp(-1 / (0.018 * sr)), NZ = P.noise ?? 1;
    for (const v of this.v) { if (!v.on) continue;
      for (let i = 0; i < n; i++) { if (v.wait > 0) { v.wait--; continue; }
        v.t++; let y = 0; const e = v.e; v.e *= v.k;
        switch (v.kind) {
          case 3: { v.ph += 540 * inv; v.ph2 += 800 * inv; if (v.ph >= 1) v.ph -= 1; if (v.ph2 >= 1) v.ph2 -= 1; v.bp.run((v.ph < 0.5 ? 1 : -1) + (v.ph2 < 0.5 ? 1 : -1)); y = v.bp.bp * e * 0.9; break; }
          case 6: { v.ph3 += 14.3 * inv; if (v.ph3 >= 1) v.ph3 -= 1; v.bp.run(noise()); y = v.bp.bp * e * (1 + sin1(v.ph3)) * 0.9; break; }
          case 4: case 5: case 8: { v.ph += v.f * inv; if (v.ph >= 1) v.ph -= 1; y = sin1(v.ph) * e; break; }
          case 9: { v.ph += v.f * inv; if (v.ph >= 1) v.ph -= 1; v.ph2 += v.f * 1.504 * inv; if (v.ph2 >= 1) v.ph2 -= 1; y = (sin1(v.ph) * 0.8 + sin1(v.ph2) * 0.45) * e; break; } // agogo: two inharmonic bell bars
          case 10: { v.ph3 += 46 * inv; if (v.ph3 >= 1) v.ph3 -= 1; v.bp.run(noise()); y = v.bp.bp * e * (v.ph3 < 0.45 ? 1.4 : 0.25) * NZ; break; } // guiro: scraped noise, ratcheted at 46 Hz
          case 11: { v.ph += v.f * inv; if (v.ph >= 1) v.ph -= 1; v.ph2 += v.f * 2.76 * inv; if (v.ph2 >= 1) v.ph2 -= 1; y = (sin1(v.ph) * 0.8 + sin1(v.ph2) * 0.2 * v.e3) * e; v.e3 *= k3; break; } // triangle: a long ring, the upper partial dies first
          case 12: { const pd = 1 + 0.6 * v.ep; v.ep *= kP; v.ph += v.f * pd * inv; if (v.ph >= 1) v.ph -= 1; v.bp.run(noise()); y = sin1(v.ph) * e + v.bp.bp * v.e4 * 0.9 * NZ; v.e4 *= k4; break; } // djembe: a falling body and a slap
          case 14: { v.bp.run(noise()); y = v.bp.bp * e * 1.5 * NZ; break; } // maraca: a short band of noise
          // (v9.4) sixteen more
          case 17: { const pd = 1 + 0.04 * (1 - v.ep); v.ep *= kP; v.ph += v.f * pd * inv; if (v.ph >= 1) v.ph -= 1; v.ph2 += v.f * 2 * pd * inv; if (v.ph2 >= 1) v.ph2 -= 1; v.ph3 += v.f * 3 * pd * inv; if (v.ph3 >= 1) v.ph3 -= 1; v.bp.run(noise()); y = (sin1(v.ph) + 0.5 * sin1(v.ph2) * v.e3 + 0.3 * sin1(v.ph3) * v.e3) * e + v.bp.bp * v.e4 * 0.5 * NZ; v.e3 *= k3; v.e4 *= k4; break; } // tabla: a harmonic, slightly rising ring and a slap
          case 18: { const pd = 0.75 + 0.45 * (1 - v.ep); v.ep *= k3; v.ph += v.f * pd * inv; if (v.ph >= 1) v.ph -= 1; v.ph2 += v.f * 1.5 * pd * inv; if (v.ph2 >= 1) v.ph2 -= 1; y = (sin1(v.ph) + 0.2 * sin1(v.ph2)) * e; break; } // udu: the bubble — the pitch rises as the air moves
          case 19: { const pd = 1 + 0.3 * v.ep; v.ep *= kP; v.ph += v.f * pd * inv; if (v.ph >= 1) v.ph -= 1; v.bp.run(noise()); y = sin1(v.ph) * e + v.bp.bp * v.e4 * 1.2 * NZ; v.e4 *= k3; break; } // frame drum: a low thud and a long slap
          case 20: { v.bp.run(noise()); y = v.bp.bp * e * 2.2 * NZ + (v.t < 5 ? 0.7 * (1 - v.t / 5) : 0); break; } // finger snap: a narrow band of noise and a click
          case 21: { v.ph += v.f * inv; if (v.ph >= 1) v.ph -= 1; v.ph2 += v.f * 2.43 * inv; if (v.ph2 >= 1) v.ph2 -= 1; y = (sin1(v.ph) * 0.8 + sin1(v.ph2) * 0.35 * v.e4) * e; v.e4 *= k3; break; } // temple block: two hollow wood tones
          case 22: { const env = 1 - v.ep; v.ep *= k3; const pd = 0.6 + 0.9 * env * (1.2 - env); v.ph += v.f * pd * inv; if (v.ph >= 1) v.ph -= 1; const x = v.ph < 0.5 ? 4 * v.ph - 1 : 3 - 4 * v.ph; v.bp.run(x); y = (v.bp.bp * 1.6 + x * 0.2) * e; break; } // cuica: a friction squeak that rises and falls
          case 23: { v.ph += v.f * inv; if (v.ph >= 1) v.ph -= 1; v.ph2 += v.f * 2.76 * inv; if (v.ph2 >= 1) v.ph2 -= 1; v.ph3 += v.f * 5.4 * inv; if (v.ph3 >= 1) v.ph3 -= 1; y = (sin1(v.ph) * 0.7 + sin1(v.ph2) * 0.4 + sin1(v.ph3) * 0.2 * v.e3) * e; v.e3 *= k3; break; } // bell: a small hand bell
          case 24: { v.ph += v.f * inv; if (v.ph >= 1) v.ph -= 1; v.ph2 += v.f * 1.483 * inv; if (v.ph2 >= 1) v.ph2 -= 1; v.ph3 += v.f * 2.09 * inv; if (v.ph3 >= 1) v.ph3 -= 1; y = (sin1(v.ph) * 0.6 + sin1(v.ph2) * 0.5 * (0.6 + 0.4 * v.e3) + sin1(v.ph3) * 0.35 * v.e3) * e * (0.85 + 0.15 * sin1((v.t * inv * 3.1) % 1)); v.e3 *= kP; break; } // gong: beating inharmonic modes
          case 25: { v.ph += v.f * inv; if (v.ph >= 1) v.ph -= 1; v.ph2 += v.f * 2.71 * inv; if (v.ph2 >= 1) v.ph2 -= 1; v.ph3 += v.f * 5.43 * inv; if (v.ph3 >= 1) v.ph3 -= 1; y = (sin1(v.ph) * 0.5 + sin1(v.ph2) * 0.45 + sin1(v.ph3) * 0.35 * v.e3) * e + noise() * v.e4 * 0.5 * NZ; v.e3 *= k3; v.e4 *= k4; break; } // metal: a struck pipe
          case 26: { v.bp.run(noise()); y = v.bp.bp * e * 2.5; break; } // click: a digital tick
          case 27: { const pd = 1 + 7 * v.ep; v.ep *= kZ; v.ph += v.f * pd * inv; if (v.ph >= 1) v.ph -= 1; y = sin1(v.ph) * e; break; } // zap: a laser pitch dive
          case 28: { const pd = 1 + 0.12 * v.ep; v.ep *= k4; v.ph += v.f * pd * inv; if (v.ph >= 1) v.ph -= 1; y = sin1(v.ph) * e; break; } // blip: a pure, short sine
          case 29: { if ((v.t & 15) === 1) v.bp.set(900 + 7000 * e * e, 3, sr); v.bp.run(noise()); y = v.bp.bp * e * 2 * NZ; break; } // sweep: noise through a band falling with the hit
          case 30: { v.ph3 += 61 * inv; if (v.ph3 >= 1) v.ph3 -= 1; v.bp.run(noise()); y = v.bp.bp * e * (v.ph3 < 0.5 ? 1.5 : 0.4) * NZ; break; } // cabasa: metal beads, a fast ratchet
          case 31: { const pd = 1 + 0.6 * v.ep; v.ep *= kP; v.ph += v.f * pd * inv; if (v.ph >= 1) v.ph -= 1; v.ph2 += v.f * 2.02 * pd * inv; if (v.ph2 >= 1) v.ph2 -= 1; y = (sin1(v.ph) + 0.35 * sin1(v.ph2) * v.e3) * e; v.e3 *= k3; break; } // log drum: a falling wooden note
          default: { const pd = 1 + (v.kind === 0 ? 0.5 : 0.25) * v.ep; v.ep *= kP; v.ph += v.f * pd * inv; if (v.ph >= 1) v.ph -= 1; v.ph2 += v.f * 1.52 * pd * inv; if (v.ph2 >= 1) v.ph2 -= 1;
            y = (sin1(v.ph) + 0.25 * sin1(v.ph2) * v.e3) * e; v.e3 *= k3; if (v.kind === 1 || v.kind === 2 || v.kind === 15) { v.bp.run(noise()); y += v.bp.bp * v.e4 * 0.8 * NZ; v.e4 *= k4; } }
        }
        y *= v.vel * P.gain; L[i] += y * v.gl; R[i] += y * v.gr; if (e < 0.0005) { v.on = 0; break; } } } }
}
