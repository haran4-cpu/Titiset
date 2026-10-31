// A SET, PLAYED THE WAY A PERSON PLAYS IT, measured for continuity: the start card exactly as it opens (a genre, Auto-DJ as set,
// the engine the card offers), then minutes of hands-off playing while Auto-DJ composes, analyses and mixes the next tracks.
// Every 250 ms: the sound card's glitch counter (Chrome playoutStats), each deck's position, section, tempo and the mix.
// Afterwards:
//   glitches       — sound-card underruns, when and next to what (what the engine was doing, which command came just before)
//   transport      — every place where a deck's position did not advance as its tempo says (a jump the listener hears), and
//                    whether a command explains it (a jump, a loop, a load) or nothing does
//   commands       — what the page sent the engine, by kind and per minute (how busy Auto is)
//   page           — main-thread long tasks
// --android: the page sees an Android phone's user agent (and touch), so it picks the engine it picks there (v9.1: the Stable
// engine, rendered ahead, on a low-latency context); its own underrun counter is reported next to the sound card's.
// --slow=N runs the engine N times per block (the extra N−1 copies are shadows: same commands, output discarded), i.e. the
// audio thread of a machine N times slower than this one. --hogs=N adds busy processes.
// Usage: node tools/session_test.cjs [genre=psytrance] [minutes=5] [--engine=safe|live|fast|buffered] [--slow=N] [--no-auto]
//        [--hogs=N] [--throttle=N (DevTools CPU throttling of the page)] [--no-worklet] [--android] [--out=file.json] [--url=http://localhost:8765/test.html]
const { chromium } = require('./lib/dep.cjs')('playwright'); const { spawn } = require('child_process'), fs = require('fs');
const argv = process.argv.slice(2), pos = argv.filter((a) => !a.startsWith('--')), opt = (k, d) => { const a = argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : d; };
const GENRE = pos[0] || 'psytrance', MIN = +(pos[1] || 5), ENG = opt('engine', 'safe'), SLOW = +opt('slow', 1), HOGS = +opt('hogs', 0), AUTO = !argv.includes('--no-auto'), OUTF = opt('out', ''), URL = opt('url', 'http://localhost:8765/test.html');
const hogs = []; for (let k = 0; k < HOGS; k++) hogs.push(spawn(process.execPath, ['-e', 'for(;;){}'], { stdio: 'ignore' })); const stop = () => hogs.forEach((h) => { try { h.kill('SIGKILL'); } catch (e) { /* gone */ } }); process.on('exit', stop);
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--enable-blink-features=AudioContextPlayoutStats'] });
  const ANDROID = argv.includes('--android'); const page = await browser.newPage(ANDROID ? { viewport: { width: 412, height: 915 }, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36', hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1440, height: 1000 } }); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript((e) => { try { localStorage.setItem('forge.engine2', e); } catch (x) { /* none */ } }, ENG);
  if (argv.includes('--no-worklet')) await page.addInitScript(() => { Object.defineProperty(BaseAudioContext.prototype, 'audioWorklet', { get() { return undefined; } }); }); // a browser or page without AudioWorklet (an insecure http address, an in-app browser)
  const THR = +opt('throttle', 1); // DevTools CPU throttling of the page (main thread)
  if (THR > 1) { const cdp = await page.context().newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: THR }); }
  await page.goto(URL); await page.waitForTimeout(600);
  await page.selectOption('#startGenre', GENRE); if (AUTO) await page.check('#startAuto'); else await page.uncheck('#startAuto');
  if (await page.$('#startEngine')) await page.selectOption('#startEngine', ENG).catch(() => {});
  await page.evaluate(() => { const S = window.__S = { t0: 0, m: [], c: [], lt: [] };
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) S.lt.push([Math.round(performance.now() - S.t0), Math.round(e.duration)]); }).observe({ entryTypes: ['longtask'] }); } catch (e) { /* no API */ } });
  await page.click('#go'); const tClick = Date.now();
  await page.waitForFunction(() => window.__forge.meter && window.__forge.meter.decks.some((d) => d.playing), null, { timeout: 90000 }).catch(() => {});
  const startMs = Date.now() - tClick;
  if (SLOW > 1) await page.evaluate((n) => { const A = window.__forge.A2; if (A.worker) A.worker.postMessage({ type: 'shadow', n }); else if (A.node) A.node.port.postMessage({ type: 'shadow', n }); }, SLOW - 1);
  await page.evaluate(() => { const S = window.__S, A = window.__forge.A2; S.t0 = performance.now(); const ps = () => (A.ctx && A.ctx.playoutStats ? A.ctx.playoutStats.fallbackFramesEvents : 0); S.ps0 = ps();
    const prevTap = A.tap; A.tap = (m) => { if (prevTap) prevTap(m); if (m.type === 'meter' && m.decks) { const t = performance.now() - S.t0; if (!S.lastM || t - S.lastM >= 240) { S.lastM = t; S.m.push([Math.round(t), ps() - S.ps0, m.decks.map((d) => [Math.round(d.pos * 100) / 100, d.bpm, d.playing ? 1 : 0, d.sec, d.ended ? 1 : 0]), m.tx ? [m.tx.a, m.tx.b, Math.round(m.tx.u * 100) / 100] : null, Math.round((m.load || 0) * 100), m.eco || 0, Math.round(m.blkMax || 0), m.under || 0, m.ahead || 0, m.bufF || 0, m.dry || 0]); } } };
    const prevSend = A.sendTap; A.sendTap = (m) => { if (prevSend) prevSend(m); const t = Math.round(performance.now() - S.t0); const k = m.type === 'at' ? 'at:' + (m.list || []).map((x) => x.type).join('+') : m.type === 'batch' ? 'batch:' + (m.list || []).map((x) => x.type).join('+') : m.type; S.c.push([t, k, m.deck != null ? m.deck : -1]); }; });
  const T = MIN * 60000; let last = 0; const t0 = Date.now();
  while (Date.now() - t0 < T) { await page.waitForTimeout(5000); const g = await page.evaluate(() => { const S = window.__S; return S.m.length ? S.m[S.m.length - 1][1] : 0; }); if (g !== last) { process.stdout.write(`  ${Math.round((Date.now() - t0) / 1000)}s glitches ${g}\n`); last = g; } }
  const S = await page.evaluate(() => { const S = window.__S, A = window.__forge.A2, H = window.__forge.health.HEALTH; return { m: S.m, c: S.c, lt: S.lt, mode: A.mode, lat: A.lat, sr: A.ctx ? A.ctx.sampleRate : 0, base: A.ctx ? A.ctx.baseLatency : 0, out: A.ctx ? A.ctx.outputLatency : 0, slow: (H.ev || []).filter((e) => e[1] === 'slow').slice(-60), titles: window.__forge.decks.map((D) => D.score ? D.score.meta.gid + ' ' + D.score.meta.bpm : '') }; });
  await browser.close(); stop();
  // ---- analysis
  const rep = { genre: GENRE, minutes: MIN, engine: S.mode, slow: SLOW, hogs: HOGS, auto: AUTO, android: ANDROID, startMs, latencyMs: Math.round(S.lat), glitches: 0, glitchTimes: [], under: 0, underTimes: [], minAheadMs: null, leadMs: 0, jumps: [], cmds: {}, cmdsPerMin: 0, longTasks: S.lt.length, longestTask: Math.max(0, ...S.lt.map((x) => x[1])), errors: errors.slice(0, 5), slow: S.slow, maxLoad: 0, eco: 0, ecoMax: 0 };
  let prev = null; for (const r of S.m) { const [t, g] = r; if (prev && g > prev[1]) rep.glitchTimes.push([+(t / 1000).toFixed(1), g - prev[1]]); if (prev && r[7] > prev[7]) rep.underTimes.push([+(t / 1000).toFixed(1), r[7] - prev[7]]); rep.maxLoad = Math.max(rep.maxLoad, r[4]); if (r[5]) rep.eco++; rep.ecoMax = Math.max(rep.ecoMax, r[5]); if (r[9] && t > 15000) { const a = r[8] / (S.sr || 48000) * 1000; rep.minAheadMs = rep.minAheadMs == null ? a : Math.min(rep.minAheadMs, a); rep.leadMs = r[9] / (S.sr || 48000) * 1000; } prev = r; }
  rep.under = S.m.length ? S.m[S.m.length - 1][7] : 0; rep.dryMs = S.m.length ? Math.round(S.m[S.m.length - 1][10] / (S.sr || 48000) * 1000) : 0;
  rep.glitches = S.m.length ? S.m[S.m.length - 1][1] : 0;
  // transport: a playing deck must advance bpm/15 steps per second; anything else is a jump (or a stall) the listener hears
  for (let i = 1; i < S.m.length; i++) { const a = S.m[i - 1], b = S.m[i], dt = (b[0] - a[0]) / 1000; for (let d = 0; d < 2; d++) { const A = a[2][d], B = b[2][d]; if (!A || !B || !A[2] || !B[2]) continue;
      const want = dt * B[1] / 15, got = B[0] - A[0]; if (Math.abs(got - want) > 2) { const near = S.c.filter((c) => c[0] > a[0] - 600 && c[0] <= b[0] + 50 && (c[2] === d || c[2] === -1)).map((c) => c[1]); rep.jumps.push({ t: +(b[0] / 1000).toFixed(1), deck: 'AB'[d], from: A[0], to: B[0], expected: +(A[0] + want).toFixed(1), sec: [A[3], B[3]], cmds: [...new Set(near)].slice(0, 6) }); } } }
  for (const c of S.c) rep.cmds[c[1]] = (rep.cmds[c[1]] || 0) + 1; rep.cmdsPerMin = +(S.c.length / MIN).toFixed(1);
  const unexplained = rep.jumps.filter((j) => !j.cmds.some((k) => /jump|seek|loop|load|play|score|at:/.test(k)));
  console.log(`\n${GENRE} · ${MIN} min · ${S.mode} (${rep.latencyMs} ms) · engine ×${SLOW}${HOGS ? ' · ' + HOGS + ' busy process(es)' : ''} · Auto-DJ ${AUTO ? 'on' : 'off'}${THR > 1 ? ' · page CPU throttled ×' + THR : ''} · first sound after ${(startMs / 1000).toFixed(1)} s`);
  console.log(`  sound-card glitches: ${rep.glitches}${rep.glitchTimes.length ? '  at ' + rep.glitchTimes.slice(0, 20).map((x) => x[0] + 's' + (x[1] > 1 ? '×' + x[1] : '')).join(' ') : ''}`);
  if (/^Stable/.test(S.mode)) console.log(`  render-ahead player ran dry: ${rep.under} time(s), ${rep.dryMs} ms of silence${rep.underTimes.length ? '  at ' + rep.underTimes.slice(0, 20).map((x) => x[0] + 's' + (x[1] > 1 ? '×' + x[1] : '')).join(' ') : ''} · cushion ${Math.round(rep.leadMs)} ms, lowest after the first 15 s ${rep.minAheadMs == null ? '—' : Math.round(rep.minAheadMs) + ' ms'} · eco steps reached ${rep.ecoMax}`);
  console.log(`  transport jumps: ${rep.jumps.length} (${unexplained.length} with no command that explains them)`); for (const j of rep.jumps.slice(0, 12)) console.log(`     ${j.t}s deck ${j.deck}: ${j.from} → ${j.to} (expected ${j.expected}) sections ${j.sec.join('→')} · ${j.cmds.join(', ') || 'no command'}`);
  console.log(`  commands: ${rep.cmdsPerMin}/min · ` + Object.entries(rep.cmds).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `${k} ${v}`).join(' · '));
  console.log(`  audio-thread load max ${rep.maxLoad} % · eco ${rep.eco} samples · main-thread long tasks ${rep.longTasks} (longest ${rep.longestTask} ms) · decks now: ${S.titles.join(' | ')}`);
  if (S.slow.length) { const h = {}; for (const e of S.slow) { const k = String(e[2]).replace(/ [\d.]+ ms$/, ''); h[k] = (h[k] || 0) + 1; } console.log('  slow audio-thread calls: ' + Object.entries(h).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ×${v}`).join(' · ')); }
  if (errors.length) console.log('  page errors: ' + errors.slice(0, 3).join(' | '));
  if (OUTF) fs.writeFileSync(OUTF, JSON.stringify(Object.assign(rep, { raw: { m: S.m, c: S.c, lt: S.lt } })));
  process.exit(0); })().catch((e) => { console.error('session_test:', e && e.message); stop(); process.exit(2); });
