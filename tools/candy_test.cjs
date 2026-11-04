// (v9.5) the rebuilt ear candy (src/engine/06e_candy.js) against the 9.4 sounds it replaces, each rendered alone through the engine's Fx
// at 126 BPM over a C minor chord (and its echo): finite · its level (RMS over the sound and 1 s after) within ±3 dB of the 9.4 sound's,
// its peak at most 4 dB over it · in key (the C minor scale carries ≥ 80 % of the pitched energy: a phrase of chord tones, with its own harmonics; ACID ≥ 65 %: a saw's
// 5th harmonic is a major third, and the resonance sweeps across the harmonics) ·
// no click (a 2nd-difference spike 3× over its neighbours) · Usage: node tools/candy_test.cjs [--levels]
const X = require('./load.cjs').load(); const { clicks } = require('./critic.cjs'); const sr = 44100, BPM = 126, SPS = sr * 60 / BPM / 4, LV = process.argv.includes('--levels');
let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
const KINDS = [[7, 'glass (zap)', 2.5], [8, 'harp (rise)', 3], [10, 'wind (swirl)', 16], [11, 'acid (squelch)', 2.5], [12, 'ping (laser)', 2]];
function render(kind, steps, legacy) { X.noiseSeed(0x51); const fx = new X.Fx(sr); fx.setTempo(BPM); fx.legacy = legacy ? 1 : 0; fx.mask = (1 << 0) | (1 << 3) | (1 << 7); fx.root = 0; const dur = Math.round(steps * SPS), N = dur + sr * 2, L = new Float32Array(N), R = new Float32Array(N), bl = new Float32Array(128), br = new Float32Array(128);
  fx.trigger(0, kind, 0.8, dur, 67, 0.3); for (let i = 0; i < N; i += 128) { bl.fill(0); br.fill(0); fx.render(bl, br, 128); for (let j = 0; j < 128 && i + j < N; j++) { L[i + j] = bl[j]; R[i + j] = br[j]; } } return { L, R, dur }; }
const rms = (r, a, b) => { let e = 0; for (let i = a; i < b; i++) e += (r.L[i] ** 2 + r.R[i] ** 2) / 2; return 10 * Math.log10(e / (b - a) + 1e-20); }, pk = (r) => { let m = 0; for (let i = 0; i < r.L.length; i++) m = Math.max(m, Math.abs(r.L[i]), Math.abs(r.R[i])); return 20 * Math.log10(m + 1e-12); };
function pcs(r) { const N = 8192, pc = new Float64Array(12); const x = new Float64Array(r.L.length); for (let i = 0; i < x.length; i++) x[i] = r.L[i] + r.R[i];
  for (let st = 0; st + N <= x.length; st += N / 2) { const re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < N; i++) re[i] = x[st + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)); fft(re, im); for (let k = 1; k < N / 2; k++) { const f = k * sr / N; if (f < 80 || f > 5000) continue; pc[((Math.round(12 * Math.log2(f / 440) + 69) % 12) + 12) % 12] += re[k] ** 2 + im[k] ** 2; } }
  const t = pc.reduce((a, b) => a + b, 0) || 1; return Array.from(pc, (v) => v / t); }
function fft(re, im) { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len; for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) { const wr = Math.cos(a * k), wi = Math.sin(a * k), p = i + k, q = p + len / 2, xr = re[q] * wr - im[q] * wi, xi = re[q] * wi + im[q] * wr; re[q] = re[p] - xr; im[q] = im[p] - xi; re[p] += xr; im[p] += xi; } } }
const bad = [];
for (const [kind, name, steps] of KINDS) { const nw = render(kind, steps, 0), old = render(kind, steps, 1), end = Math.min(nw.L.length, nw.dur + sr); let fin = true; for (const v of nw.L) if (!Number.isFinite(v)) fin = false;
  const d = rms(nw, 0, end) - rms(old, 0, end), dp = pk(nw) - pk(old), p = pcs(nw), key = p[0] + p[2] + p[3] + p[5] + p[7] + p[8] + p[10], ck = clicks(nw.L, sr);
  console.log(`  ${name.padEnd(15)} level ${d >= 0 ? '+' : ''}${d.toFixed(1)} dB (gain → ×${Math.pow(10, -d / 20).toFixed(2)}) · peak ${dp >= 0 ? '+' : ''}${dp.toFixed(1)} dB · in key ${(100 * key).toFixed(0)} % · clicks ${ck}`);
  if (LV) continue; if (!fin) bad.push(`${name}: non-finite`); if (Math.abs(d) > 3) bad.push(`${name}: level ${d.toFixed(1)} dB`); if (dp > 4) bad.push(`${name}: peak +${dp.toFixed(1)} dB`); if (key < (kind === 11 ? 0.65 : 0.8)) bad.push(`${name}: ${(100 * key).toFixed(0)} % in key`); if (ck > 0) bad.push(`${name}: ${ck} clicks`); }
if (!LV) ok(!bad.length, `the rebuilt ear candy: finite, level within ±3 dB of 9.4's, peak ≤ +4 dB, in key, no clicks${bad.length ? ' — not: ' + bad.join(', ') : ''}`);
console.log(fails ? `${fails} failure(s)` : LV ? '' : 'candy: all checks pass'); process.exit(fails ? 1 : 0);
