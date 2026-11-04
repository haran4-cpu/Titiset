// (v10) SOUND AUDIT — every preset of the melodic slots played alone through the synth (no mix), measured for what makes a synth sound
// cheap or tired:
//   alias    — aliasing: energy at frequencies that are not harmonics of the note (outside ±1.5 % of k·f0), 300 Hz–18 kHz, against the
//              note's energy — at a HIGH note, minus the same at a LOW note (aliasing grows with pitch; a bell's or a noise layer's
//              inharmonic energy does not) — dB
//   fizz     — the share of the energy above 9 kHz that is not harmonic (digital hash), at the high note — dB
//   mud      — energy 200–500 Hz against 1–4 kHz at the slot's own register — dB (a pad or chord heavy in the low-mids buries a mix)
//   dull     — the spectral centroid at the slot's register (Hz); a lead or arp under 900 Hz has no edge
//   width    — side against mid (dB) and the low end's correlation (under 150 Hz): stereo below 150 Hz falls apart on a club system
//   level    — the note's RMS (dB) — the bank's level match handles it, it is only shown
// Each preset gets flags where it is an outlier for its slot (and an absolute limit is broken). Usage: node tools/sound_audit.cjs [slots] [--json]
const { load } = require('./load.cjs'); const X = load(); const { fft } = require('./lib/dsp.cjs');
const args = process.argv.slice(2), pos = args.filter((a) => !a.startsWith('--')), JSONOUT = args.includes('--json');
const SLOTS = pos[0] ? pos[0].split(',') : ['lead', 'chords', 'pad', 'bass', 'arp'], SR = 48000;
const REG = { lead: [72, 91], chords: [60, 84], pad: [55, 79], bass: [33, 57], arp: [72, 93] }; // [the slot's register, a high note]
const N = 16384, win = new Float64Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
function play(kit, note, chord) { X.noiseSeed(3); const S = new X.Synth(SR, chord ? 4 : 2, false); S.bpm = 124; S.setKit(kit); const notes = chord ? [note, note + 4, note + 7] : [note];
  for (const nt of notes) S.trigger(0, nt, 0.8, SR * 1.2, null); const n = Math.round(SR * 0.9), L = new Float32Array(n), R = new Float32Array(n), bl = new Float32Array(128), br = new Float32Array(128);
  for (let i = 0; i < n; i += 128) { bl.fill(0); br.fill(0); S.render(bl, br, 128); for (let j = 0; j < 128 && i + j < n; j++) { L[i + j] = bl[j]; R[i + j] = br[j]; } } return { L, R }; }
function spectrum(x, s0) { const re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < N; i++) { re[i] = (x[s0 + i] || 0) * win[i]; im[i] = 0; } fft(re, im); const P = new Float64Array(N / 2); for (let k = 0; k < N / 2; k++) P[k] = re[k] * re[k] + im[k] * im[k]; return P; }
const hz = (k) => k * SR / N, mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
function inharm(P, f0s, lo, hi) { let h = 0, nh = 0; for (let k = Math.ceil(lo * N / SR); k < Math.min(N / 2, hi * N / SR); k++) { const f = hz(k); let near = false; for (const f0 of f0s) { const r = f / f0, m = Math.round(r); if (m >= 1 && Math.abs(r - m) < 0.015 * Math.max(1, m * 0.2) + 25 / f0) { near = true; break; } } if (near) h += P[k]; else nh += P[k]; } return { h, nh }; }
const dB = (x) => 10 * Math.log10(x + 1e-20);
const rows = [];
for (const slot of SLOTS) { const bank = X.SOUND_BANK[slot]; if (!bank) continue; const [reg, high] = REG[slot], chord = slot === 'chords' || slot === 'pad';
  for (const name of Object.keys(bank)) { const kit = Object.assign({}, bank[name].k); if (!kit.model) continue; try {
      const lo = play(kit, reg, false), hi = play(kit, high, false), ch = chord ? play(kit, reg, true) : lo, s0 = Math.round(SR * 0.25);
      const M = (o) => { const m = new Float32Array(o.L.length); for (let i = 0; i < m.length; i++) m[i] = (o.L[i] + o.R[i]) * 0.5; return m; };
      const Pl = spectrum(M(lo), s0), Ph = spectrum(M(hi), s0), Pc = spectrum(M(ch), s0);
      const il = inharm(Pl, [mtof(reg)], 300, 18000), ih = inharm(Ph, [mtof(high)], 300, 18000), fz = inharm(Ph, [mtof(high)], 9000, 20000);
      const alias = (dB(ih.nh / (ih.h + 1e-20))) - (dB(il.nh / (il.h + 1e-20))), aliasHi = dB(ih.nh / (ih.h + 1e-20)), fizz = dB(fz.nh / (ih.h + ih.nh + 1e-20));
      let e1 = 0, e2 = 0, num = 0, den = 0; for (let k = 1; k < N / 2; k++) { const f = hz(k); if (f >= 200 && f < 500) e1 += Pc[k]; if (f >= 1000 && f < 4000) e2 += Pc[k]; if (f > 40 && f < 16000) { num += f * Pc[k]; den += Pc[k]; } }
      const mud = dB(e1 / (e2 + 1e-20)), cen = num / (den + 1e-20);
      const Lc = ch.L, Rc = ch.R; let mm = 0, ss = 0; for (let i = s0; i < s0 + N && i < Lc.length; i++) { const m = (Lc[i] + Rc[i]) * 0.5, sd = (Lc[i] - Rc[i]) * 0.5; mm += m * m; ss += sd * sd; }
      // low correlation under 150 Hz (two-pole low-pass both sides)
      const lp = (x) => { const o = new Float32Array(x.length), w = Math.tan(Math.PI * 150 / SR), q = 0.7071, nn = 1 / (1 + w / q + w * w), b0 = w * w * nn, a1 = 2 * (w * w - 1) * nn, a2 = (1 - w / q + w * w) * nn; let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < x.length; i++) { const y = b0 * x[i] + 2 * b0 * x1 + b0 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = y; o[i] = y; } return o; };
      const lL = lp(Lc), lR = lp(Rc); let xy = 0, xx = 0, yy = 0; for (let i = s0; i < lL.length; i++) { xy += lL[i] * lR[i]; xx += lL[i] ** 2; yy += lR[i] ** 2; } const lowCorr = xx + yy > 1e-9 ? xy / Math.sqrt(xx * yy + 1e-20) : 1;
      let rms = 0; for (let i = s0; i < lo.L.length; i++) rms += lo.L[i] ** 2; rms = dB(rms / (lo.L.length - s0)) / 2 * 2;
      rows.push({ slot, name, model: kit.model, alias: +alias.toFixed(1), aliasHi: +aliasHi.toFixed(1), fizz: +fizz.toFixed(1), mud: +mud.toFixed(1), centroid: Math.round(cen), width: +(dB(ss / (mm + 1e-20))).toFixed(1), lowCorr: +lowCorr.toFixed(2), level: +(rms / 2).toFixed(1) });
    } catch (e) { rows.push({ slot, name, model: kit.model, err: String(e.message || e) }); } } }
// flags: outliers per slot, and absolute limits
const med = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
for (const slot of SLOTS) { const R = rows.filter((r) => r.slot === slot && !r.err); if (!R.length) continue; const mMud = med(R.map((r) => r.mud)), mFz = med(R.map((r) => r.fizz));
  for (const r of R) { r.flags = [];
    if (r.alias > 12 && r.aliasHi > -35) r.flags.push('aliasing'); if (r.fizz > Math.max(-30, mFz + 10)) r.flags.push('fizz');
    if ((slot === 'chords' || slot === 'pad') && r.mud > Math.max(8, mMud + 6)) r.flags.push('mud'); if ((slot === 'lead' || slot === 'arp') && r.centroid < 900) r.flags.push('dull');
    if (r.lowCorr < 0.8 && slot !== 'pad') r.flags.push('wide lows'); } }
if (JSONOUT) { console.log(JSON.stringify(rows)); } else {
  for (const r of rows) if (r.err || (r.flags && r.flags.length)) console.log(`${r.slot}/${r.name} (${r.model}) ${r.err ? 'ERROR ' + r.err : r.flags.join(', ')} · alias ${r.alias} dB (high note ${r.aliasHi}) · fizz ${r.fizz} · mud ${r.mud} · centroid ${r.centroid} Hz · width ${r.width} · low corr ${r.lowCorr}`);
  const fl = rows.filter((r) => r.flags && r.flags.length), by = {}; for (const r of fl) for (const f of r.flags) by[f] = (by[f] || 0) + 1;
  console.log(`\n${rows.length} presets · ${fl.length} flagged · ${JSON.stringify(by)} · errors ${rows.filter((r) => r.err).length}`); }
