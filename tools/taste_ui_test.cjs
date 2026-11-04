// (v9.5) YOUR SOUND in the browser: a mood picked on a deck stays — the next track composed (by hand or by Auto-DJ) has it; a sound
// picked teaches its tags; SET · Your sound shows what was learned, forgets one thing, and Reset clears it (and it survives a reload).
// Usage: node tools/taste_ui_test.cjs <outdir>
const { chromium } = require('./lib/dep.cjs')('playwright');
const OUT = process.argv[2] || '.'; let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
(async () => { const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:8765/test.html'); await page.waitForTimeout(600); await page.selectOption('#startGenre', 'deep-house'); await page.uncheck('#startAuto'); await page.click('#go'); await page.waitForFunction(() => window.__forge.decks[0].score, null, { timeout: 60000 });
  const F = (fn, a) => page.evaluate(fn, a);
  await page.selectOption('.deck[data-d="0"] .cmood', 'emotional'); await page.waitForTimeout(500); ok(await F(() => window.__forge.taste.T.mood === 'emotional'), 'a mood picked on deck A is pinned');
  await F(() => window.__forge.loadDeck(1, 'melodic-techno', { play: false })); await page.waitForFunction(() => !window.__forge.decks[1].loading && window.__forge.decks[1].score, null, { timeout: 60000 });
  ok(await F(() => window.__forge.decks[1].spec.mood === 'emotional' && document.querySelector('.deck[data-d="1"] .cmood').value === 'emotional'), 'the next track (another genre, on deck B) is composed with it, and its deck shows it');
  const tag = await F(() => { const W = window.__forge, name = 'house-organ'; W.taste.tastePreset('chords', name); return W.taste.T.tags.organ > 0 && W.taste.T.names['chords/house-organ'] > 0; }); ok(tag, 'a sound picked teaches its name and its tags');
  // (v10) the deck sound and part levels you keep setting carry into the next track; ♥ More teaches the track
  const mixL = await F(async () => { const W = window.__forge, T = W.taste; for (let k = 0; k < 3; k++) { T.tasteMixKnob('verb', 0.05, 0.3); T.tastePartLevel('bass', 1.4); }
    const g0 = W.decks[1].playing ? 0 : 1; await W.loadDeck(g0, 'techno', { play: false }); await new Promise((r) => { const t = setInterval(() => { if (!W.decks[g0].loading && W.decks[g0].score) { clearInterval(t); r(); } }, 100); });
    const D = W.decks[g0], G = W.auto.GENRES.find((x) => x.id === 'techno'); return { adj: T.T.mixAdj.verb, part: T.T.parts.bass, verb: D.spec.mix && D.spec.mix.verb, def: G && G.mix.verb, bass: D.partMix && D.partMix.bass && D.partMix.bass.level }; });
  ok(mixL.adj < -0.1 && mixL.part > 1 && mixL.verb != null && mixL.def != null && mixL.verb < mixL.def - 0.05 && mixL.bass > 1.1, `the deck sound and part levels you keep setting start the next track that way (reverb ${mixL.verb} against the genre's ${mixL.def}; bass level ${mixL.bass}) — ${JSON.stringify(mixL)}`);
  const lk = await F(() => { const W = window.__forge, g = W.decks[0].gid, w0 = W.taste.T.genres[g] || 0; document.querySelector('.deck[data-d="0"] [data-act=like]').click(); return (W.taste.T.genres[g] || 0) - w0; });
  ok(lk > 0.5, `♥ More like this teaches the track's genre (+${lk.toFixed(2)})`);
  await F(() => window.__forge.shell.go('set')); await page.waitForTimeout(500); const chips = await F(() => document.querySelectorAll('.taste .ts-chip').length); ok(chips >= 3, `SET · Your sound shows what was learned (${chips} items)`);
  await page.screenshot({ path: OUT + '/taste.png' });
  await page.reload(); await page.waitForTimeout(1500); ok(await F(() => window.__forge.taste.T.mood === 'emotional' && window.__forge.taste.T.tags.organ > 0), 'it survives a reload (this browser)');
  await page.click('#go').catch(() => {}); await page.waitForTimeout(800); await F(() => window.__forge.shell.go('set')); await page.waitForTimeout(400);
  await F(() => document.querySelector('.taste [data-tforget^="tags|organ"]').click()); ok(await F(() => !window.__forge.taste.T.tags.organ), '✕ forgets one thing');
  await F(() => document.querySelector('.taste [data-treset]').click()); await page.waitForTimeout(100); await F(() => document.querySelector('.taste [data-treset]').click()); await page.waitForTimeout(200);
  ok(await F(() => !window.__forge.taste.T.mood && !Object.keys(window.__forge.taste.T.names).length), 'Reset (asked twice) clears everything');
  ok(!errors.length, `no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
  await browser.close(); console.log(fails ? `${fails} failure(s)` : 'taste ui: all checks pass'); process.exit(fails ? 1 : 0); })().catch((e) => { console.error(e); process.exit(1); });
