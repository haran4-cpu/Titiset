// (v10) Effects on several parts at once, on the exact engine code. 9.5 had one part unit per deck: setting a Beat FX (or Mangle) on
// the chords took it off the bass. Now each part has its own unit. Checks:
//   (1) a delay on the bass and a reverb on the chords run together, and each part's own signal is changed by its own effect only;
//   (2) switching the chords' reverb off leaves the bass's delay on;
//   (3) two Mangle units (bass and lead) run together, beside the deck's own unit;
//   (4) the 9.5 messages still work: a Mangle message without `unit` drives the deck's unit and its `target`;
//   (5) nothing non-finite; the mix stays under full scale.
// Usage: node tools/partfx_test.cjs
const { load } = require('./load.cjs'); const X = load();
let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
const SR = 44100, score = X.composeTrack('deep-house', 3), from = (X.peakSectionOf(score).bar0 || 0) * 16;
// renders the deck while recording each channel's buffer after the part effects (the mix's per-channel buffers, read after every block)
function render(cmds, secs, at) { const E = new X.Engine(SR); E.cmd({ type: 'load', deck: 0, score, cal: null, play: true, from }); const M = E.decks[0].mix; const N = Math.round(SR * secs), B = 128;
  const L = new Float32Array(N), R = new Float32Array(N), CL = new Float32Array(B), CR = new Float32Array(B), ch = {}; for (const c of [4, 5, 7]) ch[c] = new Float32Array(N); let bad = 0, pk = 0;
  for (let i = 0, k = 0; i < N; i += B, k++) { for (const [t, c] of at || []) if (t === k) E.cmd(c); if (k === 0) for (const c of cmds) E.cmd(c);
    const l = new Float32Array(B), r = new Float32Array(B); E.render(l, r, B, CL, CR); for (let j = 0; j < B && i + j < N; j++) { L[i + j] = l[j]; R[i + j] = r[j]; if (!Number.isFinite(l[j]) || !Number.isFinite(r[j])) bad++; pk = Math.max(pk, Math.abs(l[j]), Math.abs(r[j])); }
    for (const c of [4, 5, 7]) { const b = M.bufL[c]; for (let j = 0; j < B && i + j < N; j++) ch[c][i + j] = b[j]; } }
  return { E, M, L, R, ch, bad, pk }; }
const diff = (a, b) => { let d = 0, e = 0; for (let i = 0; i < a.length; i++) { d += (a[i] - b[i]) ** 2; e += b[i] ** 2; } return 10 * Math.log10((d + 1e-12) / (e + 1e-12)); }; // dB of the change against the signal
const fx = (name, ch, on, p) => ({ type: 'fx', deck: 0, name, on, amt: 0.7, beat: 2, p: p || {}, q: false, ch });
const dry = render([], 6);
// (1) delay on the bass + reverb on the chords, together
const both = render([fx('delay', 4, true, { fb: 0.5 }), fx('reverb', 5, true, { size: 0.7 })], 6);
const dB = diff(both.ch[4], dry.ch[4]), dC = diff(both.ch[5], dry.ch[5]), dL = diff(both.ch[7], dry.ch[7]);
ok(both.M.pfxs[4] && both.M.pfxs[4].active && both.M.pfxs[5] && both.M.pfxs[5].active, 'a Beat FX unit on the bass and one on the chords, both running');
ok(dB > -20 && dC > -20 && dL < -90, `each part changed by its own effect: bass ${dB.toFixed(1)} dB, chords ${dC.toFixed(1)} dB, lead untouched (${dL < -200 ? 'identical' : dL.toFixed(1) + ' dB'})`);
// (2) the chords' reverb off: the bass's delay stays on
const off = render([fx('delay', 4, true, { fb: 0.5 }), fx('reverb', 5, true, { size: 0.7 })], 6, [[Math.round(SR * 2 / 128), fx('reverb', 5, false)]]);
ok(off.M.pfxs[4].on[X.FX_NAMES.indexOf('delay')] === 1 && off.M.pfxs[5].on[X.FX_NAMES.indexOf('reverb')] === 0, 'the chords\' reverb off: the bass\'s delay still on');
// (3) Mangle on the bass and on the lead, with the deck's own unit
const mg = (unit, mode) => ({ type: 'mangle', deck: 0, unit, slot: 0, on: true, mode: X.MG_MODES.indexOf(mode), sub: 1, macro: 0.7, a: 0.5, b: 0.5, c: 0.3, hold: 1 });
const two = render([mg(4, 'fold'), mg(7, 'ring'), mg(-1, 'spectral')], 6);
const mB = diff(two.ch[4], dry.ch[4]), mL = diff(two.ch[7], dry.ch[7]), mC = diff(two.ch[5], dry.ch[5]);
ok(two.M.mangleP[4] && two.M.mangleP[4].active && two.M.mangleP[7] && two.M.mangleP[7].active && two.M.mangle.active && two.M.mangle.target === -1, 'Mangle units on the bass and on the lead and on the deck, all running');
ok(mB > -20 && mL > -20 && mC < -90, `each part changed by its own Mangle: bass ${mB.toFixed(1)} dB, lead ${mL.toFixed(1)} dB, chords untouched (${mC < -200 ? 'identical' : mC.toFixed(1) + ' dB'})`);
// (4) a 9.5 message (no unit): the deck's unit, moved by target
const old = render([{ type: 'mangle', deck: 0, target: 5 }, { type: 'mangle', deck: 0, slot: 0, on: true, mode: X.MG_MODES.indexOf('fold'), sub: 1, macro: 0.7, a: 0.5, b: 0.5, c: 0.3, hold: 1 }], 4);
ok(old.M.mangle.target === 5 && old.M.mangle.active && old.M.mangleP.every((g) => !g), `a 9.5 message drives the deck's unit on its target (target ${old.M.mangle.target}, no part units made)`);
// (5) finite and under full scale
ok([both, off, two, old].every((r) => r.bad === 0 && r.pk < 1.0), `nothing non-finite; peaks ${[both, off, two, old].map((r) => r.pk.toFixed(2)).join(', ')}`);
console.log(fails ? `part fx: ${fails} failing` : 'part fx: all checks pass'); process.exit(fails ? 1 : 0);
