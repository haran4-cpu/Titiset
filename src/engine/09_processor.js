/* ===================== WORKLET PROCESSOR =====================
   Two decks + master. All musical timing lives here (sample-accurate); the main thread only sends commands.
   Scores arrive with their typed arrays TRANSFERRED (zero-copy, no deserialisation cost on the audio thread).
   Transitions (auto-mix) are executed here too, so a bass swap lands on the exact beat even if the UI thread stalls. */
const TX_SHAPES = { blend: 1, cut: 2, echo: 3, filter: 4, stems: 5, breakdown: 6, roll: 7, brake: 8, riser: 9, tease: 10 }; // (v9.3: ten transitions, see automateTx)
// (v9.2) a command's numbers must be finite numbers: one NaN fader / EQ / trim / tempo used to poison the shared reverb and limiter
// and silence BOTH decks until a reload (measured); a set file's "32" (a string) grew a string position on the audio thread
const CMD_NUM = new Set(['deck', 'step', 'from', 'fromB', 'to', 'atStep', 'bpm', 'v', 'db', 'bars', 'steps', 'low', 'mid', 'high', 't60', 'damp', 'amt', 'swap', 'ch', 'until', 'note', 'pan', 'echo', 'verb']);
function cmdOk(m) { if (!m || typeof m.type !== 'string') return false;
  for (const k in m) { const v = m[k]; if (typeof v === 'number') { if (!Number.isFinite(v)) return false; } else if (CMD_NUM.has(k) && v != null && !(k === 'kind' || typeof v === 'boolean')) return false; }
  if (m.type === 'cue' && m.mix != null && !Number.isFinite(m.mix)) return false;
  if (m.p && typeof m.p === 'object') for (const k in m.p) { const v = m.p[k]; if (typeof v === 'number' && !Number.isFinite(v)) return false; }
  return true; }
// transition helpers (module level: no closures made per block while a mix runs)
function txFin(x, a, b) { return Math.sin(Math.PI / 2 * clamp((x - a) / (b - a), 0, 1)); }
function txFout(x, a, b) { return Math.cos(Math.PI / 2 * clamp((x - a) / (b - a), 0, 1)); }
function txBar(T, k) { return T.s + Math.round(T.len / 16 * k) * 16; } // a fraction of the mix, on a bar line
function txParts(M, d, b, m) { const g = M.txg; for (let c = 0; c < NCH; c++) g[c] = c <= 3 ? d : c === 4 ? b : m; }
class Engine {
  constructor(sr) { this.sr = sr; this.decks = [new Deck(sr, 0), new Deck(sr, 1)]; this.mixes = [this.decks[0].mix, this.decks[1].mix]; this.master = new Master(sr);
    this.lead = 0; this.pending = null; this.tx = null; this.sched = []; this.calMaster = [0, 0]; this.target = [-8, -8]; this.agc = 0; this.mGain = 0; this.blocks = 0; this.posted = 0; this.cpu = 0; this.xf = 0; this.outbox = []; this.bankAsked = new Set(); this.userDrums = {}; for (const D of this.decks) D.bankP.user = this.userDrums; this.cueOn = [0, 0]; this.cueMix = 0; this.cueSplit = 0; this.cueG = 1; this.cueLim = new Limiter(sr); this.eco = 0; this.pw = new Float64Array(2); this.ovl = 0; this.level = -2; this.heals = 0; this.healAt = -1e9; this.healRun = 0; this.healBad = 0; this.fails = 0; this.failAt = -1e9; this.failNext = 0; shape(this); }
  // ---- commands ----
  // (off: the sample inside the next block where a command that makes a sound starts; 0 = the start of the block. Only runSched sets it)
  cmd(m, off) { if (!cmdOk(m)) { this.outbox.push({ type: 'rejected', cmd: m && m.type }); return; } const D = this.decks[m.deck | 0]; off = off | 0;
    switch (m.type) {
      case 'load': if (this.tx && (this.tx.b === (m.deck | 0) || this.tx.a === (m.deck | 0))) this.cancelTx('load'); this.flushAt(m.deck | 0); D.load(m.score, m.cal); this.restoreMix(D, !!m.play); this.calMaster[m.deck | 0] = m.cal && Number.isFinite(m.cal.master) ? m.cal.master : 0; this.target[m.deck | 0] = m.score.mix && Number.isFinite(m.score.mix.lufs) ? m.score.mix.lufs : -8; if (m.bpm) D.setBpm(m.bpm); if (m.from != null) D.seek(m.from); D.playing = m.play ? 1 : 0; if ((m.deck | 0) === this.lead || !this.decks[this.lead].playing) { this.lead = m.deck | 0; this.master.setTempo(D.bpm); this.roomFor(D); } this.wantBank(D); break;
      case 'swapScore': D.pend = m.score; D.pendAt = m.atStep ?? D.pos; break; // re-roll: same timeline, new events, swapped on a bar line
      case 'glide': D.glideTo = m.bpm; D.glideRate = (m.bpm - D.bpm) / (m.steps ? Math.max(1, m.steps) : Math.max(16, (m.bars || 16) * 16)); break; // m.steps: a short glide (an external clock is followed beat by beat) // tempo glide per step (synthesised: pitch never changes)
      case 'gain': D.mix.user = clamp(m.v, 0, 1.5); break;
      case 'trim': D.mix.trim = dbToGain(clamp(m.db, -6, 6)); if (m.now) D.mix.trimS = D.mix.trim; break; // per-track auto-gain from the loudness pre-analysis
      case 'chanOn': D.chanOn[m.ch] = m.on ? 1 : 0; break;
      case 'play': this.restoreMix(D, true); D.playing = 1; if (!this.decks[this.lead].playing) { this.lead = m.deck | 0; this.master.setTempo(D.bpm); } break;
      case 'pause': if (this.tx && this.tx.b === (m.deck | 0)) this.cancelTx('pause'); D.playing = 0; D.allOff(); D.glideRate = 0; break; // (pausing the incoming deck cancels the mix: the outgoing deck stays on air)
      case 'seek': this.flushAt(m.deck | 0); D.seek(m.step); break;
      case 'jump': D.jumpAt = m.atStep; D.jumpTo = m.step; break; // quantised jump (applied when the deck reaches atStep)
      case 'loop': if (m.from >= 0) this.flushAt(m.deck | 0); D.loopFrom = m.from; D.loopTo = m.to; break; // (a held loop never reaches a step beyond it: what was planned for the line after it is settled now)
      case 'bpm': D.setBpm(m.bpm); D.glideRate = 0; if (this.tx && this.tx.started) { for (const X of this.decks) if (X.playing) { X.setBpm(m.bpm); X.glideRate = 0; } } if ((m.deck | 0) === this.lead || (this.tx && this.tx.started)) this.master.setTempo(m.bpm); break; // during a mix both decks follow (one tempo, no drift)
      case 'mute': D.mix.s[m.ch].mute = m.on ? 1 : 0; break;
      case 'partGain': if (m.ch >= 0 && m.ch < NCH) D.mix.ug[m.ch | 0] = clamp(m.v, 0, 1.5); break; // (v9.3) a part's level (EDIT · Mix), on top of the calibrated balance
      case 'eq': D.mix.low = clamp(m.low ?? D.mix.low, -40, 12); D.mix.mid = clamp(m.mid ?? D.mix.mid, -40, 12); D.mix.high = clamp(m.high ?? D.mix.high, -40, 12); break; // (v9.2 review) clamped: EQ high = 1e9 dB overflowed the filter, and every self-heal copied it back (333 heals in 1000 blocks)
      case 'filter': D.mix.filter = clamp(m.v, -1, 1); break;
      case 'fader': D.mix.fader = clamp(m.v, 0, 1.2); break;
      case 'start': this.pending = { deck: m.deck | 0, atStep: this.futureLine(m.atStep), from: m.from || 0 }; break; // start deck synced to the lead deck's grid (a line already passed moves to the next bar)
      case 'transition': { if (this.tx) this.cancelTx('replaced'); const at = this.futureLine(m.atStep, m.from | 0), len = Math.max(16, Math.round(m.bars || 16) * 16), Bd = this.decks[m.deck | 0];
        // (v9.2) the bass swap lands ON a bar line — the mix's middle by default, where Auto-DJ puts the outgoing track's outro and the
        // incoming one's bass comes in (it was 60 % of the mix, over one beat: mid-beat, and a 3–4.5 dB hole in the bars before it)
        this.restoreMix(Bd, false); Bd.txRest = 0; Bd.mix.high = 0; Bd.mix.filter = 0; // (the mix's automation owns the incoming fader from here)
        const nb = len / 16, swapBar = m.swap != null ? clamp(Math.round(nb * m.swap), 1, nb - 1) : this.swapBar(Bd, m.fromB || 0, nb);
        this.txClear(this.decks[m.from | 0]); this.txClear(Bd); this.tx = { a: m.from | 0, b: m.deck | 0, s: at, len, swapAt: at + swapBar * 16, kind: TX_SHAPES[m.kind] || 1, started: 0, mot: 0 }; this.pending = { deck: m.deck | 0, atStep: at, from: m.fromB || 0 }; break; }
      case 'cancelTx': this.cancelTx('ui'); break;
      case 'space': this.master.setSpace(m.t60, m.damp); break;
      case 'kit': D.tweak(m.slot, m.p); this.wantBank(D); break;
      case 'drumBank': if (m.sr === this.sr && typeof m.family === 'string' && m.bank && BANK_VOICES.every((k) => Array.isArray(m.bank[k]) && m.bank[k].length && m.bank[k].every((b) => b instanceof Float32Array))) DRUMBANKS[m.family + '@' + m.sr] = { family: m.family, sr: m.sr, v: m.bank }; this.bankAsked.delete(m.family); break; // a family's one-shots, rendered off the audio thread
      case 'drumSample': if (BANK_VOICES.indexOf(m.key) >= 0) { if (Array.isArray(m.bufs) && m.bufs.length && m.bufs.every((b) => b instanceof Float32Array && b.length > 8)) this.userDrums[m.key] = m.bufs; else delete this.userDrums[m.key]; } break; // the person's own sample of one drum voice (both decks)
      case 'energy': D.setEnergy(m.v); break;
      case 'color': D.mix.setColor(typeof m.kind === 'string' ? m.kind : null, m.v); break; // (v9.3) the Color FX knob: kind filter | dub | space | noise | crush, v −1…1
      case 'groove': if (m.density != null) D.density = clamp(m.density, 0, 1); if (m.swing != null) { const G = GENRE_BY_ID[D.gid]; D.swingX = Math.max(0, (clamp(m.swing, 50, 75) - (G ? G.swing : 50)) / 50); } break; // (v9.3) Density 0…1 (0.5 = as written), Swing 50…75 % (at least the genre's own)
      case 'fx': if (m.name === 'repeat' || m.name === 'tape' || m.name === 'swirl') { D.liveMotion(m.name, m.on, m.amt); break; } { const i = FX_NAMES.indexOf(m.name), part = m.ch != null && m.ch >= 0 && m.ch < NCH; if (part && m.on) { if (D.mix.pfxCh !== (m.ch | 0)) for (let k = 0; k < FX_N; k++) D.mix.pfx.set(k, false); D.mix.pfxCh = m.ch | 0; } (part ? D.mix.pfx : D.mix.dfx).set(i, m.on, m.amt, m.beat, m.p, !!m.q); } break; /* (v9.3) beat: an index into FX_BEATS; p: the effect's own parameters; q: switch on the next beat; ch: one part only */ // performance FX rack: { name, on, amt } // live sound edit (no re-compose)
      case 'sends': { const c = Object.assign({}, D.sendCfg || { verb: 0.2, delay: 0.15, sc: 0.3 }, m.p); D.sendCfg = c; D.mix.setSends(c); D.applyAuto(); break; }
      case 'fxNow': D.fx.trigger(off, m.kind | 0, m.v ?? 1, (m.until != null ? Math.max(1, m.until - (D.pos + off / D.sps)) : m.steps || 16) * D.sps, m.note || 0, m.pan || 0); break; // performance FX: riser 0 · impact 1 · down 2 · sweep 3 · snare-up 4 — m.until: it ends exactly on that step, wherever it starts
      // a command that waits for the deck to reach a step — the engine does the timing, as for a quantised jump, so the render-ahead, the output
      // latency and a busy page cannot move it: m.list runs in the block that holds atStep (sounds start on the exact sample). m.rest: a command that
      // puts something back (an energy dip's return, a filter released); if the deck jumps, loads or loops first it runs at once, the others are dropped
      case 'at': this.sched.push({ deck: m.deck | 0, at: m.atStep, list: m.list || [], rest: m.rest ? 1 : 0, id: m.id }); break;
      case 'cancelAt': this.flushAt(m.deck | 0); break;
      case 'throw': D.mix.throwT = (m.steps || 4) * D.sps; break; // reverb/delay throw: everything on the deck into the sends for N steps
      // headphone cue: per-deck cue buttons, cue/master blend (0 = cue only … 1 = master only), split = one headphone (master
      // mono left, cue mono right) on the main output, gain in dB. The cue bus is pre-fader and goes to the processor's 2nd output.
      case 'eco': this.setEco(m.on); break;
      // output level (dB against the genre's calibrated club loudness): 0 club (−8 LUFS), −2 balanced (default: the limiter works
      // ~2 dB less — more punch, less fatigue), −4 home. Changes glide with the master gain.
      // a part's live sends: echo (−1 = back to the score's automation) and extra space (reverb), per channel
      case 'partfx': { const c = clamp(m.ch | 0, 0, NCH - 1); if (m.echo != null) D.liveEch[c] = m.echo < 0 ? -1 : clamp(m.echo, 0, 1); if (m.verb != null) D.mix.s[c].revAdd = clamp(m.verb, 0, 1.5); D.applyAuto(); break; }
      case 'fill': D.setFill(m.kind, !!m.on); break; // live drum fill: roll · hats · kick · toms (tuned to the chord)
      case 'wasm': WV.off = !m.on; break; // A/B: the synth voices in WebAssembly (default) or JavaScript
      case 'level': this.level = clamp(+m.db || 0, -8, 0); break;
      case 'seed': noiseSeed(m.v); break;
      case 'testFail': this.failNext = clamp(m.n | 0, 1, 5); break; // tools: the next render() throws (n times) — the suites check that every host (worklet, render-ahead worker, ScriptProcessor) catches it and the engine recovers // tools: restart the noise generator at a known state, so that a capture of the live engine can be compared sample for sample with an offline render

      case 'cue': if (m.on != null) this.cueOn[m.deck | 0] = m.on ? 1 : 0; if (m.mix != null) this.cueMix = clamp(m.mix, 0, 1); if (m.split != null) this.cueSplit = m.split ? 1 : 0; if (m.db != null) this.cueG = dbToGain(clamp(m.db, -24, 6)); break;
    }
  }
  // ---- per block ----
  render(L, R, n, CL, CR) {
    if (this.failNext > 0) { this.failNext--; throw new Error('requested by a test (testFail)'); } // tools: see the testFail command
    // (v9.2) the decks and the mixer work in blocks of up to 128 samples (every host renders 128); a longer block is rendered as 128-sample
    // pieces — 9.1 let the samples past 128 through unwritten (a 512-sample block was 3/4 garbage, which the self-heal now catches)
    if (n > 128) { for (let o = 0; o < n; o += 128) { const k = Math.min(128, n - o), e = o + k; this.render(L.subarray(o, e), R.subarray(o, e), k, CL && CL.subarray(o, e), CR && CR.subarray(o, e)); } return; }
    const A = this.decks[this.lead];
    // synced start: the other deck begins exactly when the lead deck crosses atStep (sub-block accurate)
    if (this.pending) { const P = this.pending, B = this.decks[P.deck];
      if (A.playing && A.pos - P.atStep > 0.25) { const nl = Math.ceil(A.pos / 16 + 1e-9) * 16; if (this.tx && this.tx.s === P.atStep) { const d = nl - P.atStep; this.tx.s += d; this.tx.swapAt += d; } P.atStep = nl; } // (the outgoing deck jumped past the line: the start moves to the next bar — never off the grid)
      if (A.playing && A.pos + n / A.sps > P.atStep) { const k = Math.max(0, (P.atStep - A.pos) * A.sps); B.setBpm(A.bpm); B.seekKeep(P.from); B.pos = P.from - k / B.sps; B.playing = 1; this.pending = null; if (this.tx) { this.tx.started = 1; B.mixLift = -1; B.mix.fader = 0; B.mix.faderS = 0; } } } // (v9.2 review) the mix brings the incoming deck in from silence — its fader sat at 1 since its load, so its first downbeat came through at −13 dB for ~20 ms before the fade-in caught it
    if (this.sched.length) this.runSched(n); // (before the jumps: what is due before the line of a jump belongs to the stretch it leaves)
    for (const D of this.decks) if (D.jumpAt >= 0 && D.playing && D.pos + n / D.sps > D.jumpAt) { const k = (D.jumpAt - D.pos) * D.sps; this.flushAt(D.id); D.seek(D.jumpTo - k / D.sps); D.jumpAt = -1; }
    for (const D of this.decks) {
      if (D.pend && D.pos + n / D.sps > D.pendAt) { const S = D.pend; D.pend = null; D.score = S; D.ev = S.ev; D.N = S.ev.n; D.sections = S.sections; D.bars = S.meta ? S.meta.bars : D.bars; D.softKits(S); this.wantBank(D); D.seekKeep(D.pos); if (S.mix) this.target[D.id] = S.mix.lufs; this.outbox.push({ type: 'swapped', deck: D.id, pos: D.pos }); } // the swap lands in the block that contains the bar line (≤ 2.9 ms early)
      if (D.glideRate !== 0 && D.playing) { let b = D.bpm + D.glideRate * (n / D.sps); if ((D.glideRate > 0 && b >= D.glideTo) || (D.glideRate < 0 && b <= D.glideTo)) { b = D.glideTo; D.glideRate = 0; } D.setBpm(b); if (D === this.decks[this.lead]) this.master.setTempo(b); }
    }
    if (this.tx) { this.automateTx(); if (this.tx && this.tx.started) { const Ta = this.decks[this.tx.a], Tb = this.decks[this.tx.b]; if (Tb.playing && Ta.playing && Math.abs(Tb.bpm - Ta.bpm) > 1e-9) Tb.setBpm(Ta.bpm); } } // one tempo through a mix: the incoming deck follows the outgoing (a glide or a tempo change on one deck drifted 1.7 sixteenths in 8 s)
    const d0 = this.decks[0], d1 = this.decks[1];
    d0.process(n); d1.process(n);
    // master loudness follows the audible deck's calibration (crossfaded)
    const w1 = d1.playing ? d1.mix.faderS : 0, w0 = d0.playing ? d0.mix.faderS : 0, tot = w0 + w1 || 1;
    // (the section's intended level, mix.secDb, is part of the target: a groove meant to sit 2 LU under the drop is not 'too quiet')
    // slow loudness servo (±3 dB, ~12 s per dB): calibration gets each genre close, this lands each TRACK on target.
    // It only listens in grooves/drops of the lead deck outside transitions, and holds its value everywhere else.
    const Sx = A.sections ? A.sections[A.secIdx] : null; const M = this.master;
    if (A.playing && !this.tx && Sx && (Sx.type === 'drop' || Sx.type === 'groove') && A.mix.secDb > -3 && M.meter.nb > 30 && M.meter.short > -40) { const err = this.target[this.lead] + this.level + A.mix.secDb - M.meter.short; this.agc = clamp(this.agc + clamp(err, -4, 4) * (n / this.sr) / 8, -2.5, 2.5); }
    // two tracks at full level add up (+3 dB on full-bodied music: measured +3 LU in the middle of a trance → psy mix). While both
    // decks sound, the master gives back that sum (power-weighted by the faders) — the room stays at one level through the mix
    let ovl = 0; if (d0.playing && d1.playing) { for (let k = 0; k < 2; k++) { const o = this.mixes[k], a = o.outL, b = o.outR; let e = 0; for (let i = 0; i < n; i++) e += a[i] * a[i] + b[i] * b[i]; this.pw[k] += (e / n - this.pw[k]) * (n / (0.4 * this.sr)); }
      const pa = this.pw[0], pb = this.pw[1]; if (pa > 1e-7 && pb > 1e-7) ovl = 9 * Math.log10(Math.max(pa, pb) / (pa + pb)); } else { this.pw[0] = this.pw[1] = 0; } // normalise the sum to the louder deck
    this.ovl += (ovl - this.ovl) * 0.02; 
    M.setLoudness((this.calMaster[0] * w0 + this.calMaster[1] * w1) / tot + this.agc + this.ovl + this.level);
    this.master.run(this.mixes, 2, L, R, n);
    { let bad = 0; for (let i = 0; i < n; i++) { const a = L[i], b = R[i]; if (a - a !== 0 || b - b !== 0) { bad = 1; break; } } if (bad) this.heal(L, R, n); } // (v9.2) self-heal: x − x is not 0 only for NaN / ±Infinity
    if (CL || this.cueSplit) this.renderCue(L, R, n, CL, CR);
    if (A.ended && this.decks[this.lead ^ 1].playing) this.lead ^= 1;
    this.blocks++;
  }
  // the commands that wait for a step (cmd 'at'): those whose step the deck crosses inside this block run now, a sound starting on its exact sample
  runSched(n) { const due = [], keep = [];
    for (const e of this.sched) { const D = this.decks[e.deck], end = D.pos + n / D.sps; if (D.playing && (D.jumpAt >= 0 && D.jumpAt < end ? D.jumpAt : end) > e.at) due.push(e); else keep.push(e); } // (a jump in this block ends the stretch at its line)
    this.sched = keep;
    for (const e of due) { const D = this.decks[e.deck], off = clamp(Math.round((e.at - D.pos) * D.sps), 0, n - 1); this.runList(e, off); this.outbox.push({ type: 'at', how: 'ran', deck: e.deck, at: e.at, pos: D.pos, off, id: e.id }); } }
  runList(e, off) { for (const c of e.list) if (c.type !== 'at') this.cmd(c.deck == null ? Object.assign({}, c, { deck: e.deck }) : c, off); }
  // the deck's position is about to jump (a seek, a jump, a new track, a held loop): what was planned for the stretch it leaves is settled now —
  // a command that puts something back runs at once, the others are dropped
  flushAt(deck) { if (!this.sched.length) return; const mine = this.sched.filter((e) => e.deck === deck); if (!mine.length) return; this.sched = this.sched.filter((e) => e.deck !== deck); for (const e of mine) { if (e.rest) this.runList(e, 0); this.outbox.push({ type: 'at', how: e.rest ? 'settled' : 'dropped', deck, at: e.at, pos: this.decks[deck].pos, off: 0, id: e.id }); } }
  // eco 1: the channel character (saturators, transient shapers) off. eco 2 (the machine still cannot keep up): also wavetable
  // unison capped at 2 voices, supersaws on 3 saws instead of 7 (level-matched), the shimmer / resonator buses bypassed — thinner,
  // never broken. The render-ahead worker steps by its own load and cushion (engine_worker.js), the worklet by its load
  roomFor(D) { const sp = D.space; if (sp) this.master.setSpace(sp[0], sp[1]); }
  // (v9.3) the live engine's effect lines, made once at start (not on the audio thread at the first press); test shadows and analysis decks never need them
  prealloc() { for (const D of this.decks) { const M = D.mix; M.dfx.prealloc(1, 1, 1); M.pfx.prealloc(1, 1, 1); M.cfx.prealloc(0, 0, 1); M.tfx.prealloc(0, 1, 0); } return this; }
  // a deck plays a drum family whose one-shots are not here yet: ask once (the page renders it in the analysis worker); its synthesized voices play meanwhile
  wantBank(D) { const B = D.bankP; if (B.missing() && !this.bankAsked.has(B.fam)) { this.bankAsked.add(B.fam); this.outbox.push({ type: 'needBank', family: B.fam, sr: this.sr }); } }
  setEco(on) { on = on | 0; if (on === this.eco) return; const prev = this.eco; this.eco = on; ECO.level = on; for (const D of this.decks) D.mix.setEco(on ? 1 : 0); this.outbox.push({ type: 'eco', on, level: on, prev }); }
  renderCue(L, R, n, CL, CR) { const c0 = this.cueOn[0] && this.decks[0].playing, c1 = this.cueOn[1] && this.decks[1].playing, M0 = this.mixes[0], M1 = this.mixes[1], mx = this.cueMix, g = this.cueG * this.master.gainS;
    for (let i = 0; i < n; i++) { let a = 0, b = 0; if (c0) { a += M0.preL[i]; b += M0.preR[i]; } if (c1) { a += M1.preL[i]; b += M1.preR[i]; }
      this.cueLim.run(softClip(a * g, 1.25), softClip(b * g, 1.25)); a = this.cueLim.outL * (1 - mx) + L[i] * mx; b = this.cueLim.outR * (1 - mx) + R[i] * mx; // its own limiter: the cue is as loud as the room, never clips
      if (CL) { CL[i] = a; CR[i] = b; }
      if (this.cueSplit) { const m = (L[i] + R[i]) * 0.5; L[i] = m; R[i] = (a + b) * 0.5; } } }
  // the mix is called off (the incoming deck stopped or was reloaded, a new mix replaced it, the page asked): the outgoing deck
  // carries on as it was before the mix — fader up, EQ flat, filter open — and the incoming deck leaves (v9.2: nothing cancelled a
  // mix, and pausing the incoming deck mid-mix ended the set in silence)
  // (v9.2 review) the incoming deck always leaves a called-off mix with txRest set, so its fader comes back up the next time it is
  // played or loaded to play: arming had cleared txRest on a deck whose fader a mix-out had left at 0, and a mix called off before
  // it started (or after its incoming deck had stopped) left that deck at fader 0 — its next Play was silent (−51.7 LUFS)
  cancelTx(why) { const T = this.tx; this.pending = null; if (!T) return; const A = this.decks[T.a], B = this.decks[T.b], MB = B.mix; this.txClear(A, true); this.txClear(B); this.tx = null; MB.filter = 0;
    if (T.started) { const MA = A.mix; MA.fader = 1; MA.low = 0; MA.high = 0; MA.filter = 0; if (A.playing) { this.lead = T.a; this.master.setTempo(A.bpm); this.roomFor(A); }
      if (why !== 'load') { if (B.playing) { B.playing = 0; B.allOff(); } MB.fader = 0; } MB.low = 0; B.txRest = 1; }
    else if (!B.playing && MB.fader < 1) B.txRest = 1;
    this.outbox.push({ type: 'txCancelled', deck: T.b, why }); }
  // after a mix-out the deck keeps its fader down (and its EQ as the mix left it) until it is loaded or played again
  restoreMix(D, fader) { if (!D.txRest) return; const M = D.mix; M.txg.fill(1); M.low = 0; M.high = 0; M.filter = 0; if (fader) { M.fader = 1; D.txRest = 0; } }
  // SELF-HEAL (v9.2): a non-finite sample reached the master — whatever caused it (a bug, a value no check caught), it must not
  // silence the set. The block goes out silent; a deck whose own output is not finite is rebuilt where it was (same track, same
  // step, same tempo, its fader / EQ / trim / mutes kept); the master (reverb, delay, glue, limiter: the state a NaN poisons) and
  // the engine's own level state are rebuilt fresh. A second heal within ~1 s rebuilds both decks (the NaN came from somewhere the
  // first look did not see). Measured before: one NaN in a command silenced both decks for good.
  heal(L, R, n, why) { L.fill(0, 0, n); R.fill(0, 0, n); const again = this.blocks - this.healAt < 400, sick = []; this.healAt = this.blocks;
    if (!why) { this.healRun = again ? (this.healRun | 0) + 1 : 1; if (!again) this.healBad = 0; } // (a rescue's heals are counted by the rescue)
    // each deck's own output is looked at every time (healBad: the decks found broken during this run of heals — the one to stop if it
    // keeps breaking). A second heal within ~1 s rebuilds the decks found broken — both when none was (the NaN sits where this look
    // does not see); the review of the fix: it rebuilt the healthy deck on air every time too, three glitches before the stop
    for (let d = 0; d < 2; d++) { const M = this.decks[d].mix; let bad = false; for (let i = 0; i < n; i++) { const a = M.outL[i] + M.outR[i] + M.revL[i] + M.revR[i] + M.dlyL[i] + M.dlyR[i]; if (a - a !== 0) { bad = true; break; } }
      if (bad && !why) this.healBad |= 1 << d; if (bad || why || (again && !(this.healBad & (1 << (d ^ 1))))) { this.rebuildDeck(d); sick.push(d); } }
    for (const [k, v] of [['agc', 0], ['mGain', 0], ['ovl', 0], ['level', -2], ['xf', 0], ['cueMix', 0], ['cueG', 1]]) if (!Number.isFinite(this[k])) this[k] = v;
    for (let d = 0; d < 2; d++) { if (!Number.isFinite(this.calMaster[d])) this.calMaster[d] = 0; if (!Number.isFinite(this.target[d])) this.target[d] = -8; } this.pw[0] = this.pw[1] = 0;
    const A = this.decks[this.lead]; this.master = new Master(this.sr); this.master.setTempo(A.bpm); this.roomFor(A); this.cueLim = new Limiter(this.sr);
    this.heals++; this.outbox.push({ type: 'healed', decks: sick, n: this.heals, why: why || 'non-finite audio' });
    // (v9.2 review) a value that breaks the sound again after every rebuild used to loop: a heal on every block, each one silent and
    // 5–14 ms long. Four heals within ~1 s stop the deck whose own sound kept breaking — a mix it is part of is called off (the other
    // deck plays on) or, when it is the outgoing one, handed over — and tell the page; both decks only when neither one was found
    if (this.healRun >= 4 && why !== 'error') this.stopSick(); }
  stopSick() { const mask = this.healBad || 3, T = this.tx; this.healRun = 0; this.healBad = 0;
    if (T) { if (mask !== 3 && (mask & (1 << T.a)) && T.started) this.finishTx(); else this.cancelTx('engine error'); }
    for (let d = 0; d < 2; d++) if (mask & (1 << d)) { const D = this.decks[d]; D.playing = 0; D.allOff(); if (this.lead === d && this.decks[d ^ 1].playing) { this.lead = d ^ 1; this.master.setTempo(this.decks[d ^ 1].bpm); this.roomFor(this.decks[d ^ 1]); } }
    if (mask === 3) this.outbox.push({ type: 'engineReset', msg: 'the sound broke again after every rebuild', fails: 4 });
    else this.outbox.push({ type: 'deckStopped', deck: mask === 1 ? 0 : 1, msg: 'its track breaks the sound again after every rebuild' }); }
  // a deck rebuilt from scratch — a NaN can sit in any filter, delay or envelope of its instruments as well as in its mixer — and
  // reloaded where it was: the same track at the same step and tempo, its fader, EQ, trim, energy, mutes, channel switches and
  // loop kept (the kit tweaks made by hand since the load are not: the track's own kits come back)
  rebuildDeck(d) { const D = this.decks[d], old = D.mix, fin = (v, x) => (Number.isFinite(v) ? v : x), N = new Deck(this.sr, d), nm = N.mix; N.bankP.user = this.userDrums;
    if (D.score) { try { N.load(D.score, D.cal); N.bankP.setFamily(D.bankP.fam); N.bankP.prm = D.bankP.prm; for (let c = 0; c < NCH; c++) N.mix.ug[c] = clamp(fin(old.ug[c], 1), 0, 1.5); N.density = clamp(fin(D.density, 0.5), 0, 1); N.swingX = clamp(fin(D.swingX, 0), 0, 0.5); N.setBpm(fin(D.bpm, D.score.meta.bpm || 124)); N.seek(Math.max(0, fin(D.pos, 0))); N.playing = D.playing && !D.ended ? 1 : 0; N.setEnergy(fin(D.energy, 0.5)); N.loopFrom = fin(D.loopFrom, -1); N.loopTo = fin(D.loopTo, -1); } catch (e) { N.playing = 0; } }
    for (const [k, lo, hi] of [['fader', 0, 1.2], ['faderS', 0, 1.2], ['user', 0, 1.5], ['userS', 0, 1.5], ['trim', 0.5, 2], ['trimS', 0.5, 2], ['low', -40, 12], ['mid', -40, 12], ['high', -40, 12], ['filter', -1, 1]]) nm[k] = clamp(fin(old[k], nm[k]), lo, hi); // (v9.2 review) within range too: a rebuild must not copy back the value that broke the deck
    for (let c = 0; c < NCH; c++) { nm.s[c].mute = old.s[c].mute; N.chanOn[c] = D.chanOn[c]; }
    N.txRest = D.txRest; nm.setCharacter(fin(old.heat, 1), fin(old.punch, 1)); nm.setEco(this.eco ? 1 : 0);
    this.decks[d] = N; this.mixes[d] = nm; return N; }
  // RESCUE (v9.2): render() threw. Nothing caught that before: in the worklet the processor died (silence until a reload), in the
  // render-ahead worker the chunks stopped. Now the block goes out silent and the engine rebuilds itself where it was (a mix in
  // flight is called off, the waiting commands dropped). Three failures within ~2 s mean the music itself fails: the decks stop and
  // the page is told (engineReset), instead of failing on every block.
  rescue(err, L, R, n) { this.blocks++; this.fails = this.blocks - this.failAt < 800 ? this.fails + 1 : 1; this.failAt = this.blocks; const msg = String((err && err.message) || err).slice(0, 160);
    try { this.pending = null; this.sched.length = 0; if (this.tx) { try { this.cancelTx('engine error'); } catch (e3) { this.tx = null; } } // (v9.2 review) called off properly: dropping the mix left both decks at fader 1 and the incoming bass at −30 dB for good
      if (this.fails >= 3) { this.heal(L, R, n, 'error'); for (const D of this.decks) D.playing = 0; this.outbox.push({ type: 'engineReset', msg, fails: this.fails }); }
      else this.heal(L, R, n, 'error'); } catch (e2) { /* the rebuild itself failed: the next block tries again */ }
    this.outbox.push({ type: 'engineError', msg, fails: this.fails }); }
  // a step that is already behind the deck (a late command, a jump) moves to the deck's next bar line
  futureLine(at, deck) { const A = this.decks[deck != null ? deck : this.lead]; if (!A.playing || !(at <= A.pos + 0.25)) return at; return Math.ceil((A.pos + 0.25) / 16) * 16; }
  // which bar of a mix the bass swaps on (v9.2): the first bar line from the middle on where the incoming track plays bass, at the
  // latest where the outgoing one starts to fade (70 %). An incoming intro that brings its bass in late — the additive intros: drums
  // first, the bass four bars into a section — left four bars with no bass at all when the swap sat on the middle (measured: tech
  // house → melodic techno, mix bars 16–19 3.5 dB under the bars around them). Channel 4 is the bass (composer CH.bass).
  swapBar(Bd, fromB, nb) { const mid = clamp(Math.round(nb / 2), 1, nb - 1), last = Math.max(mid, Math.min(nb - 1, Math.floor(nb * 0.7))), ev = Bd.ev; if (!ev || last === mid) return mid;
    let k = last; const ch = ev.ch, t = ev.t; for (let i = 0, n = ev.n; i < n; i++) if (ch[i] === 4) { const b = Math.floor((t[i] - fromB) / 16); if (b >= mid && b < k) k = b; } return k; }
  // (v9.3) THE TRANSITION LIBRARY. u: 0…1 through the mix (A's position); the swap line is a bar line (swapAt). Every style owns, while
  // it runs, the two faders, the EQs and filters, the per-part transition gains (txg: a part handed over, never a mute the person set),
  // a transition FX unit per deck (tfx: its echo / noise rings on after the dry sound has left) and, for roll and brake, the motion
  // unit. 1 blend: EQ blend, bass swap · 2 cut: drop swap on the line, a delay throw on the last beat · 3 echo: the outgoing track
  // leaves into its own echo · 4 filter: B opens from a low-pass while A climbs into a high-pass · 5 stems: drums, then bass, then
  // music change hands, each on a bar line · 6 breakdown: B's music (no drums, no bass) over A's groove, then the rest of B on the
  // line · 7 roll: A's last bar rolls 1/4 → 1/8 → 1/16 into the cut · 8 brake: A's tape stops on the last beat · 9 riser: a noise
  // riser and a high-pass climb over A, B lands on the line · 10 tease: two one-bar glimpses of B's music, then a blend.
  automateTx() { const T = this.tx, A = this.decks[T.a], B = this.decks[T.b]; if (!T.started) return;
    if (!B.playing) { this.cancelTx('incoming stopped'); return; }
    if (!A.playing) { this.finishTx(); return; } // (v9.2) the outgoing track ended or was stopped before the mix did: the incoming one carries on at full (the mix hung with the bass held out)
    const u = clamp((A.pos - T.s) / T.len, 0, 1), MA = A.mix, MB = B.mix, kill = -30, K = T.kind, pos = A.pos, sw = clamp((pos - T.swapAt) / 2, 0, 1), us = (T.swapAt - T.s) / T.len;
    const fin = txFin, fout = txFout, parts = txParts, bars = (k) => txBar(T, k); // (one small closure per block during a mix)
    if (K === 1) { MB.fader = fin(u, 0, 0.35); MB.low = kill * (1 - sw); MA.low = kill * sw; MA.fader = fout(u, 0.7, 1); MA.high = -12 * clamp((u - 0.62) / 0.38, 0, 1); }
    else if (K === 2 || K === 7 || K === 8 || K === 9) { // the hard styles: B silent until the line, then all of it; A leaves on the line
      const pre = pos >= T.swapAt ? 1 : 0, beat = T.swapAt - pos; MB.fader = pre; MB.low = 0; MA.fader = 1 - pre; MA.low = 0;
      if (K === 2) { MA.high = -6 * clamp(1 - beat / 16, 0, 1) * (1 - pre); if (beat <= 4 && beat > 0 && !T.thr) { T.thr = 1; MA.throwT = 4 * A.sps; } }
      else if (K === 7) { const rc = beat > 16 || pre ? 0 : beat > 8 ? 2 : beat > 4 ? 3 : 4; if (rc !== T.rc) { T.rc = rc; A.live.repeat = rc ? 1 : 0; MA.motion.setRepeat(rc || A.repCode); T.mot |= 1; } if (pre && !T.thr) { T.thr = 1; MA.throwT = 2 * A.sps; } }
      else if (K === 8) { if (beat <= 4 && beat > 0 && !(T.mot & 2)) { T.mot |= 2; A.live.tape = 1; MA.motion.tapeRate = -1 / (beat * A.sps); } }
      else { const span = Math.max(16, Math.min(T.swapAt - T.s, 8 * 16)), r0 = T.swapAt - span, ur = clamp((pos - r0) / span, 0, 1); if (pos >= r0 && !pre && !MA.tfx.on[9]) MA.tfx.set(9, true, 0.75, null, null, false, span / 4); if (pre && MA.tfx.on[9]) MA.tfx.set(9, false);
        MA.filter = 0.65 * ur * ur * (1 - pre); if (pre && !T.thr) { T.thr = 1; MA.throwT = 4 * A.sps; } } }
    else if (K === 3) { // echo out: B blends in as usual; A's echo engages a bar before the line, its dry sound leaves over the beat after it
      MB.fader = fin(u, 0, 0.35); MB.low = kill * (1 - sw); MA.low = kill * sw; MA.fader = 1;
      const e0 = T.swapAt - 16; if (pos >= e0 && !T.ech) { T.ech = 1; MA.tfx.set(6, true, 0.75, 5, { fb: 0.62, tone: -0.35, pp: 1, wob: 0.3 }); } if (pos >= T.swapAt + 4 && T.ech === 1) { T.ech = 2; MA.tfx.set(6, false); }
      parts(MA, 1 - clamp((pos - T.swapAt) / 4, 0, 1), 1 - clamp((pos - T.swapAt) / 4, 0, 1), 1 - clamp((pos - T.swapAt) / 4, 0, 1)); MA.filter = 0.35 * clamp((pos - e0) / 16, 0, 1); }
    else if (K === 4) { // filter blend
      MB.fader = fin(u, 0, 0.25); MB.filter = -0.9 * (1 - clamp(u / Math.max(0.05, us), 0, 1)) ** 0.6; MB.low = kill * (1 - sw); MA.low = kill * sw;
      MA.filter = 0.85 * clamp((u - us * 0.6) / (1 - us * 0.6), 0, 1) ** 0.9; MA.fader = fout(u, 0.8, 1); }
    else if (K === 5) { // stems: drums at a quarter, bass on the swap line, music at three quarters — each on a bar line, over half a beat
      const dT = bars(0.25), mT = bars(0.75), h = (t) => clamp((pos - t) / 2, 0, 1), d = h(dT), m = h(mT); MB.fader = 1; MB.low = 0; MA.low = 0; MA.fader = 1;
      parts(MB, d, sw, m); parts(MA, 1 - d, 1 - sw, 1 - m); }
    else if (K === 6) { // breakdown overlay: B's music over A's groove, then B's drums and bass on the line while A leaves
      MB.fader = fin(u, 0, 0.3); MB.low = 0; parts(MB, sw, sw, 1); MA.low = 0; MA.fader = 1 - sw; if (sw > 0 && !T.thr) { T.thr = 1; MA.throwT = 2 * A.sps; } }
    else if (K === 10) { // tease: B's music for one bar at 1/8 and 3/8 of the mix (a beat in, a beat out), then a blend from the middle
      const t1 = bars(0.125), t2 = bars(0.375), g = (t) => clamp((pos - t) / 4, 0, 1) * clamp((t + 16 - pos) / 4, 0, 1), tz = Math.max(g(t1), g(t2)), b0 = 0.5;
      const ub = clamp((u - b0) / (1 - b0), 0, 1), s2 = clamp((pos - bars(0.75)) / 2, 0, 1); MB.fader = Math.max(0.75 * tz, u >= b0 ? fin(ub, 0, 0.35) : 0); parts(MB, u >= b0 ? 1 : 0, u >= b0 ? 1 : 0, 1); MB.low = kill * (1 - s2); MA.low = kill * s2; /* (its bass swaps at three quarters: the blend is its second half) */ MA.fader = fout(ub, 0.7, 1); MA.high = -12 * clamp((ub - 0.62) / 0.38, 0, 1); }
    if (u >= 1) this.finishTx(); }
  // the transition's own state off a deck (its part gains, its FX, the motion it drove): at its start, its end and when it is called off
  txClear(D, keepTails) { const M = D.mix; M.txg.fill(1); for (let k = 0; k < FX_N; k++) if (M.tfx.on[k]) M.tfx.set(k, false); if (!keepTails) for (let k = 0; k < FX_N; k++) if (M.tfx.tailN[k] > 0) { M.tfx.tailN[k] = 0; M.tfx.clearTail(k); }
    if (this.tx && this.tx.mot && D === this.decks[this.tx.a]) { D.live.repeat = 0; D.live.tape = 0; M.motion.setRepeat(D.repCode); M.motion.tapeRate = 0; M.motion.tape = 1; } }
  // the end of a mix: the outgoing deck stops and keeps its fader down — its EQ as the mix left it — until it is loaded or played again
  // (9.1 put its fader and EQ back up in the same block, while its last notes and tails still sounded: a −8…−15 dBFS ghost after every mix)
  finishTx() { const T = this.tx, A = this.decks[T.a], B = this.decks[T.b], MA = A.mix, MB = B.mix; this.txClear(A); this.txClear(B, true); MA.filter = 0; MB.filter = 0;
    A.playing = 0; A.allOff(); A.glideRate = 0; MA.fader = 0; A.txRest = 1; MB.low = 0; MB.fader = 1; this.lead = T.b; this.master.setTempo(B.bpm); this.roomFor(B); this.tx = null; this.outbox.push({ type: 'txDone', deck: T.b }); }
  meters() { const M = this.master, d = this.decks; const corr = M.corrA / Math.sqrt(M.corrB * M.corrC + 1e-12); M.corrA = M.corrB = M.corrC = 0;
    const o = { type: 'meter', lead: this.lead, agc: this.agc, lufsM: M.meter.momentary, lufsS: M.meter.short, tp: gainToDb(M.tpk), gr: gainToDb(M.gr), corr, decks: [] }; M.tpk *= 0.5;
    for (const D of d) { const pk = []; for (let c = 0; c < NCH; c++) { pk.push(D.mix.peak[c]); D.mix.peak[c] *= 0.6; } o.decks.push({ pos: D.pos, bpm: D.bpm, playing: D.playing, sec: D.secIdx, secP: D.secP, ended: D.ended, peaks: pk, fader: D.mix.faderS, low: D.mix.lowS }); }
    if (this.tx) o.tx = { a: this.tx.a, b: this.tx.b, u: this.tx.started ? clamp((d[this.tx.a].pos - this.tx.s) / this.tx.len, 0, 1) : -1, sw: (this.tx.swapAt - this.tx.s) / this.tx.len };
    return o; }
}
    // every live code path is exercised too (score swap, jumps, loops, FX rack, energy, EQ, kit tweaks, sends, cue, transition,
    // glide): measured, the FIRST time a path ran on the audio thread it cost a 6–16 ms block (the JIT re-optimising) — a dropout
function warmUp(m, sr) { const E = new Engine(sr), L = new Float32Array(128), R = new Float32Array(128), CL = new Float32Array(128), CR = new Float32Array(128); const run = (n) => { for (let i = 0; i < n; i++) E.render(L, R, 128, CL, CR); };
      for (const s of m.scores) { E.cmd({ type: 'load', deck: 0, score: s, cal: s.cal || null, play: true, from: s.from || 0 }); run(m.blocks || 300); } // with calibration: the tone EQ / width paths warm too
      const s0 = m.scores[0], s1 = m.scores[1] || s0; E.cmd({ type: 'load', deck: 1, score: s1, cal: null, play: false, from: s1.from || 0 }); const p = () => E.decks[0].pos;
      const seq = [{ type: 'swapScore', deck: 0, score: s0, atStep: p() }, { type: 'jump', deck: 0, atStep: p(), step: 64 }, { type: 'seek', deck: 0, step: (s0.from || 0) }, { type: 'loop', deck: 0, from: 0, to: 64 }, { type: 'loop', deck: 0, from: -1, to: -1 },
        { type: 'energy', deck: 0, v: 0.2 }, { type: 'energy', deck: 0, v: 0.8 }, { type: 'eq', deck: 0, low: -20, mid: -3, high: -6 }, { type: 'filter', deck: 0, v: 0.5 }, { type: 'filter', deck: 0, v: -0.5 }, { type: 'filter', deck: 0, v: 0 }, { type: 'eq', deck: 0, low: 0, mid: 0, high: 0 },
        { type: 'kit', deck: 0, slot: 'chords', p: { cut: 900 } }, { type: 'sends', deck: 0, p: { verb: 0.3, heat: 1.2 } }, { type: 'throw', deck: 0, steps: 4 }, { type: 'fxNow', deck: 0, kind: 0, steps: 16 },
        { type: 'cue', deck: 0, on: true, mix: 0.3 }, { type: 'cue', split: true }, { type: 'cue', split: false }, { type: 'cue', deck: 0, on: false }, { type: 'glide', deck: 0, bpm: 126, bars: 1 }];
      for (const c of seq) { E.cmd(c); run(10); }
      { const D0 = E.decks[0]; // the commands that wait for a step: one that fires, one settled by a jump (both code paths, before anything is audible)
        E.cmd({ type: 'at', deck: 0, atStep: D0.pos + 0.05, list: [{ type: 'fxNow', kind: 4, until: D0.pos + 4 }, { type: 'throw', steps: 1 }, { type: 'energy', v: 0.5 }] }); run(10);
        E.cmd({ type: 'at', deck: 0, atStep: D0.pos + 1e4, rest: 1, list: [{ type: 'energy', v: 0.5 }] }); E.cmd({ type: 'seek', deck: 0, step: s0.from || 0 }); run(4); }
      for (const k of ['roll', 'hats', 'kick', 'toms']) { E.cmd({ type: 'fill', deck: 0, kind: k, on: true }); run(30); E.cmd({ type: 'fill', deck: 0, kind: k, on: false }); }
      // every synth model (and the wavetable's filter types, unison, pitch envelope, volume LFO, tone filter) through the voice
      // path that will play — the WebAssembly one, or JavaScript: the first seconds of a set used to glitch while code that the
      // two warm-up tracks never reached was compiled on the audio thread (measured: 36–46 ms blocks in the first 10 s)
      { if (WV.ok) for (let t = 0; t < WT_NAMES.length; t++) if (!WV.wtDone[t]) { const tab = wtGet(t); for (let k = 0; k < WT_L; k++) WV.wt[t][k].set(tab[k]); WV.wtDone[t] = 1; }
        const Lw = new Float32Array(128), Rw = new Float32Array(128);
        for (const mono of [false, true]) { const S = new Synth(sr, mono ? 1 : 4, mono); S.bpm = 124;
          for (const model of Object.keys(MODEL)) for (const extra of model === 'wt' ? [{ ftype: 0, uni: 7, fold: 0.3, sub: 0.3 }, { ftype: 1, l2Sync: 1 }, { ftype: 2, noiseAmt: 0.1 }, { ftype: 3, vowLfo: 0.5 }, { ftype: 4 }] : [{}, { tone: 0.5, pEnv: 3, lfoAmp: 0.3, lfoSync: 1, mLfoS: 2, mLfo: 0.3 }]) {
            S.setKit(Object.assign({ model }, extra)); for (const nt of mono ? [40] : [48, 60, 67]) S.trigger(0, nt, 0.8, 3000, mono ? { accent: true } : null); if (mono) S.trigger(1500, 43, 0.8, 3000, { slide: true });
            for (let i = 0; i < 24; i++) S.render(Lw, Rw, 128); S.releaseAll(); for (let i = 0; i < 8; i++) S.render(Lw, Rw, 128); } } }
      for (const n of FX_NAMES.concat(['repeat', 'tape', 'swirl'])) { E.cmd({ type: 'fx', deck: 0, name: n, on: true, amt: 0.6 }); run(12); } for (const n of FX_NAMES.concat(['repeat', 'tape', 'swirl'])) E.cmd({ type: 'fx', deck: 0, name: n, on: false }); run(40);
      E.cmd({ type: 'transition', from: 0, deck: 1, atStep: p() + 1, bars: 1, kind: 'blend', fromB: s1.from || 0 }); run(260); E.setEco(1); run(8); E.setEco(0); run(8);
      // the harmonic FX buses and the motion insert (sends, pitched echo, resonator, shimmer, repeat / tape / shifter) — and every
      // wavetable built now: a table built on first use cost a 25–45 ms block in the middle of a track (measured)
      { const D0 = E.decks[0], C = D0.mix.s; for (let t = 0; t < WT_NAMES.length; t++) wtGet(t);
        C[7].ech = 0.5; C[2].rsn = 0.5; C[6].shm = 0.5; D0.mix.echo.pitch = 1; run(30); D0.mix.echo.pitch = 2; D0.mix.reso.setChord(0x91, 0); run(20); D0.mix.motion.setRepeat(3); run(10); D0.mix.motion.setRepeat(0); D0.mix.motion.tape = 0.5; run(10); D0.mix.motion.tape = 1; D0.mix.motion.shift = 5; run(10); D0.mix.motion.shift = 0; C[7].ech = 0; C[2].rsn = 0; C[6].shm = 0; run(20); }
      // every instrument model and drum / FX / texture kind once: a genre loaded later must not be the first to run its code
      const o = { slide: false, accent: false, bright: 1, lfo: 0, pan: 0, vowel: 'a', from: 0, fit: false }, B = (inst, k) => { for (let i = 0; i < k; i++) { L.fill(0); R.fill(0); inst.render(L, R, 128); } };
      for (const mono of [false, true]) { const syn = new Synth(sr, 4, mono); syn.bpm = 124; for (const name of Object.keys(MODEL).concat(['wt1', 'wt2', 'wt3', 'wt4'])) { const ft = name.startsWith('wt') && name.length > 2 ? +name[2] : 0; syn.setKit({ model: ft ? 'wt' : name, sub: 0.3, lfoAmp: 0.3, lfoSync: 1, ftype: ft, table: ft * 2 % 8, uni: 3, posLfo: 0.3, l2Sync: 1, fold: 0.2, mLfo: 0.2, mLfoS: 1 }); syn.trigger(0, 48 + (mono ? 0 : 12), 0.8, 1200, o); o.slide = mono; syn.trigger(700, 50, 0.8, 1200, o); o.slide = false; B(syn, 14); syn.releaseAll(); B(syn, 4); } }
      const kd = new Kick(sr), sn = new Snare(sr), ht = new Hats(sr), pc = new Perc(sr), fx = new Fx(sr), tx = new Texture(sr); kd.setTempo(124); kd.setKit({ rumble: 0.5 }); sn.setKit({ layer: 0.5 }); fx.setTempo(124);
      for (let k = 0; k < 4; k++) { kd.trigger(0, 0.9); sn.trigger(0, 0.9, SNARE_KIND[k] || 'snare'); B(kd, 20); B(sn, 20); }
      for (let k = 0; k < 6; k++) { ht.trigger(0, 0.9, k, 0); B(ht, 30); } for (const n of PERC_NAMES) { pc.trigger(0, 0.9, n, 60, 0); B(pc, 20); }
      for (let k = 0; k < FX_GAIN.length; k++) { fx.trigger(0, k, 0.8, 128 * 30, 64, 0.3); B(fx, 30); } for (let k = 1; k <= 5; k++) { tx.set(k, 1, 64); tx.setChord(0x91, 0); B(tx, 40); tx.setChord(0x491, 5); B(tx, 40); }
  return E; }
if (typeof AudioWorkletProcessor !== 'undefined') {
  class ForgeProcessor extends AudioWorkletProcessor {
    constructor() { super(); BANK_SYNC = false; this.E = new Engine(sampleRate).prealloc(); this.sh = []; this.sL = new Float32Array(128); this.sR = new Float32Array(128);
      // test hook 'shadow': n extra engines get every command and render the same music into scratch — the CPU cost of a machine
      // (1 + n)× slower, with the same spikes in the same places (how the instrument is proven on a slow laptop)
      this.port.onmessage = (e) => { const m = e.data; if (m.type === 'warmup') { this.warm(m); return; } if (m.type === 'shadow') { this.sh = []; for (let k = 0; k < (m.n | 0); k++) this.sh.push(new Engine(sampleRate)); return; }
        const list = m.type === 'batch' ? m.list : [m]; const c0 = Date.now(); for (const x of list) { this.E.cmd(x); for (const S of this.sh) S.cmd(x); } const cd = Date.now() - c0; this.lastCmd = m.type === 'batch' ? 'batch' : m.type; this.lastCmdF = this.frame; if (cd >= 2) this.slow.push({ what: 'cmd ' + this.lastCmd, ms: cd }); };
      this.slow = []; this.frame = 0; this.lastCmd = ''; this.lastCmdF = -1e9; this.tEnd = 0; this.gEma = 0; // diagnostics: audio-thread calls of 2 ms or more, and what came just before them
      this.cnt = 0; this.every = Math.round(sampleRate / 128 / 30); this.busy = 0; this.blocks = 0; this.load = 0; this.cool = 0; this.blkMax = 0; this.over = 0; }
    // JIT warm-up before the first track: render the given scores silently so the hot paths are optimised before anything is audible
    warm(m) { warmUp(m, sampleRate); this.port.postMessage({ type: 'warm', ok: true }); }
    process(inputs, outputs) { const out = outputs[0], L = out[0], R = out[1] || out[0]; const n = L.length; const t0 = Date.now(); const cue = outputs[1];
      if (this.tEnd) { const gp = t0 - this.tEnd; if (gp > 1) { if (gp > this.gEma * 1.6 + 8 && this.gEma > 0 && this.slow.length < 40) this.slow.push({ what: 'gap' + (this.frame - this.lastCmdF < sampleRate * 0.5 ? ' after ' + this.lastCmd : ''), ms: gp }); this.gEma = this.gEma ? this.gEma * 0.98 + gp * 0.02 : gp; } } // a gap far beyond the device's own rhythm (callbacks come in bursts every buffer) // the audio thread was busy OUTSIDE process(): message delivery, garbage collection, or the OS
      try { this.E.render(L, R, n, cue && cue[0], cue && (cue[1] || cue[0])); } catch (err) { L.fill(0); R.fill(0); if (cue) for (const c of cue) c.fill(0); this.E.rescue(err, this.sL, this.sR, n); } // (v9.2) an exception no longer kills the processor
      for (const S of this.sh) try { S.render(this.sL, this.sR, n); } catch (err) { /* a shadow engine (test hook) */ } const dt = Date.now() - t0; this.frame += n; if (dt >= 5 && this.slow.length < 40) this.slow.push({ what: 'render' + (this.frame - this.lastCmdF < sampleRate * 0.25 ? ' after ' + this.lastCmd : ''), ms: dt }); this.busy += dt; this.blocks++; if (dt > this.blkMax) this.blkMax = dt; if (dt >= 4) this.over++; // Date.now() is coarse; summed over ~1 s it is an unbiased load estimate
      if (++this.cnt >= this.every) { this.cnt = 0; const m = this.E.meters(); if (this.blocks >= 344) { this.load = this.busy / (this.blocks * n / sampleRate * 1000); this.busy = 0; this.blocks = 0;
        // watchdog: a second above 75 % of real time → eco (character stages off); back after 10 s under 35 %
        if (this.load > 0.75) { this.E.setEco(1); this.cool = 0; } else if (this.E.eco && this.load < 0.35 && ++this.cool >= 10) this.E.setEco(0); } m.load = this.load; m.eco = this.E.eco; m.blkMax = this.blkMax; m.over = this.over; m.wasm = WV.ok && !WV.off ? 1 : 0; if (this.slow.length) { m.slow = this.slow; this.slow = []; } this.blkMax = 0; this.port.postMessage(m); while (this.E.outbox.length) this.port.postMessage(this.E.outbox.shift()); }
      this.tEnd = Date.now(); return true; }
  }
  registerProcessor('forge', ForgeProcessor);
  // ---- PLAYER (the Stable engine): the DSP runs in a Worker, ahead of time, and arrives here as audio chunks. The audio
  // thread only copies — nothing on it can take longer than a memcpy, so a GC pause, a JIT recompile or a burst of notes in
  // the engine is absorbed by the buffer instead of being heard. Underruns (the queue ran dry) are counted and reported: the
  // engine answers by rendering further ahead. The worker talks to this processor directly over its own MessagePort.
  class ForgePlayer extends AudioWorkletProcessor {
    // it starts (and, after running dry, restarts) only once `pre` frames are queued: playing the first chunk the moment it
    // arrives meant the very first renders of a track (the JIT still compiling) ran the queue dry — measured at start-up
    // under: how many times the queue ran dry (episodes); dryF: the frames of silence they cost (v9.1: `under` counted every
    // quantum of the re-buffering wait — one 0.3 s dropout read as ~100)
    // (v9.2) the copy is a plain loop (subarray() made two view objects per chunk per quantum: garbage on the audio thread); the
    // edges of a dropout are faded (the last sample decays over ~0.5 ms, the restart fades in over 128 frames: a gap, not a click
    // on each side of it); the played chunks' buffers go back to the worker, which renders into them again
    constructor() { super(); this.q = []; this.qi = 0; this.off = 0; this.played = 0; this.under = 0; this.dryF = 0; this.started = 0; this.run = 0; this.avail = 0; this.pre = 2048; this.cnt = 0; this.w = null; this.ret = []; this.fadeIn = 0; this.lastL = 0; this.lastR = 0;
      this.port.onmessage = (e) => { const m = e.data; if (m.type === 'port') { this.w = m.port; this.w.onmessage = (ev) => { const c = ev.data; if (c.type === 'chunk') { this.q.push(c); this.avail += c.L.length; } else if (c.type === 'cfg') this.pre = c.pre; }; } }; }
    report() { if (++this.cnt >= 8 && this.w) { this.cnt = 0; const b = this.ret; this.w.postMessage({ type: 'played', frames: this.played, under: this.under, dry: this.dryF, t: currentTime, bufs: b }, b); b.length = 0; } else if (this.ret.length > 256) this.ret.length = 0; }
    process(inputs, outputs) { const o = outputs[0], L = o[0], R = o[1] || o[0], cu = outputs[1], CL = cu && cu[0], CR = cu && (cu[1] || cu[0]), n = L.length; let i = 0;
      if (!this.run) { if (this.avail >= this.pre) { this.run = 1; this.fadeIn = this.started ? 128 : 0; this.started = 1; } else { if (this.started) this.dryF += n; this.report(); return true; } }
      while (i < n && this.qi < this.q.length) { const c = this.q[this.qi], cl = c.L, cr = c.R, off = this.off, k = Math.min(n - i, cl.length - off);
        for (let j = 0; j < k; j++) L[i + j] = cl[off + j]; if (R !== L) for (let j = 0; j < k; j++) R[i + j] = cr[off + j];
        if (CL && c.CL) { const a = c.CL, b = c.CR; for (let j = 0; j < k; j++) CL[i + j] = a[off + j]; if (CR !== CL) for (let j = 0; j < k; j++) CR[i + j] = b[off + j]; }
        i += k; this.off += k; this.avail -= k; if (this.off >= cl.length) { this.off = 0; this.qi++; this.ret.push(cl.buffer, cr.buffer); if (c.CL) this.ret.push(c.CL.buffer, c.CR.buffer); } }
      if (this.qi > 32) { const q = this.q, k = this.qi; for (let j = k; j < q.length; j++) q[j - k] = q[j]; q.length -= k; this.qi = 0; }
      if (this.fadeIn > 0) { for (let j = 0; j < i && this.fadeIn > 0; j++) { const g = 1 - this.fadeIn / 128; L[j] *= g; if (R !== L) R[j] *= g; if (CL) { CL[j] *= g; if (CR !== CL) CR[j] *= g; } this.fadeIn--; } }
      if (i < n) { this.under++; this.dryF += n - i; this.run = 0; let l = i ? L[i - 1] : this.lastL, r = i ? R[i - 1] : this.lastR; for (let j = i; j < n; j++) { l *= 0.96; r *= 0.96; L[j] = l; if (R !== L) R[j] = r; } this.lastL = this.lastR = 0; } // the queue ran dry: silence (from a fade), and re-buffer before playing on
      else { this.lastL = L[n - 1]; this.lastR = R[n - 1]; }
      this.played += i; this.report();
      return true; }
  }
  registerProcessor('forge-player', ForgePlayer);
}
