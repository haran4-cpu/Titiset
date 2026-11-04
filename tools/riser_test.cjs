// (v9.5) the layered transition recipes (src/engine/06c_risers.js), each rendered alone through the engine's Fx at 128 BPM:
//   · finite, and its peak no more than 4.5 dB over the peak of the 9.4 effect it replaces (both measured raw, before the FX fader);
//   · its level within ±3 dB of the 9.4 effect it replaces, in the window that matters (an impact or a sub drop by its peak; a riser's last quarter against the
//     9.4 noise riser; a downlifter's first quarter against the 9.4 downlifter; an impact's or a sub drop's first half second
//     against the 9.4 impact; a swell's last quarter against the reverse cymbal; a wash's middle 6 dB under the 9.4 riser's top — a bed);
//   · no click where it ends (it fades over its last 6 ms: its last 8 samples under −30 dB of its own peak);
//   · the recipes of one type differ: every pair at least 2 dB apart in a profile of 10 octave bands, 16 time slices, the movement of a 1/64-note envelope and the stereo width;
//   · a tonal recipe ends in key: the root, third and fifth carry at least half of its last quarter's pitched energy.
// Usage: node tools/riser_test.cjs [--levels]   (--levels prints the gain each recipe would need, and checks nothing)
const X = require('./load.cjs').load(); const sr = 44100, BPM = 128, SPS = sr * 60 / BPM / 4, LEVELS = process.argv.includes('--levels');
let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
function render(kind, rec, steps, note, third, extra) { X.noiseSeed(0x7a11); const fx = new X.Fx(sr); fx.setTempo(BPM); const dur = Math.round(steps * SPS), N = dur + Math.round(sr * (extra || 0.5)), L = new Float32Array(N), R = new Float32Array(N), bl = new Float32Array(128), br = new Float32Array(128);
  fx.trigger(0, kind, 1, dur, note, third, rec); for (let i = 0; i < N; i += 128) { bl.fill(0); br.fill(0); fx.render(bl, br, 128); for (let j = 0; j < 128 && i + j < N; j++) { L[i + j] = bl[j]; R[i + j] = br[j]; } } return { L, R, dur }; }
const rms = (r, a, b) => { let e = 0; a = Math.max(0, a | 0); b = Math.min(r.L.length, b | 0); for (let i = a; i < b; i++) e += (r.L[i] * r.L[i] + r.R[i] * r.R[i]) / 2; return 10 * Math.log10(e / Math.max(1, b - a) + 1e-20); };
const peak = (r, a, b) => { let m = 0; a = Math.max(0, a | 0); b = Math.min(r.L.length, b == null ? r.L.length : b | 0); for (let i = a; i < b; i++) m = Math.max(m, Math.abs(r.L[i]), Math.abs(r.R[i])); return m; };
function fft(re, im) { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr; re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } } }
function spectrum(x, a, b) { const n = 8192, sp = new Float64Array(n / 2); let c = 0; for (let st = a; st + n <= b; st += n / 2) { const re = new Float64Array(n), im = new Float64Array(n); for (let i = 0; i < n; i++) re[i] = x[st + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1))); fft(re, im); for (let i = 0; i < n / 2; i++) sp[i] += re[i] * re[i] + im[i] * im[i]; c++; } return { sp, n, c }; }
function profile(r) { const m = new Float32Array(r.L.length); for (let i = 0; i < m.length; i++) m[i] = (r.L[i] + r.R[i]) / 2; const { sp, n } = spectrum(m, 0, m.length), out = [];
  for (let k = 0; k < 10; k++) { const a = 31.25 * Math.pow(2, k), b = a * 2; let e = 0; for (let i = Math.ceil(a / sr * n); i < Math.min(n / 2, Math.floor(b / sr * n)); i++) e += sp[i]; out.push(10 * Math.log10(e + 1e-20)); }
  const tot = out.reduce((s, v) => s + v, 0) / 10; for (let k = 0; k < 10; k++) out[k] -= tot; const seg = r.L.length / 16; let mx = -200; const ts = []; for (let k = 0; k < 16; k++) { const v = rms(r, k * seg, (k + 1) * seg); ts.push(v); mx = Math.max(mx, v); } for (const v of ts) out.push(Math.max(-40, v - mx));
  // movement and space: the fluctuation of a 1/64-note envelope (a gate or a roll moves it) and the stereo width, each half
  const w64 = Math.max(32, Math.round(SPS / 4)), half = r.L.length / 2;
  for (const [a0, b0] of [[0, half], [half, r.L.length]]) { const e = []; for (let i = a0; i + w64 <= b0; i += w64) e.push(rms(r, i, i + w64)); const top = Math.max(...e), ev = e.filter((v) => v > top - 30), mu = ev.reduce((x, v) => x + v, 0) / Math.max(1, ev.length);
    out.push(3 * Math.sqrt(ev.reduce((x, v) => x + (v - mu) ** 2, 0) / Math.max(1, ev.length)));
    let mm = 0, ss = 0; for (let i = a0 | 0; i < b0; i++) { const m = (r.L[i] + r.R[i]) / 2, d = (r.L[i] - r.R[i]) / 2; mm += m * m; ss += d * d; } out.push(Math.max(-30, 10 * Math.log10((ss + 1e-20) / (mm + 1e-20)))); }
  return out; }
function inKey(r, a, b, third) { const m = new Float32Array(r.L.length); for (let i = 0; i < m.length; i++) m[i] = (r.L[i] + r.R[i]) / 2; const { sp, n } = spectrum(m, a, b), pc = new Float64Array(12);
  for (let i = 1; i < n / 2; i++) { const f = i * sr / n; if (f < 60 || f > 2500) continue; const k = ((Math.round(12 * Math.log2(f / 440) + 69) % 12) + 12) % 12; pc[k] += sp[i]; } const tot = pc.reduce((s, v) => s + v, 0); return (pc[0] + pc[third] + pc[7]) / (tot || 1); }
const REF = { rise: [0, 'last', 'last', 0], down: [2, 'first', 'first', 0], impact: [1, 'head', 'head', 0], sub: [1, 'head', 'head', 0], swell: [5, 'last', 'last', 0], wash: [0, 'last', 'mid', -6] }; // [9.4 kind, its window, the recipe's window, offset dB]
const win = (r, w) => (w === 'last' ? [r.dur * 0.75, r.dur] : w === 'first' ? [0, r.dur * 0.25] : w === 'head' ? [0, sr * 0.5] : [r.dur * 0.375, r.dur * 0.625]);
const PEAKT = new Set(['impact', 'sub']), refLevel = {}, refPeak = {}; for (const [type, [kind, w, , off]] of Object.entries(REF)) { const steps = type === 'rise' || type === 'down' || type === 'wash' ? 64 : type === 'swell' ? 16 : 32, r = render(kind, 0, steps, 60, 3, 3); refPeak[type] = 20 * Math.log10(peak(r)); refLevel[type] = (PEAKT.has(type) ? refPeak[type] : rms(r, ...win(r, w))) + off; }
const byType = {}, need = []; let peakWorst = -99, clickBad = [], levelBad = [], keyBad = [], keyWorst = 1;
for (const R of X.TX_RECIPES) { const steps = R.type === 'rise' || R.type === 'down' ? 64 : R.type === 'swell' ? 16 : 32, r = render(13, R.k, steps, R.type === 'sub' ? 36 : 60, 3, R.type === 'impact' ? 4 : 0.5);
  let fin = true; for (const a of [r.L, r.R]) for (const v of a) if (!Number.isFinite(v)) fin = false; const pk = peak(r), lv = PEAKT.has(R.type) ? 20 * Math.log10(pk) : rms(r, ...win(r, REF[R.type][2])), d = lv - refLevel[R.type], pkD = 20 * Math.log10(pk) - refPeak[R.type];
  need.push(`${R.id.padEnd(20)} ${R.type.padEnd(6)} ${(d >= 0 ? '+' : '') + d.toFixed(1)} dB → g ${(R.g * Math.pow(10, -d / 20)).toFixed(2)} (peak ${(pkD - d >= 0 ? '+' : '') + (pkD - d).toFixed(1)} dB over the 9.4 effect at that gain)`);
  if (!fin || pkD > 4.5) levelBad.push(`${R.id} ${fin ? 'peak +' + pkD.toFixed(1) + ' dB over the 9.4 effect' : 'NON-FINITE'}`); peakWorst = Math.max(peakWorst, pkD);
  if (Math.abs(d) > 3) levelBad.push(`${R.id} ${(d >= 0 ? '+' : '') + d.toFixed(1)} dB`);
  if (R.type === 'rise' || R.type === 'down' || R.type === 'swell') { const tail = peak(r, r.dur - 8, r.dur + 64), top = peak(r, 0, r.dur); if (tail > top * 0.0316) clickBad.push(`${R.id} ${(20 * Math.log10(tail / top)).toFixed(0)} dB`); }
  if (R.ton > 0 && (R.type === 'rise' || R.type === 'swell')) { const k = inKey(r, Math.round(r.dur * 0.75), r.dur, 3); keyWorst = Math.min(keyWorst, k); if (k < 0.5) keyBad.push(`${R.id} ${(100 * k).toFixed(0)} %`); }
  (byType[R.type] = byType[R.type] || []).push({ id: R.id, p: profile(r) }); }
if (LEVELS) { console.log(need.join('\n')); process.exit(0); }
ok(!levelBad.length, `${X.TX_RECIPES.length} recipes finite, their peaks at most 4.5 dB over the 9.4 effect's (worst +${peakWorst.toFixed(1)} dB), their levels within ±3 dB of it${levelBad.length ? ' — not: ' + levelBad.join(', ') : ''}`);
ok(!clickBad.length, `no click where a riser, downlifter or swell ends (it fades over 6 ms: its last samples ≥ 30 dB under its peak)${clickBad.length ? ' — not: ' + clickBad.join(', ') : ''}`);
ok(!keyBad.length, `the tonal recipes end in key: root, third and fifth carry ≥ 50 % of their last quarter's pitched energy (worst ${(100 * keyWorst).toFixed(0)} %)${keyBad.length ? ' — not: ' + keyBad.join(', ') : ''}`);
{ const close = []; let minD = 1e9, minP = ''; for (const [type, L] of Object.entries(byType)) for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { let e = 0; for (let k = 0; k < L[i].p.length; k++) e += (L[i].p[k] - L[j].p[k]) ** 2; const d = Math.sqrt(e / L[i].p.length); if (d < minD) { minD = d; minP = `${L[i].id} / ${L[j].id}`; } if (d < 2) close.push(`${L[i].id} ≈ ${L[j].id} (${d.toFixed(1)} dB)`); }
  ok(!close.length, `every two recipes of a type differ by ≥ 2 dB in their band, time, movement and width profile (closest: ${minP}, ${minD.toFixed(1)} dB)${close.length ? ' — not: ' + close.join(', ') : ''}`); }
console.log(fails ? `${fails} failure(s)` : 'risers: all checks pass'); process.exit(fails ? 1 : 0);
