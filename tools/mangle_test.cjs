// (v9.5) MANGLE (src/engine/06d_mangle.js): every engine and every one of its four choices, run as an insert on a real deck
// (10 bars of the peak section of a psytrance and a deep-house track, rendered dry first), switched on off the grid and off again:
//   · finite, audible (it changes the sound: the difference ≥ −20 dB under the dry signal), its level within −6 … +3 dB of the dry
//     signal's and its peak at most 6 dB over the dry peak, no more clicks than the dry bars have (+2) — switching it on and off included (SLICE and GRAIN: counted on smooth
//     material, since they move the music's own transients);
//   · its cost per second of audio (real time = 1000 ms), each under 80 ms;
//   · it keeps time: SLICE at Chaos 0 is the bar before, sample for sample (Hold off), and its slices start on the grid;
//   · it keeps the key: SPECTRAL · Key turns white noise into the chord (C E G carry ≥ 55 % of the pitched energy, noise: 25 %), and
//     STEPS' repeats of a C land on the chord's tones (≥ 80 % of the echo's energy on C, E and G);
//   · the Morph from SLICE to GRAIN and back adds no clicks.
// Usage: node tools/mangle_test.cjs [--verbose]
const { X } = require('./render.cjs'); const { clicks } = require('./critic.cjs'); const cal = require('../src/engine/calibration.json');
const sr = 44100, BLK = 128, V = process.argv.includes('--verbose'); let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
const rms = (a, s, e) => { let q = 0; s = s || 0; e = e || a.length; for (let i = s; i < e; i++) q += a[i] * a[i]; return Math.sqrt(q / Math.max(1, e - s)); };
const peak = (a) => { let m = 0; for (const x of a) m = Math.max(m, Math.abs(x)); return m; };
function dryOf(gid) { const s = X.composeTrack(gid, 4), sec = X.peakSectionOf(s), E = new X.Engine(sr); E.cmd({ type: 'load', deck: 0, score: s, cal: cal[gid], play: true, from: sec.bar0 * 16 }); const D = E.decks[0];
  const n = Math.round(160 * D.sps), L = new Float32Array(n), R = new Float32Array(n), bl = new Float32Array(BLK), br = new Float32Array(BLK); let beat0 = null;
  for (let i = 0; i < n; i += BLK) { if (beat0 == null) beat0 = D.pos / 4; E.render(bl, br, BLK); for (let k = 0; k < BLK && i + k < n; k++) { L[i + k] = bl[k] * 0.7; R[i + k] = br[k] * 0.7; } }
  return { L, R, bpm: D.bpm, beat0, mask: D.mix.reso.mask, root: D.mix.reso.root }; }
// run a mangler over a signal; ev(i, M): called before each block (i = sample index) to switch things
function mangle(sig, bpm, beat0, ev, mask, root) { const M = new X.Mangler(sr); M.prealloc(); M.bpm = bpm; M.mask = mask ?? 0x91; M.root = root ?? 0; const n = sig.L.length, L = new Float32Array(n), R = new Float32Array(n), bl = new Float32Array(BLK), br = new Float32Array(BLK);
  const bInc = bpm / 60 / sr; let busy = 0n;
  for (let i = 0; i < n; i += BLK) { if (ev) ev(i, M); const m = Math.min(BLK, n - i); for (let k = 0; k < m; k++) { bl[k] = sig.L[i + k]; br[k] = sig.R ? sig.R[i + k] : sig.L[i + k]; } const a = process.hrtime.bigint(); M.block(bl, br, m, beat0 + i * bInc); busy += process.hrtime.bigint() - a; for (let k = 0; k < m; k++) { L[i + k] = bl[k]; R[i + k] = br[k]; } }
  return { L, R, ms: Number(busy) / 1e6, sec: n / sr }; }
// SLICE and GRAIN re-place the music's own transients (a hat moved to a quiet moment is not an artifact, but the click detector
// cannot tell): their clicks are counted on smooth material — a sustained chord with a slow swell, which has none of its own
const SMOOTH = (() => { const n = sr * 9, L = new Float32Array(n), R = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i / sr, a = 0.25 * (0.6 + 0.4 * Math.sin(2 * Math.PI * 0.3 * t)); L[i] = a * (Math.sin(2 * Math.PI * 220 * t) + 0.6 * Math.sin(2 * Math.PI * 277.2 * t) + 0.5 * Math.sin(2 * Math.PI * 329.6 * t)); R[i] = L[i] * 0.9; } return { L, R }; })(), smoothMemo = {};
function smoothClicks(mode, sub, macro) { const k = mode + '/' + sub + '/' + macro; if (smoothMemo[k] != null) return smoothMemo[k]; const spb = sr * 60 / 128; X.noiseSeed(4242);
  const r = mangle(SMOOTH, 128, 0, (i, M) => { if (i <= Math.round(1.37 * spb) && Math.round(1.37 * spb) < i + BLK) M.set({ slot: 0, on: true, mode, sub, macro, a: 0.5, b: 0.5, c: 0.5, hold: mode === 0 ? 1 : 0 }); if (i <= Math.round(14.6 * spb) && Math.round(14.6 * spb) < i + BLK) M.set({ slot: 0, on: false }); }, 0x91, 0);
  return (smoothMemo[k] = clicks(r.L, sr)); }
const bad = [], cost = [];
for (const gid of ['psytrance', 'deep-house']) { const d = dryOf(gid), spb = sr * 60 / d.bpm, on = Math.round(4.37 * spb), off = Math.round(34.6 * spb), m0 = Math.round(8 * spb), m1 = Math.round(32 * spb), dk = clicks(d.L, sr);
  for (let mode = 0; mode < 8; mode++) for (let sub = 0; sub < 4; sub++) for (const macro of [0.5, 1]) { const name = `${gid} ${X.MG_MODES[mode]}/${X.MG_SPEC[X.MG_MODES[mode]][4][sub]} macro ${macro}`;
    X.noiseSeed(0x6a11 + mode * 97 + sub * 13); /* (each run on its own noise: the result does not depend on the order) */
    const r = mangle(d, d.bpm, d.beat0, (i, M) => { if (i <= on && on < i + BLK) M.set({ slot: 0, on: true, mode, sub, macro, a: 0.5, b: 0.5, c: 0.5, hold: mode === 0 ? 1 : 0 }); if (i <= off && off < i + BLK) M.set({ slot: 0, on: false }); }, d.mask, d.root);
    let fin = true; for (const x of r.L) if (!Number.isFinite(x)) fin = false; for (const x of r.R) if (!Number.isFinite(x)) fin = false;
    const lv = 20 * Math.log10((rms(r.L, m0, m1) + rms(r.R, m0, m1)) / (rms(d.L, m0, m1) + rms(d.R, m0, m1))), pk = 20 * Math.log10(Math.max(peak(r.L), peak(r.R)) / Math.max(peak(d.L), peak(d.R)));
    const diff = new Float32Array(m1 - m0); for (let i = 0; i < diff.length; i++) diff[i] = r.L[m0 + i] - d.L[m0 + i]; const ch = 20 * Math.log10(rms(diff) / (rms(d.L, m0, m1) + 1e-12)), ck = mode <= 1 ? smoothClicks(mode, sub, macro) : clicks(r.L, sr);
    const why = []; if (!fin) why.push('non-finite'); if (ch < -20) why.push(`inaudible (${ch.toFixed(1)} dB)`); if (lv < -6 || lv > 3) why.push(`level ${lv.toFixed(1)} dB`); if (pk > 6) why.push(`peak +${pk.toFixed(1)} dB`); if (ck > dk + 2) why.push(`${ck} clicks (dry ${dk})`);
    if (why.length) bad.push(`${name}: ${why.join(', ')}`); if (macro === 0.5 && gid === 'psytrance') cost.push([X.MG_MODES[mode] + '/' + sub, r.ms / r.sec]);
    if (V) console.log(`  ${name.padEnd(46)} level ${lv.toFixed(1).padStart(5)} dB · peak ${pk.toFixed(1).padStart(5)} · change ${ch.toFixed(1).padStart(6)} dB · clicks ${ck} (dry ${dk}) · ${(r.ms / r.sec).toFixed(1)} ms/s`); } }
ok(!bad.length, `8 engines × 4 choices × Macro 0.5 and 1 on two tracks: finite, audible, level within −6 … +3 dB, peak ≤ +6 dB, no added clicks${bad.length ? ' — not:\n    ' + bad.join('\n    ') : ''}`);
{ const worst = cost.reduce((a, b) => (b[1] > a[1] ? b : a)); ok(worst[1] < 80, `cost per audio second: worst ${worst[0]} ${worst[1].toFixed(1)} ms, mean ${(cost.reduce((s, c) => s + c[1], 0) / cost.length).toFixed(1)} ms (real time = 1000)`); }
// time: SLICE at Chaos 0, Hold off, is the bar before, sample for sample (after its first bar); a click train keeps its clicks on the beat at Chaos 0.8
{ const bpm = 128, spb = sr * 60 / bpm, n = Math.round(16 * spb), L = new Float32Array(n); for (let i = 0; i < n; i++) L[i] = Math.sin(i * 0.031) * 0.3 + Math.sin(i * 0.0071) * 0.2;
  const r = mangle({ L }, bpm, 0, (i, M) => { if (i === 0) M.set({ slot: 0, on: true, mode: 0, sub: 1, macro: 0, b: 0, c: 0, hold: 0 }); }); const bar = Math.round(4 * spb); let err = 0; for (let i = 2 * bar; i < n - 64; i++) err = Math.max(err, Math.abs(r.L[i] - L[i - bar]));
  ok(err < 0.02, `SLICE at Chaos 0 (Hold off) plays the bar before: largest difference ${err.toFixed(4)} over 2 bars`);
  const C = new Float32Array(n); for (let b = 0; b < 16; b++) { const at = Math.round(b * spb); for (let k = 0; k < 600; k++) C[at + k] = Math.exp(-k / 120) * 0.8 * Math.sin(k * 0.3); }
  const q = mangle({ L: C }, bpm, 0, (i, M) => { if (i === 128 * Math.round(4.2 * spb / 128)) M.set({ slot: 0, on: true, mode: 0, sub: 1, macro: 0.8, a: 0.3, b: 0, c: 0, hold: 1 }); }); let offGrid = 0, hits = 0; const g16 = spb / 4;
  for (let i = Math.round(5 * spb); i < n - 1; i++) if (Math.abs(q.L[i]) > 0.3 && Math.max(...Array.from(q.L.subarray(Math.max(0, i - 220), i - 20), Math.abs)) < 0.05) { hits++; const ph = i / g16 - Math.round(i / g16); if (Math.abs(ph * g16) > 0.0015 * sr + 2) offGrid++; }
  ok(hits > 0 && offGrid / hits < 0.35, `SLICE at Chaos 0.8 re-cuts a click train on the 1/16 grid: ${hits} onsets, ${offGrid} off the grid (reversed and half-speed slices move theirs inside a slice)`); }
// key: SPECTRAL · Key on white noise, and STEPS on a C
function pcs(sig, a, b) { const N = 8192, pc = new Float64Array(12); for (let st = a; st + N <= b; st += N) { const re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < N; i++) re[i] = sig[st + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
    fftR(re, im); for (let k = 1; k < N / 2; k++) { const f = k * sr / N; if (f < 80 || f > 4000) continue; pc[((Math.round(12 * Math.log2(f / 440) + 69) % 12) + 12) % 12] += re[k] * re[k] + im[k] * im[k]; } } const t = pc.reduce((s, v) => s + v, 0); return Array.from(pc, (v) => v / t); }
function fftR(re, im) { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len; for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) { const wr = Math.cos(a * k), wi = Math.sin(a * k), p = i + k, q = p + len / 2, xr = re[q] * wr - im[q] * wi, xi = re[q] * wi + im[q] * wr; re[q] = re[p] - xr; im[q] = im[p] - xi; re[p] += xr; im[p] += xi; } } }
{ let z = 99; const rnd = () => { z = (Math.imul(z, 1664525) + 1013904223) | 0; return z / 2147483648; }, n = sr * 4, L = new Float32Array(n), R = new Float32Array(n); for (let i = 0; i < n; i++) { L[i] = rnd() * 0.2; R[i] = rnd() * 0.2; }
  const r = mangle({ L, R }, 120, 0, (i, M) => { if (i === 0) M.set({ slot: 0, on: true, mode: 2, sub: 2, macro: 0.9, a: 0.5, b: 0.5, c: 0 }); }), p = pcs(r.L, sr, n), p0 = pcs(L, sr, n);
  ok(p[0] + p[4] + p[7] >= 0.55, `SPECTRAL · Key on white noise: C, E and G carry ${(100 * (p[0] + p[4] + p[7])).toFixed(0)} % of the pitched energy (the noise itself: ${(100 * (p0[0] + p0[4] + p0[7])).toFixed(0)} %)`); }
{ const bpm = 120, spb = sr * 60 / bpm, n = Math.round(12 * spb), L = new Float32Array(n), f = 261.63; for (let i = 0; i < Math.round(spb * 0.4); i++) L[i] = Math.sin(2 * Math.PI * f * i / sr) * 0.5 * Math.min(1, i / 200, (spb * 0.4 - i) / 200);
  const r = mangle({ L }, bpm, 0, (i, M) => { if (i === 0) M.set({ slot: 0, on: true, mode: 3, sub: 0, macro: 0.8, a: 0.6, b: 0.8, c: 0 }); }), p = pcs(r.L, Math.round(spb * 0.5), n);
  ok(p[0] + p[4] + p[7] >= 0.8, `STEPS · Up on a C (C major chord): the repeats put ${(100 * (p[0] + p[4] + p[7])).toFixed(0)} % of their energy on C, E and G`); }
// morph: SLICE (A) into GRAIN (B) and back, over the dry track: no more clicks than the dry bars
{ const d = dryOf('techno'), spb = sr * 60 / d.bpm, n = d.L.length, dk = clicks(d.L, sr);
  const r = mangle(d, d.bpm, d.beat0, (i, M) => { if (i === 0) { M.set({ slot: 0, on: true, mode: 0, sub: 1, macro: 0.6, hold: 1 }); M.set({ slot: 1, on: true, mode: 1, sub: 2, macro: 0.5, b: 0.4 }); } const u = i / n; M.set({ morph: u < 0.5 ? u * 2 : 2 - u * 2 }); }, d.mask, d.root);
  const ck = clicks(r.L, sr); let fin = true; for (const x of r.L) if (!Number.isFinite(x)) fin = false; ok(fin && ck <= dk + 2, `MORPH SLICE → GRAIN → SLICE over ${Math.round(n / spb / 4)} bars: finite, ${ck} clicks (dry ${dk})`); }
// switching the engine and its choice while it sounds: through the dry signal, no clicks
{ const d = dryOf('deep-house'), spb = sr * 60 / d.bpm, n = d.L.length, dk = clicks(d.L, sr), seq = [[0, 1], [2, 2], [4, 0], [1, 3], [3, 2], [5, 3], [6, 1], [7, 2], [0, 3], [2, 0]];
  const r = mangle(d, d.bpm, d.beat0, (i, M) => { const k = Math.floor(i / (3.1 * spb)); if (k < seq.length && i % Math.round(3.1 * spb) < BLK) M.set({ slot: 0, on: true, mode: seq[k][0], sub: seq[k][1], macro: 0.7 }); }, d.mask, d.root);
  const ck = clicks(r.L, sr); ok(ck <= dk + 2, `10 changes of engine and choice while it plays (every 3.1 beats): ${ck} clicks (dry ${dk})`); }
// in the engine: on the whole deck and on one part, both slots, through a full render with the master
{ const s = X.composeTrack('techno', 5), sec = X.peakSectionOf(s), E = new X.Engine(sr); E.cmd({ type: 'load', deck: 0, score: s, cal: cal.techno, play: true, from: sec.bar0 * 16 }); const D = E.decks[0], bl = new Float32Array(BLK), br = new Float32Array(BLK); let fin = true, blocks = 0;
  const go = (steps) => { for (let i = 0; i < steps * D.sps; i += BLK) { E.render(bl, br, BLK); blocks++; for (let k = 0; k < BLK; k++) if (!Number.isFinite(bl[k]) || !Number.isFinite(br[k])) fin = false; } };
  go(8); E.cmd({ type: 'mangle', deck: 0, slot: 0, on: true, mode: 'spectral', sub: 2, macro: 0.8 }); go(16); E.cmd({ type: 'mangle', deck: 0, slot: 1, on: true, mode: 'slice', sub: 1, macro: 0.6 }); E.cmd({ type: 'mangle', deck: 0, morph: 0.5 }); go(16);
  const was = D.mix.mangle.active; E.cmd({ type: 'mangle', deck: 0, slot: 0, on: false }); E.cmd({ type: 'mangle', deck: 0, slot: 1, on: false }); E.cmd({ type: 'mangle', deck: 0, target: 7 }); E.cmd({ type: 'mangle', deck: 0, slot: 0, on: true, mode: 'steps', sub: 0, macro: 0.7 }); go(16);
  E.cmd({ type: 'mangle', deck: 0, slot: 0, on: false }); go(8); ok(fin && was && !D.mix.mangle.active, `in the engine (techno): spectral key on the deck, a slice morphed in, steps on the lead alone, all off: finite, and idle when off`); }
console.log(fails ? `${fails} failure(s)` : 'mangle: all checks pass'); process.exit(fails ? 1 : 0);
