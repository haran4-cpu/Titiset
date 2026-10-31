// MIDI clock phase lock, in real time: an external clock at 128 BPM sends Start; the deck must start on the top of a bar and stay
// on the external beat — the measured offset (FORGE's heard beat vs the clock's beat) under 0.05 beat after 24 beats, and the deck
// at the clock's tempo. Then a deck already playing at another tempo and phase is caught by Continue and pulled in.
// Usage: node tools/phaselock_test.cjs
const { chromium } = require('./lib/dep.cjs')('playwright'); let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
(async () => { const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8765/test.html'); await p.waitForTimeout(400); await p.selectOption('#startGenre', 'techno'); await p.uncheck('#startAuto'); await p.click('#go');
  await p.waitForFunction(() => window.__forge.meter && window.__forge.meter.decks[0].playing, null, { timeout: 60000 }); await p.waitForTimeout(1500);
  const run = (bpm, beats, startByte) => p.evaluate(async ([bpm, beats, sb]) => { const M = window.__forge.midi; M.MIDI.clockIn = true; const iv = 60000 / (bpm * 24), errs = [];
    // each tick is stamped with the time it was DUE, like a hardware timestamp: stamped with performance.now() when the timer got round to it, a starved page thread put its own
    // timer lateness (p95 19 ms, max 70 ms on one busy core) into the "external clock" — a steady ±0.06-beat offset that no real MIDI device would cause
    M.midiMessage(new Uint8Array([sb]), performance.now()); const t0 = performance.now() + 2;
    for (let k = 0; k < beats * 24; k++) { const due = t0 + k * iv; while (performance.now() < due) await new Promise((r) => setTimeout(r, Math.max(0, Math.min(4, due - performance.now() - 0.5)))); M.midiMessage(new Uint8Array([0xf8]), due); if (k % 24 === 0) errs.push(M.MIDI.ck.err); }
    return { errs, bpm: window.__forge.meter.decks[0].bpm, pos: window.__forge.decks[0].pos }; }, [bpm, beats, startByte]);
  await p.evaluate(() => window.__forge.playPause(0)); await p.waitForTimeout(600); // paused somewhere mid-bar
  let r = await run(128, 40, 0xfa); const tail = r.errs.slice(24).map(Math.abs);
  ok(Math.max(...tail) < 0.05, `Start from a pause: offset to the clock's beat after 24 beats ≤ ${Math.max(...tail).toFixed(3)} beat (first beats: ${r.errs.slice(0, 4).map((e) => e.toFixed(2)).join(', ')})`);
  ok(Math.abs(r.bpm - 128) < 0.6, `deck at the clock's tempo: ${r.bpm.toFixed(2)} BPM (± the phase nudge)`);
  await p.evaluate(() => window.__forge.midi.midiMessage(new Uint8Array([0xfc]), performance.now())); await p.waitForTimeout(300); await p.evaluate(() => window.__forge.playPause(0)); await p.waitForTimeout(1300); // playing on its own, out of phase
  r = await run(128, 48, 0xfb); const t2 = r.errs.slice(36).map(Math.abs);
  ok(Math.max(...t2) < 0.05, `Continue onto a deck playing out of phase: pulled in, offset ≤ ${Math.max(...t2).toFixed(3)} beat after 36 beats (start ${r.errs[1].toFixed(2)})`);
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs[0] : '')); await b.close(); console.log(fails ? `${fails} failure(s)` : 'phase lock: all checks pass'); process.exit(fails ? 1 : 0); })();
