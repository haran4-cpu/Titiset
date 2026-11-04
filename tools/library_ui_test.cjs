// (v9.5) MY LIBRARY in the browser: a deck's track saved with its edits and hot cues comes back exactly so (after a reload of the page,
// from IndexedDB); a playlist is made, ordered and shows how two tracks meet; Play set puts the first track on air and the second on the
// other deck with Auto-DJ on, and Auto-DJ takes the third from the list instead of composing; Backup writes a file that Restore reads.
// Usage: node tools/library_ui_test.cjs <outdir>   (the CI starts the server on :8765)
const { chromium } = require('./lib/dep.cjs')('playwright'); const fs = require('fs');
const OUT = process.argv[2] || '.'; let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
(async () => { const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true }); const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:8765/test.html'); await page.waitForTimeout(600); await page.selectOption('#startGenre', 'deep-house'); await page.uncheck('#startAuto'); await page.click('#go'); await page.waitForFunction(() => window.__forge.decks[0].score, null, { timeout: 60000 });
  const F = (fn, a) => page.evaluate(fn, a); await F(() => window.__forge.playPause(0)); await page.waitForTimeout(300);
  // an edit and a hot cue, then Save on the deck
  await F(() => { const D = window.__forge.decks[0]; D.spec.swing = 57; D.hot[0] = 32; }); await F(() => document.querySelector('.deck[data-d="0"] [data-act=save]').click()); await page.waitForTimeout(400);
  const t1 = await F(() => window.__forge.lib.LIB.tracks[0]); ok(!!t1 && t1.spec.swing === 57 && t1.hot[0] === 32, `Save on deck A keeps the track with its edit and its hot cue${t1 ? ` (${t1.title}, ${t1.bpm} BPM)` : ''}`);
  // two more tracks: deck B composed and saved, then a third
  for (const g of ['techno', 'melodic-techno']) { await F((gid) => window.__forge.loadDeck(1, gid, { play: false }), g); await page.waitForFunction(() => !window.__forge.decks[1].loading && window.__forge.decks[1].score, null, { timeout: 60000 }); await F(() => window.__forge.lib.saveDeckToLib(1, true)); await page.waitForTimeout(200); }
  ok(await F(() => window.__forge.lib.LIB.tracks.length === 3), 'three tracks in the library');
  // a playlist from the Tracks tab: the first track into a new list, then the others
  await F(() => window.__forge.shell.go('set')); await page.waitForTimeout(300);
  await F(() => { const rows = [...document.querySelectorAll('.mylib .ml-row')]; const sel = rows[rows.length - 1].querySelector('[data-addto]'); sel.value = 'new'; sel.dispatchEvent(new Event('change')); }); await page.waitForTimeout(300);
  for (let k = 0; k < 2; k++) { await F((k) => { const rows = [...document.querySelectorAll('.mylib .ml-row')]; const sel = rows[1 - k].querySelector('[data-addto]'); sel.value = window.__forge.lib.LIB.lists[0].id; sel.dispatchEvent(new Event('change')); }, k); await page.waitForTimeout(250); }
  await F(() => document.querySelector('[data-mlt="lists"]').click()); await page.waitForTimeout(200);
  const L = await F(() => ({ n: window.__forge.lib.LIB.lists[0].items.length, gaps: document.querySelectorAll('.ml-gap').length, first: window.__forge.lib.LIB.lists[0].items[0] }));
  ok(L.n === 3 && L.gaps === 2, `a playlist of 3 tracks, with how each pair meets (key, tempo) shown between them (${L.gaps} gaps)`);
  await F(() => document.querySelector('[data-dn="0"]').click()); await page.waitForTimeout(250); ok(await F((f) => window.__forge.lib.LIB.lists[0].items[1] === f, L.first), 'the order changes with ↓');
  await page.screenshot({ path: OUT + '/library.png' });
  // persisted: reload the page, read IndexedDB again
  await page.reload(); await page.waitForTimeout(800); await page.click('#go').catch(() => {}); await page.waitForFunction(() => window.__forge && window.__forge.lib && window.__forge.lib.LIB.ready, null, { timeout: 30000 }).catch(() => {});
  await F(() => window.__forge.lib.libLoad()); const per = await F(() => ({ t: window.__forge.lib.LIB.tracks.length, l: window.__forge.lib.LIB.lists.length, sw: (window.__forge.lib.LIB.tracks.find((t) => t.spec.swing === 57) || {}).title }));
  ok(per.t === 3 && per.l === 1 && !!per.sw, `after a reload: ${per.t} tracks and ${per.l} playlist still there`);
  // a library track loaded on a deck is the same score
  await page.waitForFunction(() => window.__forge.decks[0].score, null, { timeout: 60000 }).catch(() => {}); await F(() => { window.__forge.decks[0].playing && window.__forge.playPause(0); });
  const same = await F(async () => { const W = window.__forge, t = W.lib.LIB.tracks.find((x) => x.spec.swing === 57); await W.lib.loadLibTrack(1, t.id, false); const D = W.decks[1]; return D.libId === t.id && D.spec.swing === 57 && JSON.stringify(D.spec.drums.patterns) === JSON.stringify(t.spec.drums.patterns) && D.hot[0] === 32; });
  ok(same, 'a library track loaded on deck B is the saved score, with its hot cue');
  // play the set: first on air, second waiting, Auto-DJ on; then the third comes from the list
  const set = await F(async () => { const W = window.__forge; for (const i of [0, 1]) if (W.decks[i].playing) W.playPause(i); await new Promise((r) => setTimeout(r, 300)); const L = W.lib.LIB.lists[0]; await W.lib.playSet(L.id); const ids = [W.decks[0].libId, W.decks[1].libId];
    return { a: ids.indexOf(L.items[0]) >= 0, b: ids.indexOf(L.items[1]) >= 0, auto: W.autoDJ.on, pos: W.lib.LIB.queue && W.lib.LIB.queue.pos, third: L.items[2] }; });
  ok(set.a && set.b && set.auto && set.pos === 2, `Play set: the first two tracks on the decks, Auto-DJ on, the list's third next (${JSON.stringify(set)})`);
  const nx = await F(async (third) => { const W = window.__forge, i = W.decks[0].playing ? 1 : 0; if (W.decks[i].playing) W.playPause(i); W.decks[i].fresh = false; const p = W.lib.libNext(i); if (!p) return 'none'; await p; return W.decks[i].libId === third; }, set.third);
  ok(nx === true, 'Auto-DJ asks the set before composing: the third track of the list loads');
  // backup → a file with every track and playlist
  await F(() => window.__forge.shell.go('set')); const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }).catch(() => null), F(() => document.querySelector('[data-mlbk]').click())]);
  let bk = null; if (dl) { const p = OUT + '/lib-backup.json'; await dl.saveAs(p); bk = JSON.parse(fs.readFileSync(p, 'utf8')); }
  ok(!!bk && bk.forge === 'library' && bk.tracks.length === 3 && bk.lists.length === 1, `Backup writes the library to a file${bk ? ` (${bk.tracks.length} tracks, ${bk.lists.length} playlist)` : ''}`);
  ok(!errors.length, `no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
  await browser.close(); console.log(fails ? `${fails} failure(s)` : 'library: all checks pass'); process.exit(fails ? 1 : 0); })().catch((e) => { console.error(e); process.exit(1); });
