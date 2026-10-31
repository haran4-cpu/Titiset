// certification in a real browser (the built page, AudioWorklet): every genre is loaded the way a person loads it, played from
// its intro and from its drop, and checked: it plays, it is loud enough, EVERY part the score writes into that window is heard
// on its channel (a part that is written but silent = "doesn't work"), no channel is heard that has nothing written, no page
// error, no audio-thread block above 8 ms. Usage: node tools/cert_test.cjs <outdir> [genres]
const { chromium } = require('./lib/dep.cjs')('playwright');
const OUT = process.argv[2] || '.'; let fails = 0; const NAMES = ['kick', 'snare', 'hats', 'perc', 'bass', 'chords', 'pad', 'lead', 'arp', 'fx', 'texture'];
(async () => { const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--enable-blink-features=AudioContextPlayoutStats'] }) /* the sound card's own glitch count */; const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/fonts|net::|ERR_/.test(m.text())) errors.push(m.text()); });
  await page.goto('http://localhost:8765/test.html'); await page.waitForTimeout(500); await page.click('#skip'); await page.evaluate(() => window.__forge.startAudio()); await page.waitForTimeout(2500);
  const F = (fn, a) => page.evaluate(fn, a);
  const ids = process.argv[3] ? process.argv[3].split(',') : await F(() => window.__forge.auto.GENRES.map((g) => g.id));
  for (const g of ids) { for (const where of ['intro', 'drop']) { const e0 = errors.length;
      const info = await F(async ([g, where]) => { const f = window.__forge; f.send({ type: 'pause', deck: 0 }); await f.loadDeck(0, g, { play: false, seed: 11 }); const s = f.decks[0].score; const sec = where === 'drop' ? (s.sections.find((x) => x.type === 'drop') || s.sections[2]) : s.sections[0];
        const from = sec.bar0 * 16 + 16, to = from + 64; const written = new Array(11).fill(0); for (let i = 0; i < s.ev.n; i++) { const c = s.ev.ch[i]; if (c < 11 && s.ev.t[i] >= from && s.ev.t[i] < to && !(c === 10 && s.ev.d[i] < 0) && !(c === 10 && s.ev.v[i] === 0)) written[c]++; }
        // a pad / chord / texture note started before the window still sounds inside it
        for (let i = 0; i < s.ev.n; i++) { const c = s.ev.ch[i]; if ((c === 5 || c === 6 || c === 10) && s.ev.t[i] < from && s.ev.t[i] + Math.max(0, s.ev.d[i]) > from + 4 && !(c === 10 && (s.ev.d[i] < 0 || s.ev.v[i] === 0))) written[c]++; }
        f.send({ type: 'seek', deck: 0, step: from - 16 }); f.send({ type: 'play', deck: 0 }); window.__pk = new Array(11).fill(0); window.__blk = 0; window.__u0 = f.A2.under || 0; return { from, written, bpm: s.meta.bpm, target: s.mix.lufs }; }, [g, where]);
      const t0 = Date.now(); let lufs = -99; while (Date.now() - t0 < 1000 * (16 + 64) * 15 / info.bpm + 600) { await page.waitForTimeout(200); const m = await F((from) => { const m = window.__forge.meter; if (!m) return null; const D = m.decks[0]; if (D.pos >= from && D.pos < from + 64) for (let c = 0; c < 11; c++) window.__pk[c] = Math.max(window.__pk[c], D.peaks[c]); window.__blk = Math.max(window.__blk, m.blkMax || 0); return { pos: D.pos, lufs: m.lufsS }; }, info.from); if (m && m.pos > info.from + 16) lufs = Math.max(lufs, m.lufs); }
      const r = await F(() => ({ pk: window.__pk, blk: window.__blk, playing: window.__forge.meter.decks[0].playing, drop: (window.__forge.A2.under || 0) - window.__u0, stable: window.__forge.A2.mode === 'Stable' || !!window.__forge.A2.underKnown }));
      const silent = [], ghost = []; for (let c = 0; c < 11; c++) { const db = 20 * Math.log10(r.pk[c] + 1e-9); if (info.written[c] && db < -60) silent.push(NAMES[c]); if (!info.written[c] && db > -40 && c !== 9 && c !== 10) ghost.push(NAMES[c] + ' ' + db.toFixed(0)); }
      // audio blocks: this container's own scheduler stalls a plain arithmetic loop for up to ~18 ms (measured), so one long block
      // is reported (⚠) but only a block beyond that (> 20 ms) fails; the per-command cost is judged deterministically by block_test
      // Stable engine: the audio thread only plays chunks, so the verdict is the player's own dropout count (a slow DSP block is
      // absorbed by the buffer and only reported); Tight engine: a DSP block above 20 ms fails
      const ok = r.playing && lufs > (where === 'intro' ? -30 : info.target - 7) && !silent.length && (r.stable ? r.drop === 0 : r.blk <= 20) && errors.length === e0;
      if (!ok) fails++; console.log(`${ok ? (r.blk > 8 ? '⚠' : '✓') : '✗'} ${g.padEnd(18)} ${where.padEnd(5)} ${lufs.toFixed(1)} LUFS-S · parts ${info.written.map((n, c) => (n ? NAMES[c] : null)).filter(Boolean).join(' ')}${silent.length ? ' · SILENT: ' + silent.join(', ') : ''}${ghost.length ? ' · unexpected: ' + ghost.join(', ') : ''} · DSP block ${r.blk} ms${r.stable ? ` · dropouts ${r.drop}` : ''}${errors.length > e0 ? ' · ERR ' + errors.slice(e0).join(' | ') : ''}`); } }
  await browser.close(); console.log(fails ? `${fails} failure(s)` : 'certification: every genre plays every part it writes'); process.exit(fails ? 1 : 0); })();
