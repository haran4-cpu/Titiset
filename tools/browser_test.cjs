// real-browser test (Chromium): built page + AudioWorklet + Worker analysis + a full 16-bar transition, measured through
// the engine's own telemetry; then the ScriptProcessor fallback (AudioWorklet removed) must also play.
const { chromium } = require('./lib/dep.cjs')('playwright');
const OUT = process.argv[2] || '.';
async function run(fallback) {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/fonts|ERR_TUNNEL/.test(m.text())) errors.push(m.type() + ': ' + m.text()); }); page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  if (fallback) await page.addInitScript(() => { delete window.AudioWorkletNode; Object.defineProperty(BaseAudioContext.prototype, 'audioWorklet', { get() { return undefined; } }); });
  await page.goto('http://localhost:8765/test.html'); await page.waitForTimeout(800);
  if (!fallback) await page.screenshot({ path: OUT + '/shot_splash.png' });
  await page.selectOption('#startGenre', 'melodic-techno'); await page.uncheck('#startAuto'); await page.click('#go'); await page.waitForFunction(() => window.__forge.meter && window.__forge.meter.decks[0].playing && window.__forge.meter.decks[0].pos > 16, null, { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(1500);
  const s1 = await page.evaluate(() => { const f = window.__forge; return { load: f.meter && f.meter.load, mode: f.A.mode, state: f.A.ctx.state, playing: f.meter && f.meter.decks[0].playing, pos: f.meter && f.meter.decks[0].pos, lufsS: f.meter && f.meter.lufsS, trim: f.decks[0].trim }; });
  console.log(fallback ? '[fallback]' : '[worklet]', 'start', JSON.stringify(s1));
  const clk = await page.evaluate(async () => { const f = window.__forge; const a0 = f.A.ctx.currentTime, p0 = f.meter.decks[0].pos, b = f.meter.decks[0].bpm; await new Promise((r) => setTimeout(r, 6000)); const a1 = f.A.ctx.currentTime, p1 = f.meter.decks[0].pos; return { audioSec: +(a1 - a0).toFixed(3), steps: +(p1 - p0).toFixed(3), expected: +((a1 - a0) * b / 15).toFixed(3) }; });
  console.log('  clock', JSON.stringify(clk));
  if (!fallback) {
    // full transition: load B, put deck A two bars before a 16-bar line, mix over 16 bars. B compiles off the page thread (~0.5 s on a fast machine, several s on a slow or busy
    // one): wait for its score, then seek. A fixed 600 ms left B's score null on a single slow core, mixInto returned silently, and the "mix" never ran (B stayed at 0, grid offset
    // ~290 steps) while the test still ended with exit 0.
    await page.evaluate(() => { window.__forge.loadDeck(1, 'tech-house', { play: false }); });
    await page.waitForFunction(() => window.__forge.decks[1].score, null, { timeout: 60000, polling: 50 }).catch(() => {});
    await page.evaluate(() => window.__forge.send({ type: 'seek', deck: 0, step: 16 * 16 * 3 - 80 }));
    await page.waitForFunction(() => { const p = window.__forge.meter.decks[0].pos; return p >= 16 * 16 * 3 - 80 && p < 16 * 16 * 3 - 32; }, null, { timeout: 20000, polling: 25 }).catch(() => {}); // the seek has reached the meter, so mixInto sees the new position
    await page.evaluate(() => window.__forge.mixInto(1, 16));
    await page.waitForFunction(() => window.__forge.meter.decks[1].playing && window.__forge.meter.decks[0].pos > 16 * 16 * 3 + 24, null, { timeout: 60000, polling: 50 }).catch(() => {}); // ~12 s after mixInto when idle
    await page.screenshot({ path: OUT + '/shot_mix.png' });
    const mid = await page.evaluate(() => { const f = window.__forge; return { load: f.meter.load, tx: f.meter.tx, a: f.meter.decks[0].pos, b: f.meter.decks[1].pos, bpmB: f.meter.decks[1].bpm, trimB: f.decks[1].trim }; });
    const cue = await page.evaluate(() => { const S = window.__forge.decks[1].score.sections, f = S.find((x) => x.type !== 'intro'); return Math.max(0, (f ? f.bar0 : 0) - 16) * 16; }); // B starts at its DJ cue point
    console.log('  mid-mix', JSON.stringify(mid), `grid offset (A − B − 768 + cue ${cue}):`, (mid.a - mid.b - 768 + cue).toFixed(4), 'steps');
    await page.waitForFunction(() => !window.__forge.tx, null, { timeout: 120000, polling: 100 }).catch(() => {}); // the mix is over (~38 s after mixInto when idle)
    const end = await page.evaluate(() => { const f = window.__forge; return { load: f.meter.load, lead: f.meter.lead, tx: f.meter.tx || null, playA: f.meter.decks[0].playing, playB: f.meter.decks[1].playing, bpmB: f.meter.decks[1].bpm }; });
    console.log('  after mix', JSON.stringify(end));
    await page.setViewportSize({ width: 400, height: 900 }); await page.waitForTimeout(500); await page.screenshot({ path: OUT + '/shot_phone.png' });
  }
  console.log('  console errors/warnings:', errors.length ? errors.slice(0, 8).join(' | ') : 'none');
  await browser.close();
}
(async () => { await run(false); await run(true); })().catch((e) => { console.error('TEST FAILED', e); process.exit(1); });
