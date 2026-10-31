// browser test of the live layer: a simulated MIDI controller (fake MIDIAccess: one input, one output that records what FORGE
// sends) — learn, soft takeover, buttons, LED feedback, MIDI clock, note out, relative encoders — plus Mood, part regenerate,
// Auto, Energy, the FX rack and the stem → sound editor shortcut, on a playing deck. Usage: node tools/live_ui_test.cjs <outdir>
const { chromium } = require('./lib/dep.cjs')('playwright');
const OUT = process.argv[2] || '.'; let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
(async () => { const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/fonts|net::/.test(m.text())) errors.push(m.text()); });
  await page.goto('http://localhost:8765/test.html'); await page.waitForTimeout(600); await page.selectOption('#startGenre', 'psytrance'); await page.uncheck('#startAuto'); await page.click('#go'); await page.waitForFunction(() => window.__forge.meter && window.__forge.meter.decks[0].playing, null, { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(1000);
  const F = (fn, a) => page.evaluate(fn, a);
  // fake controller
  await F(() => { const sent = []; window.__sent = sent; const inp = { id: 'in1', name: 'Fake DDJ', onmidimessage: null }, out = { id: 'out1', name: 'Fake DDJ', send: (d, t) => sent.push({ d: Array.from(d), t }) };
    window.__in = inp; window.__forge.midi.connectMidi({ inputs: { forEach: (f) => f(inp) }, outputs: { forEach: (f) => f(out) }, onstatechange: null }); });
  const midi = (d) => F((d) => window.__in.onmidimessage({ data: new Uint8Array(d) }), d);
  await page.click('#ctlBtn'); await page.waitForTimeout(200); await page.screenshot({ path: OUT + '/controller.png' });
  // learn the deck A fader on CC 7, then soft takeover
  await page.click('[data-learn="A.fader"]'); await midi([0xb0, 7, 30]); await page.waitForTimeout(100);
  ok(await F(() => window.__forge.midi.MIDI.map['cc:0:7'] && window.__forge.midi.MIDI.map['cc:0:7'].id === 'A.fader'), 'learn: CC 7 bound to Deck A fader');
  await midi([0xb0, 7, 20]); ok(Math.abs(await F(() => window.__forge.decks[0].fader) - 1) < 1e-6, 'soft takeover: a knob far from the screen value does not jump it');
  for (const v of [60, 100, 127]) await midi([0xb0, 7, v]); await midi([0xb0, 7, 64]);
  ok(Math.abs(await F(() => window.__forge.decks[0].fader) - 64 / 127) < 0.01, 'after crossing the value the knob takes over (fader ' + (await F(() => window.__forge.decks[0].fader)).toFixed(2) + ')');
  // play button on note 11 + LED feedback
  await page.click('[data-learn="A.play"]'); await midi([0x90, 11, 100]); await midi([0x80, 11, 0]); await page.waitForTimeout(150);
  const before = await F(() => window.__forge.meter.decks[0].playing); await midi([0x90, 11, 100]); await midi([0x80, 11, 0]); await page.waitForTimeout(400);
  ok((await F(() => window.__forge.meter.decks[0].playing)) !== before, 'note 11 toggles play');
  ok(await F(() => window.__sent.some((x) => x.d[0] === 0x90 && x.d[1] === 11)), 'LED feedback sent on note 11');
  await midi([0x90, 11, 100]); await midi([0x80, 11, 0]); await page.waitForTimeout(400); // playing again
  // relative encoder on energy
  await page.click('[data-learn="A.energy"]'); await midi([0xb0, 20, 1]); await page.evaluate(() => { window.__forge.midi.MIDI.map['cc:0:20'].rel = true; });
  const e0 = await F(() => window.__forge.decks[0].energy ?? 0.5); for (let k = 0; k < 10; k++) await midi([0xb0, 20, 127]); const e1 = await F(() => window.__forge.decks[0].energy);
  ok(e1 < e0 - 0.05, `relative encoder turns energy down (${e0.toFixed(2)} → ${e1.toFixed(2)})`);
  // FX hold (momentary) on a pad
  await page.click('[data-learn="A.fx.echo.hold"]'); await midi([0x90, 40, 100]); await midi([0x80, 40, 0]);
  await midi([0x90, 40, 100]); await page.waitForTimeout(100); ok(await F(() => window.__forge.decks[0].fxOn && window.__forge.decks[0].fxOn[3] === 1), 'momentary pad: echo on while held'); await midi([0x80, 40, 0]); await page.waitForTimeout(100);
  ok(await F(() => window.__forge.decks[0].fxOn[3] === 0), '…and off on release');
  // clock + bass notes out
  await F(() => { const M = window.__forge.midi.MIDI; M.clockOut = true; M.notesOut.bass = true; window.__sent.length = 0; }); await page.waitForTimeout(1000);
  const clk = await F(() => window.__sent.filter((x) => x.d[0] === 0xf8).length), bpm = await F(() => window.__forge.meter.decks[0].bpm), notes = await F(() => window.__sent.filter((x) => (x.d[0] & 0xf0) === 0x90 && (x.d[0] & 15) === 0 && x.d[2] > 0).length);
  ok(Math.abs(clk - bpm / 60 * 24) < bpm / 60 * 24 * 0.25, `clock out: ${clk} ticks in 1 s at ${bpm.toFixed(1)} BPM (expected ≈ ${(bpm / 60 * 24).toFixed(0)})`);
  ok(notes > 0, `bass notes out on channel 1: ${notes} in 1 s`);
  // the ticks are stamped from an extrapolated deck position, so when the page thread is starved and a meter report lands late the next batch can step back in time. Same test (no tolerance beyond 0.01 ms), but a failure now says by how much
  const back = await F(() => { const a = window.__sent.filter((x) => x.d[0] === 0xf8); let w = 0; for (let i = 1; i < a.length; i++) w = Math.max(w, a[i - 1].t - a[i].t); return { n: a.length, w }; });
  ok(back.w <= 0.01, `clock timestamps are monotonic (${back.n} ticks, worst step back ${Math.max(0, back.w).toFixed(2)} ms)`);
  // a 1-bar loop wraps the deck position back by a bar every ~1.7 s. The clock must keep its steady spacing across the wraps (a tick counter left a bar ahead of the position froze the
  // clock for as long as the loop was long: 133 ticks in 11 s, one gap of 7.5 s) and the bass notes must go on
  await F(() => { const D = window.__forge.decks[0], pos = D.pos + (performance.now() - D.posT) / 1000 * D.bpm / 15, from = Math.floor(pos / 16) * 16; window.__forge.send({ type: 'loop', deck: 0, from, to: from + 16 }); window.__sent.length = 0; }); await page.waitForTimeout(4500);
  const lp = await F(() => { const a = window.__sent.filter((x) => x.d[0] === 0xf8), nn = window.__sent.filter((x) => (x.d[0] & 0xf0) === 0x90 && (x.d[0] & 15) === 0 && x.d[2] > 0).length; let gap = 0; for (let i = 1; i < a.length; i++) gap = Math.max(gap, a[i].t - a[i - 1].t); return { n: a.length, nn, gap, bpm: window.__forge.meter.decks[0].bpm }; }), want = lp.bpm / 60 * 24 * 4.5;
  ok(lp.n > want * 0.8 && lp.gap < 400, `clock ticks on through loop wraps: ${lp.n} ticks in 4.5 s (expected ≈ ${want.toFixed(0)}), longest gap ${lp.gap.toFixed(0)} ms`);
  ok(lp.nn > 15, `bass notes go on through the loop: ${lp.nn} in 4.5 s`);
  await F(() => window.__forge.send({ type: 'loop', deck: 0, from: -1, to: -1 }));
  await F(() => { const M = window.__forge.midi.MIDI; M.clockOut = false; M.notesOut.bass = false; }); await page.click('[data-mp=close]');
  // mood, part regenerate, evolve, energy, FX rack, stem edit
  await page.selectOption('.deck[data-d="0"] .cmood', 'emotional'); await page.waitForTimeout(500);
  ok(await F(() => window.__forge.decks[0].spec.mood === 'emotional' && !window.__forge.decks[0].spec.harmony.progression), 'Mood: emotional replaces the explicit harmony');
  const ev0 = await F(() => { const s = window.__forge.decks[0].score; let n = 0; for (let i = 0; i < s.ev.n; i++) if (s.ev.ch[i] === 4) n += s.ev.a[i]; return n; });
  await page.click('.deck[data-d="0"] [data-part="bass"]'); await page.waitForTimeout(400);
  ok(await F(() => window.__forge.decks[0].spec.seeds && window.__forge.decks[0].spec.seeds.bass != null), 'New bass: a bass seed is written into the score');
  await page.$eval('.deck[data-d="0"] [data-autoall]', (b) => b.scrollIntoView({ block: 'center' })); await page.click('.deck[data-d="0"] [data-autoall]'); ok(await F(() => window.__forge.auto.autoOf(window.__forge.decks[0]).on.harmony === true), 'Auto (all parts) switches on');
  await page.click('.deck[data-d="0"] .sted[data-slot="lead"]'); await page.waitForTimeout(300);
  ok(await F(() => window.__forge.DOCK.tab === 'lead' && window.__forge.DOCK.page === 'mix' && window.__forge.shell.SHELL.screen === 'edit'), 'stem ✎ opens that part in the editor (EDIT · Lead · Mix, v9.3)'); await page.screenshot({ path: OUT + '/sound_from_stem.png' });
  await page.click('[data-go=fx]'); await page.waitForTimeout(400); await page.click('[data-bd="0"]'); await page.click('[data-fx="filter"]'); await page.click('.bfx-on'); await page.waitForTimeout(200);
  ok(await F(() => window.__forge.shell.bfxOf(0).fx.filter.on === true), 'Beat FX: Filter on deck A switches on (v9.3)'); await page.screenshot({ path: OUT + '/fx_rack.png' }); await page.click('.bfx-on'); await page.click('[data-go=edit]');
  await page.click('[data-tab=harmony]'); await page.waitForTimeout(200); await page.screenshot({ path: OUT + '/harmony_mood.png' });
  const m = await F(() => ({ load: window.__forge.meter.load, playing: window.__forge.meter.decks[0].playing })); ok(m.playing && m.load < 0.6, `still playing, DSP load ${(m.load * 100).toFixed(0)} %`);
  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await browser.close(); console.log(fails ? `${fails} failure(s)` : 'live layer: all checks pass'); process.exit(fails ? 1 : 0); })();
