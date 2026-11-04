/* ===================== EAR CANDY — rebuilt to the Bubbles standard (v9.5) =====================
   9.4's zap, rise, swirl, squelch and laser were single raw gestures (a noise band, one FM chirp) — heard as basic. What made
   Bubbles work is kept for all of them: every sound is a short PHRASE of notes from the chord that is playing (the resonator's
   pitch-class mask), placed on a grid of the beat (the duration divided evenly), moving across the stereo field, and played into
   the candy's own ping-pong echo (and the deck's reverb send) so it sits inside the track's space.
   GLASS   (zap)     a falling arpeggio of FM bells: an inharmonic modulator (×3.5) whose index decays — a bright strike that rings pure
   HARP    (rise)    a rising arpeggio of plucked strings (Karplus–Strong), accelerating and brightening as it climbs
   WIND    (swirl)   noise through two resonant combs tuned to the chord's root and fifth: a swell of tuned air that turns in the field
   ACID    (squelch) a 303-style phrase — root, root, octave, fifth — with slides and an accented, resonant, driven low-pass
   PING    (laser)   a plucked note thrown left and right in triplets, darker each time, the last one an octave up (a sparkle)
   Every note has a 1 ms attack and its own decay (no clicks); the phrase's level is set per kind (tools/candy_test.cjs). */
const CANDY_KS = 2400; // the plucked string's delay memory (samples: down to ~18 Hz at 44.1 kHz)
class CandyNote { constructor() { this.on = 0; this.at = 0; this.t = 0; this.f = 220; this.ft = 220; this.ph = 0; this.ph2 = 0; this.e = 0; this.k = 1; this.ix = 0; this.ik = 1; this.gl = 1; this.gr = 1; this.g = 1;
  this.ks = new Float32Array(CANDY_KS); this.kn = 100; this.ki = 0; this.kz = 0; this.kd = 0.5; this.svf = new Svf(); this.acc = 0; this.len = 1; shape(this); } }
class CandyVoice {
  constructor(sr) { this.sr = sr; this.on = 0; this.kind = 0; this.t = 0; this.wait = 0; this.dur = 1; this.vel = 1; this.n = []; for (let k = 0; k < 6; k++) this.n.push(new CandyNote()); this.seq = []; this.si = 0;
    this.c1 = new Float32Array(2048); this.c2 = new Float32Array(2048); this.ci = 0; this.d1 = 100; this.d2 = 66; this.lp1 = 0; this.lp2 = 0; this.pn = 0; this.kill = 0; this.ni = 0; shape(this); }
  // the phrase: [time (samples from the start), frequency, gain, pan] — written once at the trigger
  trigger(off, kind, vel, dur, note, pan, mask, root) { const sr = this.sr; this.on = 1; this.kill = 0; this.kind = kind; this.t = 0; this.wait = off; this.dur = Math.max(64, dur); this.vel = vel; this.si = 0; this.ni = 0; for (const c of this.n) c.on = 0;
    // the chord tones over the note (an octave and a half): the note's own pitch class is the anchor, the chord's tones around it
    const base = note > 0 ? note : 60, T = []; for (let m = base - 7; m <= base + 19; m++) if (mask & (1 << (((m % 12) + 12) % 12))) T.push(m); if (T.length < 3) for (const d of [0, 3, 7, 12, 15, 19]) T.push(base + d); T.sort((a, b) => a - b);
    const near = (m) => { let b = T[0]; for (const x of T) if (Math.abs(x - m) < Math.abs(b - m)) b = x; return b; }, idx = T.indexOf(near(base)), at = (k, N) => Math.round(this.dur * k / N), P = pan || 0, S = this.seq = [];
    if (kind === 7) { const N = 6; for (let k = 0; k < N; k++) { const m = T[Math.max(0, Math.min(T.length - 1, idx + 3 - k))]; S.push([at(k, N), mtof(m + 12), 0.85 - 0.08 * k, clamp(P + (k & 1 ? 0.55 : -0.55) * (1 - k / N), -1, 1)]); } }
    else if (kind === 8) { const N = 8; for (let k = 0; k < N; k++) { const m = T[Math.max(0, Math.min(T.length - 1, idx - 2 + k))]; S.push([Math.round(this.dur * Math.pow(k / N, 0.78)), mtof(m), 0.55 + 0.45 * k / N, clamp(-0.7 + 1.4 * k / (N - 1), -1, 1) * 0.8]); } }
    else if (kind === 11) { let r = base - (((base - root) % 12) + 12) % 12; if (r < base - 7) r += 12; const fifth = near(r + 7), seq = [r, r, r + 12, fifth]; for (let k = 0; k < 4; k++) S.push([at(k, 4), mtof(seq[k] - 12), k === 2 ? 1 : 0.8, P * 0.5, k === 2 ? 1 : 0, k === 3 ? 1 : 0]); }
    else if (kind === 12) { const N = 5, m = T[idx]; for (let k = 0; k < N; k++) S.push([at(k, N + 1), mtof(k === N - 1 ? m + 12 : m), Math.pow(0.72, k) * (k === N - 1 ? 0.8 : 1), k & 1 ? 0.75 : -0.75]); }
    else { this.d1 = clamp(sr / mtof(T[Math.max(0, idx - 1)] + 12), 8, 2040); this.d2 = clamp(sr / mtof(near(T[Math.max(0, idx - 1)] + 7) + 12), 8, 2040); this.c1.fill(0); this.c2.fill(0); this.lp1 = this.lp2 = 0; this.pn = P; } }
  start(s) { const c = this.n[this.ni]; this.ni = (this.ni + 1) % this.n.length; const sr = this.sr, [, f, g, pn] = s, kind = this.kind; c.on = 1; c.t = 0; c.f = f; c.ft = f; c.g = g; c.e = 0; c.ph = 0; c.ph2 = 0; c.acc = s[4] || 0;
    c.gl = Math.cos((pn + 1) * Math.PI / 4) * 1.414; c.gr = Math.sin((pn + 1) * Math.PI / 4) * 1.414;
    if (kind === 7) { c.k = Math.exp(-1 / (0.2 * sr)); c.ix = 3.2; c.ik = Math.exp(-1 / (0.035 * sr)); }
    else if (kind === 8 || kind === 12) { c.kn = clamp(Math.round(sr / f), 8, CANDY_KS - 1); c.ki = 0; c.kz = 0; let z1 = 0, z2 = 0; for (let i = 0; i < c.kn; i++) { z1 += (noise() - z1) * 0.5; z2 += (z1 - z2) * 0.5; c.ks[i] = z2 * 1.6 * Math.sin(Math.PI * i / c.kn); } /* (a burst low-passed twice and windowed: a round pluck, not a click) */ c.kd = kind === 8 ? 0.45 + 0.25 * g : 0.6 - 0.12 * this.ni; c.k = Math.exp(-1 / ((kind === 8 ? 0.6 : 0.35) * sr)); }
    else if (kind === 11) { const prev = this.n[(this.ni + this.n.length - 2) % this.n.length]; const sp = this.dur / 4; if (s[5] && prev.on) { prev.ft = f; prev.acc = c.acc; prev.len += sp; c.on = 0; return; } c.len = sp * 0.85; c.k = Math.exp(-1 / (0.11 * sr)); c.svf.reset(); } }
  render(oL, oR, n, gain) { const sr = this.sr, inv = 1 / sr, atk = (this.kind === 8 || this.kind === 12 ? 0.003 : 0.001) * sr; /* (a pluck's attack over 3 ms: round, not spiky) */ let alive = 0;
    for (let i = 0; i < n; i++) { if (this.wait > 0) { this.wait--; continue; } const t = this.t++; while (this.si < this.seq.length && this.seq[this.si][0] <= t) this.start(this.seq[this.si++]);
      let yl = 0, yr = 0;
      if (this.kind === 10) { const p = t / this.dur; if (p < 1.6) { const a = Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, p / 1.2))), 1.5), N = 2048, j1 = (this.ci - Math.round(this.d1) + N) & (N - 1), j2 = (this.ci - Math.round(this.d2) + N) & (N - 1), x = noise() * 0.12 * a;
          this.lp1 += (this.c1[j1] - this.lp1) * 0.55; this.lp2 += (this.c2[j2] - this.lp2) * 0.55; this.c1[this.ci] = x + this.lp1 * 0.965; this.c2[this.ci] = x + this.lp2 * 0.96; this.ci = (this.ci + 1) & (N - 1);
          const pn = clamp(this.pn + 0.8 * Math.sin(TAU * p * 1.5), -1, 1), gl = Math.cos((pn + 1) * Math.PI / 4) * 1.414, gr = Math.sin((pn + 1) * Math.PI / 4) * 1.414, y1 = this.lp1, y2 = this.lp2; yl = (y1 * 0.8 + y2 * 0.4) * gl; yr = (y2 * 0.8 + y1 * 0.4) * gr; alive = 1; } }
      else for (const c of this.n) { if (!c.on) continue; alive = 1; const ct = c.t++; const a = ct < atk ? ct / atk : 1; let y = 0;
        if (this.kind === 7) { c.ph += c.f * inv; if (c.ph >= 1) c.ph -= 1; c.ph2 += c.f * 3.5 * inv; if (c.ph2 >= 1) c.ph2 -= 1; c.e = ct < atk ? a : c.e * c.k; y = sin1(c.ph + 0.16 * c.ix * sin1(c.ph2)) * c.e * c.g; c.ix *= c.ik; if (c.e < 1e-4 && ct > atk) c.on = 0; }
        else if (this.kind === 8 || this.kind === 12) { const j = c.ki, nx = j + 1 === c.kn ? 0 : j + 1, v = (c.ks[j] + c.ks[nx]) * 0.5; c.kz += (v - c.kz) * c.kd; c.ks[j] = c.kz * 0.996; c.ki = nx; c.e = ct < atk ? a : (c.e || 1) * c.k; y = c.kz * c.e * c.g * 1.6; if (ct > sr * 1.5) c.on = 0; }
        else { c.f += (c.ft - c.f) * 0.004; c.ph += c.f * inv; if (c.ph >= 1) c.ph -= 1; c.e = ct < atk ? a : c.e * c.k; if ((ct & 15) === 0) c.svf.set(c.f * (1.3 + (6 + 10 * c.acc) * c.e), 7 + 4 * c.acc, sr); c.svf.run(2 * c.ph - 1); y = tanh(c.svf.lp * (1.4 + c.acc)) * Math.max(c.e, 0.12) * c.g * 0.7 * (ct > c.len ? Math.max(0, 1 - (ct - c.len) / (0.004 * sr)) : 1); if (ct > c.len + 0.004 * sr) c.on = 0; }
        yl += y * c.gl; yr += y * c.gr; }
      if (this.kill) { const g = this.kill / 220; yl *= g; yr *= g; if (--this.kill === 0) { this.on = 0; for (const c of this.n) c.on = 0; return; } }
      oL[i] += yl * this.vel * gain; oR[i] += yr * this.vel * gain; }
    if (!alive && this.si >= this.seq.length && this.wait <= 0 && (this.kind !== 10 || this.t > this.dur * 1.6)) this.on = 0; }
}
