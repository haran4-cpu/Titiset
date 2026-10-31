// FX rack + automation test on the real Engine: each effect switched on for 4 bars then off — it must change the sound
// (it is audible), stay finite, keep the master under the ceiling, add no clicks (crush and gate are edgy by design and are
// only checked for finiteness), fade out without a jump, and its CPU cost per second of audio is reported.
const { X } = require('./render.cjs'); const { clicks } = require('./critic.cjs'); const cal = require('../src/engine/calibration.json');
const sr = 44100, BLK = 128; let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
const NAMES = ['sweep', 'phaser', 'flanger', 'echo', 'crush', 'gate'];
function run(E, steps, cb) { const D = E.decks[0], n = Math.round(steps * D.sps), L = new Float32Array(n), R = new Float32Array(n), bl = new Float32Array(BLK), br = new Float32Array(BLK); const t0 = process.hrtime.bigint();
  for (let i = 0; i < n; i += BLK) { if (cb) cb(i / n); E.render(bl, br, BLK); for (let k = 0; k < BLK && i + k < n; k++) { L[i + k] = bl[k]; R[i + k] = br[k]; } } return { L, R, ms: Number(process.hrtime.bigint() - t0) / 1e6, sec: n / sr }; }
const rms = (a) => { let s = 0; for (const x of a) s += x * x; return Math.sqrt(s / a.length); };
for (const gid of ['psytrance', 'deep-house']) { const s = X.composeTrack(gid, 4), sec = X.peakSectionOf(s);
  const mk = () => { const E = new X.Engine(sr); E.cmd({ type: 'load', deck: 0, score: s, cal: cal[gid], play: true, from: sec.bar0 * 16 }); return E; };
  const E0 = mk(); run(E0, 16); const dry = run(E0, 64), dryTail = run(E0, 32); // the same 32 steps without the effect: clicks are compared window for window
  for (const name of NAMES) { const E = mk(); run(E, 16); E.cmd({ type: 'fx', deck: 0, name, on: true, amt: 0.7 }); const wet = run(E, 64); E.cmd({ type: 'fx', deck: 0, name, on: false }); const tail = run(E, 32);
    let fin = true, pk = 0; for (const a of [wet.L, tail.L]) for (const x of a) { if (!isFinite(x)) fin = false; pk = Math.max(pk, Math.abs(x)); }
    const d = new Float32Array(wet.L.length); for (let i = 0; i < d.length; i++) d[i] = wet.L[i] - dry.L[i]; const change = 20 * Math.log10(rms(d) / (rms(dry.L) + 1e-9));
    const edgy = name === 'crush' || name === 'gate', ck = edgy ? 0 : clicks(tail.L, sr), ck0 = edgy ? 0 : clicks(dryTail.L, sr);
    ok(fin && pk <= 1 && change > -30 && (edgy || ck <= ck0 + 2), `${gid} ${name.padEnd(8)} audible (difference ${change.toFixed(1)} dB vs dry), peak ${pk.toFixed(2)}${edgy ? '' : `, clicks after switching off ${ck} (same bars dry ${ck0})`}, cost ${(wet.ms / wet.sec).toFixed(1)} ms per audio second`); }
  const E = mk(); run(E, 16); for (const name of NAMES) E.cmd({ type: 'fx', deck: 0, name, on: true, amt: 0.6 }); const all = run(E, 64); const base = run(mk(), 64);
  ok(all.L.every(isFinite), `${gid} all six at once: finite · ${(all.ms / all.sec).toFixed(1)} ms vs ${(base.ms / base.sec).toFixed(1)} ms per audio second without FX (real time = 1000)`); }
console.log(fails ? `${fails} failure(s)` : 'fx rack: all checks pass'); process.exit(fails ? 1 : 0);
