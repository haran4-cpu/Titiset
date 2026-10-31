// v9.3 transition library: every style mixed for real (two decks, the engine's own automation) and measured —
//  · the mix completes (txDone), nothing non-finite, the decks stay in sync (beat offset in steps between the two timelines: 0)
//  · the outgoing deck is silent once the mix is over: its loudest block in the next second ≤ −60 dBFS
//  · the smooth styles keep the room full: the quietest 2-bar stretch of the mix is at most 2.5 dB under the quieter of the two
//    tracks' own 2-bar levels before and after it (the hard styles — cut, roll, brake, riser — drop out on purpose and are reported)
//  · the styles are different: any two differ by ≥ 2 dB in some beat of the mix, in the level of the lows (< 150 Hz), the highs (> 5 kHz) or the whole
// Usage: node tools/tx_styles_test.cjs
const { X, appScore } = require('./render.cjs'); const cal = require('../src/engine/calibration.json');
const sr = 48000, L = new Float32Array(128), R = new Float32Array(128); let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
const pack = (s) => { const ev = s.ev; return { meta: s.meta, sections: s.sections, kits: s.kits, mix: s.mix, roles: s.roles, ev: { n: ev.n, t: ev.t.slice(), ch: ev.ch.slice(), a: ev.a.slice(), v: ev.v.slice(), d: ev.d.slice(), f: ev.f.slice(), x: ev.x.slice(), y: ev.y.slice() } }; };
const gA = 'house', gB = 'tech-house', sA = pack(appScore(gA, 2)), sB = pack(appScore(gB, 3));
const HARD = new Set(['cut', 'roll', 'brake', 'riser']), STYLES = ['blend', 'cut', 'echo', 'filter', 'stems', 'breakdown', 'roll', 'brake', 'riser', 'tease'];
const db = (x) => 10 * Math.log10(x + 1e-20); const envs = {};
for (const style of STYLES) {
  const E = new X.Engine(sr), out = sA.sections[sA.sections.length - 1], fromA = Math.max(0, out.bar0 * 16 - 16 * 16);
  E.cmd({ type: 'load', deck: 0, score: sA, cal: cal[gA], play: true, from: fromA }); E.cmd({ type: 'load', deck: 1, score: sB, cal: cal[gB], play: false, bpm: sA.meta.bpm }); for (let i = 0; i < 200; i++) E.render(L, R, 128);
  const bars = HARD.has(style) ? 8 : 16, at = Math.ceil(E.decks[0].pos / 16) * 16 + 8 * 16, drop = sB.sections.find((S) => S.type === 'drop') || sB.sections.find((S) => S.type !== 'intro');
  const first = sB.sections.find((S) => S.type !== 'intro'), fromB = HARD.has(style) ? Math.max(0, drop.bar0 * 16 - bars * 8) : Math.max(0, (first ? first.bar0 : 0) - bars) * 16;
  E.cmd({ type: 'transition', from: 0, deck: 1, atStep: at, bars, kind: style, fromB, swap: 0.5 });
  const spb = Math.round(sr * 60 / sA.meta.bpm * 4 / 128), win = [], feat = []; let acc = 0, k = 0, bad = 0, done = false, syncMax = 0, started = -1, lo = 0, hp = 0, aL = 0, aH = 0, aW = 0, kb = 0; const kl = 1 - Math.exp(-2 * Math.PI * 150 / sr), kh = 1 - Math.exp(-2 * Math.PI * 5000 / sr);
  const total = Math.round((at - E.decks[0].pos + bars * 16 + 8 * 16) / 16) * spb; const env = [];
  E.outbox.length = 0;
  for (let b = 0; b < total; b++) { E.render(L, R, 128); for (let i = 0; i < 128; i++) { if (!Number.isFinite(L[i]) || !Number.isFinite(R[i])) bad++; acc += L[i] * L[i] + R[i] * R[i]; const m = (L[i] + R[i]) * 0.5; lo += (m - lo) * kl; hp += (m - hp) * kh; const h = m - hp; aL += lo * lo; aH += h * h; aW += m * m; }
    if (++kb === (spb >> 2)) { feat.push([db(aW / (kb * 128)), db(aL / (kb * 128)), db(aH / (kb * 128))]); aL = 0; aH = 0; aW = 0; kb = 0; } /* per beat */
    if (++k === spb) { win.push(db(acc / (spb * 256))); acc = 0; k = 0; }
    for (const m of E.outbox) if (m.type === 'txDone') done = true; E.outbox.length = 0;
    const T = E.tx; if (T && T.started) { if (started < 0) started = win.length; const A = E.decks[0], B = E.decks[1]; syncMax = Math.max(syncMax, Math.abs((A.pos - T.s) - (B.pos - fromB))); }
    if (done && !E.tx && !envs[style + 'done']) envs[style + 'done'] = win.length; }
  // the outgoing deck after the mix
  let pk = 0; for (let b = 0; b < 375; b++) { E.render(L, R, 128); const M = E.mixes[0]; let e = 0; for (let i = 0; i < 128; i++) e += M.outL[i] * M.outL[i] + M.outR[i] * M.outR[i]; pk = Math.max(pk, Math.sqrt(e / 256)); }
  const pre = win.slice(Math.max(0, started - 4), started), mixW = win.slice(started, started + bars), post = win.slice(started + bars + 1, started + bars + 5);
  const sm = (a) => a.map((v, i) => (i + 1 < a.length ? db((10 ** (v / 10) + 10 ** (a[i + 1] / 10)) / 2) : v)).slice(0, Math.max(1, a.length - 1));
  const ref = Math.min(Math.max(...sm(pre)), Math.max(...sm(post))), dip = ref - Math.min(...sm(mixW)); envs[style] = feat.slice(started * 4, (started + bars) * 4);
  ok(done && bad === 0 && syncMax < 1e-6, `${style.padEnd(9)} completes (${done}), ${bad} non-finite, beat offset between the decks ${syncMax.toExponential(1)} steps`);
  ok(20 * Math.log10(pk + 1e-12) < -60, `${style.padEnd(9)} outgoing deck after the mix: loudest block ${(20 * Math.log10(pk + 1e-12)).toFixed(1)} dBFS (≤ −60)`);
  if (HARD.has(style)) console.log(`  ${style.padEnd(9)} level through the mix: ${mixW.map((v) => (v - ref).toFixed(1)).join(' ')} dB vs the tracks (an intentional drop-out style)`);
  else ok(dip <= 2.5, `${style.padEnd(9)} keeps the room: quietest 2-bar stretch ${dip.toFixed(1)} dB under the tracks' own level (≤ 2.5) · bars ${mixW.map((v) => (v - ref).toFixed(1)).join(' ')}`); }
// the styles differ: the largest of the three level differences (whole, lows, highs) in any beat of the mix
{ const dist = (a, b) => { const n = Math.min(a.length, b.length); let t = 0; for (let i = 0; i < n; i++) t = Math.max(t, Math.abs(a[i][0] - b[i][0]), Math.abs(a[i][1] - b[i][1]), Math.abs(a[i][2] - b[i][2])); return t; };
  let worst = 1e9, pair = ''; for (let i = 0; i < STYLES.length; i++) for (let j = i + 1; j < STYLES.length; j++) { const d = dist(envs[STYLES[i]], envs[STYLES[j]]); if (d < worst) { worst = d; pair = STYLES[i] + ' / ' + STYLES[j]; } }
  ok(worst >= 2, `the most alike pair of styles (${pair}) differs by ${worst.toFixed(1)} dB in its most different beat (≥ 2)`); }
console.log(fails ? `transition styles: ${fails} failing` : 'transition styles: all checks pass'); process.exit(fails ? 1 : 0);
