// deviation of every genre's drop (as the app plays it) from the modern-master curve, per octave; any source tree, so two versions
// can be compared. Usage: node tools/tone_balance.cjs [tree=this one] [seeds=1,2] [out.json]
const path = require('path'); const tree = path.resolve(process.argv[2] || path.join(__dirname, '..')), seeds = (process.argv[3] || '1,2').split(',').map(Number), outF = process.argv[4];
const { X, renderTrack } = require(path.join(tree, 'tools/render.cjs'));
const app = (gid, seed) => { const snd = X.paletteSounds(gid, seed); let s; if (!Object.keys(snd).length) s = X.composeTrack(gid, seed); else { try { s = X.compileSpec({ forge: 1, genre: gid, seed, sound: snd }, { fastLevels: true }); } catch (e) { s = X.composeTrack(gid, seed); } } if (s.levelPending && X.refineLevels) X.refineLevels(s); return s; };
const EDGES = [31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000], TGT = [0, 0, -3, -5.5, -7, -8.5, -10.6, -13, -16.8];
function fftPow(x) { const n = x.length, re = new Float64Array(n), im = new Float64Array(n); for (let i = 0; i < n; i++) re[i] = x[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)));
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; } }
  for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr; re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
  const m = new Float64Array(n / 2); for (let i = 0; i < n / 2; i++) m[i] = re[i] * re[i] + im[i] * im[i]; return m; }
const res = {}; console.log('genre'.padEnd(18), EDGES.slice(0, -1).map((e) => String(Math.round(e)).padStart(6)).join(''), '  max|dev|');
for (const g of X.GENRES) { const gid = g.id, acc = new Array(9).fill(0);
  for (const seed of seeds) { const score = app(gid, seed), sec = X.peakSectionOf(score), r = renderTrack(gid, seed, { score, fromBar: sec.bar0, toBar: sec.bar0 + 8 });
    const n = 16384, sp = new Float64Array(n / 2); let cnt = 0; const mono = new Float32Array(r.L.length); for (let i = 0; i < mono.length; i++) mono[i] = (r.L[i] + r.R[i]) / 2;
    for (let st = 0; st + n <= mono.length; st += n / 2) { const p = fftPow(mono.subarray(st, st + n)); for (let i = 0; i < n / 2; i++) sp[i] += p[i]; cnt++; }
    const df = r.sr / n, ob = EDGES.slice(0, -1).map((a, k) => { let e = 0; for (let i = Math.ceil(a / df); i < Math.floor(EDGES[k + 1] / df); i++) e += sp[i]; return 10 * Math.log10(e / cnt + 1e-20); });
    const mid = (ob[4] + ob[5]) / 2 - (TGT[4] + TGT[5]) / 2; ob.forEach((d, i) => { acc[i] += (d - mid - TGT[i]) / seeds.length; }); }
  res[gid] = acc; const mx = Math.max(...acc.map(Math.abs)); console.log(gid.padEnd(18), acc.map((d) => d.toFixed(1).padStart(6)).join(''), '  ', mx.toFixed(1)); }
const all = Object.values(res).map((a) => Math.max(...a.map(Math.abs))); console.log('median of the worst octave per genre:', all.sort((a, b) => a - b)[all.length >> 1].toFixed(1), 'dB · genres within ±6 dB everywhere:', all.filter((x) => x <= 6).length + '/' + all.length);
if (outF) require('fs').writeFileSync(outF, JSON.stringify(res));
