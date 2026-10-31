// MIDI clock in: a jittery external clock (±2 ms per tick, as a USB device sends it) at 130 BPM, then 118.5 — the decks follow
// within 0.15 BPM (the engine's own tempo, not only the UI's); Stop pauses the lead deck, Start plays it; the Controller panel
// offers the option. Usage: node tools/midiclock_test.cjs
const { chromium } = require('./lib/dep.cjs')('playwright'); let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
(async () => { const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8765/test.html'); await p.waitForTimeout(400); await p.selectOption('#startGenre', 'techno'); await p.uncheck('#startAuto'); await p.click('#go');
  await p.waitForFunction(() => window.__forge.meter && window.__forge.meter.decks[0].playing, null, { timeout: 60000 }); await p.waitForTimeout(1500);
  const feed = (bpm, beats) => p.evaluate(async ([bpm, beats]) => { const M = window.__forge.midi; M.MIDI.clockIn = true; const t0 = performance.now(), iv = 60000 / (bpm * 24);
    for (let k = 0; k < beats * 24; k++) { const t = t0 + k * iv + (Math.random() - 0.5) * 4; M.midiMessage(new Uint8Array([0xf8]), t); /* each tick ±2 ms around the true grid */ if (k % 24 === 23) await new Promise((r) => setTimeout(r, 5)); } }, [bpm, beats]);
  for (const bpm of [130, 118.5]) { await feed(bpm, 12); await p.waitForTimeout(2500); const r = await p.evaluate(() => ({ ui: window.__forge.decks[0].bpm, eng: window.__forge.meter.decks[0].bpm }));
    const k = await p.evaluate(() => { const K = window.__forge.midi.MIDI.ck; return { bpm: K.bpm, sent: K.sent, cmd: K.cmd, n: K.t.length, run: K.run }; }); ok(Math.abs(r.eng - bpm) < 0.15 && Math.abs(r.ui - bpm) < 0.15, `external clock ${bpm} BPM (jittery): the deck plays at ${r.eng.toFixed(2)} BPM (estimate ${k.bpm.toFixed(2)})`); }
  await p.evaluate(() => window.__forge.midi.midiMessage(new Uint8Array([0xfc]), performance.now())); await p.waitForTimeout(500); ok(!(await p.evaluate(() => window.__forge.decks[0].playing)), 'Stop pauses the lead deck');
  await p.evaluate(() => window.__forge.midi.midiMessage(new Uint8Array([0xfa]), performance.now())); await p.waitForTimeout(800); ok(await p.evaluate(() => window.__forge.decks[0].playing), 'Start plays it again');
  await p.click('#ctlBtn'); await p.waitForTimeout(400); ok(await p.evaluate(() => !!document.querySelector('[data-mp=clockin]') && document.querySelector('[data-mp=clockin]').checked), 'Controller panel: "Clock in" option, on');
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs[0] : '')); await b.close(); console.log(fails ? `${fails} failure(s)` : 'midi clock: all checks pass'); process.exit(fails ? 1 : 0); })();
