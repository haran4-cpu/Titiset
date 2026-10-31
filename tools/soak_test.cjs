// soak / monkey test in a real browser: the app plays for N minutes with Auto-DJ on while a seeded "monkey" presses what a
// person presses (energy, mood, part re-draws, Evolve, loops, section jumps, hot cues, FX holds, EQ, filter, crossfader,
// Ask-bar edits, BPM, new tracks from the library, manual mixes, Perform view, dock tabs, undo). Telemetry every 100 ms.
// Graded (each anomaly is listed with the actions just before it):
//   tempo   — a deck's BPM moves when nothing asked it to, or faster than 1 BPM per bar (a glide a DJ would hear as "it sped up")
//   jump    — the play position moves by more than a step against its own clock with no jump / loop / seek / swap / start behind it
//   stall   — a playing deck's position stops advancing for more than 0.5 s, or the engine stops reporting
//   audio   — Stable engine: any dropout (the audio-thread player ran dry). Tight: an audio-thread block above 20 ms (worklet; 8–20 ms is reported: this container stalls a plain loop up to ~18 ms)
//             or a late callback (fallback)
//   ui      — a main-thread task above 250 ms
//   errors  — any page error
// Usage: node tools/soak_test.cjs <outdir> [minutes=6] [seed=1] [--fallback]
const { chromium } = require('./lib/dep.cjs')('playwright');
const OUT = process.argv[2] || '.', MIN = +(process.argv[3] || 6), SEED = +(process.argv[4] || 1), FALLBACK = process.argv.includes('--fallback');
let s = SEED >>> 0; const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
(async () => { const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--enable-blink-features=AudioContextPlayoutStats'].concat((process.env.FORGE_CHROME_ARGS || '').split(' ').filter(Boolean)) }) /* the sound card's own glitch count */; const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/fonts|net::/.test(m.text())) errors.push(m.text()); });
  if (FALLBACK) await page.addInitScript(() => { delete window.AudioWorkletNode; });
  if (process.env.FORGE_WASM === 'off') await page.addInitScript(() => { try { localStorage.setItem('forge.wasm', 'off'); } catch (e) { /* none */ } });
  await page.goto('http://localhost:8765/test.html'); await page.waitForTimeout(500);
  // command log inside the page: every message to the engine, timestamped
  await page.evaluate(() => { window.__cmds = []; const f = window.__forge, orig = f.send; const A = f.A2; const wrap = (m) => { window.__cmds.push([performance.now(), m.type, m.deck, m.type === 'jump' ? m.step : m.type === 'glide' || m.type === 'bpm' ? m.bpm : m.type === 'loop' ? m.from : null]); };
    A.sendTap = wrap; });
  await page.selectOption('#startGenre', 'deep-house'); await page.click('#go'); await page.waitForFunction(() => window.__forge.meter && window.__forge.meter.decks[0].playing, null, { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(800);
  await page.evaluate(() => { window.__cmds = window.__cmds || []; const f = window.__forge, A = f.A2; if (!A.sendTap) A.sendTap = (m) => window.__cmds.push([performance.now(), m.type, m.deck, m.type === 'jump' ? m.step : m.type === 'glide' || m.type === 'bpm' ? m.bpm : null]); });
  await page.evaluate(() => { document.querySelector('#txLen').value = '16'; document.querySelector('#txLen').onchange({ target: { value: '16' } }); });
  const F = (fn, a) => page.evaluate(fn, a);
  const actions = [
    ['energy', 3, async () => F((v) => window.__forge.midi.targets()[`${'AB'[window.__forge.meter.lead]}.energy`].set(v), +(rnd()).toFixed(2))],
    ['mood', 1, async () => { const d = await F(() => window.__forge.meter.lead); await page.selectOption(`.deck[data-d="${d}"] .cmood`, pick(['', 'emotional', 'deep', 'dreamy', 'uplifting', 'dark', 'hypnotic'])); }],
    ['part', 3, async () => { const d = await F(() => window.__forge.meter.lead); await page.click(`.deck[data-d="${d}"] [data-part="${pick(['drums', 'bass', 'chords', 'lead'])}"]`); }],
    ['auto', 1, async () => F((k) => { const f = window.__forge, i = f.meter.lead, a = f.auto.autoOf(f.decks[i]); a.on[k] = !a.on[k]; }, pick(['drums', 'bass', 'harmony', 'lead', 'sound', 'moves']))],
    ['loop', 1, async () => F((l) => { const f = window.__forge; f.midi.targets()[`${'AB'[f.meter.lead]}.loop${l}`].press(); }, pick([4, 8, 16]))],
    ['jump', 2, async () => F((r) => { const f = window.__forge, i = f.meter.lead, D = f.decks[i]; if (D.score) f.jumpTo(i, Math.floor(r * D.score.sections.length)); }, rnd())],
    ['hot', 2, async () => F((k) => window.__forge.perf.hotPress(window.__forge.meter.lead, k), Math.floor(rnd() * 4))],
    ['fx', 2, async () => { const n = pick(['sweep', 'phaser', 'flanger', 'echo', 'crush', 'gate']); await F((n) => window.__forge.midi.targets()[`${'AB'[window.__forge.meter.lead]}.fx.${n}.hold`].down(), n); await page.waitForTimeout(300 + rnd() * 1500); await F((n) => window.__forge.midi.targets()[`${'AB'[window.__forge.meter.lead]}.fx.${n}.hold`].up(), n); }],
    ['eq', 2, async () => F(([b, v]) => window.__forge.midi.targets()[`${'AB'[window.__forge.meter.lead]}.eq.${b}`].set(v), [pick(['high', 'mid', 'low']), 0.5 + (rnd() - 0.5) * 0.6])],
    ['filter', 1, async () => { await F((v) => window.__forge.midi.targets()[`${'AB'[window.__forge.meter.lead]}.filter`].set(v), 0.5 + (rnd() - 0.5) * 0.8); await page.waitForTimeout(800); await F(() => window.__forge.midi.targets()[`${'AB'[window.__forge.meter.lead]}.filter`].set(0.5)); }],
    ['ask', 2, async () => { await page.fill('#askIn', pick(['more energy', 'less energy', 'darker', 'new drums', 'new bass', 'warmer', 'punchier', 'go to the drop', 'echo', 'loop', 'stop loop', 'new melody'])); await page.press('#askIn', 'Enter'); }],
    ['bpm', 1, async () => { const d = await F(() => window.__forge.meter.lead); const b = await F((d) => window.__forge.decks[d].bpm, d); await page.fill(`#cb${d}`, String(Math.round(b + (rnd() - 0.5) * 6))); await page.press(`#cb${d}`, 'Enter'); }],
    ['newtrack', 1, async () => F((g) => { const f = window.__forge, b = f.meter.lead ^ 1; if (!f.decks[b].playing && !f.tx) f.loadDeck(b, g, { play: false }); }, pick(['tech-house', 'house', 'techno', 'melodic-techno', 'progressive-house', 'afro-house', 'nu-disco']))],
    ['mix', 1, async () => F(() => { const f = window.__forge, b = f.meter.lead ^ 1; if (f.decks[b].score && !f.decks[b].playing && !f.tx) f.mixInto(b); })],
    ['perform', 1, async () => page.keyboard.press('p')],
    ['tab', 1, async () => { const t = pick(['drums', 'bass', 'harmony', 'lead', 'chords', 'score']); const el = await page.$(`[data-tab=${t}]`); if (el && await el.isVisible()) await el.click(); }],
    ['xf', 1, async () => F((v) => window.__forge.midi.targets().xf.set(v), 0.3 + rnd() * 0.4)],
    ['var', 1, async () => F(() => window.__forge.reroll(window.__forge.meter.lead))],
  ];
  const W = actions.reduce((a, x) => a + x[1], 0); const acts = []; const tel = []; const t0 = Date.now(), dur = MIN * 60000; let next = 4000;
  while (Date.now() - t0 < dur) { const el = Date.now() - t0;
    if (el > next) { let x = rnd() * W, a = actions[0]; for (const c of actions) { x -= c[1]; if (x <= 0) { a = c; break; } }
      const at = await F(() => performance.now()); acts.push([at, a[0]]); try { await a[2](); } catch (e) { acts.push([at, a[0] + ' (failed: ' + e.message.split('\n')[0] + ')']); } next = el + 2500 + rnd() * 5000; }
    tel.push(await F(() => { const f = window.__forge, m = f.meter; return { t: performance.now(), lead: m ? m.lead : 0, blk: m ? m.blkMax : 0, over: m ? m.over : 0, late: m ? m.late : 0, load: m ? m.load : 0, under: f.A2.under || 0, tx: !!f.tx, d: f.decks.map((D) => ({ pos: D.pos, posT: D.posT, bpm: D.bpm, p: D.playing, loop: D.loop, sec: D.sec, gid: D.gid })) }; }));
    await page.waitForTimeout(100); }
  const cmds = await F(() => window.__cmds), diag = await F(() => ({ long: window.__forge.DIAG.long, longMax: window.__forge.DIAG.longMax, longs: window.__forge.DIAG.longs, mode: window.__forge.A2.mode, known: !!window.__forge.A2.underKnown }));
  const slowEv = await F(() => { const H = window.__forge.health && window.__forge.health.HEALTH; return H ? H.ev.filter((e) => e[1] === 'slow' || e[1] === 'glitch').map((e) => [e[0], e[1], e[2], H.t0 + performance.timeOrigin + e[0]]) : []; }); const pT0 = await F(() => performance.timeOrigin);
  await page.screenshot({ path: OUT + '/soak_end.png' }); await browser.close();
  // ---- analysis
  const an = []; const settle = 6000; const recent = (t) => acts.filter((a) => a[0] <= t && a[0] > t - 6000).map((a) => a[1]).join(', ') || '—';
  const cmdIn = (t1, t2, d, types) => cmds.filter((c) => c[0] >= t1 - 400 && c[0] <= t2 + 50 && (c[2] == null || c[2] === d) && types.includes(c[1]));
  const STABLE = diag.mode === 'Stable' || diag.known; let gaps = 0; const warn = []; for (let k = 1; k < tel.length; k++) { const A = tel[k - 1], B = tel[k]; if (B.t - tel[0].t < settle) continue; if (B.t - A.t > 2000) { gaps++; continue; } // the harness itself was starved: nothing can be judged across that gap // the first seconds are start-up (load, warm-up)
    if (STABLE) { if (B.under > A.under) an.push(['audio', B.t, `audio dropout: ${diag.known ? 'the sound card had to fill' : 'the player ran dry'} (${B.under - A.under} quanta)`]); } else if (B.blk > 20 && !FALLBACK) an.push(['audio', B.t, `block ${B.blk} ms`]); else if (B.blk > 8 && !FALLBACK) warn.push(`@${(B.t / 1000).toFixed(1)} s block ${B.blk} ms (within this machine's own scheduling jitter, ~18 ms measured)`); if (FALLBACK && B.late > A.late) an.push(['audio', B.t, `late audio callback (${B.late - A.late}) — a gap in the sound`]);
    for (let d = 0; d < 2; d++) { const a = A.d[d], b = B.d[d]; if (!a.p || !b.p) continue;
      if (Math.abs(b.bpm - a.bpm) > 0.05) { const dt = (b.posT - a.posT) / 1000, rate = Math.abs(b.bpm - a.bpm) / Math.max(1e-3, (b.pos - a.pos) / 16); const why = cmdIn(a.posT - 60000, b.posT, d, ['glide', 'bpm', 'load', 'start', 'transition']);
        if (!why.length) an.push(['tempo', B.t, `deck ${'AB'[d]} ${a.bpm.toFixed(2)} → ${b.bpm.toFixed(2)} BPM with no tempo command`]); else if (rate > 1.0 && dt > 0) an.push(['tempo', B.t, `deck ${'AB'[d]} ${a.bpm.toFixed(2)} → ${b.bpm.toFixed(2)} BPM at ${rate.toFixed(2)} BPM per bar (${why.map((c) => c[1]).join('/')})`]); }
      if (b.posT === a.posT) { if (B.t - b.posT > 500) an.push(['stall', B.t, `deck ${'AB'[d]}: no engine report for ${(B.t - b.posT).toFixed(0)} ms`]); continue; }
      const exp = (b.posT - a.posT) / 1000 * a.bpm / 15, got = b.pos - a.pos, err = got - exp;
      if (Math.abs(err) > 1.5) { const why = cmdIn(a.posT - 20000, b.posT, d, ['jump', 'loop']).concat(cmdIn(a.posT, b.posT, d, ['seek', 'swapScore', 'start', 'transition', 'load', 'pause', 'play'])); const loopWrap = b.loop && got < 0;
        if (!why.length && !loopWrap) an.push(['jump', B.t, `deck ${'AB'[d]} moved ${got.toFixed(1)} steps, its clock says ${exp.toFixed(1)}`]); }
      if (got <= 0 && !(b.loop) && B.t - A.t > 500) an.push(['stall', B.t, `deck ${'AB'[d]} position frozen`]); } }
  for (const [st, du] of diag.longs) if (du > 250 && st - tel[0].t > settle) an.push(['ui', st, `main thread blocked ${du} ms`]);
  for (const e of errors) an.push(['errors', 0, e]);
  const by = {}; for (const x of an) (by[x[0]] = by[x[0]] || []).push(x);
  const bpmTrack = [0, 1].map((d) => { const v = tel.filter((x) => x.d[d].p).map((x) => x.d[d].bpm); return v.length ? `${Math.min(...v).toFixed(1)}–${Math.max(...v).toFixed(1)}` : '—'; });
  console.log(`soak ${MIN} min, seed ${SEED}, engine ${diag.mode}: ${acts.length} actions, ${cmds.length} engine commands, ${tel.length} samples · BPM range A ${bpmTrack[0]} B ${bpmTrack[1]} · main-thread long tasks ${diag.long} (max ${diag.longMax.toFixed(0)} ms)`);
  console.log(`telemetry gaps over 2 s (harness starved, not judged): ${gaps}${warn.length ? ' · ⚠ ' + warn.join(' · ') : ''}`); console.log('actions:', Object.entries(acts.reduce((o, a) => { const k = a[1].split(' ')[0]; o[k] = (o[k] || 0) + 1; return o; }, {})).map(([k, v]) => k + ' ' + v).join(' · '));
  let fails = 0; for (const k of ['tempo', 'jump', 'stall', 'audio', 'ui', 'errors']) { const L = by[k] || []; fails += L.length; console.log(`${L.length ? '✗' : '✓'} ${k}: ${L.length}`); for (const x of L.slice(0, 8)) console.log(`    @${(x[1] / 1000).toFixed(1)} s  ${x[2]}  ← ${recent(x[1])}`); }
  if (slowEv.length) { const gl = slowEv.filter((e) => e[1] === 'glitch'); console.log(`black box: ${slowEv.length - gl.length} slow audio-thread events (render ≥ 5 ms, command ≥ 2 ms, gap far beyond the device rhythm), ${gl.length} glitches`); for (const g of gl) { console.log(`    glitch @${(g[0] / 1000).toFixed(1)} s (since audio start, epoch ${Math.round(g[3])}): ${g[2]}`); for (const e of slowEv) if (e[1] === 'slow' && Math.abs(e[0] - g[0]) < 1500) console.log(`        ${((e[0] - g[0]) / 1000).toFixed(2)} s  ${e[2]}`); } }
  require('fs').writeFileSync(OUT + '/soak.json', JSON.stringify({ acts, cmds, tel, diag, errors })); console.log(fails ? `${fails} anomalies` : 'soak: clean'); process.exit(fails ? 1 : 0); })();
