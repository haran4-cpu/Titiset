// offline: every request that is not the page itself is refused (no fonts, no CDN, no network at all) — the app must start,
// play, mix, take Ask-bar words and run Auto exactly as online. Usage: node tools/offline_test.cjs
const { chromium } = require('./lib/dep.cjs')('playwright'); let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
(async () => { const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const ctx = await browser.newContext(); const blocked = [];
  await ctx.route('**/*', (r) => { const u = r.request().url(); if (u.startsWith('http://localhost:8765/')) return r.continue(); blocked.push(u); return r.abort(); });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:8765/test.html'); await page.waitForTimeout(500); await page.selectOption('#startGenre', 'deep-house'); await page.uncheck('#startAuto'); await page.click('#go'); await page.waitForFunction(() => window.__forge.meter && window.__forge.meter.decks[0].playing && window.__forge.meter.lufsS > -30, null, { timeout: 15000 }).catch(() => {});
  const F = (fn) => page.evaluate(fn); const m = await F(() => ({ playing: window.__forge.meter && window.__forge.meter.decks[0].playing, mode: window.__forge.A2.mode, lufs: window.__forge.meter && window.__forge.meter.lufsS }));
  ok(m.playing && m.lufs > -30, `plays offline (${m.mode}, ${m.lufs.toFixed(1)} LUFS short-term)`);
  await page.fill('#askIn', 'dark melodic techno'); await page.press('#askIn', 'Enter'); await page.waitForFunction(() => window.__forge.decks[1].score && window.__forge.decks[1].score.meta.gid === 'melodic-techno' && !!window.__forge.tx, null, { timeout: 20000, polling: 25 }).catch(() => {}); // deck B: 0.3 s idle, 1.4–1.8 s on a busy 2-core VM — not a fixed 1.5 s
  ok(await F(() => window.__forge.decks[1].score && window.__forge.decks[1].score.meta.gid === 'melodic-techno' && !!window.__forge.tx), 'Ask bar offline: a new track loads and mixes in');
  await page.$eval('.deck[data-d="0"] [data-autoall]', (b) => b.scrollIntoView({ block: 'center' })); await page.click('.deck[data-d="0"] [data-autoall]'); ok(await F(() => window.__forge.auto.autoOf(window.__forge.decks[0]).on.harmony), 'Auto switches on offline');
  await page.waitForFunction(() => window.__forge.decks[0].trim != null, null, { timeout: 60000 }).catch(() => {}); ok(await F(() => window.__forge.decks[0].trim != null), 'loudness analysis worker ran offline'); // ~4.7 s idle, ~15 s on a busy 2-core VM; the check is only that the worker ran with no network, so the wait is long
  ok(!errors.length, `no page errors (${blocked.length} outside requests refused: ${[...new Set(blocked.map((u) => new URL(u).host))].join(', ') || 'none'})`);
  await browser.close(); console.log(fails ? `${fails} failure(s)` : 'offline: all checks pass'); process.exit(fails ? 1 : 0); })();
