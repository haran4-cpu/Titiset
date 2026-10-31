// The moves of Auto and the Build → Drop snare-up, in the browser, on the real engine (AudioWorklet): they are held by the ENGINE and run on their
// exact steps (cmd 'at'). The page used to time them with setTimeout from the heard position (late by the output latency, jittered by the page).
// (1) Auto's three moves (filter sweep, echo throw, energy dip) all run, each on its step to the sample, and the pad and the energy knob follow;
// (2) a jump on air settles a move that is still waiting: the dip never starts, the energy is as before; (3) SAFE does the same;
// (4) Build → Drop: the riser and the snare-up are in the engine and the deck lands on the drop's first bar.
// Usage: node tools/auto_move_test.cjs <outdir> [live | fast | buffered | fallback]   (the engine under test; default live, the AudioWorklet engine)
const { chromium } = require('./lib/dep.cjs')('playwright');
const OUT = process.argv[2] || '.', ENG = process.argv[3] || 'live'; let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
(async () => { const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  if (ENG === 'fallback') await page.addInitScript(() => { delete window.AudioWorkletNode; }); else if (ENG !== 'live') await page.addInitScript((e) => { try { localStorage.setItem('forge.engine2', e); } catch (x) { /* none */ } }, ENG);
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/fonts|net::/.test(m.text())) errors.push(m.text()); });
  await page.goto('http://localhost:8765/test.html'); await page.waitForTimeout(500); const F = (fn, a) => page.evaluate(fn, a);
  await page.selectOption('#startGenre', 'progressive-house'); await page.uncheck('#startAuto'); await page.click('#go');
  await page.waitForFunction(() => window.__forge.meter && window.__forge.meter.decks[0].playing, null, { timeout: 25000 }).catch(() => {}); await page.waitForTimeout(1200);
  ok(await F(() => !!window.__forge.meter.decks[0].playing), 'deck A plays (' + (await F(() => window.__forge.A2.mode)) + ')');
  // helpers living in the page
  await F(() => { const f = window.__forge, D = f.decks[0]; window.__lp = () => D.pos + (performance.now() - D.posT) / 1000 * D.bpm / 15; window.__at = []; window.__ui = [];
    f.A2.tap = (d) => { if (d.type === 'at') window.__at.push(Object.assign({ t: performance.now() }, d)); };
    window.__poll = setInterval(() => window.__ui.push({ t: performance.now(), sweep: D.fxOn ? D.fxOn[0] : 0, energy: D.energy == null ? 0.5 : D.energy, lp: window.__lp() }), 40); });

  // (1) the three moves on one phrase line
  const r1 = await F(async () => { const f = window.__forge, X = f.auto, D = f.decks[0], end = Math.ceil((window.__lp() + 100) / 16) * 16, rnd = Math.random, msgs = [];
    for (const v of [0.1, 0.4, 0.8]) { Math.random = () => v; msgs.push(X.autoMove(0, end)); } Math.random = rnd;
    const sr = f.A2.ctx.sampleRate; await new Promise((res) => { const iv = setInterval(() => { if (window.__lp() > end + 6) { clearInterval(iv); res(); } }, 100); });
    return { end, msgs, at: window.__at.slice(), ui: window.__ui.slice(), sr, bpm: D.bpm }; });
  const sps = (r) => r.sr * 60 / r.bpm / 4, ran = r1.at.filter((x) => x.how === 'ran'), steps = ran.map((x) => x.at).sort((a, b) => a - b);
  ok(r1.msgs.length === 3 && ran.length === 5, `the three moves are all sent and the engine ran 5 scheduled commands (sweep on / off, throw, dip, back): ${ran.length} (${r1.msgs.join(' · ')})`);
  ok(JSON.stringify(steps) === JSON.stringify([r1.end - 64, r1.end - 32, r1.end - 4, r1.end, r1.end].sort((a, b) => a - b)), `each on its own step: end−64, −32, −4 and two on the line (${steps.map((s) => s - r1.end).join(', ')})`);
  const worst = Math.max(...ran.map((x) => Math.abs(x.pos + x.off / sps(r1) - x.at) * sps(r1))); ok(worst <= 1.5, `each ran on its sample: worst error ${worst.toFixed(2)} samples (offsets ${ran.map((x) => x.off).join(', ')})`);
  const sw = r1.ui.filter((u) => u.sweep === 1), en = r1.ui.filter((u) => u.energy === 0.25), last = r1.ui[r1.ui.length - 1];
  ok(sw.length > 3 && last.sweep === 0, `the sweep pad lit while the sweep ran (${sw.length} samples) and is off again on the line`); ok(en.length > 3 && last.energy === 0.5, `the energy knob went down for the dip (${en.length} samples) and is back at ${last.energy}`);

  // (2) a jump on air settles a move that is still waiting
  const r2 = await F(async () => { const f = window.__forge, X = f.auto, D = f.decks[0]; window.__at.length = 0; const end = Math.ceil((window.__lp() + 150) / 16) * 16, rnd = Math.random; Math.random = () => 0.8; X.autoMove(0, end); Math.random = rnd; // the dip: end−64 …end
    const k = D.score.sections.findIndex((S, n) => n > D.sec + 1); f.jumpTo(0, Math.max(0, k)); const t0 = performance.now();
    await new Promise((res) => { const iv = setInterval(() => { if (window.__at.length >= 2 || performance.now() - t0 > 20000) { clearInterval(iv); res(); } }, 100); });
    return { at: window.__at.slice(), energy: D.energy == null ? 0.5 : D.energy, end }; });
  ok(r2.at.some((x) => x.how === 'dropped') && r2.at.some((x) => x.how === 'settled'), `a jump on air settles a waiting move: the dip is ${(r2.at.find((x) => x.at === r2.end - 64) || {}).how}, the restoring step is ${(r2.at.find((x) => x.at === r2.end) || {}).how}`);
  ok(r2.energy === 0.5, `the energy was never left down (${r2.energy})`);

  // (3) SAFE
  const r3 = await F(async () => { const f = window.__forge, X = f.auto; window.__at.length = 0; const end = Math.ceil((window.__lp() + 150) / 16) * 16, rnd = Math.random; Math.random = () => 0.1; X.autoMove(0, end); Math.random = rnd; return end; });
  await page.keyboard.press('Escape'); await page.waitForTimeout(700);
  const r3b = await F(() => ({ at: window.__at.slice(), sweep: window.__forge.decks[0].fxOn ? window.__forge.decks[0].fxOn[0] : 0 }));
  ok(r3b.at.length >= 2 && r3b.at.every((x) => x.how !== 'ran') && r3b.sweep === 0, `SAFE settles what was waiting in the engine: ${r3b.at.map((x) => x.how).join(', ') || 'nothing'}`);

  // (4) Build → Drop: riser until the line, snare-up held by the engine, then the deck is on the drop
  await F(() => { window.__at.length = 0; }); const r4 = await F(async () => { const f = window.__forge, D = f.decks[0], pos0 = window.__lp(); f.auto.buildToDrop(0); const at = D.pendJump, t0 = performance.now();
    await new Promise((res) => { const iv = setInterval(() => { if (window.__lp() > at + 8 || performance.now() - t0 > 40000) { clearInterval(iv); res(); } }, 100); });
    const drop = D.score.sections.findIndex((S, n) => n > 0 && S.type === 'drop'); return { at, pos0, atMsgs: window.__at.slice(), sec: D.sec, lp: window.__lp(), sr: f.A2.ctx.sampleRate, bpm: D.bpm, drop: D.score.sections.some((S) => S.type === 'drop') }; });
  const sn = r4.atMsgs.find((x) => x.how === 'ran'); ok(!!sn && sn.at === r4.at - 16 && Math.abs(sn.pos + sn.off / (r4.sr * 60 / r4.bpm / 4) - sn.at) * (r4.sr * 60 / r4.bpm / 4) <= 1.5, `the snare-up ran in the engine on step line − 16 (${sn ? sn.at - r4.at : 'never'}) on its sample`);
  ok(r4.drop && (r4.sec >= 0), 'the deck went through the jump and plays on (section ' + r4.sec + ')');
  ok(await F(() => !!window.__forge.meter.decks[0].playing), 'the deck kept playing'); await page.screenshot({ path: OUT + '/auto_move.png' });
  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await browser.close(); console.log(fails ? `${fails} failure(s)` : 'auto moves: all checks pass'); process.exit(fails ? 1 : 0); })();
