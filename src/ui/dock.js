/* ===================== FORGE · DOCK (bottom editor) =====================
   One source of truth per deck: D.spec, a FORGE score (the same JSON an AI model writes). Every edit in the dock
   changes the spec, the spec is validated, compiled and swapped into the running deck on the next bar (harmony on the
   next 4-bar line). Sound and FX edits go to the engine instantly (no re-compose) and are written into the spec too,
   so what you hear is always exactly what "Copy score" gives you. */
const DOCK = { brush: 'x', dlane: 'kick', deck: 0, tab: 'drums', page: 'pattern', open: true, secPin: -1, dpat: null, bpat: null, dpage: 0, bpage: 0, slot: 'chords', lastSec: -2, lastStep: -1, scoreDirty: false, melDirty: false };
const DOCK_TABS = [['drums', 'Drums'], ['bass', 'Bass'], ['chords', 'Chords'], ['lead', 'Lead'], ['harmony', 'Harmony'], ['score', 'Score']];
// (v9.3) one part at a time, three pages each: Pattern (what it plays), Sound (how it sounds — only this part's sounds), Mix (its
// level and sends). The 9.2 global Sound tab (every sound of every part, again) and FX tab (now the FX screen) are gone.
const DOCK_PAGES = [['pattern', 'Pattern'], ['sound', 'Sound'], ['mix', 'Mix']], PART_SLOTS = { drums: ['kick', 'snare', 'hats', 'perc'], bass: ['bass'], chords: ['chords', 'pad'], lead: ['lead', 'arp'] };
const SLOT_CH = { kick: 0, snare: 1, hats: 2, perc: 3, bass: 4, chords: 5, pad: 6, lead: 7, arp: 8 };
const KIT_FAMS = [['', 'Genre'], ['808', '808-style'], ['909', '909-style'], ['707', '707-style'], ['linn', 'Linn-style'], ['acoustic', 'Acoustic'], ['lofi', 'Lo-fi tape'], ['cr78', 'CR-78-style'], ['minimal', 'Minimal'], ['industrial', 'Industrial'], ['vintage', 'Vintage break'], ['trap', 'Trap'], ['garage', 'Garage'], ['forge', 'Synth (9.2)']];
const LANE_ORDER = ['kick', 'snare', 'rim', 'clap', 'closed', 'open', 'ride', 'shaker'].filter((l) => SPEC_LANES[l]);
const HAT_LANES = new Set(['closed', 'open', 'ride', 'shaker']);
const PERC_ADD = ['conga', 'bongo', 'tom', 'cowbell', 'clave', 'wood', 'tamb', 'timbale', 'tick', 'agogo', 'guiro', 'triangle', 'djembe', 'taiko', 'maraca', 'cajon', 'rim'];
// every voice a lane can take (the menu on a lane's name): the core lanes, then the percussion kinds of 02_drums.js
const SWAP_CORE = [['kick', 'Kick'], ['snare', 'Snare'], ['rim', 'Rim'], ['closed', 'Closed hat'], ['open', 'Open hat'], ['ride', 'Ride'], ['shaker', 'Shaker']];
const SWAP_PERC = [['tom', 'Tom'], ['conga', 'Conga'], ['bongo', 'Bongo'], ['cowbell', 'Cowbell'], ['clave', 'Clave'], ['wood', 'Woodblock'], ['tamb', 'Tambourine'], ['timbale', 'Timbale'], ['tick', 'Tick'], ['agogo', 'Agogo'], ['guiro', 'Guiro'], ['triangle', 'Triangle'], ['djembe', 'Djembe'], ['taiko', 'Taiko'], ['maraca', 'Maraca'], ['cajon', 'Cajon']];
const BASS_HELP = { R: 'root', O: 'octave up', F: 'fifth', T: 'third', S: 'seventh', A: 'approach — a step into the next chord', N: 'next chord’s root', P: 'passing tone', '-': 'hold', '.': 'rest' };
const SYN_MODELS = Object.keys(MODEL);
// knob tables: [param, label, min, max, curve, unit]
const P_SYN = [['cut', 'Cutoff', 80, 12000, 'log', 'Hz'], ['res', 'Reso', 0, 0.9], ['envAmt', 'Env amt', 0, 1], ['fDec', 'Env decay', 0.01, 1.5, 'log', 's'], ['aAtk', 'Attack', 0.001, 2, 'log', 's'], ['aDec', 'Decay', 0.02, 3, 'log', 's'],
  ['aSus', 'Sustain', 0, 1], ['aRel', 'Release', 0.02, 3, 'log', 's'], ['detune', 'Detune', 0, 1], ['drive', 'Drive', 1, 5], ['glide', 'Glide', 0, 0.3, 'lin', 's'], ['width', 'Width', 0, 1], ['gain', 'Level', 0, 1.5],
  ['lfoSync', 'LFO beats', 0.25, 16, 'log', 'beat'], ['lfoDepth', 'LFO→Filter', 0, 1], ['lfoAmp', 'LFO→Volume', 0, 1]];
const SINE_M = new Set(['sub', 'b808']); // (a sine has no harmonics for a resonance or a filter envelope to work on)
const SYN_CORE = new Set(['cut', 'res', 'envAmt', 'fDec', 'aAtk', 'aDec', 'aSus', 'aRel', 'drive', 'gain']); // (v9.5) on every synth sound
const P_BASS = ['cut', 'res', 'envAmt', 'aDec', 'drive', 'glide', 'gain'], P_LEAD = ['cut', 'res', 'aAtk', 'aDec', 'aRel', 'detune', 'drive', 'gain'];
const P_DRUM = {
  kick: [['fEnd', 'Body', 35, 80, 'lin', 'Hz'], ['len', 'Length', 0.15, 1.2, 'lin', 'beat'], ['punch', 'Punch', 0, 1], ['click', 'Click', 0, 1], ['drive', 'Drive', 1, 4], ['rumble', 'Rumble', 0, 1], ['gain', 'Gain', 0, 1.5]],
  snare: [['tone', 'Body', 120, 320, 'lin', 'Hz'], ['nDec', 'Decay', 0.04, 0.5, 'log', 's'], ['snap', 'Snap', 0, 1], ['clapTail', 'Clap tail', 0.05, 0.5, 'log', 's'], ['layer', 'Layer', 0, 1], ['gain', 'Gain', 0, 1.5]],
  hats: [['cDec', 'Closed', 0.01, 0.15, 'log', 's'], ['oDec', 'Open', 0.08, 0.9, 'log', 's'], ['hpF', 'Tone', 4000, 11000, 'log', 'Hz'], ['base', 'Metal', 300, 620, 'lin', 'Hz'], ['gain', 'Gain', 0, 1.5]],
  perc: [['pitch', 'Pitch', 0.5, 2, 'log', '×'], ['dec', 'Length', 0.3, 2.5, 'log', '×'], ['noise', 'Noise', 0, 2, 'lin', '×'], ['gain', 'Gain', 0, 1.5]] };
const P_CLAP = [['clapF', 'Clap tone', 600, 2500, 'log', 'Hz'], ['clapTail', 'Clap tail', 0.05, 0.5, 'log', 's'], ['clapGap', 'Clap spread', 0.005, 0.02, 'log', 's']], P_RIM = [['rimF', 'Rim tone', 900, 3000, 'log', 'Hz']];
function snareKinds() { const D = decks[DOCK.deck], ev = D.score.ev, kk = kitVal('snare', 'kind') || 'snare', u = {}; for (let i = 0; i < ev.n; i++) if (ev.ch[i] === 1) u[['snare', 'clap', 'rim'][ev.a[i] | 0] || kk] = 1; if (!Object.keys(u).length) u[kk] = 1; return u; }
const DRUM_DEF = { kick: new Kick(44100).p, snare: new Snare(44100).p, hats: new Hats(44100).p, perc: new Perc(44100).p };
const FX_RACK = [['sweep', 'Sweep', 'LFO filter: depth + speed'], ['phaser', 'Phaser', '4-stage, swept over 4 beats'], ['flanger', 'Flanger', 'jet sweep over 8 beats'], ['echo', 'Echo', '3/16 ping-pong, darkening repeats'], ['crush', 'Crush', 'bits + sample rate'], ['gate', 'Gate', '1/16 trance gate on the grid'], ['repeat', 'Repeat', 'beat repeat: the last 1/16 re-triggered on the grid'], ['tape', 'Tape stop', 'the deck slows to a halt — release and it is back on time'], ['swirl', 'Swirl', 'frequency shifter with feedback: the psychedelic barber pole']];
const FX_RACK_DEF = [0.6, 0.6, 0.6, 0.5, 0.5, 0.8, 0.5, 0.5, 0.5], fxSetters = [[], []];
const FX_PADS = [['Riser 1', 0, 16], ['Riser 4', 0, 64], ['Sweep', 3, 16], ['Downlifter', 2, 32], ['Impact', 1, 32], ['Snare roll', 4, 16], ['Zap', 7, 2.5, 0], ['Laser', 12, 2, 1], ['Squelch', 11, 2.5, 2], ['Bubbles', 9, 4, 3], ['Swirl', 10, 16, 5]]; // the last five: ear candy in key (perform.js earCandy)
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const clean = (x) => String(x).replace(/\s|\|/g, '');
const groupBars = (s) => (s.length > 16 ? s.match(/.{16}/g).join('|') : s);

// ---------------------------------------------------------------- spec ⇄ deck
function deckSpec(score) { // the editable spec of a score: complete (every pattern written out), melodies only where authored
  const sp = exportSpec(score, { melody: false }), o = score.spec;
  if (o) { if (o.form) o.form.forEach((f, k) => { if (f && f.melody && sp.form[k]) sp.form[k].melody = f.melody; }); if (o.notes) sp.notes = o.notes; if (o.title) sp.title = o.title; if (o.mood) sp.mood = o.mood; if (o.fx) sp.fx = o.fx; } // mood stays as the label of what was asked for (the written harmony it chose still plays)
  return sp; }
function installScore(i, s, opt) { // a freshly composed / compiled score becomes the deck's track (loaded, not swapped)
  opt = opt || {}; const D = decks[i], other = decks[i ^ 1], otherLive = other.playing && other.score; tasteOnReplace(D);
  D.score = s; D.gid = s.meta.gid; D.native = s.meta.bpm; D.groove = null; D.partMix = null; D.loop = 0; /* (v9.3: a new track starts with the engine's groove and part levels: as written) */ D.pendJump = -1; D.pos = 0; D.ended = false; D.fresh = true; D.libId = null; D.spec = deckSpec(s); D.val = null; D.lint = lintScore(s);
  const { msg, transfer } = packScore(s); const bpm = otherLive ? other.bpm : 0, play = !!opt.play && !otherLive;
  send({ type: 'load', deck: i, score: msg, cal: cal(s.meta.gid), play, bpm: bpm || undefined, from: 0 }, transfer);
  if (!opt.asSaved && typeof tasteApplyParts === 'function' && tasteOn()) tasteApplyParts(i); // (v10) the part levels you keep setting (not on a library track or a set: those play as saved)
  D.bpm = bpm || s.meta.bpm; D.loading = null; // (v9.2) the tempo it will play at, at once (the box showed the last track's tempo until the analysis, 5–9 s later)
  D.mute.fill(false); D.trim = null; D.trimNA = false; renderDeckHead(i); renderStems(i); analyse(i, s); if (s.levelPending) refineInWorker(i, s); // palette levels: exact match from the worker
  if (play) toast(`${s.meta.name} — ${PCN[s.meta.key]} ${s.meta.mode}, ${s.meta.bpm} BPM`); else if (otherLive) toast(`${s.meta.name} cued on deck ${'AB'[i]} — synced to ${other.bpm.toFixed(1)} BPM`);
  DOCK.deck = i; DOCK.dpat = DOCK.bpat = null; DOCK.dpage = DOCK.bpage = 0; DOCK.secPin = -1; DOCK.scoreDirty = false; DOCK.melDirty = false; renderDock(); mgFromTrack(i, s); return s; }
// validate → compile → swap on the next bar (q bars). Returns the new score or null (errors shown in the dock).
let commitT = [0, 0];
function commitSoon(i, q, ms) { clearTimeout(commitT[i]); commitT[i] = setTimeout(() => commitSpec(i, { q }), ms == null ? 140 : ms); }
// The compile runs on the composer thread (the page never freezes); the swap point is chosen when the score is ready. Only the
// newest edit of a deck is applied (a burst of edits compiles to one swap). Resolves to the new score, or null.
async function commitSpec(i, opt) { opt = opt || {}; const D = decks[i]; if (!D.spec || !D.score) return null;
  const v = validateSpec(D.spec); D.val = v; if (!v.ok) { dockStatus(); return null; }
  const tk = D.cseq = (D.cseq || 0) + 1, spec = JSON.parse(JSON.stringify(D.spec)); dockStatus('composing…');
  let s; try { s = await compileAsync(spec, { fastLevels: true }); } catch (e) { if (D.cseq === tk) { D.val = { ok: false, errors: [{ path: '', msg: e.message }], warnings: [] }; dockStatus(); } return null; }
  if (D.cseq !== tk || !D.score) return null; // a newer edit is on its way // palette sounds: table level now, exact level from the worker a moment later (no UI stall)
  D.lint = lintScore(s); const prev = D.score;
  if (s.meta.bpm !== prev.meta.bpm) { send({ type: D.playing ? 'glide' : 'bpm', deck: i, bpm: s.meta.bpm, bars: 4 }); D.native = s.meta.bpm; }
  const q = opt.q || 1, at = D.playing ? nextPhrase(D.score, schedPos(D) + 2, q) : 0; // (v9.2: the q-bar lines of the track's own sections)
  D.score = s; const { msg, transfer } = packScore(s); send({ type: 'swapScore', deck: i, score: msg, atStep: at }, transfer); D.swapAt = at;
  analyse(i, s); if (s.levelPending) refineInWorker(i, s); renderDeckHead(i); requestAnimationFrame(() => renderStems(i)); dockStatus(D.playing ? `→ bar ${at / 16 + 1}` : 'applied'); return s; }
function snap(D) { const j = JSON.stringify(D.spec); if (!D.undo) D.undo = []; if (D.undo[D.undo.length - 1] !== j) { D.undo.push(j); if (D.undo.length > 100) D.undo.shift(); } D.redo = []; }
function undo(dir) { const i = DOCK.deck, D = decks[i]; const from = dir > 0 ? D.redo : D.undo, to = dir > 0 ? D.undo : D.redo; if (!D.spec || !from || !from.length) { toast(dir > 0 ? 'Nothing to redo' : 'Nothing to undo'); return; }
  (to || (dir > 0 ? (D.undo = []) : (D.redo = []))).push(JSON.stringify(D.spec)); D.spec = JSON.parse(from.pop()); DOCK.scoreDirty = false; DOCK.melDirty = false;
  commitSpec(i, { q: 1 }).then((s) => { if (s) { const K = s.kits; for (const sl of ['kick', 'snare', 'hats', 'bass', 'chords', 'pad', 'lead', 'arp']) { const k = sl === 'arp' ? K.hook || K.arp : K[sl]; if (k) send({ type: 'kit', deck: i, slot: sl, p: k }); } } renderDock(); }); // sounds come back at once (the swap brings the rest on the bar)
  toast(dir > 0 ? 'Redo' : 'Undo'); renderDock(); }
function edit(fn, q, now) { const i = DOCK.deck, D = decks[i]; if (!D.spec) { toast('Load a track into this deck first'); return; } snap(D); fn(D.spec, D); DOCK.scoreDirty = false; if (now) commitSpec(i, { q }); else commitSoon(i, q); renderDock(); }
let kitGesture = 0; addEventListener('pointerup', () => { kitGesture = 0; });
function liveKit(slot, k, v) { const i = DOCK.deck, D = decks[i]; if (!D.spec) return; tasteKnob(slot, k, v); if (!kitGesture) { snap(D); kitGesture = 1; } send({ type: 'kit', deck: i, slot, p: { [k]: v } });
  const S = D.spec.sound || (D.spec.sound = {}); (S[slot] || (S[slot] = {}))[k] = typeof v === 'number' ? +v.toPrecision(4) : v; DOCK.scoreDirty = false; }

// ---------------------------------------------------------------- context: which section / bar the editor points at
function focus() { const D = decks[DOCK.deck], s = D.score; if (!s) return null; const pos = livePos(D), liveBar = Math.min(s.meta.bars - 1, Math.floor(pos / 16));
  const liveSec = Math.max(0, s.sections.findIndex((S) => liveBar >= S.bar0 && liveBar < S.bar0 + S.bars));
  const si = DOCK.secPin >= 0 && DOCK.secPin < s.sections.length ? DOCK.secPin : liveSec, S = s.sections[si], bar = liveBar >= S.bar0 && liveBar < S.bar0 + S.bars ? liveBar : S.bar0;
  return { D, s, si, S, bar, liveBar, step: pos - liveBar * 16, form: D.spec.form[si] }; }
function kitVal(slot, k) { const D = decks[DOCK.deck], sp = D.spec.sound && D.spec.sound[slot]; if (sp && sp[k] != null) return sp[k];
  const K = D.score.kits, kit = slot === 'arp' ? K.hook || K.arp : K[slot]; if (kit && kit[k] != null) return kit[k]; return DRUM_DEF[slot] ? DRUM_DEF[slot][k] : dflt()[k]; }
function slotsOf(s) { const K = s.kits, out = ['kick', 'snare', 'hats']; if (K.perc) out.push('perc'); out.push('bass'); if (K.chords && s.roles.chords !== 'none') out.push('chords'); if (K.pad) out.push('pad'); if (K.lead) out.push('lead'); if (K.hook || K.arp) out.push('arp'); return out; }

// ---------------------------------------------------------------- small controls
function dknob(parent, o) { // o: label, min, max, curve, unit, value, def, onchange
  const w = document.createElement('div'); w.className = 'dk-knob'; const c = document.createElement('canvas'); c.width = 72; c.height = 72; c.tabIndex = 0; c.setAttribute('role', 'slider'); c.setAttribute('aria-label', o.label);
  const lg = o.curve === 'log', to = (v) => (lg ? Math.log(v / o.min) / Math.log(o.max / o.min) : (v - o.min) / (o.max - o.min)), from = (t) => (lg ? o.min * Math.pow(o.max / o.min, t) : o.min + t * (o.max - o.min));
  let t = Math.max(0, Math.min(1, to(o.value))); const val = document.createElement('span'); val.className = 'dk-kv';
  const fmt = (v) => (o.unit === 'Hz' ? (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : Math.round(v)) : o.unit === 's' ? (v < 0.1 ? Math.round(v * 1000) + 'ms' : v.toFixed(2) + 's') : o.unit === 'beat' ? v.toFixed(2) + 'b' : v.toFixed(2));
  const draw = () => { const g = c.getContext('2d'); g.clearRect(0, 0, 72, 72); const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25, av = a0 + (a1 - a0) * t;
    g.lineCap = 'round'; g.lineWidth = 6; g.strokeStyle = css('--line2'); g.beginPath(); g.arc(36, 36, 27, a0, a1); g.stroke();
    g.strokeStyle = css(DOCK.deck ? '--b' : '--a'); g.beginPath(); g.arc(36, 36, 27, a0, av + 0.0001); g.stroke();
    g.fillStyle = css('--panel2'); g.beginPath(); g.arc(36, 36, 18, 0, 7); g.fill(); g.strokeStyle = css('--text'); g.lineWidth = 3.5; g.beginPath(); g.moveTo(36 + Math.cos(av) * 6, 36 + Math.sin(av) * 6); g.lineTo(36 + Math.cos(av) * 16, 36 + Math.sin(av) * 16); g.stroke();
    val.textContent = fmt(from(t)); c.setAttribute('aria-valuetext', fmt(from(t))); };
  const set = (nt) => { t = Math.max(0, Math.min(1, nt)); draw(); o.onchange(from(t)); };
  let y0 = 0, t0 = 0; c.addEventListener('pointerdown', (e) => { c.setPointerCapture(e.pointerId); y0 = e.clientY; t0 = t; });
  c.addEventListener('pointermove', (e) => { if (c.hasPointerCapture(e.pointerId)) set(t0 + (y0 - e.clientY) / (e.shiftKey ? 600 : 160)); });
  c.addEventListener('dblclick', () => { if (o.def != null) set(to(o.def)); });
  c.addEventListener('keydown', (e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); set(t + 0.025); } if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); set(t - 0.025); } });
  const l = document.createElement('span'); l.className = 'dk-kl'; l.textContent = o.label; w.append(c, l, val); draw(); parent.appendChild(w); return w; }
function knobRow(parent, slot, list) { const row = document.createElement('div'); row.className = 'dk-knobs'; parent.appendChild(row);
  if (slot === 'snare') { const used = snareKinds(); list = [...(used.snare ? P_DRUM.snare.slice(0, 3) : []), ...(used.clap ? P_CLAP.slice(0, 3) : []), ...(used.rim ? P_RIM.slice(0, 1) : []), ['gain', 'Gain', 0, 1.5]]; } // the knobs of what the track really hits on the snare channel (snare body / clap / rim — one score can use all three)
  if (!P_DRUM[slot]) { const md = kitVal(slot, 'model'), dead = X_LABEL[md] ? knobsHidden({ model: md, flt: kitVal(slot, 'flt') }) : MODEL_DEAD[md] || []; // the knobs this model uses (measured: tools/model_params.cjs) …
    // (v9.5) … and, on every model, the same core: Cutoff (a model with no filter of its own: its Tone filter; a struck, additive or granular
    // one switches its 12 dB filter on when Cutoff is turned), Reso, Env amt, Env decay, the envelope, Drive (a saturator on the models
    // that had none) and Level — the same knobs on every sound
    list = list.map((p) => (p[0] === 'cut' && TONE_MODELS.includes(md) ? ['tone', 'Cutoff', 0, 1, 'lin', ''] : p)).filter((p) => !dead.includes(p[0]) || (SYN_CORE.has(p[0]) && !(SINE_M.has(md) && ['res', 'envAmt', 'fDec'].includes(p[0])))); }
  for (const p of list) { let [k, label, mn, mx, curve, unit] = p; if (slot === 'kick' && k === 'len' && !(kitVal('kick', 'len') > 0)) { k = 'aDec'; label = 'Decay'; mn = 0.05; mx = 1; curve = 'log'; unit = 's'; }
    const v = kitVal(slot, k), md = kitVal(slot, 'model'), xm = !!X_LABEL[md];
    dknob(row, { label, min: mn, max: mx, curve, unit, value: v == null ? mn : v, def: v, onchange: (x) => { if (!P_DRUM[slot] && xm && ['cut', 'res', 'envAmt', 'fDec'].includes(k) && knobsHidden({ model: md, flt: kitVal(slot, 'flt') }).includes(k)) liveKit(slot, 'flt', 2); // (a filterless engine: its 12 dB filter comes on)
      if (!P_DRUM[slot] && TONE_MODELS.includes(md) && ['res', 'envAmt', 'fDec'].includes(k) && !(kitVal(slot, 'tone') < 0.999)) liveKit(slot, 'tone', 0.75); // (a Tone filter wide open is not running: it closes a little so its resonance and envelope act)
      if (!P_DRUM[slot] && xm && k === 'drive') { if (!kitVal(slot, 'dtype')) liveKit(slot, 'dtype', 1); liveKit(slot, 'drv', clamp((x - 1) / 4, 0, 1)); } liveKit(slot, k, x); } }); } return row; }
const TONE_MODELS = ['sub', 'b808', 'organ', 'piano', 'ep', 'bell', 'kspluck', 'vox'];
const synParams = (keys) => keys.map((k) => P_SYN.find((p) => p[0] === k));
function presetSelect(slot) { const bank = SOUND_BANK[slot]; if (!bank) return ''; const D = decks[DOCK.deck], cur = D.spec && D.spec.sound && D.spec.sound[slot] && D.spec.sound[slot].preset || '';
  return `<label class="dk-field"><span class="lbl">Preset</span><select class="btn dk-preset" data-slot="${slot}" title="${esc(cur && bank[cur] ? bank[cur].d : 'The genre\'s own sound')}"><option value="">Genre sound</option>${Object.entries(bank).map(([k, p]) => `<option value="${k}"${k === cur ? ' selected' : ''} title="${esc(p.d)}">${esc(p.label)}</option>`).join('')}</select></label>`; }
// a preset replaces the slot's sound in the score (level-matched to the genre's kit by the compiler) and is heard at once
function wirePreset(body) { $$('.dk-preset', body).forEach((sel) => sel.onchange = () => { const slot = sel.dataset.slot, val = sel.value; tastePreset(slot, val);
  edit((s) => { if (!val) { if (s.sound) delete s.sound[slot]; } else (s.sound || (s.sound = {}))[slot] = { preset: val }; if (s.sound && !Object.keys(s.sound).length) delete s.sound; }, 1, true);
  const sc = decks[DOCK.deck].score, k = slot === 'arp' ? sc.kits.hook || sc.kits.arp : sc.kits[slot]; if (k) send({ type: 'kit', deck: DOCK.deck, slot, p: k });
  toast(val ? `${slot}: ${SOUND_BANK[slot][val].label} — ${SOUND_BANK[slot][val].d}` : `${slot}: back to the genre sound`); }); }
function modelSelect(slot) { const cur = kitVal(slot, 'model') || 'saw'; return `<label class="dk-field"><span class="lbl">Model</span><select class="btn dk-model" data-slot="${slot}">${SYN_MODELS.map((m) => `<option value="${m}"${m === cur ? ' selected' : ''}>${X_LABEL[m] || m}</option>`).join('')}</select></label>`; }
// (v9.4) the eight engines of 03x_engines.js: their own controls under "Character" (the shape of the engine, then its filter and drive)
const X_LABEL = { fm4: 'FM · 4 operators', pd: 'Phase distortion', add: 'Additive', modal: 'Struck (modal)', grain: 'Granular', hyper: 'Hyper saw', va: 'Analog · 2 osc', pluck2: 'Plucked string' };
const X_FILTERS = [[-1, 'Auto'], [0, 'Off'], [1, 'Ladder'], [2, '12 dB'], [3, 'MS-20'], [4, 'SEM'], [5, 'Diode'], [6, 'Band'], [7, 'Formant']];
const X_DRIVES = [[0, 'Off'], [1, 'Soft'], [2, 'Tape'], [3, 'Fold'], [4, 'Crush'], [5, 'Tube']];
const X_SEG = { fm4: ['algo', 'Algorithm', [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [k, String(k + 1)])], pd: ['pdw', 'Wave', [[0, 'Saw'], [1, 'Square'], [2, 'Reso']]],
  modal: ['mat', 'Material', ['Marimba', 'Vibes', 'Glass', 'Bell', 'Kalimba', 'Wood', 'Steel', 'Tube'].map((n, k) => [k, n])], va: ['osc1', 'Osc 1', [[0, 'Saw'], [1, 'Square'], [2, 'Tri'], [3, 'Sine']]] };
const X_SEG2 = { va: ['osc2', 'Osc 2', [[0, 'Saw'], [1, 'Square'], [2, 'Tri'], [3, 'Sine']]] };
const X_KNOBS = { fm4: [['r2', 'Ratio 2', 0.5, 16, 'log'], ['i2', 'Index 2', 0, 4], ['r3', 'Ratio 3', 0.5, 16, 'log'], ['i3', 'Index 3', 0, 4], ['r4', 'Ratio 4', 0.5, 16, 'log'], ['i4', 'Index 4', 0, 4], ['fb', 'Feedback', 0, 0.9], ['md', 'Mod decay', 0.02, 6, 'log', 's'], ['ms', 'Mod sustain', 0, 1]],
  pd: [['dcw', 'Bend', 0, 1], ['det2', 'Detune', 0, 3]], add: [['tilt', 'Tilt', 0.2, 2.5], ['odd', 'Odd', 0, 1], ['fpk', 'Formant', 0, 8000, 'lin', 'Hz'], ['fwd', 'Formant width', 0.2, 2], ['shimmer', 'Shimmer', 0, 1], ['stretch', 'Stretch', 0, 3]],
  modal: [['hard', 'Hardness', 0, 1]], grain: [['gsize', 'Grain', 0.015, 0.3, 'log', 's'], ['density', 'Density', 0, 1], ['scan', 'Scan', 0, 1], ['gjit', 'Jitter', 0, 1], ['noiseAmt', 'Air', 0, 1]],
  hyper: [['oct2', 'Octave', 0, 1]], va: [['det2', 'Interval', -24, 24, 'lin', 'st'], ['sync', 'Sync', 0, 1], ['ring', 'Ring', 0, 1], ['xmod', 'Cross-mod', 0, 1], ['pw', 'Pulse width', 0.05, 0.95]],
  pluck2: [['body', 'Body', 0, 1], ['pick', 'Pick', 0.05, 0.5], ['bright', 'Bright', 0, 1]] };
function xCharacter(slot) { const md = kitVal(slot, 'model'); if (!X_LABEL[md]) return ''; const a = X_SEG[md], b = X_SEG2[md];
  return `<div class="dk-wt dk-x"><span class="lbl">Character</span>${a ? seg(a[1], a[2], kitVal(slot, a[0]) || 0, `data-xk="${a[0]}" data-xv`) : ''}${b ? seg(b[1], b[2], kitVal(slot, b[0]) || 0, `data-xk="${b[0]}" data-xv`) : ''}
    <span class="lbl">Filter</span>${seg('Filter type', X_FILTERS, kitVal(slot, 'flt') ?? -1, 'data-xk="flt" data-xv')}<span class="lbl">Drive</span>${seg('Drive type', X_DRIVES, kitVal(slot, 'dtype') || 0, 'data-xk="dtype" data-xv')}</div><div class="dk-xknobs"></div>`; }
function xKnobs(slot) { const md = kitVal(slot, 'model'), L = (X_KNOBS[md] || []).slice(), f = kitVal(slot, 'flt'); if (f === 4) L.push(['fmorph', 'Morph', 0, 1]); if (f === 7) L.push(['vow', 'Vowel', 0, 4], ['vowLfo', 'Vowel LFO', 0, 2]);
  if (kitVal(slot, 'dtype') > 0) L.push(['drv', 'Drive', 0, 1]); L.push(['stereo', 'Stereo', 0, 1]); return L; }
function seg(name, opts, cur, attr) { return `<div class="dk-seg" role="group" aria-label="${name}">${opts.map(([v, l]) => `<button class="${String(v) === String(cur) ? 'on' : ''}" ${attr}="${esc(v)}">${esc(l)}</button>`).join('')}</div>`; }

// ---------------------------------------------------------------- build + render
function buildDock() {
  const el = document.createElement('section'); el.className = 'dock'; el.id = 'dock'; el.setAttribute('aria-label', 'Editor');
  el.innerHTML = `<div class="dk-bar"><div class="dk-deck" role="group" aria-label="Deck to edit"><button data-dk="0">A</button><button data-dk="1">B</button></div>
    <nav class="dk-tabs" role="tablist">${DOCK_TABS.map(([k, l]) => `<button role="tab" data-tab="${k}" aria-label="${l} editor">${l}</button>`).join('')}</nav>
    <div class="dk-pagesel seg" role="group" aria-label="Page">${DOCK_PAGES.map(([k, l]) => `<button data-page="${k}">${l}</button>`).join('')}</div>
    <div class="dk-ctx"><select class="btn dk-sec" aria-label="Section to edit"></select><span class="dk-now"></span></div>
    <span class="dk-status" aria-live="polite"></span><div class="dk-undo"><button data-undo="-1" title="Undo (Ctrl/⌘+Z)" aria-label="Undo">↶</button><button data-undo="1" title="Redo (Ctrl/⌘+Shift+Z)" aria-label="Redo">↷</button></div><button class="dk-fold" aria-label="Collapse editor">▾</button></div><div class="dk-body"></div>`;
  document.body.appendChild(el);
  // the page always scrolls clear of the fixed editor: its height becomes the page's bottom padding (measured: buttons in the
  // lower part of a deck sat UNDER the dock and could not be clicked)
  const pad = () => { document.body.style.paddingBottom = (el.offsetHeight + 12) + 'px'; }; try { new ResizeObserver(pad).observe(el); } catch (e) { setInterval(pad, 1000); } pad();
  $$('[data-dk]', el).forEach((b) => b.onclick = () => { DOCK.deck = +b.dataset.dk; DOCK.dpat = DOCK.bpat = null; DOCK.secPin = -1; DOCK.scoreDirty = false; renderDock(); });
  $$('[data-tab]', el).forEach((b) => b.onclick = () => { DOCK.tab = b.dataset.tab; DOCK.open = true; renderDock(); });
  $$('[data-page]', el).forEach((b) => b.onclick = () => { DOCK.page = b.dataset.page; renderDock(); });
  $('.dk-fold', el).onclick = () => { DOCK.open = !DOCK.open; renderDock(); };
  $$('[data-undo]', el).forEach((b) => b.onclick = () => undo(+b.dataset.undo));
  document.addEventListener('keydown', (e) => { if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z' || /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return; e.preventDefault(); undo(e.shiftKey ? 1 : -1); });
  $('.dk-sec', el).onchange = (e) => { DOCK.secPin = +e.target.value; DOCK.melDirty = false; renderDock(); };
  try { const t = localStorage.getItem('forge.dockTab'); if (t && DOCK_TABS.some((x) => x[0] === t)) DOCK.tab = t; const o = localStorage.getItem('forge.dockOpen'); if (o === '0' || (o == null && !(matchMedia('(pointer: fine)').matches && window.innerWidth >= 1200 && window.innerHeight >= 1000))) DOCK.open = false; } /* (v9.2) open by default only on a big screen with a mouse: on tablets and phones, and at 1440×900, it covered the mixer */ catch (e) { /* storage blocked: defaults */ }
  new ResizeObserver(() => document.documentElement.style.setProperty('--dockH', el.offsetHeight + 'px')).observe(el);
  renderDock(); }
function dockStatus(msg) { const D = decks[DOCK.deck], el = $('.dk-status'); if (!el) return; const v = D.val;
  if (v && !v.ok) { el.className = 'dk-status bad'; el.textContent = `${v.errors.length} error${v.errors.length > 1 ? 's' : ''} — not applied`; el.title = v.errors.map((e) => `${e.path}: ${e.msg}`).join('\n'); }
  else { el.className = 'dk-status' + (msg ? ' ok' : ''); el.textContent = msg || ''; el.title = ''; }
  if (DOCK.tab === 'score') renderChecks(); }
let dockBusy = false;
function renderDock() { if (dockBusy) return; dockBusy = true; try { renderDock0(); } finally { dockBusy = false; } }
// (v9.2) after a live edit the dock is redrawn in the next frame, not in the task that swaps the score: together they were one main-thread
// task of 100 ms on a loaded machine (liveset_stress, 2 busy cores and the engine 3× slower), the screen's limit
let dockSoon = 0; function renderDockSoon() { if (dockSoon) return; dockSoon = requestAnimationFrame(() => { dockSoon = 0; renderDock(); }); }
function renderDock0() {
  const el = $('#dock'); if (!el) return; const D = decks[DOCK.deck], f = focus();
  try { localStorage.setItem('forge.dockTab', DOCK.tab); localStorage.setItem('forge.dockOpen', DOCK.open ? '1' : '0'); } catch (e) { /* ignore */ }
  el.dataset.d = DOCK.deck; el.classList.toggle('folded', !DOCK.open); $('.dk-fold', el).textContent = DOCK.open ? '▾' : '▴'; $('.dk-fold', el).setAttribute('aria-label', DOCK.open ? 'Collapse editor' : 'Expand editor');
  $$('[data-dk]', el).forEach((b) => b.classList.toggle('on', +b.dataset.dk === DOCK.deck));
  $$('[data-tab]', el).forEach((b) => { b.classList.toggle('on', b.dataset.tab === DOCK.tab); b.setAttribute('aria-selected', b.dataset.tab === DOCK.tab); });
  const part = !!PART_SLOTS[DOCK.tab]; if (!part) DOCK.page = 'pattern'; $$('[data-page]', el).forEach((b) => { b.classList.toggle('on', b.dataset.page === DOCK.page); b.disabled = !part && b.dataset.page !== 'pattern'; });
  const sel = $('.dk-sec', el); sel.innerHTML = f ? `<option value="-1"${DOCK.secPin < 0 ? ' selected' : ''}>Follow playhead</option>` + f.s.sections.map((S, k) => `<option value="${k}"${DOCK.secPin === k ? ' selected' : ''}>${k + 1} · ${esc(S.name || S.type)} · bars ${S.bar0 + 1}–${S.bar0 + S.bars}</option>`).join('') : '<option>—</option>'; sel.disabled = !f;
  DOCK.lastSec = f ? f.si : -2; dockStatus(); const body = $('.dk-body', el); if (!DOCK.open) { body.innerHTML = ''; return; }
  if (!f) { body.innerHTML = `<div class="dk-empty">Deck ${'AB'[DOCK.deck]} is empty. Load a genre from the library, or open <b>Score</b> to load a written song or paste one.</div>`; if (DOCK.tab === 'score') renderScoreTab(body, null); return; }
  if (DOCK.page === 'sound' && PART_SLOTS[DOCK.tab]) { renderSound(body, f, PART_SLOTS[DOCK.tab]); if (DOCK.tab === 'drums') renderKitFamily(body, f); return; }
  if (DOCK.page === 'mix' && PART_SLOTS[DOCK.tab]) { renderPartMix(body, f, PART_SLOTS[DOCK.tab]); return; }
  ({ drums: renderDrums, bass: renderBass, harmony: renderHarmony, chords: renderChords, lead: renderLead, score: renderScoreTab })[DOCK.tab](body, f);
  // the Pattern page holds what the part plays: its sound lives on Sound, its level and sends on Mix (one home per control)
  if (PART_SLOTS[DOCK.tab]) { $$('.dk-side, .dk-pgrid, .dk-padknobs, .dk-padh, [data-cnew], [data-newmel]', body).forEach((e) => e.remove()); /* (New chords / New melody: the deck's buttons, PLAY) */ const pad = $('[data-padon]', body); if (pad) pad.closest('.dk-tools').remove(); $$('.dk-split', body).forEach((e) => e.classList.add('solo')); }
  if (DOCK.tab === 'drums') renderGroove(body, f);
  if (DOCK.tab === 'harmony') { $$('.moods', body).forEach((e) => e.closest('.dk-tools').remove()); const bp = $('.dk-bpm', body); if (bp) { const lg = bp.nextElementSibling; if (lg && lg.classList.contains('dk-legend')) lg.remove(); if (bp.previousElementSibling) bp.previousElementSibling.remove(); bp.remove(); } } } // (mood and tempo live on the deck, PLAY)

// ---------------------------------------------------------------- DRUMS
function pageCtl(n, cur, kind) { return `<div class="dk-pages"><span class="lbl">Bar</span>${Array.from({ length: n }, (_, k) => `<button class="${k === cur ? 'on' : ''}" data-${kind}page="${k}">${k + 1}</button>`).join('')}${n < 4 ? `<button data-${kind}page="add" title="Make the pattern one bar longer (copies bar 1)">+</button>` : ''}${n > 1 ? `<button data-${kind}page="del" title="Remove the last bar">−</button>` : ''}</div>`; }
// ---------------------------------------------------------------- drum lanes: their voices, and the swap
// a lane plays one voice: a core lane (kick, snare, rim, closed, open, ride, shaker) or one percussion row (its kind). The
// menu on a lane's name picks any voice. A voice another lane already plays trades places with it; the steps stay on their
// row, so the rhythm is kept and only the sound moves.
const VOICE_OPTS = [...SWAP_CORE, ...SWAP_PERC.map(([k, l]) => ['perc:' + k, l])];
const voiceRows = (pat) => [...Object.keys(pat).filter((k) => k !== 'perc' && SPEC_LANES[k]).map((k) => ({ id: k, v: k, steps: pat[k] })), ...(pat.perc || []).map((p, i) => ({ id: 'p' + i, v: 'perc:' + p.kind, steps: p.steps, note: p.note }))];
const fitSteps = (s, v) => (HAT_LANES.has(v) ? s : s.replace(/[rzq]/g, 'x')); // hat rolls (r z q) exist only on hat lanes
function setVoiceRows(pat, rows) { for (const k of Object.keys(pat)) if (k === 'perc' || SPEC_LANES[k]) delete pat[k];
  const perc = []; for (const r of rows) { const s = fitSteps(r.steps, r.v); if (r.v.startsWith('perc:')) perc.push(r.note ? { kind: r.v.slice(5), note: r.note, steps: s } : { kind: r.v.slice(5), steps: s }); else pat[r.v] = s; }
  if (perc.length) pat.perc = perc; else delete pat.perc; }
function swapVoice(pat, id, want) { const R = voiceRows(pat), a = R.find((r) => r.id === id); if (!a || a.v === want) return;
  const b = R.find((r) => r !== a && r.v === want); if (b) b.v = a.v; a.v = want; setVoiceRows(pat, R); }
function laneSwap(pat, id) { const R = voiceRows(pat), me = R.find((r) => r.id === id), cur = me ? me.v : '', taken = new Set(R.filter((r) => r !== me).map((r) => r.v));
  const opts = VOICE_OPTS.slice(); if (cur && !opts.some(([v]) => v === cur)) opts.push([cur, cur.replace(/^perc:/, '')]);
  return `<select class="btn dk-swap" data-swap="${esc(id)}" aria-label="Sound of this lane" title="The sound of this lane. A sound another lane plays trades places with it.">${opts.map(([v, l]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}${taken.has(v) ? ' ⇄' : ''}</option>`).join('')}</select>`; }
function renderDrums(body, f) {
  const sp = f.D.spec, P = sp.drums.patterns, names = Object.keys(P), playing = names[f.s.pat.drums[f.bar]] || names[0];
  if (!DOCK.dpat || !P[DOCK.dpat]) DOCK.dpat = playing; const name = DOCK.dpat, pat = P[name];
  const lanes = LANE_ORDER.filter((l) => pat[l] != null), perc = pat.perc || [];
  const len = Math.max(16, ...lanes.map((l) => clean(pat[l]).length), ...perc.map((p) => clean(p.steps).length)), nb = len / 16; if (DOCK.dpage >= nb) DOCK.dpage = 0; DOCK.nb = nb; const pg = DOCK.dpage;
  const assign = f.form && f.form.drums != null ? (Array.isArray(f.form.drums) ? f.form.drums.join(',') : f.form.drums) : '';
  const row = (key, label, str, isHat, idx) => { const s = clean(str), bar = s.length > 16 ? s.slice((pg % (s.length / 16)) * 16, (pg % (s.length / 16)) * 16 + 16) : s;
    const rid = idx != null ? 'p' + idx : key, sel = (DOCK.dlane || 'kick') === rid;
    return `<div class="dk-row${sel ? ' lsel' : ''}" data-lane="${key}"${idx != null ? ` data-perc="${idx}"` : ''}>${laneSwap(pat, rid)}<div class="dk-cells">${[...bar].map((c, k) => `<button class="dk-c ${c === '.' ? 'c0' : DR_CELL[c] || 'cx'}" data-s="${k}" aria-label="${esc(label)} step ${k + 1}: ${c === '.' ? 'off' : c}">${DR_GLYPH[c] || ''}</button>`).join('')}</div><button class="dk-x" title="Remove lane" aria-label="Remove ${esc(label)} lane">×</button></div>`; };
  const missing = LANE_ORDER.filter((l) => pat[l] == null);
  body.innerHTML = `<div class="dk-split"><div class="dk-main">
    <div class="dk-tools"><div class="dk-chips" role="group" aria-label="Drum patterns">${names.map((n) => `<button class="dk-chip${n === name ? ' on' : ''}${n === playing ? ' live' : ''}" data-pat="${esc(n)}" title="${n === playing ? 'Playing now' : 'Edit pattern ' + esc(n)}">${esc(n)}</button>`).join('')}<button class="dk-chip add" data-patnew title="New pattern (copy of ${esc(name)})">+</button>${names.length > 1 ? `<button class="dk-chip" data-patdel title="Delete pattern ${esc(name)}">Delete</button>` : ''}</div>
      <label class="dk-field"><span class="lbl">${esc(f.S.name || f.S.type)} plays</span><select class="btn" data-assign="drums"><option value="">Genre policy (${esc(playing)} now)</option>${names.map((n) => `<option value="${esc(n)}"${assign === n ? ' selected' : ''}>${esc(n)}</option>`).join('')}${names.length > 1 ? `<option value="${esc(names.join(','))}"${assign === names.join(',') ? ' selected' : ''}>${esc(names.join(' → '))} (8 bars each)</option>` : ''}</select></label>
      ${pageCtl(nb, pg, 'd')}</div>
    <div class="dk-brush" role="group" aria-label="Brush: what a click on a step puts there">${DR_BRUSH.map(([t, l, tip]) => `<button data-brush="${esc(t)}" class="${(DOCK.brush || 'x') === t ? 'on' : ''}" aria-pressed="${(DOCK.brush || 'x') === t ? 'true' : 'false'}" title="${tip}" aria-label="Brush: ${tip}"><i class="dk-c ${DR_CELL[t]}">${DR_GLYPH[t] || ''}</i>${l}</button>`).join('')}</div>
    <div class="dk-grid">${lanes.map((l) => row(l, l, pat[l], HAT_LANES.has(l))).join('')}${perc.map((p, k) => row('perc', p.kind, p.steps, false, k)).join('')}
      <div class="dk-row add"><span class="dk-ln"></span><select class="btn dk-addlane" aria-label="Add a lane"><option value="">+ lane</option>${missing.map((l) => `<option value="${l}">${l}</option>`).join('')}<optgroup label="percussion">${PERC_ADD.map((k) => `<option value="perc:${k}">${k}</option>`).join('')}</optgroup></select>
      <span class="dk-legend">click paints the brush (again: clears) · right-click clears · a lane's name picks its sound</span></div></div>
    ${drumLaneTools(f, pat, len)}
    <div class="dk-tools"><label class="dk-field"><span class="lbl">Swing</span><input type="range" min="50" max="75" step="1" value="${sp.swing}" data-swing aria-label="Swing"><b class="dk-sv">${sp.swing}%</b></label>
      <label class="dk-field"><input type="checkbox" data-fill ${sp.drums.fill === false ? '' : 'checked'}><span>Fills at phrase ends</span></label></div></div>
    <div class="dk-side"><h4>Kick</h4></div></div>`;
  const side = $('.dk-side', body); side.insertAdjacentHTML('beforeend', presetSelect('kick')); knobRow(side, 'kick', P_DRUM.kick); wirePreset(side); /* (the Pattern page shows no side: the drums' sound is on Sound) */
  $$('[data-brush]', body).forEach((b) => b.onclick = () => { DOCK.brush = b.dataset.brush; renderDock(); });
  const ls = $('[data-lsel]', body); if (ls) ls.onchange = () => { DOCK.dlane = ls.value; renderDock(); }; wireDrumLaneTools(body, f, pat, len, pg);
  $$('[data-pat]', body).forEach((b) => b.onclick = () => { DOCK.dpat = b.dataset.pat; DOCK.dpage = 0; renderDock(); });
  const pn = $('[data-patnew]', body); if (pn) pn.onclick = () => edit((s) => { let k = 0, nn; do nn = String.fromCharCode(65 + k++); while (s.drums.patterns[nn]); s.drums.patterns[nn] = JSON.parse(JSON.stringify(pat)); DOCK.dpat = nn; });
  const pd = $('[data-patdel]', body); if (pd) pd.onclick = () => edit((s) => { delete s.drums.patterns[name]; for (const fm of s.form) if (fm.drums != null) { const l = (Array.isArray(fm.drums) ? fm.drums : [fm.drums]).filter((x) => x !== name); if (l.length) fm.drums = l.length === 1 ? l[0] : l; else delete fm.drums; } DOCK.dpat = null; });
  $('[data-assign=drums]', body).onchange = (e) => edit((s) => { const v = e.target.value, fm = s.form[f.si]; if (!v) delete fm.drums; else fm.drums = v.includes(',') ? v.split(',') : v; });
  $$('[data-dpage]', body).forEach((b) => b.onclick = () => { const v = b.dataset.dpage;
    if (v === 'add' || v === 'del') edit(() => { const grow = (str) => { const s = clean(str); const L = s.length; if (v === 'add') return groupBars(s + s.slice(0, 16)); return L > 16 ? groupBars(s.slice(0, Math.max(16, (nb - 1) * 16))) : s; };
      for (const l of lanes) pat[l] = grow(len > clean(pat[l]).length && v === 'add' ? clean(pat[l]).repeat(len / clean(pat[l]).length) : pat[l]); for (const p of perc) p.steps = grow(len > clean(p.steps).length && v === 'add' ? clean(p.steps).repeat(len / clean(p.steps).length) : p.steps); DOCK.dpage = v === 'add' ? nb : Math.min(pg, nb - 2); });
    else { DOCK.dpage = +v; renderDock(); } });
  const setStep = (rowEl, k, next) => edit(() => { const lane = rowEl.dataset.lane, pi = rowEl.dataset.perc; let s = clean(pi != null ? perc[+pi].steps : pat[lane]);
    if (s.length < len) s = s.repeat(len / s.length); const at = (pg % (s.length / 16)) * 16 + k; const c = next(s[at], HAT_LANES.has(lane)); s = s.slice(0, at) + c + s.slice(at + 1);
    if (pi != null) perc[+pi].steps = groupBars(s); else pat[lane] = groupBars(s); });
  $$('.dk-row[data-lane] .dk-c', body).forEach((b) => { const r = b.closest('.dk-row'), k = +b.dataset.s;
    b.onclick = () => setStep(r, k, (c) => { const br = DOCK.brush || 'x'; return c === br ? '.' : br; });
    b.oncontextmenu = (e) => { e.preventDefault(); setStep(r, k, () => '.'); }; });
  $$('.dk-row[data-lane] .dk-x', body).forEach((b) => b.onclick = () => { const r = b.closest('.dk-row'); edit(() => { if (r.dataset.perc != null) { perc.splice(+r.dataset.perc, 1); if (!perc.length) delete pat.perc; } else delete pat[r.dataset.lane]; }); });
  $$('.dk-swap', body).forEach((sel) => sel.onchange = () => { const id = sel.dataset.swap, want = sel.value; DOCK.dpat = name; edit((s) => swapVoice(s.drums.patterns[name], id, want)); });
  $('.dk-addlane', body).onchange = (e) => { const v = e.target.value; if (!v) return; edit(() => { const empty = groupBars('.'.repeat(len)); if (v.startsWith('perc:')) (pat.perc || (pat.perc = [])).push({ kind: v.slice(5), steps: empty }); else pat[v] = empty; }); };
  const sw = $('[data-swing]', body); sw.oninput = () => { $('.dk-sv', body).textContent = sw.value + '%'; }; sw.onchange = () => edit((s) => { s.swing = +sw.value; });
  $('[data-fill]', body).onchange = (e) => edit((s) => { if (e.target.checked) delete s.drums.fill; else s.drums.fill = false; if (e.target.checked && s.drums.fill === undefined) { const G = GENRE_BY_ID[s.genre]; if (G.drums.fill) s.drums.fill = G.drums.fill.slice(); } }); }

// ---------------------------------------------------------------- BASS
function renderBass(body, f) {
  const sp = f.D.spec, P = sp.bass.patterns, names = Object.keys(P), playing = names[f.s.pat.bass[f.bar]] || names[0];
  if (!DOCK.bpat || P[DOCK.bpat] == null) DOCK.bpat = playing; const name = DOCK.bpat, s = clean(P[name]), nb = s.length / 16; if (DOCK.bpage >= nb) DOCK.bpage = 0; DOCK.nb = nb; const pg = DOCK.bpage, bar = s.slice(pg * 16, pg * 16 + 16);
  const accAll = (() => { const a = sp.bass.accents && sp.bass.accents[name] ? clean(sp.bass.accents[name]) : ''; return a.length === s.length ? a : '.'.repeat(s.length); })(), accBar = accAll.slice(pg * 16, pg * 16 + 16);
  const assign = f.form && f.form.bass != null ? (Array.isArray(f.form.bass) ? f.form.bass.join(',') : f.form.bass) : '';
  body.innerHTML = `<div class="dk-split"><div class="dk-main">
    <div class="dk-tools"><div class="dk-chips">${names.map((n) => `<button class="dk-chip${n === name ? ' on' : ''}${n === playing ? ' live' : ''}" data-bp="${esc(n)}">${esc(n)}</button>`).join('')}<button class="dk-chip add" data-bpnew title="New bass line (copy of ${esc(name)})">+</button>${names.length > 1 ? '<button class="dk-chip" data-bpdel>Delete</button>' : ''}</div>
      <label class="dk-field"><span class="lbl">${esc(f.S.name || f.S.type)} plays</span><select class="btn" data-assign="bass"><option value="">Genre policy (${esc(playing)} now)</option>${names.map((n) => `<option value="${esc(n)}"${assign === n ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>${pageCtl(nb, pg, 'b')}</div>
    <div class="dk-brush" role="group" aria-label="Brush: the note a click puts on a step">${BS_BRUSH.map(([t, l]) => `<button data-bbrush="${t}" class="${(DOCK.bbrush || 'R') === t ? 'on' : ''}" aria-pressed="${(DOCK.bbrush || 'R') === t ? 'true' : 'false'}" title="${esc(BASS_HELP[t] || l)}"><b>${t === '-' ? '–' : t === '.' ? '·' : t}</b> ${l}</button>`).join('')}</div>
    <div class="dk-grid bass"><div class="dk-row" data-lane="bass"><span class="dk-ln">notes</span><div class="dk-cells">${[...bar].map((c, k) => `<button class="dk-c tok t${c === '.' ? '0' : c === '-' ? 'h' : c.toUpperCase()}" data-s="${k}" title="${esc(BASS_HELP[c.toUpperCase()] || '')}">${c === '.' ? '' : c === '-' ? '–' : c.toUpperCase()}</button>`).join('')}</div><span></span></div>
      <div class="dk-row" data-lane="slide"><span class="dk-ln">slide</span><div class="dk-cells">${[...bar].map((c, k) => `<button class="dk-c sl${/[a-z]/.test(c) ? ' on' : ''}" data-s="${k}" ${/[A-Za-z]/.test(c) ? '' : 'disabled'} aria-label="slide step ${k + 1}"></button>`).join('')}</div><span></span></div>
      <div class="dk-row" data-lane="accent"><span class="dk-ln">accent</span><div class="dk-cells">${[...accBar].map((c, k) => `<button class="dk-c ac${c === 'x' ? ' on' : ''}" data-s="${k}" ${/[A-Za-z]/.test(bar[k]) ? '' : 'disabled'} aria-label="accent step ${k + 1}" aria-pressed="${c === 'x' ? 'true' : 'false'}"></button>`).join('')}</div><span></span></div></div>
    <div class="dk-lanebar"><button class="btn" data-bop="left" title="Shift one step earlier">◀</button><button class="btn" data-bop="right" title="Shift one step later">▶</button><button class="btn" data-bop="mut" title="Small changes that keep its shape">Mutate</button><button class="btn" data-bop="thin" title="Every other note out">Thin</button><button class="btn" data-bop="oct" title="Every other note an octave up">Octaves</button><button class="btn" data-bop="clr" title="Clear this bar">Clear</button><button class="btn" data-bop="ans" title="Add a bar that answers this one: the second half's contour turned, an approach note into the next bar">Answer bar</button><button class="btn" data-bop="lock" title="Notes on a kick move to the next free 16th (the sidechain would swallow them)">Lock to kick</button>
      <select class="btn" data-blib aria-label="Bass styles"><option value="">Style…</option>${BS_LIB.map(([n], k) => `<option value="${k}">${esc(n)}</option>`).join('')}</select></div>
    <p class="dk-legend">${['R', 'O', 'F', 'T', 'S', 'A', 'N', 'P', '-'].map((t) => `<b>${t === '-' ? '–' : t}</b> ${BASS_HELP[t]}`).join(' · ')} · notes follow the chords, so a line survives any key or progression change</p>
    <div class="dk-tools"><label class="dk-field"><span class="lbl">Gate</span><input type="range" min="0.2" max="1" step="0.05" value="${sp.bass.gate}" data-gate aria-label="Bass note length"><b class="dk-gv">${(+sp.bass.gate).toFixed(2)}</b></label></div></div>
    <div class="dk-side"><h4>Bass sound</h4>${presetSelect('bass')}${modelSelect('bass')}</div></div>`;
  knobRow($('.dk-side', body), 'bass', synParams(P_BASS)); wireModel(body);
  $$('[data-bp]', body).forEach((b) => b.onclick = () => { DOCK.bpat = b.dataset.bp; DOCK.bpage = 0; renderDock(); });
  const bn = $('[data-bpnew]', body); if (bn) bn.onclick = () => edit((x) => { let k = 0, nn; do nn = String.fromCharCode(65 + k++); while (x.bass.patterns[nn] != null); x.bass.patterns[nn] = P[name]; if (x.bass.accents && x.bass.accents[name]) x.bass.accents[nn] = x.bass.accents[name]; DOCK.bpat = nn; });
  const bd = $('[data-bpdel]', body); if (bd) bd.onclick = () => edit((x) => { delete x.bass.patterns[name]; if (x.bass.accents) { delete x.bass.accents[name]; if (!Object.keys(x.bass.accents).length) delete x.bass.accents; } for (const fm of x.form) if (fm.bass != null) { const l = (Array.isArray(fm.bass) ? fm.bass : [fm.bass]).filter((y) => y !== name); if (l.length) fm.bass = l.length === 1 ? l[0] : l; else delete fm.bass; } DOCK.bpat = null; });
  $('[data-assign=bass]', body).onchange = (e) => edit((x) => { const v = e.target.value, fm = x.form[f.si]; if (!v) delete fm.bass; else fm.bass = v; });
  const accFit = (x, n) => { if (x.bass.accents && x.bass.accents[name]) { const a = (accAll + accAll).slice(0, n); if (/x/.test(a)) x.bass.accents[name] = groupBars(a); else delete x.bass.accents[name]; } };
  $$('[data-bpage]', body).forEach((b) => b.onclick = () => { const v = b.dataset.bpage; if (v === 'add') edit((x) => { x.bass.patterns[name] = groupBars(s + s.slice(0, 16)); accFit(x, s.length + 16); DOCK.bpage = nb; }); else if (v === 'del') edit((x) => { x.bass.patterns[name] = groupBars(s.slice(0, (nb - 1) * 16)); accFit(x, (nb - 1) * 16); DOCK.bpage = 0; }); else { DOCK.bpage = +v; renderDock(); } });
  const put = (k, fn) => edit((x) => { const at = pg * 16 + k; x.bass.patterns[name] = groupBars(s.slice(0, at) + fn(s[at]) + s.slice(at + 1)); });
  $$('[data-lane=bass] .dk-c', body).forEach((b) => { const k = +b.dataset.s; b.onclick = () => put(k, (c) => { const br = DOCK.bbrush || 'R', up = c === '-' || c === '.' ? c : c.toUpperCase(); if (up === br) return '.'; return /[a-z]/.test(c) && /[A-Z]/.test(br) ? br.toLowerCase() : br; }); b.oncontextmenu = (e) => { e.preventDefault(); put(k, () => '.'); }; });
  $$('[data-bbrush]', body).forEach((b) => b.onclick = () => { DOCK.bbrush = b.dataset.bbrush; renderDock(); });
  // the accent lane (bass.accents.<pattern>, as long as the pattern; an all-'.' lane is left out of the score)
  const putAcc = (fn) => edit((x) => { const a = fn(accAll); const A = x.bass.accents || (x.bass.accents = {}); if (/x/.test(a)) A[name] = groupBars(a); else delete A[name]; if (!Object.keys(A).length) delete x.bass.accents; });
  $$('[data-lane=accent] .dk-c', body).forEach((b) => b.onclick = () => { const at = pg * 16 + +b.dataset.s; putAcc((a) => a.slice(0, at) + (a[at] === 'x' ? '.' : 'x') + a.slice(at + 1)); });
  const barOp = (fn) => edit((x) => { const k = pg * 16; x.bass.patterns[name] = groupBars(s.slice(0, k) + fn(s.slice(k, k + 16)) + s.slice(k + 16)); });
  $$('[data-bop]', body).forEach((b) => b.onclick = () => { const op = b.dataset.bop; let seed = (Date.now() & 0xffff) + 7; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    if (op === 'left') edit((x) => { x.bass.patterns[name] = groupBars(s.slice(1) + s[0]); if (x.bass.accents && x.bass.accents[name]) x.bass.accents[name] = groupBars(accAll.slice(1) + accAll[0]); });
    else if (op === 'right') edit((x) => { x.bass.patterns[name] = groupBars(s[s.length - 1] + s.slice(0, -1)); if (x.bass.accents && x.bass.accents[name]) x.bass.accents[name] = groupBars(accAll[accAll.length - 1] + accAll.slice(0, -1)); });
    else if (op === 'mut') barOp((t) => bassMutate(t, r)); else if (op === 'thin') { let k = 0; barOp((t) => t.replace(/[A-Za-z]/g, (c) => (k++ % 2 ? '.' : c))); }
    else if (op === 'oct') { let k = 0; barOp((t) => t.replace(/[A-Za-z]/g, (c) => (k++ % 2 ? (c === c.toLowerCase() ? 'o' : 'O') : c))); }
    else if (op === 'ans') { if (nb >= 4) { toast('A bass line holds 4 bars at most'); return; } edit((x) => { x.bass.patterns[name] = groupBars(s + answerBass(bar)); accFit(x, s.length + 16); DOCK.bpage = nb; }); }
    else if (op === 'lock') { const dn = Object.keys(sp.drums.patterns)[f.s.pat.drums[f.bar]] || Object.keys(sp.drums.patterns)[0], kick = clean((sp.drums.patterns[dn] || {}).kick || '................').slice(0, 16); barOp((t) => lockToKick(t, kick)); }
    else barOp(() => '.'.repeat(16)); });
  const bl = $('[data-blib]', body); if (bl) bl.onchange = () => { const x = BS_LIB[+bl.value]; if (x) barOp(() => x[1]); };
  $$('[data-lane=slide] .dk-c', body).forEach((b) => b.onclick = () => put(+b.dataset.s, (c) => (/[a-z]/.test(c) ? c.toUpperCase() : c.toLowerCase())));
  const g = $('[data-gate]', body); g.oninput = () => { $('.dk-gv', body).textContent = (+g.value).toFixed(2); }; g.onchange = () => edit((x) => { x.bass.gate = +g.value; }); }
function wireModel(body) { wirePreset(body); $$('.dk-model', body).forEach((sel) => sel.onchange = () => { const slot = sel.dataset.slot; liveKit(slot, 'model', sel.value);
  const k = specKits(decks[DOCK.deck].spec)[slot]; if (k) send({ type: 'kit', deck: DOCK.deck, slot, p: { gain: k.gain } }); // loudness-matched to the genre's kit right away
  commitSoon(DOCK.deck, 1); toast(`${slot}: ${sel.value} — level matched to the genre's ${slot}`); }); }

// ---------------------------------------------------------------- HARMONY
const COMMON_PROGS = { minor: [['i', 'bVI', 'bIII', 'bVII'], ['i', 'iv', 'bVII', 'bIII'], ['i', 'bVII', 'bVI', 'bVII'], ['i', 'v', 'bVI', 'iv'], ['i', 'iv']], major: [['I', 'V', 'vi', 'IV'], ['vi', 'IV', 'I', 'V'], ['I', 'vi', 'IV', 'V'], ['ii7', 'V7', 'Imaj7', 'vi7'], ['IV', 'V', 'iii', 'vi']] };
function transposeMelody(text, semis, names) { const p = parseMelody(text); if (p.errors.length) return text; for (const b of p.bars) for (const n of b) n.m += semis; return melodyToText(p.bars, names); }
function renderHarmony(body, f) {
  const sp = f.D.spec, G = GENRE_BY_ID[sp.genre], key = sp.key != null ? KEY_PC[sp.key] : f.s.meta.key, mode = sp.mode || f.s.meta.mode, names = spellFor(key, mode), minorish = ['minor', 'dorian', 'phrygian', 'harmonic', 'phrygdom'].includes(mode);
  const secProg = f.form && f.form.progression, prog = (secProg || (sp.harmony && sp.harmony.progression) || f.s.meta.prog).join(' '), presets = [...G.harm.progs, ...COMMON_PROGS[minorish ? 'minor' : 'major']].filter((p, k, a) => a.findIndex((q) => q.join() === p.join()) === k).slice(0, 9);
  const labels = []; let last = ''; for (let b = f.S.bar0; b < f.S.bar0 + f.S.bars; b++) { const c = f.s.chords[b]; if (c.label !== last || (b - f.S.bar0) % 4 === 0 && labels.length < 16) { labels.push([b, c.label]); last = c.label; } }
  body.innerHTML = `<div class="dk-split"><div class="dk-main">
    <div class="dk-tools"><span class="lbl">Mood</span><div class="moods">${[['', 'Genre'], ...Object.keys(MOODS).map((m) => [m, m[0].toUpperCase() + m.slice(1)])].map(([k, l]) => `<button class="${(sp.mood || '') === k ? 'on' : ''}" data-mood="${k}">${l}</button>`).join('')}</div></div>
    <p class="dk-legend">Pick a feeling — the progression, mode and chord colour follow it; the key follows the mix (decks stay harmonically compatible). Applies on the next 4-bar line.</p>
    <details class="adv"${DOCK.advOpen ? ' open' : ''}><summary>Advanced — key, mode, progression</summary>
    <div class="dk-tools"><span class="lbl">Key</span><div class="dk-keys">${names.map((n, k) => `<button class="${k === key ? 'on' : ''}" data-key="${k}">${n}</button>`).join('')}</div></div>
    <div class="dk-tools"><span class="lbl">Mode</span>${seg('Mode', Object.keys(MODES).map((m) => [m, (G.modes.includes(m) ? '★ ' : '') + m]), mode, 'data-mode')}</div>
    <div class="dk-tools wrap"><label class="dk-field grow"><span class="lbl">Progression</span><input class="btn dk-prog" value="${esc(prog)}" spellcheck="false" aria-label="Progression in roman numerals"></label>
      ${seg('Scope', [['all', 'Whole track'], ['sec', 'This section']], secProg ? 'sec' : 'all', 'data-scope')}</div>
    <div class="dk-chips presets">${presets.map((p) => `<button class="dk-chip" data-preset="${esc(p.join(' '))}">${esc(p.join(' – '))}</button>`).join('')}</div>
    <p class="dk-legend">Roman numerals: uppercase major, lowercase minor, <b>b</b>/<b>#</b> borrow, suffix 7 maj7 9 add9 sus2 sus4 dim. Applies on the next 4-bar line; bass, chords, pad, arp and generated melodies all follow.</p></details>
    <div class="dk-chordstrip">${labels.map(([b, l]) => `<span class="${b === f.bar ? 'on' : ''}"><i>${b - f.S.bar0 + 1}</i>${esc(l)}</span>`).join('')}</div>${chordRhythmHtml(f)}</div>
    <div class="dk-side"><h4>Rhythm of harmony</h4><span class="lbl">Bars per chord</span>${seg('Bars per chord', [1, 2, 4, 8].map((n) => [n, n]), (f.form && f.form.barsPerChord) || (sp.harmony && sp.harmony.barsPerChord) || f.s.contract.harm.hr, 'data-hr')}
      <span class="lbl">Chord colour</span>${seg('Extension', ['triad', '7', '9', 'add9', 'sus2', 'power'].map((x) => [x, x]), (sp.harmony && sp.harmony.extension) || f.s.contract.harm.ext, 'data-ext')}
      <span class="lbl">Tempo</span><div class="dk-bpm"><button data-bpm="-1">−</button><input class="btn" type="number" min="60" max="200" step="0.5" value="${sp.bpm}" aria-label="Tempo"><button data-bpm="1">+</button></div>
      <span class="dk-legend">${G.name}: ${G.bpm[0]}–${G.bpm[1]} BPM. Tempo glides over 4 bars.</span></div></div>`;
  $$('[data-mood]', body).forEach((b) => b.onclick = () => setMood(DOCK.deck, b.dataset.mood));
  const adv = $('details.adv', body); if (adv) adv.ontoggle = () => { DOCK.advOpen = adv.open; };
  $$('[data-key]', body).forEach((b) => b.onclick = () => edit((s) => { const nk = +b.dataset.key; let d = ((nk - key) % 12 + 12) % 12; if (d > 6) d -= 12; const nn = spellFor(nk, s.mode); s.key = nn[nk]; for (const fm of s.form) if (fm.melody) fm.melody = transposeMelody(fm.melody, d, nn); }, 4));
  $$('[data-mode]', body).forEach((b) => b.onclick = () => edit((s) => { s.mode = b.dataset.mode; s.key = spellFor(key, s.mode)[key]; }, 4));
  const applyProg = (txt) => { const toks = txt.trim().split(/[\s,–-]+/).filter(Boolean); const scope = $('[data-scope].on', body).dataset.scope;
    edit((s) => { s.harmony = s.harmony || {}; if (scope === 'sec') s.form[f.si].progression = toks; else { s.harmony.progression = toks; } }, 4); };
  const pi = $('.dk-prog', body); pi.onkeydown = (e) => { if (e.key === 'Enter') pi.blur(); }; pi.onchange = () => applyProg(pi.value); // Enter → blur → one change event (applying on both re-rendered the input away mid-blur)
  $$('[data-preset]', body).forEach((b) => b.onclick = () => applyProg(b.dataset.preset));
  $$('[data-scope]', body).forEach((b) => b.onclick = () => { if (b.dataset.scope === 'all' && f.form.progression) edit((s) => { delete s.form[f.si].progression; }, 4); else { $$('[data-scope]', body).forEach((x) => x.classList.toggle('on', x === b)); } });
  $$('[data-hr]', body).forEach((b) => b.onclick = () => edit((s) => { s.harmony = s.harmony || {}; const v = +b.dataset.hr; if (s.form[f.si].progression) s.form[f.si].barsPerChord = v; else { s.harmony.barsPerChord = v; delete s.harmony.breakBarsPerChord; } }, 4));
  $$('[data-ext]', body).forEach((b) => b.onclick = () => edit((s) => { s.harmony = s.harmony || {}; s.harmony.extension = b.dataset.ext; }, 4));
  const bi = $('.dk-bpm input', body), setBpm = (v) => edit((s) => { s.bpm = Math.max(60, Math.min(200, Math.round(v * 2) / 2)); }, 1);
  wireChordRhythm(body, f);
  bi.onchange = () => setBpm(+bi.value); bi.onkeydown = (e) => { if (e.key === 'Enter') bi.blur(); }; $$('[data-bpm]', body).forEach((b) => b.onclick = () => setBpm(sp.bpm + +b.dataset.bpm)); }

// chord rhythm (stab / gate roles): the rows the composer picks from, editable, with the kick of the playing pattern as a
// reference line. A stab that would land on a kick is moved to the off-beat by the composer; the grid shows where you put it.
function chordRhythmHtml(f) { const sp = f.D.spec, ch = sp.chords || {}, field = ch.role === 'gate' ? 'gate' : ch.role === 'stab' ? 'rhythm' : null; if (!field || !Array.isArray(ch[field])) return '';
  const dn = Object.keys(sp.drums.patterns)[f.s.pat.drums[f.bar]] || Object.keys(sp.drums.patterns)[0], kick = clean((sp.drums.patterns[dn] || {}).kick || '................').slice(0, 16);
  const cells = (str, ref) => [...clean(str).slice(0, 16)].map((c, k) => `<button class="dk-c c${c === '.' ? '0' : c}${ref ? ' ref' : ''}" data-s="${k}" ${ref ? 'disabled tabindex="-1"' : ''} aria-label="step ${k + 1}"></button>`).join('');
  return `<h4>Chord ${ch.role === 'gate' ? 'gate' : 'stab'} rhythm</h4><div class="dk-grid"><div class="dk-row ref"><span class="dk-ln">kick ${esc(dn)}</span><div class="dk-cells">${cells(kick, true)}</div><span></span></div>
    ${ch[field].map((r, n) => `<div class="dk-row" data-crow="${n}"><span class="dk-ln">${ch.role} ${n + 1}</span><div class="dk-cells">${cells(r)}</div><button class="dk-x" aria-label="Remove rhythm ${n + 1}" ${ch[field].length > 1 ? '' : 'disabled'}>×</button></div>`).join('')}
    <div class="dk-lanebar"><span class="lbl">Rhythm ${(DOCK.crow || 0) + 1}</span><button class="btn" data-crop="left" title="One step earlier">◀</button><button class="btn" data-crop="right" title="One step later">▶</button><button class="btn" data-crop="mut" title="Small changes that keep its feel">Mutate</button><button class="btn" data-crop="ans" title="Add a rhythm that answers this one (the bars alternate)">Answer</button><button class="btn" data-crop="gaps" title="Stabs where the bass rests: the chords and the bass talk instead of colliding">Between the bass</button></div>
    <div class="dk-row add"><span class="dk-ln"></span><span><button class="btn" data-cradd>+ rhythm</button> <span class="dk-legend">Bars alternate between these every 4 bars; the 4th bar of a phrase answers with the next one. ${ch.role === 'stab' ? 'Stabs on a kick move to the off-beat (the sidechain would swallow them); chord changes get a push stab automatically.' : ''}</span></span></div></div>`; }
function wireChordRhythm(body, f) { const ch = f.D.spec.chords || {}, field = ch.role === 'gate' ? 'gate' : 'rhythm';
  $$('[data-crow] .dk-c', body).forEach((b) => { const n = +b.closest('[data-crow]').dataset.crow, k = +b.dataset.s;
    b.onclick = () => edit((s) => { const r = clean(s.chords[field][n]).padEnd(16, '.').slice(0, 16), cyc = ['.', 'X', 'x', 'g'], c = cyc[(cyc.indexOf(r[k]) + 1) % cyc.length]; s.chords[field][n] = r.slice(0, k) + c + r.slice(k + 1); });
    b.oncontextmenu = (e) => { e.preventDefault(); edit((s) => { const r = clean(s.chords[field][n]).padEnd(16, '.').slice(0, 16); s.chords[field][n] = r.slice(0, k) + '.' + r.slice(k + 1); }); }; });
  $$('[data-crow] .dk-x', body).forEach((b) => b.onclick = () => { const n = +b.closest('[data-crow]').dataset.crow; edit((s) => { if (s.chords[field].length > 1) s.chords[field].splice(n, 1); }); });
  const add = $('[data-cradd]', body); if (add) add.onclick = () => edit((s) => { s.chords[field].push(clean(s.chords[field][s.chords[field].length - 1])); });
  $$('[data-crow] .dk-ln', body).forEach((l) => { l.style.cursor = 'pointer'; l.title = 'Pick this rhythm for the tools below'; l.onclick = () => { DOCK.crow = +l.closest('[data-crow]').dataset.crow; renderDock(); }; });
  $$('[data-crop]', body).forEach((b) => b.onclick = () => { const op = b.dataset.crop; edit((s) => { const L = s.chords[field], n = Math.min(L.length - 1, DOCK.crow || 0), r = clean(L[n]).padEnd(16, '.').slice(0, 16); let seed = (Date.now() & 0xffff) + 3; const rn = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    if (op === 'left') L[n] = r.slice(1) + r[0]; else if (op === 'right') L[n] = r[15] + r.slice(0, 15); else if (op === 'mut') L[n] = drMutate(r, rn).replace(/[234?f]/g, 'x');
    else if (op === 'ans') { L.splice(n + 1, 0, answerBar(r, 'chords')); DOCK.crow = n + 1; }
    else { const bp = Object.values(s.bass.patterns)[f.s.pat.bass[f.bar]] || Object.values(s.bass.patterns)[0], bb = clean(bp || '').slice(0, 16).padEnd(16, '.'); let out = '';
      for (let i = 0; i < 16; i++) { const busy = /[A-Za-z-]/.test(bb[i]), after = i > 0 && /[A-Za-z]/.test(bb[i - 1]) && !(i + 1 < 16 && bb[i + 1] === '-'); out += busy ? '.' : r[i] !== '.' ? r[i] : after && i % 2 === 0 ? 'x' : '.'; } /* (stabs leave the bass's notes alone and answer them on the next 8th) */
      L[n] = /[^.]/.test(out) ? out : r; } }); }); }

// ---------------------------------------------------------------- LEAD
function renderLead(body, f) {
  const sp = f.D.spec, role = sp.lead ? sp.lead.role : 'none', authored = !!(f.form && f.form.melody), names = spellFor(f.s.meta.key, f.s.meta.mode);
  const gen = authored ? f.form.melody : sectionMelody(f.s, f.S) || '';
  const hasLead = !!f.s.kits.lead;
  body.innerHTML = `<div class="dk-split"><div class="dk-main">
    <div class="dk-tools"><span class="lbl">Role</span>${seg('Lead role', [['hook', 'Hook'], ['arp', 'Arp'], ['chop', 'Vocal chop'], ['seq', 'Sequence'], ['riff', 'Riff'], ['none', 'Off']], role, 'data-role')}
      <button class="btn" data-newmel title="Same role, new notes (keeps melodies you wrote)">New melody</button></div>
    <label class="dk-field col"><span class="lbl">${esc(f.S.name || f.S.type)} melody — ${authored ? '<b>written</b> (yours)' : gen ? 'generated · edit to take over' : 'no lead notes in this section yet — write some'}</span>
      <textarea class="dk-mel" spellcheck="false" rows="4" aria-label="Melody text">${esc(DOCK.melDirty && DOCK.melText != null ? DOCK.melText : gen)}</textarea></label>
    <div class="dk-tools"><button class="btn" data-meluse>Use this melody</button>${authored ? '<button class="btn" data-melgen>Back to generated</button>' : ''}<button class="btn" data-meloct="12">Octave up</button><button class="btn" data-meloct="-12">Octave down</button><span class="dk-melerr"></span></div>
    <p class="dk-legend">16 tokens per bar, bars split by <b>|</b>: a note (<b>C5</b>, <b>F#4</b>, <b>Bb4</b>), <b>-</b> hold, <b>.</b> rest, <b>!</b> accent, <b>~</b> slide, <b>E5:6</b> explicit length. Bars cycle over the section. Key: ${esc(names[f.s.meta.key])} ${esc(f.s.meta.mode)} — ${esc(MODES[f.s.meta.mode].map((x) => names[(f.s.meta.key + x) % 12]).join(' '))}.</p></div>
    <div class="dk-side"><h4>Lead sound</h4>${hasLead ? presetSelect('lead') + modelSelect('lead') : '<span class="dk-legend">This genre has no lead. Pick a role or write a melody and one is added.</span>'}</div></div>`;
  if (hasLead) { knobRow($('.dk-side', body), 'lead', synParams(P_LEAD)); wireModel(body); }
  const ta = $('.dk-mel', body), err = $('.dk-melerr', body), check = () => { const p = parseMelody(ta.value); err.textContent = p.errors.length ? '✗ ' + p.errors[0] : `✓ ${p.bars.length} bar${p.bars.length > 1 ? 's' : ''}`; err.className = 'dk-melerr ' + (p.errors.length ? 'bad' : 'ok'); return p; };
  ta.oninput = () => { DOCK.melDirty = true; DOCK.melText = ta.value; check(); }; check();
  $$('[data-role]', body).forEach((b) => b.onclick = () => edit((s) => { s.lead = Object.assign({}, s.lead, { role: b.dataset.role }); delete s.lead.rhythm; if (b.dataset.role !== 'hook') delete s.lead.range; }));
  $('[data-newmel]', body).onclick = () => edit((s) => { s.melodySeed = (Math.random() * 2 ** 31) >>> 0; DOCK.melDirty = false; });
  $('[data-meluse]', body).onclick = () => { const p = check(); if (p.errors.length) return; DOCK.melDirty = false; edit((s) => { s.form[f.si].melody = ta.value.trim().replace(/\s+/g, ' '); }); };
  const mg = $('[data-melgen]', body); if (mg) mg.onclick = () => { DOCK.melDirty = false; edit((s) => { delete s.form[f.si].melody; }); };
  $$('[data-meloct]', body).forEach((b) => b.onclick = () => { const p = check(); if (p.errors.length) return; ta.value = transposeMelody(ta.value, +b.dataset.meloct, names); DOCK.melDirty = true; DOCK.melText = ta.value; check(); }); }

// ---------------------------------------------------------------- SOUND
// ---------------------------------------------------------------- CHORDS / STABS (v7.1): everything about the chord part in one
// place — what it plays (stabs / held / gate / off), its rhythm (grid + a library of the styles' classic stab rhythms), its shape
// (length, density, register, notes per chord), its sound (presets + the live knobs) and its space (echo and room sends, live).
const STAB_RHYTHMS = [['Offbeat', '..x...x...x...x.'], ['Skank', '..x..x....x..x..'], ['3-3-2', 'x..x..x.x..x..x.'], ['Push', 'x......x..x.....'], ['Dub', '..x.......x.....'], ['Detroit', 'x..x..x...x..x..'],
  ['Garage', 'x..x...x..x..x..'], ['Stutter', 'x.x...x.x.....x.'], ['Sparse', 'x...............'], ['Sixteenths', 'x.xxx.xx.x.xx.x.'], ['Answer', '........x..x..x.'], ['Clave', 'x..x..x...x.x...']];
const REGISTERS = [['low', 'Low', [48, 67]], ['mid', 'Mid', [55, 74]], ['high', 'High', [62, 81]]];
const P_STABLIVE = ['cut', 'res', 'envAmt', 'aDec', 'aSus', 'aRel', 'gain'], P_PADLIVE = ['cut', 'res', 'aAtk', 'aSus', 'aRel', 'width', 'gain']; // a pad: brightness, swell, body, tail, stereo width
function renderChords(body, f) { const sp = f.D.spec, ch = sp.chords || {}, role = ch.role || 'none', G = GENRE_BY_ID[sp.genre], hasKit = !!f.s.kits.chords, live = f.D.chordLive || (f.D.chordLive = { echo: 0, verb: 0 });
  const hasPad = !!f.s.kits.pad && padUsed(f.s), rng = ch.range || [55, 74], reg = (REGISTERS.find((r) => r[2][0] === rng[0]) || [''])[0], field = role === 'gate' ? 'gate' : 'rhythm';
  body.innerHTML = `<div class="dk-split"><div class="dk-main">
    <div class="dk-tools"><span class="lbl">Plays</span>${seg('Chord role', [['stab', 'Stabs'], ['pad', 'Held chords'], ['gate', 'Gate'], ['none', 'Off']], role, 'data-crole')}<button class="btn" data-cnew title="New voicings and rhythm variation for the chords — everything else stays">New chords</button></div>
    ${role === 'stab' || role === 'gate' ? `<div class="dk-tools wrap"><span class="lbl">Rhythm</span><div class="dk-chips">${STAB_RHYTHMS.map(([n, r]) => `<button class="dk-chip" data-crh="${r}" title="${r}">${n}</button>`).join('')}</div></div>${chordRhythmHtml(f)}` : `<p class="dk-legend">${role === 'pad' ? 'Held chords: one chord per harmonic step, voiced smoothly. Switch to Stabs or Gate to play a rhythm.' : 'The chord part is off in this track.'}</p>`}
    <div class="dk-tools wrap"><span class="lbl">Length</span>${seg('Length', [[0.5, '1/32'], [1, '1/16'], [1.5, '3/32'], [2, '1/8'], [3, '3/16'], [4, '1/4']], ch.len || (G.chords && G.chords.len) || 1, 'data-clen')}
      <span class="lbl">Density</span>${seg('Density', [[0, 'Every bar'], [0.5, 'Every 2nd'], [0.75, 'Every 4th']], ch.sparse || 0, 'data-csp')}</div>
    <div class="dk-tools wrap"><span class="lbl">Register</span>${seg('Register', REGISTERS.map(([k, l]) => [k, l]), reg, 'data-creg')}<span class="lbl">Notes</span>${seg('Notes per chord', [[3, '3'], [4, '4'], [5, '5']], ch.voices || (role === 'stab' ? 4 : 5), 'data-cvo')}</div>
    <p class="dk-legend">Rhythm, length, density, register and notes apply on the next bar. The knobs on the right act at once.</p>
    ${hasKit ? presetGrid('chords', sp.genre) : ''}
    ${hasPad ? `<h4 class="dk-padh">Pad — the held chord bed under the stabs</h4><div class="dk-tools"><span class="lbl">Pad</span>${seg('Pad on/off', [['on', 'On'], ['off', 'Off']], f.D.mute[6] ? 'off' : 'on', 'data-padon')}</div>${presetGrid('pad', sp.genre)}<div class="dk-padknobs"></div>` : ''}</div>
    <div class="dk-side"><h4>Stab sound — live</h4><div class="dk-stabknobs"></div><h4>Space — live</h4><div class="dk-stabfx"></div>
      <span class="dk-legend">Echo throws the chords into the harmonic echo (its repeats climb in key); Room sends them to the reverb. Both stay until you turn them back.</span></div></div>`;
  const sk = $('.dk-stabknobs', body); if (sk && hasKit) knobRow(sk, 'chords', synParams(role === 'pad' ? P_PADLIVE : P_STABLIVE));
  const fx = $('.dk-stabfx', body); dknob(fx, { label: 'Echo', min: 0, max: 1, value: live.echo, def: 0, onchange: (v) => { live.echo = v; send({ type: 'partfx', deck: DOCK.deck, ch: 5, echo: v > 0.005 ? v : -1 }); } });
  dknob(fx, { label: 'Room', min: 0, max: 1, value: live.verb, def: 0, onchange: (v) => { live.verb = v; send({ type: 'partfx', deck: DOCK.deck, ch: 5, verb: v }); } });
  if (hasKit) wirePresetGrid(body, 'chords', $$('.dk-pgrid', body)[0]); wireChordRhythm(body, f);
  if (hasPad) { wirePresetGrid(body, 'pad', $$('.dk-pgrid', body)[hasKit ? 1 : 0]); knobRow($('.dk-padknobs', body), 'pad', synParams(P_PADLIVE));
    dknob(fx, { label: 'Pad echo', min: 0, max: 1, value: live.pecho || 0, def: 0, onchange: (v) => { live.pecho = v; send({ type: 'partfx', deck: DOCK.deck, ch: 6, echo: v > 0.005 ? v : -1 }); } });
    dknob(fx, { label: 'Pad room', min: 0, max: 1, value: live.pverb || 0, def: 0, onchange: (v) => { live.pverb = v; send({ type: 'partfx', deck: DOCK.deck, ch: 6, verb: v }); } });
    $$('[data-padon]', body).forEach((b) => b.onclick = () => { setMute(DOCK.deck, 6, b.dataset.padon === 'off'); renderDock(); }); }
  { const nb = $('[data-cnew]', body); if (nb) nb.onclick = () => regenPart(DOCK.deck, 'chords'); }
  $$('[data-crole]', body).forEach((b) => b.onclick = () => edit((s) => { s.chords = s.chords || {}; const r = b.dataset.crole; s.chords.role = r; if (r === 'stab' && !s.chords.rhythm) { s.chords.rhythm = ['..x...x...x...x.']; delete s.chords.gate; } if (r === 'gate') { delete s.chords.rhythm; if (!s.chords.gate) s.chords.gate = ['x.xx.xx.x.xx.xx.']; } if (r === 'pad' || r === 'none') { delete s.chords.rhythm; delete s.chords.gate; } }, 1, true));
  $$('[data-crh]', body).forEach((b) => b.onclick = () => edit((s) => { s.chords = s.chords || {}; const r = b.dataset.crh; s.chords[field] = [r, r]; }, 1, true));
  $$('[data-clen]', body).forEach((b) => b.onclick = () => edit((s) => { s.chords.len = +b.dataset.clen; }, 1, true));
  $$('[data-csp]', body).forEach((b) => b.onclick = () => edit((s) => { if (+b.dataset.csp) s.chords.sparse = +b.dataset.csp; else delete s.chords.sparse; }, 1, true));
  $$('[data-creg]', body).forEach((b) => b.onclick = () => edit((s) => { s.chords.range = (REGISTERS.find((r) => r[0] === b.dataset.creg) || REGISTERS[1])[2].slice(); }, 1, true));
  $$('[data-cvo]', body).forEach((b) => b.onclick = () => edit((s) => { s.chords.voices = +b.dataset.cvo; }, 1, true)); }
// the sound browser: every preset of the slot as a card — the genre's palette first (★), then everything else. A card applies on
// the next bar, level-matched in context. The wavetable model gets its own controls (table, motion, unison, filter type).
const P_WT = [['pos', 'Position', 0, 1], ['posEnv', 'Pos env', 0, 1], ['posLfo', 'Pos LFO', 0, 1], ['l2Sync', 'Motion beats', 0.25, 32, 'log', 'beat'], ['uni', 'Unison', 1, 7], ['spread', 'Spread', 0, 1], ['fold', 'Fold', 0, 1], ['sub', 'Sub', 0, 1], ['noiseAmt', 'Breath', 0, 0.3], ['vow', 'Vowel', 0, 4], ['vowLfo', 'Vowel LFO', 0, 2]];
const WT_FILTERS = [[0, 'Ladder'], [1, 'Band'], [2, 'High'], [3, 'Vowel'], [4, 'Comb']];
function padUsed(s) { const ev = s.ev; for (let k = 0; k < ev.n; k++) if (ev.ch[k] === 6) return true; return false; }
function presetGrid(slot, gid) { const bank = SOUND_BANK[slot]; if (!bank) return ''; const D = decks[DOCK.deck], cur = D.spec && D.spec.sound && D.spec.sound[slot] && D.spec.sound[slot].preset || '', pal = (paletteFor(gid)[slot] || []);
  const card = (k) => { const p = bank[k], short = (p.d.split(' — ')[1] || p.d).slice(0, 60), tg = p.tags || [], md = p.k && p.k.model; return `<button class="dk-pcard${k === cur ? ' on' : ''}${pal.includes(k) ? ' fit' : ''}" data-pset="${k}" data-tags="${esc(tg.join(' ') + (pal.includes(k) ? ' fits' : '') + (p.v94 ? ' new' : ''))}" title="${esc(p.d)}"><b>${pal.includes(k) ? '★ ' : ''}${esc(p.label)}</b><small>${esc(short)}</small>${md === 'wt' ? '<i>wavetable</i>' : X_LABEL[md] ? `<i>${esc(X_LABEL[md])}</i>` : ''}${tg.length ? `<em>${esc(tg.slice(0, 3).join(' · '))}</em>` : ''}</button>`; };
  const rest = Object.keys(bank).filter((k) => !pal.includes(k)), cnt = {}; for (const k of Object.keys(bank)) for (const t of bank[k].tags || []) cnt[t] = (cnt[t] || 0) + 1;
  const tags = Object.keys(cnt).sort((x, y) => cnt[y] - cnt[x]).slice(0, 14), f = (DOCK.tagF || {})[slot] || ''; /* (v9.4) the sound browser: filter the bank by character */
  const chips = `<div class="dk-tagf" role="group" aria-label="Filter the ${slot} sounds by character"><button data-tagf="" class="${f ? '' : 'on'}">All ${Object.keys(bank).length}</button>${pal.length ? `<button data-tagf="fits" class="${f === 'fits' ? 'on' : ''}">★ fits this genre</button>` : ''}<button data-tagf="new" class="${f === 'new' ? 'on' : ''}">new in 9.4</button>${tags.map((t) => `<button data-tagf="${esc(t)}" class="${f === t ? 'on' : ''}">${esc(t)}</button>`).join('')}</div>`;
  return `${chips}<div class="dk-pgrid" data-slot="${slot}"><button class="dk-pcard${cur ? '' : ' on'}" data-pset="" data-tags="all"><b>Genre sound</b><small>the genre's own ${slot}</small></button>${pal.map(card).join('')}${rest.map(card).join('')}</div>`; }
function filterPresetGrid(body, slot) { const f = (DOCK.tagF || {})[slot] || ''; $$('.dk-pgrid [data-pset]', body).forEach((c) => { c.hidden = !!f && c.dataset.pset !== '' && !(c.dataset.tags || '').split(' ').includes(f); });
  $$('[data-tagf]', body).forEach((b) => { b.classList.toggle('on', b.dataset.tagf === f); b.onclick = () => { (DOCK.tagF || (DOCK.tagF = {}))[slot] = b.dataset.tagf; filterPresetGrid(body, slot); }; }); }
function wirePresetGrid(body, slot, grid) { $$('[data-pset]', grid || body).forEach((b) => b.onclick = () => { const val = b.dataset.pset; tastePreset(slot, val); edit((s) => { if (!val) { if (s.sound) delete s.sound[slot]; } else (s.sound || (s.sound = {}))[slot] = { preset: val }; if (s.sound && !Object.keys(s.sound).length) delete s.sound; }, 1, true);
    toast(val ? `${slot}: ${SOUND_BANK[slot][val].label} from the next bar — ${SOUND_BANK[slot][val].d}` : `${slot}: back to the genre sound`); }); }
function renderSound(body, f, only) {
  const slots = slotsOf(f.s).filter((x) => !only || only.includes(x)); if (!slots.length) { body.innerHTML = '<div class="dk-empty">This genre has no sound for this part.</div>'; return; } if (!slots.includes(DOCK.slot)) DOCK.slot = slots.includes('chords') ? 'chords' : slots[0]; const slot = DOCK.slot, drum = !!P_DRUM[slot];
  const edited = f.D.spec.sound ? Object.keys(f.D.spec.sound) : [];
  body.innerHTML = `<div class="dk-tools"><div class="dk-chips">${slots.map((x) => `<button class="dk-chip${x === slot ? ' on' : ''}${edited.includes(x) ? ' live' : ''}" data-slot="${x}" title="${edited.includes(x) ? 'edited' : ''}">${x}</button>`).join('')}</div>
    ${drum ? '' : modelSelect(slot)}${REG_PARTS[slot] ? `<span class="lbl" title="${esc(REG_TIP)}">Octave</span>${seg('Octave', [[-2, '−2'], [-1, '−1'], [0, '0'], [1, '+1'], [2, '+2']], kitVal(slot, 'oct') || 0, 'data-oct')}` : ''}<button class="btn" data-reset ${edited.includes(slot) ? '' : 'disabled'}>Reset ${slot} to the genre sound</button></div>${presetGrid(slot, f.s.meta.gid)}<div class="dk-soundknobs"></div>${drum ? '' : xCharacter(slot)}${!drum && kitVal(slot, 'model') === 'wt' ? `<div class="dk-wt"><span class="lbl">Table</span>${seg('Table', WT_NAMES.map((n, k) => [k, n]), kitVal(slot, 'table') || 0, 'data-wtt')}<span class="lbl">Filter</span>${seg('Filter type', WT_FILTERS, kitVal(slot, 'ftype') || 0, 'data-wtf')}</div><div class="dk-wtknobs"></div>` : ''}
    <p class="dk-legend">Knobs act instantly on the playing deck — sounding notes morph with them — and are saved into the score (<b>sound.${slot}</b>). Drag up/down · Shift for fine · double-click resets · arrow keys.</p>`;
  // (v9.3) a snare / hats / percussion part that plays the kit family is shaped by its Tune / Decay / Tone / Snap (the kit, above): the
  // synthesized voice's knobs would do nothing there, so they appear only for the synth voice (Synth (9.2), or a sound picked below)
  const fam = (f.D.spec.sound && f.D.spec.sound.drums && f.D.spec.sound.drums.family) || BANK_FOR_GENRE[f.D.gid] || 'forge', famOn = drum && slot !== 'kick' && fam !== 'forge' && !(f.D.spec.sound && f.D.spec.sound[slot] && f.D.spec.sound[slot].preset);
  if (drum) drumVoicePanel($('.dk-soundknobs', body), slot, slot === 'kick' ? P_DRUM.kick.concat(DR_KICK_MORE) : P_DRUM[slot], famOn ? `The ${slot} plays the ${fam}-style kit: the six knobs above shape it. Pick a sound below to play a synthesized ${slot} instead (then its own knobs appear here).` : '');
  else knobRow($('.dk-soundknobs', body), slot, P_SYN);
  wireModel(body); wirePresetGrid(body, slot); filterPresetGrid(body, slot);
  const xk = $('.dk-xknobs', body); if (xk) { knobRow(xk, slot, xKnobs(slot)); $$('[data-xk]', body).forEach((b) => b.onclick = () => { liveKit(slot, b.dataset.xk, +b.dataset.xv); renderDock(); }); }
  const wk = $('.dk-wtknobs', body); if (wk) { knobRow(wk, slot, P_WT); $$('[data-wtt]', body).forEach((b) => b.onclick = () => { liveKit(slot, 'table', +b.dataset.wtt); renderDock(); }); $$('[data-wtf]', body).forEach((b) => b.onclick = () => { liveKit(slot, 'ftype', +b.dataset.wtf); renderDock(); }); }
  $$('[data-slot]', body).forEach((b) => b.onclick = () => { DOCK.slot = b.dataset.slot; renderDock(); });
  $$('[data-oct]', body).forEach((b) => b.onclick = () => { liveKit(slot, 'oct', +b.dataset.oct); renderDock(); });
  $('[data-reset]', body).onclick = () => edit((s) => { delete s.sound[slot]; if (!Object.keys(s.sound).length) delete s.sound; }, 1, true); }

// ---------------------------------------------------------------- (v9.3) DRUMS · SOUND: the kit family and its voices
// The family (808-style … acoustic, lo-fi, or the 9.2 synth) for the whole kit, then Tune / Decay / Tone / Snap for the snare, the
// hats and the percussion, and a sample of your own for any voice (kept in this browser; it plays on both decks until removed).
function renderKitFamily(body, f) { const sp = f.D.spec, cur = sp.sound && sp.sound.drums && sp.sound.drums.family || '', el = document.createElement('div'); el.className = 'dk-kitfam';
  el.innerHTML = `<h4>Kit</h4><div class="dk-tools wrap">${seg('Kit family', KIT_FAMS, cur, 'data-kfam')}</div><div class="dk-knobs dk-bankknobs"></div>
    <h4>Your own samples</h4><div class="dk-tools wrap dk-samples">${USER_VOICES.map(([k, l]) => `<label class="dk-samp${USER_SAMPLES[k] ? ' on' : ''}"><span>${l}</span><input type="file" accept="audio/wav,audio/x-wav,audio/mpeg,audio/ogg,.wav,.mp3,.ogg" data-samp="${k}" aria-label="${l}: load a sample"><button class="btn" data-sampx="${k}" ${USER_SAMPLES[k] ? '' : 'disabled'} aria-label="${l}: remove the sample">✕</button></label>`).join('')}</div>
    <p class="dk-legend">The families are DJ TiTo's own models of classic machines — no samples of them. A sample you load replaces that voice in every track until you remove it.</p>`;
  body.insertBefore(el, body.firstChild);
  $$('[data-kfam]', el).forEach((b) => b.onclick = () => { const v = b.dataset.kfam; edit((s) => { s.sound = s.sound || {}; s.sound.drums = Object.assign({}, s.sound.drums); if (v) s.sound.drums.family = v; else delete s.sound.drums.family; if (!Object.keys(s.sound.drums).length) delete s.sound.drums; }, 1, true); send({ type: 'kit', deck: DOCK.deck, slot: 'drums', p: { family: v || BANK_FOR_GENRE[f.D.gid] || 'forge' } }); });
  const kb = $('.dk-bankknobs', el); kb.outerHTML = '<p class="dk-legend">Tune, Decay, Tone, Snap, Drive and Level for every drum — the same six on any family, a synthesized voice or your own sample — are on Drums · Pattern.</p>'; /* (v9.5: the family's own four knobs became the six every drum has) */
  $$('[data-samp]', el).forEach((inp) => inp.onchange = async () => { const file = inp.files && inp.files[0]; if (!file) return; await startAudio(); try { await loadUserSample(inp.dataset.samp, file); toast(`${file.name} plays as the ${inp.dataset.samp}`); renderDock(); } catch (e) { toast(`That file could not be read as audio (${e.message})`); } });
  $$('[data-sampx]', el).forEach((b) => b.onclick = () => { removeUserSample(b.dataset.sampx); renderDock(); }); }
// ---------------------------------------------------------------- (v9.3) DRUMS · PATTERN: the live groove
function renderGroove(body, f) { const D = f.D, G = D.groove || (D.groove = { density: 0.5, complexity: 0.5 }), el = document.createElement('div'); el.className = 'dk-tools wrap dk-groove';
  el.innerHTML = `<span class="lbl">Groove</span><label class="dk-field"><span class="lbl">Density</span><input type="range" min="0" max="1" step="0.01" value="${G.density}" data-gden aria-label="Density: fewer ghost notes ↔ more hat ratchets"></label>
    <label class="dk-field"><span class="lbl">Complexity</span><input type="range" min="0" max="1" step="0.05" value="${G.complexity}" data-gcx aria-label="Complexity: how far the drums stray from the written bar"></label><button class="btn" data-gnew>Redraw with this complexity</button>`;
  const main = $('.dk-main', body) || body; main.appendChild(el);
  $('[data-gden]', el).oninput = (e) => { G.density = +e.target.value; send({ type: 'groove', deck: DOCK.deck, density: G.density }); };
  $('[data-gcx]', el).onchange = (e) => { G.complexity = +e.target.value; };
  $('[data-gnew]', el).onclick = () => regenPart(DOCK.deck, 'drums', undefined, { complexity: G.complexity }); }
// ---------------------------------------------------------------- (v9.3) A PART'S MIX: level, Delay and Reverb sends (tails ring on)
function renderPartMix(body, f, slots) { const D = f.D, M = D.partMix || (D.partMix = {}), used = slots.filter((x) => slotsOf(f.s).includes(x));
  body.innerHTML = `<div class="dk-partmix">${used.map((x) => `<div class="dk-pm" data-pm="${x}"><h4>${x}</h4><div class="dk-knobs"></div><button class="btn" data-pmfx="${x}">Beat FX on the ${x} →</button></div>`).join('') || '<div class="dk-empty">This genre does not play this part.</div>'}
    <p class="dk-legend">Delay sends the part into the deck's tempo echo, Reverb into the room — both keep ringing after you turn them down. Mute a part with its button on the deck (PLAY).</p></div>`;
  for (const x of used) { const c = SLOT_CH[x], st = M[x] || (M[x] = { level: 1, echo: 0, verb: 0 }), box = $(`[data-pm="${x}"] .dk-knobs`, body);
    dknob(box, { label: 'Level', min: 0, max: 1.5, value: st.level, def: 1, onchange: (v) => { st.level = v; st.touched = true; send({ type: 'partGain', deck: DOCK.deck, ch: c, v }); clearTimeout(st.tl); st.tl = setTimeout(() => tastePartLevel(x, v), 700); } });
    dknob(box, { label: 'Delay', min: 0, max: 1, value: st.echo, def: 0, onchange: (v) => { st.echo = v; send({ type: 'partfx', deck: DOCK.deck, ch: c, echo: v > 0.005 ? v : -1 }); } });
    dknob(box, { label: 'Reverb', min: 0, max: 1, value: st.verb, def: 0, onchange: (v) => { st.verb = v; send({ type: 'partfx', deck: DOCK.deck, ch: c, verb: v }); } }); }
  $$('[data-pmfx]', body).forEach((b) => b.onclick = () => { const i = DOCK.deck; SHELL.fxDeck = i; bfxTarget(i, SLOT_CH[b.dataset.pmfx]); go('fx'); }); }
// ---------------------------------------------------------------- FX
let space = { t60: 2.4, damp: 0.4 };
function renderFx(body, f) {
  const m = f.D.spec.mix, D = f.D; if (!D.fxOn) { D.fxOn = new Array(FX_RACK.length).fill(0); D.fxAmt = FX_RACK_DEF.slice(); }
  body.innerHTML = `<div class="dk-split"><div class="dk-main"><h4>FX rack — on the whole deck, tempo-synced</h4>
    <div class="dk-rack">${FX_RACK.map(([k, l, d], n) => `<div class="dk-fxu${D.fxOn[n] ? ' on' : ''}" data-fxu="${n}"><button data-fxt="${n}" aria-pressed="${!!D.fxOn[n]}" title="${esc(d)} · click toggles, hold Shift for momentary">${l}</button><small>${esc(d)}</small></div>`).join('')}</div>
    <h4>Performance — fires now, on the playing deck</h4>
    <div class="dk-pads">${FX_PADS.map(([l, k, st, ear], n) => `<button class="dk-pad" data-fx="${n}">${l}<small>${ear != null ? 'in key' : st / 16 >= 1 ? st / 16 + ' bar' + (st > 16 ? 's' : '') : st / 4 + ' beats'}</small></button>`).join('')}
      <button class="dk-pad throw" data-throw="8">Echo throw<small>½ bar</small></button><button class="dk-pad throw" data-throw="16">Echo throw<small>1 bar</small></button></div>
    <p class="dk-legend">Echo throw sends the music bus (chords, pad, lead, arp) into the tempo-synced delay and reverb, the classic DJ move before a cut or a mix-out. The composed arrangement already places risers, impacts and downlifters; these are yours on top.</p></div>
    <div class="dk-side"><h4>Deck sends</h4><div class="dk-knobs sends"></div><h4>Master space</h4><div class="dk-knobs room"></div><span class="dk-legend">Room is shared by both decks.</span></div></div>`;
  const sends = $('.sends', body), mixKnob = (label, key, eng, mn, mx) => dknob(sends, { label, min: mn, max: mx, value: m[key], def: m[key], onchange: (v) => { send({ type: 'sends', deck: DOCK.deck, p: { [eng]: v } }); f.D.spec.mix[key] = +v.toFixed(3); } });
  if (m.echo == null) m.echo = 1; mixKnob('Reverb', 'verb', 'verb', 0, 1); mixKnob('Delay', 'delay', 'delay', 0, 1); mixKnob('Harm echo', 'echo', 'echo', 0, 2); mixKnob('Pump', 'sidechain', 'sc', 0, 0.9);
  // channel character: Heat = saturation on every strip (bass in parallel), Punch = transient shapers on the drums — live
  { const G0 = GENRE_BY_ID[f.D.gid] || { mix: {} }; if (m.heat == null) m.heat = G0.mix.heat != null ? G0.mix.heat : 1; if (m.punch == null) m.punch = G0.mix.punch != null ? G0.mix.punch : 1; }
  mixKnob('Heat', 'heat', 'heat', 0, 2); mixKnob('Punch', 'punch', 'punch', 0, 2);
  const room = $('.room', body); dknob(room, { label: 'Size', min: 0.6, max: 6, curve: 'log', unit: 's', value: space.t60, def: 2.4, onchange: (v) => { space.t60 = v; send({ type: 'space', t60: v, damp: space.damp }); } });
  dknob(room, { label: 'Damp', min: 0, max: 0.9, value: space.damp, def: 0.4, onchange: (v) => { space.damp = v; send({ type: 'space', t60: space.t60, damp: v }); } });
  $$('[data-fxu]', body).forEach((u) => { const n = +u.dataset.fxu; dknob(u, { label: 'Amount', min: 0, max: 1, value: D.fxAmt[n], def: FX_RACK_DEF[n], onchange: (v) => { D.fxAmt[n] = v; send({ type: 'fx', deck: DOCK.deck, name: FX_RACK[n][0], amt: v }); } }); });
  $$('[data-fxt]', body).forEach((b) => { const n = +b.dataset.fxt, setOn = (on) => { D.fxOn[n] = on ? 1 : 0; send({ type: 'fx', deck: DOCK.deck, name: FX_RACK[n][0], on: !!on, amt: D.fxAmt[n] }); b.closest('.dk-fxu').classList.toggle('on', !!on); b.setAttribute('aria-pressed', !!on); };
    b.onpointerdown = (e) => { if (e.shiftKey) { setOn(1); const off = () => { setOn(0); document.removeEventListener('pointerup', off, true); document.removeEventListener('pointercancel', off, true); }; document.addEventListener('pointerup', off, true); document.addEventListener('pointercancel', off, true); } }; // (the release is caught by the page: it reaches this hold even if the button was redrawn)
    b.onclick = (e) => { if (!e.shiftKey) setOn(!D.fxOn[n]); }; fxSetters[DOCK.deck][n] = setOn; });
  $$('[data-fx]', body).forEach((b) => b.onclick = async () => { await startAudio(); const [, k, st, ear] = FX_PADS[+b.dataset.fx]; if (ear != null) earCandy(DOCK.deck, ear); else send({ type: 'fxNow', deck: DOCK.deck, kind: k, steps: st }); flash(b); });
  $$('[data-throw]', body).forEach((b) => b.onclick = () => { send({ type: 'throw', deck: DOCK.deck, steps: +b.dataset.throw }); flash(b); }); }
function flash(b) { b.classList.remove('hit'); void b.offsetWidth; b.classList.add('hit'); }

// ---------------------------------------------------------------- SCORE (the text form, for people and AI models)
function renderScoreTab(body, f) {
  const D = decks[DOCK.deck]; const txt = DOCK.scoreDirty && DOCK.scoreText != null ? DOCK.scoreText : D.spec ? JSON.stringify(D.spec, null, 1) : '';
  body.innerHTML = `<div class="dk-split wide"><div class="dk-main"><textarea class="dk-json" spellcheck="false" aria-label="Score JSON">${esc(txt)}</textarea>
    <div class="dk-tools"><button class="btn" data-sc="check">Check</button><button class="btn primary" data-sc="apply">Apply on the next 4 bars</button><button class="btn" data-sc="load">Load as a new track</button><button class="btn" data-sc="copy">Copy score</button><button class="btn" data-sc="prompt" title="The FORGE score guide + this score — paste into any AI model and ask for a song">Copy AI prompt</button><button class="btn" data-sc="revert" title="Back to what the deck is playing">Revert</button></div></div>
    <div class="dk-side"><h4>Songs</h4><div class="dk-songs">${SONGS.map((s, k) => `<button class="dk-song" data-song="${k}"><b>${esc(s.title)}</b><small>${esc(GENRE_BY_ID[s.genre].name)} · ${s.key} ${s.mode} · ${s.bpm}</small></button>`).join('')}</div><h4>Checks</h4><div class="dk-checks"></div></div></div>`;
  const ta = $('.dk-json', body); ta.oninput = () => { DOCK.scoreDirty = true; DOCK.scoreText = ta.value; };
  const parse = () => { try { return JSON.parse(ta.value); } catch (e) { showChecks({ ok: false, errors: [{ path: '', msg: 'not valid JSON: ' + e.message, hint: 'check commas and quotes' }], warnings: [] }); return null; } };
  const loadSpec = async (spec, i) => { let s; try { s = await compileAsync(spec, { fastLevels: true }); } catch (e) { showChecks(e.validation || { ok: false, errors: [{ path: '', msg: e.message }], warnings: [] }); return; } startAudio().then(() => { const t = loadTarget(i); if (t < 0) { toast(onAirMsg(i)); return; } if (t !== i) toast(`Deck ${'AB'[i]} is on air — the score loads on deck ${'AB'[t]}`); installScore(t, s, { play: !decks[t ^ 1].playing }); DOCK.tab = 'score'; renderDock(); }); }; // (v9.2: through the load policy — it replaced the only playing deck)
  $$('[data-sc]', body).forEach((b) => b.onclick = () => { const a = b.dataset.sc;
    if (a === 'copy') { copyText(ta.value, 'Score copied'); return; }
    if (a === 'prompt') { copyText(PROMPT_CARD + '\n\n## The current score (edit it, or write a new one)\n```json\n' + ta.value + '\n```\n', 'AI prompt copied — paste it into any model, then ask for the song you want'); return; }
    if (a === 'revert') { DOCK.scoreDirty = false; renderDock(); return; }
    // (v9.2) the check compiles on the composer thread: compiled here it froze the page for up to 2.7 s on a phone (Android: time taken from the audio engine's worker)
    const spec = parse(); if (!spec) return; const v = validateSpec(spec); showChecks(v, []); if (!v.ok) return;
    if (a === 'check') { compileAsync(JSON.parse(JSON.stringify(spec)), { fastLevels: true }).then((sc) => showChecks(v, lintScore(sc)), (e) => showChecks(e.validation || { ok: false, errors: [{ path: '', msg: e.message }], warnings: [] }, [])); return; }
    if (a === 'load' || !D.spec || spec.genre !== D.spec.genre && !D.playing) { loadSpec(spec, DOCK.deck); return; }
    D.spec = spec; DOCK.scoreDirty = false; commitSpec(DOCK.deck, { q: 4 }).then((s) => { if (s) toast('Score applied on the next 4-bar line'); }); });
  $$('[data-song]', body).forEach((b) => b.onclick = () => { const spec = JSON.parse(JSON.stringify(SONGS[+b.dataset.song])); const i = DOCK.deck, D2 = decks[i];
    loadSpec(spec, i); });
  renderChecks(); }
function renderChecks() { const D = decks[DOCK.deck]; if (!$('.dk-checks')) return; showChecks(D.val || { ok: true, errors: [], warnings: [] }, D.lint || []); }
function showChecks(v, lint) { const el = $('.dk-checks'); if (!el) return; const items = [];
  for (const e of v.errors) items.push(`<li class="bad"><b>${esc(e.path || '(root)')}</b> ${esc(e.msg)}${e.hint ? `<small>fix: ${esc(e.hint)}</small>` : ''}</li>`);
  for (const w of v.warnings) items.push(`<li class="warn"><b>${esc(w.path || '(root)')}</b> ${esc(w.msg)}${w.hint ? `<small>${esc(w.hint)}</small>` : ''}</li>`);
  for (const w of lint || []) items.push(`<li class="warn"><b>${esc(w.path)}</b> ${esc(w.msg)}<small>${esc(w.hint)}</small></li>`);
  el.innerHTML = items.length ? `<ul>${items.join('')}</ul>` : '<p class="dk-legend ok">✓ valid · no musical warnings</p>'; }
function copyText(t, msg) { const done = () => toast(msg); if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, () => fallbackCopy(t, done)); else fallbackCopy(t, done); }
function fallbackCopy(t, done) { const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Copy blocked by the browser — select the text and copy it'); } ta.remove(); }

// ---------------------------------------------------------------- per frame: playhead + context, cheap
function dockFrame() { const el = $('#dock'); if (!el) return; const f = focus();
  // (v9.2) not while a finger or the mouse is down — a knob being dragged or an FX held (it was rebuilt under the pointer: the knob
  // died mid-drag, a held Tape stop never got its release); the re-render runs when the pointer lets go
  if (f && f.si !== DOCK.lastSec && DOCK.secPin < 0) { const typing = document.activeElement && /TEXTAREA|INPUT|SELECT/.test(document.activeElement.tagName) && el.contains(document.activeElement); if (!typing && !DOCK.melDirty) { if (PTR.size) DOCK.renderLater = true; else { DOCK.renderLater = false; DOCK.dpat = DOCK.bpat = null; renderDock(); return; } } }
  const now = $('.dk-now', el); if (!f) { setText(now, ''); return; }
  const live = f.D.playing && f.liveBar >= f.S.bar0 && f.liveBar < f.S.bar0 + f.S.bars; setText(now, live ? `bar ${f.liveBar - f.S.bar0 + 1}/${f.S.bars}` : f.D.playing ? 'pinned' : 'stopped');
  const step = live ? Math.floor(f.step) : -1; if (step === DOCK.lastStep) return; DOCK.lastStep = step;
  const pat = DOCK.tab === 'drums' ? f.s.pat.drums[f.liveBar] : DOCK.tab === 'bass' ? f.s.pat.bass[f.liveBar] : -2; if (pat === -2) return;
  const names = Object.keys(DOCK.tab === 'drums' ? f.D.spec.drums.patterns : f.D.spec.bass.patterns), shown = DOCK.tab === 'drums' ? DOCK.dpat : DOCK.bpat, pg = DOCK.tab === 'drums' ? DOCK.dpage : DOCK.bpage;
  const barInPat = f.liveBar - f.S.bar0; $$('.dk-chip.live', el).forEach((c) => c.classList.toggle('live', false)); const lc = $(`.dk-chip[data-${DOCK.tab === 'drums' ? 'pat' : 'bp'}="${CSS.escape(names[pat] || '')}"]`, el); if (lc) lc.classList.add('live');
  $$('.dk-c.ph', el).forEach((c) => c.classList.remove('ph'));
  if (live && names[pat] === shown && (barInPat % (DOCK.nb || 1)) === pg) $$('.dk-row[data-lane] .dk-cells', el).forEach((row) => { const c = row.children[step]; if (c) c.classList.add('ph'); }); }
