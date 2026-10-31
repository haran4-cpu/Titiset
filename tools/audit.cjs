// sound audit: every genre's drop (8 bars, real engine), long-term 1/3-octave spectrum against an approximate modern
// club-master tilt, punch (PLR: true peak − LUFS), stereo width by band. The tilt is an approximation of published
// average spectra of commercial electronic masters (pink-ish, sub bump, roll-off above 8 kHz) — a compass, not a law:
// a region more than ±4 dB off it is audible as "thin", "boomy", "boxy", "harsh" or "dull".
const { X, renderTrack } = require('./render.cjs'); const { thirdOct, lufs } = require('./lib/dsp.cjs'); const { truePeak } = require('./critic.cjs');
const ids = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2].split(',') : X.GENRES.map((g) => g.id), seed = +(process.argv[3] || 7);
const T = { 31.5: 6, 40: 8, 50: 9, 63: 9, 80: 8, 100: 7, 125: 6, 160: 5, 200: 4, 250: 3, 315: 2.5, 400: 2, 500: 1.5, 630: 1, 800: 0.5, 1000: 0, 1250: -0.5, 1600: -1, 2000: -1.8, 2500: -2.6, 3150: -3.4, 4000: -4.2, 5000: -5, 6300: -6, 8000: -7.2, 10000: -8.7, 12500: -10.5, 16000: -13 };
const TF = Object.keys(T).map(Number), tgt = (f) => { let b = TF[0]; for (const x of TF) if (Math.abs(Math.log2(x / f)) < Math.abs(Math.log2(b / f))) b = x; return T[b]; };
const REG = [['sub', 28, 70, 'boomy', 'no sub'], ['low', 70, 180, 'muddy kick/bass', 'thin low end'], ['lowmid', 180, 560, 'boxy', 'hollow'], ['mid', 560, 2200, 'honky', 'scooped'], ['presence', 2200, 5600, 'harsh', 'distant'], ['air', 5600, 16500, 'fizzy', 'dull']];
const rows = [];
for (const g of ids) { const s = X.composeTrack(g, seed), sec = X.peakSectionOf(s), r = renderTrack(g, seed, { score: s, fromBar: sec.bar0, toBar: sec.bar0 + 8 });
  const M = new Float32Array(r.L.length), Sd = new Float32Array(r.L.length); for (let i = 0; i < M.length; i++) { M[i] = (r.L[i] + r.R[i]) / 2; Sd[i] = (r.L[i] - r.R[i]) / 2; }
  const tm = thirdOct(M, r.sr), ts = thirdOct(Sd, r.sr); const ref = (() => { let a = 0, n = 0; tm.centers.forEach((f, i) => { if (f >= 560 && f <= 2200) { a += tm.bands[i] - tgt(f); n++; } }); return a / n; })();
  const reg = REG.map(([name, lo, hi]) => { let a = 0, n = 0, sw = 0; tm.centers.forEach((f, i) => { if (f >= lo && f < hi) { a += tm.bands[i] - tgt(f) - ref; sw += ts.bands[i] - tm.bands[i]; n++; } }); return { name, dev: a / n, side: sw / n }; });
  const L = lufs(r.L, r.R, r.sr), tp = truePeak(r.L, r.R); rows.push({ g, reg, plr: tp - L.I, lufs: L.I });
  const flags = reg.map((x, i) => (x.dev > 4 ? REG[i][3] : x.dev < -4 ? REG[i][4] : null)).filter(Boolean);
  console.log(`${g.padEnd(18)} PLR ${(tp - L.I).toFixed(1).padStart(4)} dB · ${reg.map((x) => `${x.name} ${(x.dev >= 0 ? '+' : '') + x.dev.toFixed(1)}`).join(' · ')} · width hi ${reg[5].side.toFixed(1)} dB${flags.length ? '  → ' + flags.join(', ') : ''}`); }
const avg = (k) => REG.map((_, i) => rows.reduce((a, r) => a + r.reg[i][k], 0) / rows.length);
console.log(`\nmean deviation: ${REG.map((x, i) => `${x[0]} ${avg('dev')[i].toFixed(1)}`).join(' · ')} · mean PLR ${(rows.reduce((a, r) => a + r.plr, 0) / rows.length).toFixed(1)} dB (modern club masters ≈ 7–10)`);
