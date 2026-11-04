// (v10.1) the controls of everything that plays, in the browser:
//   CHANNELS (MIX): Solo on two parts mutes exactly the others in the engine; ◎ solos one alone; a solo group (Drums); Clear restores your
//   own mutes; a level fader sends the part's gain; holding a part on the PLAY deck solos it alone.
//   EAR CANDY (FX): a kind switched off is sent to both decks and remembered after a reload; Risers and impacts off is sent.
//   ATMOSPHERE (FX): a choice is sent to the engine, kept in the track (spec.fx.atmos), and comes back with the track from the library.
// Usage: node tools/control_ui_test.cjs <outdir>   (the CI starts the server on :8765)
const { chromium } = require('./lib/dep.cjs')('playwright');
const OUT = process.argv[2] || '.'; let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
(async () => { const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const page = await browser.newPage({ viewport: { width: 1280, height: 900 } }); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:8765/test.html'); await page.waitForTimeout(600); await page.selectOption('#startGenre', 'deep-house'); await page.uncheck('#startAuto'); await page.click('#go'); await page.waitForFunction(() => window.__forge.decks[0].score, null, { timeout: 60000 }); await page.waitForTimeout(800);
  const F = (fn, a) => page.evaluate(fn, a); await F(() => { window.__sent = []; window.__forge.A2.sendTap = (m) => window.__sent.push(m); });
  const muted = () => F(() => { const m = {}; for (const x of window.__sent) if (x.type === 'mute' && x.deck === 0) m[x.ch] = x.on; return m; });
  await F(() => { const W = window.__forge; W.ctl.CTL.deck = 0; W.shell.go('mix'); W.ctl.renderChannels(); }); await page.waitForTimeout(300);
  await F(() => { document.querySelector('[data-chs="4"]').click(); document.querySelector('[data-chs="0"]').click(); }); await page.waitForTimeout(100);
  let m = await muted(); ok(m[4] !== true && m[0] !== true && m[5] === true && m[1] === true && m[7] === true, `Solo on bass and kick: the other parts are muted in the engine (${JSON.stringify(m)})`);
  await F(() => document.querySelector('[data-cho="5"]').click()); await page.waitForTimeout(100); m = await muted(); ok(m[5] === false && m[4] === true && m[0] === true, '◎ solos the chords alone');
  await F(() => document.querySelector('[data-chg="0"]').click()); await page.waitForTimeout(100); m = await muted(); ok(m[0] === false && m[1] === false && m[2] === false && m[5] === true && m[4] === true, 'the Drums group solos kick, snare, hats and percussion');
  await F(() => { document.querySelector('[data-chm="2"]').click(); document.querySelector('[data-chclr]').click(); }); await page.waitForTimeout(100); m = await muted(); ok(m[2] === true && m[5] === false && m[4] === false, 'Clear solo keeps your own mute (the hats) and brings the rest back');
  await F(() => { const r = document.querySelector('[data-chl="4"]'); r.value = 1.4; r.oninput(); }); await page.waitForTimeout(100);
  ok(await F(() => window.__sent.some((x) => x.type === 'partGain' && x.deck === 0 && x.ch === 4 && Math.abs(x.v - 1.4) < 1e-6) && window.__forge.decks[0].partMix.bass.level === 1.4), "a level fader sends the part's gain (and EDIT · Mix shows the same level)");
  await page.screenshot({ path: OUT + '/channels.png' });
  // hold a part on the PLAY deck: solo it alone
  await F(() => { window.__forge.shell.go('play'); document.querySelector('[data-chm="2"]') && document.querySelector('[data-chm="2"]').click(); }); await page.waitForTimeout(300);
  const st = await page.$('.deck[data-d="0"] .stem[data-c="7"]'); await st.scrollIntoViewIfNeeded(); const bb = await st.boundingBox(); await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.waitForTimeout(650); await page.mouse.up(); await page.waitForTimeout(150);
  m = await muted(); ok(m[7] === false && m[4] === true && m[5] === true && await F(() => window.__forge.decks[0].solo.has(7)), 'holding the lead on the PLAY deck solos it alone (a tap would have muted it)');
  await F(() => { window.__forge.decks[0].solo.clear(); window.__forge.ctl.chApply(0); });
  // ear candy
  await F(() => window.__forge.shell.go('fx')); await page.waitForTimeout(300); await F(() => { window.__sent = []; document.querySelector('[data-cdk="14"]').click(); document.querySelector('[data-cdtx]').click(); }); await page.waitForTimeout(100);
  const cd = await F(() => window.__sent.filter((x) => x.type === 'candy'));
  ok(cd.length >= 2 && cd.some((x) => x.deck === 0) && cd.some((x) => x.deck === 1) && cd.every((x) => !(x.allow & (1 << 14))) && cd.some((x) => x.tx === 0), `Ear candy: Blip off and the transitions off are sent to both decks (${cd.length} messages)`);
  // atmosphere
  await F(() => { window.__sent = []; window.__forge.shell.SHELL.fxDeck = 0; document.querySelector('[data-atk="5"]').click(); }); await page.waitForTimeout(400);
  await F(() => { const r = document.querySelector('[data-at="tone"]'); r.value = -0.5; r.oninput(); }); await page.waitForTimeout(100);
  const at = await F(() => ({ sent: window.__sent.filter((x) => x.type === 'atmos').pop(), kept: window.__forge.decks[0].spec.fx && window.__forge.decks[0].spec.fx.atmos }));
  ok(at.sent && at.sent.kind === 5 && Math.abs(at.sent.tone + 0.5) < 1e-6 && at.kept && at.kept.kind === 5, `Atmosphere: Rain with a darker tone is sent and kept in the track (${JSON.stringify(at.kept)})`);
  const back = await F(async () => { const W = window.__forge; await W.lib.saveDeckToLib(0, true); const t = W.lib.LIB.tracks[0]; for (const i of [0, 1]) if (W.decks[i].playing) W.playPause(i); window.__sent = []; await W.lib.loadLibTrack(1, t.id, false); return { spec: W.decks[1].spec.fx && W.decks[1].spec.fx.atmos, sent: window.__sent.some((x) => x.type === 'atmos' && x.deck === 1 && x.kind === 5) }; });
  ok(back.spec && back.spec.kind === 5 && back.sent, 'a library track brings its atmosphere back');
  await page.reload(); await page.waitForTimeout(1200); ok(await F(() => !(window.__forge.ctl.CANDY.allow & (1 << 14)) && window.__forge.ctl.CANDY.tx === 0), 'the ear candy choice is remembered after a reload (this browser)');
  ok(!errors.length, `no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
  await browser.close(); console.log(fails ? `${fails} failure(s)` : 'control ui: all checks pass'); process.exit(fails ? 1 : 0); })().catch((e) => { console.error(e); process.exit(1); });
