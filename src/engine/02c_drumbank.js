/* ===================== DRUM BANK (v9.3) =====================
   "Render once, play many". The snares, claps, rims, hats, cymbals, toms and hand percussion of six kit families are rendered by
   models too expensive for the audio thread — oversampled metal oscillators, modal plates and membranes with pitch drop, a snare
   wire model, small rooms, the converters of the classic machines — into one-shots, three variants each, and played back with
   velocity-dependent brightness and per-voice Tune / Decay / Tone / Snap. The kick stays synthesized (it follows the tempo and the
   genre calibration). Families describe a style (808-style, 909-style …), they are our own models, not samples of the machines.
   A bank is generated off the audio thread (the analysis worker) and handed to the engine; until it arrives a deck plays its
   synthesized voices. Every bank is identical everywhere: its noise comes from its own seeded generator, never from noise(). */
const BANK_FAMILIES = ['808', '909', '707', 'linn', 'acoustic', 'lofi', 'cr78', 'minimal', 'industrial', 'vintage', 'trap', 'garage'];
// (v9.4) six more families, each built on the voices of an older one and then re-voiced: CR-78-style (soft analog blips, "tss" hats),
// minimal (dry, clipped, precise), industrial (metal, distortion, a big room), vintage breaks (a roomy, compressed, taped kit),
// trap (808-style with bright tight hats and a snapping clap), garage (707-style, crisp, short, skippy)
const FAMILY_BASE = { cr78: '808', minimal: '909', industrial: '909', vintage: 'acoustic', trap: '808', garage: '707' };
const BANK_VOICES = ['sn', 'cp', 'rim', 'hc', 'ho', 'hp', 'ride', 'crash', 'shk', 'tom', 'conga', 'bongo', 'cowbell', 'clave', 'tamb'];
const BANK_F0 = { tom: 110, conga: 220, bongo: 400 }; // a pitched one-shot is rendered at this pitch; a note plays it faster or slower
// playback level per voice, matched to the synthesized voice it replaces (tools/bank_level.cjs: equal RMS over the hit)
const BANK_GAIN = {sn: 1.798, cp: 0.963, rim: 0.585, hc: 0.415, ho: 0.875, hp: 0.344, ride: 0.888, crash: 0.829, shk: 0.49, tom: 2.858, conga: 2.621, bongo: 2.141, cowbell: 2.356, clave: 1.028, tamb: 1.094};
// each genre's default family (a set file, the Ask bar or the dock can choose another; 'forge' = the synthesized voices of 9.2)
const BANK_FOR_GENRE = { 'deep-house': 'linn', 'tech-house': '909', techno: '909', 'melodic-techno': '909', trance: '909', psytrance: '909', 'prog-psy': '909', dnb: 'acoustic', dubstep: 'acoustic', trap: '808', ukg: '707', house: '909', 'progressive-house': '909', 'afro-house': 'acoustic', 'hard-techno': '909', 'dub-techno': '808', acid: '808', 'big-room': '909', hardstyle: '909', 'future-bass': 'acoustic', breakbeat: 'acoustic', jungle: 'acoustic', reggaeton: '808', moombahton: '808', amapiano: 'linn', synthwave: 'linn', lofi: 'lofi', downtempo: 'lofi', ambient: 'acoustic', 'nu-disco': 'linn', electro: '808', 'jersey-club': '808', 'uk-drill': '808' };
const DRUMBANKS = {}; let BANK_SYNC = true; // false where generating would block the audio (the worklet, the render-ahead worker)
function drumBank(fam, sr) { if (!fam || fam === 'forge' || BANK_FAMILIES.indexOf(fam) < 0) return null; const k = fam + '@' + sr; if (DRUMBANKS[k]) return DRUMBANKS[k]; return BANK_SYNC ? (DRUMBANKS[k] = genDrumBank(fam, sr)) : null; }

// ---- offline DSP (allocation is fine here: none of this runs on the audio thread) ----
function dbBqC(type, f, q, sr) { const w = TAU * Math.min(f, sr * 0.48) / sr, cs = Math.cos(w), al = Math.sin(w) / (2 * q); let b0, b1, b2;
  if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; } else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; } else { b0 = al; b1 = 0; b2 = -al; }
  const a0 = 1 + al; return [b0 / a0, b1 / a0, b2 / a0, -2 * cs / a0, (1 - al) / a0]; }
function dbBq(x, type, f, q, sr) { const c = dbBqC(type, f, q || 0.707, sr); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = x[i], y = c[0] * v + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2; x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y; } return x; }
function dbBqNew(x, type, f, q, sr) { return dbBq(Float32Array.from(x), type, f, q, sr); }
function dbMix(a, b, g) { for (let i = 0; i < a.length && i < b.length; i++) a[i] += b[i] * g; return a; }
// a sum of decaying partials: [freq, amp, decay(s), drop (fraction), dropTime(s)], random start phase
function dbPartials(n, sr, list, R) { const y = new Float32Array(n);
  for (const [f, a, dec, drop, dT] of list) { if (f >= sr * 0.47 || a <= 0) continue; const k = Math.exp(-1 / (dec * sr)); let e = a;
    if (!drop) { const w = TAU * f / sr, c2 = 2 * Math.cos(w), p0 = TAU * R(); let s1 = Math.sin(p0 - w), s0 = Math.sin(p0); // a steady partial: the two-term recurrence (no sin() per sample)
      for (let i = 0; i < n; i++) { y[i] += s0 * e; const s = c2 * s0 - s1; s1 = s0; s0 = s; e *= k; if (e < 1e-6) break; } continue; }
    let ph = R(), d = drop; const kd = Math.exp(-1 / ((dT || 0.02) * sr));
    for (let i = 0; i < n; i++) { ph += f * (1 + d) / sr; d *= kd; y[i] += Math.sin(TAU * ph) * e; e *= k; if (e < 1e-6) break; } }
  return y; }
function dbNoise(n, R) { const y = new Float32Array(n); for (let i = 0; i < n; i++) y[i] = R() * 2 - 1; return y; }
function dbEnv(x, sr, att, dec, start) { const s = Math.round((start || 0) * sr), a = Math.max(1, Math.round(att * sr)), k = Math.exp(-1 / (dec * sr)); let e = 1;
  for (let i = 0; i < x.length; i++) { if (i < s) { x[i] = 0; continue; } const t = i - s; x[i] *= (t < a ? t / a : (e *= k)); } return x; }
// six square oscillators, rendered 4× oversampled and decimated (the metal of the analog machines without its aliasing)
function dbMetalSq(n, sr, freqs, R) { const OS = 4, N = n * OS, y = new Float32Array(N), ph = freqs.map(() => R());
  for (let i = 0; i < N; i++) { let s = 0; for (let j = 0; j < freqs.length; j++) { ph[j] += freqs[j] / (sr * OS); if (ph[j] >= 1) ph[j] -= 1; s += ph[j] < 0.5 ? 1 : -1; } y[i] = s / freqs.length; }
  dbBq(y, 'lp', sr * 0.45, 0.707, sr * OS); dbBq(y, 'lp', sr * 0.45, 0.707, sr * OS); const o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = y[i * OS]; return o; }
// dense inharmonic modes (cymbal metal): count partials, log-spread between lo and hi, decays shorter for higher modes
function dbMetalModes(n, sr, count, lo, hi, dec, R, tilt) { const L = []; for (let i = 0; i < count; i++) { const f = lo * Math.pow(hi / lo, R()); L.push([f, (0.4 + R()) * Math.pow(f / 1000, -(tilt ?? 0.25)), dec * Math.pow(3000 / f, 0.55) * (0.6 + 0.8 * R())]); } return dbPartials(n, sr, L, R); }
// a small room: four combs and two allpasses (early reflections + a short tail), returns the wet signal
function dbRoom(x, sr, size, damp) { const n = x.length, y = new Float32Array(n), cs = [1116, 1188, 1277, 1356].map((d) => Math.round(d * size * sr / 44100)), fb = 0.72, ap = [556, 341].map((d) => Math.round(d * size * sr / 44100));
  for (const d of cs) { const b = new Float32Array(d); let p = 0, lp = 0; for (let i = 0; i < n; i++) { const o = b[p]; lp += (o - lp) * (1 - damp); b[p] = x[i] + lp * fb; if (++p >= d) p = 0; y[i] += o * 0.25; } }
  for (const d of ap) { const b = new Float32Array(d); let p = 0; for (let i = 0; i < n; i++) { const o = b[p], v = y[i] + o * 0.5; b[p] = v; y[i] = o - v * 0.5; if (++p >= d) p = 0; } }
  return y; }
// the converters of the classic machines: μ-law 8 bit (Linn, 707), linear 6 bit (909 cymbals), a rate reduction (sample and hold)
function dbMulaw(x) { const L = Math.log(256); for (let i = 0; i < x.length; i++) { const v = Math.max(-1, Math.min(1, x[i])), c = Math.sign(v) * Math.log(1 + 255 * Math.abs(v)) / L, q = Math.round(c * 127) / 127; x[i] = Math.sign(q) * (Math.pow(256, Math.abs(q)) - 1) / 255; } return x; }
function dbBits(x, b) { const q = Math.pow(2, b - 1); for (let i = 0; i < x.length; i++) x[i] = Math.round(x[i] * q) / q; return x; }
function dbHold(x, sr, to) { const st = sr / to; let acc = 0, h = 0; for (let i = 0; i < x.length; i++) { if (i >= acc) { h = x[i]; acc += st; } x[i] = h; } return x; }
function dbNorm(x, peak) { let m = 0; for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i])); if (m > 0) for (let i = 0; i < x.length; i++) x[i] *= peak / m; return x; }
function dbFade(x, sr, t) { const n = Math.min(x.length, Math.round(t * sr)); for (let i = 0; i < n; i++) x[x.length - n + i] *= 0.5 + 0.5 * Math.cos(Math.PI * i / n); return x; }
function dbSat(x, d) { const g = 1 / Math.tanh(d); for (let i = 0; i < x.length; i++) x[i] = Math.tanh(x[i] * d) * g; return x; }

const DB_HAT808 = [205.3, 304.4, 369.6, 522.7, 540, 800];
const DB_MEMBRANE = [1, 1.593, 2.136, 2.296, 2.653, 2.918, 3.156, 3.501]; // the modes of a circular membrane (Bessel zeros / the first)

// one voice of one family, one variant: a mono Float32Array at sr
function genVoice(fam, v, variant, sr) {
  const R = rng((hashStr(fam + ':' + v) ^ Math.imul(variant + 1, 0x9E3779B1)) >>> 0), J = (a) => 1 + (R() * 2 - 1) * a, N = (s) => Math.round(s * sr);
  const bf = FAMILY_BASE[fam] || fam, analog = bf === '808', crisp = bf === '909' || bf === '707', ac = bf === 'acoustic' || bf === 'linn' || bf === 'lofi';
  let y;
  // ---- snare: a membrane, a stick, the wires, a room ----
  if (v === 'sn') {
    if (analog) { y = dbPartials(N(0.45), sr, [[238 * J(0.01), 0.9, 0.07, 0.04, 0.01], [476 * J(0.01), 0.45, 0.045]], R); const nz = dbEnv(dbBq(dbBq(dbNoise(N(0.45), R), 'hp', 1500, 0.7, sr), 'lp', 9000, 0.7, sr), sr, 0.0008, 0.16 * J(0.06)); dbMix(y, nz, 0.75); }
    else if (crisp) { y = dbPartials(N(0.5), sr, [[185 * J(0.01), 1, 0.085, 0.14, 0.008], [330 * J(0.01), 0.55, 0.05, 0.1, 0.008]], R); dbSat(y, 1.6);
      const nz = dbEnv(dbBq(dbBq(dbBq(dbNoise(N(0.5), R), 'hp', bf === '707' ? 1100 : 600, 0.7, sr), 'lp', bf === '707' ? 11000 : 8000, 0.7, sr), 'bp', 5000, 0.6, sr), sr, 0.001, (bf === '707' ? 0.14 : 0.19) * J(0.06), 0.0008); dbMix(y, nz, bf === '707' ? 1.9 : 1.6); }
    else { const f0 = (bf === 'linn' ? 200 : 185) * J(0.02), n = N(0.6); y = dbPartials(n, sr, DB_MEMBRANE.slice(0, 6).map((r, i) => [f0 * r * J(0.006), [1, 0.62, 0.46, 0.36, 0.26, 0.2][i], [0.13, 0.09, 0.07, 0.06, 0.05, 0.04][i] * J(0.08), 0.045, 0.015]), R);
      dbMix(y, dbPartials(n, sr, [[470 * J(0.03), 0.22, 0.04]], R), 1); // the shell
      const stick = dbEnv(dbBq(dbNoise(n, R), 'hp', 3000, 0.7, sr), sr, 0.0002, 0.0018); dbMix(y, stick, 1.1);
      const wires = dbEnv(dbBq(dbBq(dbNoise(n, R), 'hp', 2200, 0.7, sr), 'lp', 9500, 0.7, sr), sr, 0.0012, 0.2 * J(0.08), 0.001); for (let i = 0; i < n; i++) wires[i] *= 0.65 + 0.35 * Math.abs(y[i]); // the wires rattle with the head
      dbMix(y, wires, 1.1); dbMix(y, dbRoom(y, sr, 0.55, 0.35), 0.22); }
  }
  // ---- clap: several hands a few ms apart, then the room ----
  else if (v === 'cp') { const n = N(0.7); y = new Float32Array(n);
    if (!ac) { const bursts = bf === '808' ? 3 : 4, gap = (bf === '808' ? 0.0105 : 0.0085) * J(0.05), bpF = bf === '707' ? 1500 : bf === '909' ? 1200 : 1100;
      const nz = dbBq(dbBq(dbNoise(n, R), 'bp', bpF, 1.1, sr), 'hp', 700, 0.7, sr);
      for (let i = 0; i < n; i++) { const t = i / sr; let e = 0; for (let b = 0; b < bursts; b++) { const tb = t - b * gap; if (tb >= 0) e += Math.exp(-tb / 0.0027) * (tb < gap || b === bursts - 1 ? 1 : 0); } const tt = t - bursts * gap; if (tt > 0) e += 0.55 * Math.exp(-tt / (bf === '808' ? 0.09 : 0.12)); y[i] = nz[i] * e; } }
    else { const hands = 5 + (R() * 2 | 0); for (let h = 0; h < hands; h++) { const off = R() * 0.018, f = 1000 + R() * 1400, nz = dbEnv(dbBq(dbNoise(n, R), 'bp', f, 1.4, sr), sr, 0.0006, 0.004 + R() * 0.006, off); dbMix(y, nz, 0.6 + 0.4 * R()); }
      dbBq(y, 'hp', 600, 0.7, sr); dbMix(y, dbRoom(y, sr, 0.8, 0.3), 0.55); }
  }
  // ---- rim / cross-stick ----
  else if (v === 'rim') { const n = N(0.18);
    if (analog) y = dbPartials(n, sr, [[455, 0.8, 0.015], [1667, 0.6, 0.009]], R);
    else if (crisp) { y = dbPartials(n, sr, [[1720 * J(0.01), 1, 0.022]], R); dbMix(y, dbEnv(dbBq(dbNoise(n, R), 'hp', 2000, 0.7, sr), sr, 0.0002, 0.0012), 0.9); }
    else y = dbPartials(n, sr, [[500 * J(0.02), 0.7, 0.045], [1150 * J(0.02), 0.6, 0.03], [1900 * J(0.02), 0.45, 0.02], [2700 * J(0.02), 0.3, 0.014]], R);
    dbMix(y, dbEnv(dbNoise(n, R), sr, 0.0001, 0.0006), 0.5); dbBq(y, 'hp', 300, 0.7, sr); }
  // ---- hats: closed, open, pedal — one cymbal pair, three strokes ----
  else if (v === 'hc' || v === 'ho' || v === 'hp') { const open = v === 'ho', pedal = v === 'hp', len = open ? 0.9 : pedal ? 0.2 : 0.22, n = N(len);
    const dec = (open ? (analog ? 0.07 : 0.1) : pedal ? 0.011 : analog ? 0.012 : 0.016) * J(0.07);
    if (analog) { y = dbMetalSq(n, sr, DB_HAT808.map((f) => f * J(0.004)), R); dbBq(y, 'bp', 7100, 1.2, sr); dbBq(y, 'hp', 6500, 0.7, sr); dbBq(y, 'hp', 6500, 0.7, sr); dbEnv(y, sr, 0.0003, dec); }
    else { const m = dbMetalModes(n, sr, 56, 3200, 15500, open ? 0.5 : 0.08, R, 0.2), nz = dbBq(dbBq(dbNoise(n, R), 'hp', 6000, 0.7, sr), 'lp', 15000, 0.7, sr);
      y = new Float32Array(n); dbMix(y, m, 0.5); dbMix(y, nz, 0.6); dbEnv(y, sr, 0.0004, dec);
      const stick = dbEnv(dbBq(dbNoise(n, R), 'hp', 4500, 0.7, sr), sr, 0.0002, 0.0015); dbMix(y, stick, 0.5);
      if (pedal || !open) { const chick = dbEnv(dbBq(dbNoise(n, R), 'bp', 3800, 1.2, sr), sr, 0.0008, pedal ? 0.014 : 0.006); dbMix(y, chick, pedal ? 0.9 : 0.25); }
      if (bf === '909') dbBits(y, 6); dbBq(y, 'hp', bf === '909' ? 6500 : 5200, 0.7, sr); }
    dbFade(y, sr, open ? 0.12 : 0.03); }
  // ---- ride and crash: modal plates, a bell, a wash that blooms ----
  else if (v === 'ride' || v === 'crash') { const crash = v === 'crash', len = crash ? 2.2 : 1.6, n = N(len);
    if (analog) { y = dbMetalSq(n, sr, DB_HAT808.map((f) => f * J(0.004)), R); const a = dbBqNew(y, 'bp', 3440, 1.6, sr), b = dbBqNew(y, 'bp', 7100, 1.2, sr); y = dbMix(a, b, 1.2); dbBq(y, 'hp', 2500, 0.7, sr); dbEnv(y, sr, crash ? 0.002 : 0.0005, crash ? 0.35 : 0.25); }
    else { y = dbMetalModes(n, sr, crash ? 90 : 64, crash ? 300 : 360, crash ? 14000 : 12000, crash ? 1.6 : 1.1, R, 0.3);
      if (!crash) { const f0 = 640 * J(0.03); dbMix(y, dbPartials(n, sr, [1, 1.48, 2.21, 2.79, 3.62].map((r, i) => [f0 * r * J(0.005), [0.6, 0.45, 0.35, 0.3, 0.2][i], [1.2, 0.9, 0.8, 0.6, 0.5][i]]), R), 0.7); }
      const wash = dbEnv(dbBq(dbBq(dbNoise(n, R), 'hp', crash ? 2600 : 4000, 0.7, sr), 'lp', 11000, 0.7, sr), sr, crash ? 0.018 : 0.004, crash ? 0.7 : 0.4); dbMix(y, wash, crash ? 0.45 : 0.18);
      dbMix(y, dbEnv(dbBq(dbNoise(n, R), 'hp', 2000, 0.7, sr), sr, 0.0002, 0.002), crash ? 0.3 : 0.6); // the stick
      if (bf === '909') dbBits(y, 6); }
    dbFade(y, sr, crash ? 0.35 : 0.25); }
  // ---- shaker: a back-and-forth of grains ----
  else if (v === 'shk') { const n = N(0.22); y = new Float32Array(n); const g1 = dbEnv(dbBq(dbBq(dbNoise(n, R), 'hp', 4500, 0.7, sr), 'lp', 11000, 0.7, sr), sr, 0.004, 0.022 * J(0.1));
    const g2 = dbEnv(dbBq(dbBq(dbNoise(n, R), 'hp', 5000, 0.7, sr), 'lp', 10000, 0.7, sr), sr, 0.008, 0.018 * J(0.1), 0.045 * J(0.15)); dbMix(y, g1, 1); dbMix(y, g2, analog ? 0 : 0.55); }
  // ---- toms, congas, bongos: membranes with a pitch drop (rendered at BANK_F0, played at the note) ----
  else if (v === 'tom' || v === 'conga' || v === 'bongo') { const f0 = BANK_F0[v], tom = v === 'tom', n = N(tom ? 0.9 : 0.5);
    if (!ac) { y = dbPartials(n, sr, [[f0, 1, tom ? 0.09 : 0.05, tom ? 0.3 : 0.12, tom ? 0.05 : 0.02]], R); if (crisp) dbMix(y, dbEnv(dbBq(dbNoise(n, R), 'lp', 3000, 0.7, sr), sr, 0.0005, 0.02), 0.25); }
    else { y = dbPartials(n, sr, DB_MEMBRANE.slice(0, 5).map((r, i) => [f0 * r * J(0.006), [1, 0.5, 0.35, 0.25, 0.15][i], (tom ? [0.35, 0.18, 0.12, 0.1, 0.08] : [0.18, 0.08, 0.06, 0.05, 0.04])[i] * J(0.08), tom ? 0.06 : 0.03, 0.05]), R);
      dbMix(y, dbEnv(dbBq(dbNoise(n, R), tom ? 'lp' : 'bp', tom ? 2500 : 2600, 1, sr), sr, 0.0003, tom ? 0.006 : 0.01), tom ? 0.5 : 0.4); if (tom) dbMix(y, dbRoom(y, sr, 0.6, 0.4), 0.15); }
    dbFade(y, sr, 0.08); }
  // ---- cowbell, clave, tambourine ----
  else if (v === 'cowbell') { const n = N(0.45);
    if (!ac) { y = dbMetalSq(n, sr, [540, 800], R); dbBq(y, 'bp', 1200, 0.9, sr); for (let i = 0; i < n; i++) { const t = i / sr; y[i] *= 0.7 * Math.exp(-t / 0.012) + 0.3 * Math.exp(-t / 0.1); } }
    else { y = dbPartials(n, sr, [[587, 1, 0.25], [845, 0.8, 0.2], [1350, 0.5, 0.15], [1655, 0.4, 0.12], [2470, 0.25, 0.08]].map(([f, a, d]) => [f * J(0.01), a, d * J(0.1)]), R); dbMix(y, dbEnv(dbBq(dbNoise(n, R), 'hp', 2000, 0.7, sr), sr, 0.0002, 0.002), 0.4); } }
  else if (v === 'clave') { const n = N(0.16); y = analog || crisp ? dbPartials(n, sr, [[2500 * J(0.01), 1, 0.014]], R) : dbPartials(n, sr, [[2200 * J(0.02), 1, 0.022], [2200 * 2.32, 0.5, 0.011], [2200 * 3.4, 0.3, 0.008]], R); dbMix(y, dbEnv(dbNoise(n, R), sr, 0.0001, 0.0005), 0.3); }
  else if (v === 'tamb') { const n = N(0.4); y = dbMetalModes(n, sr, 28, 5000, 11500, 0.12, R, 0); dbMix(y, dbEnv(dbBq(dbNoise(n, R), 'hp', 6000, 0.7, sr), sr, 0.002, 0.05), 0.8); dbEnv(y, sr, 0.001, 0.09 * J(0.1)); dbFade(y, sr, 0.05); }
  else y = new Float32Array(N(0.05));
  // ---- (v9.4) the new families re-voice what their base gave ----
  const n0 = y.length, T = (i) => i / sr;
  if (fam === 'cr78') { // soft analog: short "tss" hats from resonant noise, a popping snare, blips for the hand drums, no hard edges
    if (v === 'hc' || v === 'ho' || v === 'hp') { y = dbEnv(dbBq(dbBq(dbNoise(n0, R), 'bp', 8800 * J(0.03), 3, sr), 'hp', 5200, 0.7, sr), sr, 0.0004, (v === 'ho' ? 0.11 : v === 'hp' ? 0.006 : 0.009) * J(0.08)); }
    else if (v === 'sn') { y = dbPartials(N(0.3), sr, [[330 * J(0.01), 1, 0.03, 0.06, 0.004], [520 * J(0.01), 0.4, 0.02]], R); dbMix(y, dbEnv(dbBq(dbBq(dbNoise(N(0.3), R), 'bp', 4200, 1.2, sr), 'hp', 1800, 0.7, sr), sr, 0.0005, 0.07 * J(0.08)), 0.9); }
    else if (v === 'cp') { y = new Float32Array(N(0.25)); for (let b = 0; b < 2; b++) dbMix(y, dbEnv(dbBq(dbNoise(y.length, R), 'bp', 2000, 1.6, sr), sr, 0.0004, 0.006, b * 0.012 * J(0.1)), 1); dbMix(y, dbEnv(dbBq(dbNoise(y.length, R), 'bp', 1800, 1.2, sr), sr, 0.002, 0.05, 0.024), 0.5); }
    else if (v === 'rim') y = dbPartials(N(0.1), sr, [[1850 * J(0.01), 1, 0.012]], R);
    else if (v === 'tom' || v === 'conga' || v === 'bongo') { const f0 = BANK_F0[v]; y = dbPartials(N(v === 'tom' ? 0.5 : 0.3), sr, [[f0, 1, v === 'tom' ? 0.12 : 0.06, 0.18, 0.012]], R); dbFade(y, sr, 0.05); }
    else if (v === 'cowbell') { y = dbMetalSq(N(0.3), sr, [800, 1170], R); dbBq(y, 'bp', 1600, 1.4, sr); dbEnv(y, sr, 0.0005, 0.06); }
    dbBq(y, 'lp', 11000, 0.7, sr); dbSat(y, 1.3); }
  else if (fam === 'minimal') { // dry and clipped: every voice shortened, the low end of the snares thinned, nothing rings
    const sh = v === 'ho' ? 0.18 : v === 'ride' || v === 'crash' ? 0.35 : v === 'tom' ? 0.16 : v === 'cp' || v === 'sn' ? 0.09 : 0.05; dbEnv(y, sr, 0.0001, sh * J(0.08)); if (v === 'sn' || v === 'cp') dbBq(y, 'hp', 900, 0.7, sr);
    if (v === 'cp') { const k = dbEnv(dbBq(dbNoise(n0, R), 'hp', 3000, 0.7, sr), sr, 0.0002, 0.003); dbMix(y, k, 0.25); } y = y.subarray(0, Math.min(n0, N(sh * 6 + 0.05))).slice(); dbFade(y, sr, 0.01); }
  else if (fam === 'industrial') { // metal and distortion: plates under the snare, folded hats, an anvil for a cowbell, all in a big hard room
    if (v === 'sn' || v === 'cp') { dbMix(y, dbEnv(dbMetalModes(n0, sr, 24, 400, 6000, 0.25, R, 0.1), sr, 0.0005, 0.15), 0.5); dbSat(y, 3); dbMix(y, dbRoom(y, sr, 0.95, 0.2), 0.35); }
    else if (v === 'hc' || v === 'ho' || v === 'hp' || v === 'ride' || v === 'crash') { dbNorm(y, 1); for (let i = 0; i < n0; i++) y[i] = Math.sin(y[i] * 3.2); dbBq(y, 'hp', 3000, 0.7, sr); }
    else if (v === 'cowbell' || v === 'clave') { y = dbEnv(dbMetalModes(N(0.5), sr, 18, 700, 5200, 0.35, R, 0), sr, 0.0002, v === 'clave' ? 0.04 : 0.18); dbSat(y, 2); }
    else if (v === 'tom' || v === 'conga' || v === 'bongo') { dbMix(y, dbEnv(dbMetalModes(n0, sr, 10, BANK_F0[v] * 2, BANK_F0[v] * 14, 0.2, R, 0.2), sr, 0.0003, 0.12), 0.4); dbSat(y, 2.5); }
    dbBits(y, 9); dbBq(y, 'lp', 12000, 0.7, sr); }
  else if (fam === 'vintage') { // a break from an old record: a bigger room, the kit pushed into tape, a narrower band
    if (v !== 'shk' && v !== 'tamb') dbMix(y, dbRoom(y, sr, 0.85, 0.45), v === 'sn' || v === 'cp' || v === 'tom' ? 0.35 : 0.2); dbBq(y, 'hp', 70, 0.7, sr); dbBq(y, 'lp', 9500, 0.7, sr); dbNorm(y, 1); dbSat(y, 2.2);
    const h = rng(311 + variant * 7); for (let i = 0; i < y.length; i++) if (h() < 0.00025) y[i] += (h() - 0.5) * 0.06; } // a little crackle
  else if (fam === 'trap') { // 808-style, but tight, very bright hats for rolls, a snapping clap, a crisp snare
    if (v === 'hc' || v === 'hp') { dbBq(y, 'hp', 8500, 0.7, sr); dbEnv(y, sr, 0.0002, (v === 'hp' ? 0.009 : 0.011) * J(0.08)); }
    else if (v === 'ho') { dbBq(y, 'hp', 7500, 0.7, sr); }
    else if (v === 'cp') { y = new Float32Array(N(0.4)); const nz = dbBq(dbBq(dbNoise(y.length, R), 'bp', 1800, 1.3, sr), 'hp', 900, 0.7, sr); for (let i = 0; i < y.length; i++) { const t = T(i); let e = 0; for (let b = 0; b < 3; b++) { const tb = t - b * 0.006; if (tb >= 0) e += Math.exp(-tb / 0.0022); } e += 0.6 * Math.exp(-Math.max(0, t - 0.018) / 0.06) * (t > 0.018 ? 1 : 0); y[i] = nz[i] * e; } }
    else if (v === 'sn') { dbBq(y, 'hp', 220, 0.7, sr); dbMix(y, dbEnv(dbBq(dbNoise(n0, R), 'hp', 3500, 0.7, sr), sr, 0.0003, 0.09), 0.8); }
    dbSat(y, 1.2); }
  else if (fam === 'garage') { // crisp and short: skippy hats with a little shaker in them, a high snappy snare, a woody rim
    if (v === 'hc' || v === 'hp') { dbEnv(y, sr, 0.0002, 0.012 * J(0.1)); dbMix(y, dbEnv(dbBq(dbNoise(n0, R), 'bp', 7500, 0.9, sr), sr, 0.002, 0.012), 0.35); }
    else if (v === 'sn') { y = dbPartials(N(0.35), sr, [[255 * J(0.01), 1, 0.04, 0.08, 0.004], [480 * J(0.01), 0.5, 0.025]], R); dbMix(y, dbEnv(dbBq(dbBq(dbNoise(N(0.35), R), 'hp', 2400, 0.7, sr), 'lp', 12000, 0.7, sr), sr, 0.0005, 0.1 * J(0.06)), 1.3); }
    else if (v === 'rim') { y = dbPartials(N(0.15), sr, [[1600 * J(0.01), 1, 0.025], [2500 * J(0.01), 0.5, 0.012], [800, 0.4, 0.02]], R); dbMix(y, dbEnv(dbNoise(y.length, R), sr, 0.0001, 0.0006), 0.4); dbBq(y, 'hp', 400, 0.7, sr); }
    dbBq(y, 'lp', 14500, 0.7, sr); dbSat(y, 1.15); }
  // ---- the family's converter and colour ----
  // (each converter is followed by its machine's output filter: the stair steps of a sample-and-hold are images above the band, not tone)
  if (fam === '707') { dbBq(y, 'lp', 13000, 0.7, sr); dbNorm(y, 0.9); dbMulaw(y); dbBq(y, 'lp', 12500, 0.7, sr); }
  else if (fam === 'linn') { dbBq(y, 'lp', 14000, 0.7, sr); dbNorm(y, 0.9); dbHold(y, sr, 28000); dbMulaw(y); dbBq(y, 'lp', 13500, 0.7, sr); } /* (one gentle output filter: the 28 kHz machine was bright; two at 11 kHz left synthwave 8 dB short at 8 kHz) */
  else if (fam === 'lofi') { dbBq(y, 'lp', 7800, 0.7, sr); dbNorm(y, 1); dbSat(y, 1.8); dbHold(y, sr, 22050); dbBits(y, 10); dbBq(y, 'lp', 6500, 0.7, sr); dbBq(y, 'lp', 6500, 0.7, sr); const h = rng(77 + variant); for (let i = 0; i < y.length; i++) y[i] += (h() * 2 - 1) * 0.002; }
  else if (fam === '808') dbSat(y, 1.15);
  return dbLevel(y, sr); }
// every one-shot leaves the generator at the same loudness (RMS over its first 150 ms = -14 dBFS): families differ in colour, not
// in level, and BANK_GAIN alone matches a voice to the synthesized voice it replaces
function dbLevel(y, sr) { const n = Math.min(y.length, Math.round(0.15 * sr)); let s = 0; for (let i = 0; i < n; i++) s += y[i] * y[i]; const r = Math.sqrt(s / Math.max(1, n));
  if (r > 0) { const g = 0.2 / r; for (let i = 0; i < y.length; i++) y[i] *= g; } return y; }
// a whole family: three variants of every voice (two of the long cymbals), mono, at sr — 6–9 MB, ~0.3 s on a desktop worker
function genDrumBank(fam, sr) { const v = {}; for (const k of BANK_VOICES) { const nv = k === 'crash' || k === 'ride' ? 2 : 3; v[k] = []; for (let i = 0; i < nv; i++) v[k].push(genVoice(fam, k, i, sr)); } return { family: fam, sr, v }; }

// ---- playback: one pool per deck, each voice writes into its own mixer channel (snare 1, hats 2, perc 3) ----
class BankVoice { constructor() { this.on = 0; this.t = 0; this.wait = 0; this.buf = null; this.pos = 0; this.rate = 1; this.g = 0; this.gl = 1; this.gr = 1; this.ch = 1; this.key = '';
  this.lp = 0; this.lpA = 1; this.hp = 0; this.hpA = 0; this.e = 1; this.dk = 1; this.holdN = 0; this.snapN = 1; this.snapG = 1; this.fk = 1; shape(this); } }
const BANK_DEF = { tune: 0, decay: 1, tone: 0, snap: 0 }; // per part (snare, hats, perc): Tune ±12 semitones, Decay 0.05…1 of the one-shot, Tone −1 (dark) … +1 (thin), Snap 0…1 (the first 8 ms)
const BANK_SLOT = { sn: 'snare', cp: 'snare', rim: 'snare', hc: 'hats', ho: 'hats', hp: 'hats', ride: 'hats', crash: 'hats', shk: 'hats', tom: 'perc', conga: 'perc', bongo: 'perc', cowbell: 'perc', clave: 'perc', tamb: 'perc' };
class BankPlayer {
  constructor(sr) { this.sr = sr; this.v = Array.from({ length: 16 }, () => new BankVoice()); this.rr = {}; this.fam = 'forge'; this.key = ''; this.bank = null; this.prm = {}; this.user = {}; shape(this); }
  setFamily(f) { f = BANK_FAMILIES.indexOf(f) >= 0 ? f : 'forge'; if (f !== this.fam) { this.fam = f; this.bank = null; this.key = f + '@' + this.sr; } }
  ready() { if (this.fam === 'forge') return false; if (!this.bank) { this.bank = DRUMBANKS[this.key] || null; if (!this.bank && BANK_SYNC) this.bank = drumBank(this.fam, this.sr); } return !!this.bank; } // (no key string per hit while a bank is on its way)
  missing() { return this.fam !== 'forge' && !this.ready(); }
  has(key) { return !!this.user[key] || (this.ready() && !!this.bank.v[key]); }
  trigger(off, vel, key, ch, pan, note, gain) { const list = this.user[key] || (this.bank && this.bank.v[key]); if (!list || !list.length) return;
    const c = this.rr[key] = ((this.rr[key] | 0) + 1) % list.length, buf = list[c], P = this.prm[BANK_SLOT[key]] || BANK_DEF, sr = this.sr;
    // one cymbal is one cymbal: a closed / pedal stroke chokes the open hat, a new crash / ride / open hat takes over the last one's ring
    for (const o of this.v) if (o.on && ((key === 'hc' || key === 'hp') && o.key === 'ho' || (key === 'ho' || key === 'crash' || key === 'ride') && o.key === key)) o.fk = Math.exp(-1 / ((o.key === 'ho' && key !== 'ho' ? 0.008 : 0.08) * sr));
    const v = pickVoice(this.v); v.on = 1; v.t = 0; v.wait = off; v.buf = buf; v.pos = 0; v.key = key; v.ch = ch; v.e = 1; v.fk = 1;
    const f0 = BANK_F0[key]; v.rate = clamp(Math.pow(2, clamp(P.tune || 0, -24, 24) / 12) * (note && f0 ? mtof(clamp(note, 0, 127)) / f0 : 1), 0.0625, 8); // (any setting stays a playable rate: no wrap, no NaN)
    // a soft hit is a darker hit (velocity → brightness), Tone tilts it further (below 0 darker, above 0 thinner)
    const vel1 = clamp(vel, 0, 1.2), tn = clamp(P.tone || 0, -1, 1), cut = Math.min(sr * 0.45, 20000 * Math.pow(2, -(1 - Math.min(1, vel1)) * (BANK_SLOT[key] === 'hats' ? 1.3 : 2.4) + Math.min(0, tn) * 3)); /* metal keeps more of its top when soft */ v.lpA = 1 - Math.exp(-TAU * cut / sr); v.lp = 0;
    v.hpA = tn > 0 ? 1 - Math.exp(-TAU * 120 * Math.pow(2, tn * 4) / sr) : 0; v.hp = 0;
    v.holdN = Math.round(0.012 * sr); const dc = clamp(P.decay ?? 1, 0.02, 1); v.dk = dc < 1 ? Math.exp(-1 / (Math.max(0.006, dc * buf.length / sr * 0.22) * sr)) : 1;
    v.snapN = Math.round(0.008 * sr); v.snapG = 1 + clamp(P.snap || 0, 0, 1) * 1.5;
    v.g = Math.pow(vel1, 1.3) * (BANK_GAIN[key] || 0.4) * (gain ?? 1); const pn = clamp(pan || 0, -1, 1); v.gl = Math.cos((pn + 1) * Math.PI / 4) * 1.414; v.gr = Math.sin((pn + 1) * Math.PI / 4) * 1.414; }
  render(BL, BR, n) {
    for (const v of this.v) { if (!v.on) continue; const L = BL[v.ch], R = BR[v.ch], b = v.buf, len = b.length - 1;
      for (let i = 0; i < n; i++) { if (v.wait > 0) { v.wait--; continue; }
        const p = v.pos, k = p | 0; if (k >= len) { v.on = 0; break; } const fr = p - k; let y = b[k] + (b[k + 1] - b[k]) * fr; v.pos = p + v.rate;
        v.lp += (y - v.lp) * v.lpA; y = v.lp; if (v.hpA) { v.hp += (y - v.hp) * v.hpA; y -= v.hp; }
        const t = v.t++; const s = t < v.snapN ? v.snapG - (v.snapG - 1) * t / v.snapN : 1; if (t > v.holdN) v.e *= v.dk; v.e *= v.fk; if (v.e < 1e-4) { v.on = 0; break; }
        y *= v.g * v.e * s; L[i] += y * v.gl; R[i] += y * v.gr; } } }
}
