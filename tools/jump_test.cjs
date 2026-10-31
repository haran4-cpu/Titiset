// jumps on air: hot-cue / section jumps every few seconds on the playing deck (as a performer does), each landing on the next
// bar line; the black box records every slow audio-thread call (render ≥ 5 ms, gap far beyond the device rhythm) and the sound
// card's glitch count around each landing. Usage: node tools/jump_test.cjs [jumps=12]
const { chromium } = require('./lib/dep.cjs')('playwright'); const N = +(process.argv[2] || 12);
(async () => { const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--enable-blink-features=AudioContextPlayoutStats'] }); const p = await b.newPage();
  const errors = []; p.on('pageerror', (e) => errors.push(e.message));
  await p.goto('http://localhost:8765/test.html'); await p.waitForTimeout(400); await p.selectOption('#startGenre', 'tech-house'); await p.uncheck('#startAuto'); await p.click('#go');
  await p.waitForFunction(() => window.__forge.meter && window.__forge.meter.decks[0].playing, null, { timeout: 60000 }); await p.waitForTimeout(4000);
  let bad = 0; const rows = [];
  for (let k = 0; k < N; k++) { const r = await p.evaluate(async (k) => { const f = window.__forge, D = f.decks[0], H = f.health.HEALTH; const u0 = f.A2.under || 0, n0 = H.ev.length;
      const secs = D.score.sections, to = k % 2 ? 0 : Math.min(secs.length - 1, 2 + (k % 4)); f.jumpTo(0, to); const at = D.pendJump; const t0 = performance.now();
      await new Promise((res) => { const w = () => { if (f.decks[0].pos >= at + 8 || performance.now() - t0 > 12000) res(); else setTimeout(w, 100); }; w(); }); await new Promise((res) => setTimeout(res, 600));
      const ev = H.ev.slice(n0).filter((e) => e[1] === 'slow').map((e) => e[2]); return { k, to, glitches: (f.A2.under || 0) - u0, slow: ev, wait: Math.round(performance.now() - t0) }; }, k);
    if (r.glitches) bad++; rows.push(r); console.log(`jump ${k + 1} → section ${r.to}: ${r.glitches} glitches · slow audio calls: ${r.slow.join(', ') || 'none'}`); }
  console.log(`${bad} of ${N} jumps glitched${errors.length ? ' · page errors: ' + errors[0] : ''}`); await b.close(); process.exit(bad ? 1 : 0); })();
