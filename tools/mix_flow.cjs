// DJ-mix flow: the real Engine plays track A, mixes track B in over N bars at the end of A (exactly as Auto-DJ does),
// K-weighted loudness per bar across the whole handover. Reports the dip/bump against A's last 8 bars before the mix
// and B's first 8 bars after it, and the sharpest bar-to-bar change. Usage: node tools/mix_flow.cjs a,b [bars] [seed]
const { X, CAL } = require('./render.cjs'); const { biquad } = require('./lib/dsp.cjs');
const [ga, gb] = (process.argv[2] || 'tech-house,techno').split(','), LEN = +(process.argv[3] || 32), seed = +(process.argv[4] || 3), sr = 44100;
const A = X.composeTrack(ga, seed), B = X.composeTrack(gb, seed + 1, { bpm: A.meta.bpm }); const cal = CAL();
const E = new X.Engine(sr); E.cmd({ type: 'load', deck: 0, score: A, cal: cal[ga], play: true, from: (A.meta.bars - LEN - 24) * 16 });
E.cmd({ type: 'load', deck: 1, score: B, cal: cal[gb], play: false, bpm: A.meta.bpm });
const at = (A.meta.bars - LEN) * 16; const first = B.sections.find((S) => S.type !== 'intro'), cue = Math.max(0, (first ? first.bar0 : 0) - LEN) * 16; // the app's cue rule
E.cmd({ type: 'transition', from: 0, deck: 1, atStep: at, bars: LEN, kind: 'blend', fromB: cue });
const kw = () => { const a = biquad('hs', 1681.97, 0.7072, sr, 4.0), b = biquad('hp', 38.13, 0.5003, sr); return (x) => b(a(x)); }, fl = kw(), fr = kw();
const L = new Float32Array(128), R = new Float32Array(128), bars = []; let acc = 0, cnt = 0, lastBar = -1;
const D0 = E.decks[0], D1 = E.decks[1]; const barOf = () => (E.lead === 0 && !E.tx && D1.playing ? Math.floor(D1.pos / 16) + A.meta.bars : D0.playing ? Math.floor(D0.pos / 16) : Math.floor(D1.pos / 16) + A.meta.bars);
for (let k = 0; k < sr * 60 / A.meta.bpm * 4 * (LEN + 24 + 24) / 128; k++) { E.render(L, R, 128); for (let i = 0; i < 128; i++) { const x = fl(L[i]), y = fr(R[i]); acc += x * x + y * y; cnt++; }
  const b = D0.playing ? Math.floor(D0.pos / 16) : A.meta.bars + Math.floor(D1.pos / 16) - LEN; if (b !== lastBar) { if (cnt) bars.push({ bar: lastBar, l: -0.691 + 10 * Math.log10(acc / cnt + 1e-12), tx: !!(E.tx && E.tx.started) }); acc = 0; cnt = 0; lastBar = b; } }
bars.shift(); const pre = bars.filter((x) => !x.tx && x.bar < at / 16 && x.bar >= at / 16 - 8), during = bars.filter((x) => x.tx), post = bars.slice(-8);
const m = (a) => 10 * Math.log10(a.reduce((s, x) => s + Math.pow(10, x.l / 10), 0) / Math.max(1, a.length)); let sharp = 0; for (let i = 1; i < bars.length; i++) sharp = Math.max(sharp, Math.abs(bars[i].l - bars[i - 1].l));
const lo = Math.min(...during.map((x) => x.l)), hi = Math.max(...during.map((x) => x.l)), ref = (m(pre) + m(post)) / 2;
console.log(`${ga} → ${gb} over ${LEN} bars: A before ${m(pre).toFixed(1)} · during ${m(during).toFixed(1)} (min ${lo.toFixed(1)}, max ${hi.toFixed(1)}) · B after ${m(post).toFixed(1)} LUFS-bar · dip ${(lo - ref).toFixed(1)} · bump ${(hi - ref).toFixed(1)} · sharpest bar step ${sharp.toFixed(1)} LU`);
console.log('  ' + bars.map((x) => (x.tx ? '*' : '') + x.l.toFixed(0)).join(' '));
