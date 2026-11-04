/* ===================== (v9.5) TRANSITIONS: a layered riser / downlifter / impact engine =====================
   9.4 had one noise riser, one downlifter and one impact — every build sounded like the last. A transition is now a RECIPE run by
   one voice that can layer, all locked to the tempo and the key of the track:
     noise   a band-pass, high-pass or resonant low-pass band sweeping up (or down) on its own curve, decorrelated left/right
     synth   1–7 band-limited saws or squares (polyBLEP) a few cents apart, climbing (or falling) 0–4 octaves through a filter that opens
     tonal   a staircase through the chord's own tones (root, third, fifth, octave …), one step per beat or half beat — a riser in key
     roll    a snare/clap roll whose rate accelerates (1/4 → 1/32 …), every hit its own noise (no machine-gun repeat)
     gate    a 1/4, 1/8, 1/16 or accelerating trance gate, smoothed over ~1.5 ms (no clicks)
     width   from narrow to wide as it rises
   plus three one-shot types: SUB DROP (a sine diving 1–2 octaves under the drop, tuned to the key), IMPACT (a boom tuned to the key,
   a crack, a long noise tail; a metal ring on some) and SWELL (the chord's tones swelling into a cut). A recipe is chosen by the
   composer per build from the genre family's own list, and never twice in one track (planTx). The level of every recipe is measured
   against 9.4's riser by tools/riser_test.cjs. Event fields: a = 13, f = recipe index, x = the key's note, y = the chord's third (3 or 4). */
const TX_DEF = { type: 'rise', g: 1, nz: 0, nzT: 0, f0: 300, f1: 9000, q: 1.4, syn: 0, sv: 5, sw: 0, det: 18, so: 0, oct: 2, sf0: 600, sf1: 9000, sq: 0.8, ton: 0, tpb: 1, roll: 0, r0: 4, r1: 0.5, rf: 1900,
  gate: 0, gd: 0.85, crv: 2, pc: 1, w0: 0.5, w1: 1, spl: 1.04, clap: 0, boom: 0, bd: 1, crack: 0, cf: 2500, tail: 0, td: 1.5, met: 0, drv: 1.4, fam: '' };
const TX_RECIPES = [
  // ---- RISERS (type rise, up) ----
  { id: 'white-lift', g: 1.11, fam: 'house garage afro latin pop breaks', nz: 1, nzT: 0, f0: 400, f1: 9000, q: 1.4, crv: 2.2, w0: 0.4, w1: 1 },
  { id: 'saw-uplift', g: 1.19, fam: 'house pop trance garage latin', syn: 0.8, sv: 5, det: 18, oct: 2, sf0: 600, sf1: 9000, nz: 0.4, nzT: 1, f0: 1000, f1: 12000, crv: 1.8 },
  { id: 'snare-uplift', g: 1.63, fam: 'house pop trance hard garage afro latin', roll: 0.9, r0: 4, r1: 0.5, nz: 0.5, f0: 500, f1: 7000, crv: 1.6 },
  { id: 'gated-lift', g: 2.04, fam: 'house trance techno pop', nz: 0.6, f0: 300, f1: 8000, syn: 0.5, oct: 1, gate: 16, gd: 0.9, crv: 1.5 },
  { id: 'tonal-climb', g: 0.92, fam: 'house trance pop afro chill', ton: 0.9, tpb: 1, syn: 0.3, oct: 1, nz: 0.3, nzT: 1, f0: 2000, f1: 12000, crv: 1.4 },
  { id: 'filter-sweep-up', g: 0.52, fam: 'house techno breaks garage', nz: 0.9, nzT: 2, f0: 200, f1: 14000, q: 4, crv: 1.2, w0: 0.6, w1: 1 },
  { id: 'disco-strings-rise', g: 1.38, fam: 'house pop', syn: 0.7, sv: 7, det: 10, oct: 1, sf0: 1500, sf1: 12000, ton: 0.4, crv: 1.5 },
  { id: 'clap-roll-rise', g: 1.74, fam: 'house garage afro latin hiphop', roll: 0.9, rf: 1150, clap: 1, r0: 4, r1: 1, nz: 0.3, nzT: 1, f0: 1500, f1: 10000, crv: 1.5 },
  { id: 'dark-noise-rise', g: 1.30, fam: 'techno hard psy dnb bass', nz: 1, f0: 150, f1: 3500, q: 2.5, crv: 2.6, w0: 0.2, w1: 0.8 },
  { id: 'metallic-rise', g: 1.10, fam: 'techno hard breaks', syn: 0.5, sw: 1, sv: 3, det: 35, oct: 3, sf0: 300, sf1: 4000, sq: 2, nz: 0.4, f0: 600, f1: 6000, crv: 2.2 },
  { id: 'gated-noise-16', g: 1.06, fam: 'techno trance psy hard', nz: 0.9, nzT: 1, f0: 300, f1: 6000, gate: 16, gd: 1, crv: 1.6 },
  { id: 'accel-gate', g: 2.04, fam: 'techno trance psy hard bass', nz: 0.8, f0: 400, f1: 8000, gate: -1, gd: 0.95, crv: 1.8 },
  { id: 'sub-rumble-rise', g: 1.51, fam: 'techno dnb bass hiphop', syn: 0.6, sw: 2, sv: 2, so: -24, oct: 2, sf0: 200, sf1: 3000, nz: 0.4, nzT: 2, f0: 100, f1: 3000, q: 1.2, crv: 2 },
  { id: 'industrial-rise', g: 0.71, fam: 'techno hard', nz: 0.8, f0: 600, f1: 5000, q: 6, syn: 0.3, sw: 1, sv: 2, oct: 2, crv: 2.4 },
  { id: 'hypno-tonal', g: 1.13, fam: 'techno psy trance', ton: 0.8, tpb: 0.5, nz: 0.3, f0: 500, f1: 6000, crv: 1.5 },
  { id: 'supersaw-rise', g: 0.96, fam: 'trance hard pop house', syn: 0.85, sv: 7, det: 30, oct: 2, sf0: 800, sf1: 12000, nz: 0.5, nzT: 1, f0: 1500, f1: 12000, roll: 0.5, r0: 2, r1: 0.5, crv: 1.6 },
  { id: 'psy-zap-rise', g: 1.94, fam: 'psy trance', syn: 0.6, sv: 1, oct: 4, sf0: 2000, sf1: 12000, sq: 3, nz: 0.3, f0: 800, f1: 8000, crv: 2.8, pc: 2 },
  { id: 'psy-acid-rise', g: 1.08, fam: 'psy techno', syn: 0.7, sw: 1, sv: 1, oct: 2, sf0: 200, sf1: 6000, sq: 8, gate: 16, gd: 0.5, crv: 2 },
  { id: 'gated-supersaw', g: 2.16, fam: 'trance psy pop hard', syn: 0.75, sv: 5, det: 20, oct: 1, sf0: 600, sf1: 8000, gate: 16, gd: 0.85, ton: 0.3, crv: 1.5 },
  { id: 'euphoric-climb', g: 0.92, fam: 'trance pop hard', ton: 0.8, tpb: 0.5, roll: 0.5, r0: 2, r1: 0.5, syn: 0.6, sv: 7, oct: 2, nz: 0.3, nzT: 1, f0: 2000, f1: 12000, crv: 1.4 },
  { id: 'wide-swirl-rise', g: 0.64, fam: 'psy trance techno', nz: 0.9, f0: 300, f1: 9000, q: 6, spl: 1.6, crv: 1.9, w0: 1, w1: 1 },
  { id: 'reese-rise', g: 1.48, fam: 'dnb bass breaks', syn: 0.75, sv: 3, det: 40, so: -12, oct: 2, sf0: 200, sf1: 3000, nz: 0.4, f0: 300, f1: 5000, crv: 2 },
  { id: 'dnb-snare-roll', g: 1.57, fam: 'dnb breaks bass hiphop', roll: 1, r0: 2, r1: 0.25, nz: 0.3, nzT: 1, f0: 1500, f1: 10000, crv: 1.5 },
  { id: 'siren-rise', g: 1.82, fam: 'dnb bass hiphop latin', syn: 0.6, sw: 2, sv: 1, oct: 3, pc: 0.7, crv: 1.8 },
  { id: 'tape-rise', g: 2.29, fam: 'hiphop chill breaks', nz: 0.5, nzT: 2, f0: 300, f1: 5000, q: 1, syn: 0.4, sw: 2, sv: 2, oct: 1, gate: 8, gd: 0.4, crv: 2 },
  { id: 'breaks-filter-rise', g: 0.83, fam: 'breaks dnb garage', nz: 0.8, f0: 200, f1: 10000, q: 3, roll: 0.5, r0: 4, r1: 1, crv: 1.7 },
  { id: 'growl-rise', g: 1.15, fam: 'bass dnb hiphop', syn: 0.7, sw: 1, sv: 2, det: 25, so: -12, oct: 3, sf0: 300, sf1: 5000, sq: 4, gate: -1, gd: 0.6, crv: 2 },
  { id: 'air-rise', g: 1.38, fam: 'chill ambient pop afro', nz: 0.6, nzT: 1, f0: 2000, f1: 12000, q: 0.7, ton: 0.3, crv: 1.6, w0: 1, w1: 1 },
  { id: 'shimmer-swell-rise', g: 1.19, fam: 'chill ambient trance', ton: 0.6, tpb: 2, so: 12, syn: 0.4, sw: 2, sv: 3, oct: 1, sf0: 2000, sf1: 8000, nz: 0.2, nzT: 1, f0: 3000, f1: 12000, crv: 1.3 },
  { id: 'soft-tape-swell', g: 2.15, fam: 'chill ambient hiphop', nz: 0.5, nzT: 2, f0: 400, f1: 3000, syn: 0.3, sw: 2, sv: 2, oct: 0, crv: 1.8 },
  { id: 'screech-rise', g: 0.99, fam: 'hard trance psy', syn: 0.8, sv: 5, det: 25, oct: 3, sf0: 1000, sf1: 12000, sq: 2, nz: 0.5, nzT: 1, f0: 1500, f1: 12000, roll: 0.6, r0: 1, r1: 0.25, crv: 1.8 },
  { id: 'big-snare-build', g: 1.25, fam: 'hard house pop trance', roll: 1, r0: 4, r1: 0.25, syn: 0.5, sv: 7, oct: 2, nz: 0.5, f0: 500, f1: 9000, crv: 1.5 },
  { id: 'pump-rise', g: 1.19, fam: 'house techno afro latin garage', nz: 0.8, nzT: 1, f0: 800, f1: 12000, syn: 0.4, sw: 2, sv: 1, so: -12, oct: 1, gate: 4, gd: 0.8, crv: 1.7 },
  { id: 'stutter-rise', g: 2.37, fam: 'bass hard techno pop breaks', syn: 0.5, sv: 5, oct: 2, nz: 0.5, f0: 400, f1: 8000, gate: -1, gd: 1, crv: 1.4 },
  // ---- DOWNLIFTERS (type down) ----
  { id: 'noise-fall', g: 1.11, type: 'down', fam: '*', nz: 1, f0: 9000, f1: 250, crv: 1.8 },
  { id: 'saw-fall', g: 1.43, type: 'down', fam: 'house trance pop hard', syn: 0.7, sv: 5, oct: -2, so: 12, sf0: 9000, sf1: 400, nz: 0.3, f0: 8000, f1: 400, crv: 1.6 },
  { id: 'filter-fall', g: 0.64, type: 'down', fam: 'house techno garage breaks', nz: 0.9, nzT: 2, f0: 14000, f1: 150, q: 3, crv: 1.5 },
  { id: 'zap-fall', g: 1.92, type: 'down', fam: 'psy techno dnb bass', syn: 0.6, sv: 1, so: 24, oct: -4, sf0: 6000, sf1: 800, pc: 0.5, crv: 1.4 },
  { id: 'gated-fall', g: 1.92, type: 'down', fam: 'trance techno psy', nz: 0.8, f0: 8000, f1: 300, gate: 16, gd: 0.8, crv: 1.6 },
  { id: 'tonal-fall', g: 1.07, type: 'down', fam: 'house trance pop afro chill', ton: 0.8, tpb: 1, nz: 0.3, nzT: 1, f0: 9000, f1: 1500, crv: 1.3 },
  { id: 'dark-fall', g: 1.34, type: 'down', fam: 'techno hard dnb bass hiphop', nz: 0.8, f0: 2500, f1: 80, q: 2.5, syn: 0.4, sw: 2, sv: 1, so: -12, oct: -2, crv: 1.8 },
  { id: 'air-fall', g: 1.26, type: 'down', fam: 'chill ambient pop afro', nz: 0.6, nzT: 1, f0: 12000, f1: 1500, q: 0.7, crv: 1.4, w0: 1, w1: 1 },
  { id: 'siren-fall', g: 2.02, type: 'down', fam: 'dnb bass hiphop latin', syn: 0.6, sw: 2, sv: 1, so: 24, oct: -3, crv: 1.5 },
  { id: 'tape-fall', g: 1.66, type: 'down', fam: 'hiphop chill breaks garage', syn: 0.5, sv: 3, oct: -1, nz: 0.5, nzT: 2, f0: 3000, f1: 200, crv: 0.8 },
  // ---- SUB DROPS (type sub) ----
  { id: 'sub-drop-2oct', g: 1.35, type: 'sub', fam: '*', so: -12, oct: -2, crv: 1.2, pc: 0.6, drv: 1.6 },
  { id: 'sub-drop-1oct', g: 1.35, type: 'sub', fam: 'house techno garage afro latin', so: -12, oct: -1, crv: 1.6, pc: 0.8, drv: 1.3 },
  { id: 'sub-boom-drop', g: 1.26, type: 'sub', fam: 'bass dnb hiphop hard trance', so: -12, oct: -2, crv: 0.9, pc: 0.4, drv: 2.4, crack: 0.3 },
  { id: 'sub-drop-long', g: 1.35, type: 'sub', fam: 'trance psy chill ambient pop', so: -12, oct: -2, crv: 0.7, pc: 1, drv: 1.2 },
  // ---- IMPACTS (type impact) ----
  { id: 'boom-deep', g: 0.82, type: 'impact', fam: '*', boom: 1, bd: 1.6, crack: 0.3, cf: 2500, tail: 0.5, td: 2 },
  { id: 'boom-short', g: 0.98, type: 'impact', fam: 'house techno garage afro latin breaks', boom: 0.9, bd: 0.6, crack: 0.4, cf: 3000, tail: 0.3, td: 0.8 },
  { id: 'crack-hit', g: 0.87, type: 'impact', fam: 'house pop trance hard dnb', boom: 0.5, bd: 0.8, crack: 1, cf: 3500, tail: 0.7, td: 1.5 },
  { id: 'cinema-hit', g: 0.67, type: 'impact', fam: 'trance pop hard ambient chill', boom: 1, bd: 2.5, crack: 0.4, cf: 2000, tail: 1, td: 3.5, w1: 1 },
  { id: 'dark-thud', g: 1.00, type: 'impact', fam: 'techno dnb bass hiphop', boom: 0.9, bd: 1.2, crack: 0.25, cf: 800, tail: 0.4, td: 1.2 },
  { id: 'noise-burst', g: 1.07, type: 'impact', fam: 'breaks dnb techno psy', boom: 0.2, bd: 0.4, crack: 0.9, cf: 8000, tail: 0.8, td: 0.8 },
  { id: 'metal-hit', g: 0.99, type: 'impact', fam: 'techno hard breaks', boom: 0.6, bd: 0.9, crack: 0.5, cf: 4000, tail: 0.5, td: 2.2, met: 1 },
  { id: 'psy-hit', g: 0.99, type: 'impact', fam: 'psy trance techno', boom: 0.8, bd: 1, crack: 0.3, cf: 2000, tail: 0.4, td: 1.2, syn: 0.5, so: 24, oct: -3 },
  // ---- SWELLS (type swell: the chord's tones swelling into a cut) ----
  { id: 'chord-swell', g: 0.38, type: 'swell', fam: 'house trance pop afro chill ambient', ton: 1, nz: 0.3, nzT: 1, f0: 1500, f1: 9000, crv: 4 },
  { id: 'reverse-swell', g: 0.49, type: 'swell', fam: '*', ton: 0.6, nz: 0.8, f0: 600, f1: 10000, crv: 6 },
  { id: 'air-swell', g: 0.55, type: 'swell', fam: 'chill ambient pop trance', ton: 0.4, nz: 0.6, nzT: 1, f0: 3000, f1: 12000, q: 0.7, crv: 3.5, w0: 1, w1: 1 },
  { id: 'dark-swell', g: 0.49, type: 'swell', fam: 'techno dnb bass hard psy', ton: 0.8, so: -12, nz: 0.5, nzT: 2, f0: 200, f1: 3000, crv: 4.5 },
  { id: 'bright-swell', g: 0.39, type: 'swell', fam: 'trance pop house hard', ton: 0.9, so: 12, syn: 0.4, sv: 5, oct: 0, sf0: 3000, sf1: 12000, nz: 0.3, nzT: 1, f0: 4000, f1: 12000, crv: 4 },
  { id: 'gated-swell', g: 0.61, type: 'swell', fam: 'trance techno psy house', ton: 0.8, nz: 0.4, f0: 800, f1: 8000, gate: 16, gd: 0.9, crv: 3 },
  // ---- WASHES (type wash: a noise wash that rises and falls) ----
  { id: 'noise-wash', g: 0.34, type: 'wash', fam: '*', nz: 0.9, nzT: 1, f0: 600, f1: 6000, crv: 1.2 },
  { id: 'air-wash', g: 0.45, type: 'wash', fam: 'chill ambient trance pop', nz: 0.8, nzT: 1, f0: 3000, f1: 12000, q: 0.7, crv: 1.4, w0: 1, w1: 1 },
  { id: 'dark-wash', g: 0.87, type: 'wash', fam: 'techno dnb bass hard psy', nz: 0.9, nzT: 2, f0: 150, f1: 2500, q: 2, crv: 1.2 },
  { id: 'tape-wash', g: 1.01, type: 'wash', fam: 'hiphop chill breaks garage', nz: 0.8, nzT: 2, f0: 500, f1: 4000, q: 1, crv: 1.6 }];
const TX_TYPES = ['rise', 'down', 'sub', 'impact', 'swell', 'wash'];
for (let k = 0; k < TX_RECIPES.length; k++) { const r = Object.assign({}, TX_DEF, TX_RECIPES[k]); r.k = k; r.t = TX_TYPES.indexOf(r.type); TX_RECIPES[k] = r; }
const TXR_BY_ID = {}; for (const r of TX_RECIPES) TXR_BY_ID[r.id] = r.k;
// recipes of one type that suit a genre family ('*' = every family)
function txRecipesFor(fam, type) { const out = []; for (const r of TX_RECIPES) if (r.type === type && (r.fam === '*' || (' ' + r.fam + ' ').includes(' ' + fam + ' '))) out.push(r.k); return out; }
const TX_SV = 7, TX_PAN = [0, -0.8, 0.8, -0.45, 0.45, -1, 1], TX_DT = [0, -1, 1, -0.5, 0.5, -0.75, 0.75];
class TxVoice {
  constructor(sr) { this.sr = sr; this.on = 0; this.kill = 0; this.wait = 0; this.t = 0; this.dur = 1; this.vel = 1; this.R = TX_RECIPES[0]; this.note = 60; this.third = 3; this.sps = sr / 8;
    this.nL = new Svf(); this.nR = new Svf(); this.sL = new Svf(); this.sR = new Svf(); this.rB = new Svf(); this.tB = new Svf(); this.ph = new Float64Array(TX_SV); this.dr = new Float64Array(TX_SV);
    this.inc = 0; this.tph = 0; this.tph2 = 0; this.tf = 0; this.tt = 0; this.rNext = 0; this.rEnv = 0; this.rDec = 0; this.rph = 0; this.rcl = 0; this.rclN = 0; this.gg = 1; this.ga = 0; this.amp = 0; this.w = 1; this.q = 0; this.sph = 0; this.cp = new Float64Array(6); shape(this); }
  trigger(off, rec, vel, dur, note, third, sps) { const R = TX_RECIPES[rec | 0] || TX_RECIPES[0], sr = this.sr; this.R = R; this.on = 1; this.kill = 0; this.wait = Math.max(0, off | 0); this.t = 0; this.vel = vel * R.g;
    this.dur = Math.max(1, dur); this.note = note > 0 ? note : 60; this.third = third === 4 ? 4 : 3; this.sps = sps || sr / 8; this.nL.reset(); this.nR.reset(); this.sL.reset(); this.sR.reset(); this.rB.reset(); this.tB.reset();
    for (let k = 0; k < TX_SV; k++) { this.ph[k] = (noise() + 1) * 0.5; this.dr[k] = Math.pow(2, TX_DT[k] * R.det / 1200); }
    this.tph = 0; this.tph2 = 0.25; this.tf = 0; this.rNext = 0; this.rEnv = 0; this.rph = 0; this.gg = 1; this.ga = 1 - Math.exp(-1 / (0.0015 * sr)); this.sph = 0; for (let k = 0; k < 6; k++) this.cp[k] = (noise() + 1) * 0.5;
    this.rB.set(R.rf, 1.1, sr); if (R.t === 3) { this.nL.set(R.cf, 0.9, sr); this.nR.set(R.cf * 1.07, 0.9, sr); this.sL.set(1800, 0.7, sr); this.sR.set(1700, 0.7, sr); } }
  // control rate: every 16 samples
  ctl() { const R = this.R, sr = this.sr, q = Math.min(1, this.t / this.dur), qp = Math.pow(q, R.pc); this.q = q;
    if (R.t <= 1 || R.t >= 4) { // rise / down / swell / wash
      const nf = R.f0 * Math.pow(R.f1 / R.f0, R.t === 5 ? Math.sin(Math.PI * q * 0.5) : qp); this.nL.set(nf, R.q, sr); this.nR.set(nf * R.spl, R.q, sr); /* (spl > 1: the right band runs above the left — a swirl) */
      if (R.syn > 0) { const f = R.ton > 0 && this.tf ? this.tf * sr * 2 : mtof(this.note + R.so) * Math.pow(2, R.oct * qp); this.inc = f / sr; /* (with a tonal layer the synth climbs its staircase an octave up: the whole riser stays in key) */ const sf = R.sf0 * Math.pow(R.sf1 / R.sf0, qp); this.sL.set(sf, R.sq, sr); this.sR.set(sf * 1.03, R.sq, sr); }
      if (R.ton > 0) { const th = this.third, T = R.t === 4 ? null : [0, th, 7, 12, 12 + th, 19, 24, 24 + th], beats = this.t / (this.sps * 4), durB = Math.max(1, this.dur / (this.sps * 4));
        let target; if (!T) target = 0; else { const qb = Math.floor(beats / R.tpb) * R.tpb / durB, i = Math.min(T.length - 1, Math.floor(qb * T.length)); target = R.t === 1 ? T[T.length - 1 - i] : T[i]; }
        const tf = mtof(this.note - 12 + R.so + target) / sr; this.tf = this.tf ? this.tf + (tf - this.tf) * 0.35 : tf; this.tB.set(Math.min(sr * 0.4, 600 * Math.pow(12, q)), 0.7, sr); }
      this.amp = R.t === 0 ? Math.pow(q, R.crv) : R.t === 1 ? Math.pow(1 - q, R.crv) * Math.min(1, this.t / (0.005 * sr)) : R.t === 4 ? Math.exp(R.crv * (q - 1)) : Math.pow(Math.sin(Math.PI * q), R.crv);
      this.w = R.w0 + (R.w1 - R.w0) * q; }
    else if (R.t === 2) { const f = mtof(this.note + R.so) * Math.pow(2, R.oct * qp); this.inc = Math.max(18, f) / sr; this.amp = Math.pow(1 - q, R.crv) * Math.min(1, this.t / (0.002 * sr)); }
    else if (R.t === 3) { const s = this.t / sr; this.amp = 1; this.inc = 0; if (R.syn > 0) { const f = mtof(this.note + R.so) * Math.pow(2, R.oct * Math.min(1, s / 0.6)); this.inc = f / sr; }
      const tl = Math.max(300, 4000 * Math.exp(-s / (R.td * 0.6))); this.sL.set(tl, 0.7, sr); this.sR.set(tl * 1.05, 0.7, sr); } }
  render(L, R_, n, gain) {
    const R = this.R, sr = this.sr, inv = 1 / sr, nzT = R.nzT;
    for (let i = 0; i < n; i++) { if (this.wait > 0) { this.wait--; continue; }
      if ((this.t & 15) === 0) this.ctl();
      let yl = 0, yr = 0; const tp = R.t;
      if (tp === 2) { // SUB DROP: a sine diving from the key's root, a little driven, a click on the drop
        this.sph += this.inc; if (this.sph >= 1) this.sph -= 1; const s = this.t * inv, y = tanh(sin1(this.sph) * R.drv) / tanh(R.drv) * this.amp + (R.crack > 0 ? noise() * Math.exp(-s / 0.004) * R.crack : 0); yl = yr = y * 0.9;
        if (this.t >= this.dur) this.on = 0; }
      else if (tp === 3) { // IMPACT: boom tuned to the key (40–65 Hz), crack, noise tail
        const s = this.t * inv; let bf = mtof(this.note - 36); while (bf > 65) bf *= 0.5; while (bf < 40) bf *= 2;
        this.sph += bf * (1 + 1.6 * Math.exp(-s / 0.03)) * inv; if (this.sph >= 1) this.sph -= 1; const boom = sin1(this.sph) * Math.exp(-s / (R.bd * 0.45)) * R.boom * Math.min(1, s / 0.0007);
        const a = noise(), b = noise(); this.nL.run(a); this.nR.run(b); const ce = Math.exp(-s / 0.05) * R.crack; this.sL.run(a); this.sR.run(b); const te = Math.exp(-s / (R.td * 0.4)) * R.tail * Math.min(1, s / 0.01);
        let m = 0; if (R.met) { for (let k = 0; k < 6; k++) { this.cp[k] += CYM_F[k] * 1.7 * inv; if (this.cp[k] >= 1) this.cp[k] -= 1; m += this.cp[k] < 0.5 ? 1 : -1; } m *= 0.06 * Math.exp(-s / 0.9) * R.met; }
        let z = 0; if (R.syn > 0) { this.ph[0] += this.inc; if (this.ph[0] >= 1) this.ph[0] -= 1; z = sin1(this.ph[0]) * R.syn * Math.exp(-s / 0.25) * 0.5; }
        yl = boom + this.nL.bp * ce * 1.4 + this.sL.lp * te + m + z; yr = boom + this.nR.bp * ce * 1.4 + this.sR.lp * te - m + z;
        if (s > Math.max(R.bd * 3, R.td * 3, this.dur * inv) || (s > 1 && Math.abs(yl) + Math.abs(yr) < 1e-5)) this.on = 0; }
      else { // RISE / DOWN / SWELL / WASH: the layers
        if (R.nz > 0) { this.nL.run(noise()); this.nR.run(noise()); const nl = nzT === 1 ? this.nL.hp : nzT === 2 ? this.nL.lp : this.nL.bp, nr = nzT === 1 ? this.nR.hp : nzT === 2 ? this.nR.lp : this.nR.bp; yl += nl * R.nz; yr += nr * R.nz; }
        if (R.syn > 0) { let sl = 0, sr2 = 0; const nv = Math.min(TX_SV, R.sv | 0 || 1);
          for (let k = 0; k < nv; k++) { const d = this.inc * this.dr[k]; let p = this.ph[k] + d; if (p >= 1) p -= 1; this.ph[k] = p; let y;
            if (R.sw === 1) { let p2 = p + 0.5; if (p2 >= 1) p2 -= 1; y = (2 * p - 1 - blep(p, d)) - (2 * p2 - 1 - blep(p2, d)); } else if (R.sw === 2) y = sin1(p) + 0.18 * sin1(p * 3 % 1); else y = 2 * p - 1 - blep(p, d);
            const pn = nv === 1 ? 0 : TX_PAN[k]; sl += y * (1 - pn) * 0.5; sr2 += y * (1 + pn) * 0.5; }
          const g = R.syn / Math.sqrt(nv); this.sL.run(sl); this.sR.run(sr2); yl += this.sL.lp * g; yr += this.sR.lp * g; }
        if (R.ton > 0) { let y = 0; if (R.t === 4) { const th = this.third, f = this.tf; for (let k = 0; k < 4; k++) { const iv = k === 0 ? 0 : k === 1 ? th : k === 2 ? 7 : 12; y += sin1(((this.tt * f * Math.pow(2, iv / 12)) % 1)) * 0.3; } }
          else { this.tph += this.tf; if (this.tph >= 1) this.tph -= 1; this.tph2 += this.tf * 1.004; if (this.tph2 >= 1) this.tph2 -= 1; y = (sin1(this.tph) + 0.3 * sin1(this.tph * 2 % 1) + 0.15 * sin1(this.tph * 3 % 1) + 0.7 * sin1(this.tph2)) * 0.45; }
          this.tB.run(y); y = this.tB.lp * R.ton; yl += y; yr += y; }
        if (R.roll > 0) { if (--this.rNext <= 0) { const iv = R.r0 * Math.pow(R.r1 / R.r0, this.q); this.rNext = Math.max(16, Math.round(iv * this.sps)); this.rEnv = 0.45 + 0.55 * this.q; this.rDec = Math.exp(-1 / (Math.min(0.07, iv * this.sps * inv * 0.45) * sr)); this.rph = 0; this.rcl = R.clap ? 2 : 0; this.rclN = Math.round(0.011 * sr); }
          if (this.rcl > 0 && --this.rclN <= 0) { this.rcl--; this.rclN = Math.round(0.011 * sr); this.rEnv = 0.45 + 0.55 * this.q; } /* (a clap: three bursts 11 ms apart) */
          if (this.rEnv > 1e-4) { this.rB.run(noise()); this.rph += 190 * inv; if (this.rph >= 1) this.rph -= 1; const h = (this.rB.bp * 1.5 + sin1(this.rph) * 0.35) * this.rEnv * R.roll; this.rEnv *= this.rDec; yl += h; yr += h; } }
        this.tt++;
        // width (mid/side), gate, envelope
        const m = (yl + yr) * 0.5, sd = (yl - yr) * 0.5 * this.w; yl = m + sd; yr = m - sd;
        if (R.gate !== 0) { const div = R.gate > 0 ? R.gate : 8 * Math.pow(2, 2 * this.q), gl = this.sps * 16 / div, gp = (this.t % gl) / gl, tg = gp < 0.5 ? 1 : 1 - R.gd; this.gg += (tg - this.gg) * this.ga; yl *= this.gg; yr *= this.gg; }
        yl *= this.amp; yr *= this.amp;
        const left = this.dur - this.t; if (left < 256) { const f = 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, left) / 256); yl *= f; yr *= f; } // 6 ms out at the line (raised cosine): no click (the drop's impact covers the cut)
        if (this.t >= this.dur) this.on = 0; }
      if (this.kill) { const g = this.kill / 220; yl *= g; yr *= g; if (--this.kill === 0) this.on = 0; }
      this.t++; const g = this.vel * gain; L[i] += yl * g; R_[i] += yr * g; if (!this.on) break; } }
}
