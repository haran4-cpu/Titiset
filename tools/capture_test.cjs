// What the REAL engine in a real browser puts out, measured by tools that share no code with it. For each engine mode (Live, Live · fast, Stable) a tap on the master output
// (an AudioWorklet on the audio thread, so a page stall cannot spoil the capture) records everything the engine hands to the sound card while one track plays from its first step,
// with a fake MIDI controller listening to the clock the app sends. Checked:
//   · the capture itself: no NaN, no full-scale samples, no digital silence / held frame / replayed buffer after the start (an engine under-run shows up as exactly these)
//   · the engine's own dropout counter and the audio thread's frame counter (no frame ever skipped)
//   · parity with the offline renderer the other tests use: the same score rendered in Node, aligned by cross-correlation — level (LUFS), shape (correlation) and null depth
//   · the written notes are the notes heard, and the audio's pulse is at the score's tempo (same checks as wav_audit.cjs)
//   · MIDI clock vs sound: for every beat the tick the app stamped for it against the moment the sound card plays that beat (the audio clock's own output timestamps)
// Usage: node tools/capture_test.cjs <outdir> [modes=live,fast,buffered] [genre=techno] [seed=7] [seconds=24]
const fs = require('fs'), path = require('path');
const { chromium } = require('./lib/dep.cjs')('playwright'); const { X, appScore } = require('./render.cjs'); const A = require('./lib/audio_audit.cjs');
const OUT = process.argv[2] || '.', MODES = (process.argv[3] || 'live,fast,buffered').split(','), GENRE = process.argv[4] || 'techno', SEED = +(process.argv[5] || 7), SECS = +(process.argv[6] || 24);
if (!A.haveFfmpeg() || !A.havePython()) { console.log('capture_test: unavailable (needs ffmpeg with ebur128, and python3 with numpy + scipy) — nothing was checked'); process.exit(0); }
const PARITY = []; let fails = 0; const ok = (c, m) => { console.log('  ' + (c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
const TAP = `class Tap extends AudioWorkletProcessor { constructor() { super(); this.n = 0; this.L = new Float32Array(4096); this.R = new Float32Array(4096); this.f0 = 0; }
  process(inputs) { const i = inputs[0], l = i && i[0]; if (!l) return true; const r = i[1] || l; if (this.n === 0) this.f0 = currentFrame; this.L.set(l, this.n); this.R.set(r, this.n); this.n += l.length;
    if (this.n >= 4096) { this.port.postMessage({ f: this.f0, l: this.L.slice(), r: this.R.slice() }); this.n = 0; } return true; } } registerProcessor('forge-tap', Tap);`;
// the reference: the SAME engine code run in Node, fed the exact commands the app sent (level, load, trim, palette gains, seek…) and then `play`, block by block
function engineRef(cmds, score, sr, frames) { const E = new X.Engine(sr); for (const c of cmds) E.cmd(c.type === 'load' ? Object.assign({}, c, { score }) : c); const L = new Float32Array(frames), R = new Float32Array(frames), bl = new Float32Array(128), br = new Float32Array(128);
  for (let i = 0; i + 128 <= frames; i += 128) { E.render(bl, br, 128); L.set(bl, i); R.set(br, i); } return { L, R, sps: sr * 15 / score.meta.bpm }; }
// where in the reference the capture lies: the low band (below 300 Hz: kick, sub, bass — the part of the sound that does not depend on the noise generator) of both is
// decimated, and a normalised cross-correlation of the capture's first 6 s is searched over the hinted window; then refined at the full rate.
function lowpass(x, fc, sr) { const w = 2 * Math.PI * fc / sr, c = Math.cos(w), al = Math.sin(w) / Math.SQRT2, a0 = 1 + al, b0 = (1 - c) / 2 / a0, b1 = (1 - c) / a0, a1 = -2 * c / a0, a2 = (1 - al) / a0; let y = Float64Array.from(x);
  for (let pass = 0; pass < 2; pass++) { let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < y.length; i++) { const x0 = y[i], o = b0 * x0 + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x0; y2 = y1; y1 = o; y[i] = o; } } return y; }
function ncc(r, c, at, n) { let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i++) { const x = r[at + i], y = c[i]; sxy += x * y; sxx += x * x; syy += y * y; } return sxy / Math.sqrt(sxx * syy + 1e-30); }
function alignAt(ref, cap, sr, hint, maxLag) {
  const D = 16, lr = lowpass(ref, 300, sr), lc = lowpass(cap, 300, sr), N = Math.min(cap.length, 6 * sr), nd = Math.floor(N / D), dr = new Float64Array(Math.floor(ref.length / D)), dc = new Float64Array(nd); for (let i = 0; i < dr.length; i++) dr[i] = lr[i * D]; for (let i = 0; i < nd; i++) dc[i] = lc[i * D];
  let best = -2, bl = 0; const lo = Math.max(0, Math.floor((hint - maxLag) / D)), hi = Math.min(dr.length - nd, Math.ceil((hint + maxLag) / D)); for (let l = lo; l <= hi; l++) { const v = ncc(dr, dc, l, nd); if (v > best) { best = v; bl = l; } }
  let fb = -2, fa = bl * D; for (let a = bl * D - D; a <= bl * D + D; a++) { if (a < 0 || a + N > lr.length) continue; const v = ncc(lr, lc, a, N); if (v > fb) { fb = v; fa = a; } } return { at: fa, ncc: fb }; }
const med = (v) => { const s = v.slice().sort((a, b) => a - b); return s[s.length >> 1]; };

async function run(mode) {
  console.log(`\n[${mode}] ${GENRE} seed ${SEED}, ${SECS} s`);
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--enable-blink-features=AudioContextPlayoutStats'] }), ctxB = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); await ctxB.addInitScript((m) => { try { localStorage.setItem('forge.engine2', m); } catch (e) { /* default engine */ } }, mode);
  const page = await ctxB.newPage(), errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/fonts|net::/.test(m.text())) errors.push(m.text()); });
  await page.goto('http://localhost:8765/test.html'); await page.waitForTimeout(600); const F = (fn, a) => page.evaluate(fn, a);
  await F(() => { window.__cmds = []; window.__forge.A.sendTap = (m) => window.__cmds.push(m.type === 'load' ? Object.assign({}, m, { score: null }) : JSON.parse(JSON.stringify(m))); }); /* every command the app sends the engine: replayed offline as the reference */ await F(() => window.__forge.startAudio()); const am = await F(() => window.__forge.A.mode); ok(!!am && !/fallback/i.test(am), `engine mode "${am}"`);
  await F(({ g, s }) => window.__forge.loadDeck(0, g, { seed: s, play: false }), { g: GENRE, s: SEED }); await page.waitForFunction(() => window.__forge.decks[0].score, null, { timeout: 60000 }); await page.waitForTimeout(1500);
  // play from the loudest section: the opening bars of many tracks hold no pitched notes, and the note check needs some
  const score = appScore(GENRE, SEED), peak = X.peakSectionOf(score), base = peak.bar0 * 16; await F(({ bar0 }) => { const f = window.__forge, k = f.decks[0].score.sections.findIndex((x) => x.bar0 === bar0); f.jumpTo(0, k); }, { bar0: peak.bar0 }); await page.waitForTimeout(500);
  // the app refines the track's loudness trim and palette levels shortly after loading (an analysis in a worker): let that finish, so that the whole capture is of one settled state
  await page.waitForFunction(() => { const D = window.__forge.decks[0]; return D.trim != null && !D.score.levelPending; }, null, { timeout: 60000 }); await page.waitForTimeout(800); const nPre = await F(() => window.__cmds.length); const pageKits = await F(() => JSON.parse(JSON.stringify(window.__forge.decks[0].score.kits))), kitsSame = JSON.stringify(pageKits) === JSON.stringify(JSON.parse(JSON.stringify(score.kits)));
  // the tap, the fake MIDI controller (it keeps the app's step counter next to every clock tick it is sent), and the audio clock's output timestamps
  await F(async (src) => { const f = window.__forge, ctx = f.A.ctx; await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([src], { type: 'text/javascript' }))); const tap = new AudioWorkletNode(ctx, 'forge-tap', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    window.__tap = []; window.__ots = []; tap.port.onmessage = (e) => window.__tap.push(e.data); f.A.node.connect(tap, 0); tap.connect(ctx.destination); window.__tapNode = tap;
    window.__sent = []; const inp = { id: 'in1', name: 'Fake', onmidimessage: null }, out = { id: 'out1', name: 'Fake', send: (d, t) => window.__sent.push({ d: Array.from(d), t, step: f.midi.MIDI.clkNext }) };
    f.midi.connectMidi({ inputs: { forEach: (fn) => fn(inp) }, outputs: { forEach: (fn) => fn(out) }, onstatechange: null }); f.midi.MIDI.clockOut = true;
    setInterval(() => { const o = ctx.getOutputTimestamp(); window.__ots.push({ c: o.contextTime, p: o.performanceTime, now: performance.now(), ct: ctx.currentTime, bl: ctx.baseLatency, ol: ctx.outputLatency, lat: f.A.lat }); }, 200); }, TAP);
  const under0 = await F(() => window.__forge.A.under || 0), long0 = await F(() => window.__forge.DIAG.longs.length);
  await F(() => { window.__forge.send({ type: 'seed', v: 12345 }); window.__forge.playPause(0); }); await page.waitForTimeout(SECS * 1000);
  const tel = await F(() => { const f = window.__forge; return { under: f.A.under || 0, load: f.meter.load, lufsS: f.meter.lufsS, pos: f.meter.decks[0].pos, bpm: f.meter.decks[0].bpm, longs: f.DIAG.longs.length, lat: f.A.lat, sr: f.A.ctx.sampleRate, score: (() => { const s = f.decks[0].score; return { gid: s.meta.gid, seed: s.meta.seed, name: s.meta.name }; })() }; });
  await F(() => { window.__forge.midi.MIDI.clockOut = false; }); // the clock log ends with the listening: what follows (pulling the capture out of the page) stalls the page on purpose
  // pull the capture and the MIDI log out in pieces
  const nChunks = await F(() => window.__tap.length), frames = [], L = [], R = [];
  for (let k = 0; k < nChunks; k += 40) { const part = await F(([a, b]) => { const enc = (f32) => { const u8 = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }; return window.__tap.slice(a, b).map((c) => ({ f: c.f, l: enc(c.l), r: enc(c.r) })); }, [k, Math.min(nChunks, k + 40)]);
    for (const c of part) { frames.push(c.f); const bl = Buffer.from(c.l, 'base64'), br = Buffer.from(c.r, 'base64'); L.push(new Float32Array(bl.buffer, bl.byteOffset, bl.length / 4).slice()); R.push(new Float32Array(br.buffer, br.byteOffset, br.length / 4).slice()); } }
  ok(kitsSame, 'the track the app composed is the one this tool rebuilds (same notes, same sound palette, same levels)'); if (!kitsSame) score.kits = pageKits; const cmds = await F(() => window.__cmds); const midi = await F(() => ({ sent: window.__sent.filter((x) => x.d[0] === 0xf8).map((x) => ({ t: x.t, step: x.step })), ots: window.__ots })); await browser.close();
  ok(!errors.length, `no page errors${errors.length ? ': ' + errors[0] : ''}`);
  // the audio thread never skips a frame: consecutive tap blocks are consecutive in currentFrame
  let skips = 0; for (let i = 1; i < frames.length; i++) if (frames[i] !== frames[i - 1] + 4096) skips++; ok(skips === 0, `audio thread: ${frames.length} blocks, ${skips} frame-counter skips`);
  const n = L.length * 4096, cl = new Float32Array(n), cr = new Float32Array(n); L.forEach((b, i) => cl.set(b, i * 4096)); R.forEach((b, i) => cr.set(b, i * 4096)); const sr = tel.sr;
  // trim: from 0.3 s after the first sound, to the end
  let first = 0; while (first < n && Math.abs(cl[first]) < 1e-6 && Math.abs(cr[first]) < 1e-6) first++; const start = first + Math.round(0.3 * sr);
  const file = path.join(OUT, `capture-${mode}.wav`); A.writeWavF32(file, cl.subarray(start), cr.subarray(start), sr);
  const m = score.meta, MODES_ = A.modeTable(); ok(tel.score.gid === GENRE && tel.score.seed === SEED, `the deck plays ${tel.score.gid}/${tel.score.seed} ("${tel.score.name}")`);
  // where in the score the capture lies: the meter's position at the end, minus the captured length (refined below by correlation with the offline render)
  const spsF = sr * 60 / m.bpm / 4, capSteps = (n - start) / spsF, endStep = tel.pos, approxFrom = Math.max(0, endStep - capSteps);
  const a = A.analyze(file, { bpm: m.bpm, scale: MODES_[m.mode], key: m.key, expected: A.expectedChroma(score, approxFrom, endStep) });
  ok(a.nan === 0 && a.clipped === 0, `capture: ${(n / sr).toFixed(1)} s, peak ${a.peak}, ${a.nan} NaN, ${a.clipped} samples at full scale`);
  ok(a.silenceMs <= 5 && a.stutterMs <= 1 && a.replayMs <= 0.5, `capture: silence ${a.silenceMs} ms, held frame ${a.stutterMs} ms, replayed buffer ${a.replayMs} ms (flat tops at the limiter ceiling ≤ ${a.flatTopMs} ms)`);
  { const du = tel.under - under0, clean = a.silenceMs <= 5 && a.stutterMs <= 1 && a.replayMs <= 0.5 && skips === 0; // the counter reads the sound card side; the tap sits before it. A count with a clean tap is the machine's output device, not the engine
    ok(du === 0 || clean, `engine dropout counter: ${du}${du && clean ? ' (the capture before the sound card is clean: every frame was delivered in time — the output device missed, not the engine)' : ''} · DSP load ${(tel.load * 100).toFixed(0)} % · ${tel.longs - long0} page stalls over 50 ms`); if (du && clean) console.log('    note: dropouts on a clean capture usually mean this machine is busy; rerun on a quiet machine before reading anything into it'); }
  ok(!a.tempo.pulse || Math.abs(a.tempo.bestScale - 1) <= 0.01, `the audio's pulse is at ${(a.tempo.bestScale * 100).toFixed(1)} % of the score's ${m.bpm} BPM`);
  // parity with the offline renderer: render the same score from the section start, find where the capture sits in it (cross-correlation), compare there
  const playAt = cmds.findIndex((c, k) => k >= nPre && c.type === 'play'); ok(playAt === nPre + 1 && cmds[nPre].type === 'seed', `the commands before play: ${[...new Set(cmds.slice(0, nPre).map((c) => c.type))].join(', ')}, then seed, play`); const ref = engineRef(cmds.slice(0, playAt + 1), score, sr, Math.round(n + 2 * sr)), mono = (l, r) => { const o = new Float32Array(l.length); for (let i = 0; i < l.length; i++) o[i] = (l[i] + r[i]) / 2; return o; };
  const cap = mono(cl.subarray(start), cr.subarray(start)), refm = mono(ref.L, ref.R), seg = Math.max(0, Math.round((approxFrom - base) * ref.sps)), win = Math.min(cap.length, 44100 * 6);
  // refine the position: the capture's first 6 s against the reference around the meter's estimate (± 1.5 s)
  const al = alignAt(refm, cap, sr, seg, 66150), at = al.at;
  const len = Math.min(cap.length, refm.length - at); let num = 0, den = 0, sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < len; i++) { const x = cap[i], y = refm[at + i]; sxy += x * y; sxx += x * x; syy += y * y; }
  const g = sxy / (syy + 1e-20); for (let i = 0; i < len; i++) { const d = cap[i] - g * refm[at + i]; num += d * d; den += cap[i] * cap[i]; }
  const corr = sxy / Math.sqrt(sxx * syy + 1e-20), nullDb = 10 * Math.log10(num / (den + 1e-20) + 1e-20), refStart = base + at / ref.sps;
  { const rf = path.join(OUT, `reference-${mode}.wav`); A.writeWavF32(rf, ref.L.subarray(at, at + len), ref.R.subarray(at, at + len), sr); A.writeWavF32(path.join(OUT, `aligned-${mode}.wav`), cl.subarray(start, start + len), cr.subarray(start, start + len), sr); } // the aligned pair, for listening and for the numbers' sake
  const lufs = (l, r) => { const f = path.join(OUT, `tmp-${mode}.wav`); A.writeWavF32(f, l, r, sr); return A.ffmpegLoudness(f).lufs; };
  const ffCap = lufs(cl.subarray(start, start + len), cr.subarray(start, start + len)), ffRef = lufs(ref.L.subarray(at, at + len), ref.R.subarray(at, at + len));
  const cmp = A.compare(path.join(OUT, `aligned-${mode}.wav`), path.join(OUT, `reference-${mode}.wav`)), dLufs = ffCap - ffRef;
  console.log(`  parity: the capture lies at step ${refStart.toFixed(2)} of the score (the section starts at ${base}; alignment ${al.ncc.toFixed(4)}) · LUFS ${ffCap} (capture) vs ${ffRef} (offline) · sub ${cmp.sub.corr}/${cmp.sub.nullDb} dB, bass ${cmp.bass.corr}/${cmp.bass.nullDb} dB (corr/null) · spectrum off by ≤ ${cmp.specMaxDiffDb} dB (mean ${cmp.specMeanDiffDb}) · band envelopes ${cmp.envCorrMin}…${cmp.envCorrMean} · side/mid ${cmp.sideMidDb.a} vs ${cmp.sideMidDb.b} dB · full-band corr ${corr.toFixed(5)}, null ${nullDb.toFixed(1)} dB`);
  PARITY.push({ mode, cmp, dLufs, corr, nullDb });
  ok(Math.abs(dLufs) <= 0.5, `loudness: the live engine is ${dLufs.toFixed(2)} LU from the offline one (≤ 0.5)`);
  ok(cmp.sub.corr >= 0.99 && cmp.bass.corr >= 0.99 && cmp.sub.nullDb <= -20 && cmp.bass.nullDb <= -20, `low end waveform for waveform: sub ${cmp.sub.corr} (null ${cmp.sub.nullDb} dB), bass ${cmp.bass.corr} (null ${cmp.bass.nullDb} dB) — corr ≥ 0.99, null ≤ −20 dB`);
  ok(cmp.specMaxDiffDb <= 1 && Math.abs(cmp.sideMidDb.diff) <= 1, `spectrum within ${cmp.specMaxDiffDb} dB in every third-octave band (≤ 1), stereo image within ${Math.abs(cmp.sideMidDb.diff)} dB (≤ 1)`);
  ok(cmp.envCorrMin >= 0.9, `every band's time envelope follows the offline one (lowest correlation ${cmp.envCorrMin}, ≥ 0.9)`); ok(nullDb <= -15, `full band: null depth ${nullDb.toFixed(1)} dB (≤ −15; the engine's noise runs through a block-aligned generator, a few samples of block phase remain)`);
  { const kk = { scale: MODES_[m.mode], key: m.key }, ca = A.analyze(path.join(OUT, `aligned-${mode}.wav`), kk), cb = A.analyze(path.join(OUT, `reference-${mode}.wav`), kk), x = ca.key.chroma, y = cb.key.chroma, mx = x.reduce((p, v) => p + v, 0) / 12, my = y.reduce((p, v) => p + v, 0) / 12; let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < 12; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } const cc = sxy / Math.sqrt(sxx * syy + 1e-30); ok(cc >= 0.95, `the notes heard are the notes the offline engine plays (chroma correlation ${cc.toFixed(3)}, ≥ 0.95)`); }
  // MIDI vs sound. A beat (every 4th step) is HEARD at the frame where the capture holds it: frame = capture start + (step - refStart) * sps. The audio clock says when the sound card plays a frame
  // (getOutputTimestamp pairs a context time with a performance.now() time, refreshed every 200 ms): fit them, then compare with the time the app stamped on the tick for that step.
  { const g = midi.sent.map((x) => x.step * 6 - Math.round(x.step * 6)), off = g.filter((v) => Math.abs(v) > 0.01).length; ok(off === 0, `every one of the ${g.length} clock ticks sits on the 24-per-beat grid of the score${off ? ' — ' + off + ' do not' : ''}`); }
  const pairs = midi.ots.filter((o) => o.c > 0); let offs = [], RATE = null;
  if (pairs.length > 5) { const fit = (() => { const xs = pairs.map((o) => o.c), ys = pairs.map((o) => o.p), mx = xs.reduce((s, v) => s + v, 0) / xs.length, my = ys.reduce((s, v) => s + v, 0) / ys.length; let sxy2 = 0, sxx2 = 0; xs.forEach((x, i) => { sxy2 += (x - mx) * (ys[i] - my); sxx2 += (x - mx) * (x - mx); }); const sl = sxy2 / sxx2; RATE = (sl / 1000 - 1) * 1e6; return (c) => my + sl * (c - mx); })();
    const stepToCtx = (s) => (frames[0] + start + (s - refStart) * ref.sps) / sr; // the capture's first frame is frames[0]; context time = frame / sr
    for (const t of midi.sent) { if (t.step == null || Math.abs(t.step - Math.round(t.step / 4) * 4) > 1e-3) continue; const s = Math.round(t.step / 4) * 4; if (s < refStart + 2 || s > refStart + len / ref.sps - 2) continue; offs.push(t.t - fit(stepToCtx(s))); } }
  { const ls = midi.ots.filter((o) => o.c > 0 && o.ct > o.c).map((o) => (o.ct - o.c) * 1000), la = midi.ots.length ? midi.ots[midi.ots.length - 1] : null; if (ls.length) tel.measLat = med(ls); if (la) tel.lastBL = la.bl * 1000, tel.lastOL = la.ol * 1000, tel.appLatNow = la.lat; }
  if (RATE != null) console.log(`    sound card clock against the system clock: ${RATE.toFixed(0)} ppm`);
  if (process.env.CAPDBG) console.log('    offsets by beat (ms):', offs.map((v) => v.toFixed(0)).join(' '));
  if (offs.length > 8) { const md = med(offs), sd = Math.sqrt(offs.reduce((s, v) => s + (v - md) * (v - md), 0) / offs.length); console.log(`  MIDI clock vs sound: ${offs.length} beats, the tick is stamped ${md.toFixed(1)} ms after the sound card plays the beat (spread ${sd.toFixed(1)} ms); the app's latency estimate was ${tel.lat.toFixed(1)} ms at the start and ${tel.appLatNow != null ? tel.appLatNow.toFixed(1) : 'n/a'} ms at the end; the audio clock measures ${tel.measLat != null ? tel.measLat.toFixed(1) : 'n/a'} ms between rendering and playing (base ${tel.lastBL != null ? tel.lastBL.toFixed(1) : 'n/a'} + output ${tel.lastOL != null ? tel.lastOL.toFixed(1) : 'n/a'})`);  if (RATE != null && Math.abs(RATE) > 1000) console.log(`    note: this machine's audio clock runs ${RATE.toFixed(0)} ppm off its system clock (a sound card is within ~100–200 ppm): the offset above is not judged, the tick-to-beat offset is meaningless while the two clocks walk apart`); else ok(Math.abs(md) <= 20 && sd <= 10, `MIDI clock lines up with the sound: ${md.toFixed(1)} ms ± ${sd.toFixed(1)} (|offset| ≤ 20 ms, spread ≤ 10 ms)`); }
  else ok(false, 'MIDI clock vs sound: not enough beats to compare');
  return { mode, a, corr, nullDb, offs };
}
(async () => { fs.mkdirSync(OUT, { recursive: true }); const res = []; for (const m of MODES) res.push(await run(m).catch((e) => { console.log('  ✗ ' + e.message); fails++; return null; }));
  console.log(fails ? `\ncapture: ${fails} failure(s)` : '\ncapture: all checks pass'); process.exit(fails ? 1 : 0); })();
