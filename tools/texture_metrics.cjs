// texture beds: rendered in each genre's first break (the bed at full level), the texture stem alone. Measures
//   in key   — share of the stem's 150 Hz–5 kHz energy within ±25 cents of the pitch classes of the chords playing
//              (white noise lands ~17 % there by chance; a bed tuned to the harmony lands far above)
//   level    — the bed's loudness relative to the full mix in that break (LU)
//   clicks   — isolated curvature spikes (the critic's click detector) per minute
// Usage: node tools/texture_metrics.cjs [loader root] [genres]
const root = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : require('path').join(__dirname, '..');
const { X, renderTrack } = require(root + '/tools/render.cjs'); const { stemLufs, clicks, mono } = require(root + '/tools/critic.cjs'); const { lufs } = require(root + '/tools/lib/dsp.cjs');
const ids = process.argv[3] ? process.argv[3].split(',') : X.GENRES.filter((g) => g.texture && g.texture !== 'none').map((g) => g.id);
function fftMag(x) { const N = 1 << Math.floor(Math.log2(x.length)), re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < N; i++) re[i] = x[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
  for (let i = 1, j = 0; i < N; i++) { let b = N >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= N; len <<= 1) { const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a); for (let i = 0; i < N; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr; re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
  const m = new Float64Array(N / 2); for (let k = 0; k < N / 2; k++) m[k] = re[k] * re[k] + im[k] * im[k]; return { m, N }; }
const rows = [];
for (const g of ids) { const s = X.composeTrack(g, 3), br = s.sections.find((x) => x.type === 'break') || s.sections[0], r = renderTrack(g, 3, { score: s, fromBar: br.bar0, toBar: br.bar0 + 8, stems: true });
  const st = mono(r.stems[10]); if (!st.some((x) => x !== 0)) { console.log(g.padEnd(18), 'no texture'); continue; }
  const pcs = new Set(); for (let b = br.bar0; b < br.bar0 + 8; b++) for (const pc of s.chords[b].tones) pcs.add(pc);
  let inK = 0, tot = 0; const W = 1 << 15; for (let o = 0; o + W <= st.length; o += W) { const { m, N } = fftMag(st.subarray(o, o + W)); for (let k = 1; k < N / 2; k++) { const f = k * r.sr / N; if (f < 150 || f > 5000) continue; tot += m[k]; const pcF = ((12 * Math.log2(f / 440) + 9) % 12 + 12) % 12; let best = 9; for (const pc of pcs) { const dd = Math.min(Math.abs(pcF - pc), 12 - Math.abs(pcF - pc)); if (dd < best) best = dd; } if (best <= 0.25) inK += m[k]; } }
  const mix = lufs(r.L, r.R, r.sr).I, lv = stemLufs(r.stems[10], r.sr) - mix, ck = clicks(st, r.sr) / (st.length / r.sr / 60);
  rows.push([g, inK / tot, lv, ck]); console.log(`${g.padEnd(18)} ${X.GENRE_BY_ID[g].texture.padEnd(6)} in key ${(100 * inK / tot).toFixed(0).padStart(3)} % · level ${lv.toFixed(1)} LU vs the mix · clicks ${ck.toFixed(1)}/min`); }
console.log(`mean in key ${(100 * rows.reduce((a, r) => a + r[1], 0) / rows.length).toFixed(0)} % (noise ≈ 17 %)`);
