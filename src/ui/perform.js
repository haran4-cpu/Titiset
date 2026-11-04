// ---------------------------------------------------------------- PERFORM
// The live layer around the decks: a Perform view (big pads, nothing else on screen), hot cues, headphone cue (pre-fader cue
// bus from the engine's second output: split one headphone, a second output device, or channels 3–4 of a 4-out interface),
// set recording, and set save / load (both decks' scores, positions, hot cues, mixer, controller mapping).
const PERF = { on: false, hold: 0, dirty: false, rec: null, recT0: 0, recChunks: [], cueMode: 'off', cueDev: '', cueMix: 0, cueEl: null, cueDest: null, cueMerge: null, devs: [] };
// files out: inside a Claude viewer the page cannot download directly — the `downloads` capability asks the viewer to save;
// anywhere else a plain link click does it
let DLS = null; try { if (window.claude && window.claude.use) window.claude.use('downloads').then((d) => { DLS = d; }).catch(() => {}); } catch (e) { /* not in a viewer */ }
// Offers a file to keep. Resolves the name it was offered under; false when the person declined; null when it could not be saved (the person has been told why).
// Inside a Claude page the viewer's Downloads capability is the only way — a plain <a download> is inert there — and it saves only certain file types: a .wav, .ogg or .m4a
// that it refuses goes into a .zip, which it takes. Anywhere else this is an ordinary download.
async function saveFile(name, blob) {
  // (v9.3) inside the Android app the system file picker saves it (a WebView has no downloads)
  if (window.ForgeAndroid && window.ForgeAndroid.save) { try { const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(r.error); r.readAsDataURL(blob); }); window.ForgeAndroid.save(name, b64, blob.type || ''); return name; } catch (e) { toast('This file could not be handed to Android'); return null; } }
  if (DLS) { const offer = async (n, data) => { try { await DLS.save({ filename: n, data }); return { saved: n }; } catch (e) { return { code: (e && e.code) || 'unavailable' }; } };
    let r = await offer(name, blob);
    if (r.code === 'rejected_extension' && !/\.zip$/i.test(name)) { try { r = await offer(name.replace(/\.[^./]+$/, '') + '.zip', zipBlob([{ name, parts: [new Uint8Array(await blob.arrayBuffer())] }])); } catch (e) { r = { code: 'unavailable' }; } }
    if (r.saved) return r.saved; if (r.code === 'declined') return false; toast(`Could not save ${name} here (${r.code})`, 6000); return null; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); return name; }
const HOT_N = 4, HOT_COL = ['#f0a23b', '#63c7e6', '#72cf8e', '#d65d7a'];

// ---- hot cues: 4 per deck, bar-quantised. Empty pad = set at the current bar; set pad = jump on the next bar line;
// Shift / long-press = clear. They belong to the track: a new track starts with empty pads, a re-drawn part keeps them.
function hotOf(D) { const key = D.score ? D.score.meta.gid + '/' + D.score.meta.seed : ''; if (D.hotKey !== key) { D.hotKey = key; D.hot = new Array(HOT_N).fill(null); } return D.hot; }
function hotPress(i, k, clear) { const D = decks[i]; if (!D.score) { toast('Load a track first'); return; } const H = hotOf(D);
  if (clear) { H[k] = null; toast(`Hot cue ${k + 1} cleared · deck ${'AB'[i]}`); renderPerf(); return; }
  if (H[k] == null) { H[k] = Math.floor(livePos(D) / 16) * 16; toast(`Hot cue ${k + 1} set at bar ${H[k] / 16 + 1} · deck ${'AB'[i]}`); renderPerf(); return; }
  if (!D.playing) { send({ type: 'seek', deck: i, step: H[k] }); D.pos = H[k]; return; }
  const at = Math.ceil((schedPos(D) + 1) / 16) * 16; send({ type: 'jump', deck: i, atStep: at, step: H[k] }); D.pendJump = at; }

// ---- headphone cue
function setCue(i, on) { const D = decks[i]; D.cue = on == null ? !D.cue : !!on; send({ type: 'cue', deck: i, on: D.cue });
  if (D.cue && PERF.cueMode === 'off') toast('Cue on — choose where the headphones are in Cue settings (header)'); renderPerf(); renderCueButtons(); }
function renderCueButtons() { $$('.cuebtn').forEach((b) => { const D = decks[+b.dataset.d]; b.classList.toggle('on', !!D.cue); b.setAttribute('aria-pressed', D.cue ? 'true' : 'false'); }); }
async function listOutputs() { try { const all = await navigator.mediaDevices.enumerateDevices(); PERF.devs = all.filter((d) => d.kind === 'audiooutput'); } catch (e) { PERF.devs = []; } return PERF.devs; }
async function routeCue(mode, dev) { await startAudio(); const ctx = A.ctx, node = A.node; PERF.cueMode = mode; PERF.cueDev = dev || PERF.cueDev;
  // undo the previous routing
  if (PERF.cueEl) { try { PERF.cueEl.pause(); PERF.cueEl.srcObject = null; } catch (e) { /* ignore */ } PERF.cueEl = null; }
  if (node && PERF.cueDest) { try { node.disconnect(PERF.cueDest, 1); } catch (e) { /* ignore */ } PERF.cueDest = null; }
  if (node && PERF.cueMerge) { try { node.disconnect(); node.connect(ctx.destination, 0); ctx.destination.channelCount = 2; } catch (e) { /* ignore */ } PERF.cueMerge = null; }
  send({ type: 'cue', split: mode === 'split' });
  if (!node) { if (mode !== 'off' && mode !== 'split') toast('Separate cue outputs need the AudioWorklet engine — split mode works'); return; }
  if (mode === 'device') { if (!('setSinkId' in HTMLMediaElement.prototype)) { toast('This browser cannot pick an output device — use Split or a 4-output interface'); PERF.cueMode = 'off'; return; }
    const md = ctx.createMediaStreamDestination(); node.connect(md, 1); PERF.cueDest = md; const el = new Audio(); el.srcObject = md.stream; PERF.cueEl = el;
    try { if (PERF.cueDev) await el.setSinkId(PERF.cueDev); await el.play(); toast('Cue → ' + ((PERF.devs.find((d) => d.deviceId === PERF.cueDev) || {}).label || 'second output')); } catch (e) { toast('Could not open that output: ' + e.message); } }
  else if (mode === 'quad') { const dst = ctx.destination; if (dst.maxChannelCount < 4) { toast(`This output has ${dst.maxChannelCount} channels — a 4-output interface (most DJ controllers) is needed`); PERF.cueMode = 'off'; return; }
    dst.channelCount = 4; dst.channelCountMode = 'explicit'; dst.channelInterpretation = 'discrete'; const mg = ctx.createChannelMerger(4), s0 = ctx.createChannelSplitter(2), s1 = ctx.createChannelSplitter(2);
    node.disconnect(); node.connect(s0, 0); node.connect(s1, 1); s0.connect(mg, 0, 0); s0.connect(mg, 1, 1); s1.connect(mg, 0, 2); s1.connect(mg, 1, 3); mg.connect(dst); PERF.cueMerge = mg; toast('Master → outputs 1–2, cue → outputs 3–4'); }
  else if (mode === 'split') toast('Split cue: master in the left ear, cue in the right (one headphone)');
  renderCuePanel(); }
function renderCuePanel() { const el = $('#cuePanel'); if (!el || el.hidden) return;
  const devs = PERF.devs.map((d) => `<option value="${d.deviceId}"${d.deviceId === PERF.cueDev ? ' selected' : ''}>${d.label || 'Output ' + d.deviceId.slice(0, 6)}</option>`).join('');
  el.querySelector('.mp-body').innerHTML = `<p class="note">The cue bus is pre-fader: press <b>CUE</b> on a deck to hear it before the room does.</p>
    <div class="cue-modes" role="radiogroup" aria-label="Headphone routing">${[['off', 'Off'], ['split', 'Split (one headphone)'], ['device', 'Second output device'], ['quad', 'Outputs 3–4 (4-out interface)']].map(([k, l]) => `<label class="row"><input type="radio" name="cuem" value="${k}"${PERF.cueMode === k ? ' checked' : ''}> <span>${l}</span></label>`).join('')}</div>
    <div class="row"${PERF.cueMode === 'device' ? '' : ' hidden'}><select id="cueDev" class="btn">${devs || '<option value="">default</option>'}</select><button class="btn" id="cueNames" title="Browsers hide device names until a media permission is granted">Show names</button></div>
    <label class="lbl" for="cueMix">Cue ↔ master in the headphones</label><input id="cueMix" type="range" min="0" max="1" step="0.01" value="${PERF.cueMix}">
    <p class="note">Second-device cue runs through the browser's media path (≈ 30–80 ms later than the room) — fine for previewing; split and 4-output modes are sample-locked.</p>`;
  $$('[name=cuem]', el).forEach((r) => r.onchange = async () => { if (r.value === 'device') await listOutputs(); routeCue(r.value); });
  const dv = $('#cueDev', el); if (dv) dv.onchange = () => routeCue('device', dv.value);
  const nm = $('#cueNames', el); if (nm) nm.onclick = async () => { try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach((t) => t.stop()); } catch (e) { /* denied */ } await listOutputs(); renderCuePanel(); };
  $('#cueMix', el).oninput = (e) => { PERF.cueMix = +e.target.value; send({ type: 'cue', mix: PERF.cueMix }); }; }

// ---- recording: the master as heard (Opus in WebM / Ogg, 256 kb/s), downloaded when stopped
function recMime() { for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']) if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m; return ''; }
// (v9.4) MP3: the master as heard, taken sample by sample from the engine's output (a tap worklet) and encoded as the set plays by
// FORGE's own MP3 encoder (320 kbit/s, joint stereo) on the composer thread — the file is ready the moment you stop, and a
// one-hour set holds ~140 MB of MP3 in memory, never the raw audio. Falls back to the browser's Opus recorder.
const TAP_SRC = "class T extends AudioWorkletProcessor{constructor(){super();this.n=0;this.L=new Float32Array(16384);this.R=new Float32Array(16384);this.port.onmessage=(e)=>{if(e.data==='flush'){this.f();this.port.postMessage('done');}}}f(){if(this.n){const L=this.L.slice(0,this.n),R=this.R.slice(0,this.n);this.port.postMessage({L,R},[L.buffer,R.buffer]);this.n=0;}}process(i){const a=i[0];if(a&&a.length){const l=a[0],r=a[1]||a[0];this.L.set(l,this.n);this.R.set(r,this.n);this.n+=l.length;if(this.n>16384-256)this.f();}return true}}registerProcessor('forge-tap',T);";
async function startMp3Rec() { const ctx = A.ctx, W = composerWorker(); if (!ctx.audioWorklet || !A.node || !W) return false; if (!PERF.tapReady) { const u = URL.createObjectURL(new Blob([TAP_SRC], { type: 'text/javascript' })); try { await ctx.audioWorklet.addModule(u); PERF.tapReady = 1; } catch (e) { return false; } finally { URL.revokeObjectURL(u); } }
  const tap = new AudioWorkletNode(ctx, 'forge-tap', { numberOfInputs: 1, numberOfOutputs: 0, channelCount: 2, channelCountMode: 'explicit' }); A.node.connect(tap, 0);
  W.postMessage({ type: 'mp3rec', op: 'start', sr: ctx.sampleRate, kbps: 320 }); let frames = 0; tap.port.onmessage = (e) => { if (e.data && e.data.L) { frames += e.data.L.length; W.postMessage({ type: 'mp3rec', op: 'push', L: e.data.L, R: e.data.R }, [e.data.L.buffer, e.data.R.buffer]); } };
  PERF.rec = { mp3: true, tap, stop: () => { tap.port.onmessage = (e) => { if (e.data && e.data.L) W.postMessage({ type: 'mp3rec', op: 'push', L: e.data.L, R: e.data.R }, [e.data.L.buffer, e.data.R.buffer]); else if (e.data === 'done') finish(); }; tap.port.postMessage('flush'); } };
  const finish = () => { try { A.node.disconnect(tap); } catch (er) { /* ignore */ } const id = 'rec' + Date.now(); const h = (ev) => { const m = ev.data; if (m.type !== 'mp3rec' || m.id !== id) return; W.removeEventListener('message', h);
      const blob = new Blob([m.data], { type: 'audio/mpeg' }), info = `${fmtTime(frames / ctx.sampleRate)}, ${(blob.size / 1e6).toFixed(1)} MB MP3 320`; saveFile(`DJ-TiTo-set-${stamp()}.mp3`, blob).then((saved) => { if (saved !== null) toast(`Recording ${saved === false ? 'not saved (declined)' : 'saved'} (${info})`); }); };
    W.addEventListener('message', h); W.postMessage({ type: 'mp3rec', op: 'finish', id }); PERF.rec = null; renderRec(); };
  PERF.recT0 = performance.now(); renderRec(); toast('Recording the master — MP3 320'); return true; }
async function toggleRec() { await startAudio(); if (PERF.rec) { PERF.rec.stop(); return; }
  if (PERF.cueMode !== 'split' && typeof mp3Encoder === 'function' && (await startMp3Rec())) return;
  if (!window.MediaRecorder) { toast('Recording is not supported in this browser'); return; }
  const ctx = A.ctx, md = ctx.createMediaStreamDestination(); if (A.node) A.node.connect(md, 0); else { toast('Recording needs the AudioWorklet engine'); return; }
  if (PERF.cueMode === 'split') toast('Note: split cue is on — the recording has the cue in the right channel');
  const mime = recMime(), r = new MediaRecorder(md.stream, mime ? { mimeType: mime, audioBitsPerSecond: 256000 } : undefined); PERF.recChunks = [];
  r.ondataavailable = (e) => { if (e.data && e.data.size) PERF.recChunks.push(e.data); };
  r.onstop = () => { try { A.node.disconnect(md, 0); } catch (e) { /* ignore */ } const type = r.mimeType || mime || 'audio/webm', ext = /ogg/.test(type) ? 'ogg' : /mp4/.test(type) ? 'm4a' : 'webm';
    const blob = new Blob(PERF.recChunks, { type }), info = `${Math.round((performance.now() - PERF.recT0) / 1000)} s, ${(blob.size / 1e6).toFixed(1)} MB`;
    saveFile(`DJ-TiTo-set-${stamp()}.${ext}`, blob).then((saved) => { if (saved !== null) toast(`Recording ${saved === false ? 'not saved (declined)' : 'saved'} (${info})`); }); PERF.rec = null; renderRec(); };
  r.start(1000); PERF.rec = r; PERF.recT0 = performance.now(); renderRec(); toast('Recording the master'); }
function renderRec() { const b = $('#recBtn'); if (!b) return; b.classList.toggle('rec', !!PERF.rec); b.textContent = PERF.rec ? '● ' + fmtTime((performance.now() - PERF.recT0) / 1000) : 'Rec'; b.setAttribute('aria-pressed', PERF.rec ? 'true' : 'false'); }
function stamp() { const d = new Date(), z = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}`; }
function fmtTime(s) { s = Math.floor(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

// ---- set save / load
function setSnapshot() { return { forge: 'set', v: 1, saved: new Date().toISOString(), lead, playing: decks.map((D) => !!D.playing), xf: +$('#xf').value, tx: { kind: $('#txKind').value, len: auto.len }, auto: { on: auto.on, journey: auto.journey }, midi: MIDI.map,
  decks: decks.map((D) => D.spec ? { spec: D.spec, pos: Math.floor(livePos(D) / 16) * 16, hot: hotOf(D).slice(), energy: D.energy != null ? D.energy : 0.5, auto: { on: Object.assign({}, autoOf(D).on), every: autoOf(D).every }, fader: D.fader != null ? D.fader : 1, eq: Object.assign({}, D.eq), filter: D.filter || 0, fresh: !!D.fresh } : null) }; } // (fresh: the track is cued and has not played — Auto-DJ may mix it in)
function saveSet() { const j = setSnapshot(), blob = new Blob([JSON.stringify(j, null, 1)], { type: 'application/json' }); saveFile(`DJ-TiTo-set-${stamp()}.json`, blob);
  try { localStorage.setItem('forge.set.last', JSON.stringify(j)); } catch (e) { /* storage may be unavailable */ } toast('Set saved — both decks, hot cues, mixer and controller mapping'); }
async function applySet(j) { if (!j || j.forge !== 'set' || !Array.isArray(j.decks)) { toast('That file is not a DJ TiTo set'); return false; } await startAudio();
  for (let i = 0; i < 2; i++) { const x = j.decks[i]; if (!x || !x.spec) continue; const v = validateSpec(x.spec); if (!v.ok) { toast(`Deck ${'AB'[i]}: ${v.errors[0].path} ${v.errors[0].msg}`); continue; }
    send({ type: 'pause', deck: i }); const s = await compileAsync(x.spec, { fastLevels: true }); installScore(i, s, { play: false, asSaved: true }); if (s.levelPending) refineInWorker(i, s); const D = decks[i]; D.fresh = x.fresh === true; /* (review) a resumed set marked both decks' tracks as waiting, and Auto-DJ mixed in again the one that had just played out; a set file without the field counts as played */ D.spec = x.spec; hotOf(D); D.hot = (x.hot || []).slice(0, HOT_N).concat(new Array(HOT_N).fill(null)).slice(0, HOT_N);
    const pos = Number.isFinite(+x.pos) ? Math.max(0, Math.min(s.meta.bars * 16 - 16, Math.floor(+x.pos / 16) * 16)) : 0; send({ type: 'seek', deck: i, step: pos }); D.pos = pos; /* (v9.2: a set file's position is a number in the track — "32" as text grew a string on the audio thread) */ if (x.auto) { const a = autoOf(D); Object.assign(a.on, x.auto.on || {}); a.every = x.auto.every || 16; renderAuto(i); } else if (x.evolve) autoSetAll(i, true);
    const num = (v, lo, hi) => (v != null && Number.isFinite(+v) ? Math.max(lo, Math.min(hi, +v)) : null); // (v9.2) a set file's numbers are checked: a value of another type or out of range is left out
    { const e = num(x.energy, 0, 1), f = num(x.fader, 0, 1); if (e != null) targets()[`${'AB'[i]}.energy`].set(e); if (f != null) targets()[`${'AB'[i]}.fader`].set(f); }
    for (const b of ['high', 'mid', 'low']) { const v = x.eq ? num(x.eq[b], -30, 6) : null; if (v != null) MK[i][b].set(v); } { const v = num(x.filter, -1, 1); if (v != null) MK[i].filter.set(v); } renderDeckHead(i); renderStems(i); }
  { const v = j.xf != null && Number.isFinite(+j.xf) ? Math.max(-1, Math.min(1, +j.xf)) : null; if (v != null) { $('#xf').value = v; sendGains(); } }
  if (j.tx) { $('#txKind').value = j.tx.kind === 'echo' ? 'echo' : 'blend'; auto.len = +j.tx.len === 16 ? 16 : 32; $('#txLen').value = String(auto.len); }
  if (j.auto) { auto.on = !!j.auto.on; auto.journey = ['flow', 'family', 'stay'].includes(j.auto.journey) ? j.auto.journey : 'flow'; $('#autoOn').checked = auto.on; $('#journey').value = auto.journey; }
  if (j.midi && typeof j.midi === 'object') { MIDI.map = j.midi; saveMidi(); }
  renderPerf(); renderDock(); toast('Set loaded — press Play'); return true; }
// AUTOSAVE (v9.2): while a set plays, its state (both decks' scores and places, hot cues, mixer, Auto, controller map) is kept in this
// browser every 20 s and when the page goes to the background; the start card then offers to resume it — after a crash, a closed tab or a
// dead battery the set comes back where it was, to the phrase
const AUTOSET = 'forge.set.auto';
function autoSaveSet() { if (!decks.some((D) => D.playing)) return; try { localStorage.setItem(AUTOSET, JSON.stringify(setSnapshot())); } catch (e) { /* storage full or blocked: nothing to resume */ } }
function autoSetSaved() { try { const j = JSON.parse(localStorage.getItem(AUTOSET) || 'null'); if (!j || j.forge !== 'set' || !Array.isArray(j.decks)) return null; const age = Date.now() - Date.parse(j.saved); return age >= 0 && age < 48 * 3600e3 ? j : null; } catch (e) { return null; } }
async function resumeSet(j) { const ok = await applySet(j); if (!ok) return false; const L = j.lead === 1 ? 1 : 0; if (j.playing && j.playing[L] && decks[L].score) { lead = L; playPause(L); toast('Set resumed where it was — playing'); } return true; }
setInterval(autoSaveSet, 20000); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') autoSaveSet(); }); window.addEventListener('pagehide', autoSaveSet);
function loadSetFile() { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = async () => { const f = inp.files && inp.files[0]; if (!f) return; try { await applySet(JSON.parse(await f.text())); } catch (e) { toast('Could not read the set: ' + e.message); } }; inp.click(); }
function loadLastSet() { let j = null; try { j = JSON.parse(localStorage.getItem('forge.set.last') || 'null'); } catch (e) { /* ignore */ } if (!j) { toast('No saved set in this browser yet'); return; } applySet(j); }

// ---- v7.1 live layer (after the grooveboxes and DJ mixers that do this well): FILL pads (the Elektron / Roland fill: held,
// generated on the grid — a snare roll, a hat ratchet, a kick roll, toms tuned to the chord that is playing), PART MACROS (the
// Circuit idea: one knob per part that matters — the stab filter and decay, the bass filter, the lead filter, echo throws) and
// an XY PAD (Kaoss / X-Pad): X = the deck filter (left low-pass, right high-pass), Y = the space (echo and room on every melodic
// part); on release both spring back unless HOLD is on. Every one of them is a controller target too.
const FILLS = [['roll', 'Snare roll'], ['hats', 'Hat ratchet'], ['kick', 'Kick roll'], ['toms', 'Toms in key']];
const MACROS = [['stabCut', 'Stab filter'], ['stabDec', 'Stab decay'], ['stabEcho', 'Stab echo'], ['bassCut', 'Bass filter'], ['leadCut', 'Lead filter'], ['leadEcho', 'Lead echo']];
const MACRO_CENTER = { stabCut: 1, stabDec: 1, bassCut: 1, leadCut: 1 }; // bipolar: centre = the sound as written
function macroState(i) { const D = decks[i]; return D.macro || (D.macro = { stabCut: 0.5, stabDec: 0.5, stabEcho: 0, bassCut: 0.5, leadCut: 0.5, leadEcho: 0, base: null }); }
function macroGet(i, k) { return macroState(i)[k]; }
// a filter macro on any sound: the cutoff where the model has a filter; on the ones that have none (EP, piano, organ, bell,
// plucked string, vox, sub, 808) the TONE low-pass — down the knob darkens, the centre and up leave the sound as written
function cutOrTone(K, x, oct, c0, mn, mx) { if (TONE_MODELS.includes(K.model)) return { tone: x < 0 ? 1 + 0.8 * x : 1 }; return { cut: clamp((K.cut || c0) * Math.pow(2, oct * x), mn, mx) }; }
function macroSet(i, k, v) { const D = decks[i], M = macroState(i); if (!D.score) return; M[k] = clamp(v, 0, 1); const kits = D.score.kits;
  if (!M.base || M.base.score !== D.score) M.base = { score: D.score, chords: kits.chords && Object.assign({}, kits.chords), bass: kits.bass && Object.assign({}, kits.bass), lead: kits.lead && Object.assign({}, kits.lead) };
  const B = M.base, x = M[k] * 2 - 1;
  if (k === 'stabCut' && B.chords) send({ type: 'kit', deck: i, slot: 'chords', p: cutOrTone(B.chords, x, 3, 2000, 60, 16000) });
  else if (k === 'stabDec' && B.chords) send({ type: 'kit', deck: i, slot: 'chords', p: { aDec: clamp(B.chords.aDec * Math.pow(2, 2 * x), 0.02, 4), aRel: clamp(B.chords.aRel * Math.pow(2, 1.5 * x), 0.02, 4) } });
  else if (k === 'bassCut' && B.bass) send({ type: 'kit', deck: i, slot: 'bass', p: cutOrTone(B.bass, x, 2.5, 800, 40, 12000) });
  else if (k === 'leadCut' && B.lead) send({ type: 'kit', deck: i, slot: 'lead', p: cutOrTone(B.lead, x, 2.5, 3000, 60, 16000) });
  else if (k === 'stabEcho') send({ type: 'partfx', deck: i, ch: 5, echo: M[k] > 0.01 ? M[k] : -1 });
  else if (k === 'leadEcho') { send({ type: 'partfx', deck: i, ch: 7, echo: M[k] > 0.01 ? M[k] : -1 }); send({ type: 'partfx', deck: i, ch: 8, echo: M[k] > 0.01 ? M[k] * 0.7 : -1 }); } }
// BUILD → DROP: from wherever the deck is, a riser over the bars left to the next 4-bar line (at least one bar: the line after
// if the next one is too close), a snare-up over the last bar, and a jump to the next drop exactly on the line
function buildToDrop(i) { const D = decks[i]; if (!D.score || !D.playing) return; const secs = D.score.sections; let k = secs.findIndex((S, n) => n > D.sec && S.type === 'drop'); if (k < 0) k = secs.findIndex((S) => S.type === 'drop'); if (k < 0) { toast('This track has no drop'); return; }
  const pos = schedPos(D); let at = Math.ceil((pos + 1) / 64) * 64; if (at - pos < 16) at += 64; const len = at - pos;
  // the riser ends exactly on the line wherever it starts, and the snare-up for the last bar is held by the engine and starts on its exact sample
  // (a page timer put it a few tens of ms off, more when the page was busy)
  { const G = GENRE_BY_ID[D.gid], fam = G ? G.family : 'house', L = txRecipesFor(fam, 'rise'), key = D.score.meta.key % 12, third = (MODES[D.score.meta.mode] || MODES.minor)[2] === 4 ? 4 : 3; // (v9.5) a layered riser from the genre's own recipes, a different one each time
    if (L.length) send({ type: 'fxNow', deck: i, kind: 13, rec: L[Math.floor(Math.random() * L.length)], v: 0.9, until: at, note: 60 + key, pan: third }); else send({ type: 'fxNow', deck: i, kind: 0, v: 0.9, until: at }); }
  send({ type: 'at', deck: i, atStep: at - 16, list: [{ type: 'fxNow', kind: 4, v: 0.8, until: at }] });
  send({ type: 'jump', deck: i, atStep: at, step: secs[k].bar0 * 16 }); D.pendJump = at; toast(`Build → drop: ${Math.round(len / 16)} bar${len > 16 ? 's' : ''} of riser, the drop lands on bar ${at / 16 + 1}`); }
// ear candy on a pad (v9): a zap, laser, squelch, bubbles or swirl — in the key of the bar that is playing (a chord tone), panned
// at random, landing on the next sixteenth (the engine holds it to its step: 'at')
const EAR_PADS = [['zap', 7, 2.5, 'ZAP'], ['laser', 12, 2, 'LASER'], ['squelch', 11, 2.5, 'SQUELCH'], ['bubbles', 9, 4, 'BUBBLES'], ['rise', 8, 3, 'RISE'], ['swirl', 10, 16, 'SWIRL']];
function earCandy(i, k) { const D = decks[i], s = D.score; if (!s) { toast('Load a track first'); return; } const [, kind, steps] = EAR_PADS[k], pos = schedPos(D), bar = Math.max(0, Math.min(s.meta.bars - 1, Math.floor(pos / 16)));
  const tones = (s.chords && s.chords[bar] && s.chords[bar].tones) || [s.meta.key], pc = tones[Math.floor(Math.random() * tones.length)], note = 60 + ((pc % 12) + 12) % 12 + (Math.random() < 0.4 ? 12 : 0);
  const msg = { type: 'fxNow', kind, steps, note, pan: (Math.random() * 2 - 1) * 0.7, v: 0.85 }; if (D.playing) send({ type: 'at', deck: i, atStep: Math.ceil(pos + 0.05), list: [msg] }); else send(Object.assign({ deck: i }, msg)); }
function xyOf(i) { const D = decks[i]; return D.xy || (D.xy = { x: 0, y: 0, hold: false }); }
function xySet(i, x, y) { const S = xyOf(i); if (x != null) S.x = clamp(x, -1, 1); if (y != null) S.y = clamp(y, 0, 1);
  targets()[`${'AB'[i]}.filter`].set((Math.abs(S.x) < 0.04 ? 0 : S.x) * 0.5 + 0.5); const e = S.y < 0.03 ? -1 : S.y * 0.85, r = S.y < 0.03 ? 0 : S.y * 0.6;
  for (const c of [5, 6, 7, 8]) send({ type: 'partfx', deck: i, ch: c, echo: e, verb: r }); }
// ---- Perform view: per deck, big touch pads — sections (cue to a section on the next 4-bar line), hot cues, part re-draws,
// FX held while pressed, loops, energy; the editor, library and meters step out of the way
function buildPerf() { for (let i = 0; i < 2; i++) { const el = deckEl(i), p = document.createElement('div'); p.className = 'perf'; p.dataset.d = i; el.appendChild(p); }
  renderPerf(); }
function renderPerf() { if (!$('.perf')) return; if (PERF.hold > 0) { PERF.dirty = true; return; } PERF.dirty = false; for (let i = 0; i < 2; i++) { const D = decks[i], p = $(`.perf[data-d="${i}"]`); if (!p) continue; const s = D.score, H = s ? hotOf(D) : [];
    p.innerHTML = s ? `<div class="pgrid sec">${s.sections.slice(0, 10).map((S, k) => `<button class="pad" data-sec="${k}" style="--pc:var(${SECTION_COL[S.type] || '--s-intro'})"><b>${esc(S.type)}</b><small>bar ${S.bar0 + 1}</small></button>`).join('')}</div>
      <div class="pgrid hot">${H.map((h, k) => `<button class="pad hotp${h == null ? ' empty' : ''}" data-hot="${k}" style="--pc:${HOT_COL[k]}" title="${h == null ? 'Set at the current bar' : 'Jump on the next bar · Shift or long-press to clear'}"><b>${k + 1}</b><small>${h == null ? 'set' : 'bar ' + (h / 16 + 1)}</small></button>`).join('')}</div>
      <div class="pgrid fx">${FX_RACK.map(([k, l], n) => `<button class="pad fxp${D.fxOn && D.fxOn[n] ? ' on' : ''}" data-fxh="${k}" style="--pc:var(--dc)"><b>${l}</b><small>hold</small></button>`).join('')}</div>
      <div class="pgrid part">${[['drums', 'Drums'], ['bass', 'Bass'], ['chords', 'Chords'], ['lead', 'Melody']].map(([k, l]) => `<button class="pad" data-np="${k}" style="--pc:var(--line2)"><b>New</b><small>${l}</small></button>`).join('')}
        ${[4, 8, 16].map((l) => `<button class="pad${D.loop === l ? ' on' : ''}" data-pl="${l}" style="--pc:var(--line2)"><b>Loop</b><small>${l} bars</small></button>`).join('')}
        <button class="pad cuebtn${D.cue ? ' on' : ''}" data-d="${i}" data-pcue style="--pc:var(--good)"><b>CUE</b><small>phones</small></button>
        <button class="pad${autoAny(D) ? ' on' : ''}" data-pauto style="--pc:var(--b)"><b>AUTO</b><small>every ${autoOf(D).every}</small></button>
        <button class="pad" data-pthrow style="--pc:var(--a)" title="The music bus (chords, pad, lead, arp) into the tempo delay and the room for half a bar"><b>ECHO THROW</b><small>½ bar</small></button>
        <button class="pad" data-pdrop style="--pc:var(--s-drop)" title="A riser and a snare-up to the next 4-bar line, then the next drop lands on it"><b>BUILD → DROP</b><small>next line</small></button></div>
      <div class="pgrid fill">${FILLS.map(([k, l]) => `<button class="pad fillp" data-fill="${k}" style="--pc:var(--s-build)"><b>${l}</b><small>hold</small></button>`).join('')}</div>
      <div class="pgrid ear">${EAR_PADS.map(([k, , , l], n) => `<button class="pad earp" data-candy="${n}" style="--pc:var(--b)" title="A ${k} in key, on the next sixteenth"><b>${l}</b><small>in key</small></button>`).join('')}</div>
      <div class="pmid"><div class="xy" data-xy aria-label="XY pad: filter and space" role="slider"><span class="xyl">LP</span><span class="xyr">HP</span><span class="xyt">SPACE</span><i class="xydot"></i></div>
        <div class="macros">${MACROS.filter(([k]) => (k.startsWith('stab') ? s.kits.chords : k.startsWith('bass') ? s.kits.bass : s.kits.lead)).map(([k, l]) => `<label class="mac"><span>${l}</span><input type="range" min="0" max="1" step="0.01" value="${macroGet(i, k)}" data-mac="${k}" aria-label="${l}"></label>`).join('')}
        <label class="mac hold"><input type="checkbox" data-xyhold ${xyOf(i).hold ? 'checked' : ''}> XY hold</label></div></div>
      <label class="pen"><span class="lbl">Energy</span><input type="range" min="0" max="1" step="0.01" value="${D.energy != null ? D.energy : 0.5}" data-pen aria-label="Energy deck ${'AB'[i]}"></label>` : '';
    p.insertAdjacentHTML('beforeend', `<div class="row pload"><span class="lbl">${s ? 'Next track' : 'Load'}</span><select class="btn" data-pgenre aria-label="Genre for deck ${'AB'[i]}">${GENRES.map((g) => `<option value="${g.id}"${g.id === (D.gid || (i ? 'techno' : 'tech-house')) ? ' selected' : ''}>${g.name}</option>`).join('')}</select><button class="btn" data-pload>Load</button>${s && decks[i ^ 1].playing && !D.playing ? '<button class="btn" data-pmix>Mix in</button>' : ''}</div>`);
    // (v9.2) the load policy: the next track goes to a free deck — this one when it is free, else the other one (cued, to mix in); it
    // replaced the only playing deck before
    $('[data-pload]', p).onclick = async () => { await startAudio(); const t = loadTarget(i); if (t < 0) { toast(onAirMsg(i)); return; } if (t !== i) toast(`Deck ${'AB'[i]} is on air — the next track goes to deck ${'AB'[t]}`); loadDeck(t, $('[data-pgenre]', p).value, { play: !decks[t ^ 1].playing }); };
    const pm = $('[data-pmix]', p); if (pm) pm.onclick = () => mixInto(i);
    $$('[data-sec]', p).forEach((b) => b.onclick = () => jumpTo(i, +b.dataset.sec));
    $$('[data-hot]', p).forEach((b) => { let t = 0, long = false; b.onpointerdown = () => { long = false; t = setTimeout(() => { long = true; hotPress(i, +b.dataset.hot, true); }, 650); };
      b.onpointerup = (e) => { clearTimeout(t); if (!long) hotPress(i, +b.dataset.hot, e.shiftKey); }; b.onpointerleave = () => clearTimeout(t); });
    $$('[data-fxh]', p).forEach((b) => { const T = targets()[`${'AB'[i]}.fx.${b.dataset.fxh}.hold`]; let held = false; b.onpointerdown = (e) => { try { b.setPointerCapture(e.pointerId); } catch (x) { /* synthetic */ } if (!held) { held = true; PERF.hold++; } T.down(); b.classList.add('on'); }; b.onpointerup = () => { T.up(); b.classList.remove('on'); if (held) { held = false; PERF.hold = Math.max(0, PERF.hold - 1); if (PERF.dirty) setTimeout(renderPerf, 0); } }; b.onpointercancel = b.onpointerup; });
    $$('[data-np]', p).forEach((b) => b.onclick = () => regenPart(i, b.dataset.np));
    $$('[data-candy]', p).forEach((b) => b.onpointerdown = () => { earCandy(i, +b.dataset.candy); /* (data-ear is the hardware check's "what did you hear" buttons) */ b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit'); });
    { const t = $('[data-pthrow]', p); if (t) t.onclick = () => { send({ type: 'throw', deck: i, steps: 8 }); t.classList.remove('hit'); void t.offsetWidth; t.classList.add('hit'); }; }
    $$('[data-pl]', p).forEach((b) => b.onclick = () => { setLoop(i, +b.dataset.pl); renderPerf(); });
    const cb = $('[data-pcue]', p); if (cb) cb.onclick = () => setCue(i);
    const pd = $('[data-pdrop]', p); if (pd) pd.onclick = () => buildToDrop(i);
    const au = $('[data-pauto]', p); if (au) au.onclick = () => { autoSetAll(i, !autoAny(D)); renderPerf(); };
    const en = $('[data-pen]', p); if (en) en.oninput = (e) => targets()[`${'AB'[i]}.energy`].set(+e.target.value);
    $$('[data-fill]', p).forEach((b) => { const k = b.dataset.fill; let held = false; b.onpointerdown = (e) => { try { b.setPointerCapture(e.pointerId); } catch (x) { /* synthetic */ } if (!held) { held = true; PERF.hold++; } send({ type: 'fill', deck: i, kind: k, on: true }); b.classList.add('on'); };
      b.onpointerup = () => { send({ type: 'fill', deck: i, kind: k, on: false }); b.classList.remove('on'); if (held) { held = false; PERF.hold = Math.max(0, PERF.hold - 1); if (PERF.dirty) setTimeout(renderPerf, 0); } }; b.onpointercancel = b.onpointerup; });
    $$('[data-mac]', p).forEach((r) => { r.oninput = () => macroSet(i, r.dataset.mac, +r.value); r.ondblclick = () => { r.value = MACRO_CENTER[r.dataset.mac] ? 0.5 : 0; macroSet(i, r.dataset.mac, +r.value); }; });
    const hb = $('[data-xyhold]', p); if (hb) hb.onchange = () => { xyOf(i).hold = hb.checked; if (!hb.checked) xySet(i, 0, 0); };
    const xy = $('[data-xy]', p); if (xy) { const dot = $('.xydot', xy), place = () => { const S = xyOf(i); dot.style.left = (S.x + 1) * 50 + '%'; dot.style.top = (1 - S.y) * 100 + '%'; }; place(); let down = false;
      const at = (e) => { const r = xy.getBoundingClientRect(); xySet(i, ((e.clientX - r.left) / r.width) * 2 - 1, 1 - (e.clientY - r.top) / r.height); place(); };
      xy.onpointerdown = (e) => { down = true; PERF.hold++; try { xy.setPointerCapture(e.pointerId); } catch (x) { /* synthetic */ } at(e); };
      xy.onpointermove = (e) => { if (down) at(e); };
      xy.onpointerup = () => { if (!down) return; down = false; PERF.hold = Math.max(0, PERF.hold - 1); if (!xyOf(i).hold) { xySet(i, 0, 0); place(); } if (PERF.dirty) setTimeout(renderPerf, 0); }; xy.onpointercancel = xy.onpointerup; } } }
function setPerform(on) { if (typeof go === 'function' && $('.screens')) { go(on === false ? 'play' : 'fx'); return; } /* (v9.3) the pads live on the FX screen */ PERF.on = on == null ? !PERF.on : !!on; document.body.classList.toggle('perform', PERF.on); const b = $('#perfBtn'); if (b) { b.classList.toggle('on', PERF.on); b.setAttribute('aria-pressed', PERF.on ? 'true' : 'false'); }
  renderPerf(); toast(PERF.on ? 'Perform view: pads only (P to leave)' : 'Full view'); }
function perfFrame() { if (PERF.rec) renderRec();
  for (let i = 0; i < 2; i++) { const D = decks[i], p = $(`.perf[data-d="${i}"]`); if (!p || !D.score) continue; $$('[data-sec]', p).forEach((b) => b.classList.toggle('now', +b.dataset.sec === D.sec)); } }

function buildPerform() { const top = $('.top'), after = $('#ctlBtn');
  const mk = (id, label, title) => { const b = document.createElement('button'); b.className = 'power'; b.id = id; b.textContent = label; b.title = title; after.insertAdjacentElement('afterend', b); return b; };
  const safeB = mk('safeBtn', 'Safe', 'Panic button (Esc): all FX off, filters centred, loops released, Auto paused'); safeB.classList.add('safe'); safeB.onclick = () => safeAll();
  const setB = mk('setBtn', 'Set', 'Save or load a set: both decks, hot cues, mixer, controller mapping'); const cueB = mk('cueBtn', 'Cue', 'Headphone cue routing'); const recB = mk('recBtn', 'Rec', 'Record the master to a file'); const perfB = mk('perfBtn', 'Perform', 'Pads-only performance view (P)');
  void top; perfB.onclick = () => setPerform(); recB.onclick = toggleRec;
  const pop = (id, title, body) => { const el = document.createElement('div'); el.className = 'midi-panel'; el.id = id; el.hidden = true; el.innerHTML = `<div class="mp-card"><div class="mp-head"><h3>${title}</h3><button class="btn" data-close>Close</button></div><div class="mp-body">${body}</div></div>`; document.body.appendChild(el); $('[data-close]', el).onclick = () => { el.hidden = true; }; el.onclick = (e) => { if (e.target === el) el.hidden = true; }; return el; };
  const sp = pop('setPanel', 'Set', `<div class="row"><button class="btn big" id="setSave">Save set…</button><button class="btn big" id="setLoad">Load set…</button><button class="btn" id="setLast">Load last saved here</button></div><p class="note">A set file holds both decks' scores (every edit), playback positions, hot cues, energy, EQ, faders, crossfader, Auto-DJ and your controller mapping. It is plain JSON — an AI can read and write it too.</p>`);
  $('#setSave', sp).onclick = saveSet; $('#setLoad', sp).onclick = () => { sp.hidden = true; loadSetFile(); }; $('#setLast', sp).onclick = () => { sp.hidden = true; loadLastSet(); };
  setB.onclick = () => { sp.hidden = false; }; const cp = pop('cuePanel', 'Headphone cue', ''); cueB.onclick = async () => { cp.hidden = false; await listOutputs(); renderCuePanel(); };
  // CUE buttons on the mixer channels
  $$('.chan').forEach((ch) => { const i = +ch.dataset.d, b = document.createElement('button'); b.className = 'btn cuebtn'; b.dataset.d = i; b.textContent = 'CUE'; b.title = `Hear deck ${'AB'[i]} in the headphones (pre-fader)`; b.onclick = () => setCue(i); ch.appendChild(b); });
  buildPerf();
  document.addEventListener('keydown', (e) => { if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || e.target.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'p' || e.key === 'P') setPerform(); else if (/^F[1-4]$/.test(e.key)) { e.preventDefault(); hotPress(lead, +e.key.slice(1) - 1, e.shiftKey); } });
  setInterval(perfFrame, 250); }
