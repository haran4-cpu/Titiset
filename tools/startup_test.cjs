// the first seconds of a set: N fresh browser starts, each plays 25 s (a second track loaded and mixed in on the way) — the
// sound card's glitch count per start (Chrome playoutStats, counted from the moment audio starts).
// Usage: node tools/startup_test.cjs [runs=5] [--wasm=off]
const { chromium } = require('./lib/dep.cjs')('playwright'); const RUNS = +(process.argv.find((a) => /^\d+$/.test(a)) || 5), OFF = process.argv.includes('--wasm=off');
(async () => { const res = [];
  for (let r = 0; r < RUNS; r++) { const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--enable-blink-features=AudioContextPlayoutStats'] }); const p = await b.newPage();
    if (OFF) await p.addInitScript(() => localStorage.setItem('forge.wasm', 'off'));
    await p.goto('http://localhost:8765/test.html'); await p.waitForTimeout(400); await p.selectOption('#startGenre', ['trance', 'deep-house', 'dnb', 'techno', 'melodic-techno'][r % 5]); await p.uncheck('#startAuto'); await p.click('#go');
    await p.waitForFunction(() => window.__forge.meter && window.__forge.meter.decks[0].playing, null, { timeout: 60000 });
    // mix 2.5 s after the load starts, or as soon as deck B's score exists if the compile takes longer: mixInto returns silently while B has no score, so on a slow or busy
    // machine the old fixed 2.5 s left the "mixed in on the way" half of this measurement out
    await p.waitForTimeout(3000); await p.evaluate(() => { const f = window.__forge; Promise.all([f.loadDeck(1, 'progressive-house', { play: false }), new Promise((r) => setTimeout(r, 2500))]).then(() => f.mixInto(1)); });
    await p.waitForTimeout(22000); res.push(await p.evaluate(() => window.__forge.A2.under || 0)); await b.close(); }
  console.log(`${OFF ? 'JS voices' : 'WASM voices'}: glitches per start over the first 25 s: ${res.join(', ')} (total ${res.reduce((a, b) => a + b, 0)} in ${RUNS} starts)`);
  // a start counts as glitched when it has any dropout; the run fails when more than half of the starts glitched
  const bad = res.filter((x) => x > 0).length, fail = bad * 2 > res.length; console.log(fail ? `✗ more than half of the starts glitched (${bad} of ${RUNS})` : `✓ at most half of the starts glitched (${bad} of ${RUNS})`); process.exit(fail ? 1 : 0); })();
