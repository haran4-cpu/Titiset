// the WebAssembly synth voice against the JavaScript one: every model (and the variants that take other code paths: pulse
// wave, two voices, sub, pitch envelope, volume LFO shapes, bar-locked filter LFO, tone filter, wavetable unison 1/7 and all
// five filter types, wavefolder, LFO 2, vowel morph, comb), poly chords with stealing and hand-over tails, mono legato slides
// with glide — rendered both ways from the same noise seed. Standard: bit-identical (max |difference| = 0).
// Then whole tracks through the engine (both decks, a mix), JS vs WASM. Usage: node tools/wasm_test.cjs
const { load } = require('./load.cjs'); const X = load(); const cal = require('../src/engine/calibration.json');
let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
X.wasmVoiceInit(); ok(X.WV.ok, 'WebAssembly voice loaded' + (X.WV.err ? ': ' + X.WV.err : ''));
let calls = 0; { const f = X.WV.ex.voice; X.WV.ex = Object.assign({}, X.WV.ex, { voice: (n) => { calls++; return f(n); } }); } // count: a zero difference only means something if WASM really ran
const MODELS = ['sub', 'b808', 'reese', 'acid', 'pluck', 'wobble', 'fm', 'organ', 'log', 'supersaw', 'pad', 'stab', 'piano', 'ep', 'bell', 'kspluck', 'vox', 'hoover', 'screech', 'strings', 'brass', 'lead', 'saw', 'square', 'wt'];
const cases = [];
for (const m of MODELS) cases.push([m, {}]);
cases.push(['acid', { wave: 1, voices: 2, sub: 0.5, pEnv: 12, pDec: 0.05, envAmt: 0.8, res: 0.7 }], ['saw', { lfoAmp: 0.7, lfoSync: 1, lfoShape: 1 }], ['saw', { lfoAmp: 0.5, lfoShape: 2, lfoRate: 3 }], ['lead', { lfoAmp: 0.4, lfoShape: 0, lfoSync: 0.5, glide: 0.1 }],
  ['wobble', { lfoSync: 0.5, lfoDepth: 0.8 }], ['pad', { mLfoS: 2, mLfo: 0.5, mCut: -1, mRes: 0.2 }], ['ep', { tone: 0.3, res: 0.4, envAmt: 0.5 }], ['piano', { tone: 0.5 }], ['sub', { tone: 0.2, drive: 2.5, sub: 0.6 }], ['vox', { vowel: 'i', tone: 0.6 }]);
for (const ftype of [0, 1, 2, 3, 4]) for (const uni of [1, 7]) cases.push(['wt', { table: (ftype * 3 + uni) % 8, ftype, uni, spread: 0.8, detune: 0.5, posEnv: 0.5, posLfo: 0.3, l2Sync: 1, sub: 0.4, fold: ftype === 2 ? 0.5 : 0, vow: 1.5, vowLfo: 0.8, l2Pitch: ftype === 1 ? 20 : 0, res: 0.5 }]);
cases.push(['wt', { table: 2, l2Rate: 3, mPos: 0.2, ftype: 0 }], ['wt', { table: 5, noiseAmt: 0.25, ftype: 1, uni: 3 }]);
function run(model, kit, wasm, mono) { X.WV.off = !wasm; X.noiseSeed(11); const S = new X.Synth(44100, mono ? 1 : 6, mono); S.setKit(Object.assign({ model }, kit)); S.bpm = 128;
  const L = new Float32Array(128), R = new Float32Array(128), out = new Float32Array(1400 * 256); let blk = 0;
  const notes = mono ? [[0, 40, 9000], [5000, 43, 9000, { slide: true }], [20000, 36, 30000, { accent: true }], [70000, 45, 20000, { slide: true, accent: true }]] : [[0, 57, 30000], [0, 60, 30000], [0, 64, 30000], [200, 67, 25000, { pan: 0.5 }], [26000, 55, 40000, { bright: 0.6 }], [26000, 59, 40000], [26000, 62, 40000, { fit: true }], [26100, 66, 40000], [26200, 69, 40000], [90000, 50, 60000, { vowel: 'o' }]];
  let ni = 0;
  for (let b = 0; b < 1400; b++) { const t0 = b * 128; while (ni < notes.length && notes[ni][0] < t0 + 128) { const [t, nt, d, o] = notes[ni]; S.trigger(t - t0, nt, 0.9, d, Object.assign({}, o || {})); ni++; }
    L.fill(0); R.fill(0); S.beat = (t0 / 44100) * 128 / 60; S.render(L, R, 128); out.set(L, b * 256); out.set(R, b * 256 + 128); }
  return out; }
let worst = 0, total = 0;
for (const [m, kit] of cases) for (const mono of m === 'acid' || m === 'lead' || m === 'sub' || m === 'reese' || m === 'b808' ? [false, true] : [false]) {
  const a = run(m, kit, false, mono), b = run(m, kit, true, mono); let d = 0, e = 0; for (let i = 0; i < a.length; i++) { const x = Math.abs(a[i] - b[i]); if (x > d) d = x; e += a[i] * a[i]; }
  total++; if (d > worst) worst = d; if (d !== 0 || !(e > 0)) ok(false, `${m}${mono ? ' (mono)' : ''} ${JSON.stringify(kit)}: max |JS − WASM| ${d}${e > 0 ? '' : ' (silent!)'}`); }
ok(calls > 1000, `the WebAssembly path really ran (${calls} voice-blocks)`); ok(worst === 0, `${total} model/variant renders (poly chords with stealing + hand-over, mono legato with slides): JS and WASM bit-identical (max difference ${worst})`);
// whole tracks through the engine
const pack = (s) => { const ev = s.ev; return { meta: s.meta, sections: s.sections, kits: s.kits, mix: s.mix, roles: s.roles, ev: { n: ev.n, t: ev.t.slice(), ch: ev.ch.slice(), a: ev.a.slice(), v: ev.v.slice(), d: ev.d.slice(), f: ev.f.slice(), x: ev.x.slice(), y: ev.y.slice() } }; };
for (const [ga, gb] of [['trance', 'techno'], ['deep-house', 'progressive-house'], ['dnb', 'dubstep'], ['amapiano', 'melodic-techno'], ['lofi', 'ambient']]) {
  const a = X.composeTrack(ga, 2), b = X.composeTrack(gb, 2), r = (wasm) => { X.WV.off = !wasm; X.noiseSeed(5); const E = new X.Engine(44100);
    E.cmd({ type: 'load', deck: 0, score: pack(a), cal: cal[ga], play: true, from: X.peakSectionOf(a).bar0 * 16 }); E.cmd({ type: 'load', deck: 1, score: pack(b), cal: cal[gb], play: false, bpm: a.meta.bpm });
    const L = new Float32Array(128), R = new Float32Array(128), o = new Float32Array(3000 * 128); for (let i = 0; i < 3000; i++) { if (i === 600) E.cmd({ type: 'transition', from: 0, deck: 1, atStep: Math.ceil(E.decks[0].pos / 16 + 1) * 16, bars: 8, kind: 'blend', fromB: 0 }); E.render(L, R, 128); o.set(L, i * 128); } return o; };
  const x = r(false), y = r(true); let d = 0; for (let i = 0; i < x.length; i++) d = Math.max(d, Math.abs(x[i] - y[i]));
  ok(d === 0, `engine, ${ga} mixing into ${gb} (8.7 s, both decks): max |JS − WASM| ${d}`); }
X.WV.off = false; console.log(fails ? `${fails} failure(s)` : 'wasm: bit-identical'); process.exit(fails ? 1 : 0);
