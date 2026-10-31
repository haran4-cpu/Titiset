// export: the WAV and the stems zip a player downloads — valid files (RIFF/WAVE 16-bit stereo 44.1 kHz; float stems; a zip whose CRCs check),
// the whole track plus its tail, the mix at the live loudness, stems that are not silent. Usage: node tools/export_test.cjs [outdir]
const { chromium } = require('./lib/dep.cjs')('playwright'); const fs = require('fs'), zlib = require('zlib'); const OUT = process.argv[2] || '.';
let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
// (v9.2) the mix is 16-bit PCM (format 1), the stems 32-bit float (format 3): frames and level read in the file's own format
const wavInfo = (b) => { const fmt = b.readUInt16LE(20), ch = b.readUInt16LE(22), bits = b.readUInt16LE(34), bps = bits / 8, fl = fmt === 3;
  return { riff: b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WAVE', fmt, ch, sr: b.readUInt32LE(24), bits, frames: b.readUInt32LE(40) / (ch * bps),
    rms: (() => { let e = 0, n = 0; for (let i = 44; i + bps <= b.length; i += bps * 50) { const v = fl ? b.readFloatLE(i) : b.readInt16LE(i) / 32768; e += v * v; n++; } return 10 * Math.log10(e / n + 1e-12); })() }; };
(async () => { const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const p = await b.newPage({ acceptDownloads: true }); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8765/test.html'); await p.waitForTimeout(400); await p.selectOption('#startGenre', 'deep-house'); await p.uncheck('#startAuto'); await p.click('#go');
  await p.waitForFunction(() => window.__forge.meter && window.__forge.meter.decks[0].playing, null, { timeout: 60000 }); await p.waitForTimeout(2000);
  const secs = await p.evaluate(() => { const s = window.__forge.decks[0].score; return s.meta.bars * 16 * 15 / s.meta.bpm; });
  await p.evaluate(() => window.__forge.setLoop(0, 8)); // (the deck loops 8 bars: both exports together may outlast the track, and the check is that exporting never stops the music)
  let t0 = Date.now(), dl = p.waitForEvent('download', { timeout: 240000 }); await p.click('.deck[data-d="0"] [data-export="wav"]'); let d = await dl; const wf = OUT + '/' + d.suggestedFilename(); await d.saveAs(wf); const wt = (Date.now() - t0) / 1000;
  const w = wavInfo(fs.readFileSync(wf)); ok(w.riff && w.ch === 2 && w.sr === 44100 && w.bits === 16, `WAV ${d.suggestedFilename()}: 16-bit stereo 44.1 kHz`);
  ok(Math.abs(w.frames / 44100 - (secs + 4)) < 0.2, `the whole track + 4 s tail: ${(w.frames / 44100).toFixed(1)} s (track ${secs.toFixed(1)} s) · rendered in ${wt.toFixed(0)} s (${(secs / wt).toFixed(1)}× real time)`);
  ok(w.rms > -24 && w.rms < -6, `mix level ${w.rms.toFixed(1)} dBFS RMS`);
  t0 = Date.now(); dl = p.waitForEvent('download', { timeout: 720000 }); /* (v9.2) the stems export renders the whole track six times so the stems add up to the mix: about the track's length, more on a loaded machine */ await p.click('.deck[data-d="0"] [data-export="stems"]'); d = await dl; const zf = OUT + '/' + d.suggestedFilename(); await d.saveAs(zf);
  const z = fs.readFileSync(zf); let o = 0; const ents = []; while (z.readUInt32LE(o) === 0x04034b50) { const crc = z.readUInt32LE(o + 14), size = z.readUInt32LE(o + 18), nl = z.readUInt16LE(o + 26), name = z.toString('utf8', o + 30, o + 30 + nl), data = z.subarray(o + 30 + nl, o + 30 + nl + size); ents.push({ name, data, ok: zlib.crc32 ? zlib.crc32(data) === crc : true, w: wavInfo(data) }); o += 30 + nl + size; }
  ok(ents.length === 6 && ents.every((e) => e.ok && e.w.riff && e.w.frames === w.frames), `stems zip ${d.suggestedFilename()}: ${ents.map((e) => e.name.split('-').slice(-1)[0]).join(', ')} — CRCs valid, all the same length (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  { const mixE = ents.find((e) => /mix\.wav$/.test(e.name)), st = ents.filter((e) => !/mix\.wav$/.test(e.name)); let em = 0, ed = 0;
    if (mixE && st.length === 5) { const n = Math.min(mixE.w.frames, ...st.map((e) => e.w.frames)) * 2; for (let i = 0; i < n; i += 7) { const m = mixE.data.readInt16LE(44 + 2 * i) / 32768; let sum = 0; for (const e of st) sum += e.data.readFloatLE(44 + 4 * i); em += m * m; ed += (sum - m) * (sum - m); } }
    ok(em > 0 && 10 * Math.log10(ed / em) < -50, `the five float stems add up to the mix: ${(10 * Math.log10(ed / em + 1e-30)).toFixed(1)} dB under it (≤ −50; 9.1's integer stems were 4.5 dB hot and clipped)`); }
  ok(ents.filter((e) => !/mix|fx/.test(e.name)).every((e) => e.w.rms > -60), `stems carry sound: ${ents.map((e) => e.name.replace(/.*-/, '').replace('.wav', '') + ' ' + e.w.rms.toFixed(0)).join(' · ')} dBFS`);
  ok(await p.evaluate(() => window.__forge.decks[0].playing), 'the deck kept playing during both exports'); ok(!errs.length, 'no page errors' + (errs.length ? ': ' + errs[0] : ''));
  await b.close(); console.log(fails ? `${fails} failure(s)` : 'export: all checks pass'); process.exit(fails ? 1 : 0); })();
