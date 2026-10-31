// browser test of the Ask bar: words → a track that plays (and, with a deck running, a mix on the next phrase), words → live
// edits on the lead deck, and the Claude path with a stand-in `sample` (its reply carries an invalid field: it must be dropped by
// path, the rest must play). Usage: node tools/ask_ui_test.cjs <outdir>
const { chromium } = require('./lib/dep.cjs')('playwright');
const OUT = process.argv[2] || '.'; let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
(async () => { const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/fonts|net::/.test(m.text())) errors.push(m.text()); });
  await page.goto('http://localhost:8765/test.html'); await page.waitForTimeout(600); await page.click('#skip'); await page.waitForTimeout(200);
  const F = (fn, a) => page.evaluate(fn, a); const ask = async (t) => { await page.fill('#askIn', t); await page.press('#askIn', 'Enter'); await page.waitForTimeout(1200); };
  await ask('emotional deep house at 122 in F minor'); await page.waitForFunction(() => window.__forge.meter && window.__forge.meter.decks[0].playing, null, { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(800);
  const d0 = await F(() => { const D = window.__forge.decks[0]; return { gid: D.score && D.score.meta.gid, mood: D.spec && D.spec.mood, bpm: D.score && D.score.meta.bpm, key: D.score && D.score.meta.key, mode: D.score && D.score.meta.mode, playing: window.__forge.meter && window.__forge.meter.decks[0].playing }; });
  ok(d0.gid === 'deep-house' && d0.mood === 'emotional' && d0.bpm === 122 && d0.key === 5 && d0.mode === 'minor' && d0.playing, `“emotional deep house at 122 in F minor” → ${JSON.stringify(d0)}`);
  await page.screenshot({ path: OUT + '/ask.png' });
  const e0 = await F(() => window.__forge.decks[0].energy ?? 0.5); await ask('more energy'); const e1 = await F(() => window.__forge.decks[0].energy);
  ok(e1 > e0 + 0.2, `“more energy” → energy ${e0} → ${e1}`);
  const s0 = await F(() => window.__forge.decks[0].spec.seeds && window.__forge.decks[0].spec.seeds.bass); await ask('new bass'); const s1 = await F(() => window.__forge.decks[0].spec.seeds && window.__forge.decks[0].spec.seeds.bass);
  ok(s1 != null && s1 !== s0, '“new bass” → a new bass seed in the score');
  await ask('warmer'); ok(await F(() => window.__forge.decks[0].spec.mix.heat > 1.1), '“warmer” → more heat on the deck');
  await ask('dark melodic techno'); await page.waitForFunction(() => window.__forge.decks[1].score && window.__forge.tx, null, { timeout: 15000, polling: 25 }).catch(() => {});
  const t = await F(() => ({ gid: window.__forge.decks[1].score && window.__forge.decks[1].score.meta.gid, tx: !!window.__forge.tx }));
  ok(t.gid === 'melodic-techno' && t.tx, `a new track while deck A plays → deck B + a mix scheduled (${JSON.stringify(t)})`);
  // Claude path with a stand-in: the reply has an unknown field and an out-of-range value; both are dropped, the rest plays
  await F(() => { window.__forge.ask.ASK.sample = { json: async () => ({ say: 'A slow ambient piece', score: { forge: 1, genre: 'ambient', mood: 'dreamy', bogus: true, bpm: 999, title: 'Glass' } }) }; });
  await F(() => window.__forge.tx && window.__forge.send({ type: 'cancelTx' })); await F(() => { window.__forge.send({ type: 'pause', deck: 1 }); });
  await page.waitForTimeout(300); await ask('something like rain on a window');
  // the stand-in's reply is composed asynchronously too: on a loaded VM #askSay still read “Claude is writing…” after the fixed 1.2 s (1 run in 4 on one busy core)
  await page.waitForFunction(() => window.__forge.decks.some((D) => D.spec && D.spec.genre === 'ambient') && /dropped/.test(document.querySelector('#askSay').textContent), null, { timeout: 20000, polling: 25 }).catch(() => {});
  const c = await F(() => { const ds = window.__forge.decks.map((D) => D.spec && D.spec.genre); return { ds, say: document.querySelector('#askSay').textContent }; });
  ok(c.ds.includes('ambient') && /dropped/.test(c.say), `unknown words → Claude (stand-in) → ambient, invalid fields dropped (“${c.say}”)`);
  ok(await F(() => { const r = window.__forge.ask.askRepair({ forge: 1, genre: 'house', form: [{ section: 'drop', bars: 999 }], mix: { heat: 9 } }); return r && !(r.sp.form && r.sp.form.length) && r.sp.mix.heat === undefined; }), 'repair drops invalid entries by path');
  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await browser.close(); console.log(fails ? `${fails} failure(s)` : 'ask: all checks pass'); process.exit(fails ? 1 : 0); })();
