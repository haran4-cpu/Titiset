// (v10) MIX AUDIT — where the mix is crowded, measured on the rendered drop (the app's own path, 8 bars) with every part's stem:
//   bands    — the master's energy in seven bands (sub 25–60, low 60–125, low-mid 125–250, mud 250–500, mid 500–2k, presence 2–5k,
//              air 5–16k), dB against the master's total; and its spectral slope (dB/octave, 60 Hz–12 kHz)
//   low end  — the share of the energy under 120 Hz; how mono it is (correlation of L and R under 120 Hz); how far the bass gives way
//              to the kick (bass energy under 150 Hz in the 40 ms after each kick against the 40 ms before it, dB)
//   masking  — for each pair of parts: the share of the time–frequency cells (third octaves, 46 ms frames, 100 Hz–6 kHz) where both
//              parts are loud (within 30 dB of their own maximum) and within 6 dB of each other — neither can be heard clearly there.
//              The crowding index of a track is the sum over the pairs of those cells' energy against the mix's energy in that range.
//   density  — how many parts are loud at once in 200 Hz–2 kHz, on average
// Usage: node tools/mix_audit.cjs [genres|all] [seeds=1,2] [--json]   (prints per track, then the means)
const { X, renderTrack } = require('./render.cjs'); const { fft, lufs } = require('./lib/dsp.cjs');
const args = process.argv.slice(2), pos = args.filter((a) => !a.startsWith('--')), JSONOUT = args.includes('--json');
const DEF = 'deep-house,tech-house,techno,melodic-techno,trance,progressive-house,dnb,dubstep,future-bass,afro-house,lofi,synthwave';
const G = !pos[0] ? DEF.split(',') : pos[0] === 'all' ? X.GENRES.map((g) => g.id) : pos[0].split(','), SEEDS = (pos[1] || '1,2').split(',').map(Number);
const NAMES = ['kick', 'snare', 'hats', 'perc', 'bass', 'chords', 'pad', 'lead', 'arp'];
const BANDS = [['sub', 25, 60], ['low', 60, 125], ['lowmid', 125, 250], ['mud', 250, 500], ['mid', 500, 2000], ['presence', 2000, 5000], ['air', 5000, 16000]];
const N = 2048, HOP = 2048, win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
const centers = []; for (let f = 100; f <= 6000; f *= Math.pow(2, 1 / 3)) centers.push(f);
const monoOf = (st) => { const n = st.length / 2, o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = (st[2 * i] + st[2 * i + 1]) * 0.5; return o; };
// a part's third-octave spectrogram: [frame][band] energy
function spec3(x, sr) { const re = new Float64Array(N), im = new Float64Array(N), out = []; for (let s = 0; s + N <= x.length; s += HOP) { for (let i = 0; i < N; i++) { re[i] = x[s + i] * win[i]; im[i] = 0; } fft(re, im);
    out.push(centers.map((fc) => { const lo = fc / Math.pow(2, 1 / 6), hi = fc * Math.pow(2, 1 / 6); let e = 0; for (let k = Math.max(1, Math.ceil(lo * N / sr)); k <= Math.floor(hi * N / sr) && k < N / 2; k++) e += re[k] * re[k] + im[k] * im[k]; return e; })); } return out; }
function bandsOf(x, sr) { const NN = 8192, re = new Float64Array(NN), im = new Float64Array(NN), acc = new Float64Array(NN / 2); const w = new Float32Array(NN); for (let i = 0; i < NN; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / NN);
  for (let s = 0; s + NN <= x.length; s += NN / 2) { for (let i = 0; i < NN; i++) { re[i] = x[s + i] * w[i]; im[i] = 0; } fft(re, im); for (let k = 0; k < NN / 2; k++) acc[k] += re[k] * re[k] + im[k] * im[k]; }
  let tot = 0; for (let k = Math.ceil(25 * NN / sr); k < Math.min(NN / 2, 16000 * NN / sr); k++) tot += acc[k];
  const b = {}; for (const [n, lo, hi] of BANDS) { let e = 0; for (let k = Math.ceil(lo * NN / sr); k < Math.min(NN / 2, hi * NN / sr); k++) e += acc[k]; b[n] = +(10 * Math.log10(e / tot + 1e-12)).toFixed(1); }
  // slope: least squares of third-octave dB over log2 f, 60 Hz–12 kHz
  const xs = [], ys = []; for (let f = 63; f <= 12000; f *= Math.pow(2, 1 / 3)) { const lo = f / Math.pow(2, 1 / 6), hi = f * Math.pow(2, 1 / 6); let e = 0; for (let k = Math.ceil(lo * NN / sr); k <= Math.floor(hi * NN / sr); k++) e += acc[k]; xs.push(Math.log2(f)); ys.push(10 * Math.log10(e + 1e-20)); }
  const mx = xs.reduce((a, c) => a + c) / xs.length, my = ys.reduce((a, c) => a + c) / ys.length; let nu = 0, de = 0; for (let i = 0; i < xs.length; i++) { nu += (xs[i] - mx) * (ys[i] - my); de += (xs[i] - mx) ** 2; }
  let low = 0; for (let k = 1; k < 120 * NN / sr; k++) low += acc[k]; return { b, slope: +(nu / de).toFixed(2), lowShare: +(100 * low / tot).toFixed(1) }; }
function lp(x, f, sr) { const o = new Float32Array(x.length); const w = Math.tan(Math.PI * f / sr), q = 0.7071, n = 1 / (1 + w / q + w * w), b0 = w * w * n, a1 = 2 * (w * w - 1) * n, a2 = (1 - w / q + w * w) * n; let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const y = b0 * x[i] + 2 * b0 * x1 + b0 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = y; o[i] = y; } return o; }
const rows = [];
for (const g of G) for (const seed of SEEDS) {
  const s = X.composeTrack(g, seed), drop = X.peakSectionOf(s), r = renderTrack(g, seed, { score: s, fromBar: drop.bar0, toBar: drop.bar0 + 8, stems: true, carve: process.env.FORGE_CARVE != null ? +process.env.FORGE_CARVE : undefined }), sr = r.sr;
  const M = new Float32Array(r.L.length); for (let i = 0; i < M.length; i++) M[i] = (r.L[i] + r.R[i]) * 0.5; const B = bandsOf(M, sr);
  // low mono: correlation under 120 Hz
  const lL = lp(lp(r.L, 120, sr), 120, sr), lR = lp(lp(r.R, 120, sr), 120, sr); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < lL.length; i++) { sxy += lL[i] * lR[i]; sxx += lL[i] ** 2; syy += lR[i] ** 2; } const mono = sxy / Math.sqrt(sxx * syy + 1e-20);
  // the bass giving way to the kick
  const kick = [], sps = r.sps; for (let i = 0; i < s.ev.n; i++) if (s.ev.ch[i] === 0 && s.ev.t[i] >= r.fromStep) kick.push(Math.round((s.ev.t[i] - r.fromStep) * sps));
  const bass = lp(lp(monoOf(r.stems[4]), 150, sr), 150, sr), w40 = Math.round(0.04 * sr); let ea = 0, eb = 0, nk = 0;
  for (const k of kick) { if (k - w40 < 0 || k + w40 >= bass.length) continue; let a = 0, b = 0; for (let i = 0; i < w40; i++) { a += bass[k + i] ** 2; b += bass[k - w40 + i] ** 2; } ea += a; eb += b; nk++; }
  const duck = nk && eb > 1e-9 ? +(10 * Math.log10((ea + 1e-12) / eb)).toFixed(1) : null;
  // masking between parts
  const S = NAMES.map((n, c) => { const x = monoOf(r.stems[c]); let pk = 0; for (let i = 0; i < x.length; i++) pk = Math.max(pk, Math.abs(x[i])); return pk < 1e-4 ? null : spec3(x, sr); });
  const mix3 = spec3(M, sr); let mixE = 0; for (const fr of mix3) for (const e of fr) mixE += e;
  const mx = S.map((sp) => { if (!sp) return 0; let m = 0; for (const fr of sp) for (const e of fr) m = Math.max(m, e); return m; });
  const pairs = []; let crowd = 0;
  for (let a = 0; a < 9; a++) for (let b = a + 1; b < 9; b++) { if (!S[a] || !S[b]) continue; let cells = 0, tot = 0, en = 0;
    for (let f = 0; f < Math.min(S[a].length, S[b].length); f++) for (let k = 0; k < centers.length; k++) { const ea_ = S[a][f][k], eb_ = S[b][f][k]; tot++;
      if (ea_ > mx[a] * 1e-3 && eb_ > mx[b] * 1e-3 && Math.abs(10 * Math.log10((ea_ + 1e-20) / (eb_ + 1e-20))) < 6) { cells++; en += Math.min(ea_, eb_); } }
    const share = cells / tot, ei = en / (mixE + 1e-20); crowd += ei; if (share > 0.01) pairs.push([`${NAMES[a]}/${NAMES[b]}`, +(100 * share).toFixed(1), +(100 * ei).toFixed(1)]); }
  pairs.sort((x, y) => y[2] - x[2]);
  // density: parts loud at once in 200 Hz–2 kHz
  const kLo = centers.findIndex((f) => f >= 200), kHi = centers.findIndex((f) => f > 2000); let dens = 0, fr = 0;
  for (let f = 0; f < mix3.length; f++) { let n = 0; for (let c = 0; c < 9; c++) { if (!S[c] || !S[c][f]) continue; let e = 0; for (let k = kLo; k < kHi; k++) e += S[c][f][k]; let em = 0; for (let k = kLo; k < kHi; k++) em += mix3[f][k]; if (e > em * 0.05) n++; } dens += n; fr++; }
  const row = { g, seed, lufs: +lufs(r.L, r.R, sr).I.toFixed(1), bands: B.b, slope: B.slope, lowShare: B.lowShare, lowMono: +mono.toFixed(3), bassDuck: duck, crowd: +(100 * crowd).toFixed(1), density: +(dens / Math.max(1, fr)).toFixed(2), pairs: pairs.slice(0, 4) };
  rows.push(row);
  if (!JSONOUT) console.log(`${g.padEnd(18)} s${seed} ${row.lufs} LUFS · slope ${row.slope} · ${Object.entries(row.bands).map(([k, v]) => `${k} ${v}`).join(' ')} · low ${row.lowShare}% mono ${row.lowMono} duck ${row.bassDuck} dB · crowd ${row.crowd}% · density ${row.density} · ${row.pairs.map((p) => `${p[0]} ${p[2]}%`).join(', ')}`); }
const mean = (f) => +(rows.reduce((a, r) => a + f(r), 0) / rows.length).toFixed(2);
const summary = { tracks: rows.length, slope: mean((r) => r.slope), lowShare: mean((r) => r.lowShare), lowMono: mean((r) => r.lowMono), bassDuck: mean((r) => r.bassDuck || 0), crowd: mean((r) => r.crowd), density: mean((r) => r.density), bands: Object.fromEntries(BANDS.map(([n]) => [n, mean((r) => r.bands[n])])) };
const pc = {}; for (const r of rows) for (const p of r.pairs) pc[p[0]] = (pc[p[0]] || 0) + p[2] / rows.length; summary.pairs = Object.entries(pc).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => [k, +v.toFixed(1)]);
if (JSONOUT) console.log(JSON.stringify({ rows, summary })); else console.log('\nMEAN ' + JSON.stringify(summary));
