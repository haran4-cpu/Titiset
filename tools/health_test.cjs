// the black box works: play, act, force real glitches at the sound card (the engine overloaded on purpose through its shadow
// hook), suspend the audio behind the instrument's back — then save the Report and check it holds what a diagnosis needs:
// machine + engine, the glitch with the commands that preceded it, load samples, the command timeline, and the auto-resume.
// Usage: node tools/health_test.cjs [outdir]
const { chromium } = require('./lib/dep.cjs')('playwright'); const fs = require('fs');
const OUT = process.argv[2] || '.'; let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
(async () => { const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--enable-blink-features=AudioContextPlayoutStats'] }); const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:8765/test.html'); await page.waitForTimeout(500); await page.selectOption('#startGenre', 'techno'); await page.uncheck('#startAuto'); await page.click('#go');
  await page.waitForFunction(() => window.__forge.meter && window.__forge.meter.decks[0].playing, null, { timeout: 60000 }); await page.waitForTimeout(2500);
  const F = (fn, a) => page.evaluate(fn, a);
  ok(await F(() => !document.querySelector('#reportBtn').disabled), 'Report button enabled once audio runs');
  await F(() => window.__forge.loadDeck(1, 'deep-house', { play: false })); await page.waitForTimeout(1500);
  await F(() => window.__forge.A2.node.port.postMessage({ type: 'shadow', n: 60 })); await page.waitForTimeout(1500); await F(() => window.__forge.A2.node.port.postMessage({ type: 'shadow', n: 0 })); await page.waitForTimeout(1500);
  await F(() => window.__forge.A2.ctx.suspend()); await page.waitForTimeout(1200);
  ok(await F(() => window.__forge.A2.ctx.state === 'running'), 'audio suspended behind our back while playing → resumed');
  await page.waitForTimeout(2500);
  const dl = page.waitForEvent('download', { timeout: 8000 }); await page.click('#reportBtn'); const d = await dl; const file = OUT + '/' + d.suggestedFilename(); await d.saveAs(file);
  const R = JSON.parse(fs.readFileSync(file, 'utf8'));
  ok(/^forge-report-\d{4}-\d\d-\d\d-\d{4}\.json$/.test(d.suggestedFilename()), 'report file: ' + d.suggestedFilename() + ` (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);
  ok(R.env && R.env.engine === 'Live' && R.env.cores > 0 && R.env.sampleRate > 0 && /sound card/.test(R.env.glitchCounter), `machine + engine: ${R.env.engine}, ${R.env.cores} cores, ${R.env.sampleRate} Hz, base latency ${R.env.baseLatencyMs} ms, counter: ${R.env.glitchCounter}`);
  ok(R.summary.glitches > 0 && R.glitches.length > 0 && R.glitches[0].before.length > 0, `forced overload recorded: ${R.summary.glitches} glitches in ${R.glitches.length} events; first preceded by: ${(R.glitches[0] || { before: [] }).before.slice(-3).join(' · ')}`);
  ok(R.samples.length >= 3 && R.samples.every((s) => s.load != null), `${R.samples.length} load samples (every 2 s), worst load ${R.summary.worstLoad}`);
  ok(R.timeline.some((e) => e[1] === 'cmd:load') && R.timeline.some((e) => e[1] === 'audio' && e[2] === 'resumed'), `timeline: ${R.timeline.length} events incl. the deck load and the auto-resume`);
  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await browser.close(); console.log(fails ? `${fails} failure(s)` : 'health: all checks pass'); process.exit(fails ? 1 : 0); })();
