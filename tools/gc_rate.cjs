// garbage collections on the AUDIO THREAD, measured in Chromium itself (V8's own --trace-gc): 60 s of the Live engine playing
// a two-deck mix. Reports, for the isolate that collects most (the audio worklet's), scavenges per second and the longest pause.
// Usage: node tools/gc_rate.cjs [seconds=60]
const { chromium } = require('./lib/dep.cjs')('playwright'); const SECS = +(process.argv[2] || 60);
if (!process.env.GC_CHILD) { // run itself with Playwright's browser log on (V8 prints its GC trace to the browser's stdout), then parse that
  const r = require('child_process').spawnSync(process.execPath, [__filename, String(SECS)], { env: Object.assign({}, process.env, { GC_CHILD: '1', DEBUG: 'pw:browser' }), encoding: 'utf8', maxBuffer: 1 << 28 });
  const all = (r.stdout || '') + (r.stderr || ''), mark = all.indexOf('@@START@@'); const L = all.slice(mark < 0 ? 0 : mark).split('\n');
  const by = {}; for (const l of L) { const m = l.match(/\[(\d+:0x[0-9a-f]+)\]\s+(\d+) ms: (Scavenge|Mark-Compact|Minor Mark-Sweep)[^,]*,(?: pooled: [0-9.]+ MB,)? ([0-9.]+) \/ ([0-9.]+) ms/); if (!m) continue; const k = m[1]; const o = by[k] || (by[k] = { n: 0, max: 0, mc: 0, sum: 0 }); o.n++; o.sum += +m[4]; if (+m[4] > o.max) o.max = +m[4]; if (m[3] === 'Mark-Compact') o.mc++; }
  const rows = Object.entries(by).sort((a, b) => b[1].n - a[1].n); for (const [k, o] of rows) console.log(`isolate ${k}: ${(o.n / SECS).toFixed(1)} GCs/s (${o.mc} full) · longest pause ${o.max.toFixed(1)} ms · total ${(o.sum / SECS).toFixed(1)} ms/s`);
  const w = rows[0] && rows[0][1]; console.log(w ? `audio thread (the isolate collecting most): ${(w.n / SECS).toFixed(1)} GCs/s, longest pause ${w.max.toFixed(1)} ms, ${(w.sum / SECS).toFixed(1)} ms of pauses per second` : 'no GC lines captured'); process.exit(0); }
(async () => { const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--js-flags=--trace-gc'] });
  const page = await browser.newPage(); await page.goto('http://localhost:8765/test.html'); await page.waitForTimeout(400); await page.selectOption('#startGenre', 'trance'); await page.uncheck('#startAuto'); await page.click('#go');
  await page.waitForFunction(() => window.__forge.meter && window.__forge.meter.decks[0].playing, null, { timeout: 60000 }); await page.waitForTimeout(3000); console.error('@@START@@');
  await page.evaluate(() => { window.__forge.loadDeck(1, 'techno', { play: false }); setTimeout(() => window.__forge.mixInto(1), 2000); });
  await page.waitForTimeout(SECS * 1000); await browser.close(); })();
