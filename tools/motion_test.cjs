// motion FX + production style: (1) every genre writes motion automation, and tracks of one genre do not all move the same
// way (build endings, echo intervals vary by seed); (2) the resonator re-tunes to every chord of a real score; (3) build → drop
// renders (6 families, with repeat / tape / resonator / shifter moves) stay finite, under the ceiling, and the drop is the
// loudest part; (4) the live pads (repeat, tape stop, swirl) engage and, on release, the deck returns to the dry signal.
// Usage: node tools/motion_test.cjs
const { X, renderTrack } = require('./render.cjs'); const { lufs } = require('./lib/dsp.cjs'); const cal = require('../src/engine/calibration.json');
let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
// (1)
const ends = {}; let none = []; for (const g of X.GENRES) { for (const seed of [1, 2, 3, 4, 5, 6]) { const s = X.composeTrack(g.id, seed); let mo = 0; const e = [];
    for (let i = 0; i < s.ev.n; i++) if (s.ev.ch[i] === 11 && s.ev.a[i] >= 8) { mo++; const id = s.ev.a[i] - 8; if ((id === 5 || id === 6) && s.ev.t[i] < 1) e.push(id + ':' + s.ev.v[i]); if (id === 13 && s.ev.v[i] > 0) e.push('repeat'); if (id === 14 && s.ev.v[i] < 0.5) e.push('tape'); if (id === 15 && s.ev.v[i] > 1) e.push('swirl'); }
    if (!mo) none.push(g.id + '/' + seed); (ends[g.family] = ends[g.family] || new Set()).add(e.join(',') || 'roll/filter'); } }
ok(!none.length, `every track writes motion automation${none.length ? ' — none in ' + none.slice(0, 5).join(', ') : ''}`);
const mono = Object.entries(ends).filter(([f, set]) => set.size < 2 && !['chill', 'ambient'].includes(f)).map(([f]) => f);
ok(!mono.length, `production moves vary from track to track inside a family (distinct move sets: ${Object.entries(ends).map(([f, s]) => f + ' ' + s.size).join(', ')})`);
// (2) resonator follows the chords of a real score
{ const s = X.composeTrack('progressive-house', 2), D = new X.Deck(44100, 0); D.load(s, cal['progressive-house']); D.playing = 1; let checked = 0, bad = 0;
  for (let b = 0; b < 3000; b++) { D.process(128); if (b % 200 === 199) { const R = D.mix.reso; const tones = []; for (let k = 0; k < 12; k++) if (R.mask & (1 << k)) tones.push(k);
      for (let v = 0; v < 4; v++) { const f = 44100 / R.dT[v], pc = ((Math.round(12 * Math.log2(f / 440)) % 12) + 12 + 9) % 12; checked++; if (!tones.includes(pc)) bad++; } } }
  ok(checked > 0 && bad === 0, `resonator combs sit on chord tones (${checked - bad}/${checked} checks)`); }
// (3) build → drop renders
for (const [g, seed] of [['psytrance', 3], ['dubstep', 3], ['techno', 3], ['trance', 2], ['dnb', 4], ['progressive-house', 5]]) { const s = X.composeTrack(g, seed), k = s.sections.findIndex((x) => x.type === 'build'); if (k < 0) continue; const B = s.sections[k], D2 = s.sections[k + 1];
  const r = renderTrack(g, seed, { score: s, fromBar: B.bar0, toBar: B.bar0 + B.bars + 8 }); let pk = 0, fin = true; for (const x of r.L) { if (!isFinite(x)) fin = false; pk = Math.max(pk, Math.abs(x)); }
  const sps = r.sps, cut = Math.round(B.bars * 16 * sps), lb = lufs(r.L.subarray(0, cut), r.R.subarray(0, cut), r.sr).I, ld = lufs(r.L.subarray(cut), r.R.subarray(cut), r.sr).I;
  ok(fin && pk <= 1 && ld > lb, `${g}: build ${lb.toFixed(1)} → ${D2 ? D2.type : '?'} ${ld.toFixed(1)} LUFS, peak ${pk.toFixed(2)}`); }
// (4) live pads
{ const s = X.composeTrack('tech-house', 3), E = new X.Engine(44100); const ev = s.ev; E.cmd({ type: 'load', deck: 0, score: { meta: s.meta, sections: s.sections, kits: s.kits, mix: s.mix, roles: s.roles, ev: { n: ev.n, t: ev.t.slice(), ch: ev.ch.slice(), a: ev.a.slice(), v: ev.v.slice(), d: ev.d.slice(), f: ev.f.slice(), x: ev.x.slice(), y: ev.y.slice() } }, cal: cal['tech-house'], play: true, from: X.peakSectionOf(s).bar0 * 16 });
  const L = new Float32Array(128), R = new Float32Array(128); const run = (nb) => { let e = 0, bad = 0; for (let b = 0; b < nb; b++) { E.render(L, R, 128); for (let i = 0; i < 128; i++) { if (!isFinite(L[i])) bad++; e += L[i] * L[i]; } } return { e: e / (nb * 128), bad }; };
  run(400); const dry = run(200);
  for (const name of ['repeat', 'tape', 'swirl']) { E.cmd({ type: 'fx', deck: 0, name, on: true, amt: 0.5 }); const on = run(300), spd = E.decks[0].mix.motion.tape; E.cmd({ type: 'fx', deck: 0, name, on: false }); run(40); const after = run(200); const M = E.decks[0].mix.motion;
    const engaged = name === 'repeat' ? true : name === 'tape' ? spd < 0.05 : true;
    ok(!on.bad && !after.bad && engaged && !M.rep && M.tape >= 0.999 && Math.abs(10 * Math.log10(after.e / dry.e)) < 3, `live ${name}: engages, releases back to the dry deck (level after ${(10 * Math.log10(after.e / dry.e)).toFixed(1)} dB vs before${name === 'tape' ? `, the deck had slowed to ${(spd * 100).toFixed(0)} %` : ''})`); } }
// (5) live drum fills: each one plays on the grid; the toms land on the tones of the chord that is sounding (tuned through the
// kit's pitch); the part sends from the Chords tab / macros reach the strips and go back on release
{ const s = X.composeTrack('deep-house', 5), E = new X.Engine(44100); const ev = s.ev; E.cmd({ type: 'load', deck: 0, score: { meta: s.meta, sections: s.sections, kits: s.kits, mix: s.mix, roles: s.roles, ev: { n: ev.n, t: ev.t.slice(), ch: ev.ch.slice(), a: ev.a.slice(), v: ev.v.slice(), d: ev.d.slice(), f: ev.f.slice(), x: ev.x.slice(), y: ev.y.slice() } }, cal: cal['deep-house'], play: true, from: X.peakSectionOf(s).bar0 * 16 });
  const L = new Float32Array(128), R = new Float32Array(128); for (let b = 0; b < 300; b++) E.render(L, R, 128); const D = E.decks[0];
  for (const kind of ['roll', 'hats', 'kick', 'toms']) { const hits = []; const fn = kind === 'roll' ? 'hitSnare' : kind === 'hats' ? 'hitHat' : kind === 'kick' ? null : 'hitPerc', inst = fn ? D : D.kick, key = fn || 'trigger', orig = inst[key].bind(inst); // (v9.3: a drum hit goes through the deck: the family's one-shot, or the synthesized voice)
    inst[key] = (...a) => { hits.push(a); return orig(...a); }; E.cmd({ type: 'fill', deck: 0, kind, on: true }); const p0 = D.pos; for (let b = 0; b < 160; b++) E.render(L, R, 128); E.cmd({ type: 'fill', deck: 0, kind, on: false }); const beats = (D.pos - p0) / 4; inst[key] = orig;
    let ok2 = hits.length >= beats * (kind === 'kick' ? 1.5 : 3); if (kind === 'toms') { const mask = D.mix.reso.mask, pitch = D.perc.p.pitch || 1; const toms = hits.filter((h) => h[2] === 'tom'); const inKey = toms.filter((h) => mask & (1 << (((Math.round(h[3] + 12 * Math.log2(pitch)) % 12) + 12) % 12))).length; ok2 = ok2 && toms.length > 0 && inKey === toms.length; }
    ok(ok2, `live fill ${kind}: ${hits.length} hits over ${beats.toFixed(1)} beats${kind === 'toms' ? ', every tom on a tone of the sounding chord' : ''}`); }
  E.cmd({ type: 'partfx', deck: 0, ch: 5, echo: 0.6, verb: 0.4 }); const on = Math.abs(D.mix.s[5].ech - 0.6) < 1e-6 && Math.abs(D.mix.s[5].revAdd - 0.4) < 1e-6; E.cmd({ type: 'partfx', deck: 0, ch: 5, echo: -1, verb: 0 }); D.applyAuto();
  ok(on && D.mix.s[5].revAdd === 0 && D.liveEch[5] === -1, 'live part sends (stab echo / room) apply and release'); }
console.log(fails ? `${fails} failure(s)` : 'motion: all checks pass'); process.exit(fails ? 1 : 0);
