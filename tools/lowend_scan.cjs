// (v9.4) low-end scan: the drops of new tracks (every club genre × 4 seeds, the app's own sounds) — the worst of the 31/63/125 Hz
// octaves against the modern-master curve, its median and 10th percentile, and every drop more than 7 dB under. Informational (signature_test grades 2 seeds).
// Usage: node tools/lowend_scan.cjs
const { X, renderTrack, appScore } = require('./render.cjs'); const sr = 44100;
const EDGES = [31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000], TGT = [0, 0, -3, -5.5, -7, -8.5, -10.6, -13, -16.8];
function fftPow(x) { const n = x.length, re = new Float64Array(n), im = new Float64Array(n); for (let i = 0; i < n; i++) re[i] = x[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)));
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; } }
  for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr; re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
  const m = new Float64Array(n / 2); for (let i = 0; i < n / 2; i++) m[i] = re[i] * re[i] + im[i] * im[i]; return m; }
function bal(L, R) { const n = 16384, sp = new Float64Array(n / 2); let cnt = 0; const mono = new Float32Array(L.length); for (let i = 0; i < mono.length; i++) mono[i] = (L[i] + R[i]) / 2;
  for (let st = 0; st + n <= mono.length; st += n / 2) { const p = fftPow(mono.subarray(st, st + n)); for (let i = 0; i < n / 2; i++) sp[i] += p[i]; cnt++; }
  const df = sr / n, ob = EDGES.slice(0, -1).map((a, k) => { let e = 0; for (let i = Math.ceil(a / df); i < Math.floor(EDGES[k + 1] / df); i++) e += sp[i]; return 10 * Math.log10(e / cnt + 1e-20); });
  const mid = (ob[4] + ob[5]) / 2 - (TGT[4] + TGT[5]) / 2; return ob.map((d, i) => d - mid - TGT[i]); }
const skip = new Set(['ambient', 'lofi', 'downtempo', 'dub-techno']); let all = [], bad = [];
for (const G of X.GENRES) { if (skip.has(G.id)) continue; for (const seed of [3, 4, 5, 6]) { const s = appScore(G.id, seed), sec = X.peakSectionOf(s), r = renderTrack(G.id, seed, { score: s, fromBar: sec.bar0, toBar: sec.bar0 + 8 }); const b = bal(r.L, r.R), w = Math.min(b[0], b[1], b[2]);
  all.push(w); const sp = (s.spec && s.spec.sound) || {}; if (w < -7) bad.push(`${G.id}/${seed} ${w.toFixed(1)} (bass ${sp.bass ? sp.bass.preset : 'default'}, kit ${s.kits.drumFam || 'default'})`); } }
all.sort((a, b) => a - b); console.log(`drops: ${all.length} · low-octave worst median ${all[all.length >> 1].toFixed(1)} dB · 10th pct ${all[Math.floor(all.length / 10)].toFixed(1)} · below −7 dB: ${bad.length}`); console.log(bad.join('\n'));
