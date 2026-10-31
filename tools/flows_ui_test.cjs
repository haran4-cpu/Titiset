// live-set flows in the page (v9.2): the load policy (a deck on air is never replaced), Cancel mix, Ask during a mix (queued, then
// loaded on the deck the mix frees), Esc / SAFE disarming an armed mix, a score with markup in a section name refused, the mix strip
// on a phone — each a reproduction of a 9.1 finding, written as an assertion — and what the independent check of 9.2 found: with
// Auto-DJ on, a cancel was undone within seconds (now Auto-DJ switches off, the cued track stays, and Auto-DJ on brings that same track
// in); a mix called off before it started left a mixed-out deck silent on its next Play; the fallback engine (ScriptProcessor) did not
// catch an exception — each host (worklet, render-ahead worker, ScriptProcessor) is made to throw once and must play on; and, from
// its look at the fixes, a saved set must remember which deck's track already played (Auto-DJ mixed in again a track that had played).
// Every precondition is checked: a step that did not happen fails the check instead of passing it by default.
// Usage: node tools/flows_ui_test.cjs [outdir]   (FORGE_URL: the page, default http://localhost:8765/test.html)
const { chromium } = require('./lib/dep.cjs')('playwright'); const OUT = process.argv[2] || '.';
let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
const URL = process.env.FORGE_URL || 'http://localhost:8765/test.html', PHONE = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36';
const happened = (pr) => pr.then(() => true, () => false); // a wait that timed out is a step that did not happen
(async () => { const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const errs = [];
  const page = async (opt) => { opt = opt || {}; const ctx = await b.newContext(Object.assign({ viewport: { width: 1440, height: 900 } }, opt.ctx || {})); if (opt.init) await ctx.addInitScript(opt.init);
    const p = await ctx.newPage(); p.on('pageerror', (e) => errs.push(e.message)); await p.goto(URL); await p.waitForTimeout(500); if (opt.genre) await p.selectOption('#startGenre', opt.genre);
    if (opt.auto) await p.check('#startAuto'); else await p.uncheck('#startAuto'); await p.click('#go');
    await p.waitForFunction(() => window.__forge.meter && window.__forge.meter.decks[0].playing, null, { timeout: 60000 }); await p.waitForTimeout(1500); return p; };
  const helpers = (p) => { const F = (fn, a) => p.evaluate(fn, a); return { F, toast: () => F(() => document.querySelector('#toast').textContent), wait: (ms) => p.waitForTimeout(ms),
    state: () => F(() => { const f = window.__forge, m = f.meter; return { A: f.decks[0].score && f.decks[0].score.meta.gid, B: f.decks[1].score && f.decks[1].score.meta.gid, seedB: f.decks[1].score && f.decks[1].score.meta.seed, pa: !!(m && m.decks[0].playing), pb: !!(m && m.decks[1].playing), tx: f.tx ? { u: f.tx.u, a: f.tx.a, b: f.tx.b } : null, fa: m && m.decks[0].fader, lufs: m && m.lufsM, auto: f.autoDJ.on, pos: m && m.decks[0].pos }; }) }; };

  // ---- the load policy, Cancel mix, Esc, Ask during a mix, the validator (one set, Auto-DJ off)
  { const p = await page({ genre: 'techno' }), { F, toast, wait, state } = helpers(p);
    // 1 · the load policy
    const r1 = await F(async () => { const f = window.__forge; const out = await f.loadDeck(0, 'house', { play: false }); return { out: out === null, target: f.loadTarget(0) }; });
    let s = await state(); ok(r1.out && s.A === 'techno' && s.pa && r1.target === 1, `a load onto the playing deck A is refused (A still ${s.A}, playing ${s.pa}); the policy sends it to deck ${'AB'[r1.target]} · “${await toast()}”`);
    await F(() => window.__forge.perf && document.querySelector('#perfBtn') && document.querySelector('#perfBtn').click()); await wait(800);
    const hasPerf = await F(() => !!document.querySelector('[data-pload]')); if (hasPerf) { await F(() => document.querySelectorAll('[data-pload]')[0].click()); await happened(p.waitForFunction(() => window.__forge.decks[1].score, null, { timeout: 30000 })); }
    await F(() => { const b = document.querySelector('#perfBtn'); if (b && document.body.classList.contains('perform')) b.click(); }); await wait(500);
    s = await state(); ok(hasPerf && s.A === 'techno' && s.pa && !!s.B, `Perform view “Next track → Load” (button found: ${hasPerf}) while deck A plays: A plays on (${s.A}), the track went to deck B (${s.B || '—'})`);
    if (!s.B) { await F(() => window.__forge.loadDeck(1, 'house', { play: false })); await p.waitForFunction(() => window.__forge.decks[1].score, null, { timeout: 30000 }); }
    // 2 · Cancel mix: armed, then running
    await F(() => window.__forge.mixInto(1, 8)); await wait(600); const armed = await F(() => !document.querySelector('#txCancel').hidden);
    await p.click('#txCancel'); await wait(1500); s = await state(); ok(armed && !s.tx && s.pa && !s.pb, `an armed mix: the Cancel button shows (${armed}) and disarms it (mix ${s.tx ? 'still armed' : 'gone'}; A playing, B idle)`);
    await F(() => window.__forge.mixInto(1, 8)); const ran = await happened(p.waitForFunction(() => window.__forge.tx && window.__forge.tx.u > 0.15, null, { timeout: 90000 })); await p.click('#txCancel'); await wait(2000); s = await state();
    ok(ran && !s.tx && s.pa && !s.pb && s.fa > 0.95 && s.lufs > -25, `a running mix (it ran: ${ran}) cancelled: deck A back to full (fader ${s.fa && s.fa.toFixed(2)}, ${s.lufs && s.lufs.toFixed(1)} LUFS), deck B stopped`);
    // 3 · Esc disarms an armed mix (SAFE)
    await F(() => window.__forge.mixInto(1, 8)); await wait(600); const armed3 = (await state()).tx; await p.keyboard.press('Escape'); await wait(1200); s = await state();
    ok(armed3 && !s.tx && s.pa, `Esc (SAFE) disarms an armed mix (armed first: ${!!armed3}; now ${s.tx ? 'still armed' : 'disarmed'}) · “${(await toast()).split('\n').pop()}”`);
    // 4 · Ask during a mix: the new track waits for the mix, never replaces the incoming deck, and loads on the deck the mix frees (A)
    await F(() => window.__forge.mixInto(1, 8)); const ran4 = await happened(p.waitForFunction(() => window.__forge.tx && window.__forge.tx.u > 0.1, null, { timeout: 90000 }));
    const before = await state(); await F(() => window.__forge.ask.askRun('deep house')); await wait(3000); const during = await state();
    ok(ran4 && during.B === before.B && during.pb && during.tx && during.tx.u > 0, `Ask “deep house” during a running mix (${ran4}): the incoming deck keeps its track (${during.B}) and the mix runs on (${during.tx ? Math.round(during.tx.u * 100) + ' %' : 'over'})`);
    const ended = await happened(p.waitForFunction(() => !window.__forge.tx, null, { timeout: 120000 })); await happened(p.waitForFunction(() => window.__forge.decks[0].score && window.__forge.decks[0].score.meta.gid === 'deep-house', null, { timeout: 60000 }));
    const after = await state(); ok(ended && after.A === 'deep-house' && after.B === before.B, `…and loads once the mix has finished (${ended}), on deck A, the deck the mix freed (A ${after.A} · B ${after.B}, still the mixed-in track)`);
    // 5 · a section name with markup is refused by the validator (9.1: it ran as script in the dock's section menu)
    const v = await F(() => { const f = window.__forge; const sp = { forge: 1, genre: 'techno', title: 'x', form: [{ section: 'intro', bars: 16, name: 'Intro<img src=x onerror="window.__xss=1">' }, { section: 'drop', bars: 32 }] }; const r = f.validateSpec(sp); return { ok: r.ok, err: r.errors.map((e) => e.path).join(',') }; });
    ok(!v.ok && /form\[0\]\.name/.test(v.err), `a section name with markup is refused (${v.err}); window.__xss = ${await F(() => window.__xss)}`);
    await p.screenshot({ path: OUT + '/flows-desktop.png' }); await p.context().close(); }

  // ---- 6 · (review) Auto-DJ on, its mix running, Cancel mix: Auto-DJ switches off and the cued track stays (it composed another track
  // over it and armed a new mix within 4–6 s); switched on again, Auto-DJ mixes that same track in
  { const p = await page({ genre: 'techno', auto: true }), { F, toast, wait, state } = helpers(p);
    await F(() => { const f = window.__forge, s = f.decks[0].score, end = s.meta.bars * 16, o = s.sections[s.sections.length - 1], outAt = o.type === 'outro' ? o.bar0 * 16 : end, len = f.autoDJ.len || 32;
      const at = Math.max(256, Math.min(end - len * 16, outAt - Math.round(len / 2) * 16)); f.send({ type: 'seek', deck: 0, step: at - 10 * 16 }); });
    const ran = await happened(p.waitForFunction(() => window.__forge.meter.tx && window.__forge.meter.tx.u > 0.05, null, { timeout: 90000 })); const s0 = await state();
    await p.click('#txCancel'); await wait(8000); const s1 = await state(), t1 = (await toast()).split('\n').pop();
    ok(ran && s0.seedB && !s1.tx && !s1.auto && s1.pa && !s1.pb && s1.seedB === s0.seedB, `Auto-DJ's running mix (${ran}) cancelled: 8 s later no mix (${s1.tx ? 'armed again' : 'none'}), Auto-DJ ${s1.auto ? 'still on' : 'off'}, deck B keeps its track (${s1.seedB === s0.seedB ? 'same' : 'another'} seed) · “${t1}”`);
    await p.check('#autoOn'); const armed = await happened(p.waitForFunction(() => window.__forge.tx, null, { timeout: 20000 })); const s2 = await state();
    ok(armed && s2.tx && s2.tx.b === 1 && s2.seedB === s0.seedB, `Auto-DJ switched on again: it arms a mix (${armed}) with the track that was waiting on deck B (${s2.seedB === s0.seedB ? 'same' : 'another'} seed) · “${(await toast()).split('\n').pop()}”`);
    await p.context().close(); }

  // ---- 7 · (review) a mix called off before it started leaves no deck silent: a mix A → B ends (A's fader stays down after its
  // mix-out), a track is loaded on A, a mix B → A is armed and cancelled, B is paused, A is played — A played at fader 0 (−51.7 LUFS)
  { const p = await page({ genre: 'techno' }), { F, wait, state } = helpers(p);
    await F(() => window.__forge.loadDeck(1, 'tech-house', { play: false })); await p.waitForFunction(() => window.__forge.decks[1].score, null, { timeout: 30000 }); await wait(800);
    await F(() => { const f = window.__forge, ps = f.meter.decks[0].pos, at = (Math.floor(ps / 256) + 2) * 256; f.send({ type: 'seek', deck: 0, step: at - 40 }); }); await wait(400);
    await F(() => window.__forge.mixInto(1, 8)); const done = await happened(p.waitForFunction(() => { const m = window.__forge.meter; return m.tx == null && m.decks[1].playing && !m.decks[0].playing; }, null, { timeout: 120000 }));
    await F(() => window.__forge.loadDeck(0, 'house', { play: false })); const loaded = await happened(p.waitForFunction(() => window.__forge.decks[0].gid === 'house', null, { timeout: 30000 })); await wait(800);
    await F(() => window.__forge.mixInto(0, 8)); await wait(800); const armed = (await state()).tx; await p.click('#txCancel'); await wait(800);
    await F(() => window.__forge.playPause(1)); await wait(800); await F(() => window.__forge.playPause(0)); await wait(4000); const s = await state();
    ok(done && loaded && armed && s.pa && !s.pb && s.fa > 0.95 && s.lufs > -25, `mix A → B done (${done}), a track loaded on A (${loaded}), B → A armed (${!!armed}) and cancelled, B paused, A played: A at fader ${s.fa && s.fa.toFixed(2)}, ${s.lufs && s.lufs.toFixed(1)} LUFS (before the review: silent)`);
    // ---- 8 · each host catches an exception in the engine and plays on: here the worklet
    await hostCheck(p, 'worklet', /^(⚠ )?Live/);
    // ---- 7b · (review of the fixes) a saved set remembers which deck's track already played: a resumed set marked both as waiting, and
    // Auto-DJ mixed in again the track that had just played out. Here A's track has played, B gets a fresh one, the set is saved and applied
    await F(() => window.__forge.loadDeck(1, 'trance', { play: false })); const cued = await happened(p.waitForFunction(() => window.__forge.decks[1].gid === 'trance', null, { timeout: 30000 })); await wait(500);
    const snap = await F(() => window.__forge.perf.setSnapshot()); await F((j) => window.__forge.perf.applySet(j), snap); await wait(2500); const fr = await F(() => window.__forge.decks.map((D) => !!D.fresh));
    ok(cued && snap.decks[0].fresh === false && snap.decks[1].fresh === true && fr[0] === false && fr[1] === true, `a saved set keeps which track already played: A ${snap.decks[0].fresh ? 'waiting' : 'played'} → applied ${fr[0] ? 'waiting' : 'played'}, B ${snap.decks[1].fresh ? 'waiting' : 'played'} → applied ${fr[1] ? 'waiting' : 'played'} (Auto-DJ mixes in only a waiting one)`);
    await p.context().close(); }
  async function hostCheck(p, name, mode) { const { F, wait } = helpers(p); const eng = await F(() => document.querySelector('#engine').textContent), p0 = await F(() => window.__forge.meter.decks[0].pos);
    await F(() => window.__forge.send({ type: 'testFail' })); await wait(3000); const r = await F(() => ({ pos: window.__forge.meter.decks[0].pos, playing: window.__forge.meter.decks[0].playing, lufs: window.__forge.meter.lufsM, toast: document.querySelector('#toast').textContent }));
    ok(mode.test(eng) && r.playing && r.pos > p0 + 8 && r.lufs > -30 && /recovered/.test(r.toast), `${name} (${eng.split(' · ')[0]}): render() made to throw once — caught, reported (“${(r.toast.match(/[^\n]*recovered[^\n]*/) || ['no report'])[0]}”), deck A plays on (${r.lufs.toFixed(1)} LUFS, moved ${(r.pos - p0).toFixed(0)} steps)`); }
  { const p = await page({ genre: 'house', init: () => { try { localStorage.setItem('forge.engine2', 'buffered'); } catch (e) { /* the default engine */ } } }); await hostCheck(p, 'render-ahead worker', /^(⚠ )?Stable/); await p.context().close(); }
  { const p = await page({ genre: 'house', init: () => { AudioWorklet.prototype.addModule = () => Promise.reject(new Error('blocked by a test: the ScriptProcessor fallback')); } }); await hostCheck(p, 'ScriptProcessor fallback', /^(⚠ )?ScriptProcessor/); await p.context().close(); }

  // ---- 9 · (v9.3) on a phone the MIX screen carries the crossfader, the deck faders and Auto-DJ: one tap on the tab bar, always there
  { const ctx = await b.newContext({ viewport: { width: 412, height: 839 }, isMobile: true, hasTouch: true, userAgent: PHONE }), q = await ctx.newPage(); q.on('pageerror', (e) => errs.push(e.message));
    await q.goto(URL); await q.waitForTimeout(500); await q.uncheck('#startAuto'); await q.click('#go'); await q.waitForFunction(() => window.__forge.meter && window.__forge.meter.decks[0].playing, null, { timeout: 60000 }); await q.waitForTimeout(1500);
    const tab = await q.evaluate(() => { const r = document.querySelector('[data-go=mix]').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1; }); /* (+1: sub-pixel rounding of the fixed bar) */ await q.click('[data-go=mix]'); await q.waitForTimeout(900);
    const st = await q.evaluate(() => { const iv = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return r.width > 60 && r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1; }; const R = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom].map(Math.round).join(','); }; return { xf: iv('#xf'), fa: iv('#fader0') && iv('#fader1'), auto: iv('label:has(#autoOn)'), at: `xf ${R('#xf')} fader1 ${R('#fader1')} in ${innerWidth}×${innerHeight}` }; });
    await q.evaluate(() => { const x = document.querySelector('#xf'); x.value = '-1'; x.oninput(); }); await q.waitForTimeout(300); const xg = await q.evaluate(() => window.__forge.decks[1].fader);
    ok(tab && st.xf && st.fa && st.auto, `phone: one tap on MIX shows the crossfader, both deck faders and Auto-DJ on screen (tab ${tab}, crossfader ${st.xf}, faders ${st.fa}, Auto-DJ ${st.auto}${st.xf && st.fa && st.auto ? '' : ' — ' + st.at})`); await q.screenshot({ path: OUT + '/flows-phone.png' }); await ctx.close(); void xg; }
  ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs[0] : '')); await b.close(); console.log(fails ? `${fails} failure(s)` : 'flows: all checks pass'); process.exit(fails ? 1 : 0); })().catch((e) => { console.error('flows:', e.message); process.exit(1); });
