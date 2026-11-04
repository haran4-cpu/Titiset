/* ===================== FORGE · MANGLE panel (v9.5) =====================
   The FX screen's sound-design unit (src/engine/06d_mangle.js): two slots, A and B, each one of eight engines with its Macro, three
   knobs and a choice; a Morph between them; a touch pad that plays the selected slot while it is held (left–right the Macro, up–down
   the first knob); recipes to start from; Dice; and "Keep in track", which writes the unit's state into the track (spec.fx.mangle):
   a set file, the library and an exported score carry it, and it comes back when the track is loaded. */
const MG_LABEL = { slice: 'Slice', grain: 'Grain', spectral: 'Spectral', steps: 'Steps', spiral: 'Spiral', ring: 'Ring', vowel: 'Vowel', fold: 'Fold' };
const MG_DESC = { slice: 'Re-cuts the last bar on the grid: reversed, stuttered, half-speed, pitched, gated', grain: 'A cloud of grains from the last second (or a frozen one), tuned to the chord',
  spectral: 'Freeze, smear, tune to the chord or strip to its strongest partials', steps: 'An echo whose repeats climb the chord tones, each a beat division later',
  spiral: 'An endless shifter: the pitch rises (or falls) for ever', ring: 'Ring and FM by a carrier on the chord: metal that stays in key',
  vowel: 'A talkbox: formants morphing A–E–I–O–U, by hand or on the beat', fold: 'Wavefolding into a crush tuned to the key\'s harmonics' };
const MG_TARGETS = [[-1, 'Whole deck'], [0, 'Kick'], [1, 'Snare'], [2, 'Hats'], [3, 'Percussion'], [4, 'Bass'], [5, 'Chords'], [6, 'Pad'], [7, 'Lead'], [8, 'Arp']];
// recipes: a slot's whole state (and a part to put it on, where it belongs on one)
const MG_RECIPES = [
  ['Glitch roll', { mode: 'slice', sub: 1, macro: 0.55, a: 0.3, b: 0.2, c: 0, hold: 1 }], ['Tape chop', { mode: 'slice', sub: 2, macro: 0.85, a: 0.7, b: 0.5, c: 0.35, hold: 0 }],
  ['Micro stutter', { mode: 'slice', sub: 0, macro: 0.7, a: 0.55, b: 0, c: 0.15, hold: 1 }], ['Frozen choir', { mode: 'grain', sub: 2, macro: 0.6, a: 0.3, b: 0.7, c: 0.2, hold: 1 }],
  ['Shimmer cloud', { mode: 'grain', sub: 3, macro: 0.7, a: 0.5, b: 0.6, c: 0.1, hold: 0 }], ['Dust', { mode: 'grain', sub: 0, macro: 0.95, a: 0.8, b: 0.1, c: 0.5, hold: 0 }],
  ['Ice', { mode: 'spectral', sub: 0, macro: 1, a: 0.55, b: 0.5, c: 0.3 }], ['Smear', { mode: 'spectral', sub: 1, macro: 0.8, a: 0.45, b: 0.5, c: 0.1 }],
  ['Tuned drums', { mode: 'spectral', sub: 2, macro: 0.9, a: 0.55, b: 0.5, c: 0 }, 3], ['Glass', { mode: 'spectral', sub: 3, macro: 0.7, a: 0.62, b: 0.5, c: 0.2 }],
  ['Ghost shift', { mode: 'spectral', sub: 1, macro: 0.6, a: 0.5, b: 0.78, c: 0.3 }], ['Stairway', { mode: 'steps', sub: 0, macro: 0.7, a: 0.45, b: 0.7, c: 0.6 }],
  ['Falling stairs', { mode: 'steps', sub: 1, macro: 0.65, a: 0.25, b: 0.55, c: 0.4 }], ['Wander echo', { mode: 'steps', sub: 3, macro: 0.6, a: 0.6, b: 0.6, c: 0.8 }],
  ['Barber pole', { mode: 'spiral', sub: 2, macro: 0.75, a: 0.35, b: 0.5, c: 0.7 }], ['Sinking', { mode: 'spiral', sub: 1, macro: 0.8, a: 0.3, b: 0.35, c: 0.5 }],
  ['Robot', { mode: 'ring', sub: 0, macro: 0.8, a: 0.15, b: 0.75, c: 0.7 }], ['Bell arp', { mode: 'ring', sub: 3, macro: 0.65, a: 0.7, b: 0.62, c: 0.8 }, 5],
  ['Talkbox', { mode: 'vowel', sub: 2, macro: 0.3, a: 0.6, b: 0.6, c: 0.5 }, 7], ['Yoy bass', { mode: 'vowel', sub: 3, macro: 0.5, a: 0.8, b: 0.7, c: 0.6 }, 4],
  ['Key crush', { mode: 'fold', sub: 2, macro: 0.5, a: 0.4, b: 0.7, c: 0.6 }], ['Melt', { mode: 'fold', sub: 1, macro: 0.75, a: 0.8, b: 0.4, c: 0.45 }]];
const mgSlotDef = (mode) => ({ on: false, mode, sub: 1, macro: 0.5, a: 0.5, b: 0.5, c: 0.5, hold: 1 });
function mgOf(i) { const D = decks[i]; if (!D.mg) D.mg = { sel: 0, target: -1, morph: 0.5, wet: 1, s: [mgSlotDef('slice'), mgSlotDef('spectral')] }; return D.mg; }
function mgSendSlot(i, q) { const G = mgOf(i), S = G.s[q]; send({ type: 'mangle', deck: i, slot: q, on: S.on, mode: MG_MODES.indexOf(S.mode), sub: S.sub, macro: S.macro, a: S.a, b: S.b, c: S.c, hold: S.hold }); }
function mgSendAll(i) { const G = mgOf(i); send({ type: 'mangle', deck: i, target: G.target, morph: G.morph, wet: G.wet }); mgSendSlot(i, 0); mgSendSlot(i, 1); }
// a state written by a person, an AI or an older file: every field checked, anything else left out
function mgClean(x) { if (!x || typeof x !== 'object') return null; const n = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d), out = { target: -1, morph: 0.5, wet: 1, s: [] };
  if (Number.isInteger(x.target) && x.target >= -1 && x.target <= 8) out.target = x.target; out.morph = n(x.morph, 0.5); out.wet = n(x.wet, 1);
  for (let q = 0; q < 2; q++) { const s = Array.isArray(x.s) ? x.s[q] : null, d = mgSlotDef(q ? 'spectral' : 'slice'); if (s && typeof s === 'object') { d.on = !!s.on; if (MG_MODES.includes(s.mode)) d.mode = s.mode; d.sub = Number.isInteger(s.sub) && s.sub >= 0 && s.sub <= 3 ? s.sub : 1; for (const k of ['macro', 'a', 'b', 'c', 'hold']) d[k] = n(s[k], d[k]); } out.s.push(d); }
  return out; }
// a track that carries a Mangle state brings it with it (installScore); a track without one leaves the unit off
function mgFromTrack(i, s) { const D = decks[i], x = s && s.spec && s.spec.fx ? mgClean(s.spec.fx.mangle) : null; if (x) { D.mg = Object.assign({ sel: 0 }, x); if (D.spec) D.spec.fx = { mangle: mgSnapshot(i) }; } else if (D.mg) { D.mg.s[0].on = false; D.mg.s[1].on = false; }
  if (D.mg) mgSendAll(i); renderMangle(); }
function mgSnapshot(i) { const G = mgOf(i); return { target: G.target, morph: G.morph, wet: G.wet, s: G.s.map((S) => Object.assign({}, S)) }; }
function buildMangle(el) {
  el.innerHTML = `<h4>Mangle — sound design on deck <span class="os-d">A</span></h4>
  <div class="mg-head"><div class="seg mg-slots" role="group" aria-label="Slot"><button data-mgs="0">A <i class="mg-led"></i></button><button data-mgs="1">B <i class="mg-led"></i></button></div>
    <label class="mg-tgt"><span class="lbl">On</span><select class="btn mg-target" aria-label="What Mangle is on">${MG_TARGETS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
    <button class="bfx-on big mg-on" aria-pressed="false">A OFF</button></div>
  <div class="dk-chips mg-modes" role="group" aria-label="Engine">${MG_MODES.map((m) => `<button class="dk-chip" data-mgm="${m}">${MG_LABEL[m]}</button>`).join('')}</div>
  <p class="mg-desc"></p><div class="seg mg-sub" role="group" aria-label="Choice"></div>
  <div class="mg-play"><div class="xpad mg-pad" role="slider" aria-label="Touch pad: hold to play, left–right the Macro, up–down the first knob" tabindex="0"><i class="xpad-dot"></i><span class="xpad-l mg-px">Macro →</span><span class="xpad-d mg-py">↑</span></div>
    <div class="mg-knobs"><label class="mg-k mg-macro"><span class="lbl" data-mgl="macro">Macro</span><input type="range" min="0" max="1" step="0.01" data-mgk="macro"></label>
      ${['a', 'b', 'c'].map((k) => `<label class="mg-k"><span class="lbl" data-mgl="${k}"></span><input type="range" min="0" max="1" step="0.01" data-mgk="${k}"></label>`).join('')}
      <button class="btn mg-hold" aria-pressed="false">Hold</button></div></div>
  <div class="mg-mix"><label class="mg-k"><span class="lbl">Morph A ↔ B</span><input type="range" min="0" max="1" step="0.01" data-mgx="morph" aria-label="Morph from slot A to slot B"></label><label class="mg-k"><span class="lbl">Wet</span><input type="range" min="0" max="1" step="0.01" data-mgx="wet" aria-label="Wet"></label></div>
  <div class="dk-chips mg-rec" role="group" aria-label="Recipes">${MG_RECIPES.map(([n], k) => `<button class="dk-chip" data-mgr="${k}">${n}</button>`).join('')}</div>
  <div class="rz-go"><button class="btn" data-mgdice title="A random setting of this engine, within taste">Dice</button><button class="btn" data-mgkeep title="Write this Mangle state into the track: it is saved with it and comes back when it is loaded">Keep in track</button><button class="btn" data-mgoff>All off</button><span class="rz-info mg-info"></span></div>`;
  const cur = () => { const i = SHELL.fxDeck, G = mgOf(i); return { i, G, q: G.sel, S: G.s[G.sel] }; };
  const live = async (fn, full) => { const c = cur(); fn(c); if (c.S.on || full) { await startAudio(); mgSendSlot(c.i, c.q); } renderMangle(); };
  $$('[data-mgs]', el).forEach((b) => b.onclick = () => { mgOf(SHELL.fxDeck).sel = +b.dataset.mgs; renderMangle(); });
  $('.mg-target', el).onchange = async (e) => { const { i, G } = cur(); G.target = +e.target.value; await startAudio(); send({ type: 'mangle', deck: i, target: G.target }); renderMangle(); };
  $('.mg-on', el).onclick = () => live((c) => { c.S.on = !c.S.on; }, true);
  $$('[data-mgm]', el).forEach((b) => b.onclick = () => live((c) => { if (c.S.mode !== b.dataset.mgm) { c.S.mode = b.dataset.mgm; c.S.sub = 1; } }));
  el.querySelector('.mg-sub').onclick = (e) => { const b = e.target.closest('[data-mgc]'); if (b) live((c) => { c.S.sub = +b.dataset.mgc; }); };
  $$('[data-mgk]', el).forEach((r) => r.oninput = () => { const c = cur(); c.S[r.dataset.mgk] = +r.value; if (c.S.on) mgSendSlot(c.i, c.q); });
  $('.mg-hold', el).onclick = () => live((c) => { c.S.hold = c.S.hold ? 0 : 1; });
  $$('[data-mgx]', el).forEach((r) => r.oninput = () => { const { i, G } = cur(); G[r.dataset.mgx] = +r.value; send({ type: 'mangle', deck: i, [r.dataset.mgx]: G[r.dataset.mgx] }); });
  $$('[data-mgr]', el).forEach((b) => b.onclick = async () => { const [name, p, tgt] = MG_RECIPES[+b.dataset.mgr], c = cur(); Object.assign(c.S, p, { on: true }); await startAudio();
    if (tgt != null && c.G.target === -1) { c.G.target = tgt; send({ type: 'mangle', deck: c.i, target: tgt }); toast(`${name} — on the ${MG_TARGETS.find((x) => x[0] === tgt)[1].toLowerCase()} (change it under On)`); } mgSendSlot(c.i, c.q); renderMangle(); });
  $('[data-mgdice]', el).onclick = () => live((c) => { const r = Math.random; c.S.sub = Math.floor(r() * 4); c.S.macro = 0.3 + 0.6 * r(); c.S.a = r(); c.S.b = 0.2 + 0.7 * r(); c.S.c = r() * 0.8; });
  $('[data-mgkeep]', el).onclick = () => { const i = SHELL.fxDeck, D = decks[i]; if (!D.spec) { toast(`Deck ${'AB'[i]} is empty`); return; } D.spec.fx = { mangle: mgSnapshot(i) }; if (D.score && D.score.spec) D.score.spec.fx = D.spec.fx; toast('Mangle kept in the track — saved with it, back when it is loaded'); renderMangle(); };
  $('[data-mgoff]', el).onclick = () => { const i = SHELL.fxDeck, G = mgOf(i); G.s[0].on = false; G.s[1].on = false; mgSendSlot(i, 0); mgSendSlot(i, 1); renderMangle(); };
  // the touch pad: the selected slot plays while it is held (unless it is on already); x = Macro, y = the first knob
  const pad = $('.mg-pad', el); let held = false, was = false;
  const at = (e) => { const r = pad.getBoundingClientRect(), x = clamp((e.clientX - r.left) / r.width, 0, 1), y = clamp(1 - (e.clientY - r.top) / r.height, 0, 1), c = cur(); c.S.macro = Math.round(x * 100) / 100; c.S.a = Math.round(y * 100) / 100; $('.xpad-dot', pad).style.transform = `translate(${x * r.width}px, ${(1 - y) * r.height}px)`; return c; };
  pad.onpointerdown = async (e) => { pad.setPointerCapture(e.pointerId); held = true; await startAudio(); const c = at(e); was = c.S.on; c.S.on = true; mgSendSlot(c.i, c.q); renderMangle(true); };
  pad.onpointermove = (e) => { if (!held) return; const c = at(e); mgSendSlot(c.i, c.q); renderMangle(true); };
  pad.onpointerup = pad.onpointercancel = () => { if (!held) return; held = false; const c = cur(); if (!was) { c.S.on = false; mgSendSlot(c.i, c.q); } renderMangle(); };
  renderMangle(); }
function renderMangle(light) { const el = $('.mangle'); if (!el) return; const i = SHELL.fxDeck, G = mgOf(i), S = G.s[G.sel], spec = MG_SPEC[S.mode];
  $$('[data-mgs]', el).forEach((b) => { const q = +b.dataset.mgs, on = q === G.sel; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); $('.mg-led', b).classList.toggle('lit', G.s[q].on); });
  const on = $('.mg-on', el); on.classList.toggle('lit', S.on); on.setAttribute('aria-pressed', S.on ? 'true' : 'false'); on.textContent = `${'AB'[G.sel]} ${S.on ? 'ON' : 'OFF'}`;
  { const pad = $('.mg-pad', el), r = pad.getBoundingClientRect(); if (r.width) $('.xpad-dot', pad).style.transform = `translate(${S.macro * r.width}px, ${(1 - S.a) * r.height}px)`; } // the pad's dot shows where the Macro and the first knob stand
  for (const r of $$('[data-mgk]', el)) if (document.activeElement !== r) r.value = S[r.dataset.mgk]; for (const r of $$('[data-mgx]', el)) if (document.activeElement !== r) r.value = G[r.dataset.mgx];
  if (light) return;
  $$('[data-mgm]', el).forEach((b) => { const sel = b.dataset.mgm === S.mode; b.classList.toggle('on', sel); b.setAttribute('aria-pressed', sel ? 'true' : 'false'); });
  $('.mg-target', el).value = String(G.target); setText($('.mg-desc', el), MG_DESC[S.mode]);
  $('.mg-sub', el).innerHTML = spec[4].map((l, k) => `<button data-mgc="${k}" class="${S.sub === k ? 'on' : ''}" aria-pressed="${S.sub === k ? 'true' : 'false'}">${l}</button>`).join('');
  setText($('[data-mgl="macro"]', el), spec[0]); setText($('[data-mgl="a"]', el), spec[1]); setText($('[data-mgl="b"]', el), spec[2]); setText($('[data-mgl="c"]', el), spec[3]); setText($('.mg-px', el), `${spec[0]} →`); setText($('.mg-py', el), `${spec[1]} ↑`);
  const h = $('.mg-hold', el); h.hidden = !spec[5]; h.textContent = spec[5] || 'Hold'; h.classList.toggle('on', !!S.hold); h.setAttribute('aria-pressed', S.hold ? 'true' : 'false');
  const D = decks[i], kept = D.spec && D.spec.fx && D.spec.fx.mangle; setText($('.mg-info', el), kept ? 'kept in this track' : ''); }
