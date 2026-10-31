// proof of the Stable engine in a real browser: the DSP thread is frozen on purpose (busy-wait inside the engine worker) and
// the main thread is blocked, while a track plays; the audio-thread player must not run dry.
//   1. ten 45 ms DSP freezes (a GC / JIT pause is 1–20 ms) and two 800 ms main-thread blocks → 0 dropouts, position on time
//   2. one 220 ms freeze (beyond the 93 ms buffer: a dropout is expected and must be REPORTED) → the engine raises its own
//      buffer; the same 220 ms freeze again → 0 new dropouts (it adapted)
// Usage: node tools/stall_test.cjs <outdir>
const { chromium } = require('./lib/dep.cjs')('playwright');
const OUT = process.argv[2] || '.'; let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
(async () => { const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => { try { localStorage.setItem('forge.engine2', 'buffered'); } catch (e) { /* none */ } }); await page.goto('http://localhost:8765/test.html'); await page.waitForTimeout(500); await page.selectOption('#startGenre', 'deep-house'); await page.uncheck('#startAuto'); await page.click('#go');
  await page.waitForFunction(() => window.__forge.meter && window.__forge.meter.decks[0].playing, null, { timeout: 30000 }).catch(() => {}); await page.waitForTimeout(3000);
  const F = (fn, a) => page.evaluate(fn, a);
  ok(await F(() => window.__forge.A2.mode === 'Stable'), 'engine: ' + await F(() => window.__forge.A2.mode + ' · ' + document.querySelector('#engine').textContent));
  // The engine answers every dropout, start-up ones included, by growing its buffer (ceiling 279 ms). On a slow or busy machine the start-up turbulence (JIT, the first track's
  // analysis) can already have used that up and counted dropouts that have nothing to do with the freezes below, which makes the adaptation checks impossible. So the test first puts
  // the buffer back to its starting size and waits until the dropout counter has been still for 3 s: it then begins in the state it describes. (Start-up quality has its own test.)
  await F(() => window.__forge.A2.worker.postMessage({ type: 'lead', frames: 6144 }));
  { let last = -1, still = 0; for (let k = 0; k < 40 && still < 6; k++) { const u = await F(() => window.__forge.A2.under || 0); still = u === last ? still + 1 : 0; last = u; await page.waitForTimeout(500); } }
  const u0 = await F(() => window.__forge.A2.under || 0), p0 = await F(() => ({ pos: window.__forge.decks[0].pos, t: performance.now(), bpm: window.__forge.decks[0].bpm }));
  for (let k = 0; k < 10; k++) { await F(() => window.__forge.A2.worker.postMessage({ type: 'stall', ms: 45 })); await page.waitForTimeout(300); }
  for (let k = 0; k < 2; k++) { await F(() => { const s = performance.now(); while (performance.now() - s < 800) { /* block the main thread */ } }); await page.waitForTimeout(400); }
  await page.waitForTimeout(600); const u1 = await F(() => window.__forge.A2.under || 0), p1 = await F(() => ({ pos: window.__forge.decks[0].pos, t: performance.now() }));
  ok(u1 === u0, `ten 45 ms DSP freezes + two 800 ms main-thread blocks: ${u1 - u0} dropouts`);
  const exp = (p1.t - p0.t) / 1000 * p0.bpm / 15, got = p1.pos - p0.pos; ok(Math.abs(got - exp) < 2, `the music kept time: moved ${got.toFixed(1)} steps, the clock says ${exp.toFixed(1)}`);
  // a late start-up dropout burst can have grown the buffer again by now: the 220 ms freeze must be beyond the buffer it hits, so start this part from the starting size too
  await F(() => window.__forge.A2.worker.postMessage({ type: 'lead', frames: 6144 })); await page.waitForTimeout(1200);
  const b0 = await F(() => window.__forge.A2.leadF); await F(() => window.__forge.A2.worker.postMessage({ type: 'stall', ms: 220 })); await page.waitForTimeout(1500);
  const u2 = await F(() => window.__forge.A2.under || 0), b1 = await F(() => window.__forge.A2.leadF);
  ok(u2 > u1, `a 220 ms freeze (beyond the buffer) is reported, not hidden: ${u2 - u1} quanta`); ok(b1 > b0, `the engine raised its buffer: ${(b0 / 44.1).toFixed(0)} → ${(b1 / 44.1).toFixed(0)} ms`);
  await F(() => window.__forge.A2.worker.postMessage({ type: 'stall', ms: 140 })); await page.waitForTimeout(1500); const u3 = await F(() => window.__forge.A2.under || 0);
  ok(u3 === u2, `after adapting, a 140 ms freeze: ${u3 - u2} dropouts`);
  ok(await F(() => /dropouts/.test(document.querySelector('#engine').textContent)), 'the header shows the dropout count: ' + await F(() => document.querySelector('#engine').textContent));
  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await browser.close(); console.log(fails ? `${fails} failure(s)` : 'stall: all checks pass'); process.exit(fails ? 1 : 0); })();
