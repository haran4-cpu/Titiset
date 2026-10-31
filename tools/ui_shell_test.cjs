// v9.3 UI acceptance (docs/UI-SPEC-v9.3.md), in a real browser on this build:
//  1 inventory — across the five screens no control label appears twice for the same deck
//  2 stability — 2 minutes of playback while a mix runs: the 20 main controls move 0 px
//  3 layout at 360 / 390 / 412 / 768 / 1024 / 1440 px — no sideways page scroll, tab bar and transport on screen
//  4 touch audit at 390 px — every visible control on PLAY, MIX, FX and the tab bar ≥ 48 px both ways
//  5 phone task at 390 px — start a set → mix the next track in with Echo out → a delay on the snare: ≤ 8 taps
// Usage: node tools/ui_shell_test.cjs <outdir> [--quick: 20 s instead of 2 min for step 2]
const { chromium } = require('./lib/dep.cjs')('playwright'); const OUT = process.argv[2] || '.', QUICK = process.argv.includes('--quick');
let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
async function open(b, w, h) { const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: w < 900, hasTouch: w < 900 }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8765/test.html'); await p.waitForTimeout(300); return { ctx, p, errs }; }
const startSet = async (p, autoOn) => { if (!autoOn) await p.uncheck('#startAuto').catch(() => {}); await p.click('#go'); await p.waitForFunction(() => window.__forge.meter && window.__forge.meter.decks[0].playing, null, { timeout: 60000 }); await p.waitForTimeout(800); };
// every interactive control on a screen: its label (own, or its group's + its text), the deck it belongs to, its box
const CONTROLS = `(scr) => { const out = []; const vis = (e) => { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; for (let x = e; x; x = x.parentElement) { if (x.hidden || getComputedStyle(x).display === 'none') return false; } const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  for (const e of document.querySelectorAll('.screen[data-screen="' + scr + '"] :is(button, select, input, [role=slider], textarea)')) { if (!vis(e) || e.disabled && e.tagName !== 'BUTTON') continue;
    const own = e.getAttribute('aria-label'), grp = e.closest('[role=group][aria-label]'), lab = e.closest('label'), txt = (own || (lab && lab.textContent) || e.textContent || e.title || '').replace(/\\s+/g, ' ').trim();
    if (!txt || /^step \\d+/i.test(txt) || e.classList.contains('dk-c')) continue; const ctxEl = e.closest('[data-pm],[data-slot],.dk-bankgrp,[data-d]'); const ctx = ctxEl ? (ctxEl.dataset.pm || ctxEl.dataset.slot || (ctxEl.classList.contains('dk-bankgrp') ? ctxEl.textContent.slice(0, 6) : '') || 'deck' + ctxEl.dataset.d) : '';
    const box = (e.type === 'checkbox' && lab ? lab : e).getBoundingClientRect(); out.push({ key: (ctx + '|' + (grp && !own ? grp.getAttribute('aria-label') + ': ' : '') + txt).toLowerCase(), w: box.width, h: box.height, tag: e.tagName.toLowerCase() + (e.type ? ':' + e.type : '') }); }
  return out; }`;
(async () => { const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  // ---- 1, 4: inventory and touch audit at 390 × 844 ----
  { const { ctx, p, errs } = await open(b, 390, 844); await startSet(p); await p.evaluate(() => window.__forge.loadDeck(1, 'techno', { play: false })); await p.waitForTimeout(2500);
    const seen = new Map(); const small = [];
    for (const scr of ['play', 'mix', 'fx', 'set']) { await p.evaluate((k) => window.__forge.shell.go(k), scr); await p.waitForTimeout(400); const list = await p.evaluate(`(${CONTROLS})('${scr}')`);
      for (const c of list) { if (!seen.has(c.key)) seen.set(c.key, new Set()); seen.get(c.key).add(scr); if (scr !== 'set' && (c.w < 47.5 || c.h < 47.5)) small.push(`${scr}: ${c.key} ${Math.round(c.w)}×${Math.round(c.h)} (${c.tag})`); } }
    // the editor: every part, every page
    for (const tab of ['drums', 'bass', 'chords', 'lead', 'harmony', 'score']) for (const page of ['pattern', 'sound', 'mix']) { const ok2 = await p.evaluate(([t, pg]) => { const D = window.__forge.DOCK; D.deck = 0; const tb = document.querySelector(`[data-tab="${t}"]`); tb.click(); const pb = document.querySelector(`[data-page="${pg}"]`); if (pb.disabled) return false; pb.click(); return true; }, [tab, page]);
      if (!ok2) continue; await p.waitForTimeout(250); const list = await p.evaluate(`(${CONTROLS})('edit')`); for (const c of list) { const k2 = c.key; if (!seen.has(k2)) seen.set(k2, new Set()); seen.get(k2).add('edit'); } }
    const dup = [...seen.entries()].filter(([, s]) => s.size > 1).map(([k, s]) => `${k} (${[...s].join(' + ')})`);
    ok(dup.length === 0, `inventory: ${seen.size} distinct controls over the five screens, ${dup.length} with two homes${dup.length ? ' — ' + dup.slice(0, 12).join(' · ') : ''}`);
    ok(small.length === 0, `touch audit 390 px: every control on PLAY / MIX / FX ≥ 48 px — ${small.length} smaller${small.length ? ': ' + small.slice(0, 14).join(' · ') : ''}`);
    ok(!errs.length, `no page errors (${errs.slice(0, 2).join(' | ')})`); await ctx.close(); }
  // ---- 5: the phone task, counted ----
  { const { ctx, p, errs } = await open(b, 390, 844); let taps = 0; const tap = async (sel) => { taps++; await p.click(sel); };
    await tap('#go'); await p.waitForFunction(() => window.__forge.meter && window.__forge.meter.decks[0].playing, null, { timeout: 60000 }); await p.waitForTimeout(600);
    await tap('.deck[data-d="1"] [data-quick="techno"]'); await p.waitForFunction(() => window.__forge.decks[1].score, null, { timeout: 60000 }); await p.waitForTimeout(500);
    taps += 2; await p.selectOption('#txKind', 'echo'); // a native select: one tap opens it, one picks
    await tap('[data-tp=mix]'); await p.waitForTimeout(800); const tx1 = await p.evaluate(() => window.__forge.tx && window.__forge.tx.style);
    await tap('.deck[data-d="0"] .sted[data-slot="snare"]'); await p.waitForTimeout(600);
    const knob = await p.$('[data-pm="snare"] [role=slider][aria-label="Delay"]'); let echo = 0;
    if (knob) { const r = await knob.boundingBox(); taps++; await p.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await p.mouse.down(); await p.mouse.move(r.x + r.width / 2, r.y - 60, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(300); echo = await p.evaluate(() => { const D = window.__forge.decks[0]; return D.partMix && D.partMix.snare ? D.partMix.snare.echo : 0; }); }
    ok(tx1 === 'Echo out' && echo > 0.2 && taps <= 8, `phone task: set started, next track mixing in with ${tx1 || 'no mix'}, snare delay send ${echo.toFixed(2)} — ${taps} taps (≤ 8)`);
    ok(!errs.length, `phone task: no page errors (${errs.slice(0, 2).join(' | ')})`); await p.screenshot({ path: `${OUT}/shell-task-390.png` }); await ctx.close(); }
  // ---- 3: layout ----
  for (const [w, h] of [[360, 780], [390, 844], [412, 915], [768, 1024], [1024, 768], [1440, 900]]) { const { ctx, p, errs } = await open(b, w, h); await startSet(p);
    const m = await p.evaluate(() => { const R = (s) => document.querySelector(s).getBoundingClientRect(); const tb = R('.tabbar'), tp = R('.transport'); return { sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth, tb: [tb.top, tb.bottom], tp: [tp.top, tp.bottom], ih: innerHeight }; });
    ok(m.sw <= w && m.bw <= w && m.tb[1] <= m.ih + 1 && m.tb[0] > m.ih * 0.8 && m.tp[1] <= m.tb[0] + 1 && m.tp[0] > 0, `${w}×${h}: no sideways scroll (${m.sw} px), tab bar at ${Math.round(m.tb[0])}–${Math.round(m.tb[1])}, transport at ${Math.round(m.tp[0])}–${Math.round(m.tp[1])} of ${m.ih}`);
    if (errs.length) ok(false, `${w}: page errors ${errs.slice(0, 2).join(' | ')}`); await p.screenshot({ path: `${OUT}/shell-${w}.png` }); await ctx.close(); }
  // ---- 2: stability while a mix runs ----
  { const { ctx, p, errs } = await open(b, 390, 844); await startSet(p); await p.evaluate(() => window.__forge.loadDeck(1, 'tech-house', { play: false })); await p.waitForFunction(() => window.__forge.decks[1].score, null, { timeout: 60000 });
    await p.selectOption('#txKind', 'blend'); await p.click('[data-tp=mix]');
    const SEL = ['[data-go=play]', '[data-go=mix]', '[data-go=fx]', '[data-go=edit]', '[data-go=set]', '[data-tp=play0]', '[data-tp=mix]', '[data-tp=play1]', '#txKind', '[data-fx=delay]', '[data-fx=dub]', '[data-fx=reverb]', '[data-fx=filter]', '[data-fx=roll]', '[data-fx=brake]', '.bfx-on', '.xpad', '#xf', '#fader0', '#fader1'];
    const snap = () => p.evaluate((S) => S.map((s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }), SEL); const first = await snap(); let worst = 0, who = '', mixed = false; const T = QUICK ? 20 : 120;
    for (let t = 0; t < T; t += 5) { await p.waitForTimeout(5000); const now = await snap(); for (let k = 0; k < SEL.length; k++) for (let j = 0; j < 4; j++) { const d = Math.abs(now[k][j] - first[k][j]); if (d > worst) { worst = d; who = SEL[k] + ' ' + 'xywh'[j]; } } if (await p.evaluate(() => !!window.__forge.tx)) mixed = true; }
    ok(worst === 0 && mixed, `stability: ${T} s of playback with a mix running (${mixed}) — the 20 main controls moved ${worst.toFixed(1)} px (0)${who ? ' — most: ' + who : ''}`); ok(!errs.length, `stability: no page errors (${errs.slice(0, 2).join(' | ')})`); await ctx.close(); }
  await b.close(); console.log(fails ? `ui shell: ${fails} failure(s)` : 'ui shell: all checks pass'); process.exit(fails ? 1 : 0); })();
