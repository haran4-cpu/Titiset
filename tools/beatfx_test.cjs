// v9.3 Beat FX: every effect switched on and off over a steady tone and over a drum loop — no click at either edge (the largest
// sample step around a switch stays within the effect's own steady-state steps), the echoes and the reverb ring on after Off and then
// stop by themselves, nothing non-finite, freeze holds, the quantized On waits for the beat. Usage: node tools/beatfx_test.cjs
const { load } = require('./load.cjs'); const E = load(); const sr = 48000; let fail = 0;
const ok = (c, msg) => { console.log((c ? '✓ ' : '✗ ') + msg); if (!c) fail++; };
const db = (x) => (20 * Math.log10(Math.max(1e-12, x))).toFixed(1);
function run(name, opt) { const X = new E.DeckFX(sr), k = E.FX_NAMES.indexOf(name), N = sr * 8, L = new Float32Array(N), R = new Float32Array(N); X.bpm = 120; const on = sr * 1, off = sr * 3;
  for (let i = 0; i < N; i++) { const t = i / sr, beat = t * 2; if (i === on) X.set(k, true, opt.amt ?? 0.6, opt.beat, opt.p); if (i === off) X.set(k, false);
    const x = opt.src(i, t); X.active = 1; X.run(x, x, beat); L[i] = X.ol; R[i] = X.or; }
  const step = (a, b) => { let m = 0; for (let i = Math.max(1, a); i < Math.min(N, b); i++) m = Math.max(m, Math.abs(L[i] - L[i - 1]), Math.abs(R[i] - R[i - 1])); return m; };
  const steady = Math.max(step(sr * 0.2, on - 10), step(on + sr * 0.6, off - 10)), edge = Math.max(step(on - 10, on + sr * 0.2), step(off - 10, off + sr * 0.2));
  let bad = 0; for (let i = 0; i < N; i++) if (!Number.isFinite(L[i]) || !Number.isFinite(R[i])) bad++;
  const after = (a, b) => { let m = 0; for (let i = a; i < b; i++) m = Math.max(m, Math.abs(L[i] - opt.src(i, i / sr))); return m; };
  let stopS = -1; for (let i = 0; i < sr * 60 && stopS < 0; i++) { X.run(0, 0, (N + i) / sr * 2); if (X.tailN[k] <= 0 && X.w[k] === 0) stopS = (N + i - off) / sr; }
  return { X, k, steady, edge, bad, tail: after(off + sr * 0.3, off + sr * 0.8), end: after(N - sr * 0.5, N), stopS }; }
const tone = (i, t) => 0.4 * Math.sin(2 * Math.PI * 220 * t);
for (const [name, opt] of [['delay', { beat: 2, p: { fb: 0.5 } }], ['delay', { beat: 9, p: { fb: 0.7, tone: -0.6, wob: 1 } }], ['dub', { beat: 2 }], ['reverb', { p: { size: 0.8 } }], ['sweep', { beat: 6, p: { type: 1 } }], ['phaser', { beat: 3 }], ['flanger', { beat: 6 }], ['noise', { beat: 10 }], ['echo', {}]]) {
  const r = run(name, Object.assign({ src: tone }, opt)), tailFx = ['delay', 'dub', 'reverb', 'echo'].includes(name);
  ok(r.bad === 0 && r.edge <= r.steady * 1.25 + 0.002, `${name}${opt.beat != null ? ' beat ' + E.FX_BEATS[opt.beat] : ''}: largest step at the switches ${db(r.edge)} dBFS vs ${db(r.steady)} steady (no click), ${r.bad} non-finite`);
  if (tailFx) ok(r.tail > 1e-3 && r.end < r.tail * 0.06 && r.stopS > 0, `${name}: the tail rings on after Off (${db(r.tail)} dBFS 0.3–0.8 s later), decays (${db(r.end)} dBFS 4.5 s later) and the unit stops by itself ${r.stopS.toFixed(1)} s after Off`); }
{ const X = new E.DeckFX(sr), k = 8; X.bpm = 120; X.set(k, true, 0.7, null, { size: 0.7 }); let e1 = 0, e2 = 0; for (let i = 0; i < sr * 4; i++) { const x = i < sr ? 0.3 * Math.sin(i * 0.05) : 0; if (i === sr) X.set(k, true, 0.7, null, { freeze: 1 }); X.active = 1; X.run(x, x, i / sr * 2); const y = Math.abs(X.ol - x); if (i > sr * 1.5 && i < sr * 2) e1 = Math.max(e1, y); if (i > sr * 3.5) e2 = Math.max(e2, y); }
  ok(e2 > e1 * 0.5 && e2 > 1e-3, `reverb freeze holds its tail: ${db(e1)} → ${db(e2)} dBFS two seconds later`); }
{ const X = new E.DeckFX(sr); X.bpm = 120; let first = -1; for (let i = 0; i < sr * 2; i++) { const beat = 0.3 + i / sr * 2; if (i === 100) X.set(6, true, 0.6, 1, null, true); X.active = 1; X.run(0.1, 0.1, beat); if (first < 0 && X.w[6] > 0) first = beat; }
  ok(first >= 1 && first < 1.01, `quantized On waits for the next beat (asked at beat 0.30, engaged at beat ${first.toFixed(3)})`); }
console.log(fail ? `beat fx: ${fail} failing` : 'beat fx: all checks pass'); process.exit(fail ? 1 : 0);
