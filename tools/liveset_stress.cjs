// a live set on a WEAK machine: the browser shares its 2 cores with busy processes (as a cheap laptop with other apps running,
// or a laptop on battery), and a performer works the instrument for minutes — loads, mixes, new parts, sound swaps, fills, FX,
// macros, jumps, the editor open. Every action is logged with the dropouts (player underruns) that followed it, the slowest
// engine command, the longest time the engine thread waited to be scheduled, and main-thread long tasks.
// Pass: 0 dropouts, and no main-thread task over 100 ms (the screen never freezes noticeably while playing).
// (actions return nothing to the harness: serialising a returned score inside the page would itself be a long task)
// Usage: node tools/liveset_stress.cjs [hogs=2] [seconds=150] [--report]
const { chromium } = require('./lib/dep.cjs')('playwright'); const { spawn } = require('child_process');
const args = process.argv.slice(2).filter((a) => !a.startsWith('--')), HOGS = +(args[0] ?? 2), SECS = +(args[1] || 150);
const hogs = []; for (let k = 0; k < HOGS; k++) hogs.push(spawn(process.execPath, ['-e', 'for(;;){}'], { stdio: 'ignore' }));
const stop = () => hogs.forEach((h) => { try { h.kill('SIGKILL'); } catch (e) { /* gone */ } }); process.on('exit', stop);
(async () => { const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--enable-blink-features=AudioContextPlayoutStats'] }); const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const opt = (k) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : null; };
  const ENG = opt('engine'), LAT = opt('latency'), SLOW = +(opt('slow') || 1);
  await page.addInitScript(([e, l]) => { try { if (e) localStorage.setItem('forge.engine2', e); if (l) localStorage.setItem('forge.latency', l); } catch (x) { /* none */ } }, [ENG, LAT]);
  await page.goto('http://localhost:8765/test.html'); await page.waitForTimeout(500); await page.selectOption('#startGenre', 'deep-house'); await page.uncheck('#startAuto'); await page.click('#go');
  await page.waitForFunction(() => window.__forge.meter && window.__forge.meter.decks[0].playing, null, { timeout: 60000 }).catch(() => {});
  const F = (fn, a) => page.evaluate(fn, a);
  await F(() => { window.__lt = []; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)); }).observe({ entryTypes: ['longtask'] }); } catch (e) { /* no longtask API */ } });
  if (SLOW > 1) await F((n) => { const A = window.__forge.A2; if (A.worker) A.worker.postMessage({ type: 'shadow', n }); else A.node.port.postMessage({ type: 'shadow', n }); }, SLOW - 1); // emulate a CPU SLOW× slower (see the engine's shadow hook)
  const lat0 = await F(() => { const ps = window.__forge.A2.ctx.playoutStats; return ps ? ps.averageLatency : -1; });
  await page.waitForTimeout(5000); await F(() => window.__forge.A2.worker && window.__forge.A2.worker.postMessage({ type: 'diag' }));
  const T = (name) => F((n) => { const t = window.__forge.midi.targets()[n]; return !!t; }, name);
  const act = { // what a performer does, through the same entry points as the controller / pads / editor
    'load B (techno)': () => F(() => { window.__forge.loadDeck(1, 'techno', { play: false }); }),
    'mix B in': () => F(() => { window.__forge.mixInto(1); }),
    'load A (trance)': () => F(() => { window.__forge.loadDeck(0, 'trance', { play: false }); }),
    'mix A in': () => F(() => { window.__forge.mixInto(0); }),
    'new chords (live deck)': () => F(() => { const i = window.__forge.decks[0].playing && !window.__forge.decks[1].playing ? 0 : 1; window.__forge.midi.targets()[`${'AB'[i]}.new.chords`].press(); }),
    'new drums': () => F(() => { const i = window.__forge.decks[0].playing ? 0 : 1; window.__forge.midi.targets()[`${'AB'[i]}.new.drums`].press(); }),
    'new bass': () => F(() => { const i = window.__forge.decks[0].playing ? 0 : 1; window.__forge.midi.targets()[`${'AB'[i]}.new.bass`].press(); }),
    'new melody': () => F(() => { const i = window.__forge.decks[0].playing ? 0 : 1; window.__forge.midi.targets()[`${'AB'[i]}.new.lead`].press(); }),
    'reroll': () => F(() => { window.__forge.reroll(window.__forge.decks[0].playing ? 0 : 1); }),
    'jump to next section': () => F(() => { const i = window.__forge.decks[0].playing ? 0 : 1, D = window.__forge.decks[i]; window.__forge.jumpTo(i, Math.min(D.score.sections.length - 1, (D.sec || 0) + 1)); }),
    'FX hold (swirl, echo, repeat)': async () => { for (const fx of ['swirl', 'echo', 'repeat']) { await F((n) => { const i = window.__forge.decks[0].playing ? 0 : 1, t = window.__forge.midi.targets()[`${'AB'[i]}.fx.${n}.hold`]; if (t) t.down(); }, fx); await page.waitForTimeout(700); await F((n) => { const i = window.__forge.decks[0].playing ? 0 : 1, t = window.__forge.midi.targets()[`${'AB'[i]}.fx.${n}.hold`]; if (t) t.up(); }, fx); } },
    'fills (roll, toms)': async () => { for (const k of ['roll', 'toms']) { await F((n) => { const t = window.__forge.midi.targets()[`A.fill.${n}`] || window.__forge.midi.targets()[`fill.${n}`]; if (t && t.down) t.down(); else if (t && t.press) t.press(); }, k); await page.waitForTimeout(900); await F((n) => { const t = window.__forge.midi.targets()[`A.fill.${n}`] || window.__forge.midi.targets()[`fill.${n}`]; if (t && t.up) t.up(); }, k); } },
    'sound swap (chords preset)': () => F(() => { const i = window.__forge.decks[0].playing ? 0 : 1, D = window.__forge.decks[i]; const bank = Object.keys(window.__forge.compileSpec ? {} : {}); D.spec.sound = Object.assign({}, D.spec.sound, { chords: { preset: ['glass-stab', 'dub-chord', 'organ-keys', 'warm-ep'][Math.floor(Math.random() * 4)] } }); try { window.__forge.commitSpec(i, { q: 4 }); } catch (e) { /* preset name may not exist: the next step covers it */ } }),
    'macro sweep (stab filter)': async () => { for (let k = 0; k <= 10; k++) { await F((v) => { const t = Object.entries(window.__forge.midi.targets()).find(([n]) => /macro\.stabCut/.test(n)); if (t && t[1].set) t[1].set(v); }, k / 10); await page.waitForTimeout(60); } },
    'editor: open dock tabs': async () => { for (const tab of ['chords', 'bass', 'lead', 'drums']) { await page.click(`[data-tab="${tab}"]`).catch(() => {}); await page.waitForTimeout(250); } },
  };
  const names = Object.keys(act), log = []; let under0 = await F(() => { const A = window.__forge.A2, ps = A.ctx && A.ctx.playoutStats; return (A.under || 0) + (ps ? ps.fallbackFramesEvents : 0); }); const t0 = Date.now(); let k = 0;
  while (Date.now() - t0 < SECS * 1000) { const name = names[k++ % names.length]; const a0 = Date.now(); await act[name]().catch((e) => log.push({ name, err: e.message }));
    await page.waitForTimeout(3500); const m = await F(() => { const A = window.__forge.A2, M = window.__forge.meter || {}, ps = A.ctx && A.ctx.playoutStats; const lt = window.__lt.splice(0); return { under: (A.under || 0) + (ps ? ps.fallbackFramesEvents : 0), dev: ps ? ps.fallbackFramesEvents : -1, lead: A.leadF, cmdMax: M.cmdMax, cmdName: M.cmdName, gapMax: M.gapMax, rndMax: M.rndMax, lt: lt.length ? Math.max(...lt) : 0, load: M.load, playing: [0, 1].map((i) => window.__forge.decks[i].playing) }; });
    await F(() => window.__forge.A2.worker && window.__forge.A2.worker.postMessage({ type: 'diag' }));
    log.push({ name, t: ((a0 - t0) / 1000).toFixed(0), drop: m.under - under0, dev: m.dev, lead: Math.round(m.lead / 44.1), cmd: `${m.cmdName} ${(m.cmdMax || 0).toFixed(0)}ms`, gap: Math.round(m.gapMax || 0), rnd: (m.rndMax || 0).toFixed(1), lt: m.lt, load: ((m.load || 0) * 100).toFixed(0) }); under0 = m.under; }
  for (const l of log) console.log(l.err ? `  ${l.name}: ERROR ${l.err}` : `${String(l.t).padStart(4)}s ${l.drop ? '✗' : '✓'} ${l.name.padEnd(30)} glitches ${l.drop} (card total ${l.dev})  buffer ${l.lead} ms  slowest cmd ${l.cmd.padEnd(14)} worker wait ${String(l.gap).padStart(4)} ms  chunk ${l.rnd} ms  main long task ${l.lt} ms  load ${l.load} %`);
  const drops = log.reduce((s, l) => s + (l.drop || 0), 0);
  console.log(`\nengine ${await F(() => window.__forge.A2.mode)} · latency hint ${LAT || 'default'} · output latency ${await F(() => { const c = window.__forge.A2.ctx, ps = c.playoutStats; return (ps ? ps.averageLatency.toFixed(0) : '?') + ' ms (base ' + (c.baseLatency * 1000).toFixed(0) + ')'; })} · CPU emulated ${SLOW}× slower · ${HOGS} busy processes on ${require('os').cpus().length} cores · ${SECS} s · ${log.length} actions · dropouts ${drops} · page errors ${errors.length}${errors.length ? ': ' + errors.slice(0, 2).join(' | ') : ''}`);
  if (process.argv.includes('--why')) { const H = await F(() => { const H = window.__forge.health.HEALTH; return { g: H.glitches, slow: H.ev.filter((e) => e[1] === 'slow') }; });
    const hist = {}; for (const e of H.slow) { const k = e[2].replace(/ \d+ ms$/, ''), ms = +e[2].match(/(\d+) ms$/)[1]; (hist[k] = hist[k] || []).push(ms); }
    console.log('slow audio-thread calls (≥5 ms render, ≥2 ms command):'); for (const [k, v] of Object.entries(hist).sort((a, b) => b[1].length - a[1].length)) console.log(`  ${k.padEnd(28)} ×${v.length}  max ${Math.max(...v)} ms`);
    console.log('glitches and what preceded them:'); for (const g of H.g) console.log(`  @${(g.t / 1000).toFixed(1)} s  ${g.n}  load ${g.load}  ← ${g.before.slice(-4).join(' · ')}`); }
  await browser.close(); stop(); const ltMax = Math.max(0, ...log.map((l) => l.lt || 0)); console.log(`longest main-thread task ${ltMax} ms`); process.exit(drops || errors.length || ltMax > 100 ? 1 : 0); })();
