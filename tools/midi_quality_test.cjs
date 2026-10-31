// MIDI clock out as the RECEIVER sees it. A drum machine, a synth or a DAW that follows FORGE's clock sees only the stream of ticks and their times; this test plays the part of that
// receiver. A fake MIDI output records every message the app sends with the timestamp it gave it, and from those the receiver's view is rebuilt:
//   · order     ticks never step back in time
//   · jitter    each tick's distance to its neighbours against the steady spacing (a hardware clock is within ~1 ms)
//   · tempo     the BPM a receiver would measure beat by beat (24 ticks): its spread and its error against the deck's real tempo
//   · gaps      the longest silence in the stream
// in four situations: steady playing; a 1-bar loop (the position wraps back every 1.7 s); a tempo glide; a jump to another section.
// (Web MIDI hardware cannot be attached to a cloud machine; this is the same stream, judged by what a device could tell from it.)
// Usage: node tools/midi_quality_test.cjs [seconds=14] [base=http://localhost:8765] [genre=psytrance]
const { chromium } = require('./lib/dep.cjs')('playwright');
const SECS = +(process.argv[2] || 14), BASE = process.argv[3] || 'http://localhost:8765', GENRE = process.argv[4] || 'psytrance'; let fails = 0; const ok = (c, m) => { console.log('  ' + (c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
const q = (v, p) => { const s = v.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))]; }, mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
// the receiver's view of one run of ticks (times in ms)
function receiver(t) {
  if (t.length < 3) return { n: t.length, back: 0, rms: Infinity, p99: Infinity, max: Infinity, maxGap: Infinity, medTick: NaN, bpmMedian: null, bpmStd: null, beats: 0 }; // no clock at all: every check below fails, none crashes
  const iv = []; let back = 0; for (let i = 1; i < t.length; i++) { const d = t[i] - t[i - 1]; if (d < -0.01) back++; iv.push(d); }
  // the steady spacing around each tick: the running median of the 25 neighbouring intervals; the residual is what a hardware clock would not have
  const res = iv.map((d, i) => d - q(iv.slice(Math.max(0, i - 12), Math.min(iv.length, i + 13)), 0.5)), rms = Math.sqrt(mean(res.map((r) => r * r)));
  const beats = []; for (let i = 0; i + 24 < t.length; i += 24) beats.push(60000 / (t[i + 24] - t[i]));
  const med = q(iv, 0.5); return { n: t.length, back, rms, p99: q(res.map(Math.abs), 0.99), max: Math.max(...res.map(Math.abs)), maxGap: Math.max(...iv), medTick: med, bpmMedian: beats.length ? q(beats, 0.5) : null, bpmStd: beats.length > 2 ? Math.sqrt(mean(beats.map((b) => (b - mean(beats)) ** 2))) : null, beats: beats.length };
}
const fmt = (r) => !(r.n >= 3) ? `${r.n} ticks — the clock stopped` : `${r.n} ticks · order: ${r.back} step(s) back · jitter rms ${r.rms.toFixed(2)} ms, p99 ${r.p99.toFixed(1)}, worst ${r.max.toFixed(1)} · longest gap ${r.maxGap.toFixed(0)} ms (tick ${r.medTick.toFixed(1)}) · measured tempo ${r.bpmMedian ? r.bpmMedian.toFixed(2) : 'n/a'} BPM ± ${r.bpmStd != null ? r.bpmStd.toFixed(2) : 'n/a'}`;
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }), page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); const errors = []; page.on('pageerror', (e) => errors.push(e.message)); const F = (fn, a) => page.evaluate(fn, a);
  await page.goto(BASE + '/test.html'); await page.waitForTimeout(600); await page.selectOption('#startGenre', GENRE); await page.uncheck('#startAuto'); await page.click('#go'); await page.waitForFunction(() => window.__forge.meter && window.__forge.meter.decks[0].playing, null, { timeout: 30000 }); await page.waitForTimeout(2500);
  await F(() => { const sent = []; window.__sent = sent; const inp = { id: 'in1', name: 'Fake', onmidimessage: null }, out = { id: 'out1', name: 'Fake', send: (d, t) => sent.push({ d: Array.from(d), t }) }; window.__forge.midi.connectMidi({ inputs: { forEach: (f) => f(inp) }, outputs: { forEach: (f) => f(out) }, onstatechange: null }); window.__forge.midi.MIDI.clockOut = true; });
  const take = async (ms) => { await F(() => { window.__sent.length = 0; }); await page.waitForTimeout(ms); return F(() => ({ t: window.__sent.filter((x) => x.d[0] === 0xf8).map((x) => x.t), bpm: window.__forge.meter.decks[0].bpm })); };
  console.log(`\nMIDI clock quality · ${GENRE} · ${BASE}`);
  // 1 steady
  let r = await take(SECS * 1000), s = receiver(r.t); console.log('steady   ' + fmt(s)); const bpm = r.bpm;
  ok(s.back === 0, 'steady: no tick is stamped earlier than the one before it'); ok(s.rms <= 1.5 && s.p99 <= 5, `steady: jitter rms ${s.rms.toFixed(2)} ms (≤ 1.5), p99 ${s.p99.toFixed(1)} ms (≤ 5)`);
  ok(s.bpmMedian != null && Math.abs(s.bpmMedian - bpm) <= 0.3 && s.bpmStd <= 0.8, `steady: a receiver measures ${s.bpmMedian && s.bpmMedian.toFixed(2)} BPM ± ${s.bpmStd && s.bpmStd.toFixed(2)} for a deck at ${bpm.toFixed(2)} (error ≤ 0.3, spread ≤ 0.8)`);
  // 2 loop: the position wraps back by a bar every ~1.7 s
  await F(() => { const D = window.__forge.decks[0], pos = D.pos + (performance.now() - D.posT) / 1000 * D.bpm / 15, from = Math.floor(pos / 16) * 16; window.__forge.send({ type: 'loop', deck: 0, from, to: from + 16 }); }); await page.waitForTimeout(1500);
  r = await take(Math.min(SECS, 10) * 1000); s = receiver(r.t); console.log('loop     ' + fmt(s)); const want = r.bpm / 60 * 24 * Math.min(SECS, 10);
  ok(s.back === 0 && s.n > want * 0.9 && s.maxGap < 250, `loop: ${s.n} ticks (≈ ${want.toFixed(0)} expected), order kept, longest gap ${s.maxGap.toFixed(0)} ms (< 250)`); ok(s.rms <= 2.5, `loop: jitter rms ${s.rms.toFixed(2)} ms (≤ 2.5)`);
  await F(() => window.__forge.send({ type: 'loop', deck: 0, from: -1, to: -1 })); await page.waitForTimeout(800);
  // 3 tempo glide: +6 BPM over 2 bars
  const b0 = await F(() => window.__forge.meter.decks[0].bpm); await F((b) => window.__forge.send({ type: 'glide', deck: 0, bpm: b + 6, bars: 2 }), b0); r = await take(Math.min(SECS, 10) * 1000); s = receiver(r.t); console.log('glide    ' + fmt(s));
  ok(s.back === 0 && s.maxGap < 250, `tempo glide ${b0.toFixed(1)} → ${r.bpm.toFixed(1)}: order kept, longest gap ${s.maxGap.toFixed(0)} ms`); ok(Math.abs(s.bpmMedian - r.bpm) <= 1.5, `tempo glide: the receiver ends up at ${s.bpmMedian.toFixed(1)} BPM, the deck at ${r.bpm.toFixed(1)} (within 1.5)`);
  // 4 jump to another section (quantised to the next 4-bar line)
  await F(() => { const D = window.__forge.decks[0], k = D.score.sections.findIndex((x, i) => x.bar0 * 16 > D.pos + 16 * 8 && i > 0); window.__forge.jumpTo(0, k < 0 ? 0 : k); }); r = await take(14000); s = receiver(r.t); console.log('jump     ' + fmt(s));
  ok(s.back === 0 && s.maxGap < 250, `section jump: order kept, longest gap ${s.maxGap.toFixed(0)} ms (< 250)`);
  ok(!errors.length, `no page errors${errors.length ? ': ' + errors[0] : ''}`); await browser.close(); console.log(fails ? `\nmidi_quality: ${fails} failure(s)` : '\nmidi_quality: all checks pass'); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('TEST FAILED', e); process.exit(1); });
