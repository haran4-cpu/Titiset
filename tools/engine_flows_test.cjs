// engine flows (v9.2): the live-set situations the 9.1 review found broken, as deterministic assertions on the real Engine —
// a mix ends without a ghost of the outgoing track; the bass swaps on a bar line where the incoming bass comes in, and the bass hole
// of an Auto-DJ handover is held to what 9.2 reaches on 15 genre pairs (the review's 1.5 dB target is printed, not met); pausing the
// incoming deck calls the mix off and the outgoing track stays on air; an outgoing track that ends mid-mix hands over; a start step
// already passed moves to the next bar; a glide or a tempo change mid-mix keeps both decks on one tempo; a load clears the last
// track's glide and mutes; a non-finite command is refused; a NaN inside the engine heals; an exception in render() is survived (the
// engine's rescue, called as the hosts call it — flows_ui_test checks each host's own catch); a seek fades the FX instead of cutting
// them; the exported stems add up to the mix; and what the independent check of 9.2 found: a mix called off before it started left
// its incoming deck silent on its next Play; the incoming deck's first downbeat came through before the fade-in; an exception mid-mix
// froze the mix; an absurd EQ value looped the self-heal; two exports at once broke the stems. Usage: node tools/engine_flows_test.cjs
const { X, appScore } = require('./render.cjs'); const cal = require('../src/engine/calibration.json');
const { load } = require('./load.cjs'); const XB = load("globalThis.__B = { bounceTrack, PACE, ECO };"); const B = globalThis.__B; B.PACE.work = 1e9;
const sr = 48000, L = new Float32Array(128), R = new Float32Array(128);
let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
const pack = (s) => { const ev = s.ev; return { meta: s.meta, sections: s.sections, kits: s.kits, mix: s.mix, roles: s.roles, ev: { n: ev.n, t: ev.t.slice(), ch: ev.ch.slice(), a: ev.a.slice(), v: ev.v.slice(), d: ev.d.slice(), f: ev.f.slice(), x: ev.x.slice(), y: ev.y.slice() } }; };
const sA = pack(appScore('trance', 2)), sB = pack(appScore('progressive-house', 3));
const rms = (a, n) => { let e = 0; for (let i = 0; i < n; i++) e += a[i] * a[i]; return 10 * Math.log10(e / n + 1e-20); };
function twoDecks(fromA) { const E = new X.Engine(sr); E.cmd({ type: 'load', deck: 0, score: sA, cal: cal.trance, play: true, from: fromA || 0 }); E.cmd({ type: 'load', deck: 1, score: sB, cal: cal['progressive-house'], play: false, bpm: sA.meta.bpm }); for (let i = 0; i < 200; i++) E.render(L, R, 128); return E; }
const until = (E, f, max) => { for (let k = 0; k < (max || 40000); k++) { if (f()) return true; E.render(L, R, 128); } return false; };
const bar = (E, d) => E.decks[d].pos;

// 1 · the end of a mix: the outgoing deck is gone (9.1: its fader and EQ came back up over its last notes — a −8…−15 dBFS ghost)
{ const out = sA.sections[sA.sections.length - 1], E = twoDecks(Math.max(0, out.bar0 * 16 - 64)); const at = Math.ceil(bar(E, 0) / 16) * 16 + 16;
  E.cmd({ type: 'transition', from: 0, deck: 1, atStep: at, bars: 8, kind: 'blend', fromB: 0 }); until(E, () => !E.tx && E.decks[1].playing);
  let pk = 0; for (let b = 0; b < 375; b++) { E.render(L, R, 128); const M = E.mixes[0]; let e = 0; for (let i = 0; i < 128; i++) e += M.outL[i] * M.outL[i] + M.outR[i] * M.outR[i]; pk = Math.max(pk, Math.sqrt(e / 256)); }
  ok(20 * Math.log10(pk + 1e-12) < -60, `after a mix the outgoing deck stays silent: loudest block ${(20 * Math.log10(pk + 1e-12)).toFixed(1)} dBFS RMS in the next second (≤ −60; 9.1: −8 to −15)`); }
// 2 · the bass swap lands on a bar line: the first one from the middle of the mix on where the incoming track plays bass (9.1: 60 %
// of the mix, mid-beat; and the middle bar line left a bass hole while an incoming intro had not brought its bass in yet)
{ const E = twoDecks(32 * 16), at = Math.ceil(bar(E, 0) / 16) * 16 + 16, first = sB.sections.find((S) => S.type !== 'intro'), fromB = Math.max(0, first.bar0 - 16) * 16;
  let want = Math.floor(16 * 0.7); for (let i = 0; i < sB.ev.n; i++) if (sB.ev.ch[i] === 4) { const b = Math.floor((sB.ev.t[i] - fromB) / 16); if (b >= 8 && b < want) want = b; }
  E.cmd({ type: 'transition', from: 0, deck: 1, atStep: at, bars: 16, kind: 'blend', fromB });
  until(E, () => E.tx && E.tx.started); let swapPos = -1; until(E, () => { if (E.mixes[1].low > -15) { swapPos = bar(E, 0); return true; } return false; });
  const rel = swapPos - at; ok(swapPos >= 0 && Math.abs(rel - want * 16) < 1.5, `bass swap ${rel.toFixed(2)} steps into a 16-bar mix: on the bar line ${want} (the incoming bass from bar ${want}; ±1 block)`); }
// 2b · the bass hole of an Auto-DJ handover, in the app's geometry (half the mix over the outgoing track's last section, half over its
// outro; the incoming cued so its first full section lands as the mix ends; each deck at its track trim; 32 bars): the quietest bar
// from the middle of the mix on, against the 4 bars before the middle — on the 15 genre pairs of the independent check. 9.1 (the swap
// at 60 % of the mix, mid-beat): median 3.6 dB, worst 5.1 dB, 14 of 15 over 1.5 dB. The review's target was 1.5 dB everywhere: 9.2 does
// not reach it (the incoming track's intro is lighter than the outgoing drop), so this is a guard against sliding back, and it prints
// how many pairs are over the target
{ const pairs = [['tech-house', 3, 'melodic-techno', 4], ['melodic-techno', 3, 'techno', 4], ['techno', 3, 'progressive-house', 4], ['deep-house', 3, 'tech-house', 4], ['house', 3, 'deep-house', 4], ['trance', 3, 'progressive-house', 4], ['psytrance', 3, 'prog-psy', 4], ['techno', 5, 'hard-techno', 6], ['dnb', 3, 'jungle', 4], ['progressive-house', 3, 'trance', 4], ['dub-techno', 3, 'techno', 4], ['afro-house', 3, 'deep-house', 4], ['ukg', 3, 'house', 4], ['melodic-techno', 5, 'progressive-house', 6], ['trance', 5, 'psytrance', 6]];
  const sr2 = 44100, dips = [];
  for (const [ga, sa, gb, sb] of pairs) { const a = pack(appScore(ga, sa)), b = pack(appScore(gb, sb)), len = 32, E = new X.Engine(sr2), o = a.sections[a.sections.length - 1], outAt = o.type === 'outro' ? o.bar0 * 16 : a.meta.bars * 16, at = Math.max(256, Math.min(a.meta.bars * 16 - len * 16, outAt - 256));
    const f = b.sections.find((S) => S.type !== 'intro'), fromB = Math.max(0, (f ? f.bar0 : 0) - len) * 16;
    E.cmd({ type: 'load', deck: 0, score: a, cal: cal[ga], play: true, from: at - 64 }); E.cmd({ type: 'load', deck: 1, score: b, cal: cal[gb], play: false, bpm: a.meta.bpm });
    E.cmd({ type: 'trim', deck: 0, db: X.trackTrim(a, cal[ga], sr2).trimDb, now: 1 }); E.cmd({ type: 'trim', deck: 1, db: X.trackTrim(b, cal[gb], sr2).trimDb, now: 1 });
    E.cmd({ type: 'transition', from: 0, deck: 1, atStep: at, bars: len, kind: 'blend', fromB });
    const barN = Math.round(16 * sr2 * 60 / a.meta.bpm / 4), rb = []; let e = 0, k = 0; for (let i = 0; i < 36 * barN; i += 128) { E.render(L, R, 128); for (let j = 0; j < 128; j++) { e += L[j] * L[j] + R[j] * R[j]; if (++k === barN) { rb.push(10 * Math.log10(e / barN + 1e-20)); e = 0; k = 0; } } }
    const ref = (rb[16] + rb[17] + rb[18] + rb[19]) / 4; let dip = 0; for (let q = 20; q < 36; q++) dip = Math.max(dip, ref - rb[q]); dips.push(dip); }
  const d = dips.slice().sort((x, y) => x - y), med = d[7], worst = d[14], over = d.filter((x) => x > 1.5).length;
  ok(med <= 2.0 && worst <= 3.5, `Auto-DJ handovers, 15 genre pairs: the quietest bar from the middle of the mix on is median ${med.toFixed(1)} dB / worst ${worst.toFixed(1)} dB under the bars before it (guard: ≤ 2.0 / ≤ 3.5; 9.1: 3.6 / 5.1) — ${over} of 15 still over the review's 1.5 dB target`); }
// 3 · pausing the incoming deck mid-mix calls the mix off: the outgoing deck plays on at full
{ const E = twoDecks(32 * 16), at = Math.ceil(bar(E, 0) / 16) * 16 + 16; E.cmd({ type: 'transition', from: 0, deck: 1, atStep: at, bars: 8, kind: 'blend', fromB: 0 });
  until(E, () => E.tx && E.tx.started && (bar(E, 0) - at) > 8 * 16 * 0.75); E.cmd({ type: 'pause', deck: 1 }); for (let i = 0; i < 400; i++) E.render(L, R, 128);
  const msg = E.outbox.find((m) => m.type === 'txCancelled'); let e = 0; for (let b = 0; b < 200; b++) { E.render(L, R, 128); for (let i = 0; i < 128; i++) e += L[i] * L[i]; }
  ok(!E.tx && msg && E.decks[0].playing && E.mixes[0].fader === 1 && E.mixes[0].low === 0 && 10 * Math.log10(e / 25600) > -30, `pause the incoming deck at 75 % of the mix → mix called off (${msg && msg.why}), deck A on air at fader ${E.mixes[0].fader}, its bass back (${(10 * Math.log10(e / 25600)).toFixed(1)} dB)`); E.outbox.length = 0; }
// 4 · an outgoing track that ends mid-mix hands over (9.1: the mix hung with the incoming bass held out)
{ const E = twoDecks(0), end = sA.meta.bars * 16; E.cmd({ type: 'seek', deck: 0, step: end - 64 }); for (let i = 0; i < 20; i++) E.render(L, R, 128);
  E.cmd({ type: 'transition', from: 0, deck: 1, atStep: end - 48, bars: 8, kind: 'blend', fromB: 0 }); until(E, () => !E.tx, 60000);
  ok(!E.tx && E.decks[1].playing && E.mixes[1].low === 0 && E.mixes[1].fader === 1 && E.lead === 1, `the outgoing track ends 3 bars into an 8-bar mix → deck B takes over at full (fader ${E.mixes[1].fader}, bass ${E.mixes[1].low} dB, lead ${'AB'[E.lead]})`); }
// 5 · a start step the outgoing deck has already passed moves to its next bar line (9.1: started at once, off the beat)
{ const E = twoDecks(40 * 16); const late = bar(E, 0) - 7.3; E.cmd({ type: 'transition', from: 0, deck: 1, atStep: late, bars: 8, kind: 'blend', fromB: 0 }); until(E, () => E.decks[1].playing);
  const ph = ((bar(E, 0) - bar(E, 1)) % 16 + 16) % 16; ok(Math.min(ph, 16 - ph) < 0.02, `a mix armed 7.3 steps late starts on the next bar line: deck B ${Math.min(ph, 16 - ph).toFixed(3)} steps off deck A's bar grid`); }
// 6 · a tempo change mid-mix moves both decks (9.1: 1.7 sixteenths of drift in 8 s)
{ const E = twoDecks(32 * 16), at = Math.ceil(bar(E, 0) / 16) * 16 + 16; E.cmd({ type: 'transition', from: 0, deck: 1, atStep: at, bars: 16, kind: 'blend', fromB: 0 }); until(E, () => E.tx && E.tx.started);
  for (let i = 0; i < 100; i++) E.render(L, R, 128); const d0 = bar(E, 0) - bar(E, 1); E.cmd({ type: 'glide', deck: 0, bpm: sA.meta.bpm + 5, steps: 32 }); for (let i = 0; i < 1500; i++) E.render(L, R, 128);
  const d1 = bar(E, 0) - bar(E, 1); ok(Math.abs(d1 - d0) < 0.01 && Math.abs(E.decks[0].bpm - (sA.meta.bpm + 5)) < 1e-6 && Math.abs(E.decks[0].bpm - E.decks[1].bpm) < 1e-6, `a glide on deck A mid-mix (+5 BPM over 2 bars): both decks at ${E.decks[0].bpm.toFixed(2)} BPM, offset moved ${(d1 - d0).toFixed(4)} steps over 4 s`);
  E.cmd({ type: 'bpm', deck: 0, bpm: sA.meta.bpm + 2 }); for (let i = 0; i < 1500; i++) E.render(L, R, 128);
  const d2 = bar(E, 0) - bar(E, 1); ok(Math.abs(d2 - d0) < 0.01 && Math.abs(E.decks[0].bpm - E.decks[1].bpm) < 1e-6, `a tempo change on deck A mid-mix: both decks at ${E.decks[0].bpm.toFixed(2)} BPM, offset moved ${(d2 - d0).toFixed(4)} steps over 8 s (9.1: 1.7 sixteenths)`); }
// 7 · a load starts clean: no glide, no mutes from the last track
{ const E = twoDecks(0); E.cmd({ type: 'glide', deck: 1, bpm: 150, bars: 64 }); E.cmd({ type: 'mute', deck: 1, ch: 4, on: true }); E.cmd({ type: 'load', deck: 1, score: sB, cal: cal['progressive-house'], play: false });
  ok(E.decks[1].glideRate === 0 && E.mixes[1].s[4].mute === 0, `load after a glide and a bass mute: glide ${E.decks[1].glideRate}, bass mute ${E.mixes[1].s[4].mute}`); }
// 8 · non-finite commands are refused; a NaN planted inside heals; an exception in render() is survived
{ const E = twoDecks(16 * 16); let bad = 0; for (const c of [{ type: 'fader', deck: 0, v: NaN }, { type: 'eq', deck: 0, low: Infinity }, { type: 'bpm', deck: 0, bpm: NaN }, { type: 'trim', deck: 0, db: -Infinity }, { type: 'load', deck: 1, score: sB, from: NaN }]) E.cmd(c);
  for (let b = 0; b < 400; b++) { E.render(L, R, 128); for (let i = 0; i < 128; i++) if (!Number.isFinite(L[i])) bad++; } const rej = E.outbox.filter((m) => m.type === 'rejected').length; E.outbox.length = 0;
  ok(rej === 5 && bad === 0, `5 non-finite commands refused (${rej}), the output stays finite (${bad} bad samples)`);
  E.decks[0].mix.s[0].g = NaN; bad = 0; /* (the kick: a channel that sounds every beat) */ let e = 0; for (let b = 0; b < 800; b++) { E.render(L, R, 128); for (let i = 0; i < 128; i++) { if (!Number.isFinite(L[i])) bad++; else if (b >= 400) e += L[i] * L[i]; } }
  const healed = E.outbox.some((m) => m.type === 'healed'); E.outbox.length = 0; ok(healed && bad === 0 && 10 * Math.log10(e / 51200) > -30, `a NaN inside a deck: healed, ${bad} bad samples out, the music back at ${(10 * Math.log10(e / 51200)).toFixed(1)} dB`);
  const D = E.decks[0], P = D.process.bind(D); let once = true; D.process = (n) => { if (once) { once = false; throw new Error('test'); } return P(n); }; e = 0;
  for (let b = 0; b < 800; b++) { try { E.render(L, R, 128); } catch (err) { L.fill(0); E.rescue(err, new Float32Array(128), new Float32Array(128), 128); } if (b >= 400) for (let i = 0; i < 128; i++) e += L[i] * L[i]; }
  ok(E.outbox.some((m) => m.type === 'engineError') && E.decks[0].playing && 10 * Math.log10(e / 51200) > -30, `render() threw once: the engine's rescue (called as the hosts call it) rebuilt it and it plays on (${(10 * Math.log10(e / 51200)).toFixed(1)} dB)`); }
// 9 · a seek fades the sounding FX over 5 ms (9.1: cut — a click on every jump)
{ const F = new X.Fx(sr); F.setTempo(128); F.trigger(0, 1, 0.9, sr * 4, 0, 0); const out = new Float32Array(400 * 128); for (let b = 0; b < 400; b++) { L.fill(0); R.fill(0); if (b === 200) F.stopAll(); F.render(L, R, 128); out.set(L, b * 128); }
  let mx = 0; for (let i = 200 * 128 - 4; i < 200 * 128 + 400; i++) mx = Math.max(mx, Math.abs(out[i + 1] - out[i])); ok(20 * Math.log10(mx) < -40, `FX stopped mid-sound: largest sample step ${(20 * Math.log10(mx)).toFixed(1)} dBFS around the stop (≤ −40)`); }
// 10 · a stem mute is a ramp, not a step (9.1: a 35 % gain step per block on the bass — a click)
{ const M = new X.DeckMix(sr); M.setSends({ verb: 0, delay: 0, sc: 0, heat: 1, punch: 1 }); for (let c = 0; c < X.NCH; c++) M.s[c].g = c === 4 ? 0.5 : 0; let ph = 0, prev = 0, jump = 0;
  for (let b = 0; b < 60; b++) { if (b === 30) M.s[4].mute = 1; for (let c = 0; c < X.NCH; c++) { M.bufL[c].fill(0); M.bufR[c].fill(0); } for (let i = 0; i < 128; i++) { M.bufL[4][i] = M.bufR[4][i] = 0.5; } M.mix(128); for (let i = 0; i < 128; i++) { if (b >= 29) jump = Math.max(jump, Math.abs(M.outL[i] - prev)); prev = M.outL[i]; } }
  ok(jump < 0.02, `a mute on a steady signal: largest sample step ${jump.toFixed(4)} (9.1, a stepped gain: 0.0455)`); }
// 12 · (9.2 review) a mix called off before it started leaves no deck silent: A mixed out (its fader down), a new track loaded on it,
// a mix B → A armed and called off, B paused, A played — A played at fader 0 (−51.7 LUFS)
{ const E = twoDecks(32 * 16); let at = Math.ceil(bar(E, 0) / 16) * 16 + 16; E.cmd({ type: 'transition', from: 0, deck: 1, atStep: at, bars: 8, kind: 'blend', fromB: 0 }); until(E, () => !E.tx && E.decks[1].playing, 60000);
  E.cmd({ type: 'load', deck: 0, score: sA, cal: cal.trance, play: false, bpm: E.decks[1].bpm }); at = Math.ceil(bar(E, 1) / 16) * 16 + 64; E.cmd({ type: 'transition', from: 1, deck: 0, atStep: at, bars: 8, kind: 'blend', fromB: 0 });
  for (let i = 0; i < 20; i++) E.render(L, R, 128); E.cmd({ type: 'cancelTx' }); for (let i = 0; i < 20; i++) E.render(L, R, 128); E.cmd({ type: 'pause', deck: 1 }); E.cmd({ type: 'play', deck: 0 });
  for (let i = 0; i < 400; i++) E.render(L, R, 128); let e = 0; for (let b = 0; b < 400; b++) { E.render(L, R, 128); for (let i = 0; i < 128; i++) e += L[i] * L[i]; } E.outbox.length = 0;
  ok(E.decks[0].playing && E.mixes[0].fader === 1 && 10 * Math.log10(e / 51200) > -30, `a mix armed onto a mixed-out deck and called off before it started: that deck plays at fader ${E.mixes[0].fader} (${(10 * Math.log10(e / 51200)).toFixed(1)} dB; before the review: silent)`); }
// 13 · (review) the incoming deck comes in from silence: its fader sat at 1 since its load, and its first downbeat came through at
// −13 dB for ~20 ms before the fade-in caught it
{ const E = twoDecks(32 * 16), at = Math.ceil(bar(E, 0) / 16) * 16 + 16; E.cmd({ type: 'transition', from: 0, deck: 1, atStep: at, bars: 32, kind: 'blend', fromB: 0 }); until(E, () => E.decks[1].playing);
  let pk = 0; for (let b = 0; b < 9; b++) { if (b) E.render(L, R, 128); const M = E.mixes[1]; for (let i = 0; i < 128; i++) pk = Math.max(pk, Math.abs(M.outL[i]), Math.abs(M.outR[i])); }
  ok(20 * Math.log10(pk + 1e-12) < -50, `the incoming deck's first 24 ms in a 32-bar mix peak at ${(20 * Math.log10(pk + 1e-12)).toFixed(1)} dBFS (≤ −50; before the review: −10)`); }
// 14 · (review) an exception mid-mix calls the mix off — the outgoing deck back at full with its bass, the incoming deck stopped (the
// rescue dropped the mix as it stood: both decks at fader 1 and the incoming bass held at −30 dB for good)
{ const E = twoDecks(32 * 16), at = Math.ceil(bar(E, 0) / 16) * 16 + 16; E.cmd({ type: 'transition', from: 0, deck: 1, atStep: at, bars: 16, kind: 'blend', fromB: 0 });
  until(E, () => E.tx && E.tx.started && (bar(E, 0) - at) > 16 * 16 * 0.6); E.cmd({ type: 'testFail' });
  for (let b = 0; b < 400; b++) { try { E.render(L, R, 128); } catch (err) { L.fill(0); R.fill(0); E.rescue(err, new Float32Array(128), new Float32Array(128), 128); } }
  const why = (E.outbox.find((m) => m.type === 'txCancelled') || {}).why; E.outbox.length = 0;
  ok(!E.tx && why === 'engine error' && E.decks[0].playing && E.mixes[0].fader === 1 && E.mixes[0].low === 0 && !E.decks[1].playing, `an exception at 60 % of a mix: the mix is called off (${why}), deck A on air at fader ${E.mixes[0].fader} with its bass (${E.mixes[0].low} dB), deck B stopped`); }
// 15 · (review) an absurd EQ value is clamped (EQ high = 1e9 dB overflowed the filter and every self-heal copied it back: 333 heals in
// 1000 blocks, nearly all silent); a track that breaks the sound again after every rebuild (NaN in its own notes) is stopped after four
// heals — only that deck: alone it stops and the page is told; mixed in under a healthy deck, the mix is called off and the healthy
// deck plays on (the review of the fix: its first version stopped both decks — silence)
{ const E = twoDecks(16 * 16); E.cmd({ type: 'eq', deck: 0, high: 1e9 }); let bad = 0; for (let b = 0; b < 1000; b++) { E.render(L, R, 128); for (let i = 0; i < 128; i++) if (!Number.isFinite(L[i])) bad++; }
  const heals = E.outbox.filter((m) => m.type === 'healed').length; E.outbox.length = 0; ok(heals === 0 && bad === 0 && E.mixes[0].high === 12, `EQ high = 1e9 dB: clamped to ${E.mixes[0].high} dB, ${heals} heals in 1000 blocks`);
  const s = pack(appScore('trance', 2)); for (let i = 0; i < s.ev.n; i++) if (s.ev.ch[i] === 0) s.ev.v[i] = NaN; const E2 = new X.Engine(sr); E2.cmd({ type: 'load', deck: 0, score: s, cal: cal.trance, play: true, from: 512 }); bad = 0;
  for (let b = 0; b < 3000; b++) { E2.render(L, R, 128); for (let i = 0; i < 128; i++) if (!Number.isFinite(L[i])) bad++; } const h2 = E2.outbox.filter((m) => m.type === 'healed').length, st2 = E2.outbox.find((m) => m.type === 'deckStopped');
  ok(h2 === 4 && st2 && st2.deck === 0 && !E2.decks[0].playing && bad === 0, `a track with NaN in its kick velocities, alone: ${h2} heals, then that deck stops and the page is told (deck ${st2 ? 'AB'[st2.deck] : '—'}); ${bad} bad samples out`);
  const E3 = new X.Engine(sr); E3.cmd({ type: 'load', deck: 0, score: sB, cal: cal['progressive-house'], play: true, from: 32 * 16 }); E3.cmd({ type: 'load', deck: 1, score: s, cal: cal.trance, play: false, bpm: sB.meta.bpm });
  for (let i = 0; i < 100; i++) E3.render(L, R, 128); const at3 = Math.ceil(E3.decks[0].pos / 16) * 16 + 16; E3.cmd({ type: 'transition', from: 0, deck: 1, atStep: at3, bars: 16, kind: 'blend', fromB: 0 }); bad = 0;
  for (let b = 0; b < 3000; b++) { E3.render(L, R, 128); for (let i = 0; i < 128; i++) if (!Number.isFinite(L[i])) bad++; } let e3 = 0; for (let b = 0; b < 400; b++) { E3.render(L, R, 128); for (let i = 0; i < 128; i++) e3 += L[i] * L[i]; }
  const h3 = E3.outbox.filter((m) => m.type === 'healed').length, st3 = E3.outbox.find((m) => m.type === 'deckStopped'), rs3 = E3.outbox.some((m) => m.type === 'engineReset'), reA = E3.outbox.filter((m) => m.type === 'healed' && m.decks.includes(0)).length;
  ok(h3 === 4 && st3 && st3.deck === 1 && !rs3 && reA === 0 && !E3.decks[1].playing && E3.decks[0].playing && !E3.tx && E3.mixes[0].fader === 1 && bad === 0 && 10 * Math.log10(e3 / 51200) > -30, `the same track mixed in under a healthy deck: ${h3} heals, the healthy deck rebuilt ${reA} times (the first version: 3), then only the broken deck stops (deck ${st3 ? 'AB'[st3.deck] : '—'}), the mix is called off and deck A plays on at fader ${E3.mixes[0].fader} (${(10 * Math.log10(e3 / 51200)).toFixed(1)} dB); ${bad} bad samples out`); }
// 11 · stems (40 bars + tail of a techno track, whose echo is fed by two stems from bar 37): 32-bit float, summing to the mix. With the
// effects' idle shortcuts the export measured −37 dB here (an echo idle in one stem's pass came back with its delay line elsewhere)
(async () => { const s = appScore('techno', 1), short = Object.assign({}, s, { meta: Object.assign({}, s.meta, { bars: 40 }) }); const r = await B.bounceTrack({ score: short, cal: cal.techno, sr: 44100, stems: true, levelDb: -2 }, null, null);
  const N = r.frames * 2, sum = new Float64Array(N); for (const st of r.stems) for (let i = 0; i < N; i++) sum[i] += st.data[i]; let em = 0, ed = 0; for (let i = 0; i < N; i++) { const m = r.mix[i] / 32768; em += m * m; ed += (sum[i] - m) * (sum[i] - m); }
  ok(r.stems.length === 5 && r.stems.every((x) => x.data instanceof Float32Array) && 10 * Math.log10(ed / em) < -50, `five float stems add up to the mix: the difference is ${(10 * Math.log10(ed / em)).toFixed(1)} dB under it (≤ −50)`);
  // 16 · (review) two exports at once, one per deck: the first to finish switched the exact-render flag off under the other (its stems
  // then missed the mix by 28 dB instead of 74). Paced as in the worker, so the two interleave
  { B.PACE.work = 10; B.PACE.rest = 1; const house = appScore('house', 2), h16 = Object.assign({}, house, { meta: Object.assign({}, house.meta, { bars: 16 }) });
    const pW = B.bounceTrack({ score: h16, cal: cal.house, sr: 44100, stems: false, levelDb: -2 }, null, null); await new Promise((res) => setTimeout(res, 50));
    const pS = B.bounceTrack({ score: short, cal: cal.techno, sr: 44100, stems: true, levelDb: -2 }, null, null); await pW; const still = B.ECO.exact; const r2 = await pS; B.PACE.work = 1e9;
    const N2 = r2.frames * 2, sum2 = new Float64Array(N2); for (const st of r2.stems) for (let i = 0; i < N2; i++) sum2[i] += st.data[i]; let em2 = 0, ed2 = 0; for (let i = 0; i < N2; i++) { const m = r2.mix[i] / 32768; em2 += m * m; ed2 += (sum2[i] - m) * (sum2[i] - m); }
    ok(still === true && B.ECO.exact === false && 10 * Math.log10(ed2 / em2) < -50, `stems exported while a WAV export of the other deck finishes: still exact when the WAV is done (${still}), the stems ${(10 * Math.log10(ed2 / em2)).toFixed(1)} dB under the mix (≤ −50)`); }
  console.log(fails ? `${fails} failure(s)` : 'engine flows: all checks pass'); process.exit(fails ? 1 : 0); })();
