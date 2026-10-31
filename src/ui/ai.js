// ---------------------------------------------------------------- ASK (words → music)
// One line in the header: describe a track ("dreamy deep house at 120 in F minor") and it plays — mixed in on the next phrase if
// a deck is already running — or describe a change ("darker", "more energy", "new bass", "go to the drop", "warmer, punchier
// drums"). A local parser understands the common words instantly and offline. When the page runs inside Claude (the `sample`
// capability) anything the parser does not cover goes to Claude with the FORGE score format card and the deck's current score,
// and comes back as a score that is validated (invalid fields are dropped by path, never guessed) before it plays.
const ASK = { sample: null, busy: null, last: '' };
const GENRE_WORDS = [['progressive psy', 'prog-psy'], ['prog psy', 'prog-psy'], ['prog-psy', 'prog-psy'], ['progressive psytrance', 'prog-psy'], ['melodic techno', 'melodic-techno'], ['hard techno', 'hard-techno'], ['dub techno', 'dub-techno'], ['deep house', 'deep-house'], ['tech house', 'tech-house'], ['tech-house', 'tech-house'],
  ['progressive', 'progressive-house'], ['big room', 'big-room'], ['nu disco', 'nu-disco'], ['nu-disco', 'nu-disco'], ['disco', 'nu-disco'], ['afro house', 'afro-house'], ['afro', 'afro-house'], ['amapiano', 'amapiano'],
  ['psytrance', 'psytrance'], ['full-on', 'psytrance'], ['full on', 'psytrance'], ['psy', 'psytrance'], ['goa', 'psytrance'], ['trance', 'trance'], ['drum and bass', 'dnb'], ['drum & bass', 'dnb'], ['dnb', 'dnb'], ['d&b', 'dnb'], ['liquid', 'dnb'], ['jungle', 'jungle'],
  ['dubstep', 'dubstep'], ['future bass', 'future-bass'], ['uk garage', 'ukg'], ['garage', 'ukg'], ['2-step', 'ukg'], ['ukg', 'ukg'], ['uk drill', 'uk-drill'], ['drill', 'uk-drill'], ['trap', 'trap'], ['jersey', 'jersey-club'],
  ['hardstyle', 'hardstyle'], ['breakbeat', 'breakbeat'], ['breaks', 'breakbeat'], ['electro', 'electro'], ['reggaeton', 'reggaeton'], ['moombahton', 'moombahton'], ['synthwave', 'synthwave'], ['80s', 'synthwave'], ['retro', 'synthwave'],
  ['lofi', 'lofi'], ['lo-fi', 'lofi'], ['lo fi', 'lofi'], ['downtempo', 'downtempo'], ['chill', 'downtempo'], ['ambient', 'ambient'], ['acid', 'acid'], ['techno', 'techno'], ['house', 'house']];
const MOOD_WORDS = [['emotional', 'emotional'], ['sad', 'emotional'], ['melanchol', 'emotional'], ['nostalg', 'emotional'], ['heart', 'emotional'], ['deep', 'deep'], ['dream', 'dreamy'], ['ethereal', 'dreamy'], ['floating', 'dreamy'], ['airy', 'dreamy'],
  ['uplift', 'uplifting'], ['happy', 'uplifting'], ['euphor', 'uplifting'], ['joy', 'uplifting'], ['bright', 'uplifting'], ['dark', 'dark'], ['sinister', 'dark'], ['evil', 'dark'], ['menac', 'dark'], ['hypno', 'hypnotic'], ['trippy', 'hypnotic'], ['minimal', 'hypnotic']];
function askParse(text) { const t = ' ' + text.toLowerCase().replace(/[,.;!?]/g, ' ') + ' ', o = { edits: [], unknown: true };
  const g = GENRE_WORDS.find(([w]) => t.includes(' ' + w + ' ') || t.includes(' ' + w + 's ') || (w.length > 4 && t.includes(w))); if (g) o.genre = g[1];
  const m = MOOD_WORDS.filter(([w]) => t.includes(w)).map((x) => x[1]).filter((x) => !(x === 'deep' && /deep[ -]house/.test(t) && !/very deep|deep deep house/.test(t)))[0]; if (m) o.mood = m;
  const b = /(\d{2,3}(?:\.\d)?)\s*(?:bpm|beats)|(?:at|@)\s*(\d{2,3})\b/.exec(t); if (b) { const v = +(b[1] || b[2]); if (v >= 60 && v <= 200) o.bpm = v; }
  const km = /\bin\s+([a-g])\s*(#|♯|sharp|b|♭|flat)?\s*(minor|min|m|major|maj)?\b/i.exec(text); if (km) { o.key = km[1].toUpperCase() + (/#|♯|sharp/.test(km[2] || '') ? '#' : /b|♭|flat/.test(km[2] || '') ? 'b' : ''); if (km[3]) o.mode = /^m(in)?(or)?$/i.test(km[3]) ? 'minor' : 'major'; }
  const E = o.edits, has = (re) => re.test(t);
  if (has(/more energy|harder|push it|pump|bigger|turn it up|intens/)) E.push(['energy', +0.25]); if (has(/less energy|calm|softer|chill out|gentle|quieter|strip it|thinner/)) E.push(['energy', -0.25]);
  if (has(/faster|speed up|quicker/)) E.push(['bpm', +4]); if (has(/slower|slow down/)) E.push(['bpm', -4]);
  for (const [w, part] of [['drum', 'drums'], ['beat', 'drums'], ['groove', 'drums'], ['bass', 'bass'], ['chord', 'chords'], ['harmon', 'chords'], ['melod', 'lead'], ['hook', 'lead'], ['lead', 'lead']]) if (has(new RegExp(`(new|another|different|change( the)?|swap( the)?|re-?roll)\\s+(\\w+\\s+)?${w}`))) E.push(['part', part]);
  if (has(/(go to|jump to|drop it|to the|skip to)\s*(the\s+)?drop|^ drop now|drop now/)) E.push(['jump', 'drop']); else if (has(/(go to|jump to|to the)\s*(the\s+)?(break|breakdown)/)) E.push(['jump', 'break']); else if (has(/(go to|jump to|to the)\s*(the\s+)?build/)) E.push(['jump', 'build']);
  for (const [w, fx] of [['echo', 'echo'], ['delay', 'echo'], ['sweep', 'sweep'], ['filter', 'sweep'], ['phaser', 'phaser'], ['flanger', 'flanger'], ['gate', 'gate'], ['stutter', 'gate'], ['crush', 'crush'], ['bitcrush', 'crush'], ['lo-?fi it', 'crush']]) if (has(new RegExp(`\\b${w}`))) { E.push(['fx', fx]); break; }
  if (has(/warmer|dirtier|grit|saturat|analog|tape/)) E.push(['heat', +0.35]); if (has(/cleaner|clean it|less dirt/)) E.push(['heat', -0.35]);
  if (has(/punch(ier|y)|snappier|tighter drums|hit harder/)) E.push(['punch', +0.35]); if (has(/softer drums|less punch/)) E.push(['punch', -0.35]);
  if (has(/\bloop\b/)) E.push(['loop', 8]); if (has(/stop loop|unloop|release loop/)) E.push(['loop', 0]);
  if (has(/more space|bigger room|wetter|more reverb/)) E.push(['verb', +0.12]); if (has(/drier|less reverb|dry it/)) E.push(['verb', -0.12]);
  if (!g && o.mood && !E.length && has(/(make it|more|bit|go)\s+/)) E.push(['mood', o.mood]);
  if (!g && o.bpm && !E.length) E.push(['bpmTo', o.bpm]);
  o.kind = g || has(/(play|make|give me|start|new)\s+(me\s+)?(a|an|some)\s+/) && (o.mood || o.bpm) ? 'new' : E.length ? 'edit' : 'unknown';
  if (o.kind === 'new' && !o.genre) o.genre = o.mood === 'dark' || o.mood === 'hypnotic' ? 'melodic-techno' : o.mood === 'uplifting' ? 'progressive-house' : 'deep-house';
  o.unknown = o.kind === 'unknown'; return o; }
// the deck a request is about: an edit goes to the lead deck; a new track to the idle deck (mixed in) or the lead deck if nothing plays
// (v9.2) through the load policy: −1 while a mix is armed or running — the new track then waits for it (askPlay); it replaced the incoming deck
function askDeck(kind) { if (kind !== 'new') return lead; return loadTarget(decks[lead].playing ? lead ^ 1 : lead); }
// the first deck that is free (polled; gives up when a newer request took over, or after 4 minutes)
async function whenFree(pref, tok) { const t0 = performance.now(); for (;;) { const t = loadTarget(pref); if (t >= 0) return t; if (ASK.qtok !== tok || performance.now() - t0 > 240000) return -1; await new Promise((r) => setTimeout(r, 300)); } }
function askApply(o, text) { const said = [];
  if (o.kind === 'new') { const i = askDeck('new'), sp = { forge: 1, genre: o.genre }; if (o.mood) sp.mood = o.mood; if (o.bpm) sp.bpm = o.bpm; if (o.key && o.mode) { sp.key = o.key; sp.mode = o.mode; } else if (o.key) sp.key = o.key;
    sp.title = askTitle(text, o); return askPlay(i, sp, `${GENRE_BY_ID[o.genre].name}${o.mood ? ' · ' + o.mood : ''}${o.bpm ? ' · ' + o.bpm + ' BPM' : ''}${o.key ? ' · ' + o.key + (o.mode === 'minor' ? 'm' : '') : ''}`); }
  const i = lead, D = decks[i]; if (!D.score) { toast('Nothing is playing — describe a track first'); return false; } const d = 'AB'[i], T = targets();
  for (const [k, v] of o.edits) {
    if (k === 'energy') { const t = T[`${d}.energy`]; t.set(clamp(t.get() + v, 0, 1)); said.push(`energy ${Math.round(t.get() * 100)} %`); }
    else if (k === 'bpm' || k === 'bpmTo') { const nb = k === 'bpm' ? (D.bpm || D.score.meta.bpm) + v : v; setBpmLive(i, nb); said.push(`${Math.round(nb)} BPM`); }
    else if (k === 'part') { regenPart(i, v); said.push(`new ${v === 'lead' ? 'melody' : v}`); }
    else if (k === 'jump') { const now = D.sec || 0, idx = D.score.sections.findIndex((S, n) => n > now && S.type === v); const k2 = idx >= 0 ? idx : D.score.sections.findIndex((S) => S.type === v); if (k2 >= 0) { jumpTo(i, k2); said.push(`→ ${v}`); } }
    else if (k === 'fx') { const t = T[`${d}.fx.${v}`]; if (t) { t.press(); said.push(`${v} ${D.fxOn && D.fxOn[FX_RACK.findIndex((x) => x[0] === v)] ? 'on' : 'off'}`); } }
    else if (k === 'heat' || k === 'punch' || k === 'verb') { const sp = D.spec; sp.mix = sp.mix || {}; const G = GENRE_BY_ID[D.gid] || { mix: {} }, cur = sp.mix[k] != null ? sp.mix[k] : G.mix[k] != null ? G.mix[k] : k === 'verb' ? 0.2 : 1;
      const nv = +clamp(cur + v, 0, k === 'verb' ? 1 : 2).toFixed(2); sp.mix[k] = nv; send({ type: 'sends', deck: i, p: { [k]: nv } }); said.push(`${k === 'verb' ? 'reverb' : k} ${nv}`); }
    else if (k === 'loop') { setLoop(i, v); said.push(v ? `loop ${v} bars` : 'loop off'); }
    else if (k === 'mood') { setMood(i, v); said.push(`mood ${v}`); } }
  if (said.length) toast(`Deck ${d}: ${said.join(' · ')}`); return said.length > 0; }
function askTitle(text, o) { const t = text.trim().replace(/\s+/g, ' '); return t.length <= 40 ? t[0].toUpperCase() + t.slice(1) : `${o.mood ? o.mood[0].toUpperCase() + o.mood.slice(1) + ' ' : ''}${GENRE_BY_ID[o.genre].name}`; }
async function askPlay(i, sp, label) { await startAudio(); const tok = ASK.qtok = (ASK.qtok || 0) + 1; let s; try { s = await compileAsync(sp, { fastLevels: true }); } catch (e) { toast('Could not build that: ' + (e.message.split('\n')[1] || e.message)); return false; }
  if (ASK.qtok !== tok) return false; // a newer request took over
  if (i < 0 || !deckFree(i)) { toast(`${label} is ready — it loads as soon as the running mix has finished`, 6000); askUi(`${label}: waiting for the mix to finish`, false); i = await whenFree(i < 0 ? lead ^ 1 : i, tok); if (i < 0) return false; } // (never onto a deck that is on air)
  const other = decks[i ^ 1];
  installScore(i, s, { play: !other.playing }); if (s.levelPending) refineInWorker(i, s); renderDeckHead(i); renderStems(i); if (DOCK.deck === i) renderDock();
  if (other.playing && other.score) { setTimeout(() => mixInto(i), 50); toast(`${label} → deck ${'AB'[i]}, mixing in on the next phrase`); } else toast(`${label} → deck ${'AB'[i]}`); return true; }
// drop what the validator rejects, by path, until the score is valid (a reply is never "fixed" by guessing values). (v9.2) Every
// failing path of a pass is dropped at once — one per pass gave up after 24 fields; a path that fails again loses its parent; a
// path inside another one being dropped is left to it; array elements go from the highest index down (dropping one moves the rest)
function askRepair(sp) { const seen = new Map(); let dropped = 0;
  for (let pass = 0; pass < 24; pass++) { const v = validateSpec(sp); if (v.ok) return { sp, dropped }; const paths = [...new Set(v.errors.map((e) => e.path))]; if (paths.some((p) => !p)) return null;
    let items = paths.map((p0) => { const up = seen.get(p0) || 0; seen.set(p0, up + 1); const keys = p0.replace(/\[(\d+)\]/g, '.$1').split('.'); return keys.slice(0, Math.max(1, keys.length - up)); });
    items = [...new Map(items.map((k) => [k.join('\u0001'), k])).values()]; items = items.filter((a) => !items.some((b) => b.length < a.length && b.every((k, q) => a[q] === k)));
    items.sort((a, b) => { for (let k = 0; k < Math.min(a.length, b.length); k++) if (a[k] !== b[k]) { const x = +a[k], y = +b[k]; return Number.isInteger(x) && Number.isInteger(y) ? y - x : a[k] < b[k] ? 1 : -1; } return b.length - a.length; });
    for (const keys of items) { if (keys.length === 1 && (keys[0] === 'forge' || keys[0] === 'genre')) return null; let o = sp; for (let k = 0; k < keys.length - 1; k++) o = o && o[keys[k]]; if (!o) continue;
      const last = keys[keys.length - 1]; if (Array.isArray(o)) o.splice(+last, 1); else delete o[last]; dropped++; } }
  return null; }
async function askModel(id, text, o) { const cur = decks[lead].spec && decks[lead].score && o.kind !== 'new' ? decks[lead].spec : null, who = aiLabel(id);
  // (v9.2) a request that a newer one replaced keeps its hands off: it showed "Stopped", hid the newer request's Stop button and
  // cleared ASK.busy — the newer one then could not be stopped, and the old reply could still land (measured)
  const ctl = new AbortController(), mine = () => ASK.busy === ctl; ASK.busy = ctl; askUi(`${who} is writing…`, true);
  // (inside Claude the request goes to sample.json with the cache off: the same words typed again must write a NEW track, not replay the last answer)
  try { const r = await aiCompose(id, text, cur, ctl.signal, (m) => { if (mine()) askUi(`${who}: ${m}`, true); }); if (!mine()) return true;
    const fixed = askRepair(JSON.parse(JSON.stringify(r.score))); if (!fixed) { askUi(`${who}'s score did not validate — try rephrasing`, false); return true; }
    const edit = !!cur && r.action !== 'new', i = edit ? lead : askDeck('new'); // the model says whether the words asked for a change of the playing track or a new one
    if (edit) { snap(decks[i]); decks[i].spec = fixed.sp; const s2 = await commitSpec(i, { q: 4 }); if (!s2) { askUi('Could not apply that change', false); return true; } decks[i].spec = deckSpec(s2); renderDeckHead(i); renderDock(); toast(`Deck ${'AB'[i]}: ${r.say || 'changed'} (from the next 4-bar line)`); }
    else await askPlay(i, fixed.sp, r.say || `${who}'s track`);
    AI.history.push({ t: Date.now(), who, text, say: r.say || '' }); if (AI.history.length > 30) AI.history.shift();
    askUi((r.say || 'Done') + (fixed.dropped ? ` · ${fixed.dropped} invalid field(s) dropped` : ''), false); return true; }
  catch (e) { const c = e && e.code; if (!mine()) return true; if (c === 'not_granted' || c === 'sampling_disabled' || c === 'not_declared' || c === 'capability_disabled' || c === 'capability_removed') { ASK.sample = null; askUi('Claude is not available here — the built-in words still work', false); askModelUi(); }
    else if (c === 'cancelled') askUi('Stopped', false); else if (c === 'rate_limited') askUi(`${who} is busy (rate limit) — try again in a moment or pick another model ⚙`, false); else askUi(`${who} could not answer: ${aiError(e)}`, false); return true; }
  finally { if (mine()) { ASK.busy = null; $('#askStop').hidden = true; } } }
function askUi(msg, busy) { const st = $('#askSay'); if (st) st.textContent = msg; const sb = $('#askStop'); if (sb) sb.hidden = !busy; }
async function askRun(text) { text = (text || '').trim(); if (!text) return; ASK.last = text; const o = askParse(text); if (ASK.busy) ASK.busy.abort(); // a new request replaces the one still being written
  const use = AI.cfg.use !== 'builtin' && aiReady(AI.cfg.use) ? AI.cfg.use : ASK.sample && AI.cfg.use === 'builtin' && !AI.cfg.chosen ? 'claude' : null, always = AI.cfg.always || ($('#askClaude') && $('#askClaude').checked);
  if (!o.unknown && !(use && always)) { const ok2 = askApply(o, text); askUi(ok2 ? '' : 'Nothing to change', false); return; }
  if (use) { await askModel(use, text, o); return; }
  askUi('Try: "dreamy deep house at 120", "darker", "more energy", "new bass", "go to the drop" — or pick an AI model (⚙) to write anything', false); }
function askModelUi() { const sel = $('#askModel'); if (!sel) return; const opts = [['builtin', 'Built-in words']].concat(AI_PROVIDERS.filter((P) => aiReady(P.id)).map((P) => [P.id, aiLabel(P.id)]));
  const cur = AI.cfg.use !== 'builtin' && aiReady(AI.cfg.use) ? AI.cfg.use : ASK.sample && !AI.cfg.chosen ? 'claude' : 'builtin';
  sel.innerHTML = opts.map(([v, l]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`).join('') + '<option value="__setup">Set up a model…</option>';
  const live = cur !== 'builtin'; $('#askIn').placeholder = live ? (cur === 'claude' ? 'Describe anything — Claude writes the score (common words work instantly offline)' : `Describe anything — ${aiLabel(cur)} writes the score · “a psytrance version of a song you love”`) : 'Describe a track or a change — “emotional deep house at 122”, “darker”, “new bass”, “go to the drop”';
  const ac = $('.ask-claude'); if (ac) ac.hidden = !live; const av = $('#askVersion'); if (av) av.hidden = !live; }
function buildAsk() { aiLoad(); const bar = document.createElement('form'); bar.className = 'askbar'; bar.id = 'askBar'; bar.setAttribute('role', 'search');
  bar.innerHTML = `<label class="lbl" for="askIn">Ask</label><input id="askIn" class="btn" autocomplete="off" placeholder="Describe a track or a change — “emotional deep house at 122”, “darker”, “new bass”, “go to the drop”">
    <button class="btn" type="submit">Go</button><select id="askModel" class="btn" aria-label="Who writes the music" title="Who writes the music: the built-in words (offline) or an AI model"></select><button class="btn" type="button" id="askSetup" title="AI models: Claude, Gemini, GPT, free models…" aria-label="AI model settings">⚙</button><button class="btn" type="button" id="askVersion" hidden title="A version of a song you love: its style, tempo, key, chords and mood — with an original melody" aria-label="Write a version of a song">♫<span class="wide"> Version</span></button>
    <label class="row ask-claude" hidden title="Send every request to the model (otherwise the common words are handled instantly, offline)"><input type="checkbox" id="askClaude"> <span>All to model</span></label><button class="btn" type="button" id="askStop" hidden>Stop</button><span class="note" id="askSay" aria-live="polite"></span>`;
  $('.top').insertAdjacentElement('afterend', bar);
  bar.onsubmit = (e) => { e.preventDefault(); const v = $('#askIn').value; askRun(v); };
  $('#askStop').onclick = () => { if (ASK.busy) ASK.busy.abort(); };
  $('#askSetup').onclick = () => aiDialog();
  $('#askVersion').onclick = () => { const D = decks[lead], g = D && D.score ? GENRE_BY_ID[D.score.meta.gid].name.toLowerCase() : 'psytrance', inp = $('#askIn'), t = `A ${g} version inspired by "SONG" by ARTIST — keep its feel, tempo, key, chords and mood, with an original melody`;
    inp.value = t; inp.focus(); const a = t.indexOf('SONG'); inp.setSelectionRange(a, a + 4); };
  $('#askModel').onchange = (e) => { const v = e.target.value; if (v === '__setup') { askModelUi(); aiDialog(); return; } AI.cfg.use = v; AI.cfg.chosen = true; aiSave(); askModelUi(); };
  $('#askClaude').checked = !!AI.cfg.always; $('#askClaude').onchange = (e) => { AI.cfg.always = e.target.checked; aiSave(); };
  $('#askIn').addEventListener('keydown', (e) => { if (e.key === 'Escape') e.target.blur(); });
  document.addEventListener('keydown', (e) => { if (e.key === '/' && !/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && !e.metaKey && !e.ctrlKey) { e.preventDefault(); $('#askIn').focus(); } });
  askModelUi();
  try { if (window.claude && window.claude.use) window.claude.use('sample').then((s) => { ASK.sample = s || null; askModelUi(); }).catch(() => {}); } catch (e) { /* not inside a Claude viewer */ } }
