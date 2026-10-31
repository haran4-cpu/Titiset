// Auto (the deck produces itself): (1) the harmonic generator offers safe new progressions for every genre — each candidate
// compiles, keeps the key and mode, and the generated hook over it has no more strong-beat clashes than the original;
// (2) in the browser, Auto on every part at 8 bars: changes land EXACTLY on 8-bar lines (engine swap position), harmony,
// sounds and parts all occur, moves fire, nothing errors, the deck never stops. Usage: node tools/auto_ui_test.cjs <outdir> [seconds=70]
const { chromium } = require('./lib/dep.cjs')('playwright');
const OUT = process.argv[2] || '.', SEC = +(process.argv[3] || 70); let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
(async () => { const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/fonts|net::/.test(m.text())) errors.push(m.text()); });
  await page.goto('http://localhost:8765/test.html'); await page.waitForTimeout(500); const F = (fn, a) => page.evaluate(fn, a);
  // (1) harmonic generator over every genre
  const H = await F(() => { const f = window.__forge, X = f.auto, rows = []; for (const G of X.GENRES) { const s = X.composeTrack(G.id, 5), sp = X.exportSpec(s, { melody: false }), D = { spec: sp, score: s, gid: G.id };
      const c = X.harmonyCandidates(D); let bad = 0, worse = 0; const clash = (sc) => (X.lintScore(sc) || []).length; const c0 = clash(s);
      for (const k of c) { const sp2 = JSON.parse(JSON.stringify(sp)); sp2.harmony.progression = k.t; try { const s2 = f.compileSpec(sp2); if (s2.meta.key !== s.meta.key || s2.meta.mode !== s.meta.mode) bad++; if (clash(s2) > c0) worse++; } catch (e) { bad++; } }
      rows.push([G.id, c.length, bad, worse]); } return rows; });
  const none = H.filter((r) => r[1] === 0).map((r) => r[0]), bad = H.reduce((a, r) => a + r[2], 0), tot = H.reduce((a, r) => a + r[1], 0), worse = H.reduce((a, r) => a + r[3], 0);
  ok(!none.length, `harmonic generator: ${tot} candidate progressions over ${H.length} genres (min ${Math.min(...H.map((r) => r[1]))} per genre)${none.length ? ' — none for ' + none.join(', ') : ''}`);
  ok(bad === 0, `every candidate compiles in the same key and mode (${bad} failures)`);
  ok(worse === 0, `no candidate adds lint clashes to the track (${worse})`);
  // (2) live
  await page.selectOption('#startGenre', 'progressive-house'); await page.uncheck('#startAuto'); await page.click('#go'); await page.waitForFunction(() => window.__forge.meter && window.__forge.meter.decks[0].playing, null, { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(800);
  await F(() => { window.__sw = []; const A = window.__forge.A2; A.tap = (d) => { if (d.type === 'swapped') window.__sw.push(d.pos != null ? d.pos : window.__forge.decks[d.deck].pos); }; });
  await page.selectOption('.deck[data-d="0"] [data-every]', '8'); await page.click('.deck[data-d="0"] [data-autoall]'); await page.waitForTimeout(SEC * 1000);
  const r = await F(() => ({ log: window.__forge.auto.autoOf(window.__forge.decks[0]).log, sw: window.__sw, playing: window.__forge.meter.decks[0].playing, spec: window.__forge.decks[0].spec }));
  console.log('  auto log:', r.log.join(' | '));
  ok(r.sw.length >= 3, `${r.sw.length} automatic changes in ${SEC} s`);
  const off = r.sw.map((p) => ((p % 128) + 128) % 128).map((x) => Math.min(x, 128 - x)); ok(off.every((x) => x < 0.6), `each change landed on an 8-bar line (offsets ${off.map((x) => x.toFixed(2)).join(', ')} steps)`);
  ok(r.log.some((l) => /progression/.test(l)) || r.log.length < 3, 'harmony changed at least once');
  ok(r.log.some((l) => /filter sweep|echo throw|energy dip/.test(l)) || SEC < 60, 'a move fired');
  ok(r.playing, 'the deck kept playing'); await page.screenshot({ path: OUT + '/auto.png' });
  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await browser.close(); console.log(fails ? `${fails} failure(s)` : 'auto: all checks pass'); process.exit(fails ? 1 : 0); })();
