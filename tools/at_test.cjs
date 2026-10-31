// Commands that wait for a step (cmd 'at'), on the exact engine code. The UI used to time the moves of Auto (filter sweep, echo throw, energy
// dip) and the snare-up of "Build → drop" with setTimeout from the HEARD position: they landed late by the output latency or the render-ahead
// (and, in a background tab or on a busy page, by whatever the page was doing). Now the engine holds them and runs them in the block that
// contains the step, a sound on its exact sample — the same way a quantised jump or a score swap lands.
// Checks: (1) the sample a scheduled sound starts on, at several tempos and fractional steps; (2) a riser given `until` ends exactly on that
// step wherever it starts; (3) report messages match; (4) a step already passed runs in the next block; (5) a paused deck waits;
// (6) a jump / seek / new track / held loop settles what was planned (restoring commands run at once, the rest is dropped; the other deck is
// left alone); (7) order against a jump inside one block; (8) a tempo glide in between does not move the step.
// Usage: node tools/at_test.cjs
const { load } = require('./load.cjs'); const X = load();
let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
const SR = 44100, score = X.composeTrack('techno', 5), score2 = X.composeTrack('house', 3);
function rig(bpm, from, N) { const E = new X.Engine(SR); E.cmd({ type: 'load', deck: 0, score, cal: null, play: true, from: from || 0, bpm }); E.cmd({ type: 'load', deck: 1, score: score2, cal: null, play: false, from: 0 });
  // the sample a sound starts on, counted independently of the engine's own position: the samples the deck has rendered before the
  // current piece (the engine renders a long block as 128-sample pieces, and `off` is the offset inside the piece) + `off`
  const D = E.decks[0], rec = [], orig = D.fx.trigger.bind(D.fx), P = D.process.bind(D); let done = 0, rendered = 0; D.process = (k) => { const r = P(k); rendered += k; return r; };
  D.fx.trigger = (off, kind, v, dur) => { rec.push({ abs: rendered + off, off, kind, dur, pos: D.pos, v }); return orig(off, kind, v, dur); };
  const L = new Float32Array(N || 128), R = new Float32Array(N || 128), n = N || 128;
  return { E, D, rec, run(blocks) { for (let k = 0; k < blocks; k++) { E.render(L, R, n); done += n; } }, get done() { return done; }, n }; }

// (1) + (2) + (3): exact sample, at several tempos and block sizes
{ let worst = 0, worstUntil = 0, cases = 0, rep = 0;
  for (const bpm of [90, 124, 140, 174]) for (const n of [128, 512]) for (const frac of [0.0, 0.37, 0.5, 0.91]) {
    const from = 64, r = rig(bpm, from, n), at = from + 20 + frac, sps = r.D.sps, p0 = r.D.pos;
    r.E.cmd({ type: 'at', deck: 0, atStep: at, id: 7, list: [{ type: 'fxNow', kind: 4, v: 0.8, until: at + 16 }] });
    r.run(Math.ceil((at - p0 + 2) * sps / n)); const f = r.rec[0]; cases++;
    if (!f) { ok(false, `${bpm} BPM, block ${n}, +${frac}: the scheduled sound never started`); continue; }
    const want = (at - p0) * sps; worst = Math.max(worst, Math.abs(f.abs - want)); worstUntil = Math.max(worstUntil, Math.abs((f.abs + f.dur) - (at + 16 - p0) * sps));
    const m = r.E.outbox.find((x) => x.type === 'at'); if (m && m.id === 7 && m.how === 'ran' && m.at === at && Math.abs(m.pos + m.off / sps - at) <= 1 / sps + 1e-9) rep++; }
  ok(worst <= 0.5 + 1e-6, `a scheduled sound starts on its exact sample (worst error ${worst.toFixed(3)} samples over ${cases} cases: 90–174 BPM, blocks of 128 / 512, fractional steps)`);
  ok(worstUntil <= 1.5, `a riser with "until" ends on that step (worst error ${worstUntil.toFixed(3)} samples)`);
  ok(rep === cases, `the engine reports each one: id, "ran", the step, the position and the sample offset it ran at (${rep}/${cases})`); }

// (4) a step already passed runs in the next block, at the start of it
{ const r = rig(124, 64, 128); r.run(3); const before = r.rec.length; r.E.cmd({ type: 'at', deck: 0, atStep: r.D.pos - 5, list: [{ type: 'fxNow', kind: 1 }] }); r.run(1);
  ok(r.rec.length === before + 1 && r.rec[r.rec.length - 1].off === 0, 'a step that has already passed runs in the next block, at its first sample'); }

// (5) a paused deck waits; playing again, it runs when the step is reached
{ const r = rig(124, 64, 128); r.E.cmd({ type: 'at', deck: 0, atStep: 64 + 0.5, list: [{ type: 'fxNow', kind: 1 }] }); r.E.cmd({ type: 'pause', deck: 0 }); r.run(200);
  ok(r.rec.length === 0 && r.E.sched.length === 1, 'a paused deck does not run it and keeps it'); r.E.cmd({ type: 'play', deck: 0 }); r.run(40); ok(r.rec.length === 1, 'playing again, it runs when the step is reached'); }

// (6) a jump / seek / load / held loop settles what was planned
{ const probe = (kind) => { const r = rig(124, 64, 128), seen = []; const D = r.D; const eo = D.setEnergy.bind(D); D.setEnergy = (v) => { seen.push(v); eo(v); };
    r.E.cmd({ type: 'at', deck: 0, atStep: 400, rest: 1, id: 1, list: [{ type: 'energy', v: 0.5 }] }); r.E.cmd({ type: 'at', deck: 0, atStep: 380, id: 2, list: [{ type: 'fxNow', kind: 1 }, { type: 'energy', v: 0.1 }] });
    r.E.cmd({ type: 'at', deck: 1, atStep: 400, rest: 1, id: 3, list: [{ type: 'energy', v: 0.9 }] }); r.run(4);
    if (kind === 'seek') r.E.cmd({ type: 'seek', deck: 0, step: 128 }); if (kind === 'load') r.E.cmd({ type: 'load', deck: 0, score, cal: null, play: true, from: 0 }); if (kind === 'loop') r.E.cmd({ type: 'loop', deck: 0, from: 64, to: 128 });
    if (kind === 'jump') { r.E.cmd({ type: 'jump', deck: 0, atStep: r.D.pos + 0.5, step: 256 }); r.run(40); } else r.run(2);
    const how = (id) => (r.E.outbox.find((x) => x.type === 'at' && x.id === id) || {}).how; return { seen, left: r.E.sched.map((e) => e.deck + ':' + e.at).join(','), fx: r.rec.length, other: r.E.decks[1].energy, h1: how(1), h2: how(2), h3: how(3) }; };
  for (const kind of ['seek', 'load', 'loop', 'jump']) { const q = probe(kind); ok(q.seen.includes(0.5) && !q.seen.includes(0.1) && q.fx === 0 && q.left === '1:400', `${kind}: the restoring command ran at once (energy back), the dip and the sound were dropped, the other deck's entry stayed (${q.seen.join(',') || 'nothing'} · left ${q.left})`);
    ok(q.h1 === 'settled' && q.h2 === 'dropped' && q.h3 === undefined, `${kind}: the engine says so — restoring: ${q.h1}, dip: ${q.h2}, other deck: ${q.h3 === undefined ? 'nothing (still waiting)' : q.h3}`); }
  const r = rig(124, 64, 128); r.E.cmd({ type: 'at', deck: 0, atStep: 400, rest: 1, list: [{ type: 'energy', v: 0.5 }] }); r.E.cmd({ type: 'loop', deck: 0, from: -1, to: -1 }); ok(r.E.sched.length === 1, 'releasing a loop does not touch them'); r.E.cmd({ type: 'cancelAt', deck: 0 }); ok(r.E.sched.length === 0, 'cancelAt clears a deck'); }

// (7) inside one block: what is due before the jump's line belongs to the stretch it leaves; what is due after is dropped
{ const r = rig(124, 64, 512), jumpAt = Math.ceil(r.D.pos + 10) + 0.0, w = r.n / r.D.sps; r.E.cmd({ type: 'jump', deck: 0, atStep: jumpAt, step: 256 });
  r.E.cmd({ type: 'at', deck: 0, atStep: jumpAt - 0.4 * w, list: [{ type: 'fxNow', kind: 1 }] }); r.E.cmd({ type: 'at', deck: 0, atStep: jumpAt + 0.4 * w, list: [{ type: 'fxNow', kind: 2 }] });
  r.run(Math.ceil((jumpAt - r.D.pos) * r.D.sps / 512) + 2); ok(r.rec.length === 1 && r.rec[0].kind === 1, 'in the block of a jump: the step before its line runs (on its sample), the step after it is dropped'); }

// (8) a tempo glide before the step does not move it (the step is a position, not a time)
{ const r = rig(124, 64, 128); r.E.cmd({ type: 'glide', deck: 0, bpm: 132, steps: 24 }); const at = 64 + 30; r.E.cmd({ type: 'at', deck: 0, atStep: at, list: [{ type: 'fxNow', kind: 1 }] });
  r.run(Math.ceil(40 * r.D.sps / 128)); const f = r.rec[0]; ok(!!f && Math.abs((f.pos + f.off / r.D.sps) - at) < 1.5 / r.D.sps + 0.002, `with a tempo glide running, it still runs on its step (position ${f ? (f.pos + f.off / r.D.sps).toFixed(4) : '—'} for ${at})`); }

// (9) every command the UI puts in a list works from one
{ const r = rig(124, 64, 128); r.E.cmd({ type: 'at', deck: 0, atStep: 64.1, list: [{ type: 'fx', name: 'sweep', on: true, amt: 0.6 }, { type: 'throw', steps: 4 }, { type: 'energy', v: 0.25 }] }); r.run(8);
  ok(r.D.energy === 0.25 && r.D.mix.throwT > 0, 'a list can hold fx, throw and energy'); }
console.log(fails ? `${fails} failure(s)` : 'at: all checks pass'); process.exit(fails ? 1 : 0);
