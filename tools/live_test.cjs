// live-control test: the exact Engine (as in the worklet) plays a track while the dock's commands hit it —
// knob sweeps on sound parameters (kit), model change, sends, performance FX, delay throw, and a recompiled score
// (new sounds + a different lead role) swapped in on a bar line. Pass = finite output, no clipping past the limiter,
// no clicks the baseline does not have, the swap lands on the bar, kits leak nothing between loads.
const { X } = require('./render.cjs'); const { clicks } = require('./critic.cjs');
const sr = 44100, BLK = 128; let fails = 0; const ok = (c, msg) => { if (!c) { fails++; console.log('✗ ' + msg); } else console.log('✓ ' + msg); };
function run(E, steps, perBlock) { const D = E.decks[0], n = Math.round(steps * D.sps), L = new Float32Array(n), R = new Float32Array(n), bl = new Float32Array(BLK), br = new Float32Array(BLK);
  for (let i = 0; i < n; i += BLK) { if (perBlock) perBlock(i / n); E.render(bl, br, BLK); for (let k = 0; k < BLK && i + k < n; k++) { L[i + k] = bl[k]; R[i + k] = br[k]; } } return { L, R }; }
const stats = (s, on) => { let fin = true, pk = 0; for (const x of s.L) { if (!isFinite(x)) fin = false; pk = Math.max(pk, Math.abs(x)); } return { fin, pk, clk: clicks(s.L, sr, on) }; };
// scheduled note starts inside a window (the click detector ignores attacks)
// a low saw starts at its zero crossing, so its first waveform edge arrives half a period after the note (up to ~20 ms on a
// bass) — after silence that edge is "novel" to the detector; bass onsets are excused for 24 ms, the rest for the usual 8
const onsets = (score, from, steps, sps) => { const ev = score.ev, o = []; for (let i = 0; i < ev.n; i++) { const c = ev.ch[i]; if (c >= 4 && c !== 9 && ev.t[i] >= from && ev.t[i] < from + steps) { const x = (ev.t[i] - from) * sps; o.push(x); if (c === 4) o.push(x + 0.008 * sr, x + 0.016 * sr); } } return o; };
for (const gid of ['melodic-techno', 'deep-house', 'trance']) {
  const s = X.composeTrack(gid, 7), sec = X.peakSectionOf(s), cal = require('../src/engine/calibration.json')[gid];
  const mk = () => { const E = new X.Engine(sr); E.cmd({ type: 'load', deck: 0, score: s, cal, play: true, from: sec.bar0 * 16 }); for (const c of [0, 1, 2, 3, 9, 10]) E.cmd({ type: 'chanOn', deck: 0, ch: c, on: 0 }); return E; };
  // baseline: 8 bars untouched (melodic channels only — no drums, no vinyl crackle — so a click cannot hide)
  const E0 = mk(); run(E0, 16); const w0 = E0.decks[0].pos, on = onsets(s, w0, 128, E0.decks[0].sps); const b = stats(run(E0, 128), on);
  // live: same 8 bars with a knob sweep on every synth slot, a model change, sends, a throw
  const E = mk(); run(E, 16); const D = E.decks[0];
  const live = stats(run(E, 128, (u) => {
    E.cmd({ type: 'kit', deck: 0, slot: 'lead', p: { cut: 800 + 6000 * u, res: 0.1 + 0.5 * u } });
    E.cmd({ type: 'kit', deck: 0, slot: 'bass', p: { cut: 300 + 1500 * u, drive: 1 + 2 * u } });
    E.cmd({ type: 'kit', deck: 0, slot: 'chords', p: { cut: 600 + 3000 * u, aRel: 0.2 + u } });
    E.cmd({ type: 'kit', deck: 0, slot: 'pad', p: { cut: 900 + 2000 * u } });
    if (u > 0.5 && u < 0.51) { E.cmd({ type: 'kit', deck: 0, slot: 'chords', p: { model: 'pluck' } }); E.cmd({ type: 'sends', deck: 0, p: { verb: 0.5, delay: 0.4 } }); E.cmd({ type: 'throw', deck: 0, steps: 8 }); } }), on);
  ok(live.fin && live.pk <= 1.0, `${gid}: live knob sweeps — finite, peak ${live.pk.toFixed(3)}`);
  ok(live.clk <= b.clk + 1, `${gid}: clicks with sweeps ${live.clk} vs untouched ${b.clk}`);
  // performance FX + recompiled score swap on the next bar line, with new sounds and a different lead role
  const spec = X.exportSpec(s); spec.sound = { lead: { model: 'supersaw', cut: 2400 }, bass: { drive: 2 } }; spec.lead = Object.assign({}, spec.lead, { role: spec.lead.role === 'seq' ? 'hook' : 'seq' }); spec.mix.verb = 0.4;
  const s2 = X.compileSpec(spec); const at = (Math.floor(D.pos / 16) + 1) * 16; let swappedAt = -1;
  E.cmd({ type: 'fxNow', deck: 0, kind: 0, steps: 32 }); E.cmd({ type: 'swapScore', deck: 0, score: s2, atStep: at });
  const sw = stats(run(E, 64, () => { if (swappedAt < 0 && E.outbox.some((m) => m.type === 'swapped')) swappedAt = D.pos; }));
  ok(sw.fin && sw.pk <= 1.0, `${gid}: riser + score swap — finite, peak ${sw.pk.toFixed(3)}`);
  ok(swappedAt >= at && swappedAt - at < BLK / D.sps + 1e-9, `${gid}: swap landed at step ${swappedAt.toFixed(2)} (bar line ${at})`);
  ok(D.lead === (s2.roles.lead === 'seq' ? D.leadMono : D.leadPoly) && D.lead.p.model === 'supersaw' && D.mix.s[6].rev > 0, `${gid}: swapped kits applied (lead ${s2.roles.lead} → ${D.lead.p.model}, sends updated)`);
}
// kit leak: load hard-techno (rumble kick) then house — the house kick must equal a fresh deck's
{ const Dk = new X.Deck(sr, 0), Fr = new X.Deck(sr, 0); Dk.load(X.composeTrack('hard-techno', 1), null); Dk.load(X.composeTrack('house', 1), null); Fr.load(X.composeTrack('house', 1), null);
  const same = ['kick', 'snare', 'hats', 'perc'].every((k) => JSON.stringify(Dk[k].p) === JSON.stringify(Fr[k].p)); ok(same, 'no kit parameters leak from the previous track into the next load'); }
console.log(fails ? `${fails} failure(s)` : 'all live-control checks pass'); process.exit(fails ? 1 : 0);
