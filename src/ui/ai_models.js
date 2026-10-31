// ---------------------------------------------------------------- AI MODELS (v9: any model writes the score)
// The Ask bar can hand a request to a language model, which answers with a FORGE score (the format card is the system prompt).
// Inside Claude the page uses Claude through the `sample` capability (no key, part of the person's plan). Opened from disk or
// any web server, the page talks DIRECTLY to the provider the person picks, with their own key: Google Gemini (free tier),
// OpenRouter (free models, including OpenAI's open GPT models), Groq (free tier), OpenAI, Anthropic, Mistral, Pollinations,
// a model running on the person's own computer (Ollama, LM Studio), or any OpenAI-compatible endpoint. Keys are kept in this
// browser only (localStorage; opened as a file, for the session unless the person asks) and are sent to nobody but the provider they belong to.
const AI_PROVIDERS = [
  { id: 'claude', label: 'Claude (inside Claude)', kind: 'sample', note: 'No key — it uses your Claude plan. Only when FORGE runs as a Claude page.' },
  { id: 'gemini', label: 'Google Gemini', kind: 'gemini', base: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-flash-latest', keyUrl: 'https://aistudio.google.com/apikey', note: 'Free tier with a Google AI Studio key. The free daily quota is small on Flash and much larger on Flash-Lite: type gemini-flash-lite-latest in Model if you hit the limit.' },
  { id: 'openrouter', label: 'OpenRouter — free models (GPT-OSS, Llama, Gemma, Qwen…)', kind: 'openai', base: 'https://openrouter.ai/api/v1', model: 'openai/gpt-oss-120b:free', keyUrl: 'https://openrouter.ai/keys', note: 'A free key; models whose id ends in :free cost nothing (rate-limited).', publicModels: true },
  { id: 'groq', label: 'Groq (Llama 4, GPT-OSS — fast)', kind: 'openai', base: 'https://api.groq.com/openai/v1', model: 'meta-llama/llama-4-scout-17b-16e-instruct', keyUrl: 'https://console.groq.com/keys', note: 'Free tier with a free key. Its per-minute token limit is small: Llama 4 Scout takes FORGE’s format guide (about 9,000 tokens) in one request; GPT-OSS on Groq needs its paid tier.' },
  { id: 'openai', label: 'OpenAI (GPT)', kind: 'openai', base: 'https://api.openai.com/v1', model: 'gpt-5-mini', keyUrl: 'https://platform.openai.com/api-keys', note: 'Paid key (billed by OpenAI).' },
  { id: 'anthropic', label: 'Anthropic API (Claude)', kind: 'anthropic', base: 'https://api.anthropic.com/v1', model: 'claude-sonnet-5-5', keyUrl: 'https://console.anthropic.com/settings/keys', note: 'Paid key (billed by Anthropic).' },
  { id: 'mistral', label: 'Mistral', kind: 'openai', base: 'https://api.mistral.ai/v1', model: 'mistral-small-latest', keyUrl: 'https://console.mistral.ai/api-keys', note: 'Free “Experiment” tier with a key.' },
  { id: 'pollinations', label: 'Pollinations', kind: 'openai', base: 'https://gen.pollinations.ai/v1', model: 'openai', keyUrl: 'https://enter.pollinations.ai', note: 'Free daily credits with a key.' },
  { id: 'ollama', label: 'On this computer: Ollama', kind: 'ollama', base: 'http://localhost:11434', model: 'llama3.1', noKey: true, note: 'Free and private. Start Ollama with OLLAMA_ORIGINS=* so a web page may talk to it. FORGE asks it for a 24K-token context (the format guide alone is about 9,000 tokens, more than Ollama’s default); an 8B model works, a bigger one writes better.' },
  { id: 'lmstudio', label: 'On this computer: LM Studio', kind: 'openai', base: 'http://localhost:1234/v1', model: '', noKey: true, note: 'Free and private. Turn on the local server and CORS in LM Studio, and load the model with a context length of 24K or more (the format guide alone is about 9,000 tokens).' },
  { id: 'custom', label: 'Any OpenAI-compatible endpoint', kind: 'openai', base: '', model: '', note: 'Base URL ending in /v1, a key if it needs one, and a model id.' },
];
const AI = { cfg: { use: 'builtin', always: false, p: {} }, models: {}, history: [] };
function aiLoad() { try { const j = JSON.parse(localStorage.getItem('forge.ai') || 'null'); if (j && typeof j === 'object') AI.cfg = Object.assign(AI.cfg, j, { p: Object.assign({}, j.p || {}) }); } catch (e) { /* storage unavailable: settings last this session */ } }
// (v9.2) opened from disk, every HTML file the person opens from disk shares what the browser stores for files (Chromium: one file://
// origin), so a saved key could be read by any of them (measured on 9.1: another file in another folder read 'forge.ai'). There the
// keys are kept for the session only, unless the person asks to remember them; served or hosted, the page's storage is its own
const AI_FILE = typeof location !== 'undefined' && location.protocol === 'file:';
function aiSave() { try { let c = AI.cfg; if (AI_FILE && !c.keepKeys) { c = Object.assign({}, c, { p: {} }); for (const k in AI.cfg.p) { const o = Object.assign({}, AI.cfg.p[k]); delete o.key; c.p[k] = o; } }
  localStorage.setItem('forge.ai', JSON.stringify(c)); } catch (e) { /* storage unavailable */ } }
function aiProv(id) { return AI_PROVIDERS.find((p) => p.id === id) || null; }
function aiSet(id) { const P = aiProv(id), c = AI.cfg.p[id] || {}; return { key: c.key || '', model: c.model || (P && P.model) || '', base: (c.base || (P && P.base) || '').replace(/\/+$/, '') }; }
function aiReady(id) { const P = aiProv(id); if (!P) return false; if (P.kind === 'sample') return !!ASK.sample; const s = aiSet(id); return !!s.base && !!s.model && (P.noKey || id === 'custom' || !!s.key); }
function aiLabel(id) { const P = aiProv(id); if (!P) return 'Built-in'; const s = aiSet(id); return P.kind === 'sample' ? 'Claude' : `${P.label.split(' (')[0].split(' —')[0]}${s.model ? ' · ' + s.model.replace(/^.*\//, '').replace(/:free$/, ' (free)') : ''}`; }

// ---- the prompt: the score format card, how to write for this engine, and the rules for versions of existing songs ----
const AI_RULES = `You are FORGE's composer: a professional electronic-music producer who writes complete FORGE scores (JSON) that the FORGE engine plays.
Write like a producer, not like a demo: the genre's real tempo, groove, bass grammar and sound palette (use the presets whose descriptions name the genre — e.g. psytrance: kick psy-kick, snare psy-snare, hats psy-hats, bass psy-roll or psy-fm-roll, lead psy-acid / squelch, pad psy-pad); an arrangement with a story (intro → groove → breakdown → build → drop → outro, or the genre's own form); melodies with a hook, a question and an answer, and room to breathe; harmony that serves the mood.
VERSIONS OF EXISTING SONGS: when the request names an existing song, artist or style, capture what makes it recognisable as a STYLE — tempo, key and mode, groove, chord progression (progressions are free to use), arrangement, sound palette, energy and mood — but NEVER copy its melody, hook, riff or lyrics note for note: they are protected. Write an ORIGINAL melody in its spirit: its own notes and phrasing, never the original transposed, re-rhythmed or slightly varied. Traditional and public-domain tunes (folk songs, classical works whose composers died long ago) may be quoted. Say in "say" what you took from the reference.
Answer with ONLY one JSON object, no prose and no code fence: {"say": "<one short sentence for the DJ: what you made>", "action": "new" | "edit", "score": <the complete FORGE score>}.`;
function aiSystem() { return PROMPT_CARD + '\n\n---\n' + AI_RULES; }
function aiUser(text, cur) { return (cur ? 'A deck is playing the score below. If the request asks to CHANGE it, return the changed score with "action": "edit" and keep everything the request does not touch. If it asks for a different or new track, write a new score with "action": "new".\nCurrent score:\n' + JSON.stringify(cur) + '\n\n' : 'Write a new score for this request ("action": "new").\n') + 'Request: ' + JSON.stringify(text); }
// the first complete JSON object in a reply (models wrap answers in fences or prose despite being asked not to)
function aiJson(txt) { if (txt && typeof txt === 'object') return txt; txt = String(txt || ''); const f = /```(?:json)?\s*([\s\S]*?)```/.exec(txt); if (f) txt = f[1];
  const a = txt.indexOf('{'); if (a < 0) throw { code: 'invalid_json', message: 'no JSON in the reply' }; let d = 0, q = false, esc = false;
  for (let i = a; i < txt.length; i++) { const c = txt[i]; if (q) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') q = false; continue; } if (c === '"') q = true; else if (c === '{') d++; else if (c === '}' && --d === 0) return JSON.parse(txt.slice(a, i + 1)); }
  throw { code: 'invalid_json', message: 'the reply was cut off' }; }

// ---- one round trip to a provider: messages [{role, content}] → reply text ----
async function aiCall(id, system, msgs, signal, json = true) { const P = aiProv(id), s = aiSet(id);
  if (P.kind === 'sample') { const prompt = system + '\n\n' + msgs.map((m) => (m.role === 'user' ? '' : 'Your earlier answer: ') + m.content).join('\n\n'); return ASK.sample.json(prompt, { signal, modelTier: 'default', cache: false }); }
  let late = false; const ctl = new AbortController(), T = setTimeout(() => { late = true; ctl.abort(); }, P.noKey ? 900000 : 240000); if (signal) signal.addEventListener('abort', () => ctl.abort()); // a model on this computer may need minutes for a long prompt
  const go = async (url, init) => { let r; try { r = await fetch(url, Object.assign({ signal: ctl.signal }, init)); } catch (e) { throw { code: signal && signal.aborted ? 'cancelled' : late ? 'timeout' : 'network', message: e.message || 'network error' }; }
    const body = await r.text(); if (!r.ok) { let m = body; try { const j = JSON.parse(body); m = (j.error && (j.error.message || j.error)) || j.message || body; } catch (e) { /* plain text */ } const big = r.status === 413 || /request too large|tokens per minute|context length|context window|maximum context|too many tokens|reduce the length/i.test(String(m)); // a prompt bigger than the plan or the model takes
    throw { code: big ? 'too_big' : r.status === 401 || r.status === 403 ? 'key' : r.status === 429 ? 'rate_limited' : r.status === 404 ? 'model' : 'http', status: r.status, message: String(m).slice(0, 240) }; }
    return JSON.parse(body); };
  try {
    if (P.kind === 'gemini') { const j = await go(`${s.base}/models/${encodeURIComponent(s.model)}:generateContent`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': s.key },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: msgs.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })), generationConfig: Object.assign({ temperature: 0.9, maxOutputTokens: 32768 }, json ? { responseMimeType: 'application/json' } : {}) }) });
      const c = j.candidates && j.candidates[0]; if (!c || !c.content) throw { code: 'empty', message: (j.promptFeedback && j.promptFeedback.blockReason) || (c && c.finishReason) || 'no answer' }; return c.content.parts.map((p) => p.text || '').join(''); }
    if (P.kind === 'ollama') { const j = await go(`${s.base.replace(/\/v1$/, '')}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, // Ollama's own API: its OpenAI-compatible one cannot raise the context, and the default context would cut the format guide
        body: JSON.stringify(Object.assign({ model: s.model, stream: false, messages: [{ role: 'system', content: system }].concat(msgs), options: { num_ctx: 24576, temperature: 0.9 } }, json ? { format: 'json' } : {})) });
      if (j.error) throw { code: 'http', message: String(j.error).slice(0, 240) }; return (j.message && j.message.content) || ''; }
    if (P.kind === 'anthropic') { const j = await go(`${s.base}/messages`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': s.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        body: JSON.stringify({ model: s.model, max_tokens: 16000, system, messages: msgs }) });
      return (j.content || []).map((b) => b.text || '').join(''); }
    const head = { 'content-type': 'application/json' }; if (s.key) head.authorization = 'Bearer ' + s.key; if (id === 'openrouter') { head['HTTP-Referer'] = location.origin && location.origin !== 'null' ? location.origin : 'https://forge.local'; head['X-Title'] = 'FORGE'; }
    const body = { model: s.model, messages: [{ role: 'system', content: system }].concat(msgs), temperature: 0.9 }; if (json) body.response_format = { type: 'json_object' };
    // a model that refuses an option (JSON mode, or a temperature — reasoning models take only their own) is asked again without it
    let j = null; for (let attempt = 0; attempt < 3 && !j; attempt++) { try { j = await go(`${s.base}/chat/completions`, { method: 'POST', headers: head, body: JSON.stringify(body) }); }
      catch (e) { if (e.code !== 'http' || e.status !== 400) throw e; if (/temperature/i.test(e.message) && body.temperature != null) delete body.temperature; else if (/response_format|json/i.test(e.message) && body.response_format) delete body.response_format; else throw e; } }
    if (!j) throw { code: 'http', message: 'the provider refused the request' }; const ch = j.choices && j.choices[0]; if (!ch) throw { code: 'empty', message: (j.error && j.error.message) || 'no answer' }; return ch.message ? ch.message.content || '' : ch.text || ''; }
  finally { clearTimeout(T); } }
// the models a provider offers (for the settings list): OpenRouter's catalogue is public (free ones first); the others need the key
async function aiListModels(id) { const P = aiProv(id), s = aiSet(id); if (!P || P.kind === 'sample') return [];
  if (P.kind === 'gemini') { const r = await fetch(`${s.base}/models?pageSize=200`, { headers: { 'x-goog-api-key': s.key } }); const j = await r.json(); if (!r.ok) throw new Error((j.error && j.error.message) || r.status);
    return (j.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => m.name.replace(/^models\//, '')).sort(); }
  if (P.kind === 'ollama') { const r = await fetch(`${s.base.replace(/\/v1$/, '')}/api/tags`); const j = await r.json(); if (!r.ok) throw new Error(j.error || r.status); return (j.models || []).map((m) => m.name).sort(); }
  if (P.kind === 'anthropic') { const r = await fetch(`${s.base}/models`, { headers: { 'x-api-key': s.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } }); const j = await r.json(); if (!r.ok) throw new Error((j.error && j.error.message) || r.status); return (j.data || []).map((m) => m.id); }
  const head = {}; if (s.key && !P.publicModels) head.authorization = 'Bearer ' + s.key; const r = await fetch(`${s.base}/models`, { headers: head }); const j = await r.json(); if (!r.ok) throw new Error((j.error && j.error.message) || r.status);
  const ids = (j.data || j.models || []).map((m) => m.id || m.name).filter(Boolean); return id === 'openrouter' ? ids.filter((x) => /:free$/.test(x)).sort().concat(['openrouter/free']) : ids.sort(); }

// ---- ask a model for a score: one answer, then (if it does not validate) one round of corrections from the validator ----
async function aiCompose(id, text, cur, signal, onStage) { const sys = aiSystem(), msgs = [{ role: 'user', content: aiUser(text, cur) }];
  let raw = await aiCall(id, sys, msgs, signal), r = aiJson(raw); if (!r || typeof r !== 'object' || !r.score) throw { code: 'invalid_json', message: 'the reply has no score' };
  let v = validateSpec(r.score);
  if (!v.ok && aiProv(id).kind !== 'sample') { onStage && onStage('checking and correcting…'); // the validator's messages (path + message + fix) go back once: models repair their own scores well when told exactly what is wrong (v9.2: the fields are msg / hint — 9.1 read message / fix and sent "- bpm: undefined")
    msgs.push({ role: 'assistant', content: typeof raw === 'string' ? raw.slice(0, 60000) : JSON.stringify(r) }, { role: 'user', content: 'The FORGE validator rejected that score:\n' + v.errors.slice(0, 20).map((e) => `- ${e.path || '(score)'}: ${e.msg}${e.hint ? ' (fix: ' + e.hint + ')' : ''}`).join('\n') + '\nReply with the corrected complete JSON object, same format.' });
    try { raw = await aiCall(id, sys, msgs, signal); const r2 = aiJson(raw); if (r2 && r2.score) { r = r2; v = validateSpec(r.score); } } catch (e) { if (e && e.code === 'cancelled') throw e; /* keep the first answer; the repair below drops what is still wrong */ } }
  return r; }

// ---- the settings dialog ----
function aiDialog() { let dlg = $('#aiDlg'); if (!dlg) { dlg = document.createElement('dialog'); dlg.id = 'aiDlg'; dlg.className = 'ai-dlg'; document.body.appendChild(dlg); }
  const sel = AI.cfg.use, row = (P) => { const s = aiSet(P.id), on = sel === P.id, ready = aiReady(P.id);
    return `<details class="ai-p${on ? ' on' : ''}" data-p="${P.id}"${on ? ' open' : ''}><summary><input type="radio" name="aiUse" value="${P.id}"${on ? ' checked' : ''} aria-label="Use ${esc(P.label)}"> <b>${esc(P.label)}</b> <span class="note">${ready ? '● ready' : P.kind === 'sample' ? (ASK.sample ? '' : 'not available on this page') : 'needs setup'}</span></summary>
      <p class="note">${esc(P.note || '')}${P.keyUrl ? ` <a href="${P.keyUrl}" target="_blank" rel="noopener">Get a key ↗</a>` : ''}</p>
      ${P.kind === 'sample' ? '' : `<div class="ai-f">${P.noKey ? '' : `<label>Key <input type="password" class="btn" data-k="key" value="${esc(s.key)}" autocomplete="off" spellcheck="false" placeholder="paste your key"></label>`}
        <label>Model <input class="btn" data-k="model" value="${esc(s.model)}" list="aiList-${P.id}" spellcheck="false"><datalist id="aiList-${P.id}">${(AI.models[P.id] || []).map((m) => `<option value="${esc(m)}">`).join('')}</datalist></label>
        ${P.id === 'custom' || P.noKey ? `<label>Base URL <input class="btn" data-k="base" value="${esc(s.base)}" spellcheck="false" placeholder="https://…/v1"></label>` : ''}
        <div class="row"><button type="button" class="btn" data-act="list">List models</button><button type="button" class="btn" data-act="test">Test</button><span class="note" data-say></span></div></div>`}</details>`; };
  const hosted = !!(window.claude && window.claude.use);
  dlg.innerHTML = `<form method="dialog" class="ai-in"><h3>AI models</h3><p class="note">Pick the model that writes your tracks. Your words go straight from this browser to the provider you pick; keys stay in this browser. The built-in words (“darker”, “new bass”, “go to the drop”…) always work offline.</p>
    ${hosted ? '<p class="note"><b>This page runs inside Claude</b>: Claude is built in. A Claude page may not be allowed to reach other providers — if a model’s Test fails here, open the downloaded <b>FORGE.html</b> in your browser, where every provider works.</p>' : ''}
    ${AI_FILE ? `<p class="note"><b>Opened as a file</b>: any HTML file you open from disk can read what this browser keeps for files, so your keys are kept for this session only. <label class="row"><input type="checkbox" id="aiKeep"${AI.cfg.keepKeys ? ' checked' : ''}> Remember my keys on this computer anyway</label> Served from a folder (<code>python3 -m http.server</code>) or hosted, keys are saved for this page alone.</p>` : ''}
    <label class="row"><input type="radio" name="aiUse" value="builtin"${sel === 'builtin' ? ' checked' : ''}> <b>Built-in only</b> <span class="note">offline, instant, no model</span></label>
    ${AI_PROVIDERS.map(row).join('')}
    <label class="row"><input type="checkbox" id="aiAlways"${AI.cfg.always ? ' checked' : ''}> Send every request to the model (otherwise the common words are handled instantly)</label>
    <div class="row end"><button class="btn" value="close">Done</button></div></form>`;
  const save = () => { aiSave(); askModelUi(); };
  $$('input[name=aiUse]', dlg).forEach((r) => r.onchange = () => { AI.cfg.use = r.value; AI.cfg.chosen = true; $$('.ai-p', dlg).forEach((d) => d.classList.toggle('on', d.dataset.p === r.value)); const d = $(`.ai-p[data-p="${r.value}"]`, dlg); if (d) d.open = true; save(); });
  $('#aiAlways', dlg).onchange = (e) => { AI.cfg.always = e.target.checked; const c = $('#askClaude'); if (c) c.checked = AI.cfg.always; save(); };
  const kp = $('#aiKeep', dlg); if (kp) kp.onchange = (e) => { AI.cfg.keepKeys = e.target.checked; save(); };
  $$('.ai-p', dlg).forEach((d) => { const id = d.dataset.p, say = $('[data-say]', d);
    $$('input[data-k]', d).forEach((inp) => inp.onchange = () => { const c = AI.cfg.p[id] = AI.cfg.p[id] || {}; c[inp.dataset.k] = inp.value.trim(); save(); });
    const lb = $('[data-act=list]', d); if (lb) lb.onclick = async () => { say.textContent = 'asking…'; try { const L = await aiListModels(id); AI.models[id] = L; $(`#aiList-${id}`, d).innerHTML = L.map((m) => `<option value="${esc(m)}">`).join(''); say.textContent = `${L.length} model(s) — pick one in the Model field`; } catch (e) { say.textContent = 'could not list: ' + (e.message || e); } };
    const tb = $('[data-act=test]', d); if (tb) tb.onclick = async () => { say.textContent = 'testing with the full format guide…'; const t0 = performance.now(); try { const r = await aiCall(id, aiSystem(), [{ role: 'user', content: 'Connection test: do not write a score. Reply with exactly {"ok": true}' }], null); aiJson(r); say.textContent = `✓ works with the full format guide (${(Math.round(performance.now() - t0) / 1000).toFixed(1)} s)`; } catch (e) { say.textContent = '✗ ' + aiError(e); } }; });
  if (!dlg.open) dlg.showModal(); }
function aiError(e) { const c = e && e.code; return c === 'key' ? 'the key was refused' : c === 'rate_limited' ? 'rate-limited — wait a moment or pick another model' : c === 'too_big' ? 'the request is bigger than this model takes on your plan (FORGE sends a format guide of about 9,000 tokens) — pick a model with a bigger limit' : c === 'timeout' ? 'no answer in time — a faster or smaller model, or another provider' : c === 'model' ? 'unknown model id (List models)' : c === 'network' ? 'could not reach it (offline, or the provider blocks pages from calling it directly)' : c === 'cancelled' ? 'stopped' : (e && e.message) || String(e); }
