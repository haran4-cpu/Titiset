// headphone cue test on the real Engine: deck B is cued with its fader DOWN while deck A plays to the room — the cue output must
// carry B (and not A), the main output must not; cue/master blend 1 = the master in the phones; split mode puts master mono left
// and cue mono right on the main output. Pass = levels in the right places, finite, under 1.
const { X } = require('./render.cjs'); const cal = require('../src/engine/calibration.json');
const sr = 44100, BLK = 128; let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
const rms = (a) => { let s = 0; for (const x of a) s += x * x; return 20 * Math.log10(Math.sqrt(s / a.length) + 1e-12); };
const env = (a) => { const w = 441, o = new Float32Array(Math.floor(a.length / w)); for (let k = 0; k < o.length; k++) { let e = 0; for (let i = k * w; i < k * w + w; i++) e += a[i] * a[i]; o[k] = Math.sqrt(e / w); } return o; };
// envelope correlation (10 ms RMS frames): robust to noise-seed differences between two engine runs
const corr = (a, b) => { a = env(a); b = env(b); const n = Math.min(a.length, b.length); let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i] / n; mb += b[i] / n; } let ab = 0, aa = 0, bb = 0; for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; ab += x * y; aa += x * x; bb += y * y; } return ab / Math.sqrt(aa * bb + 1e-20); };
const corrW = (a, b) => { let ab = 0, aa = 0, bb = 0; for (let i = 0; i < a.length; i++) { ab += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; } return ab / Math.sqrt(aa * bb + 1e-20); };
function run(E, sec) { const n = Math.round(sec * sr / BLK) * BLK, o = { L: new Float32Array(n), R: new Float32Array(n), CL: new Float32Array(n), CR: new Float32Array(n) }, b = [0, 0, 0, 0].map(() => new Float32Array(BLK));
  for (let i = 0; i < n; i += BLK) { E.render(b[0], b[1], BLK, b[2], b[3]); o.L.set(b[0], i); o.R.set(b[1], i); o.CL.set(b[2], i); o.CR.set(b[3], i); } return o; }
const sA = X.composeTrack('deep-house', 3), sB = X.composeTrack('techno', 5);
const mk = () => { const E = new X.Engine(sr); E.cmd({ type: 'load', deck: 0, score: sA, cal: cal['deep-house'], play: true, from: X.peakSectionOf(sA).bar0 * 16 }); E.cmd({ type: 'load', deck: 1, score: sB, cal: cal.techno, play: true, from: X.peakSectionOf(sB).bar0 * 16 }); E.cmd({ type: 'gain', deck: 1, v: 0 }); return E; };
// reference: deck B alone, fader up (what the cue should sound like)
const R = new X.Engine(sr); R.cmd({ type: 'load', deck: 1, score: sB, cal: cal.techno, play: true, from: X.peakSectionOf(sB).bar0 * 16 }); run(R, 1); const ref = run(R, 4);
const E = mk(); E.cmd({ type: 'cue', deck: 1, on: true, mix: 0 }); run(E, 1); const o = run(E, 4);
const fin = [o.L, o.R, o.CL, o.CR].every((a) => a.every(Number.isFinite)), pk = Math.max(...[o.CL, o.CR].map((a) => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0)));
ok(fin && pk <= 1, `finite, cue peak ${pk.toFixed(2)}`);
ok(Math.abs(rms(o.CL) - rms(ref.L)) < 3, `cue carries deck B pre-fader: ${rms(o.CL).toFixed(1)} dB vs B alone on the master ${rms(ref.L).toFixed(1)} dB`);
ok(corr(o.CL, ref.L) > 0.6, `…and it IS deck B (correlation with B alone ${corr(o.CL, ref.L).toFixed(2)})`);
ok(corr(o.CL, o.L) < 0.3, `…and not the room mix (correlation with the master ${corr(o.CL, o.L).toFixed(2)})`);
ok(corr(o.L, ref.L) < 0.3, `the room does not hear deck B while its fader is down (correlation ${corr(o.L, ref.L).toFixed(2)})`);
E.cmd({ type: 'cue', mix: 1 }); run(E, 0.3); const m = run(E, 2); ok(corrW(m.CL, m.L) > 0.95, `cue/master blend at 1: the phones carry the master (correlation ${corrW(m.CL, m.L).toFixed(2)})`);
const S = mk(); S.cmd({ type: 'cue', deck: 1, on: true, mix: 0, split: true }); run(S, 1); const sp = run(S, 3); const ref2 = (() => { const E2 = mk(); run(E2, 1); return run(E2, 3); })();
ok(corr(sp.L, ref2.L) > 0.8 && corr(sp.R, ref.R.subarray(0, sp.R.length)) > 0.5, `split: left = the room mix (corr ${corr(sp.L, ref2.L).toFixed(2)}), right = the cue (corr with B ${corr(sp.R, ref.R.subarray(0, sp.R.length)).toFixed(2)})`);
// CPU watchdog: eco mode switches the channel character off (and back) without a level jump or non-finite output
{ const W = mk(); run(W, 1); const a = run(W, 2); W.setEco(1); const off = W.decks[0].mix.s.every((x) => x.sat === 0 && x.tr === 0); const b = run(W, 2); W.setEco(0); const back = W.decks[0].mix.s[4].sat > 0; const c = run(W, 2);
  ok(off && back && [b, c].every((o) => o.L.every(Number.isFinite)) && Math.abs(rms(b.L) - rms(a.L)) < 2, `eco mode: character off/on, level change ${(rms(b.L) - rms(a.L)).toFixed(2)} dB, outbox ${W.outbox.filter((x) => x.type === 'eco').length} messages`); }
console.log(fails ? `${fails} failure(s)` : 'cue: all checks pass'); process.exit(fails ? 1 : 0);
