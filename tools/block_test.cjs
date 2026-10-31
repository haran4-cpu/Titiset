// audio-thread cost of every live command: the Engine plays two decks; each command type is sent many times and the block that
// processes it is timed (and the next 20). A command whose block costs far more than a normal block is a dropout waiting to
// happen in a browser. Reports p50 / max per command and the overall block budget (2.9 ms at 44.1 kHz).
const { X } = require('./render.cjs'); const cal = require('../src/engine/calibration.json'); const sr = 44100, L = new Float32Array(128), R = new Float32Array(128);
const sA = X.composeTrack('deep-house', 3), sB = X.composeTrack('trance', 4);
const pack = (s) => { const ev = s.ev; return { meta: s.meta, sections: s.sections, kits: s.kits, mix: s.mix, roles: s.roles, ev: { n: ev.n, t: ev.t.slice(), ch: ev.ch.slice(), a: ev.a.slice(), v: ev.v.slice(), d: ev.d.slice(), f: ev.f.slice(), x: ev.x.slice(), y: ev.y.slice() } }; };
// the worklet's warm-up first (exactly what the browser runs before the first track), then a fresh Engine — as in the app
X.warmUp({ scores: ['trance', 'dnb'].map((g) => { const s = X.composeTrack(g, 7), p = pack(s); p.from = X.peakSectionOf(s).bar0 * 16; p.cal = cal[g]; return p; }), blocks: 120 }, sr);
const E = new X.Engine(sr);
E.cmd({ type: 'load', deck: 0, score: pack(sA), cal: cal['deep-house'], play: true, from: 512 }); E.cmd({ type: 'load', deck: 1, score: pack(sB), cal: cal.trance, play: true, from: 1024, bpm: sA.meta.bpm });
const blk = () => { const t = process.hrtime.bigint(); E.render(L, R, 128); return Number(process.hrtime.bigint() - t) / 1e6; };
for (let i = 0; i < 300; i++) blk();
const specs = [1, 2, 3, 4, 5].map((k) => { const sp = X.exportSpec(sA); sp.seeds = { drums: k, bass: k * 3 }; sp.melodySeed = k * 7; return pack(X.compileSpec(sp)); });
const CMDS = { none: () => null, swapScore: (k) => ({ type: 'swapScore', deck: 0, score: specs[k % 5], atStep: E.decks[0].pos }), jump: () => ({ type: 'jump', deck: 0, atStep: E.decks[0].pos, step: 16 * (Math.floor(Math.random() * 100)) }),
  seek: () => ({ type: 'seek', deck: 1, step: 16 * Math.floor(Math.random() * 100) }), kit: () => ({ type: 'kit', deck: 0, slot: 'chords', p: { cut: 500 + Math.random() * 3000 } }), fx: (k) => ({ type: 'fx', deck: 0, name: FXN[k % 6], on: !!(k & 1), amt: 0.6 }),
  energy: () => ({ type: 'energy', deck: 0, v: Math.random() }), eq: () => ({ type: 'eq', deck: 0, low: -10 * Math.random(), high: -5 * Math.random() }), sends: () => ({ type: 'sends', deck: 0, p: { verb: Math.random() * 0.5, heat: Math.random() * 2 } }),
  loop: (k) => ({ type: 'loop', deck: 0, from: k & 1 ? -1 : 16 * 40, to: k & 1 ? -1 : 16 * 48 }), cue: (k) => ({ type: 'cue', deck: 1, on: !!(k & 1) }), load: (k) => ({ type: 'load', deck: 1, score: specs[k % 5], cal: cal['deep-house'], play: true, from: 512, bpm: E.decks[0].bpm }) };
const FXN = ['sweep', 'phaser', 'flanger', 'echo', 'crush', 'gate']; const res = {};
for (let k = 0; k < 40; k++) for (const [name, mk] of Object.entries(CMDS)) { for (let i = 0; i < 40; i++) blk(); const m = mk(k); if (m) E.cmd(m); let worst = 0; for (let i = 0; i < 20; i++) worst = Math.max(worst, blk()); (res[name] = res[name] || []).push(worst); }
const q = (a, p) => a.slice().sort((x, y) => x - y)[Math.floor(p * (a.length - 1))];
let bad = 0; const base = q(res.none, 0.5);
// a lone GC pause or host hiccup can land anywhere (seen once at 46 ms with the machine busy, never repeated in 120 swaps);
// a command is flagged when its 90th percentile is high or it produces a dropout-sized block (> 12 ms) more than once
for (const [n, a] of Object.entries(res)) { const mx = Math.max(...a), p90 = q(a, 0.9), big = a.filter((x) => x > 12).length, flag = p90 > Math.max(4, base * 3) || big >= 2; if (flag && n !== 'none') bad++; console.log(`${flag ? '✗' : '✓'} ${n.padEnd(10)} worst block after it: p50 ${q(a, 0.5).toFixed(2)} · p90 ${p90.toFixed(2)} · max ${mx.toFixed(2)} ms`); }
const slowest = Math.max(...Object.values(res).flat());
console.log(bad ? `${bad} command(s) cost a dropout-sized block` : `every live command passed the gate (p90 ≤ ${Math.max(4, base * 3).toFixed(1)} ms and fewer than 2 blocks over 12 ms; one 128-sample block is 2.9 ms at 44.1 kHz) — slowest single block ${slowest.toFixed(1)} ms`); process.exit(bad ? 1 : 0);
