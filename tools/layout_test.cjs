// one layout from phone to ultra-wide: at 390 / 820 / 1180 / 1366 / 1920 / 2560 px — no sideways scroll, the telemetry strip
// spans its screen (SET since v9.3), each screen's content is capped and centred on ultra-wide screens, the phone
// header leaves room for the deck, every dock tab is reachable without scrolling, the empty deck shows its pick-a-genre card.
// Screenshots in <outdir>. Usage: node tools/layout_test.cjs <outdir>
const { chromium } = require('./lib/dep.cjs')('playwright'); const OUT = process.argv[2] || '.';
let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
(async () => { const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  for (const [w, h, mob] of [[390, 844, 1], [820, 1180, 1], [1180, 820, 1], [1366, 768], [1920, 1080], [2560, 1440]]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: !!mob, hasTouch: !!mob }); const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('http://localhost:8765/test.html'); await p.waitForTimeout(400); await p.uncheck('#startAuto').catch(() => {}); await p.click('#go');
    await p.waitForFunction(() => window.__forge.meter && window.__forge.meter.decks[0].playing, null, { timeout: 60000 }).catch(() => {}); await p.waitForTimeout(1500);
    const m = await p.evaluate(() => { const R = (e) => e.getBoundingClientRect(); const setScr = R(document.querySelector('.screen[data-screen=set]')), play = R(document.querySelector('.screen[data-screen=play]')), inner = R(document.querySelector('.screen[data-screen=play] .scr-in')); const app = R(document.querySelector('.app')), tele = R(document.querySelector('.tele')), top = R(document.querySelector('.top')), deckA = R(document.querySelector('.deck[data-d="0"]'));
      const dock = document.querySelector('#dock'), tabs = [...document.querySelectorAll('.dk-tabs button')].map(R), dr = R(dock);
      return { setScr, play, inner, sw: document.documentElement.scrollWidth, app, tele, topH: top.height, deckTop: deckA.top, tabsIn: tabs.every((t) => t.right <= dr.right + 1 && t.left >= dr.left - 1 && t.width > 0), empty: getComputedStyle(document.querySelector('.deck[data-d="1"] .dempty')).display !== 'none' }; });
    ok(m.sw <= w, `${w}×${h}: no sideways scroll (${m.sw} px)`);
    ok(m.tele.left >= m.setScr.left - 1 && m.tele.right <= m.setScr.right + 1 && m.tele.width > m.setScr.width * 0.8, `${w}: telemetry strip spans its screen (SET, v9.3): ${Math.round(m.tele.left)}…${Math.round(m.tele.right)} in ${Math.round(m.setScr.left)}…${Math.round(m.setScr.right)}`);
    if (w > 1960) ok(m.inner.width <= 1181 && Math.abs((m.inner.left - m.play.left) - (m.play.right - m.inner.right)) < 4, `${w}: a screen's content capped at 1180 px and centred in it (v9.3)`);
    if (w < 700) ok(m.deckTop < h * 0.75, `${w}: the deck starts in the first screen (at ${Math.round(m.deckTop)} px of ${h})`);
    ok(m.tabsIn, `${w}: every dock tab visible`); ok(m.empty, `${w}: empty deck B shows the pick-a-genre card`); ok(!errs.length, `${w}: no page errors`);
    await p.screenshot({ path: `${OUT}/layout-${w}.png` }); await ctx.close(); }
  await b.close(); console.log(fails ? `${fails} failure(s)` : 'layout: all checks pass'); process.exit(fails ? 1 : 0); })();
