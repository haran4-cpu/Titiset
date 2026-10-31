// timbre diversity: how different do tracks of one genre sound? For each genre, N new tracks (the app's path: palette sounds,
// levels refined in context) are rendered at their peak section with stems; each melodic part (bass, chords, pad, lead, arp)
// gets its spectral shape (power in 24 log bands, 50 Hz–16 kHz, level removed). Two tracks differ by the mean over the parts
// they share of the RMS difference of those shapes (dB). Reported per genre: the mean pairwise distance, and how many distinct
// sounds the tracks used. Usage: node tools/timbre_diversity.cjs [genres] [N] [tree root, default this repo]
const path = require('path');
const ROOT = process.argv[4] ? path.resolve(process.argv[4]) : path.join(__dirname, '..');
const { X, renderTrack, appScore } = require(path.join(ROOT, 'tools', 'render.cjs'));
const GEN = process.argv[2] && process.argv[2] !== 'all' ? process.argv[2].split(',') : ['deep-house', 'tech-house', 'techno', 'melodic-techno', 'trance', 'psytrance', 'dnb', 'trap', 'ukg', 'afro-house', 'synthwave', 'lofi'];
const N = +process.argv[3] || 6, PARTS = { bass: 4, chords: 5, pad: 6, lead: 7, arp: 8 }, NB = 24, FFT = 4096;
const BANDS = Array.from({ length: NB + 1 }, (_, i) => 50 * Math.pow(16000 / 50, i / NB));
function fft(re, im) { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const ur = re[i + k], ui = im[i + k], xr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, xi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + xr; im[i + k] = ui + xi; re[i + k + len / 2] = ur - xr; im[i + k + len / 2] = ui - xi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } } }
function shape(st, sr) { const n = st.length / 2, P = new Float64Array(FFT / 2), re = new Float64Array(FFT), im = new Float64Array(FFT); let frames = 0, e = 0;
  for (let s = 0; s + FFT <= n; s += FFT) { for (let i = 0; i < FFT; i++) { const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / FFT); re[i] = (st[2 * (s + i)] + st[2 * (s + i) + 1]) * 0.5 * w; im[i] = 0; e += re[i] * re[i]; } fft(re, im); for (let k = 0; k < FFT / 2; k++) P[k] += re[k] * re[k] + im[k] * im[k]; frames++; }
  if (!frames || e < 1e-6) return null; const b = new Float64Array(NB);
  for (let k = 1; k < FFT / 2; k++) { const f = k * sr / FFT; for (let j = 0; j < NB; j++) if (f >= BANDS[j] && f < BANDS[j + 1]) { b[j] += P[k]; break; } }
  const db = Array.from(b, (x) => 10 * Math.log10(x + 1e-12)), mx = Math.max(...db); const out = db.map((x) => Math.max(x - mx, -60)); const m = out.reduce((a, x) => a + x, 0) / NB; return out.map((x) => x - m); }
function dist(a, b) { let d = 0, n = 0; for (const p in a) if (b[p]) { let s = 0; for (let j = 0; j < NB; j++) s += (a[p][j] - b[p][j]) ** 2; d += Math.sqrt(s / NB); n++; } return n ? d / n : null; }
const rows = []; let all = 0, allN = 0;
for (const gid of GEN) { const feats = [], sounds = new Set(); const t0 = Date.now();
  for (let k = 0; k < N; k++) { const seed = 1000 + k * 7919, s = appScore(gid, seed), sec = X.peakSectionOf(s); const r = renderTrack(gid, seed, { score: s, fromBar: sec.bar0, toBar: sec.bar0 + 8, stems: true });
    const f = {}; for (const [p, c] of Object.entries(PARTS)) { const sh = shape(r.stems[c], r.sr); if (sh) f[p] = sh; } feats.push(f);
    const sp = s.spec && s.spec.sound; for (const p of Object.keys(PARTS)) sounds.add(p + ':' + (sp && sp[p] && sp[p].preset || 'genre')); if (sp && sp.drums && sp.drums.family) sounds.add('kit:' + sp.drums.family); }
  let d = 0, n = 0; for (let i = 0; i < feats.length; i++) for (let j = i + 1; j < feats.length; j++) { const x = dist(feats[i], feats[j]); if (x != null) { d += x; n++; } }
  const m = n ? d / n : 0; all += m; allN++; rows.push(`${gid.padEnd(16)} ${m.toFixed(2).padStart(6)} dB   ${String(sounds.size).padStart(3)} distinct sounds   (${((Date.now() - t0) / 1000).toFixed(0)} s)`); process.stdout.write('.'); }
console.log('\n' + rows.join('\n')); console.log(`mean spectral-shape distance between two tracks of a genre: ${(all / allN).toFixed(2)} dB over ${allN} genres × ${N} tracks (${ROOT === path.join(__dirname, '..') ? 'this tree' : ROOT})`);
