/* ===================== DECK =====================
   A deck plays a SCORE (composed off-thread) through its own instruments and mixer. Position is kept in musical
   steps (float64), so tempo can change at any block without re-timing anything: events fire at
   offset = (t - pos) * samplesPerStep inside the block — sample-accurate, no lookahead queue, no timers.
   Arrangement automation (build high-pass, reverb throw, drop gap) is computed from the section map per block. */
const SNARE_KIND = ['snare', 'clap', 'rim', null];
// arrangement dynamics: target loudness of each layer relative to the peak section (LU). The calibration measures each
// genre's natural level per layer and stores the gain that lands it here (calibration.json → arr). Measured before this
// existed: breaks sat within 0.5 LU of the groove and builds came out LOUDER than the drop they lead into.
// v7: the macro-dynamics were narrowed (breaks −6 → −4.5 LU, intros −6 → −4.5, builds −3.5 → −2.5): heard on a set as "volume
// jumps" at every drop. The drop still lands as the loudest moment; the gaps around it are no longer canyons.
const ARR_TARGET = { drums0: -5, drums1: -3, intro: -4.5, groove: -1.5, groove2: -1, verse: -2, break: -4.5, break2: -5.5, build: -2.5, drop: 0, outro: -2.5, chillA: -2, chillB: 0, ambA: -3, ambB: 0 };
const TYPE_LAYER = { intro: 'drums1', groove: 'groove', break: 'break', build: 'build', drop: 'drop', outro: 'outro' };
const BUILD_RAMP = 0; // no extra gain ramp: the riser and the snare roll already swell; a ramp on top made the end of the build as loud as the drop
const REG_SLOTS = [['bass', 4], ['chords', 5], ['pad', 6], ['lead', 7], ['arp', 8]], REG_CH = { bass: 4, chords: 5, pad: 6, lead: 7, arp: 8 }, REG_FLOOR = [0, 0, 0, 0, 28, 52, 52, 45, 48, 0, 0]; // (v9.5) register: the lowest note each part may take
const DRUM_SLOTS = ['kick', 'snare', 'hats', 'perc'], DRUM_CH = { kick: 0, snare: 1, hats: 2, perc: 3 };
const DRUM_U = { uTune: [-12, 12], uDecay: [-1, 1], uTone: [-1, 1], uSnap: [0, 1], uDrive: [0, 1], uLevel: [-18, 6] }; // (v9.5) the six knobs every drum has (Deck.uniform)
const SPREAD = [-0.32, 0.28, -0.12, 0.36, -0.26, 0.14, -0.38, 0.3, -0.18, 0.22, -0.3, 0.34]; // chord voices fan out by pitch class (lows stay centred)
const HAT_KEYS = ['hc', 'ho', 'ride', 'shk', 'crash', 'hp'], BANK_PERC = new Set(['tom', 'conga', 'bongo', 'cowbell', 'clave', 'tamb']); // hat kind → bank voice; the percussion the bank renders
const PERC_NAMES = Object.keys(PERC_KINDS); // the kind index of a percussion event → name (02_drums.js owns the list and its order)
// automation targets (channel 11): a < 8 → synth slot a (bass chords pad lead arp) × param f&3 (0 cutoff, octaves · 1 resonance ·
// 2 filter-LFO depth, octaves · 3 filter-LFO rate, beats per cycle); a ≥ 8 → motion FX parameter a − 8 (MOTION_PARAMS)
const MOTION_PARAMS = ['echoLead', 'echoArp', 'echoChords', 'echoPerc', 'echoFb', 'echoDiv', 'echoPitch', 'echoLfo', 'resDrums', 'resMusic', 'resDecay', 'shimPad', 'shimLead', 'repeat', 'tape', 'shift', 'shiftFb', 'posLead', 'posChords', 'posPad', 'posArp', 'posBass'];
const AUTO_N = 20 + MOTION_PARAMS.length, AUTO_STEP = new Set([20 + 5, 20 + 6, 20 + 13]); // discrete: echo division, echo interval, repeat
const AUTO_DEFAULT = new Float64Array(AUTO_N); AUTO_DEFAULT[20 + 14] = 1; // tape speed 1 = running
function autoIndex(a, f) { a = a | 0; return a < 8 ? (a % 5) * 4 + (f & 3) : 20 + Math.min(MOTION_PARAMS.length - 1, a - 8); }
class Deck {
  constructor(sr, id) { this.sr = sr; this.id = id;
    this.kick = new Kick(sr); this.snare = new Snare(sr); this.hats = new Hats(sr); this.perc = new Perc(sr);
    this.bass = new Synth(sr, 2, true); this.chords = new Synth(sr, 14, false); this.pad = new Synth(sr, 12, false);
    this.leadMono = new Synth(sr, 2, true); this.leadPoly = new Synth(sr, 6, false); this.lead = this.leadPoly; this.arp = new Synth(sr, 8, false);
    this.bankP = new BankPlayer(sr); this.fx = new Fx(sr); this.tex = new Texture(sr); this.atK = -1; this.atL = 1; this.atT = 0; this.texK = 0; this.texV = 0; this.setCandy({ allow: CANDY_DEFAULT, level: 1, density: 1, tx: 1, txLevel: 1 }); this.mix = new DeckMix(sr); this.synths = [this.bass, this.chords, this.pad, this.leadMono, this.leadPoly, this.arp];
    this.ev = null; this.N = 0; this.ei = 0; this.pos = 0; this.bpm = 124; this.sps = 1; this.playing = 0; this.sections = null; this.secIdx = 0; this.bars = 0; this.loaded = 0;
    this.opt = { slide: false, accent: false, bright: 1, lfo: 0, pan: 0, vowel: 'a', from: 0, fit: false }; this.reg = new Int8Array(NCH); this.loopFrom = -1; this.loopTo = -1; this.chanOn = new Uint8Array(NCH).fill(1);
    this.arr = null; this.mixLift = null; this.energy = 0.5; this.autoCur = new Float64Array(AUTO_N); this.autoTgt = new Float64Array(AUTO_N); this.autoRate = new Float64Array(AUTO_N); this.space = null; this.wetness = 1; this.liveEch = new Float32Array(NCH).fill(-1); this.fill = null; this.density = 0.5; this.swingX = 0; this.repCode = 0; this.live = { repeat: 0, tape: 0, swirl: 0 }; this.gid = ''; this.sec = null; this.secP = 0; this.ended = 0; this.jumpAt = -1; this.jumpTo = 0; this.glideRate = 0; this.glideTo = 0; this.txRest = 0; this.score = null; this.cal = null; this.pend = null; this.pendAt = -1; shape(this); this.setBpm(124); }
  // energy macro (0…1, 0.5 = as composed): thins hats/perc/arp below 0.5 (see dispatch) and rides the layer levels — melodic
  // parts and percussion fall back at low energy and push forward at high, the kick and bass stay where the mix put them
  setEnergy(e) { this.energy = clamp(e, 0, 1); const x = this.energy - 0.5, M = this.mix; for (let c = 0; c < NCH; c++) M.eg[c] = c === 0 || c === 4 || c >= 9 ? 1 : dbToGain((c === 2 || c === 3 ? 5 : c === 1 ? 2 : 6) * x); } // ±3 dB on the melodic parts at the extremes (it was ±4.5: heard as level jumps, not energy)
  setBpm(bpm) { this.bpm = clamp(bpm, 40, 220); this.sps = this.sr * 60 / this.bpm / 4; if (Math.abs(this.kick.bpm - this.bpm) > 0.5) this.kick.setTempo(this.bpm); this.fx.setTempo(this.bpm); for (const s of this.synths) s.bpm = this.bpm; this.mix.bpm = this.bpm; }
  load(score, cal) {
    // (v9.2) a new track starts clean: no tempo glide left over from the last mix (it drifted the next mix), no mute left from the last
    // track (the bass stayed silent while its button showed it on); the score and calibration are kept for a self-heal reload
    this.glideRate = 0; this.density = 0.5; this.swingX = 0; this.mix.ug.fill(1); for (const st of this.mix.s) st.mute = 0; this.score = score; this.cal = cal || null;
    this.allOff(); const k = score.kits; this.ev = score.ev; this.N = score.ev.n; this.ei = 0; this.pos = 0; this.sections = score.sections; this.bars = score.meta.bars; this.gid = score.meta.gid; this.ended = 0;
    // drum kits start from the instrument defaults every load: merging into the previous track's kit leaked parameters
    // between genres (a hard-techno rumble or a rim snare survived into the next house track — and never in offline renders)
    for (const d of [this.kick, this.snare, this.hats, this.perc]) { if (!d.p0) d.p0 = Object.assign({}, d.p); d.p = Object.assign({}, d.p0); }
    this.kick.setKit(k.kick); this.snare.setKit(k.snare); this.hats.setKit(k.hats); this.perc.setKit(k.perc); this.bass.setKit(k.bass); this.setDrums(k, score.meta.gid, true);
    this.key = score.meta.key | 0; this.du = {}; this.dBase = {}; for (const [sl, c] of REG_SLOTS) this.setReg(c, k[sl] && k[sl].oct || 0); for (const sl of DRUM_SLOTS) { const d = this[sl]; this.dBase[sl] = Object.assign({}, d.p); this.uniform(sl, k[sl] || {}, true); } // (v9.5) the six knobs every drum has
    if (k.chords) this.chords.setKit(k.chords); if (k.pad) this.pad.setKit(k.pad);
    this.lead = score.roles.lead === 'seq' || score.roles.lead === 'riff' ? this.leadMono : this.leadPoly; if (k.lead) this.lead.setKit(k.lead); // sequences and riffs are monophonic lines with glide
    const a = k.hook || k.arp; if (a) this.arp.setKit(a);
    this.space = score.mix && score.mix.space ? score.mix.space : null; this.wetness = score.mix && score.mix.drumVerb != null ? score.mix.drumVerb : 1; this.mix.setSends(score.mix); this.sendCfg = Object.assign({}, score.mix); if (cal) this.mix.setBalance(cal.bal, 0); this.mix.trimS = this.mix.trim;
    this.mix.setTone(cal && cal.tone); this.arr = cal && cal.arr ? cal.arr : null; this.mixLift = null; this.mix.secS = 1; this.mix.setSection(0, true);
    this.autoAt(0); this.setBpm(score.meta.bpm); this.loaded = 1; this.loopFrom = this.loopTo = -1; }
  // live sound edit: params merge into the kit IN PLACE, so notes already sounding morph with the knob (synth voices
  // hold a reference to their kit); drums recompute their coefficients. slot: kick snare hats perc bass chords pad lead arp
  tweak(slot, prm) { const syn = { bass: this.bass, chords: this.chords, pad: this.pad, lead: this.lead, arp: this.arp }[slot];
    if (syn && prm.oct != null) { const c = REG_CH[slot]; if (c != null) this.setReg(c, prm.oct); if (Object.keys(prm).length === 1) return; }
    if (syn) { Object.assign(syn.p, prm); if (prm.model != null && MODEL[prm.model] != null) syn.m = MODEL[prm.model]; if (slot === 'lead') { const o = this.lead === this.leadMono ? this.leadPoly : this.leadMono; Object.assign(o.p, syn.p); o.m = syn.m; } return; }
    if (slot === 'drums') { if (prm.family != null) this.bankP.setFamily(prm.family); return; }
    if (prm.bank && (slot === 'snare' || slot === 'hats' || slot === 'perc')) { this.bankP.prm[slot] = Object.assign({}, BANK_DEF, this.bankP.prm[slot], prm.bank); if (this.bBase) this.bBase[slot] = Object.assign({}, BANK_DEF, this.bBase[slot], prm.bank); if (this.du && this.du[slot]) this.uniform(slot, {}); return; }
    const d = { kick: this.kick, snare: this.snare, hats: this.hats, perc: this.perc }[slot]; if (!d) return; const U = {}, own = {}; for (const k in prm) (DRUM_U[k] ? U : own)[k] = prm[k];
    if (Object.keys(own).length) { d.setKit(own); if (this.dBase && this.dBase[slot]) Object.assign(this.dBase[slot], own); } if (own.keyTrack != null) U.keyTrack = own.keyTrack; if (this.du && Object.keys(U).length) this.uniform(slot, U); }
  // (v9.5) REGISTER: a part an octave or two lower or higher that still sits — a note that would land under the part's floor (the
  // bass's room: chords and pad E3, lead A2, arp C3; the bass itself E1) or over its ceiling folds back an octave, so lowered chords
  // open up instead of muddying the bass; a lowered part is brightened (its filter opens a quarter octave per octave: the same
  // timbre, not a duller one), lifted 1.5 dB per octave (the ear hears low notes quieter) and its channel's high-pass opens so its
  // new fundamental is not cut; a raised part the other way round
  setReg(c, oct) { const r = clamp(Math.round(+oct || 0), -2, 2); this.reg[c] = r; this.mix.hpMul[c] = r < 0 ? 0.55 : 1; }
  regNote(c, a) { const lo = REG_FLOOR[c], hi = lo + 48; let n = a + 12 * this.reg[c]; while (n < lo) n += 12; while (n > hi) n -= 12; return n; }
  // (v9.5) THE SAME SIX KNOBS ON EVERY DRUM: uTune (semitones), uDecay and uTone (−1…1, 0 = as designed) work on whatever plays the part —
  // the synthesized voice (mapped onto its own parameters, from the kit as loaded and as its own knobs set it), the kit family's
  // one-shot or your own sample (the bank's Tune / Decay / Tone); uSnap and uDrive (0…1) add the channel's transient shaper and
  // saturator, uLevel (dB, −18…+6) its level — so they mean the same on an 808-style snare, a synthesized one and a sample.
  // keyTrack (kick): its body tuned to the track's key (the root between 38 and 62 Hz)
  uniform(slot, u, fresh) { /* see above */ const d = this[slot], B = this.dBase && this.dBase[slot]; if (!d || !B) return; const cur = this.du[slot] = fresh ? {} : this.du[slot] || {}; for (const k in DRUM_U) if (u[k] != null && Number.isFinite(+u[k])) cur[k] = clamp(+u[k], DRUM_U[k][0], DRUM_U[k][1]);
    if (u.keyTrack != null) cur.keyTrack = u.keyTrack ? 1 : 0;
    const t = Math.pow(2, (cur.uTune || 0) / 12), dc = Math.pow(2, 1.5 * (cur.uDecay || 0)), o = cur.uTone || 0, sn = cur.uSnap || 0, q = {};
    if (slot === 'kick') { let f = B.fEnd; if (cur.keyTrack) { const r = mtof(24 + (this.key % 12)); let best = r, bd = 1e9; for (let k = -1; k < 4; k++) { const c = r * Math.pow(2, k), dd = Math.abs(Math.log2(c / B.fEnd)); if (c >= 36 && c <= 90 && dd < bd) { bd = dd; best = c; } } f = best; } /* (the root nearest the kit's own tuning) */ q.fEnd = f * t; q.fStart = B.fStart * (q.fEnd / B.fEnd); if (B.len > 0) q.len = clamp(B.len * dc, 0.08, 2.5); else q.aDec = clamp(B.aDec * dc, 0.03, 2); q.lp = clamp(B.lp * Math.pow(2, 3 * o), 300, 18000); q.click = clamp(B.click * (1 + 0.9 * o) + 0.15 * Math.max(0, o) + 0.35 * sn, 0, 1); q.punch = clamp(B.punch + 0.6 * sn, 0, 1.5); q.clickF = clamp(B.clickF * Math.pow(2, o), 800, 12000); }
    else if (slot === 'snare') { const th = Math.sqrt(t); q.tone = B.tone * t; q.tone2 = B.tone2 * t; q.clapF = clamp(B.clapF * t * Math.pow(2, 0.9 * o), 300, 6000); q.rimF = B.rimF * t; q.nDec = clamp(B.nDec * dc, 0.02, 1.2); q.toneDec = clamp(B.toneDec * dc, 0.01, 0.6); q.clapTail = clamp(B.clapTail * dc, 0.03, 1); q.lift = sn; q.nLp = clamp(B.nLp * th * Math.pow(2, 1.5 * o), 1500, 18000); q.nHp = clamp(B.nHp * th * Math.pow(2, o), 200, 6000); }
    else if (slot === 'hats') { const th = t; q.base = B.base * t; q.rideF = B.rideF * t; q.shakF = clamp(B.shakF * th, 1500, 16000); q.cDec = clamp(B.cDec * dc, 0.006, 0.4); q.oDec = clamp(B.oDec * dc, 0.04, 2); q.shakDec = clamp(B.shakDec * dc, 0.02, 0.4); q.hpF = clamp(B.hpF * th * Math.pow(2, 1.2 * o), 1500, 15000); q.bpF = clamp(B.bpF * th * Math.pow(2, 0.8 * o), 2000, 16000); q.snap = sn; }
    else { q.pitch = clamp(B.pitch * t, 0.25, 4); q.dec = clamp(B.dec * dc, 0.1, 6); q.noise = clamp(B.noise * (1 + 0.5 * o), 0, 3); q.tone = clamp((B.tone || 0) + o, -1, 1); q.snap = sn; }
    d.setKit(q);
    if (slot !== 'kick') { const P = this.bankP, bb = this.bBase && this.bBase[slot] ? this.bBase[slot] : (this.bBase = this.bBase || {}, this.bBase[slot] = Object.assign({}, BANK_DEF, P.prm[slot])); P.prm[slot] = Object.assign({}, bb, { tune: clamp((bb.tune || 0) + (cur.uTune || 0), -24, 24), decay: clamp((bb.decay ?? 1) * Math.min(1, dc), 0.02, 1), tone: clamp((bb.tone || 0) + o, -1, 1), snap: clamp((bb.snap || 0) + sn, 0, 1) }); }
    const c = DRUM_CH[slot], M = this.mix; M.uTr[c] = 0.35 * sn; M.uSat[c] = cur.uDrive || 0; M.ul[c] = dbToGain(cur.uLevel || 0); M.setCharacter(M.heat, M.punch); }
  // (v9.3) the drum family of a track: the set file's choice (kits.drumFam), else its genre's; Tune / Decay / Tone / Snap per part
  // (kits.drumPrm). A new track restarts the round robin (an offline render and the live deck play the same variants)
  setDrums(k, gid, fresh) { const B = this.bankP; B.setFamily(k.drumFam || BANK_FOR_GENRE[gid] || 'forge'); B.prm = {}; const P = k.drumPrm || {}; this.bBase = {};
    for (const s of ['snare', 'hats', 'perc']) { if (P[s]) B.prm[s] = Object.assign({}, BANK_DEF, P[s]); this.bBase[s] = Object.assign({}, BANK_DEF, P[s]); } if (fresh) B.rr = {}; }
  // the drum hits: the family's one-shots when they are here (or the person's own sample of that voice), else the synthesized voices
  hitSnare(off, v, kind) { const P = this.snare.p, k = kind || P.kind, key = k === 'clap' ? 'cp' : k === 'rim' ? 'rim' : 'sn', B = this.bankP;
    if (P.synth || !B.has(key)) { this.snare.trigger(off, v, kind); return; } const g = P.gain ?? 1; B.trigger(off, v, key, 1, 0, 0, g);
    if (P.layer > 0 && key !== 'rim' && B.has(key === 'sn' ? 'cp' : 'sn')) B.trigger(off, v * P.layer, key === 'sn' ? 'cp' : 'sn', 1, 0, 0, g); }
  hitHat(off, v, kind, pan) { const key = HAT_KEYS[kind] || 'hc', B = this.bankP; if (this.hats.p.synth || !B.has(key)) { this.hats.trigger(off, v, kind, pan); return; } B.trigger(off, v, key, 2, pan, 0, this.hats.p.gain ?? 1); }
  hitPerc(off, v, name, note, pan) { const B = this.bankP; if (this.perc.p.synth || !BANK_PERC.has(name) || !B.has(name)) { this.perc.trigger(off, v, name, note, pan); return; }
    const pf = this.perc.p.pitch || 1, nt = note > 0 ? note + 12 * Math.log2(pf) : BANK_F0[name] ? 69 + 12 * Math.log2(PERC_F[PERC_KINDS[name]] * pf / 440) : 0;
    B.trigger(off, v * PERC_TRIM[PERC_KINDS[name]], name, 3, pan, nt, this.perc.p.gain ?? 1); }
  // a re-composed score swapped in on a bar line brings its kits: apply them without cutting what is sounding
  softKits(score) { const k = score.kits; if (!k) return;
    for (const [d, kk] of [[this.kick, k.kick], [this.snare, k.snare], [this.hats, k.hats], [this.perc, k.perc]]) if (kk) { if (!d.p0) d.p0 = Object.assign({}, d.p); d.p = Object.assign({}, d.p0); d.setKit(kk); }
    const soft = (syn, kk) => { if (!kk) return; const P = Object.assign(dflt(), kk); for (const key in P) syn.p[key] = P[key]; syn.m = MODEL[syn.p.model] ?? MODEL.saw; };
    soft(this.bass, k.bass); soft(this.chords, k.chords); soft(this.pad, k.pad); const lead = score.roles && (score.roles.lead === 'seq' || score.roles.lead === 'riff') ? this.leadMono : this.leadPoly;
    if (lead !== this.lead) { this.lead.releaseAll(); this.lead = lead; } soft(this.lead, k.lead); soft(this.arp, k.hook || k.arp);
    if (score.mix) { this.mix.setSends(score.mix); this.sendCfg = Object.assign({}, score.mix); } this.setDrums(k, score.meta && score.meta.gid, false); this.applyAuto(); }
  allOff() { for (const s of this.synths) s.releaseAll(); this.fx.stopAll(); this.tex.set(this.tex.kind, 0, this.sr * 0.2); }
  // automation state follows a jump: the last automation target before the new position, as if its ramp had finished
  autoAt(step) { this.autoCur.set(AUTO_DEFAULT); this.autoTgt.set(AUTO_DEFAULT); this.autoRate.fill(0); const E = this.ev; if (!E) { this.applyAuto(); return; } for (let i = 0; i < this.N && E.t[i] < step; i++) if (E.ch[i] === 11 && E.a[i] >= 0) { const k = autoIndex(E.a[i], E.f[i]); this.autoCur[k] = this.autoTgt[k] = E.v[i]; }
    this.autoCur[20 + 13] = this.autoTgt[20 + 13] = 0; this.autoCur[20 + 14] = this.autoTgt[20 + 14] = 1; this.applyAuto(); this.texAt(step); } // a jump never lands inside a repeat or a tape stop
  // texture state at a position (after a jump the bed has the level and the chord of where the music is, not of where it was)
  texAt(step) { const E = this.ev; if (!E) return; let lv = -1, ck = -1; for (let i = 0; i < this.N && E.t[i] < step; i++) if (E.ch[i] === 10) { if (E.d[i] < 0) ck = i; else lv = i; }
    if (ck >= 0) { this.tex.setChord(E.f[ck], E.x[ck]); this.mix.reso.setChord(E.f[ck], E.x[ck]); this.fx.mask = E.f[ck]; this.fx.root = E.x[ck]; } if (lv >= 0) this.texSet(E.a[lv] | 0, E.v[lv], this.sr * 0.15); else this.texSet(this.texK || 0, 0, this.sr * 0.15); }
  // live motion (the performance pads): a held pad takes the unit over; on release the score's automation has it back
  liveMotion(name, on, amt) { const M = this.mix.motion, a = amt == null ? 0.5 : amt; this.live[name] = on ? 1 : 0;
    if (name === 'repeat') M.setRepeat(on ? (a < 0.34 ? 2 : a < 0.67 ? 3 : 4) : this.repCode);
    else if (name === 'tape') { if (on) M.tapeRate = -1 / ((0.3 + 0.9 * a) * this.sr); else { M.tapeRate = 0; M.tape = 1; } }
    else if (name === 'swirl') { if (on) { M.shift = 2 + 10 * a; M.shiftFb = 0.55; } else this.applyAuto(); } }
  applyAuto() { const S = [this.bass, this.chords, this.pad, this.leadPoly, this.arp], A = this.autoCur, POS = [41, 38, 39, 37, 40];
    for (let s = 0; s < 5; s++) { const p = S[s].p; p.mCut = A[s * 4]; p.mRes = A[s * 4 + 1]; p.mLfo = A[s * 4 + 2]; p.mLfoS = A[s * 4 + 3]; p.mPos = A[POS[s]]; }
    const q = this.leadMono.p; q.mCut = A[12]; q.mRes = A[13]; q.mLfo = A[14]; q.mLfoS = A[15]; q.mPos = A[37];
    // motion FX: sends per group and unit parameters (0 = the unit's default where a zero would mean "broken")
    const M = this.mix, C = M.s, m = 20; C[7].ech = A[m]; C[8].ech = A[m + 1]; C[5].ech = A[m + 2]; C[3].ech = A[m + 3]; C[1].ech = A[m + 3] * 0.5;
    M.echo.fb = A[m + 4] > 0 ? A[m + 4] : 0.45; M.echo.setDiv(A[m + 5]); M.echo.pitch = A[m + 6] | 0; M.echo.lfo = A[m + 7];
    C[2].rsn = A[m + 8]; C[3].rsn = A[m + 8]; C[1].rsn = A[m + 8] * 0.5; C[8].rsn = A[m + 9]; C[9].rsn = A[m + 9]; M.reso.decay = A[m + 10] > 0 ? A[m + 10] : 0.6;
    C[6].shm = A[m + 11]; C[5].shm = A[m + 11] * 0.5; C[7].shm = A[m + 12];
    if (M.echoBase) { C[5].ech = Math.max(C[5].ech, M.echoBase); C[7].ech = Math.max(C[7].ech, M.echoBase); C[8].ech = Math.max(C[8].ech, M.echoBase * 0.8); C[6].ech = Math.max(C[6].ech, M.echoBase * 0.5); }
    for (let c = 0; c < NCH; c++) if (this.liveEch[c] >= 0) C[c].ech = Math.max(C[c].ech, this.liveEch[c]); // a part's live echo knob (Chords / Perform) rides on top of the score's
    const rc = A[m + 13] | 0; if (rc !== this.repCode) { this.repCode = rc; if (!this.live.repeat) M.motion.setRepeat(rc); }
    if (!this.live.tape) M.motion.tape = clamp(A[m + 14], 0, 1); if (!this.live.swirl) { M.motion.shift = A[m + 15]; M.motion.shiftFb = A[m + 16]; } }
  stepAuto(steps) { let ch = false; for (let k = 0; k < AUTO_N; k++) { const c = this.autoCur[k], t = this.autoTgt[k]; if (c === t) continue; const d = this.autoRate[k] * steps; this.autoCur[k] = Math.abs(t - c) <= d ? t : c + Math.sign(t - c) * d; ch = true; } if (ch) this.applyAuto(); }
  seek(step) { // jump (cue / loop): binary search the event index, release sustained notes
    const t = this.ev ? this.ev.t : null; let lo = 0, hi = this.N; while (lo < hi) { const m = (lo + hi) >> 1; if (t[m] < step) lo = m + 1; else hi = m; }
    this.ei = lo; this.pos = step; for (const s of this.synths) s.releaseAll(); this.fx.stopAll(); this.autoAt(step); }
  sectionAt(bar) { const S = this.sections; for (let i = 0; i < S.length; i++) if (bar >= S[i].bar0 && bar < S[i].bar0 + S[i].bars) return i; return S.length - 1; }
  // energy below 0.5 drops ghosts, shakers and arp fills (low-velocity hats/perc/arp); the accents stay
  dispatch(i, off) {
    const E = this.ev, ch = E.ch[i]; if (ch < NCH && !this.chanOn[ch]) return;
    // (v9.3) the live groove of snare / hats / percussion: Density below the middle thins the ghost hits (the same ones every pass:
    // a hash of the event), above it adds 32nd ratchets after closed hats; Swing delays the odd 16ths beyond the genre's own swing
    if (ch >= 1 && ch <= 3 && (this.density !== 0.5 || this.swingX > 0)) { const h = (Math.imul(i + 1, 2654435761) >>> 0) / 4294967296, ds = this.density, vv = E.v[i];
      if (ds < 0.5 && vv < 0.75 && h < (0.5 - ds) * 2) return;
      if (this.swingX > 0) { const st = E.t[i] % 2; if (st >= 0.75 && st < 1.75) off += Math.round(this.swingX * this.sps); }
      if (ds > 0.5 && ch === 2 && (E.a[i] | 0) === 0 && h < (ds - 0.5) * 0.7) this.hitHat(off + Math.round(this.sps * 0.5), vv * 0.55, 0, E.y[i]); } if (this.energy < 0.49 && (ch === 2 || ch === 3 || ch === 8) && E.v[i] < (0.5 - this.energy) * 1.7) return; const v = E.v[i], a = E.a[i], f = E.f[i], o = this.opt;
    switch (ch) {
      case 0: this.kick.trigger(off, v); this.mix.kick(off); break;
      case 1: this.hitSnare(off, v, SNARE_KIND[a | 0]); break;
      case 2: this.hitHat(off, v, a | 0, E.y[i]); break;
      case 3: this.hitPerc(off, v, PERC_NAMES[(f >> 2) & 31] || 'conga', a, E.y[i]); break;
      case 9: { let k = a | 0, vv = v; const candy = (k >= 7 && k <= 12) || (k >= 14 && k <= 19); // (v10.1) the ear candy and the transitions, as you set them (FX · Ear candy)
        if (candy) { if (this.cDen < 1 && (Math.imul(i + 7, 2654435761) >>> 0) / 4294967296 >= this.cDen) break; if (!(this.cAllow & (1 << k))) { const C = this.cList; if (!C.length) break; k = C[(Math.imul(i + 3, 40503) >>> 0) % C.length]; } vv *= this.cLvl; } // a type you switched off is replaced by one you kept (same place, same length)
        else { if (!this.txOn) break; vv *= this.txLvl; }
        this.fx.trigger(off, k, vv, E.d[i] * this.sps, E.x[i], E.y[i], E.f[i]); break; } // x = the note an ear-candy FX lands on, y = its pan (0 = the engine picks)
      case 11: { if (a < 0) { if (a === -2) this.mix.kick(off, v); break; } /* (v10) -2: a ghost pump — the sidechain breathes on the beat with no kick (v = depth) */ const k = autoIndex(a, f), d = E.d[i]; this.autoTgt[k] = v; this.autoRate[k] = d > 0.01 && !AUTO_STEP.has(k) ? Math.abs(v - this.autoCur[k]) / d : 1e9; break; } // automation: see autoIndex — a target and a ramp over d steps
      case 10: if (E.d[i] < 0) { this.tex.setChord(f, E.x[i]); this.mix.reso.setChord(f, E.x[i]); this.fx.mask = f; this.fx.root = E.x[i]; } else this.texSet(a | 0, v, E.d[i] * this.sps); break; // texture level ramp, or (d < 0) the chord: the texture and the resonator tune to it
      default: { const syn = ch === 4 ? this.bass : ch === 5 ? this.chords : ch === 6 ? this.pad : ch === 7 ? this.lead : this.arp;
        o.slide = !!(f & 1); o.accent = !!(f & 2); o.bright = E.x[i] || 1; o.lfo = ch === 4 ? E.y[i] : 0; o.vowel = ch === 7 && E.y[i] > 0 ? VOWEL_LIST[(E.y[i] - 1) | 0] : 'a'; o.pan = (ch === 5 || ch === 6 || ch === 8) && a >= 52 ? SPREAD[(a | 0) % 12] : 0; o.fit = (ch === 5 || ch === 6) && E.d[i] >= 8;
        if (this.reg[ch]) { const rn = this.regNote(ch, a), sh = (rn - a) / 12; o.bright *= Math.pow(2, -0.25 * sh); syn.trigger(off, rn, v * Math.pow(10, -0.075 * sh), E.d[i] * this.sps, o); break; } // (each note by how far it really moved: a folded one is not compensated)
        syn.trigger(off, a, v, E.d[i] * this.sps, o); }
    }
  }
  // live drum fills (held pads): hits generated on the grid while the pad is held, from where the deck is — a snare roll that
  // accelerates, a hat ratchet, a kick roll, or TOMS TUNED TO THE CHORD that is sounding (the resonator's chord: always in key)
  setFill(kind, on) { if (on) this.fill = { kind, t0: this.pos, k: 0 }; else if (this.fill && this.fill.kind === kind) this.fill = null; }
  runFill(p0, n) { const F = this.fill, sps = this.sps, held = p0 - F.t0, div = F.kind === 'kick' ? (held < 4 ? 2 : 1) : F.kind === 'roll' ? (held < 4 ? 1 : 0.5) : F.kind === 'hats' ? 0.5 : 1;
    let g = Math.ceil(p0 / div - 1e-9) * div; const end = p0 + n / sps;
    for (; g < end; g += div) { const off = clamp(Math.round((g - p0) * sps), 0, n - 1), ramp = clamp((g - F.t0) / 16, 0, 1); F.k++;
      if (F.kind === 'roll') this.hitSnare(off, 0.45 + 0.5 * ramp, 'snare');
      else if (F.kind === 'hats') this.hitHat(off, (F.k % 4 === 1 ? 0.85 : 0.5) * (0.7 + 0.3 * ramp), 0, F.k % 2 ? 0.35 : -0.35);
      else if (F.kind === 'kick') { this.kick.trigger(off, 0.7 + 0.3 * ramp); this.mix.kick(off); }
      else { const R = this.mix.reso, notes = []; for (let m = 74; m >= 50; m--) if (R.mask & (1 << (m % 12))) notes.push(m); const nt = notes.length ? notes[(F.k - 1) % notes.length] : 50;
        this.hitPerc(off, 0.8, 'tom', nt - 12 * Math.log2(this.perc.p.pitch || 1), 0.6 - 1.2 * (((F.k - 1) % Math.max(1, notes.length)) / Math.max(1, notes.length - 1))); } } } // descending through the chord, panned right → left
  process(n) {
    const M = this.mix; for (let c = 0; c < NCH; c++) { M.bufL[c].fill(0, 0, n); M.bufR[c].fill(0, 0, n); }
    if (this.playing && this.loaded) {
      const sps = this.sps, end = this.pos + n / sps, E = this.ev; if (this.fill) this.runFill(this.pos, n); const beat0 = this.pos / 4; for (const s of this.synths) s.beat = beat0; this.mix.beat0 = beat0; this.tex.beat = beat0; this.tex.bpm = this.bpm; this.stepAuto(n / sps);
      // loop (DJ loop / auto-extend): wrap inside the block if the loop end falls here
      if (this.loopTo > 0 && end >= this.loopTo) { const cut = Math.max(0, Math.min(n, Math.round((this.loopTo - this.pos) * sps)));
        while (this.ei < this.N && E.t[this.ei] < this.loopTo) { this.dispatch(this.ei, clamp(Math.round((E.t[this.ei] - this.pos) * sps), 0, n - 1)); this.ei++; }
        const rest = n - cut; this.seekKeep(this.loopFrom); const end2 = this.loopFrom + rest / sps;
        while (this.ei < this.N && E.t[this.ei] < end2) { this.dispatch(this.ei, clamp(cut + Math.round((E.t[this.ei] - this.loopFrom) * sps), 0, n - 1)); this.ei++; }
        this.pos = end2;
      } else {
        while (this.ei < this.N && E.t[this.ei] < end) { this.dispatch(this.ei, clamp(Math.round((E.t[this.ei] - this.pos) * sps), 0, n - 1)); this.ei++; }
        this.pos = end;
      }
      if (this.pos >= this.bars * 16) { this.ended = 1; this.playing = 0; }
      this.automate();
    }
    this.kick.render(M.bufL[0], M.bufR[0], n); this.snare.render(M.bufL[1], M.bufR[1], n); this.hats.render(M.bufL[2], M.bufR[2], n); this.perc.render(M.bufL[3], M.bufR[3], n); this.bankP.render(M.bufL, M.bufR, n);
    this.bass.render(M.bufL[4], M.bufR[4], n); this.chords.render(M.bufL[5], M.bufR[5], n); this.pad.render(M.bufL[6], M.bufR[6], n);
    this.leadMono.render(M.bufL[7], M.bufR[7], n); this.leadPoly.render(M.bufL[7], M.bufR[7], n); this.arp.render(M.bufL[8], M.bufR[8], n);
    this.fx.render(M.bufL[9], M.bufR[9], n); this.tex.render(M.bufL[10], M.bufR[10], n); if (this.atT) this.atmosTone(M.bufL[10], M.bufR[10], n);
    M.mix(n);
  }
  // (v10.1) THE ATMOSPHERE, yours to set: atK the background (−1: the track's own, 0: none, 1 vinyl · 2 air · 3 dark · 4 psy · 5 rain), atL its
  // level (× the track's, 0…2 — a track without one gets a steady bed at 0.35 × it), atT its tone (−1 dark … 0 … +1 bright, a 6 dB/oct tilt)
  texSet(k, v, ramp) { this.texK = k; this.texV = v; const K = this.atK >= 0 ? this.atK : k, L = this.atK > 0 && (k === 0 || !(v > 1e-4)) ? 0.35 * this.atL : v * this.atL; this.tex.set(K, K ? L : 0, ramp); }
  setAtmos(m) { if (m.kind != null) this.atK = clamp(m.kind | 0, -1, 5); if (m.level != null) this.atL = clamp(+m.level || 0, 0, 2); if (m.tone != null) this.atT = clamp(+m.tone || 0, -1, 1); this.texSet(this.texK || 0, this.texV || 0, this.sr * 0.3); }
  atmosTone(L, R, n) { const t = this.atT, f = t < 0 ? 16000 * Math.pow(0.05, -t) : 30 * Math.pow(60, t), a = 1 - Math.exp(-TAU * f / this.sr); let l = this.atzL || 0, r = this.atzR || 0;
    if (t < 0) for (let i = 0; i < n; i++) { l += (L[i] - l) * a; r += (R[i] - r) * a; L[i] = l; R[i] = r; } else for (let i = 0; i < n; i++) { l += (L[i] - l) * a; r += (R[i] - r) * a; L[i] -= l; R[i] -= r; }
    this.atzL = Math.abs(l) < 1e-20 ? 0 : l; this.atzR = Math.abs(r) < 1e-20 ? 0 : r; }
  // (v10.1) the ear candy and the transitions: allow a bitmask of candy kinds (bit k = kind k: 7 glass · 8 harp · 9 bubbles · 10 wind · 11 acid · 12 ping ·
  // 14 blip · 15 sonar · 16 click · 17 dub · 18 drop · 19 glitch), level 0…2, density 0…1 (the share of the track's candy that plays), tx: risers and impacts on / off, txLevel 0…2
  setCandy(m) { if (m.allow != null) { this.cAllow = m.allow >>> 0; this.cList = []; for (const k of CANDY_KINDS) if (this.cAllow & (1 << k)) this.cList.push(k); } if (m.level != null) this.cLvl = clamp(+m.level || 0, 0, 2); if (m.density != null) this.cDen = clamp(+m.density || 0, 0, 1); if (m.tx != null) this.txOn = m.tx ? 1 : 0; if (m.txLevel != null) this.txLvl = clamp(+m.txLevel || 0, 0, 2); }
  seekKeep(step) { const t = this.ev.t; let lo = 0, hi = this.N; while (lo < hi) { const m = (lo + hi) >> 1; if (t[m] < step) lo = m + 1; else hi = m; } this.ei = lo; this.pos = step; }
  automate() { // arrangement automation from the section map
    const bar = Math.floor(this.pos / 16); const si = this.sectionAt(bar); this.secIdx = si; const S = this.sections[si];
    const p = clamp((this.pos / 16 - S.bar0) / S.bars, 0, 1); this.secP = p; const M = this.mix;
    let lv = S.lvl != null ? S.lvl : this.arr ? (this.arr[S.layer] ?? this.arr[TYPE_LAYER[S.type]] ?? 0) : 0; if (S.type === 'build') lv += BUILD_RAMP * (Math.pow(p, 1.4) - 0.6);
    // a track being mixed in keeps its quiet intro up at the running level (measured: a 16-bar mix into a drums-only intro
    // dug a 4–5 LU hole); the lift ends once the track reaches a section that is that loud on its own
    if (this.mixLift != null) { const own = this.arr ? (this.arr[S.layer] ?? 0) : 0; if (own >= this.mixLift - 0.01 && S.type !== 'intro') this.mixLift = null; else lv = Math.max(lv, this.mixLift); }
    M.setSection(lv, S.type === 'drop' && p * S.bars < 0.25);
    if (S.type === 'build') { M.autoHP = 20 * Math.pow(30, Math.pow(p, 1.6)); M.revBoost = 1 + 0.4 * p * this.wetness; } // the room opens a little into the drop (it was +80 %: heard as the ambience swallowing the drums)
    else if (S.type === 'break') { M.autoHP = 0; M.revBoost = 1 + 0.15 * this.wetness; }
    else { M.autoHP = 0; M.revBoost = 1; }
  }
}
