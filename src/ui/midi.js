/* ===================== FORGE · CONTROLLER LAYER (Web MIDI) =====================
   Every performance control is a named TARGET. A binding maps one MIDI message (note / CC / pitch bend on a channel) to a
   target; bindings are learned (press Learn, move the control) and saved per browser, exported/imported as JSON.
   Pro behaviour: soft takeover on absolute knobs (no jumps — the value is picked up when the hardware crosses it), relative
   encoders, momentary vs toggle buttons, LED feedback (state echoed back on the bound note/CC), MIDI clock out (24 ppqn,
   start/stop) following the lead deck, and note out per part so the score can drive hardware synths. Timing for clock and
   notes is scheduled ahead with MIDIOutput.send(data, timestamp) from the deck position the audio thread reports. */
const MIDI = { access: null, learn: null, map: {}, outId: '', clockOut: false, clockIn: false, ck: { t: [], last: 0, n: 0, bpm: 0, sent: 0, run: false, ext: 0, base: 0, err: 0 }, notesOut: { bass: false, chords: false, lead: false, drums: false }, latencyMs: 0, lastLed: {}, schedT: 0, clkNext: -1, noteNext: -1, sm: null, clkT: 0, latSeen: null, state: 'off', inputs: [] };
const NOTE_CH = { bass: 0, chords: 1, lead: 2, arp: 2, drums: 9 }, GM_DRUM = { 0: 36, 1: 38, 2: 42 }, OPEN_HAT = 46;
// ---- targets: id → { label, group, kind: 'button' | 'toggle' | 'range', get(), set(v 0…1 | press), on() } ----
function midiTargets() { const T = {}; const add = (id, label, group, kind, o) => { T[id] = Object.assign({ id, label, group, kind }, o); };
  for (let i = 0; i < 2; i++) { const d = 'AB'[i], D = decks[i], g = `Deck ${d}`;
    add(`${d}.play`, 'Play / pause', g, 'button', { press: () => playPause(i), on: () => D.playing });
    add(`${d}.mix`, 'Mix in', g, 'button', { press: () => { if (D.score && decks[i ^ 1].playing && !D.playing) mixInto(i); } });
    add(`${d}.var`, 'New variation', g, 'button', { press: () => reroll(i) });
    for (const [p, l] of [['drums', 'New drums'], ['bass', 'New bass'], ['chords', 'New chords'], ['lead', 'New melody']]) add(`${d}.new.${p}`, l, g, 'button', { press: () => regenPart(i, p) });
    add(`${d}.evolve`, 'Auto (all parts)', g, 'toggle', { press: () => autoSetAll(i, !autoAny(D)), on: () => autoAny(D) });
    for (const [k, l] of AUTO_PARTS) add(`${d}.auto.${k}`, `Auto ${l}`, g, 'toggle', { press: () => { const a = autoOf(D); a.on[k] = !a.on[k]; renderAuto(i); }, on: () => !!autoOf(D).on[k] });
    for (const l of [4, 8, 16]) add(`${d}.loop${l}`, `Loop ${l}`, g, 'button', { press: () => setLoop(i, l), on: () => D.loop === l });
    add(`${d}.next`, 'Jump: next section', g, 'button', { press: () => { if (D.score) jumpTo(i, Math.min(D.score.sections.length - 1, D.sec + 1)); } });
    add(`${d}.prev`, 'Jump: previous section', g, 'button', { press: () => { if (D.score) jumpTo(i, Math.max(0, D.sec - 1)); } });
    add(`${d}.drop`, 'Jump: next drop', g, 'button', { press: () => { if (!D.score) return; const k = D.score.sections.findIndex((S, n) => n > D.sec && S.type === 'drop'); if (k >= 0) jumpTo(i, k); } });
    add(`${d}.builddrop`, 'Build → drop (next 4-bar line)', g, 'button', { press: () => buildToDrop(i) });
    for (const b of ['high', 'mid', 'low']) add(`${d}.eq.${b}`, `EQ ${b}`, `Mixer ${d}`, 'range', { get: () => (D.eq[b] + 30) / 36, set: (v, raw) => MK[i][b].set(v * 36 - 30, raw), center: 30 / 36 });
    add(`${d}.filter`, 'Filter', `Mixer ${d}`, 'range', { get: () => (D.filter + 1) / 2, set: (v, raw) => MK[i].filter.set(v * 2 - 1, raw), center: 0.5 });
    add(`${d}.fader`, 'Volume fader', `Mixer ${d}`, 'range', { get: () => D.fader, set: (v) => { const f = $('#fader' + i); f.value = v; f.oninput(); } });
    add(`${d}.energy`, 'Energy', `Mixer ${d}`, 'range', { get: () => (D.energy != null ? D.energy : 0.5), set: (v) => { D.energy = v; send({ type: 'energy', deck: i, v }); const el = $('.energy', deckEl(i)); if (el) el.value = v; }, center: 0.5 });
    FX_RACK.forEach(([k, l], n) => {
      const setOn = (on) => { if (!D.fxOn) { D.fxOn = new Array(FX_RACK.length).fill(0); D.fxAmt = FX_RACK_DEF.slice(); } D.fxOn[n] = on ? 1 : 0; send({ type: 'fx', deck: i, name: k, on: !!on, amt: D.fxAmt[n] }); if (DOCK.tab === 'fx' && DOCK.deck === i) renderDock(); };
      add(`${d}.fx.${k}`, `${l} on/off`, `FX ${d}`, 'toggle', { press: () => setOn(!(D.fxOn && D.fxOn[n])), on: () => !!(D.fxOn && D.fxOn[n]) });
      add(`${d}.fx.${k}.hold`, `${l} (hold)`, `FX ${d}`, 'momentary', { down: () => setOn(1), up: () => setOn(0), on: () => !!(D.fxOn && D.fxOn[n]) });
      add(`${d}.fx.${k}.amt`, `${l} amount`, `FX ${d}`, 'range', { get: () => (D.fxAmt ? D.fxAmt[n] : FX_RACK_DEF[n]), set: (v) => { if (!D.fxAmt) { D.fxOn = new Array(FX_RACK.length).fill(0); D.fxAmt = FX_RACK_DEF.slice(); } D.fxAmt[n] = v; send({ type: 'fx', deck: i, name: k, amt: v }); } }); });
    add(`${d}.throw`, 'Echo throw (½ bar)', `FX ${d}`, 'button', { press: () => send({ type: 'throw', deck: i, steps: 8 }) });
    for (const [k, l] of FILLS) add(`${d}.fill.${k}`, `Fill: ${l} (hold)`, `Drums ${d}`, 'momentary', { down: () => send({ type: 'fill', deck: i, kind: k, on: true }), up: () => send({ type: 'fill', deck: i, kind: k, on: false }) });
    for (const [k, l] of MACROS) add(`${d}.macro.${k}`, `Macro: ${l}`, `Macros ${d}`, 'range', { get: () => macroGet(i, k), set: (v) => macroSet(i, k, v), center: MACRO_CENTER[k] ? 0.5 : null });
    add(`${d}.xy.x`, 'XY pad X', `XY ${d}`, 'range', { get: () => (xyOf(i).x + 1) / 2, set: (v) => xySet(i, v * 2 - 1, null), center: 0.5 });
    add(`${d}.xy.y`, 'XY pad Y', `XY ${d}`, 'range', { get: () => xyOf(i).y, set: (v) => xySet(i, null, v) });
    add(`${d}.riser`, 'Riser (1 bar)', `FX ${d}`, 'button', { press: () => send({ type: 'fxNow', deck: i, kind: 0, steps: 16 }) });
    for (let k = 0; k < 4; k++) add(`${d}.hot${k + 1}`, `Hot cue ${k + 1}`, g, 'button', { press: () => hotPress(i, k), on: () => !!(D.hot && D.hot[k] != null) });
    add(`${d}.cue`, 'Headphone cue', `Mixer ${d}`, 'toggle', { press: () => setCue(i), on: () => !!D.cue });
    // (v9.2) the DJ set every controller has: a tempo fader (±8 % around the track's own tempo; during a mix both decks follow it), beat
    // jumps of a bar on the next beat, loop halve / double down to a one-beat roll, and tempo sync to the other deck
    const nat = () => D.native || (D.score && D.score.meta.bpm) || 124;
    add(`${d}.tempo`, 'Tempo (±8 %)', g, 'range', { get: () => clamp(((D.bpm || nat()) / nat() - 0.92) / 0.16, 0, 1), set: (v) => { if (!D.score) return; const b = Math.round(nat() * (0.92 + 0.16 * v) * 100) / 100; D.bpm = b; send({ type: 'bpm', deck: i, bpm: b }); }, center: 0.5 });
    add(`${d}.sync`, 'Tempo sync to the other deck', g, 'button', { press: () => { const O = decks[i ^ 1]; if (D.score && O.score && O.bpm) { D.bpm = O.bpm; send({ type: 'bpm', deck: i, bpm: O.bpm }); toast(`Deck ${d} at ${O.bpm.toFixed(1)} BPM`); } } });
    for (const [k, l, dir] of [['jump.fwd', 'Beat jump +1 bar', 1], ['jump.back', 'Beat jump −1 bar', -1]]) add(`${d}.${k}`, l, g, 'button', { press: () => { if (!D.score || !D.playing) return; const at = Math.ceil((schedPos(D) + 1) / 4) * 4, to = Math.max(0, Math.min(D.score.meta.bars * 16 - 16, at + 16 * dir)); send({ type: 'jump', deck: i, atStep: at, step: to }); } });
    add(`${d}.loop.half`, 'Loop: halve', g, 'button', { press: () => { const L = D.loop || 8; if (L > 0.25) setLoop(i, L / 2); } });
    add(`${d}.loop.double`, 'Loop: double', g, 'button', { press: () => { const L = D.loop || 2; if (L < 32) setLoop(i, L * 2); } }); }
  add('next.load', 'Load the next track (Auto-DJ pick) to the free deck', 'Mixer', 'button', { press: async () => { const t = loadTarget(lead ^ 1); if (t < 0) { toast(onAirMsg(lead ^ 1)); return; } const D = decks[lead]; await startAudio(); loadDeck(t, D.score ? pickNext(D.score.meta.gid) : 'techno', { play: !decks[t ^ 1].playing }); } });
  add('safe', 'SAFE (panic)', 'Mixer', 'button', { press: () => safeAll() });
  for (let i = 0; i < 2; i++) add(`${'AB'[i]}.auto.back`, 'Auto: back', `Deck ${'AB'[i]}`, 'button', { press: () => autoBack(i) });
  add('rec', 'Record the set', 'Mixer', 'toggle', { press: () => toggleRec(), on: () => !!PERF.rec });
  add('perform', 'Perform view', 'Mixer', 'toggle', { press: () => setPerform(), on: () => PERF.on });
  add('xf', 'Crossfader', 'Mixer', 'range', { get: () => (+$('#xf').value + 1) / 2, set: (v) => { $('#xf').value = v * 2 - 1; sendGains(); }, center: 0.5 });
  add('auto', 'Auto-DJ on/off', 'Mixer', 'toggle', { press: () => setAutoDJ(!auto.on), on: () => auto.on });
  add('mix.cancel', 'Cancel mix', 'Mixer', 'button', { press: () => cancelMix(false) });
  return T; }
let TARGETS = null; const targets = () => TARGETS || (TARGETS = midiTargets());
// ---- message decoding: key = kind:channel:number (note / cc / pb) ----
function midiDecode(data) { const st = data[0] & 0xf0, ch = data[0] & 0x0f;
  if (st === 0x90 || st === 0x80) return { key: `note:${ch}:${data[1]}`, kind: 'note', ch, num: data[1], down: st === 0x90 && data[2] > 0, v: data[2] / 127 };
  if (st === 0xb0) return { key: `cc:${ch}:${data[1]}`, kind: 'cc', ch, num: data[1], raw: data[2], v: data[2] / 127, down: data[2] > 0 };
  if (st === 0xe0) return { key: `pb:${ch}:0`, kind: 'pb', ch, num: 0, v: ((data[2] << 7) | data[1]) / 16383, down: true };
  return null; }
// ---- clock in: follow an external tempo (a drum machine, a DAW, another DJ's clock) — 24 ticks per beat, averaged over the last
// two beats (a jittery USB clock does not wobble the decks), the tempo applied as a short glide when it moved by more than
// 0.1 BPM; Start / Continue play the lead deck, Stop pauses it. Clock out is switched off while following (no feedback loop).
// phase lock: from a Start, the external clock's beats are counted (24 ticks each) and the lead deck's heard position is held on
// them, bar for bar — every beat the offset (in beats, wrapped to ±2 within the 4-beat bar) is measured and corrected by a
// small tempo nudge (at most ±4 %, unheard as pitch: the engine re-synthesises), so the beat never jumps. On Start the deck
// starts from the top of its current bar, on the external downbeat.
function clockIn(b, ts) { const K = MIDI.ck, now = ts || performance.now();
  if (b === 0xf8) { if (K.last && now > K.last && now - K.last < 250) { K.t.push(now); if (K.t.length > 96) K.t.shift(); } else K.t.length = 0; K.last = now; if (K.run) K.ext += 1 / 24; // tick times of the last 4 beats
    if (++K.n % 24 === 0 && K.t.length >= 24) { const T = K.t, N = T.length, mx = (N - 1) / 2; let my = 0; for (const x of T) my += x; my /= N; let sxy = 0, sxx = 0; for (let k = 0; k < N; k++) { sxy += (k - mx) * (T[k] - my); sxx += (k - mx) * (k - mx); } const avg = sxy / sxx, bpm = Math.round(60000 / (avg * 24) * 10) / 10; /* least-squares tick period: per-tick jitter averages out (two-ended interval sums did not) */
      if (!(bpm > 40 && bpm < 300)) return; K.bpm = !K.bpm || Math.abs(bpm - K.bpm) > K.bpm * 0.03 ? bpm : K.bpm + (bpm - K.bpm) * 0.5; const tgt = Math.round(K.bpm * 10) / 10; if (tgt < 60 || tgt > 200) return;
      let cmd = tgt; const D = decks[lead];
      if (K.run && D.playing && D.score) { let e = (K.base + K.ext) - livePos(D) / 4; e = ((e % 4) + 6) % 4 - 2; K.err = e; cmd = tgt * (1 + Math.max(-0.04, Math.min(0.04, e * 0.08))); }
      if (Math.abs(cmd - (K.cmd || 0)) > 0.01) { for (let i = 0; i < 2; i++) if (decks[i].score) { send({ type: 'glide', deck: i, bpm: cmd, steps: 4 }); decks[i].bpm = tgt; } K.cmd = cmd; }
      if (Math.abs(tgt - K.sent) > 0.05) { K.sent = tgt; renderMidiPanel(); } } return; }
  if (b === 0xfa || b === 0xfb) { K.t.length = 0; K.last = 0; K.ext = 0; K.run = true; const D = decks[lead]; if (!D.score) return;
    // on a big output buffer (Live · safe) the first notes are heard A.lat after they are rendered, so the deck starts that far into the bar: heard, it is then on the external downbeat from the first note instead of 1–2 beats behind for the ~40 beats the tempo nudge needs to pull it in
    let down = null; if (!D.playing) { if (b === 0xfa) { down = Math.floor(livePos(D) / 16) * 16; const dMs = (A.worker ? (A.leadF || 4096) / (A.ctx ? A.ctx.sampleRate : 44100) * 1000 : 0) + (A.lat || 0), skip = dMs > 60 ? Math.round(dMs * (D.bpm || 124) / 15000) : 0; /* (v9.2: the render lead of the Stable engine too) */ send({ type: 'seek', deck: lead, step: down + skip }); D.pos = down + skip; } playPause(lead); }
    K.base = (b === 0xfa && down != null ? down / 4 : b === 0xfa && !D.playing ? Math.floor(livePos(D) / 16) * 4 : Math.round(livePos(D) / 4)); return; }
  if (b === 0xfc) { K.run = false; const D = decks[lead]; if (D.playing) playPause(lead); } }
function midiMessage(data, ts) { if (data[0] >= 0xf8) { if (MIDI.clockIn) clockIn(data[0], ts); return; } const m = midiDecode(data); if (!m) return;
  if (MIDI.learn) { const id = MIDI.learn; for (const k of Object.keys(MIDI.map)) if (MIDI.map[k].id === id) delete MIDI.map[k];
    MIDI.map[m.key] = { id, rel: false }; MIDI.learn = null; saveMidi(); toast(`Learned: ${targets()[id].label} ← ${describe(m.key)}`); renderMidiPanel(); return; }
  const b = MIDI.map[m.key]; if (!b) return; const T = targets()[b.id]; if (!T) return;
  if (T.kind === 'button' || T.kind === 'toggle') { if (m.kind === 'cc' ? m.raw >= 64 && !(b.prevDown) : m.down) T.press(); b.prevDown = m.kind === 'cc' ? m.raw >= 64 : m.down; }
  else if (T.kind === 'momentary') { if (m.down) T.down(); else T.up(); }
  else if (T.kind === 'range') { const cur = T.get();
    // relative / endless encoders (v9.2): the three codes controllers use — two's complement (1 = +1, 127 = −1), offset binary (65 = +1,
    // 63 = −1) and sign-magnitude (1 = +1, 65 = −1); a step is 1/127 of the range and never snaps to the centre (a ±1 click on EQ or filter
    // snapped straight back: an encoder could not leave the centre; an offset-binary one swept end to end in one click)
    if (b.rel && m.kind === 'cc') { const d = relDelta(relMode(b.rel), m.raw); if (d) T.set(clamp(cur + d / 127, 0, 1), true); return; }
    // soft takeover: the hardware takes over only once it reaches (or crosses) the on-screen value — no jumps
    if (b.last == null || Math.abs(cur - b.last) > 0.02) b.locked = false;
    if (!b.locked) { if (Math.abs(m.v - cur) < 0.04 || (b.prevHw != null && (b.prevHw - cur) * (m.v - cur) <= 0)) b.locked = true; b.prevHw = m.v; if (!b.locked) { MIDI.pickup = { id: b.id, hw: m.v, cur, t: performance.now() }; return; } }
    const v = T.center != null && Math.abs(m.v - T.center) < 0.012 ? T.center : m.v; T.set(v); b.last = T.get(); b.prevHw = m.v; } }
function relMode(r) { return r === true ? 'twos' : r || ''; } // (a map saved by 9.1 has rel: true — two's complement)
function relDelta(mode, raw) { return mode === 'offset' ? raw - 64 : mode === 'sign' ? (raw & 64 ? -(raw & 63) : raw & 63) : raw < 64 ? raw : raw - 128; }
function describe(key) { const [k, ch, n] = key.split(':'); return k === 'pb' ? `pitch bend · ch ${+ch + 1}` : `${k === 'cc' ? 'CC' : 'note'} ${n} · ch ${+ch + 1}`; }
// ---- LED feedback: state of toggles / buttons echoed to the bound note or CC (only on change) ----
function midiLeds() { const out = midiOut(); if (!out) return; for (const [key, b] of Object.entries(MIDI.map)) { const T = targets()[b.id]; if (!T || !T.on) continue; const on = T.on() ? 1 : 0; if (MIDI.lastLed[key] === on) continue; MIDI.lastLed[key] = on;
    const [k, ch, n] = key.split(':'); if (k === 'note') out.send([0x90 | +ch, +n, on ? 127 : 0]); else if (k === 'cc') out.send([0xb0 | +ch, +n, on ? 127 : 0]); } }
function midiOut() { if (!MIDI.access) return null; let o = null; MIDI.access.outputs.forEach((x) => { if (!o && (!MIDI.outId || x.id === MIDI.outId)) o = x; }); return o; }
// ---- clock + note out: scheduled ~60 ms ahead from the lead deck's position ----
function midiSchedule() { const out = midiOut(); if (!out || (!MIDI.clockOut && !Object.values(MIDI.notesOut).some(Boolean))) return; const D = decks[lead]; if (!D.playing || !D.score) { if (MIDI.running) { out.send([0xfc]); MIDI.running = false; } MIDI.clkNext = -1; MIDI.noteNext = -1; MIDI.sm = null; MIDI.latSeen = null; return; }
  // The deck position arrives with a few ms of noise (the meter message's timing, the audio clock's step size). Stamping every tick straight from it made the
  // clock wobble: ticks 3-10 ms out of order and gaps from 3 to 50 ms instead of one steady 17 ms. So the schedule follows the position through a low-pass:
  // each call advances the previous phase by the real time elapsed and takes up 12 % of the error; only a real jump (over 40 ms), a new lead deck or a stalled page snaps to the raw position.
  // A real jump (a loop wrapping, a jump to a section) moves the clock's tick counter by the same distance, so the ticks keep their steady spacing in time instead of
  // waiting for the position to catch up with a counter that is now far ahead (a 1-bar loop stopped the clock for 7 s); notes are read again from the new position.
  // The latency estimate is refined while playing (the browser reports the device's output latency only once the device runs). That moves the position being heard by the same amount: not a jump in the music
  // but a better estimate, so the tick counter keeps its identity (ticks stay on the 24-per-beat grid of the score) and only the time of the next tick moves, once.
  const now = performance.now(), msPerStep = 15000 / D.bpm, raw = livePos(D), S = MIDI.sm, latSig = A.lat || 0, latJump = MIDI.latSeen != null && Math.abs(latSig - MIDI.latSeen) > 1; MIDI.latSeen = latSig; let pos = raw;
  if (S && S.lead === lead && now - S.t < 250) { const pred = S.pos + (now - S.t) / msPerStep, err = raw - pred;
    if (Math.abs(err) * msPerStep > 40) { pos = raw; if (!latJump) { MIDI.clkNext += Math.round(err * 6) / 6; /* whole ticks only: the ticks stay on the 24-per-beat grid of the score */ MIDI.noteNext = raw; } } else pos = latJump ? raw : pred + err * 0.12; } /* (v9.2: the heard position includes the device latency on every engine, so a new latency estimate moves it — taken in one step, not followed through the low-pass, which bent the beat for a second: tempo spread 1.2 BPM) */
  MIDI.sm = { pos, t: now, lead };
  const horizon = pos + 60 / msPerStep, lat = MIDI.latencyMs, /* (v9.2) pos is the position being HEARD on every engine (the meter subtracts the render queue AND the device's latency), so the stamp adds only the MIDI path's own delay */ at = (step) => now + (step - pos) * msPerStep + lat;
  if (MIDI.clockOut) { if (!MIDI.running) { out.send([0xfa], at(Math.ceil(pos))); MIDI.running = true; MIDI.clkNext = Math.ceil(pos * 6) / 6; MIDI.clkT = 0; } if (MIDI.clkNext < pos - 1 || MIDI.clkNext > pos + 2) MIDI.clkNext = Math.ceil(pos * 6) / 6;
    while (MIDI.clkNext < horizon) { MIDI.clkT = Math.max(now, at(MIDI.clkNext), MIDI.clkT); out.send([0xf8], MIDI.clkT); MIDI.clkNext += 1 / 6; } } // 24 ppqn = 6 per 16th step
  if (Object.values(MIDI.notesOut).some(Boolean)) { const ev = D.score.ev; if (MIDI.noteNext < pos - 1 || MIDI.noteNext > horizon + 16) MIDI.noteNext = pos; let lo = 0, hi = ev.n; while (lo < hi) { const m = (lo + hi) >> 1; if (ev.t[m] < MIDI.noteNext) lo = m + 1; else hi = m; }
    for (let k = lo; k < ev.n && ev.t[k] < horizon; k++) { const c = ev.ch[k]; let part = null, ch = 0, note = 0;
      if (c <= 2 && MIDI.notesOut.drums) { part = 'drums'; ch = 9; note = c === 2 ? (ev.a[k] === 1 ? OPEN_HAT : GM_DRUM[2]) : GM_DRUM[c]; }
      else if (c === 4 && MIDI.notesOut.bass) { part = 'bass'; ch = NOTE_CH.bass; note = Math.round(ev.a[k]); } else if ((c === 5 || c === 6) && MIDI.notesOut.chords) { part = 'chords'; ch = NOTE_CH.chords; note = Math.round(ev.a[k]); }
      else if ((c === 7 || c === 8) && MIDI.notesOut.lead) { part = 'lead'; ch = NOTE_CH.lead; note = Math.round(ev.a[k]); }
      if (!part || !(note > 0 && note < 128)) continue; const vel = Math.max(1, Math.min(127, Math.round(ev.v[k] * 110))), t1 = at(ev.t[k]), t2 = at(ev.t[k] + Math.max(0.25, part === 'drums' ? 0.5 : ev.d[k]));
      out.send([0x90 | ch, note, vel], Math.max(now, t1)); out.send([0x80 | ch, note, 0], Math.max(now, t2)); }
    MIDI.noteNext = horizon; } }
// ---- access, persistence, panel ----
function saveMidi() { try { localStorage.setItem('forge.midi', JSON.stringify({ map: MIDI.map, outId: MIDI.outId, clockOut: MIDI.clockOut, clockIn: MIDI.clockIn, notesOut: MIDI.notesOut, latencyMs: MIDI.latencyMs })); } catch (e) { /* storage blocked: mapping lives for this session */ } }
function loadMidi() { try { const j = JSON.parse(localStorage.getItem('forge.midi') || 'null'); if (j) { MIDI.map = j.map || {}; MIDI.outId = j.outId || ''; MIDI.clockOut = !!j.clockOut; MIDI.clockIn = !!j.clockIn && !j.clockOut; Object.assign(MIDI.notesOut, j.notesOut || {}); MIDI.latencyMs = j.latencyMs || 0; } } catch (e) { /* ignore */ } }
async function connectMidi(injected) { try { const acc = injected || (navigator.requestMIDIAccess ? await navigator.requestMIDIAccess({ sysex: false }) : null); if (!acc) { MIDI.state = 'unsupported'; renderMidiPanel(); toast('This browser has no Web MIDI (use Chrome or Edge)'); return; }
    MIDI.access = acc; MIDI.state = 'on'; const hook = () => { MIDI.inputs = []; acc.inputs.forEach((inp) => { inp.onmidimessage = (e) => midiMessage(e.data, e.timeStamp); MIDI.inputs.push(inp.name || inp.id); }); renderMidiPanel(); }; hook(); acc.onstatechange = hook;
    toast(MIDI.inputs.length ? `Controller connected: ${MIDI.inputs.join(', ')}` : 'MIDI ready — plug in a controller'); } catch (e) { MIDI.state = 'denied'; renderMidiPanel(); toast('MIDI access was not allowed'); } }
function renderMidiPanel() { const el = $('#midiPanel'); if (!el || el.hidden) return; const T = targets(), byId = {}; for (const [k, b] of Object.entries(MIDI.map)) byId[b.id] = k; const groups = {};
  for (const t of Object.values(T)) (groups[t.group] = groups[t.group] || []).push(t); const outs = []; if (MIDI.access) MIDI.access.outputs.forEach((o) => outs.push(o));
  el.querySelector('.mp-body').innerHTML = `<div class="mp-top"><span class="mp-st ${MIDI.state}">${MIDI.state === 'on' ? (MIDI.inputs.length ? 'Connected: ' + esc(MIDI.inputs.join(', ')) : 'MIDI on — no controller found') : MIDI.state === 'off' ? 'Not connected' : MIDI.state === 'denied' ? 'Access denied' : 'No Web MIDI in this browser'}</span>
      ${MIDI.state !== 'on' ? '<button class="btn primary" data-mp="connect">Connect</button>' : ''}<button class="btn" data-mp="export">Export mapping</button><button class="btn" data-mp="import">Import mapping</button><button class="btn" data-mp="clear">Clear all</button></div>
    <div class="mp-out"><label class="dk-field"><span class="lbl">Out port</span><select class="btn" data-mp="out"><option value="">First available</option>${outs.map((o) => `<option value="${esc(o.id)}"${o.id === MIDI.outId ? ' selected' : ''}>${esc(o.name)}</option>`).join('')}</select></label>
      <label class="dk-field"><input type="checkbox" data-mp="clock" ${MIDI.clockOut ? 'checked' : ''}> <span>Clock out (24 ppqn, start/stop)</span></label>
      <label class="dk-field"><input type="checkbox" data-mp="clockin" ${MIDI.clockIn ? 'checked' : ''}> <span>Clock in — follow an external tempo + start/stop${MIDI.clockIn && MIDI.ck.sent ? ` (following ${MIDI.ck.sent.toFixed(1)} BPM)` : ''}</span></label>
      <span class="lbl">Notes out</span>${['bass', 'chords', 'lead', 'drums'].map((p) => `<label class="dk-field"><input type="checkbox" data-np="${p}" ${MIDI.notesOut[p] ? 'checked' : ''}> <span>${p} (ch ${(NOTE_CH[p] ?? 0) + 1})</span></label>`).join('')}
      <label class="dk-field"><span class="lbl">Offset ms</span><input class="btn" type="number" step="1" value="${MIDI.latencyMs}" data-mp="lat" style="width:70px"></label></div>
    <p class="dk-legend">Learn: press <b>Learn</b>, then move the knob or hit the pad. Knobs use soft takeover (no jumps); tick <b>rel</b> for endless encoders. LEDs follow the state of buttons. Notes out drives hardware synths from the lead deck's score.</p>
    <div class="mp-groups">${Object.entries(groups).map(([g, ts]) => `<div class="mp-g"><h4>${esc(g)}</h4>${ts.map((t) => { const k = byId[t.id]; return `<div class="mp-row${MIDI.learn === t.id ? ' learning' : ''}"><span>${esc(t.label)}</span><code>${k ? esc(describe(k)) : '—'}</code>${t.kind === 'range' && k && k.startsWith('cc') ? `<select class="btn" data-rel="${esc(k)}" title="Absolute knob / fader, or an endless encoder (relative) in its own code" aria-label="Control type">${[['', 'abs'], ['twos', 'rel ±'], ['offset', 'rel 64'], ['sign', 'rel s']].map(([v, l]) => `<option value="${v}"${relMode(MIDI.map[k].rel) === v ? ' selected' : ''}>${l}</option>`).join('')}</select>` : '<span></span>'}<button class="btn" data-learn="${t.id}">${MIDI.learn === t.id ? 'Move a control…' : 'Learn'}</button>${k ? `<button class="dk-x" data-unbind="${esc(k)}" aria-label="Remove binding">×</button>` : '<span></span>'}</div>`; }).join('')}</div>`).join('')}</div>`;
  const q = (s) => el.querySelector(s); el.querySelectorAll('[data-learn]').forEach((b) => b.onclick = () => { MIDI.learn = MIDI.learn === b.dataset.learn ? null : b.dataset.learn; renderMidiPanel(); });
  el.querySelectorAll('[data-unbind]').forEach((b) => b.onclick = () => { delete MIDI.map[b.dataset.unbind]; saveMidi(); renderMidiPanel(); });
  el.querySelectorAll('[data-rel]').forEach((b) => b.onchange = () => { MIDI.map[b.dataset.rel].rel = b.value || false; saveMidi(); });
  el.querySelectorAll('[data-np]').forEach((b) => b.onchange = () => { MIDI.notesOut[b.dataset.np] = b.checked; saveMidi(); });
  const c = q('[data-mp=connect]'); if (c) c.onclick = () => connectMidi(); q('[data-mp=out]').onchange = (e) => { MIDI.outId = e.target.value; MIDI.lastLed = {}; saveMidi(); };
  q('[data-mp=clockin]').onchange = (e) => { MIDI.clockIn = e.target.checked; MIDI.ck.t.length = 0; MIDI.ck.bpm = 0; if (MIDI.clockIn && A.mode === 'Live · safe') toast('Following an external clock: the Live engine locks to it tighter than the gig buffer (Engine menu, then reload)', 8000); if (MIDI.clockIn && MIDI.clockOut) { MIDI.clockOut = false; const o = midiOut(); if (o && MIDI.running) o.send([0xfc]); MIDI.running = false; toast('Clock out is off while FORGE follows an external clock'); } saveMidi(); renderMidiPanel(); };
  q('[data-mp=clock]').onchange = (e) => { MIDI.clockOut = e.target.checked; if (MIDI.clockOut && MIDI.clockIn) { MIDI.clockIn = false; renderMidiPanel(); } if (!MIDI.clockOut && MIDI.running) { const o = midiOut(); if (o) o.send([0xfc]); MIDI.running = false; } saveMidi(); };
  q('[data-mp=lat]').onchange = (e) => { MIDI.latencyMs = +e.target.value || 0; saveMidi(); };
  q('[data-mp=export]').onclick = () => copyText(JSON.stringify({ forgeMidi: 1, map: MIDI.map }, null, 1), 'Mapping copied — paste it into a file or share it');
  q('[data-mp=import]').onclick = () => { const t = prompt('Paste a FORGE mapping (JSON)'); if (!t) return; try { const j = JSON.parse(t); if (!j.map) throw new Error('no "map"'); MIDI.map = j.map; saveMidi(); renderMidiPanel(); toast('Mapping imported'); } catch (e) { toast('Not a FORGE mapping: ' + e.message); } };
  q('[data-mp=clear]').onclick = () => { if (confirm('Remove every binding?')) { MIDI.map = {}; saveMidi(); renderMidiPanel(); } }; }
function buildMidi() { loadMidi(); const p = document.createElement('div'); p.id = 'midiPanel'; p.className = 'midi-panel'; p.hidden = true; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Controller');
  p.innerHTML = '<div class="mp-card"><div class="mp-head"><h3>Controller</h3><button class="dk-fold" data-mp="close" aria-label="Close">×</button></div><div class="mp-body"></div></div>'; document.body.appendChild(p);
  p.querySelector('[data-mp=close]').onclick = () => { p.hidden = true; MIDI.learn = null; }; p.onclick = (e) => { if (e.target === p) { p.hidden = true; MIDI.learn = null; } };
  $('#ctlBtn').onclick = () => { p.hidden = false; renderMidiPanel(); if (MIDI.state === 'off') connectMidi(); };
  setInterval(() => { midiSchedule(); midiLeds(); }, 25); }
