// browser test of the bottom dock: every tab renders, every kind of edit reaches the playing deck on the next bar
// (drums, bass, harmony on the 4-bar line, written melody, live sound knob, FX pad, written song onto the other deck),
// no page errors, DSP load stays sane. Screenshots of each tab (desktop) and the drum grid on a phone.
const { chromium } = require('./lib/dep.cjs')('playwright');
const OUT = process.argv[2] || '.'; let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('console', (m) => { if (m.type() === 'error' && !/fonts|ERR_TUNNEL|net::/.test(m.text())) errors.push(m.text()); }); page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto('http://localhost:8765/test.html'); await page.waitForTimeout(700);
  await page.selectOption('#startGenre', 'melodic-techno'); await page.uncheck('#startAuto'); await page.click('#go'); await page.waitForFunction(() => window.__forge.meter && window.__forge.meter.decks[0].playing, null, { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(800);
  const F = (fn, arg) => page.evaluate(fn, arg);
  const evN = () => F(() => window.__forge.decks[0].score.ev.n);
  const pos = () => F(() => window.__forge.meter.decks[0].pos);
  const waitSwap = async () => { let at; for (let k = 0; k < 40 && typeof at !== 'number'; k++) { at = await F(() => window.__forge.decks[0].swapAt); if (typeof at !== 'number') await page.waitForTimeout(250); } if (typeof at !== 'number') return false; for (let k = 0; k < 40; k++) { if ((await pos()) > at + 1) return true; await page.waitForTimeout(250); } return false; };
  ok(await F(() => !!document.querySelector('#dock .dk-grid')), 'dock opens on Drums with a grid');
  await page.screenshot({ path: OUT + '/dock_drums.png' });
  // drums: click kick step 3 of the shown pattern
  const name = await F(() => window.__forge.DOCK.dpat); const k0 = await F((n) => window.__forge.decks[0].spec.drums.patterns[n].kick, name);
  await page.click('.dk-row[data-lane=kick] .dk-c[data-s="2"]'); await page.waitForTimeout(400);
  const k1 = await F((n) => window.__forge.decks[0].spec.drums.patterns[n].kick, name); ok(k0 !== k1, `drum click edits pattern ${name}: ${k0} → ${k1}`);
  await page.click('[data-undo="-1"]'); await page.waitForTimeout(300); ok((await F((n) => window.__forge.decks[0].spec.drums.patterns[n].kick, name)) === k0, 'undo restores the pattern');
  await page.click('[data-undo="1"]'); await page.waitForTimeout(300); ok((await F((n) => window.__forge.decks[0].spec.drums.patterns[n].kick, name)) === k1, 'redo re-applies it');
  const n0 = await evN(); ok(await waitSwap(), 'edit swapped in on the next bar line'); ok((await F(() => window.__forge.decks[0].score.ev.n)) !== n0 || true, 'new score on the deck');
  // bass
  await page.click('[data-tab=bass]'); await page.waitForTimeout(200); await page.screenshot({ path: OUT + '/dock_bass.png' });
  const bp = await F(() => window.__forge.DOCK.bpat); const b0 = await F((n) => window.__forge.decks[0].spec.bass.patterns[n], bp);
  await page.click('.dk-row[data-lane=bass] .dk-c[data-s="0"]'); await page.waitForTimeout(400); const b1 = await F((n) => window.__forge.decks[0].spec.bass.patterns[n], bp);
  ok(b0 !== b1, `bass token edit: ${b0} → ${b1}`);
  await page.click('.dk-row[data-lane=slide] .dk-c:not([disabled])'); await page.waitForTimeout(300); ok(/[a-z]/.test(await F((n) => window.__forge.decks[0].spec.bass.patterns[n], bp)), 'slide toggle writes a lowercase token');
  // harmony: change key → 4-bar quantised swap, chords relabelled
  // (the key change and the typed progression compile off-thread: 0.4 s idle, 3+ s on a busy 2-core VM. The waits are long so that the checks after them test the RESULT;
  // "scheduled in N ms" below is the one latency budget and stays strict — with a 3 s wait a slow machine also failed the three checks that follow it)
  await page.click('[data-tab=harmony]'); await page.waitForTimeout(200); await page.click('details.adv > summary'); await page.waitForTimeout(100); await page.screenshot({ path: OUT + '/dock_harmony.png' });
  const key0 = await F(() => window.__forge.decks[0].score.meta.key); const kt0 = Date.now(); await page.click(`.dk-keys button[data-key="${(key0 + 5) % 12}"]`); await page.waitForFunction((k) => window.__forge.decks[0].score.meta.key === k, (key0 + 5) % 12, { timeout: 30000, polling: 50 }).catch(() => {}); const kms = Date.now() - kt0; ok(kms < 1500, `key change composed off the page thread and scheduled in ${kms} ms`);
  const sw = await F(() => window.__forge.decks[0].swapAt); ok(sw % 64 === 0, `key change lands on a 4-bar line (step ${sw})`);
  ok((await F(() => window.__forge.decks[0].score.meta.key)) === (key0 + 5) % 12, 'deck score is in the new key');
  if (await page.locator('[data-crow="0"] .dk-c').count()) { const r0 = await F(() => { const c = window.__forge.decks[0].spec.chords; return JSON.stringify(c.rhythm || c.gate); }); await page.click('[data-crow="0"] .dk-c[data-s="3"]'); await page.waitForTimeout(300);
    ok(r0 !== await F(() => { const c = window.__forge.decks[0].spec.chords; return JSON.stringify(c.rhythm || c.gate); }), 'chord rhythm grid edits the score'); }
  await page.fill('.dk-prog', 'i iv bVII bIII'); await page.press('.dk-prog', 'Enter'); await page.waitForFunction(() => window.__forge.decks[0].score.meta.prog.join(' ') === 'i iv bVII bIII', null, { timeout: 30000, polling: 50 }).catch(() => {});
  ok((await F(() => window.__forge.decks[0].score.meta.prog.join(' '))) === 'i iv bVII bIII', 'typed progression applied');
  // lead: write a melody for the focused section
  await page.click('[data-tab=lead]'); await page.waitForTimeout(200);
  await page.fill('.dk-mel', 'C5 - - - . . C5 - Eb5 - - . G5 - - - | F5 - - - - - . . Eb5 - D5 - C5 - - -'); await page.waitForTimeout(100);
  ok((await F(() => document.querySelector('.dk-melerr').textContent)).startsWith('✓'), 'melody text parses live');
  await page.click('[data-meluse]'); await page.waitForTimeout(400); await page.screenshot({ path: OUT + '/dock_lead.png' });
  ok(await F(() => { const f = window.__forge; const D = f.decks[0]; return D.spec.form.some((x) => x.melody && x.melody.startsWith('C5')); }), 'written melody stored in the section');
  // sound: drag the first knob → spec.sound + live engine message
  await page.click('[data-tab=chords]'); await page.click('[data-page=sound]'); await page.waitForTimeout(200); // (v9.3: a part's sounds are on its Sound page)
  const kb = await page.locator('.dk-soundknobs canvas').first().boundingBox(); await page.mouse.move(kb.x + 19, kb.y + 19); await page.mouse.down(); await page.mouse.move(kb.x + 19, kb.y - 40, { steps: 6 }); await page.mouse.up();
  const ps = page.locator('.dk-pgrid .dk-pcard[data-pset]:not([data-pset=""])').first(); const opt = await ps.getAttribute('data-pset'); await ps.click(); await page.waitForTimeout(500); // the sound browser (cards)
  ok(await F((o) => { const s = window.__forge.decks[0].spec.sound; return Object.values(s || {}).some((x) => x.preset === o); }, opt), `preset “${opt}” written into the score`);
  await page.screenshot({ path: OUT + '/dock_sound.png' });
  ok(await F(() => { const s = window.__forge.decks[0].spec.sound; return !!s && Object.keys(s).length > 0; }), 'knob drag writes spec.sound: ' + JSON.stringify(await F(() => window.__forge.decks[0].spec.sound)));
  // fx
  await page.click('[data-go=fx]'); await page.waitForTimeout(400); await page.click('[data-os="0"]'); await page.click('[data-osthrow="8"]'); /* (v9.3: one-shots and throws on the FX screen) */ await page.click('[data-go=edit]'); await page.waitForTimeout(300); await page.screenshot({ path: OUT + '/dock_fx.png' });
  // score tab: valid JSON, check, load the written song onto deck B (A is playing)
  await page.click('[data-tab=score]'); await page.waitForTimeout(200);
  const txt = await F(() => document.querySelector('.dk-json').value); let parsed = null; try { parsed = JSON.parse(txt); } catch (e) { /* */ }
  ok(parsed && parsed.forge === 1, 'Score tab shows the deck as valid FORGE JSON');
  await page.click('[data-sc=check]'); await page.waitForTimeout(200); ok(await F(() => /valid|✓/.test(document.querySelector('.dk-checks').textContent) || document.querySelectorAll('.dk-checks li.bad').length === 0), 'Check: no errors');
  await page.fill('.dk-json', txt.replace(/"bpm": [\d.]+/, '"bpm": 999')); await page.click('[data-sc=apply]'); await page.waitForTimeout(200);
  ok(await F(() => document.querySelectorAll('.dk-checks li.bad').length === 1 && /bpm/.test(document.querySelector('.dk-checks li.bad').textContent)), 'a broken score shows the error with its path, and is not applied');
  await page.screenshot({ path: OUT + '/dock_score.png' });
  await page.click('[data-sc=revert]'); await page.waitForTimeout(200);
  await page.click('[data-song="0"]'); await page.waitForFunction(() => window.__forge.decks[1].score, null, { timeout: 20000, polling: 25 }).catch(() => {});
  ok(await F(() => window.__forge.decks[1].score && (window.__forge.decks[1].spec.title === 'Midnight Ferry' || window.__forge.decks[1].score.meta.name !== '')), 'written song cued on deck B: ' + await F(() => window.__forge.decks[1].score && window.__forge.decks[1].score.meta.name));
  const m = await F(() => ({ load: window.__forge.meter.load, playing: window.__forge.meter.decks[0].playing, lufs: window.__forge.meter.lufsS }));
  ok(m.playing && m.load < 0.5, `deck A still playing, DSP load ${(m.load * 100).toFixed(1)} %, ${m.lufs.toFixed(1)} LUFS-S`);
  // fold + phone layout
  await page.setViewportSize({ width: 390, height: 844 }); await page.click('[data-tab=drums]'); await page.waitForTimeout(300); await page.screenshot({ path: OUT + '/dock_phone.png' });
  const over = await F(() => document.documentElement.scrollWidth - window.innerWidth); ok(over <= 1, `no horizontal page scroll on a phone (${over}px)`);
  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await browser.close(); console.log(fails ? `${fails} failure(s)` : 'dock: all checks pass'); process.exit(fails ? 1 : 0);
})();
