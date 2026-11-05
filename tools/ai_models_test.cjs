// browser test of the AI models (v9): the Ask bar hands a request to the provider the person picked, with their key, and plays the
// score that comes back. The providers are stood in by intercepting their real URLs (nothing leaves the machine):
//   - OpenAI-compatible (OpenRouter): the first reply is INVALID → the validator's messages go back once → the corrected score plays
//   - Gemini: JSON mode, system instruction, the key in the x-goog-api-key header → a new track on the idle deck, mixed in
//   - Anthropic: the direct-browser header and the key → an EDIT of the playing score (the current score is sent along)
//   - errors: a refused key, a rate limit and a request bigger than the plan takes are reported in words, nothing plays, nothing breaks
//   - Ollama: its own API with a context big enough for the format guide (its default would cut it) → the local model's track plays
//   - Test in the settings sends the full format guide (a plan too small for it shows there, not on the first track)
// Usage: node tools/ai_models_test.cjs <outdir>
const { chromium } = require('./lib/dep.cjs')('playwright');
const OUT = process.argv[2] || '.'; let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
(async () => { const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message + ' @ ' + String(e.stack).split('\n').slice(1, 3).join(' '))); page.on('console', (m) => { if (m.type() === 'error' && !/fonts|net::|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const calls = []; let mode = 'ok';
  const score = (genre, title, extra) => Object.assign({ forge: 1, genre, title, bpm: genre === 'psytrance' ? 144 : 124 }, extra || {});
  await page.route('https://openrouter.ai/api/v1/chat/completions', async (route) => { const b = JSON.parse(route.request().postData()); calls.push({ p: 'openrouter', auth: route.request().headers().authorization, b });
    if (mode === 'big') return route.fulfill({ status: 413, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: { message: 'Request too large for model `openai/gpt-oss-120b` on tokens per minute (TPM): Limit 8000, Requested 9512' } }) });
    const n = calls.filter((c) => c.p === 'openrouter').length; const sc = n === 1 ? score('psytrance', 'Bad first try', { bpm: 999, sound: { bass: { preset: 'no-such-sound' } } }) : score('psytrance', 'Fixed by the validator');
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ choices: [{ message: { content: '```json\n' + JSON.stringify({ say: n === 1 ? 'first' : 'A full-on psy track', score: sc }) + '\n```' } }] }) }); });
  await page.route(/generativelanguage\.googleapis\.com\/v1beta\/models\/.*:generateContent/, async (route) => { const b = JSON.parse(route.request().postData()); calls.push({ p: 'gemini', key: route.request().headers()['x-goog-api-key'], url: route.request().url(), b });
    if (mode === 'key') return route.fulfill({ status: 403, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: { message: 'API key not valid' } }) });
    if (mode === 'rate') return route.fulfill({ status: 429, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: { message: 'Resource exhausted' } }) });
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ say: 'Deep and warm', action: 'new', score: score('deep-house', 'Gemini wrote this', { mood: 'deep' }) }) }] } }] }) }); });
  await page.route('https://api.anthropic.com/v1/messages', async (route) => { const h = route.request().headers(), b = JSON.parse(route.request().postData()); calls.push({ p: 'anthropic', key: h['x-api-key'], direct: h['anthropic-dangerous-direct-browser-access'], b });
    const cur = /Current score:\n(\{.*\})\n/s.exec(b.messages[0].content); const sc = cur ? Object.assign(JSON.parse(cur[1]), { title: 'Edited by Claude API', mix: { heat: 1.6 } }) : score('techno', 'x');
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ content: [{ type: 'text', text: JSON.stringify({ say: 'Warmer and dirtier', action: 'edit', score: sc }) }] }) }); });
  await page.route('http://localhost:11434/api/chat', async (route) => { const b = JSON.parse(route.request().postData()); calls.push({ p: 'ollama', b });
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ model: b.model, done: true, message: { role: 'assistant', content: JSON.stringify({ say: 'A dark roller', action: 'new', score: score('techno', 'Ollama wrote this') }) } }) }); });
  await page.addInitScript(() => { localStorage.setItem('forge.ai', JSON.stringify({ use: 'openrouter', chosen: true, always: true, p: { openrouter: { key: 'sk-or-test', model: 'openai/gpt-oss-120b:free' }, gemini: { key: 'AIza-test' }, anthropic: { key: 'sk-ant-test' } } })); });
  await page.goto('http://localhost:8765/test.html'); await page.waitForTimeout(600); await page.click('#skip'); await page.waitForTimeout(200);
  const F = (fn, a) => page.evaluate(fn, a); const ask = async (t) => { await page.fill('#askIn', t); await page.press('#askIn', 'Enter'); };
  const opts = await F(() => Array.from(document.querySelectorAll('#askModel option')).map((o) => o.value));
  ok(opts.includes('openrouter') && opts.includes('gemini') && opts.includes('anthropic') && opts.includes('builtin'), `the picker offers the configured models (${opts.join(', ')})`);
  ok(await F(() => document.querySelector('#askModel').value === 'openrouter'), 'the saved choice is selected');
  // 1 · OpenRouter: invalid first answer → one round of validator corrections → the fixed score plays
  await ask('a psytrance version of a song I love'); await page.waitForFunction(() => window.__forge.decks.some((D) => D.spec && D.spec.title === 'Fixed by the validator'), null, { timeout: 30000, polling: 50 }).catch(() => {});
  const or = calls.filter((c) => c.p === 'openrouter');
  ok(or.length === 2, `OpenRouter asked twice: the answer, then the corrections (${or.length})`);
  ok(or[0] && or[0].auth === 'Bearer sk-or-test' && or[0].b.model === 'openai/gpt-oss-120b:free' && or[0].b.response_format && or[0].b.messages[0].role === 'system' && /FORGE Score Format/.test(or[0].b.messages[0].content) && /NEVER copy its melody/.test(or[0].b.messages[0].content), 'the key, the model, JSON mode, and the system prompt (the format card + the rules for versions of existing songs)');
  { const fixMsg = or[1] && or[1].b.messages[3] ? or[1].b.messages[3].content : ''; // (v9.2) the exact lines, not just a path: 9.1 sent "- bpm: undefined" and this check passed
    ok(or[1] && or[1].b.messages.length === 4 && /validator rejected/.test(fixMsg) && /^- bpm: must be a number 50…220$/m.test(fixMsg) && /^- sound\.bass\.preset: .*no-such-sound.*\(fix: /m.test(fixMsg) && !/undefined/.test(fixMsg), `the second request carries the validator’s messages and fixes, word for word (${JSON.stringify(fixMsg.split('\n').slice(1, 3))})`); }
  const d1 = await F(() => { const i = window.__forge.decks.findIndex((D) => D.spec && D.spec.title === 'Fixed by the validator'); const D = window.__forge.decks[i]; return { i, gid: D && D.score && D.score.meta.gid, say: document.querySelector('#askSay').textContent }; });
  ok(d1.i >= 0 && d1.gid === 'psytrance' && /full-on psy/.test(d1.say), `the corrected score plays (${JSON.stringify(d1)})`);
  // 2 · Gemini: a new track while one plays → the idle deck, mixed in
  await F(() => { const s = document.querySelector('#askModel'); s.value = 'gemini'; s.dispatchEvent(new Event('change')); });
  await ask('something deep and warm for the sunrise'); await page.waitForFunction(() => window.__forge.decks.some((D) => D.spec && D.spec.title === 'Gemini wrote this'), null, { timeout: 30000, polling: 50 }).catch(() => {});
  const g = calls.filter((c) => c.p === 'gemini')[0];
  ok(g && g.key === 'AIza-test' && /models\/gemini-flash-latest:generateContent/.test(g.url) && g.b.generationConfig.responseMimeType === 'application/json' && /FORGE Score Format/.test(g.b.systemInstruction.parts[0].text), 'Gemini: key header, model, JSON mode, system instruction');
  await page.waitForFunction(() => !!window.__forge.tx, null, { timeout: 10000 }).catch(() => {}); // (the mix is armed a moment after the track is ready)
  const d2 = await F(() => ({ decks: window.__forge.decks.map((D) => D.spec && D.spec.title), tx: !!window.__forge.tx }));
  ok(d2.decks.includes('Gemini wrote this') && d2.decks.includes('Fixed by the validator') && d2.tx, `Gemini's track on the other deck, mixing in (${JSON.stringify(d2)})`);
  // 3 · Anthropic: an edit of the playing track carries the current score; the answer replaces it on the next 4-bar line
  await F(() => { const s = document.querySelector('#askModel'); s.value = 'anthropic'; s.dispatchEvent(new Event('change')); });
  const leadTitle = await F(() => { const f = window.__forge; return f.decks[f.meter ? f.meter.lead : 0].spec.title; });
  await ask('make it warmer and dirtier'); await page.waitForFunction(() => window.__forge.decks.some((D) => D.spec && D.spec.title === 'Edited by Claude API'), null, { timeout: 30000, polling: 50 }).catch(() => {});
  const an = calls.filter((c) => c.p === 'anthropic')[0];
  ok(an && an.key === 'sk-ant-test' && an.direct === 'true' && an.b.model === 'claude-sonnet-5-5' && /FORGE Score Format/.test(an.b.system) && /Current score:/.test(an.b.messages[0].content), `Anthropic: key, direct-browser header, the current score sent along (lead deck was “${leadTitle}”)`);
  ok(await F(() => window.__forge.decks.some((D) => D.spec && D.spec.title === 'Edited by Claude API' && D.spec.mix && D.spec.mix.heat === 1.6)), 'the edit is applied to the playing deck');
  await page.waitForFunction(() => /Warmer/.test(document.querySelector('#askSay').textContent), null, { timeout: 15000 }).catch(() => {});
  // 4 · errors: a refused key and a rate limit are reported in words; nothing new plays
  await F(() => { const s = document.querySelector('#askModel'); s.value = 'gemini'; s.dispatchEvent(new Event('change')); });
  mode = 'key'; await ask('anything at all'); await page.waitForFunction(() => /refused/.test(document.querySelector('#askSay').textContent), null, { timeout: 15000 }).catch(() => {});
  ok(await F(() => /key was refused/.test(document.querySelector('#askSay').textContent)), 'a refused key is reported: ' + await F(() => document.querySelector('#askSay').textContent));
  mode = 'rate'; await ask('anything again'); await page.waitForFunction(() => /rate limit/.test(document.querySelector('#askSay').textContent), null, { timeout: 15000 }).catch(() => {});
  ok(await F(() => /rate limit/.test(document.querySelector('#askSay').textContent)), 'a rate limit is reported: ' + await F(() => document.querySelector('#askSay').textContent));
  // 4b · a request bigger than the plan takes (a free per-minute token limit, a small context) is named as such
  await F(() => { const s = document.querySelector('#askModel'); s.value = 'openrouter'; s.dispatchEvent(new Event('change')); });
  mode = 'big'; await ask('one more track please'); await page.waitForFunction(() => /bigger than this model/.test(document.querySelector('#askSay').textContent), null, { timeout: 15000 }).catch(() => {});
  ok(await F(() => /bigger than this model/.test(document.querySelector('#askSay').textContent)), 'a request too big for the plan is reported: ' + await F(() => document.querySelector('#askSay').textContent));
  // 4c · Ollama through its own API, with a context big enough for the format guide → the track plays
  mode = 'ok'; await F(() => { const s = document.querySelector('#askModel'); s.value = 'ollama'; s.dispatchEvent(new Event('change')); });
  // (v9.2) a new track asked for during a mix waits for the mix and loads on the deck it frees (the Gemini track is still mixing in)
  await ask('a dark techno roller'); await page.waitForFunction(() => window.__forge.decks.some((D) => D.spec && D.spec.title === 'Ollama wrote this'), null, { timeout: 150000, polling: 50 }).catch(() => {});
  const ol = calls.filter((c) => c.p === 'ollama')[0], ctx = ol && ol.b.options && ol.b.options.num_ctx;
  ok(ol && ctx >= 16384 && ol.b.stream === false && ol.b.format === 'json' && ol.b.messages[0].role === 'system' && /FORGE Score Format/.test(ol.b.messages[0].content), `Ollama: its own API, a ${ctx}-token context, JSON, the format guide as the system message`);
  ok(await F(() => window.__forge.decks.some((D) => D.spec && D.spec.title === 'Ollama wrote this')), 'the local model’s track plays');
  // 5 · the settings dialog opens, lists every provider, and a key typed there is kept
  await page.click('#askSetup'); await page.waitForTimeout(200);
  const dl = await F(() => ({ open: document.querySelector('#aiDlg').open, n: document.querySelectorAll('#aiDlg .ai-p').length }));
  ok(dl.open && dl.n >= 10, `the settings dialog lists the providers (${dl.n})`); await page.screenshot({ path: OUT + '/ai_models.png' });
  const nOr = calls.filter((c) => c.p === 'openrouter').length; await F(() => { document.querySelector('#aiDlg .ai-p[data-p="openrouter"]').open = true; }); await page.click('#aiDlg .ai-p[data-p="openrouter"] [data-act=test]');
  await page.waitForFunction(() => /works|✗/.test(document.querySelector('#aiDlg .ai-p[data-p="openrouter"] [data-say]').textContent), null, { timeout: 15000 }).catch(() => {});
  const tc = calls.filter((c) => c.p === 'openrouter')[nOr], tsay = await F(() => document.querySelector('#aiDlg .ai-p[data-p="openrouter"] [data-say]').textContent);
  ok(tc && /FORGE Score Format/.test(tc.b.messages[0].content) && /Connection test/.test(tc.b.messages[1].content) && /works with the full format guide/.test(tsay), `Test sends the full format guide (${tsay})`);
  await page.click('#aiDlg .ai-p[data-p="groq"] summary'); await page.fill('#aiDlg .ai-p[data-p="groq"] input[data-k="key"]', 'gsk-test'); await page.press('#aiDlg .ai-p[data-p="groq"] input[data-k="key"]', 'Tab');
  ok(await F(() => JSON.parse(localStorage.getItem('forge.ai')).p.groq.key === 'gsk-test' && Array.from(document.querySelectorAll('#askModel option')).some((o) => o.value === 'groq')), 'a key typed in the dialog is kept, and the model appears in the picker');
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(200); await page.screenshot({ path: OUT + '/ai_models_phone.png' });
  const fit = await F(() => { const d = document.querySelector('#aiDlg .ai-in').getBoundingClientRect(); return d.left >= 0 && d.right <= window.innerWidth + 1; }); ok(fit, 'the dialog fits a phone screen');
  ok(errors.length === 0, `no page errors (${errors.slice(0, 3).join(' | ')})`);
  await browser.close(); console.log(fails ? `${fails} failure(s)` : 'ai models: all checks pass'); process.exit(fails ? 1 : 0); })();
