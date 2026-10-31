// endless-set test: the Engine (exact worklet code) plays a set of N tracks with phrase-aligned transitions, the same
// way the UI's Auto-DJ drives it. Checks: no NaN, no clicks on the master, beat-grid continuity across the hand-over,
// the incoming deck starts exactly on the planned step, loudness continuity (no hole), CPU per block (p50/p99/max).
const { X } = require('./render.cjs');
const C = require('./critic.cjs');
const CAL = require('../src/engine/calibration.json');
const sr = 44100, E = new X.Engine(sr);
const order = (process.argv[2] || 'deep-house,tech-house,techno,melodic-techno').split(','), LEN = 32;
let lead = 0, k = 0; const scores = [];
function load(deck, gid, bpm, key) { const s = X.composeTrack(gid, 1000 + k++, key != null ? { key } : {}); scores[deck] = s; E.cmd({ type: 'load', deck, score: s, cal: CAL[gid], play: deck === 0 && k === 1, bpm }); return s; }
const onsets = []; let blockStart = 0;
for (const D of E.decks) { const orig = D.dispatch.bind(D); D.dispatch = (i, off) => { onsets.push(blockStart + off); orig(i, off); }; }
const first = load(0, order[0]);
E.cmd({ type: 'seek', deck: 0, step: (first.meta.bars - 48) * 16 }); // start near the end of the first track to keep the test short
const L = new Float32Array(128), R = new Float32Array(128); const CAP = sr * 60 * 26; const outLb = new Float32Array(CAP), outRb = new Float32Array(CAP); const times = []; const log = []; const spikes = [];
let next = 1, armed = false, lufsMin = 0, gapBlocks = 0, maxGap = 0, totalBlocks = 0;
while (next <= order.length) {
  const A = E.decks[E.lead]; const sa = scores[E.lead];
  if (!armed && next < order.length && A.playing && A.pos > (sa.meta.bars - LEN - 8) * 16) { const b = E.lead ^ 1; const s = load(b, order[next], A.bpm, sa.meta.key); const at = (sa.meta.bars - LEN) * 16;
    E.cmd({ type: 'transition', from: E.lead, deck: b, atStep: at, bars: LEN, kind: 'blend' }); armed = { b, at, from: E.lead }; log.push(`armed ${order[next]} → deck ${'AB'[b]} at step ${at}`); }
  blockStart = totalBlocks * 128; const t0 = process.hrtime.bigint(); E.render(L, R, 128); const dt = Number(process.hrtime.bigint() - t0) / 1e6; times.push(dt); totalBlocks++;
  outLb.set(L, (totalBlocks - 1) * 128); outRb.set(R, (totalBlocks - 1) * 128); if (dt > 2) spikes.push([totalBlocks, dt.toFixed(2), E.decks[0].playing + '' + E.decks[1].playing, (E.decks[E.lead].pos / 16).toFixed(1)]);
  if (armed && E.decks[armed.b].playing && !armed.checked) { armed.checked = true; const Da = E.decks[armed.from], Db = E.decks[armed.b];
    // grid check: B's position must equal A's position minus the start step (same tempo, same phase)
    log.push(`start: A.pos-at=${(Da.pos - armed.at).toFixed(4)} B.pos=${Db.pos.toFixed(4)} Δ=${((Da.pos - armed.at) - Db.pos).toFixed(5)} steps, bpm A ${Da.bpm.toFixed(2)} B ${Db.bpm.toFixed(2)}`); }
  while (E.outbox.length) { const m = E.outbox.shift(); if (m.type === 'txDone') { log.push(`txDone → lead ${'AB'[m.deck]} (${scores[m.deck].meta.name})`); armed = false; next++; if (next >= order.length) { /* play 8 more bars then stop */ } } }
  const st = E.master.meter.short; if (totalBlocks > 1000) { if (st < -30) { gapBlocks++; maxGap = Math.max(maxGap, gapBlocks); } else gapBlocks = 0; }
  if (next >= order.length && !armed) { const D = E.decks[E.lead]; if (!D.extra) D.extra = D.pos; if (D.pos - D.extra > 8 * 16) break; }
  if (totalBlocks > sr / 128 * 60 * 25) break; // hard stop 25 min
}
const Lf = outLb.subarray(0, totalBlocks * 128), Rf = outRb.subarray(0, totalBlocks * 128); let nan = 0; for (const v of Lf) if (!isFinite(v)) nan++;
times.sort((a, b) => a - b); const q = (p) => times[Math.floor(times.length * p)].toFixed(3);
console.log(log.join('\n')); const late = spikes.filter((x) => x[0] > 2000); const by = {}; for (const x of late) by[x[2]] = (by[x[2]] || 0) + 1; console.log('blocks > 2 ms after warm-up:', late.length, 'by decks playing', JSON.stringify(by), 'worst', JSON.stringify(late.sort((a, b) => b[1] - a[1]).slice(0, 6)));
const t2 = times.slice(2000).sort((a, b) => a - b); console.log('after warm-up: p50', t2[Math.floor(t2.length * 0.5)].toFixed(3), 'p99', t2[Math.floor(t2.length * 0.99)].toFixed(3), 'p99.9', t2[Math.floor(t2.length * 0.999)].toFixed(3), 'max', t2[t2.length - 1].toFixed(3));
console.log(`audio ${(Lf.length / sr / 60).toFixed(1)} min · NaN ${nan} · master clicks ${C.clicks(Lf, sr, onsets)} · longest drop below -30 LUFS-S ${(maxGap * 128 / sr).toFixed(1)} s`);
console.log(`block time ms (budget 2.902): p50 ${q(0.5)} p99 ${q(0.99)} p99.9 ${q(0.999)} max ${times[times.length - 1].toFixed(3)} · agc ${E.agc.toFixed(2)} dB`);
