// ---------------------------------------------------------------- AUTO (the deck keeps producing itself)
// Per deck, per part: Drums · Bass · Harmony · Melody · Sounds · Moves, every 8 / 16 / 32 bars. On each phrase line ONE of the
// enabled parts changes (in turn), decided a bar ahead and landing exactly on the line (the engine swaps the score in the
// block that contains the bar line). Moves happen on top, inside the phrase, the way a producer rides a track.
//   Drums / Bass / Melody — a new seed for that part only (same key, chords, form, sounds)
//   Harmony — a NEW PROGRESSION in the same key and mode, chosen to stay safe: the genre's own progressions and the mood sets
//             of that mode, rotations of the current one, the turnaround re-harmonised to its third-relative, the IV ↔ ii /
//             VI ↔ IV relatives; never the same as now; never under a written melody (that would clash with what you wrote)
//   Sounds  — a preset swap for one melodic slot from the sound bank (level-matched in context by the compiler)
//   Moves   — a filter sweep over the last 2 bars, an echo throw on the last beat, or an energy dip for the last 4 bars and
//             back on the one — timed from the deck's clock
// Replaces Evolve (one part every 32 bars, landing up to 16 bars after its phrase, and "chords" only re-drew the rhythm).
const AUTO_PARTS = [['drums', 'Drums'], ['bass', 'Bass'], ['harmony', 'Harmony'], ['lead', 'Melody'], ['sound', 'Sounds'], ['moves', 'Moves']];
function autoOf(D) { if (!D.auto) D.auto = { on: { drums: false, bass: false, harmony: false, lead: false, sound: false, moves: false }, every: 16, phrase: null, n: 0, log: [], moveAt: -1, hist: [] }; return D.auto; }
function autoAny(D) { const a = autoOf(D); return AUTO_PARTS.some(([k]) => a.on[k]); }
// (v9.2) after SAFE paused Auto, switching it on again brings back exactly the parts that were on (SAFE said "paused" and kept the
// list, but nothing ever read it)
function autoSetAll(i, on) { const a = autoOf(decks[i]), back = on && a.paused && a.paused.length ? a.paused : null; for (const [k] of AUTO_PARTS) a.on[k] = back ? back.includes(k) : on; a.paused = null; a.phrase = null; renderAuto(i); }
function autoLog(D, msg) { const a = autoOf(D); a.log.unshift(msg); a.log.length = Math.min(a.log.length, 6); renderAuto(D.i); }
// ---- the harmonic generator
function rotate(t, k) { return t.slice(k).concat(t.slice(0, k)); }
const REL = { IV: 'ii', ii: 'IV', VI: 'IV', vi: 'IV', iv: 'bVI', bVI: 'iv', bIII: 'i', III: 'vi', V: 'iii', bVII: 'v', v: 'bVII' };
function harmonyCandidates(D) { const sp = D.spec, s = D.score, mode = s.meta.mode, cur = (sp.harmony && sp.harmony.progression) || s.meta.prog, key = cur.join(' '), G = GENRE_BY_ID[D.gid];
  const minorTonic = (t) => /^i($|[^v])/.test(t[0]) || t.some((x) => /^i(\d|$|m)/.test(x)); const isMinor = !['major', 'lydian', 'mixolydian'].includes(mode);
  const out = [], add = (t, why) => { if (!t || t.length < 2) return; const k = t.join(' '); if (k !== key && !out.some((o) => o.k === k)) { const v = validateSpec({ forge: 1, genre: D.gid, harmony: { progression: t } }); if (v.ok) out.push({ t: t.slice(), k, why }); } };
  for (const p of G.harm.progs) if (minorTonic(p) === isMinor) add(p, 'genre');
  for (const m of Object.keys(MOODS)) for (const e of MOODS[m].sets) if (e.mode === mode) add(e.prog, m);
  for (let k = 1; k < cur.length; k++) add(rotate(cur, k), 'rotation');
  const base = cur.map((x) => x.replace(/(maj7|maj9|m7|7|9|add9|sus2|sus4|6|11)$/, ''));
  for (let k = 1; k < base.length; k++) { const r = REL[base[k]]; if (r) { const t = base.slice(); t[k] = r; add(t, 'relative'); } }
  if (typeof thirdSub === 'function') { const sub = thirdSub(base, mode); if (sub) add(base.slice(0, -1).concat(sub), 'turnaround'); }
  return out; }
// the new progression must CONNECT: its first chord shares tones with the chord sounding before the line (a pivot), so the
// change is heard as a turn of the same song, not a cut to another one
function autoHarmony(D, line) { if (D.spec.form && D.spec.form.some((f) => f && f.melody)) return null; const c = harmonyCandidates(D); if (!c.length) return null;
  const s = D.score, before = s.chords[Math.max(0, Math.min(s.chords.length - 1, (line != null ? line / 16 : livePos(D) / 16) - 1)) | 0], tones = new Set(before ? before.tones : []);
  const first = (t) => { const ch = parseChord(t[0]); return ch.iv.map((x) => (s.meta.key + ch.root + x) % 12); };
  const scored = c.map((k) => { const f = first(k.t); return { k, sh: f.filter((x) => tones.has(x)).length + (before && f[0] === before.root ? 1 : 0) }; }), best = Math.max(...scored.map((x) => x.sh));
  const pool = scored.filter((x) => x.sh >= Math.min(best, 2)).map((x) => x.k); const pick = pool[Math.floor(Math.random() * pool.length)]; D.spec.harmony = Object.assign({}, D.spec.harmony || {}, { progression: pick.t }); for (const f of D.spec.form || []) if (f) delete f.progression; return pick; }
// Sounds: only inside the genre's palette (a hoover never lands in a deep-house groove), level-matched like every preset
function autoSound(D) { const s = D.score, pal = paletteFor(D.gid), slots = ['chords', 'pad', 'lead', 'arp'].filter((k) => (k === 'arp' ? s.kits.hook || s.kits.arp : s.kits[k]) && pal[k] && pal[k].length); if (!slots.length) return null;
  const slot = slots[Math.floor(Math.random() * slots.length)], cur = D.spec.sound && D.spec.sound[slot] && D.spec.sound[slot].preset, names = pal[slot].filter((n) => n !== cur); if (!names.length) return null;
  if (slot === 'lead' && s.roles.lead === 'chop') return null; const name = names[Math.floor(Math.random() * names.length)]; D.spec.sound = Object.assign({}, D.spec.sound || {}, { [slot]: { preset: name } }); return { slot, name: SOUND_BANK[slot][name].label }; }
// a move inside the phrase that ends at step `end` (the phrase line). The ENGINE holds the move and runs it on its exact step (cmd 'at'), the way it runs a
// quantised jump. Timers on this page ran from the HEARD position, so every move landed late by the output latency (or by the render-ahead of the
// buffered engine), with the page's own jitter on top — and in a background tab by a second or more. What the page keeps is the look of it: the pad and
// the energy knob follow when the engine reports that it ran (or settled) the step.
const AT_UI = new Map(); let atSeq = 0; // id of a scheduled command → what the page does when the engine reports it
function atSend(i, step, list, rest, ui) { const id = ++atSeq; if (ui) { AT_UI.set(id, ui); if (AT_UI.size > 64) AT_UI.delete(AT_UI.keys().next().value); } send({ type: 'at', deck: i, atStep: step, rest: rest ? 1 : 0, id, list }); }
function atReport(m) { const f = AT_UI.get(m.id); if (!f) return; AT_UI.delete(m.id); if (m.how !== 'dropped') setTimeout(() => f(m), A.aheadMs || 0); } // (what the engine ran is heard A.aheadMs later)
function uiFx(i, name, on) { const D = decks[i], n = FX_RACK.findIndex((x) => x[0] === name); if (n < 0) return; if (!D.fxOn) { D.fxOn = new Array(FX_RACK.length).fill(0); D.fxAmt = FX_RACK_DEF.slice(); } D.fxOn[n] = on ? 1 : 0; if (DOCK.tab === 'fx' && DOCK.deck === i) renderDock(); }
function uiEnergy(i, v) { decks[i].energy = v; const el = $('.energy', deckEl(i)); if (el) el.value = v; }
function autoMove(i, end) { const D = decks[i], kind = Math.floor(Math.random() * 3);
  if (kind === 0) { const n = FX_RACK.findIndex((x) => x[0] === 'sweep'), amt = D.fxAmt ? D.fxAmt[n] : FX_RACK_DEF[n];
    atSend(i, end - 32, [{ type: 'fx', name: 'sweep', on: true, amt }], false, () => uiFx(i, 'sweep', 1)); atSend(i, end, [{ type: 'fx', name: 'sweep', on: false, amt }], true, () => uiFx(i, 'sweep', 0)); return 'filter sweep over the last 2 bars'; }
  if (kind === 1) { atSend(i, end - 4, [{ type: 'throw', steps: 4 }], false); return 'echo throw on the last beat'; }
  const back = D.energy != null ? D.energy : 0.5, low = Math.min(back, 0.25);
  atSend(i, end - 64, [{ type: 'energy', v: low }], false, () => uiEnergy(i, low)); atSend(i, end, [{ type: 'energy', v: back }], true, () => uiEnergy(i, back)); return 'energy dip for 4 bars, back on the one'; }
// (v9.2) the lines are the track's own phrase lines (sections, then every `every` bars from each section's start): on the absolute
// grid a change landed 12 bars into a drop that starts on bar 84
function autoTickAll() { for (const D of decks) { if (!D.playing || !D.score || !autoAny(D)) continue; const a = autoOf(D), q = a.every * 16, pos = livePos(D), line = nextPhrase(D.score, Math.floor(pos) + 1, a.every), ahead = line - pos;
    if (line >= D.score.meta.bars * 16) continue; const nextSec = D.score.sections.find((S) => S.bar0 * 16 === line), sec = D.score.sections[D.sec];
    // moves are planned 4½ bars ahead (the longest one starts 4 bars before the line: the engine gets it a few steps early); never into a drop (the build owns that), never under a held loop
    if (a.on.moves && q >= 128 && a.moveAt !== line && ahead <= 76 && ahead > 70 && !D.loop && (!nextSec || nextSec.type !== 'drop') && !(sec && sec.type === 'build')) { a.moveAt = line; autoLog(D, `bar ${line / 16 + 1}: ${autoMove(D.i, line)}`); }
    // parts are decided a bar ahead and committed to land exactly on the line
    if (ahead > 16 || ahead <= 3 || a.planned === line) continue; a.planned = line; if (sec && sec.type === 'build') continue;
    const parts = AUTO_PARTS.map(([k]) => k).filter((k) => k !== 'moves' && a.on[k]); if (!parts.length) continue;
    for (let tries = 0; tries < parts.length; tries++) { const part = parts[(a.n++) % parts.length]; let msg = null; const before = JSON.stringify(D.spec);
      if (part === 'harmony') { const p = autoHarmony(D, line); if (p) msg = `new progression ${p.t.join(' – ')} (${p.why})`; }
      else if (part === 'sound') { const p = autoSound(D); if (p) msg = `${p.slot} → ${p.name}`; }
      else { if (part === 'lead') D.spec.melodySeed = (Math.random() * 2 ** 31) >>> 0; else D.spec.seeds = Object.assign({}, D.spec.seeds || {}, { [part]: (Math.random() * 2 ** 31) >>> 0 }); msg = `new ${part === 'lead' ? 'melody' : part}`; }
      if (!msg) continue; commitSpec(D.i, { q: a.every }).then((s) => { if (s) { a.hist.push({ spec: before, part, msg }); if (a.hist.length > 12) a.hist.shift(); autoLog(D, `bar ${D.swapAt / 16 + 1}: ${msg}`); if (DOCK.deck === D.i) renderDock(); } else if (D.cseq == null || !D.spec) D.spec = JSON.parse(before); }); break; } } }
// Back: the last automatic change did not work → the previous version returns on the next 4-bar line and Auto stops
// touching that part (what you liked stays). The live safety net for a generative deck.
function autoBack(i) { const D = decks[i], a = autoOf(D), h = a.hist.pop(); if (!h) { toast('Nothing to take back'); return; }
  D.spec = JSON.parse(h.spec); return commitSpec(i, { q: 4 }).then((s) => { if (s) { if (h.part !== 'harmony' || a.on.harmony) a.on[h.part] = false; autoLog(D, `back: undid "${h.msg}" — Auto leaves ${h.part === 'lead' ? 'the melody' : h.part} alone now`); toast(`Back on deck ${'AB'[i]} from bar ${D.swapAt / 16 + 1}`); renderAuto(i); if (DOCK.deck === i) renderDock(); } return s; }); }
function renderAuto(i) { const el = deckEl(i); if (!el) return; const box = $('.autorow', el); if (!box) return; const D = decks[i], a = autoOf(D);
  $$('[data-auto]', box).forEach((b) => { const on = !!a.on[b.dataset.auto]; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  $('[data-every]', box).value = String(a.every); const lg = $('.autolog', el); if (lg) lg.textContent = a.log.length ? 'Auto · ' + a.log.slice(0, 2).join(' · ') : ''; }
function buildAuto() { for (let i = 0; i < 2; i++) { const el = deckEl(i), parts = $('.parts', el); const row = document.createElement('div'); row.className = 'row autorow';
    row.innerHTML = `<span class="lbl" title="On every phrase line one enabled part is renewed, in turn — harmonically safe, landing on the line">Auto</span>${AUTO_PARTS.map(([k, l]) => `<button class="btn chip" data-auto="${k}" aria-pressed="false">${l}</button>`).join('')}
      <select class="btn" data-every aria-label="Auto every"><option value="8">every 8</option><option value="16" selected>every 16</option><option value="32">every 32</option></select><button class="btn" data-autoall>All</button><button class="btn" data-autoback title="Undo the last automatic change (next 4-bar line) and keep Auto off that part">Back</button>`;
    parts.insertAdjacentElement('afterend', row); const lg = document.createElement('div'); lg.className = 'note autolog'; row.insertAdjacentElement('afterend', lg);
    $$('[data-auto]', row).forEach((b) => b.onclick = () => { const a = autoOf(decks[i]); a.on[b.dataset.auto] = !a.on[b.dataset.auto]; a.phrase = null; renderAuto(i); });
    $('[data-every]', row).onchange = (e) => { const a = autoOf(decks[i]); a.every = +e.target.value; a.phrase = null; };
    $('[data-autoback]', row).onclick = () => autoBack(i);
    $('[data-autoall]', row).onclick = () => { const D = decks[i]; autoSetAll(i, !autoAny(D)); toast(autoAny(D) ? `Auto on: deck ${'AB'[i]} renews a part every ${autoOf(D).every} bars and rides the mix` : 'Auto off'); };
    renderAuto(i); }
  setInterval(autoTickAll, 200); }

// SAFE (Esc, header button): the panic button for a live set — every performance FX off, filters centred, loops released,
// pending jumps cancelled, Auto paused on both decks, energy back to the middle. The music keeps playing, untouched otherwise.
function safeAll() { const T = targets(); for (let i = 0; i < 2; i++) { const D = decks[i], d = 'AB'[i]; send({ type: 'cancelAt', deck: i }); // (moves still waiting in the engine: a restoring one runs at once, the others are dropped)
    for (const [n] of FX_RACK) send({ type: 'fx', deck: i, name: n, on: false }); if (D.fxOn) D.fxOn.fill(0); if (typeof bfxAllOff === 'function') bfxAllOff(i); if (typeof mgAllOff === 'function') mgAllOff(i); /* (v10) Safe: the Beat FX and Mangle of every part too (9.5 left them on, and the FX screen showed effects the engine no longer played) */
    for (const [k] of FILLS) send({ type: 'fill', deck: i, kind: k, on: false }); if (D.xy) { D.xy.hold = false; xySet(i, 0, 0); } if (D.macro && D.score) for (const [k] of MACROS) macroSet(i, k, MACRO_CENTER[k] ? 0.5 : 0);
    T[`${d}.filter`].set(0.5); if (D.loop) setLoop(i, 0); if (D.pendJump >= 0) { send({ type: 'jump', deck: i, atStep: -1, step: 0 }); D.pendJump = -1; }
    T[`${d}.energy`].set(0.5); const a = autoOf(D); a.paused = AUTO_PARTS.filter(([k]) => a.on[k]).map(([k]) => k); for (const [k] of AUTO_PARTS) a.on[k] = false; renderAuto(i); }
  const autoWas = auto.on, disarmed = cancelMix(true, true); // (v9.2) an armed mix is disarmed too (and Auto-DJ off, or it would arm another); a running one finishes (Shift+Esc or Cancel mix stops it)
  if (typeof renderPerf === 'function') renderPerf(); toast(`SAFE: FX off, filters centred, loops released, Auto paused (“Auto” brings it back)${disarmed ? (autoWas ? ', the armed mix disarmed and Auto-DJ off' : ', the armed mix disarmed') : tx ? ' — the running mix finishes (Shift+Esc cancels it)' : ''} — the music plays on`, 5000); }
