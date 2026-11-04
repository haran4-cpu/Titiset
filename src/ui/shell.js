/* ===================== FORGE · SHELL (v9.3) =====================
   Five screens — PLAY · MIX · FX · EDIT · SET — side by side in one horizontal scroller with snap points, a tab bar that never
   moves, and one home for every control (docs/UI-SPEC-v9.3.md). The screens are moved into place once at start; after that
   only the person moves between them. The Beat FX panel (FX screen) and the transport row (PLAY) are built here. */
const SHELL = { screen: 'play', fxDeck: 0, dsDeck: 0 };
const SCREENS = [['play', 'Play'], ['mix', 'Mix'], ['fx', 'FX'], ['edit', 'Edit'], ['set', 'Set']];
// the Beat FX the person sees, mapped to the engine: [id, label, engine name, has a Beat]
const BEAT_FX = [['delay', 'Delay', 'delay', 1], ['dub', 'Dub echo', 'dub', 1], ['reverb', 'Reverb', 'reverb', 0], ['filter', 'Filter', 'sweep', 1], ['flanger', 'Flanger', 'flanger', 1], ['phaser', 'Phaser', 'phaser', 1],
  ['roll', 'Roll', 'repeat', 0], ['brake', 'Brake', 'tape', 0], ['crush', 'Crush', 'crush', 0], ['trans', 'Trans', 'gate', 1], ['noise', 'Noise', 'noise', 1]];
const BEAT_FX_BY = Object.fromEntries(BEAT_FX.map((x) => [x[0], x]));
const BEAT_OPTS = [[0, '1/16'], [1, '1/8'], [2, '3/16'], [3, '1/4'], [4, '3/8'], [5, '1/2'], [6, '1 bar'], [7, '2 bars'], [8, '1/8T'], [9, '1/4T'], [10, '4 bars'], [11, '8 bars']];
const BEAT_DEF = { delay: 2, dub: 2, filter: 7, flanger: 7, phaser: 6, trans: 0, noise: 10 };
const FX_TARGETS = [[-1, 'Whole deck'], [0, 'Kick'], [1, 'Snare'], [2, 'Hats'], [3, 'Percussion'], [4, 'Bass'], [5, 'Chords'], [6, 'Pad'], [7, 'Lead'], [8, 'Arp']];
// each effect's own parameters: [key, label, min, max] or [key, label, 'toggle'] or [key, label, [choices]]
const BFX_PARAMS = { delay: [['fb', 'Feedback', 0, 0.95], ['tone', 'Tone', -1, 1], ['wob', 'Wobble', 0, 1], ['pp', 'Ping-pong', 'toggle']], reverb: [['size', 'Size', 0, 1], ['damp', 'Damping', 0, 1], ['pre', 'Pre-delay', 0, 0.1], ['freeze', 'Freeze', 'toggle']],
  filter: [['type', 'Type', ['LP', 'HP', 'BP']], ['res', 'Resonance', 0, 1]] };
const BFX_PDEF = { fb: 0.55, tone: 0, wob: 0, pp: 1, size: 0.6, damp: 0.4, pre: 0.02, freeze: 0, type: 0, res: 0.6 };
function bfxOf(i) { const D = decks[i]; if (!D.bfx) { D.bfx = { sel: (tasteFav('beat:') && BEAT_FX_BY[tasteFav('beat:')]) ? tasteFav('beat:') : 'delay', target: -1, q: true, latch: true, fx: {} }; for (const [id] of BEAT_FX) D.bfx.fx[id] = { on: false, amt: id === 'reverb' ? 0.45 : 0.6, beat: BEAT_DEF[id] ?? 3, p: Object.assign({}, BFX_PDEF) }; } return D.bfx; }
// one message to the engine for one effect of one deck
function bfxSend(i, id, extra) { const B = bfxOf(i), F = B.fx[id], E = BEAT_FX_BY[id]; const m = { type: 'fx', deck: i, name: E[2], on: F.on, amt: F.amt };
  if (E[2] !== 'repeat' && E[2] !== 'tape') { if (E[3]) m.beat = F.beat; m.p = F.p; m.q = !!(B.q && extra !== 'now'); if (B.target >= 0) m.ch = B.target; }
  send(m); }
function bfxToggle(i, id, on) { const B = bfxOf(i), F = B.fx[id]; F.on = on == null ? !F.on : !!on; if (F.on) tasteFx('beat:' + id); bfxSend(i, id); renderBeatFx(); }
function bfxTarget(i, t) { const B = bfxOf(i); if (t === B.target) return; for (const [id] of BEAT_FX) if (B.fx[id].on) { B.fx[id].on = false; bfxSend(i, id, 'now'); } B.target = t; renderBeatFx(); }
// ---- the shell ----
function buildShell() { const app = $('.app'), con = $('.console'); if (!app || !con || $('.screens')) return;
  const sc = document.createElement('div'); sc.className = 'screens'; sc.setAttribute('aria-label', 'Screens');
  sc.innerHTML = SCREENS.map(([k, l]) => `<section class="screen" data-screen="${k}" aria-label="${l}"><div class="scr-in"></div></section>`).join('');
  const into = (k) => $(`.screen[data-screen="${k}"] .scr-in`, sc);
  app.insertBefore(sc, con); const mixer = $('.mixer', con);
  // PLAY: the decks and the transport row
  for (const d of $$('.deck', con)) into('play').appendChild(d);
  const tr = document.createElement('div'); tr.className = 'transport'; tr.setAttribute('role', 'group'); tr.setAttribute('aria-label', 'Transport');
  tr.innerHTML = `<label class="tp-kind"><span class="lbl">Next mix</span></label><button class="tp" data-tp="play0">▶ A</button><button class="tp mix" data-tp="mix"><span>Mix →</span><small class="tp-style">Auto</small></button><button class="tp" data-tp="play1">▶ B</button><div class="tp-ext" role="group" aria-label="Keep the playing track going"><button class="tp" data-ext="extend">+ Extend</button><button class="tp" data-ext="ride">Ride</button><button class="tp" data-ext="endless" aria-pressed="false">∞ Endless</button></div>`; into('play').appendChild(tr); wireExtend($('.tp-ext', tr));
  { const k = $('#txKind'), lb = $('label[for="txKind"]'); if (k) k.addEventListener('change', () => tasteMix(k.value)); if (k) { $('.tp-kind', tr).appendChild(k); k.setAttribute('aria-label', 'Transition for the next mix'); } if (lb) lb.remove(); } // the transition is chosen where the mix is started
  $('[data-tp=play0]', tr).onclick = () => playPause(0); $('[data-tp=play1]', tr).onclick = () => playPause(1);
  $('[data-tp=mix]', tr).onclick = async () => { await startAudio(); const b = lead ^ 1, D = decks[b]; if (tx) { toast('A mix is already running — Cancel it on MIX'); return; } if (!D.score) { toast(`Deck ${'AB'[b]} is empty — pick a genre for it first`); return; } if (!decks[lead].playing) { playPause(b); return; } mixInto(b); };
  // MIX: the mixer
  if (mixer) into('mix').appendChild(mixer); con.remove(); const ds = document.createElement('section'); ds.className = 'decksound'; into('mix').appendChild(ds); buildDeckSound(ds);
  // FX: the Beat FX, then the performance pads (moved out of the decks)
  const fx = document.createElement('div'); fx.className = 'bfx'; fx.setAttribute('aria-label', 'Beat FX'); into('fx').appendChild(fx); buildBeatFx(fx);
  const mg = document.createElement('div'); mg.className = 'mangle'; into('fx').appendChild(mg); buildMangle(mg);
  const rz = document.createElement('div'); rz.className = 'risers'; into('fx').appendChild(rz); buildRisers(rz);
  const os = document.createElement('div'); os.className = 'oneshots'; into('fx').appendChild(os); buildOneShots(os);
  const pads = document.createElement('div'); pads.className = 'fx-pads'; into('fx').appendChild(pads); for (const p of $$('.perf')) pads.appendChild(p);
  // EDIT: the editor
  const dock = $('#dock'); if (dock) { into('edit').appendChild(dock); DOCK.open = true; renderDock(); }
  // SET (v10 order): the session first — record, set files, cue, controller, safe, perform — then My library and the playlists, then the
  // styles (the genre library), then making new tracks (Ask, length), then Your sound and the telemetry
  const lib = $('.lib'); const top = $('.top'); const set = into('set'); const ask = $('.askbar');
  if (top) { const tools = document.createElement('section'); tools.className = 'set-tools'; tools.setAttribute('aria-label', 'Session'); tools.innerHTML = '<h3 class="set-h">Session</h3><div class="set-row"></div>'; const row = $('.set-row', tools);
    for (const id of ['recBtn', 'setBtn', 'cueBtn', 'ctlBtn', 'safeBtn', 'perfBtn', 'power']) { const b = $('#' + id, top); if (b) row.appendChild(b); } for (const b of $$('button.power', top)) row.appendChild(b); set.appendChild(tools); }
  const mylibSlot = document.createElement('div'); mylibSlot.className = 'mylib-slot'; set.appendChild(mylibSlot);
  if (lib) { set.appendChild(lib); }
  const mk = document.createElement('section'); mk.className = 'set-new'; mk.setAttribute('aria-label', 'New tracks'); mk.innerHTML = '<h3 class="set-h">New tracks</h3>'; set.appendChild(mk); if (ask) mk.appendChild(ask);
  { const lp = document.createElement('div'); lp.className = 'lenpick'; lp.innerHTML = `<span class="lbl">Length</span><div class="seg" role="group" aria-label="Length of new tracks">${TRACK_LENS.map(([k, l, d]) => `<button data-len="${k}" title="${d}">${l}</button>`).join('')}</div>`; mk.appendChild(lp); // (v9.4) Radio · Club · Extended
    const paint = () => $$('[data-len]', lp).forEach((b) => { const on = b.dataset.len === TRACK_LEN.v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    $$('[data-len]', lp).forEach((b) => b.onclick = () => { TRACK_LEN.v = b.dataset.len; try { localStorage.setItem('forge.len', TRACK_LEN.v); } catch (e) { /* per-viewer convenience only */ } paint(); toast(`New tracks: ${b.textContent} — ${b.title}`); }); paint(); }
  buildMyLib(); buildTaste(); /* (v9.5) My library goes in its slot (above the styles); Your sound after New tracks */
  if (top) { const tele = $('.tele', top); if (tele) set.appendChild(tele); }
  // the status bar (not interactive) and the tab bar
  if (top) { const st = document.createElement('div'); st.className = 'status'; st.innerHTML = `<b>DJ TiTo</b><span class="st-bpm">—</span><span class="st-lufs">—</span><span class="st-mix"></span>`; top.appendChild(st); }
  const tb = document.createElement('nav'); tb.className = 'tabbar'; tb.setAttribute('aria-label', 'Screens'); tb.innerHTML = SCREENS.map(([k, l]) => `<button data-go="${k}" aria-label="${l} screen">${l}</button>`).join(''); document.body.appendChild(tb);
  $$('[data-go]', tb).forEach((b) => b.onclick = () => go(b.dataset.go));
  // the current screen follows the scroller (a swipe), never the other way round
  let tk = 0; sc.addEventListener('scroll', () => { cancelAnimationFrame(tk); tk = requestAnimationFrame(() => { const w = sc.clientWidth || 1, s = SCREENS[Math.max(0, Math.min(SCREENS.length - 1, Math.round(sc.scrollLeft / $('.screen', sc).offsetWidth)))][0]; if (SHELL.goal) { if (s === SHELL.goal) SHELL.goal = null; return; } if (w && s !== SHELL.screen) { SHELL.screen = s; renderTabs(); } }); }, { passive: true });
  document.body.classList.add('shell'); renderTabs(); renderBeatFx(); }
function go(k) { const sc = $('.screens'), el = $(`.screen[data-screen="${k}"]`); if (!sc || !el) return; SHELL.screen = k; SHELL.goal = k; clearTimeout(SHELL.goalT); SHELL.goalT = setTimeout(() => { SHELL.goal = null; }, 1500); /* (the screens passed on the way do not light their tabs) */ sc.scrollTo({ left: el.offsetLeft, behavior: 'auto' }); /* (instant: a smooth scroll can be re-snapped back to its start by a layout change on the way) */ renderTabs(); }
function renderTabs() { $$('.tabbar [data-go]').forEach((b) => { const on = b.dataset.go === SHELL.screen; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }); }
// ---- Beat FX panel ----
function buildBeatFx(el) {
  el.innerHTML = `<div class="bfx-head"><div class="seg bfx-deck" role="group" aria-label="Deck for the effects"><button data-bd="0">Deck A</button><button data-bd="1">Deck B</button></div>
      <label class="bfx-tgt"><span class="lbl">On</span><select class="btn bfx-target" aria-label="What the effect is on">${FX_TARGETS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label></div>
    <div class="bfx-grid" role="group" aria-label="Effect">${BEAT_FX.map(([id, l]) => `<button data-fx="${id}">${l}</button>`).join('')}</div>
    <div class="bfx-beats seg" role="group" aria-label="Beat">${BEAT_OPTS.map(([v, l]) => `<button data-beat="${v}">${l}</button>`).join('')}</div>
    <div class="bfx-play"><div class="xpad" role="slider" aria-label="X-Pad: left–right Beat, up–down Depth" tabindex="0"><i class="xpad-dot"></i><span class="xpad-l">Beat →</span><span class="xpad-d">Depth ↑</span></div>
      <div class="bfx-side"><label class="lbl" for="bfxDepth">Depth</label><input id="bfxDepth" class="bfx-depth" type="range" min="0" max="1" step="0.01" aria-label="Depth">
        <button class="bfx-q" aria-pressed="true" title="Switch on the next beat">Quantize</button><button class="bfx-on big" aria-pressed="false">FX ON</button></div></div>
    <div class="bfx-params"></div>`;
  $$('[data-bd]', el).forEach((b) => b.onclick = () => { SHELL.fxDeck = +b.dataset.bd; renderBeatFx(); $$('.os-d').forEach((d) => { d.textContent = 'AB'[SHELL.fxDeck]; }); renderRisers(); renderMangle(); });
  $('.bfx-target', el).onchange = (e) => bfxTarget(SHELL.fxDeck, +e.target.value);
  $$('[data-fx]', el).forEach((b) => b.onclick = () => { bfxOf(SHELL.fxDeck).sel = b.dataset.fx; renderBeatFx(); });
  $$('[data-beat]', el).forEach((b) => b.onclick = () => { const i = SHELL.fxDeck, B = bfxOf(i), F = B.fx[B.sel]; F.beat = +b.dataset.beat; if (F.on) bfxSend(i, B.sel, 'now'); renderBeatFx(); });
  $('.bfx-depth', el).oninput = (e) => { const i = SHELL.fxDeck, B = bfxOf(i), F = B.fx[B.sel]; F.amt = +e.target.value; if (F.on) bfxSend(i, B.sel, 'now'); };
  $('.bfx-q', el).onclick = () => { const B = bfxOf(SHELL.fxDeck); B.q = !B.q; renderBeatFx(); };
  $('.bfx-on', el).onclick = () => { const B = bfxOf(SHELL.fxDeck); bfxToggle(SHELL.fxDeck, B.sel); };
  // X-Pad: touch engages the selected effect while held (unless it is latched on), x picks the Beat, y the Depth
  const pad = $('.xpad', el); let held = false, was = false;
  const at = (e) => { const r = pad.getBoundingClientRect(), x = clamp((e.clientX - r.left) / r.width, 0, 0.999), y = clamp(1 - (e.clientY - r.top) / r.height, 0, 1), i = SHELL.fxDeck, B = bfxOf(i), F = B.fx[B.sel];
    const hasBeat = BEAT_FX_BY[B.sel][3]; if (hasBeat) F.beat = Math.floor(x * 8); F.amt = Math.round(y * 100) / 100; const dot = $('.xpad-dot', pad); dot.style.transform = `translate(${x * r.width}px, ${(1 - y) * r.height}px)`; return F; };
  pad.onpointerdown = (e) => { pad.setPointerCapture(e.pointerId); held = true; const i = SHELL.fxDeck, B = bfxOf(i), F = at(e); was = F.on; F.on = true; bfxSend(i, B.sel, 'now'); renderBeatFx(true); };
  pad.onpointermove = (e) => { if (!held) return; const i = SHELL.fxDeck, B = bfxOf(i); at(e); bfxSend(i, B.sel, 'now'); renderBeatFx(true); };
  pad.onpointerup = pad.onpointercancel = () => { if (!held) return; held = false; const i = SHELL.fxDeck, B = bfxOf(i), F = B.fx[B.sel]; if (!was) { F.on = false; bfxSend(i, B.sel, 'now'); } renderBeatFx(); }; }
function renderBeatFx(light) { const el = $('.bfx'); if (!el) return; const i = SHELL.fxDeck, B = bfxOf(i), F = B.fx[B.sel], E = BEAT_FX_BY[B.sel];
  $$('[data-bd]', el).forEach((b) => { const on = +b.dataset.bd === i; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  $$('[data-fx]', el).forEach((b) => { b.classList.toggle('sel', b.dataset.fx === B.sel); b.classList.toggle('lit', B.fx[b.dataset.fx].on); b.setAttribute('aria-pressed', b.dataset.fx === B.sel ? 'true' : 'false'); });
  $$('[data-beat]', el).forEach((b) => { b.classList.toggle('on', +b.dataset.beat === F.beat); b.disabled = !E[3]; });
  const dp = $('.bfx-depth', el); if (document.activeElement !== dp) dp.value = F.amt; const on = $('.bfx-on', el); on.classList.toggle('lit', F.on); on.setAttribute('aria-pressed', F.on ? 'true' : 'false'); on.textContent = F.on ? `${E[1]} ON` : `${E[1]} OFF`;
  const q = $('.bfx-q', el); q.classList.toggle('on', B.q); q.setAttribute('aria-pressed', B.q ? 'true' : 'false'); $('.bfx-target', el).value = String(B.target); $('.bfx-target', el).disabled = E[2] === 'repeat' || E[2] === 'tape';
  if (light) return;
  // the selected effect's own parameters (always the same three slots: an effect without them shows them disabled — no layout jump)
  const P = BFX_PARAMS[B.sel] || [], box = $('.bfx-params', el); box.innerHTML = [0, 1, 2, 3].map((k) => { const d = P[k]; if (!d) return '<span class="bfx-p off"></span>';
    if (d[2] === 'toggle') return `<button class="bfx-p bfx-tg${F.p[d[0]] ? ' on' : ''}" data-pk="${d[0]}" aria-pressed="${F.p[d[0]] ? 'true' : 'false'}">${d[1]}</button>`;
    if (Array.isArray(d[2])) return `<span class="bfx-p seg" role="group" aria-label="${d[1]}">${d[2].map((c, j) => `<button data-pk="${d[0]}" data-pv="${j}" class="${F.p[d[0]] === j ? 'on' : ''}">${c}</button>`).join('')}</span>`;
    return `<label class="bfx-p"><span class="lbl">${d[1]}</span><input type="range" data-pk="${d[0]}" min="${d[2]}" max="${d[3]}" step="0.01" value="${F.p[d[0]]}" aria-label="${d[1]}"></label>`; }).join('');
  $$('[data-pk]', box).forEach((c) => { const k = c.dataset.pk, upd = (v) => { F.p[k] = v; bfxSend(i, B.sel, 'now'); }; /* (sent even while off: a frozen reverb can always be thawed) */
    if (c.tagName === 'INPUT') c.oninput = () => upd(+c.value); else c.onclick = () => { upd(c.dataset.pv != null ? +c.dataset.pv : F.p[k] ? 0 : 1); renderBeatFx(); }; }); }
// the status bar: what is playing and what the mix is doing (text only)
let shellT = 0;
function shellFrame(now) { if (now - shellT < 250) return; shellT = now; const st = $('.status'); if (!st) return; const D = decks[lead]; { const S = decks[SHELL.dsDeck | 0].spec; if (S !== SHELL.dsSpec) { SHELL.dsSpec = S; renderDeckSound(); } }
  setText($('.st-bpm', st), D && D.bpm ? `${D.bpm.toFixed(1)} BPM` : '—'); setText($('.st-lufs', st), meter && meter.lufsS > -70 ? `${meter.lufsS.toFixed(1)} LUFS` : '—');
  setText($('.st-mix', st), tx ? `${tx.style || 'Mix'} · ${tx.u < 0 ? 'armed' : Math.round(Math.max(0, tx.u) * 100) + ' %'}` : auto.on ? 'Auto-DJ' : '');
  const ts = $('.tp-style'); if (ts) setText(ts, tx ? `${tx.style || ''} · ${tx.u < 0 ? 'armed' : Math.round(Math.max(0, tx.u) * 100) + ' %'}` : `${'AB'[lead ^ 1]} into ${'AB'[lead]}`);
  for (let i = 0; i < 2; i++) { const b = $(`[data-tp=play${i}]`); if (b) { setText(b, (decks[i].playing ? '❚❚ ' : '▶ ') + 'AB'[i]); b.classList.toggle('on', !!decks[i].playing); } } renderExtend(); }
// ---- (v9.3) your own drum samples: one per voice, decoded at the engine's rate, level-matched to the kit (RMS over the first
// 150 ms, as the generated one-shots), kept in this browser (IndexedDB) and sent to the engine at start ----
const USER_VOICES = [['sn', 'Snare'], ['cp', 'Clap'], ['rim', 'Rim'], ['hc', 'Closed hat'], ['ho', 'Open hat'], ['hp', 'Pedal hat'], ['ride', 'Ride'], ['crash', 'Crash'], ['shk', 'Shaker'], ['tom', 'Tom'], ['conga', 'Conga'], ['bongo', 'Bongo'], ['cowbell', 'Cowbell'], ['clave', 'Clave'], ['tamb', 'Tambourine']];
const USER_SAMPLES = {}; let sampDB = null;
function sampStore() { if (sampDB) return sampDB; sampDB = new Promise((res, rej) => { try { const r = indexedDB.open('forge-samples', 1); r.onupgradeneeded = () => r.result.createObjectStore('s'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); } catch (e) { rej(e); } }); return sampDB; }
async function sampTx(mode, fn) { const db = await sampStore(); return new Promise((res, rej) => { const t = db.transaction('s', mode), st = t.objectStore('s'), r = fn(st); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }); }
function sendSample(key) { const S = USER_SAMPLES[key]; if (!S) { send({ type: 'drumSample', key, bufs: null }); return; } const c = new Float32Array(S.data); send({ type: 'drumSample', key, bufs: [c] }, [c.buffer]); }
async function loadUserSample(key, file) { if (!A.ctx) throw new Error('start the audio first'); const ab = await file.arrayBuffer(), buf = await A.ctx.decodeAudioData(ab); const n = Math.min(buf.length, Math.round(buf.sampleRate * 4)), y = new Float32Array(n);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) { const x = buf.getChannelData(ch); for (let i = 0; i < n; i++) y[i] += x[i] / buf.numberOfChannels; }
  let st = 0; while (st < n - 1 && Math.abs(y[st]) < 1e-3) st++; const z = y.slice(st); const m = Math.min(z.length, Math.round(0.15 * buf.sampleRate)); let e = 0; for (let i = 0; i < m; i++) e += z[i] * z[i]; const r = Math.sqrt(e / Math.max(1, m)); if (r > 0) for (let i = 0; i < z.length; i++) z[i] *= 0.2 / r;
  const fade = Math.min(z.length, Math.round(0.01 * buf.sampleRate)); for (let i = 0; i < fade; i++) z[z.length - 1 - i] *= i / fade; // a 10 ms fade at the end: no click where a long file is cut
  USER_SAMPLES[key] = { name: file.name, sr: buf.sampleRate, data: z }; sendSample(key); try { await sampTx('readwrite', (s) => s.put({ name: file.name, sr: buf.sampleRate, data: z }, key)); } catch (err) { toast('The sample plays, but this browser would not keep it for next time'); } }
function removeUserSample(key) { delete USER_SAMPLES[key]; sendSample(key); sampTx('readwrite', (s) => s.delete(key)).catch(() => {}); }
async function restoreUserSamples() { try { const keys = await sampTx('readonly', (s) => s.getAllKeys()); for (const k of keys || []) { const v = await sampTx('readonly', (s) => s.get(k)); if (v && v.data && (!A.ctx || v.sr === A.ctx.sampleRate)) { USER_SAMPLES[k] = v; sendSample(k); } } } catch (e) { /* no storage: nothing to restore */ } }
// ---- (v9.3) the FX screen's one-shots (risers, impacts, throws) and the MIX screen's deck sound (sends, character, the room) ----
// ---- (v9.5) TRANSITIONS: the layered recipes (src/engine/06c_risers.js) played live — a riser, downlifter, sub drop, impact, swell
// or wash from the deck's own genre family (or any), lasting 1–8 bars, landing exactly on the next line it can reach (a riser ends
// on it; a downlifter, sub drop or impact starts on it or on the next beat), in the key of the track, with an impact on the landing
const RZ = { type: 'rise', rec: -1, bars: 2, land: 'line', hit: true, all: false };
const RZ_TYPES = [['rise', 'Riser'], ['down', 'Downlifter'], ['sub', 'Sub drop'], ['impact', 'Impact'], ['swell', 'Swell'], ['wash', 'Wash']];
const rzName = (id) => id.replace(/-/g, ' ');
function rzFam(i) { const D = decks[i], G = D && GENRE_BY_ID[D.gid]; return G ? G.family : 'house'; }
function rzList(i) { const fam = rzFam(i), fit = new Set(txRecipesFor(fam, RZ.type)); return TX_RECIPES.filter((r) => r.type === RZ.type && (RZ.all || fit.has(r.k))).map((r) => ({ k: r.k, id: r.id, fit: fit.has(r.k) })); }
function buildRisers(el) { el.innerHTML = `<h4>Transitions — risers, drops and impacts on deck <span class="os-d">A</span></h4><div class="dk-chips rz-t" role="group" aria-label="Kind">${RZ_TYPES.map(([k, l]) => `<button class="dk-chip" data-rzt="${k}">${l}</button>`).join('')}</div>
  <div class="dk-chips rz-r" role="group" aria-label="Recipe"></div><div class="rz-row"><span class="lbl">Length</span><div class="seg" role="group" aria-label="Length">${[1, 2, 4, 8].map((b) => `<button data-rzb="${b}">${b} bar${b > 1 ? 's' : ''}</button>`).join('')}</div>
  <span class="lbl">Land</span><div class="seg" role="group" aria-label="Land"><button data-rzl="line">on the line</button><button data-rzl="now">on the beat</button></div><label class="rz-hit"><input type="checkbox" data-rzh checked> impact on the landing</label><label class="rz-hit"><input type="checkbox" data-rza> every genre's</label></div>
  <div class="rz-go"><button class="btn primary" data-rzgo>Fire</button><button class="btn" data-rzdice title="A recipe from this genre's own, at random">Dice</button><span class="rz-info"></span></div>`;
  $$('[data-rzt]', el).forEach((b) => b.onclick = () => { RZ.type = b.dataset.rzt; RZ.rec = -1; renderRisers(); });
  $$('[data-rzb]', el).forEach((b) => b.onclick = () => { RZ.bars = +b.dataset.rzb; renderRisers(); });
  $$('[data-rzl]', el).forEach((b) => b.onclick = () => { RZ.land = b.dataset.rzl; renderRisers(); });
  $('[data-rzh]', el).onchange = (e) => { RZ.hit = e.target.checked; }; $('[data-rza]', el).onchange = (e) => { RZ.all = e.target.checked; RZ.rec = -1; renderRisers(); };
  $('[data-rzgo]', el).onclick = async () => { await startAudio(); fireTransition(SHELL.fxDeck); };
  $('[data-rzdice]', el).onclick = async () => { const L = rzList(SHELL.fxDeck).filter((x) => x.fit); if (!L.length) return; RZ.rec = L[Math.floor(Math.random() * L.length)].k; renderRisers(); await startAudio(); fireTransition(SHELL.fxDeck); };
  renderRisers(); }
function renderRisers() { const el = $('.risers'); if (!el) return; const i = SHELL.fxDeck, L = rzList(i); if (RZ.rec < 0 || !L.some((x) => x.k === RZ.rec)) RZ.rec = L.length ? L[0].k : -1;
  $$('[data-rzt]', el).forEach((b) => b.classList.toggle('on', b.dataset.rzt === RZ.type)); $$('[data-rzb]', el).forEach((b) => { b.classList.toggle('on', +b.dataset.rzb === RZ.bars); b.disabled = RZ.type === 'impact' || RZ.type === 'sub'; });
  $$('[data-rzl]', el).forEach((b) => b.classList.toggle('on', b.dataset.rzl === RZ.land)); const d = $('.os-d', el); if (d) d.textContent = 'AB'[i];
  $('.rz-r', el).innerHTML = L.map((x) => `<button class="dk-chip${x.k === RZ.rec ? ' on' : ''}" data-rzr="${x.k}">${rzName(x.id)}</button>`).join('') || '<span class="dim">none for this genre — tick "every genre\'s"</span>';
  $$('[data-rzr]', el).forEach((b) => b.onclick = () => { RZ.rec = +b.dataset.rzr; renderRisers(); }); }
function fireTransition(i) { const D = decks[i], s = D && D.score; if (!s) { toast('Load a track first'); return; } if (RZ.rec < 0) return; const R = TX_RECIPES[RZ.rec], pos = schedPos(D), key = s.meta.key % 12, third = (MODES[s.meta.mode] || MODES.minor)[2] === 4 ? 4 : 3;
  const note = R.type === 'sub' ? 36 + key : 60 + key, len = R.type === 'impact' ? 32 : R.type === 'sub' ? 16 : RZ.bars * 16, ends = R.type === 'rise' || R.type === 'swell';
  const line = (min) => { let at = Math.ceil((pos + min) / 64) * 64; return at; }; let start, end;
  if (!D.playing) { start = -1; end = len; } else if (RZ.land === 'line') { if (ends) { end = line(Math.max(len, 4)); start = end - len; if (start < pos) start = Math.ceil(pos + 0.05); } else { start = line(2); end = start + len; } } else { start = Math.ceil(pos + 0.05); end = start + len; }
  const msg = { type: 'fxNow', kind: 13, rec: RZ.rec, v: 0.95, until: end, note, pan: third }; if (start < 0) send(Object.assign({ deck: i, steps: len }, msg, { until: undefined })); else send({ type: 'at', deck: i, atStep: start, list: [msg] });
  if (RZ.hit && ends && D.playing) { const imp = txRecipesFor(rzFam(i), 'impact'); if (imp.length) send({ type: 'at', deck: i, atStep: end, list: [{ type: 'fxNow', kind: 13, rec: imp[Math.floor(Math.random() * imp.length)], v: 0.9, steps: 32, note: 60 + key, pan: third }] }); }
  const where = D.playing ? (ends ? `lands on bar ${Math.floor(end / 16) + 1}` : `starts on bar ${Math.floor(start / 16) + 1}${start % 16 ? ' (next beat)' : ''}`) : 'now';
  const info = $('.rz-info'); if (info) info.textContent = `${rzName(R.id)} — ${where}`; }
function buildOneShots(el) { el.innerHTML = `<h4>One-shots — fire now on deck <span class="os-d">A</span></h4><div class="pgrid os">${FX_PADS.map(([l, k, st, ear], n) => `<button class="pad" data-os="${n}">${l}<small>${ear != null ? 'in key' : st / 16 >= 1 ? st / 16 + ' bar' + (st > 16 ? 's' : '') : st / 4 + ' beats'}</small></button>`).join('')}<button class="pad" data-osthrow="8">Echo throw<small>½ bar</small></button><button class="pad" data-osthrow="16">Echo throw<small>1 bar</small></button></div>`;
  $$('[data-os]', el).forEach((b) => b.onclick = async () => { await startAudio(); const i = SHELL.fxDeck, [, k, st, ear] = FX_PADS[+b.dataset.os]; if (ear != null) { earCandy(i, ear); return; }
    // (v9.5) the risers, sweep, downlifter, impact and snare roll play a layered recipe of the deck's genre family, in its key
    const type = { 0: 'rise', 3: 'wash', 2: 'down', 1: 'impact', 4: 'rise' }[k], fam = rzFam(i), L = txRecipesFor(fam, type).map((x) => TX_RECIPES.find((r) => r.k === x)).filter((r) => r && (k !== 4 || r.roll > 0 || r.clap > 0)), R = L.length ? L[Math.floor(Math.random() * L.length)] : null;
    const D = decks[i], key = D && D.score ? D.score.meta.key : 0, minor = D && D.score && /min|dor|phr|aeo/.test(D.score.meta.mode || '') ? 3 : 4;
    if (R) send({ type: 'fxNow', deck: i, kind: 13, rec: R.k, steps: st, note: (R.type === 'sub' ? 36 : 60) + (key % 12), pan: minor }); else send({ type: 'fxNow', deck: i, kind: k, steps: st }); });
  $$('[data-osthrow]', el).forEach((b) => b.onclick = () => send({ type: 'throw', deck: SHELL.fxDeck, steps: +b.dataset.osthrow })); }
function buildDeckSound(el) { el.innerHTML = `<h3>Deck sound</h3><div class="seg ds-deck" role="group" aria-label="Deck"><button data-dsd="0">Deck A</button><button data-dsd="1">Deck B</button></div><div class="dk-knobs ds-k"></div><h4>Room (both decks)</h4><div class="dk-knobs ds-room"></div>`;
  $$('[data-dsd]', el).forEach((b) => b.onclick = () => { SHELL.dsDeck = +b.dataset.dsd; renderDeckSound(); }); renderDeckSound(); }
function renderDeckSound() { const el = $('.decksound'); if (!el) return; const i = SHELL.dsDeck | 0, D = decks[i], m = D.spec && D.spec.mix; $$('[data-dsd]', el).forEach((b) => b.classList.toggle('on', +b.dataset.dsd === i));
  const k = $('.ds-k', el), room = $('.ds-room', el); k.innerHTML = ''; room.innerHTML = ''; if (!m) { k.innerHTML = '<span class="dk-legend">Load a track on this deck first.</span>'; } else {
    const G0 = GENRE_BY_ID[D.gid] || { mix: {} }; if (m.echo == null) m.echo = 1; if (m.heat == null) m.heat = G0.mix.heat != null ? G0.mix.heat : 1; if (m.punch == null) m.punch = G0.mix.punch != null ? G0.mix.punch : 1;
    for (const [label, key, eng, mn, mx] of [['Reverb', 'verb', 'verb', 0, 1], ['Delay', 'delay', 'delay', 0, 1], ['Harm echo', 'echo', 'echo', 0, 2], ['Pump', 'sidechain', 'sc', 0, 0.9], ['Heat', 'heat', 'heat', 0, 2], ['Punch', 'punch', 'punch', 0, 2]])
      dknob(k, { label, min: mn, max: mx, value: m[key] != null ? m[key] : 0, def: m[key] != null ? m[key] : 0, onchange: (v) => { send({ type: 'sends', deck: i, p: { [eng]: v } }); D.spec.mix[key] = +v.toFixed(3); } }); }
  dknob(room, { label: 'Size', min: 0.6, max: 6, curve: 'log', unit: 's', value: space.t60, def: 2.4, onchange: (v) => { space.t60 = v; send({ type: 'space', t60: v, damp: space.damp }); } });
  dknob(room, { label: 'Damp', min: 0, max: 0.9, value: space.damp, def: 0.4, onchange: (v) => { space.damp = v; send({ type: 'space', t60: space.t60, damp: v }); } }); }
