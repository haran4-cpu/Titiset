// the page inside a Claude viewer — a stand-in `window.claude` that exists before any page script runs (the viewer's contract: claude.use('sample' | 'downloads')).
// Ask bar: the Claude choice appears, a request goes to sample.json with the cache off (the same words must write a NEW track) and a Stop signal, and the reply plays.
// Files: a plain <a download> is inert inside a viewer, so every file goes out through the Downloads capability. The .wav that its allowlist refuses (rejected_extension) is offered
// again inside a .zip (CRCs valid), a declined or failed save is reported as such, and "Saved" is never shown for a file that was not saved.
// Usage: node tools/hosted_test.cjs [outdir]
const { chromium } = require('./lib/dep.cjs')('playwright'); const zlib = require('zlib'), fs = require('fs'); const OUT = process.argv[2] || '.';
let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/fonts|net::/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(() => {
    window.__dl = []; window.__dlData = []; window.__calls = []; window.__mode = { reject: ['wav', 'ogg', 'm4a'], decline: false, fail: null }; window.__reply = null;
    const dl = { save: async (req) => { const ext = ((/\.([A-Za-z0-9]+)$/.exec(req.filename) || [])[1] || '').toLowerCase(), M = window.__mode; window.__dl.push(req.filename);
      if (M.decline) throw { code: 'declined', message: 'the viewer said no' }; if (M.fail) throw { code: M.fail, message: 'stand-in failure' }; if (M.reject.includes(ext)) throw { code: 'rejected_extension', message: 'not in the allowlist' };
      window.__dlData.push({ filename: req.filename, data: req.data }); return { status: 'saved' }; } };
    const sample = Object.assign(async () => ({ text: '', truncated: false }), { json: async (input, opt) => { window.__calls.push({ cache: opt && opt.cache, tier: opt && opt.modelTier, signal: !!(opt && opt.signal && typeof opt.signal.aborted === 'boolean'), asksForScore: /(Reply|Answer) with ONLY one JSON object/.test(String(input)) }); return window.__reply; }, limits: async () => ({ maxPromptBytes: 262144 }) });
    window.claude = { use: async (name) => (name === 'downloads' ? dl : name === 'sample' ? sample : null) };
  });
  await page.goto('http://localhost:8765/test.html'); await page.click('#skip');
  const F = (fn, a) => page.evaluate(fn, a); const toast = () => F(() => document.querySelector('#toast').textContent.split('\n').pop()); // (v9.2: two messages within 1.5 s stack; the newest is the last line)
  const bytes = (k) => F(async (i) => { const d = window.__dlData[i]; if (!d) return ''; const u = new Uint8Array(await d.data.arrayBuffer()); let s = ''; for (let o = 0; o < u.length; o += 32768) s += String.fromCharCode.apply(null, u.subarray(o, o + 32768)); return btoa(s); }, k).then((b) => Buffer.from(b, 'base64'));
  const zipEntries = (z) => { let o = 0; const ents = []; while (o + 30 <= z.length && z.readUInt32LE(o) === 0x04034b50) { const crc = z.readUInt32LE(o + 14), size = z.readUInt32LE(o + 18), nl = z.readUInt16LE(o + 26), name = z.toString('utf8', o + 30, o + 30 + nl), data = z.subarray(o + 30 + nl, o + 30 + nl + size); ents.push({ name, crcOk: zlib.crc32 ? zlib.crc32(data) === crc : true, data }); o += 30 + nl + size; } return ents; };
  const saved = (n) => F((k) => window.__dl.slice(k), n); const count = () => F(() => window.__dl.length);

  // the Ask bar offers Claude, and a request that only Claude can answer goes to sample.json
  await page.waitForFunction(() => { const r = document.querySelector('.ask-claude'); return !!r && !r.hidden; }, null, { timeout: 15000, polling: 50 }).catch(() => {});
  ok(await F(() => { const r = document.querySelector('.ask-claude'); return !!r && !r.hidden && /Claude writes the score/.test(document.querySelector('#askIn').placeholder); }), 'the viewer offers `sample`: the Ask bar shows its Claude choice');
  await F(() => { window.__reply = { say: 'A short test piece', score: { forge: 1, genre: 'techno', title: 'Hosted', form: [{ section: 'intro', bars: 4 }, { section: 'drop', bars: 8 }] } }; });
  await page.fill('#askIn', 'something like rain on a window'); await page.press('#askIn', 'Enter');
  await page.waitForFunction(() => window.__forge.decks.some((D) => D.score && D.spec && D.spec.title === 'Hosted') && /A short test piece/.test(document.querySelector('#askSay').textContent), null, { timeout: 40000, polling: 50 }).catch(() => {});
  const c = await F(() => ({ calls: window.__calls, say: document.querySelector('#askSay').textContent, deck: window.__forge.decks.findIndex((D) => D.score && D.spec && D.spec.title === 'Hosted') }));
  ok(c.calls.length === 1 && c.calls[0].asksForScore && c.calls[0].cache === false && c.calls[0].tier === 'default' && c.calls[0].signal, `the request goes to sample.json with the cache off and a Stop signal: ${JSON.stringify(c.calls[0] || null)}`);
  ok(c.deck >= 0 && /A short test piece/.test(c.say), `Claude's reply plays on deck ${c.deck >= 0 ? 'AB'[c.deck] : '?'}: “${c.say}”`);
  const di = Math.max(0, c.deck);

  // a WAV: the viewer's allowlist has no audio, so the same bytes come inside a zip
  const r1 = await F(async (i) => !!(await window.__forge.exportTrack(i, false)), di); const t1 = await toast(), dl1 = await saved(0);
  ok(r1 && dl1.length === 2 && /\.wav$/.test(dl1[0]) && dl1[1] === dl1[0].replace(/\.wav$/, '.zip'), `a WAV the viewer refuses (rejected_extension) is offered again inside a zip: ${dl1.join(' → ')}`);
  const zb = await bytes(0); fs.writeFileSync(OUT + '/hosted_wav.zip', zb); const e1 = zipEntries(zb);
  ok(e1.length === 1 && e1[0].name === dl1[0] && e1[0].crcOk && e1[0].data.toString('ascii', 0, 4) === 'RIFF' && e1[0].data.toString('ascii', 8, 12) === 'WAVE' && e1[0].data.readUInt16LE(22) === 2 && e1[0].data.readUInt32LE(24) === 44100, `the zip holds that WAV (${e1.map((e) => e.name + ', ' + (e.data.length / 1e6).toFixed(1) + ' MB').join('; ')}): CRC valid, 16-bit stereo 44.1 kHz`);
  ok(/^Saved: .*\.zip — the WAV is inside this zip/.test(t1), `the message says what was saved: “${t1.slice(0, 110)}”`);

  // the stems zip is an allowed type: one offer, as it is
  let n = await count(); const r2 = await F(async (i) => !!(await window.__forge.exportTrack(i, true)), di); const t2 = await toast(), dl2 = await saved(n);
  ok(r2 && dl2.length === 1 && /-stems\.zip$/.test(dl2[0]) && /^Saved: .*-stems\.zip ·/.test(t2) && !/inside this zip/.test(t2), `the stems zip is offered once, as it is: ${dl2.join(', ')} → “${t2.slice(0, 60)}”`);
  const e2 = zipEntries(await bytes(1)); ok(e2.length === 6 && e2.every((e) => e.crcOk && e.data.toString('ascii', 0, 4) === 'RIFF'), `…and holds ${e2.length} WAV files with valid CRCs`);

  // the viewer says no: reported as not saved, not offered a second time
  await F(() => { window.__mode.decline = true; }); n = await count(); await F(async (i) => { await window.__forge.exportTrack(i, false); }, di); const t3 = await toast(), dl3 = await saved(n);
  ok(dl3.length === 1 && /\.wav$/.test(dl3[0]) && /^Not saved \(declined\)/.test(t3), `a declined save is reported and not retried: ${dl3.join(', ')} → “${t3.slice(0, 70)}”`);

  // the capability fails: the person is told, and no "Saved" follows
  await F(() => { window.__mode.decline = false; window.__mode.fail = 'unavailable'; }); n = await count(); await F(async (i) => { await window.__forge.exportTrack(i, true); }, di); const t4 = await toast(), dl4 = await saved(n);
  ok(dl4.length === 1 && /^Could not save .*\(unavailable\)/.test(t4) && !/Saved/.test(t4), `a failed save says so: “${t4.slice(0, 90)}”`);

  // the health report is a .json: allowed
  await F(() => { window.__mode.fail = null; }); n = await count(); await F(async () => { await window.__forge.health.saveReport(); }); const t5 = await toast(), dl5 = await saved(n);
  ok(dl5.length === 1 && /^forge-report-.*\.json$/.test(dl5[0]) && /^Report saved: /.test(t5), `the health report goes out through the capability: ${dl5.join(', ')} → “${t5.slice(0, 40)}”`);
  ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));

  // a worker FILE the page cannot load (a content policy, a missing file in a hosted copy): every non-blob worker here fails at once. The composer must not give up for good —
  // the next call builds the same code from a blob and the tracks keep coming, off the page's thread
  const p2 = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); const errs2 = []; p2.on('pageerror', (e) => { if (!/blocked by the content policy/.test(e.message)) errs2.push(e.message); }); p2.on('console', (m) => { if (m.type() === 'error' && !/fonts|net::|blocked by the content policy/.test(m.text())) errs2.push(m.text()); });
  await p2.addInitScript(() => { window.__w = []; const W0 = window.Worker; window.Worker = class extends W0 { constructor(u, o) { const s = String(u), blob = s.startsWith('blob:'); super(blob ? u : 'data:text/javascript,throw new Error("blocked by the content policy")', o); this.__r = { src: blob ? 'blob' : s, types: [] }; window.__w.push(this.__r); } postMessage(m, t) { if (m && m.type) this.__r.types.push(m.type); return super.postMessage(m, t); } }; });
  await p2.goto('http://localhost:8765/test.html'); await p2.click('#skip');
  await p2.fill('#askIn', 'dark melodic techno'); await p2.press('#askIn', 'Enter');
  await p2.waitForFunction(() => window.__forge.decks.some((D) => D.score && D.score.meta.gid === 'melodic-techno'), null, { timeout: 40000, polling: 50 }).catch(() => {});
  ok(await p2.evaluate(() => window.__forge.decks.some((D) => D.score && D.score.meta.gid === 'melodic-techno')), 'with the worker file blocked, the first track still loads (that call composes on the page)');
  await p2.fill('#askIn', 'more energy'); await p2.press('#askIn', 'Enter');
  await p2.waitForFunction(() => window.__w.some((r) => r.src === 'blob' && r.types.some((t) => t === 'compose' || t === 'compile')), null, { timeout: 30000, polling: 50 }).catch(() => {});
  const w2 = await p2.evaluate(() => window.__w.map((r) => r.src + ':' + [...new Set(r.types)].join('/')));
  ok(w2.length > 0 && /forge-analysis\.js/.test(w2[0]) && w2.some((s) => /^blob:.*(compose|compile)/.test(s)), `the composer asks for its blob copy after the file failed: ${w2.join(', ')}`);
  ok(!errs2.length, 'no other page errors' + (errs2.length ? ': ' + errs2.slice(0, 3).join(' | ') : ''));
  await browser.close(); console.log(fails ? `${fails} failure(s)` : 'hosted: all checks pass'); process.exit(fails ? 1 : 0);
})();
