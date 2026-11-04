// (v9.5) REGISTER (Deck.setReg): a part played an octave or two lower or higher still sits.
//   · every note lands an octave (or two) away from the written one, except those that would fall under the part's floor (the bass's
//     room) or over its ceiling, which fold back — no chord or lead note under E3 / A2 when lowered;
//   · the part keeps its level: the channel 0 … −1 octave within ±2.5 dB of the written register (the ear's loss is made up);
//   · nothing else moves (the bass and the drums are sample-for-sample the same).
// Usage: node tools/register_test.cjs
const { X } = require('./render.cjs'); const cal = require('../src/engine/calibration.json');
const sr = 44100, BLK = 128; let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
function run(gid, seed, slot, oct) { const score = X.composeTrack(gid, seed), sec = X.peakSectionOf(score); X.noiseSeed(0x77); const E = new X.Engine(sr); E.cmd({ type: 'load', deck: 0, score, cal: cal[gid], play: true, from: sec.bar0 * 16 }); const D = E.decks[0];
  if (oct) D.tweak(slot, { oct }); const ch = { bass: 4, chords: 5, pad: 6, lead: 7, arp: 8 }[slot], notes = [], syn = { 4: D.bass, 5: D.chords, 6: D.pad, 7: D.lead, 8: D.arp }[ch], tr = syn.trigger.bind(syn); syn.trigger = (off, n, ...r) => { notes.push(n); return tr(off, n, ...r); };
  D.mix.cap = Array.from({ length: X.NCH }, () => new Float32Array(2 * BLK)); const n = Math.round(64 * D.sps), C = new Float32Array(n), K = new Float32Array(n), bl = new Float32Array(BLK), br = new Float32Array(BLK);
  for (let i = 0; i < n; i += BLK) { E.render(bl, br, BLK); const cp = D.mix.cap[ch], ck = D.mix.cap[0]; for (let k = 0; k < BLK && i + k < n; k++) { C[i + k] = (cp[2 * k] + cp[2 * k + 1]) / 2; K[i + k] = ck[2 * k]; } cp.fill(0); ck.fill(0); }
  let e = 0; for (const x of C) e += x * x; return { notes, db: 10 * Math.log10(e / n + 1e-20), K }; }
const bad = []; let worst = 0;
for (const [gid, seed, slot] of [['deep-house', 3, 'chords'], ['trance', 2, 'lead'], ['melodic-techno', 4, 'arp'], ['progressive-house', 5, 'chords'], ['tech-house', 6, 'bass']]) {
  const base = run(gid, seed, slot, 0); if (!base.notes.length) { bad.push(`${gid} ${slot}: no notes in these bars`); continue; } const floor = { bass: 28, chords: 52, pad: 52, lead: 45, arp: 48 }[slot];
  for (const oct of [-1, -2, 1]) { const r = run(gid, seed, slot, oct); let moved = 0, under = 0; for (let k = 0; k < Math.min(r.notes.length, base.notes.length); k++) { const d = r.notes[k] - base.notes[k]; if (d === 12 * oct) moved++; else if (d % 12 !== 0) bad.push(`${gid} ${slot} ${oct}: a note moved by ${d}`); if (r.notes[k] < floor) under++; }
    if (under) bad.push(`${gid} ${slot} ${oct > 0 ? '+' : ''}${oct}: ${under} notes under its floor`);
    if (oct === -1) { const d = r.db - base.db; worst = Math.max(worst, Math.abs(d)); if (Math.abs(d) > 2.5) bad.push(`${gid} ${slot} −1: level ${d.toFixed(1)} dB`); let same = true; for (let i = 0; i < r.K.length; i++) if (r.K[i] !== base.K[i]) { same = false; break; } if (!same) bad.push(`${gid} ${slot} −1: the kick changed`); }
    console.log(`  ${gid.padEnd(18)} ${slot.padEnd(6)} ${oct > 0 ? '+' : ''}${oct}: ${moved}/${r.notes.length} notes moved by the octave(s), the rest folded · level ${(r.db - base.db).toFixed(1)} dB`); } }
ok(!bad.length, `register on chords, lead, arp and bass: notes moved by octaves only, none under the floor, the level within ±2.5 dB at −1 (worst ${worst.toFixed(1)} dB), the drums untouched${bad.length ? ' — not:\n    ' + bad.join('\n    ') : ''}`);
console.log(fails ? `${fails} failure(s)` : 'register: all checks pass'); process.exit(fails ? 1 : 0);
