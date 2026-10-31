// the busy points of a live set, measured on the sound card (Chrome playoutStats): a set plays on deck A while the things that
// load the machine happen — a new track composed and analysed on deck B, the mix (both decks), a WAV export of the playing track,
// ear-candy pads hammered, and the page's own work. Each phase counts the sound card's glitches. Run it with CPU hogs
// (--hogs=N) to stand in for a weak or busy laptop; --unpaced runs the export with the worker's pacing off (the v8 behaviour)
// for an A/B of the pacing alone.
// --android: the page sees an Android phone (v9.1: every engine choice there is the Stable engine, rendered ahead); then the
// player's own dry-runs are counted next to the sound card's glitches.
// Usage: node tools/busy_test.cjs [engine=live|safe|fast] [--hogs=N] [--unpaced] [--runs=N] [--android]
const { chromium } = require('./lib/dep.cjs')('playwright'); const { spawn } = require('child_process'), os = require('os');
const args = process.argv.slice(2), ENG = (args.find((a) => /^(live|safe|fast)$/.test(a)) || 'live'), HOGS = +((args.find((a) => a.startsWith('--hogs=')) || '--hogs=0').slice(7)), UNPACED = args.includes('--unpaced'), RUNS = +((args.find((a) => a.startsWith('--runs=')) || '--runs=1').slice(7));
const hogs = []; for (let k = 0; k < HOGS; k++) hogs.push(spawn(process.execPath, ['-e', 'for(;;){}'], { stdio: 'ignore' })); process.on('exit', () => hogs.forEach((h) => h.kill()));
(async () => { const total = {};
  for (let run = 0; run < RUNS; run++) { const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--enable-blink-features=AudioContextPlayoutStats'] }); const AND = args.includes('--android'); const p = await b.newPage(AND ? { acceptDownloads: true, viewport: { width: 412, height: 915 }, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36', hasTouch: true, isMobile: true } : { acceptDownloads: true });
    await p.addInitScript((e) => { localStorage.setItem('forge.engine2', e); }, ENG); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('http://localhost:8765/test.html'); await p.waitForTimeout(400); await p.selectOption('#startGenre', 'psytrance'); await p.uncheck('#startAuto'); await p.click('#go');
    await p.waitForFunction(() => window.__forge.meter && window.__forge.meter.decks[0].playing, null, { timeout: 60000 }); await p.waitForTimeout(4000);
    // glitch events: the sound card's (playoutStats) plus, on the Stable engine, the render-ahead player running dry
    const G = () => p.evaluate(() => { const A = window.__forge.A2, ps = A.ctx && A.ctx.playoutStats ? A.ctx.playoutStats.fallbackFramesEvents : 0; return A.worker ? ps + (A.under || 0) : (A.under || 0); }); const phases = [];
    const phase = async (name, fn, settle) => { const g0 = await G(); await fn(); await p.waitForTimeout(settle); const g1 = await G(); phases.push([name, g1 - g0]); total[name] = (total[name] || 0) + g1 - g0; };
    await phase('steady play (8 s)', async () => {}, 8000);
    await phase('new track composed + analysed on B', () => p.evaluate(() => window.__forge.loadDeck(1, 'prog-psy', { play: false })), 6000);
    await phase('mix: both decks (12 s)', () => p.evaluate(() => window.__forge.mixInto(1, 16)), 12000);
    if (UNPACED) await p.evaluate(() => { for (const w of [window.__forge.workers.composerW, window.__forge.workers.analyser]) if (w) w.postMessage({ type: 'pace', work: 1e9, rest: 0 }); });
    await phase(`WAV export while playing${UNPACED ? ' (UNPACED)' : ''}`, () => p.evaluate(() => { window.__exp = window.__forge.exportTrack(window.__forge.decks[0].playing ? 0 : 1, false); }), 2000);
    await p.waitForFunction(() => window.__exp && window.__exp.then, null, { timeout: 5000 }).catch(() => {}); const t0 = Date.now(); const g0 = await G();
    await p.evaluate(() => window.__exp).catch(() => {}); const g1 = await G(); phases[phases.length - 1][1] += g1 - g0; total[phases[phases.length - 1][0]] += g1 - g0; const expS = ((Date.now() - t0) / 1000).toFixed(1);
    await phase('ear-candy pads ×24 (6 s)', () => p.evaluate(async () => { for (let k = 0; k < 24; k++) { window.__forge.perf.earCandy(window.__forge.meter.lead, k % 6); await new Promise((r) => setTimeout(r, 250)); } }), 1000);
    const pace = await p.evaluate(() => window.__forge.A2.pace || 'normal'), eng = await p.evaluate(() => window.__forge.A.mode + ' · ' + Math.round(window.__forge.A.lat || 0) + ' ms');
    console.log(`run ${run + 1} · ${eng} · ${HOGS} hog(s) on ${os.cpus().length} core(s) · export ${expS} s · pace after: ${pace}`); for (const [n, g] of phases) console.log(`   ${String(g).padStart(4)} glitch events  ${n}`);
    if (errs.length) console.log('   page errors:', errs.slice(0, 2).join(' | ')); await b.close(); }
  const sum = Object.values(total).reduce((a, b) => a + b, 0); console.log(`total glitch events over ${RUNS} run(s): ${sum}`); hogs.forEach((h) => h.kill()); process.exit(0); })();
