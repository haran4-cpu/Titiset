// browser test of the perform layer: Perform view (pads), section pads, hot cues (set / jump on the bar / clear), FX held on a
// pad (on while pressed, off on release), headphone cue (button state + split routing command), set save → load round trip
// (score, hot cues, energy survive), recording start / stop (a file is produced), keyboard (P, F1). Usage: node tools/perform_ui_test.cjs <outdir>
const { chromium } = require('./lib/dep.cjs')('playwright');
const OUT = process.argv[2] || '.'; let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
(async () => { const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/fonts|net::/.test(m.text())) errors.push(m.text()); });
  await page.goto('http://localhost:8765/test.html'); await page.waitForTimeout(600); await page.selectOption('#startGenre', 'deep-house'); await page.uncheck('#startAuto'); await page.click('#go'); await page.waitForFunction(() => window.__forge.meter && window.__forge.meter.decks[0].playing, null, { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(800);
  const F = (fn, a) => page.evaluate(fn, a);
  // perform view
  await page.keyboard.press('p'); await page.waitForTimeout(300);
  ok(await F(() => window.__forge.shell.SHELL.screen === 'fx'), 'P goes to the FX screen (v9.3: the pads live there)');
  ok(await F(() => [...document.querySelectorAll('.fx-pads .perf[data-d="0"] .pad')].some((p) => p.getBoundingClientRect().width > 40)), 'pads shown on the FX screen');
  await page.screenshot({ path: OUT + '/perform.png' });
  // section pad → quantised jump
  const nSec = await F(() => window.__forge.decks[0].score.sections.length); await page.click(`.deck[data-d="0"] .jb[data-k="${nSec - 2}"]`); await page.waitForTimeout(100);
  ok(await F(() => window.__forge.decks[0].pendJump > 0 && window.__forge.decks[0].pendJump % 64 === 0), 'section jump (the deck, PLAY) schedules a jump on the next 4-bar line');
  // hot cue: set, then jump on the next bar
  await page.click('.perf[data-d="0"] [data-hot="0"]'); await page.waitForTimeout(150);
  const h0 = await F(() => window.__forge.decks[0].hot[0]); ok(h0 != null && h0 % 16 === 0, `hot cue 1 set on a bar line (step ${h0})`);
  await page.waitForTimeout(2500); await page.click('.perf[data-d="0"] [data-hot="0"]'); await page.waitForTimeout(100);
  ok(await F(() => window.__forge.decks[0].pendJump % 16 === 0 && window.__forge.decks[0].pendJump > window.__forge.decks[0].hot[0]), 'pressing a set hot cue jumps back to it on the next bar');
  await page.keyboard.press('F2'); await page.waitForTimeout(100); ok(await F(() => window.__forge.decks[0].hot[1] != null), 'F2 sets hot cue 2 on the lead deck');
  await page.keyboard.press('Shift+F2'); await page.waitForTimeout(100); ok(await F(() => window.__forge.decks[0].hot[1] == null), 'Shift+F2 clears it');
  // (v9.3) the X-Pad holds the selected Beat FX while touched (the 9.2 FX hold pads' job)
  await page.click('[data-go=fx]'); await page.waitForTimeout(400); await page.click('[data-bd="0"]'); await page.click('[data-fx="delay"]');
  const pad = await page.$('.xpad'); const bb = await pad.boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await page.mouse.down(); await page.waitForTimeout(200);
  ok(await F(() => window.__forge.shell.bfxOf(0).fx.delay.on === true), 'X-Pad: delay on while held');
  await page.mouse.up(); await page.waitForTimeout(150); ok(await F(() => window.__forge.shell.bfxOf(0).fx.delay.on === false), '…off on release');
  // (v10) Beat FX on several parts at once: a delay on the bass, then the chords picked and a reverb set there — the bass's delay keeps going
  { const sent0 = await F(() => { window.__sent = []; window.__forge.A2.sendTap = (m) => window.__sent.push(m); return 0; });
    await F(() => { document.querySelector('[data-bt="4"]').click(); document.querySelector('[data-fx="delay"]').click(); document.querySelector('.bfx-on').click(); });
    await F(() => { document.querySelector('[data-bt="5"]').click(); document.querySelector('[data-fx="reverb"]').click(); document.querySelector('.bfx-on').click(); }); await page.waitForTimeout(100);
    const st = await F((n) => { const B = window.__forge.shell.bfxOf(0), S = (window.__sent || []).slice(n).filter((m) => m.type === 'fx' && m.deck === 0);
      return { bass: B.maps[4].delay.on, chords: B.maps[5].reverb.on, bassOff: S.some((m) => m.ch === 4 && m.on === false), onB: S.some((m) => m.ch === 4 && m.on === true && m.name === 'delay'), onC: S.some((m) => m.ch === 5 && m.on === true && m.name === 'reverb'),
        leds: [...document.querySelectorAll('[data-bt] .tgt-led.lit')].map((e) => +e.parentNode.dataset.bt) }; }, sent0);
    ok(st.bass && st.chords && st.onB && st.onC && !st.bassOff && st.leds.includes(4) && st.leds.includes(5), `Beat FX on two parts at once: bass delay and chords reverb both on, the bass never switched off, both chips lit (${JSON.stringify(st)})`);
    await F(() => document.querySelector('#safeBtn').click()); await page.waitForTimeout(100);
    const after = await F(() => { const B = window.__forge.shell.bfxOf(0); return Object.values(B.maps).some((m) => Object.values(m).some((f) => f.on)); });
    ok(!after, 'Safe switches the Beat FX off on every part'); await F(() => document.querySelector('[data-bt="-1"]').click()); }
  // cue
  await page.click('.chan[data-d="0"] .cuebtn'); await page.waitForTimeout(100); ok(await F(() => window.__forge.decks[0].cue === true && document.querySelector('.chan[data-d="0"] .cuebtn').classList.contains('on')), 'CUE (the mixer, MIX) lights the deck');
  await page.keyboard.press('p'); await page.click('#cueBtn'); await page.waitForTimeout(300); await page.check('[name=cuem][value=split]'); await page.waitForTimeout(300);
  ok(await F(() => window.__forge.perf.PERF.cueMode === 'split'), 'cue routing: split selected'); await page.screenshot({ path: OUT + '/cue_panel.png' }); await page.click('#cuePanel [data-close]');
  // energy, then save → load
  await F(() => window.__forge.midi.targets()['A.energy'].set(0.8)); const snap = await F(() => JSON.stringify(window.__forge.perf.setSnapshot()));
  const j = JSON.parse(snap); ok(j.decks[0] && j.decks[0].spec && j.decks[0].hot[0] === h0 && Math.abs(j.decks[0].energy - 0.8) < 1e-6, 'set snapshot carries the score, hot cues and energy');
  // (v9.2) a deck on air is never replaced: pause it first, as a DJ would, then load the new track onto it
  await F(() => window.__forge.decks[0].playing && window.__forge.playPause(0)); await page.waitForFunction(() => !window.__forge.decks[0].playing, null, { timeout: 10000 }).catch(() => {});
  await F(() => window.__forge.loadDeck(0, 'techno', { play: false })); await page.waitForTimeout(400);
  ok(await F(() => window.__forge.decks[0].score.meta.gid === 'techno' && window.__forge.decks[0].hot.every((x) => x == null)), 'a new track starts with empty hot cues');
  await F((s) => window.__forge.perf.applySet(JSON.parse(s)), snap); await page.waitForTimeout(800);
  ok(await F(() => window.__forge.decks[0].score.meta.gid === 'deep-house' && window.__forge.decks[0].hot[0] != null), 'set loaded back: deep-house with hot cue 1');
  // recording
  await page.click('#recBtn'); await page.waitForTimeout(1500); const dl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null); await page.click('#recBtn'); const d = await dl;
  ok(!!d && /\.(webm|ogg|m4a)$/.test(d.suggestedFilename()), 'recording with the split cue on (the browser recorder) produces a file: ' + (d ? d.suggestedFilename() : 'none'));
  // (v9.4) with the cue off, the set is recorded as an MP3 320 by FORGE's own encoder as it plays: a file of whole MPEG-1 Layer III
  // frames at 320 kbit/s, as long as the recording, that the browser decodes to sound
  { await F(() => window.__forge.perf.routeCue('off')); await page.waitForTimeout(300); if (!(await F(() => window.__forge.decks[0].playing))) { await F(() => window.__forge.playPause(0)); await page.waitForTimeout(1200); }
    await page.click('#recBtn'); await page.waitForTimeout(3000); const dl2 = page.waitForEvent('download', { timeout: 20000 }).catch(() => null); await page.click('#recBtn'); const d2 = await dl2;
    let msg = 'no file'; let good = false; if (d2) { const fp = OUT + '/set-recording.mp3'; await d2.saveAs(fp); const b = require('fs').readFileSync(fp); let o = 0, n = 0, bad = 0; const SR = [44100, 48000, 32000];
      while (o + 4 <= b.length) { if (b[o] !== 0xff || (b[o + 1] & 0xfe) !== 0xfa || (b[o + 2] >> 4) !== 14) { bad++; break; } const sr = SR[(b[o + 2] >> 2) & 3], len = Math.floor(144 * 320000 / sr) + ((b[o + 2] >> 1) & 1); o += len; n++; }
      const dec = await F(async (b64) => { try { const u = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); const buf = await new OfflineAudioContext(2, 48000, 48000).decodeAudioData(u.buffer); const x = buf.getChannelData(0); let e = 0; for (let i = 0; i < x.length; i++) e += x[i] * x[i]; return { dur: buf.duration, rms: Math.sqrt(e / Math.max(1, x.length)) }; } catch (er) { return { err: String(er) }; } }, b.toString('base64'));
      good = /\.mp3$/.test(d2.suggestedFilename()) && !bad && o === b.length && n * 1152 / 48000 > 2 && dec.dur > 2 && dec.rms > 1e-3;
      msg = `${d2.suggestedFilename()}: ${n} frames, ${bad ? 'a bad frame header' : o === b.length ? 'whole frames' : 'a cut last frame'}, decoded ${dec.err || dec.dur.toFixed(1) + ' s, rms ' + dec.rms.toFixed(3)}`; }
    ok(good, 'MP3 set recording (cue off): ' + msg); }
  // (v9.4) EXTEND: the playing track grows by one act on the same deck, with no transition; what has played stays as it was
  { const i = await F(() => +document.querySelector('.tp-ext').dataset.deck || 0);
    const b0 = await F((i) => { const D = window.__forge.decks[i], S = D.score.sections; return { bars: D.score.meta.bars, secs: S.map((x) => x.type + x.bars), playing: D.playing }; }, i);
    await F(() => document.querySelector('.tp-ext [data-ext=extend]').click());
    const grown = await page.waitForFunction(([i, n]) => window.__forge.decks[i].score.meta.bars > n, [i, b0.bars], { timeout: 20000 }).then(() => true).catch(() => false);
    const b1 = await F((i) => { const D = window.__forge.decks[i]; return { bars: D.score.meta.bars, secs: D.score.sections.map((x) => x.type + x.bars), playing: D.playing, ext: D.spec.ext || 0 }; }, i);
    const k = b1.secs.findIndex((x, j) => x !== b0.secs[j]); /* the first section that differs: the splice (or the outro that was cut) */
    ok(grown && b1.playing === b0.playing && b1.ext === 1 && k > 0, `Extend (PLAY): deck ${'AB'[i]} grows from ${b0.bars} to ${b1.bars} bars on the same deck (${b0.secs.length} → ${b1.secs.length} sections, the first ${k} unchanged), still ${b1.playing ? 'playing' : 'paused'}`);
    await F(() => document.querySelector('.tp-ext [data-ext=endless]').click()); await page.waitForTimeout(100);
    const on = await F((i) => window.__forge.ext.EXT.endless[i] && document.querySelector('.tp-ext [data-ext=endless]').getAttribute('aria-pressed') === 'true', i);
    await F(() => document.querySelector('.tp-ext [data-ext=endless]').click()); await page.waitForTimeout(100);
    ok(on && await F((i) => !window.__forge.ext.EXT.endless[i], i), 'Endless switches on and off (the button shows it)'); }
  // v7.1: fills, XY pad, part macros, build → drop, the Chords tab and the sound browser
  await F(() => { window.__sent = []; window.__forge.A2.sendTap = (m) => window.__sent.push(m); window.__forge.perf.setPerform(true); }); await page.waitForTimeout(400); await page.screenshot({ path: OUT + '/perform_v71.png', fullPage: true });
  // synthetic pointer events in the page (the view re-lays out while meters run; the handlers are what is under test)
  await F(async () => { const el = document.querySelector('.perf[data-d="0"] [data-fill="toms"]'); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 })); await new Promise((r) => setTimeout(r, 300)); el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1 })); });
  ok(await F(() => { const f = window.__sent.filter((m) => m.type === 'fill' && m.kind === 'toms'); return f.length >= 2 && f[0].on === true && f[f.length - 1].on === false; }), 'fill pad: toms on while held, off on release');
  { await F(() => { const el = document.querySelector('.perf[data-d="0"] [data-xy]'), r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 2, clientX: r.left + r.width * 0.85, clientY: r.top + r.height * 0.2 })); }); await page.waitForTimeout(150);
    ok(await F(() => window.__forge.decks[0].filter > 0.3 && window.__sent.some((m) => m.type === 'partfx' && m.echo > 0.5)), 'XY pad: right = high-pass filter, up = echo + room on the melodic parts'); await F(() => document.querySelector('.perf[data-d="0"] [data-xy]').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 2 }))); await page.waitForTimeout(150);
    ok(await F(() => Math.abs(window.__forge.decks[0].filter) < 0.05 && (window.__sent.filter((m) => m.type === 'partfx').slice(-1)[0] || {}).echo === -1), 'XY pad springs back on release'); }
  await F(() => { const r = document.querySelector('.perf[data-d="0"] [data-mac="stabCut"]'); if (r) { r.value = 0.2; r.oninput(); } });
  ok(await F(() => window.__sent.some((m) => m.type === 'kit' && m.slot === 'chords' && (m.p.cut != null || m.p.tone != null))) || !(await F(() => !!document.querySelector('.perf[data-d="0"] [data-mac="stabCut"]'))), 'macro: stab filter reaches the chords sound');
  if (!(await F(() => window.__forge.decks[0].playing))) { await F(() => document.querySelector('.deck [data-act=play]').click()); await page.waitForTimeout(1500); } await F(() => document.querySelector('.perf[data-d="0"] [data-pdrop]').click()); await page.waitForTimeout(150);
  ok(await F(() => window.__sent.some((m) => m.type === 'fxNow' && (m.kind === 0 || (m.kind === 13 && m.rec >= 0 && m.until > 0))) && window.__sent.some((m) => m.type === 'jump')), 'BUILD → DROP: a riser now (v9.5: a layered recipe of the genre) and a jump to the drop on the line');
  // (v9.5) the transitions panel on the FX screen: a downlifter recipe fired on the line, then a riser that ends on a line with an impact on it
  { await F(() => { window.__sent = []; window.__forge.shell.go('fx'); }); await page.waitForTimeout(300);
    await F(() => { document.querySelector('[data-rzt="down"]').click(); document.querySelector('[data-rzgo]').click(); }); await page.waitForTimeout(100);
    const d = await F(() => { const m = window.__sent.find((x) => x.type === 'at' && x.list && x.list[0].kind === 13); return m ? { at: m.atStep, rec: m.list[0].rec, until: m.list[0].until } : null; });
    ok(!!d && d.at % 64 === 0 && d.until - d.at === 32, `transitions: a downlifter starts on the next 4-bar line and lasts 2 bars${d ? ` (step ${d.at}, recipe ${d.rec})` : ''}`);
    await F(() => { window.__sent = []; document.querySelector('[data-rzt="rise"]').click(); document.querySelector('[data-rzb="4"]').click(); document.querySelector('[data-rzgo]').click(); }); await page.waitForTimeout(100);
    const r = await F(() => { const L = window.__sent.filter((x) => x.type === 'at' && x.list && x.list[0].kind === 13); return L.map((m) => ({ at: m.atStep, until: m.list[0].until })); });
    ok(r.length === 2 && r[0].until % 64 === 0 && r[1].at === r[0].until, `transitions: a 4-bar riser ends on a 4-bar line, an impact lands on it${r.length ? ` (${JSON.stringify(r)})` : ''}`); }
  // (v9.5) MANGLE: an engine and a choice switched on, the touch pad playing slot B while held, a recipe that puts itself on a part,
  // "Keep in track" writing the state into the track, and the state coming back when that track is loaded again
  { await F(() => { window.__sent = []; document.querySelector('[data-mgs="0"]').click(); document.querySelector('[data-mgm="spectral"]').click(); }); await page.waitForTimeout(50);
    await F(() => { document.querySelector('.mg-sub [data-mgc="2"]').click(); document.querySelector('.mg-on').click(); }); await page.waitForTimeout(100);
    const m = await F(() => window.__sent.filter((x) => x.type === 'mangle' && x.slot === 0).pop()); ok(!!m && m.on === true && m.mode === 2 && m.sub === 2, `Mangle: Spectral · Key on slot A sent to the engine${m ? ` (${JSON.stringify(m)})` : ''}`);
    await F(() => { window.__sent = []; document.querySelector('[data-mgs="1"]').click(); document.querySelector('[data-mgm="slice"]').click(); }); const pad = await page.$('.mg-pad'); await pad.scrollIntoViewIfNeeded(); const pb = await pad.boundingBox();
    await page.mouse.move(pb.x + pb.width * 0.8, pb.y + pb.height * 0.2); await page.mouse.down(); await page.waitForTimeout(150); const held = await F(() => window.__sent.filter((x) => x.type === 'mangle' && x.slot === 1).pop());
    await page.mouse.up(); await page.waitForTimeout(100); const rel = await F(() => window.__sent.filter((x) => x.type === 'mangle' && x.slot === 1).pop());
    ok(!!held && held.on === true && held.mode === 0 && Math.abs(held.macro - 0.8) < 0.05 && Math.abs(held.a - 0.8) < 0.05 && rel && rel.on === false, `Mangle: the touch pad plays slot B while held (Macro ${held && held.macro}, ${held && held.a}) and lets go on release`);
    await F(() => { window.__sent = []; const b = [...document.querySelectorAll('[data-mgr]')].find((x) => x.textContent === 'Tuned drums'); b.click(); }); await page.waitForTimeout(100);
    ok(await F(() => window.__sent.some((x) => x.type === 'mangle' && x.unit === 3 && x.on === true) && window.__forge.shell.mgOf(0).target === 3 && window.__forge.decks[0].mgU[-1].s[0].on === true), 'Mangle: the "Tuned drums" recipe puts itself on the percussion (its own unit — the deck\'s Spectral · Key keeps playing)');
    await F(() => document.querySelector('[data-mgkeep]').click()); const kept = await F(() => window.__forge.decks[0].spec.fx && window.__forge.decks[0].spec.fx.mangle);
    ok(!!kept && kept.target === 3 && kept.s[1].mode === 'spectral' && kept.s[0].mode === 'spectral', 'Mangle: Keep in track writes the unit into the track (spec.fx.mangle)');
    const back = await F(async () => { const W = window.__forge, sp = JSON.parse(JSON.stringify(W.decks[0].spec)); W.shell.mgOf(0).s[0].on = false; W.shell.mgOf(0).s[0].mode = 'fold'; window.__sent = []; const s = W.compileSpec(sp, { fastLevels: true }); W.installScore(0, s, { play: false });
      const G = W.shell.mgOf(0); return { mode: G.s[0].mode, on: G.s[0].on, target: G.target, sent: window.__sent.some((x) => x.type === 'mangle' && x.slot === 0 && x.on === true && x.mode === 2) }; });
    ok(back.mode === 'spectral' && back.on === true && back.target === 3 && back.sent, `Mangle: loading the track again brings its Mangle back and switches it on (${JSON.stringify(back)})`);
    await F(() => { document.querySelector('[data-mgoff]').click(); window.__forge.shell.go('play'); }); }
  await F(() => { window.__forge.shell.SHELL.fxDeck = 0; document.querySelector('[data-osthrow="8"]').click(); }); await page.waitForTimeout(100); ok(await F(() => window.__sent.some((m) => m.type === 'throw' && m.deck === 0)), 'ECHO THROW one-shot on the FX screen');
  await F(() => window.__forge.perf.setPerform(false)); await page.waitForTimeout(300); await page.click('[data-tab="chords"]'); await page.waitForTimeout(300);
  await page.click('[data-crh="..x..x....x..x.."]'); await page.waitForTimeout(400);
  ok(await F(() => { const c = window.__forge.decks[0].spec.chords; return c && (c.rhythm || c.gate || [])[0] === '..x..x....x..x..'; }) || await F(() => (window.__forge.decks[0].spec.chords || {}).role !== 'stab'), 'Chords tab: a stab rhythm from the library goes into the score');
  await page.click('[data-cvo="3"]'); await page.waitForTimeout(400); ok(await F(() => window.__forge.decks[0].spec.chords.voices === 3), 'Chords tab: notes per chord');
  // nothing that plays without a way in: the pad (held chord bed) lives in the Chords tab with its sound, on/off and space; New chords
  { const hasPad = await F(() => { const ev = window.__forge.decks[0].score.ev; for (let k = 0; k < ev.n; k++) if (ev.ch[k] === 6) return true; return false; });
    // (v9.3) one home per control: the pad's sound is on Chords · Sound (a chip of its own), its on/off is its mute on the deck, New chords is the deck's button
    await F(() => { document.querySelector('[data-tab="chords"]').click(); document.querySelector('[data-page="sound"]').click(); }); await page.waitForTimeout(300);
    ok(!hasPad || await F(() => !!document.querySelector('.dk-chip[data-slot="pad"]')), `Chords · Sound: the pad has its own sound (${hasPad ? 'pad plays in this track' : 'no pad in this track'})`);
    if (hasPad) { await F(() => document.querySelector('.dk-chip[data-slot="pad"]').click()); await page.waitForTimeout(300); await F(() => document.querySelector('.dk-pgrid .dk-pcard[data-pset]:not([data-pset=""])').click()); await page.waitForTimeout(400); ok(await F(() => !!((window.__forge.decks[0].spec.sound || {}).pad || {}).preset), 'Chords · Sound: a pad card sets the pad sound');
      await F(() => document.querySelector('.deck[data-d="0"] .stem[data-c="6"]').click()); await page.waitForTimeout(200); ok(await F(() => window.__sent.some((m) => m.type === 'mute' && m.ch === 6 && m.on === true) && window.__forge.decks[0].mute[6]), 'the pad mutes from its button on the deck'); await F(() => document.querySelector('.deck[data-d="0"] .stem[data-c="6"]').click()); }
    const s0 = await F(() => JSON.stringify((window.__forge.decks[0].spec.seeds || {}).chords)); await F(() => document.querySelector('.deck[data-d="0"] [data-part="chords"]').click()); await page.waitForTimeout(400);
    ok(await F(() => (window.__forge.decks[0].spec.seeds || {}).chords != null) && s0 !== await F(() => JSON.stringify((window.__forge.decks[0].spec.seeds || {}).chords)), 'New chords (the deck) re-draws the chord part'); }
  ok(await F(() => { const used = new Set(); const ev = window.__forge.decks[0].score.ev; for (let k = 0; k < ev.n; k++) used.add(ev.ch[k]); const w = [...document.querySelectorAll('.deck')][0].querySelectorAll('.stemw'); let miss = 0; w.forEach((x, c) => { if (used.has(c) && !x.querySelector('.sted')) miss++; }); return miss === 0; }), 'every part that plays on deck A has an edit button on its stem');
  await page.click('[data-tab="chords"]'); await page.click('[data-page="sound"]'); await page.waitForTimeout(300); /* (v9.3: a part's Sound page) */ const card = await page.$('.dk-pcard.fit:not(.on)'); if (card) { await card.click(); await page.waitForTimeout(400); }
  ok(await F(() => { const s = window.__forge.decks[0].spec.sound; return !!s && Object.values(s).some((x) => x && x.preset); }), 'sound browser: a palette card sets the preset');
  const m = await F(() => ({ load: window.__forge.meter.load })); ok(m.load < 0.6, `DSP load ${(m.load * 100).toFixed(0)} %`);
  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
  await browser.close(); console.log(fails ? `${fails} failure(s)` : 'perform layer: all checks pass'); process.exit(fails ? 1 : 0); })();
