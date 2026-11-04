/* ===================== SOUND BANK =====================
   Curated presets per slot: complete sounds built on the engine's synthesis (no samples), designed from current
   production practice — wide detuned stacks with tracked filters, plucks that are all transient and short decay, FM
   keys, distorted 808s with pitch drop, Reese basses that move. A preset REPLACES the slot's sound (model, filter,
   envelopes, character), then its level is matched to the genre's own kit (levelMatch in spec.js), so a preset never
   breaks the measured mix. In a score: "sound": { "lead": { "preset": "hyper-saw", "cut": 4200 } } — fields after the
   preset adjust it. */
const SOUND_BANK = {
  lead: {
    'hyper-saw': { label: 'Hyper saw', d: 'Wide 7-voice supersaw, bright and open: festival, trance, future rave', k: { model: 'supersaw', detune: 0.42, width: 0.85, cut: 5200, res: 0.1, envAmt: 0.6, fDec: 0.35, aAtk: 0.004, aDec: 0.5, aSus: 0.75, aRel: 0.32, keytrack: 0.4, gain: 0.3 } },
    'neon-pluck': { label: 'Neon pluck', d: 'Supersaw pluck: filter snaps shut, short tail — melodic house, future bass', k: { model: 'supersaw', detune: 0.35, width: 0.8, cut: 700, res: 0.15, envAmt: 3.4, fDec: 0.16, aAtk: 0.002, aDec: 0.32, aSus: 0, aRel: 0.28, keytrack: 0.5, gain: 0.35 } },
    'glass-lead': { label: 'Glass lead', d: 'Narrow-pulse pair, glassy and present — synthwave, nu-disco', k: { model: 'square', pw: 0.28, voices: 2, detune: 0.22, cut: 3600, res: 0.2, envAmt: 0.8, fDec: 0.25, aAtk: 0.005, aDec: 0.3, aSus: 0.7, aRel: 0.25, gain: 0.32 } },
    'soft-lead': { label: 'Soft lead', d: 'Rounded saw pair behind a low filter: lo-fi, downtempo, ambient', k: { model: 'saw', voices: 2, detune: 0.18, cut: 1400, res: 0.1, envAmt: 0.6, fDec: 0.3, aAtk: 0.02, aDec: 0.5, aSus: 0.6, aRel: 0.45, gain: 0.34 } },
    'acid-line': { label: 'Acid line', d: 'Resonant 303-style mono with slides and accents', k: { model: 'acid', cut: 500, res: 0.74, envAmt: 3.2, fDec: 0.14, aAtk: 0.001, aDec: 0.2, aSus: 0.35, aRel: 0.05, drive: 1.8, glide: 0.045, gain: 0.45 } },
    'bell-lead': { label: 'Bell lead', d: 'FM bell, clear attack, long shimmer — melodic techno, ambient', k: { model: 'bell', ratio: 3, index: 2.4, aAtk: 0.001, aDec: 1.2, aSus: 0.1, aRel: 0.6, gain: 0.4 } },
    'brass-lead': { label: 'Brass lead', d: 'Saw pair, filter opens on the attack — big room, hardstyle, trap horns', k: { model: 'brass', cut: 2200, res: 0.15, envAmt: 1.4, fDec: 0.12, aAtk: 0.02, aDec: 0.4, aSus: 0.75, aRel: 0.25, gain: 0.32 } },
    'vocal-lead': { label: 'Vocal lead', d: 'Formant voice, sings the line — house, UKG, amapiano', k: { model: 'vox', aAtk: 0.01, aDec: 0.3, aSus: 0.55, aRel: 0.2, gain: 0.5 } },
    'squelch': { label: 'Squelch', d: 'Resonant acid line with a beat-synced filter LFO — psytrance, acid techno', k: { model: 'acid', cut: 420, res: 0.8, envAmt: 3.4, fDec: 0.1, aAtk: 0.001, aDec: 0.16, aSus: 0.3, aRel: 0.04, drive: 2, glide: 0.04, lfoSync: 4, lfoDepth: 0.5, gain: 0.45 } },
    'zap': { label: 'Zap', d: 'FM lead with a pitch drop on every note — psytrance, hard techno', k: { model: 'fm', ratio: 3, index: 3.5, drive: 1.8, cut: 3000, pEnv: 12, pDec: 0.03, aAtk: 0.001, aDec: 0.18, aSus: 0.2, aRel: 0.06, gain: 0.4 } },
    'hoover': { label: 'Hoover', d: 'Rave hoover with pitch dip — jungle, hard techno, hardstyle', k: { model: 'hoover', detune: 0.6, cut: 3000, res: 0.15, aAtk: 0.01, aDec: 0.4, aSus: 0.7, aRel: 0.3, pEnv: -3, pDec: 0.08, gain: 0.3 } },
  },
  chords: {
    'future-chord': { label: 'Future chord', d: 'Wide supersaw chords, sidechain-ready — future bass, melodic dubstep', k: { model: 'supersaw', detune: 0.5, width: 0.95, cut: 3000, res: 0.1, envAmt: 0.8, fDec: 0.3, aAtk: 0.004, aDec: 0.6, aSus: 0.6, aRel: 0.25, gain: 0.26 } },
    'deep-stab': { label: 'Deep stab', d: 'Filtered stab with a quick envelope — deep house, tech house', k: { model: 'stab', cut: 1100, res: 0.3, envAmt: 2.2, fDec: 0.12, aAtk: 0.002, aDec: 0.3, aSus: 0, aRel: 0.15, gain: 0.45 } },
    'dub-chord': { label: 'Dub chord', d: 'Dark resonant stab for delay throws — dub techno', k: { model: 'stab', cut: 700, res: 0.45, envAmt: 1.6, fDec: 0.18, aAtk: 0.003, aDec: 0.45, aSus: 0, aRel: 0.3, gain: 0.45 } },
    'house-organ': { label: 'House organ', d: 'Drawbar organ with key click — classic and modern house', k: { model: 'organ', bright: 0.6, aAtk: 0.003, aDec: 0.4, aSus: 0.55, aRel: 0.12, gain: 0.4 } },
    'rhodes': { label: 'Rhodes', d: 'FM electric piano — lo-fi, nu-disco, amapiano, deep house', k: { model: 'ep', aAtk: 0.002, aDec: 1.4, aSus: 0.35, aRel: 0.6, gain: 0.6 } },
    'grand': { label: 'Grand piano', d: 'Additive piano with hammer — house piano, downtempo', k: { model: 'piano', bright: 0.6, aAtk: 0.001, aDec: 1.2, aSus: 0.2, aRel: 0.5, gain: 0.6 } },
    'pluck-chord': { label: 'String pluck', d: 'Karplus-Strong guitar/harp pluck — afro house, downtempo', k: { model: 'kspluck', bright: 0.7, aAtk: 0.001, aDec: 1, aSus: 0.3, aRel: 0.4, gain: 0.6 } },
  },
  pad: {
    'air-pad': { label: 'Air pad', d: 'Wide supersaw pad, slow bloom — trance breaks, progressive, ambient', k: { model: 'supersaw', detune: 0.55, width: 1, cut: 2200, res: 0.05, aAtk: 0.9, aDec: 1, aSus: 0.85, aRel: 1.6, gain: 0.2 } },
    'warm-strings': { label: 'Warm strings', d: 'Ensemble strings — cinematic breaks, downtempo', k: { model: 'strings', detune: 0.5, width: 1, cut: 2600, aAtk: 0.6, aDec: 1, aSus: 0.85, aRel: 1.2, gain: 0.22 } },
    'dark-pad': { label: 'Dark pad', d: 'Low-passed saw pad — techno, dnb, dark ambient', k: { model: 'pad', detune: 0.5, width: 1, cut: 800, res: 0.2, aAtk: 1.2, aDec: 1, aSus: 0.9, aRel: 1.5, gain: 0.25 } },
    'gated-pad': { label: 'Gated pad', d: 'Supersaw pad cut by a grid-locked 1/16 gate — trance, psy breaks', k: { model: 'supersaw', detune: 0.45, width: 1, cut: 2600, aAtk: 0.05, aDec: 1, aSus: 0.9, aRel: 0.3, lfoSync: 0.5, lfoAmp: 0.85, lfoShape: 1, gain: 0.22 } },
    'choir': { label: 'Choir', d: 'Formant "ah" voices — breaks, ambient, emotional builds', k: { model: 'vox', vowel: 'a', aAtk: 0.6, aDec: 1, aSus: 0.85, aRel: 1.2, gain: 0.4 } },
  },
  bass: {
    'psy-roll': { label: 'Psy roll', d: 'The rolling off-beat psy bass: a saw pluck that clicks on every sixteenth, its sub joined after the filter', k: { model: 'pluck', cut: 160, res: 0.25, envAmt: 3.8, fDec: 0.045, aAtk: 0.001, aDec: 0.085, aSus: 0, aRel: 0.025, sub: 0.7, subPost: 1, drive: 1.8, gain: 1 } },
    'deep-sub': { label: 'Deep sub', d: 'Clean sine sub, a touch of drive — garage, deep house, dnb', k: { model: 'sub', drive: 1.25, aAtk: 0.004, aDec: 0.3, aSus: 0.85, aRel: 0.08, glide: 0.04, gain: 1 } },
    'modern-808': { label: 'Modern 808', d: 'Distorted 808 with pitch drop and glide — trap, drill, reggaeton', k: { model: 'b808', drive: 2.6, pEnv: 3, pDec: 0.035, aAtk: 0.002, aDec: 0.8, aSus: 0.6, aRel: 0.15, glide: 0.07, gain: 0.95 } },
    'rubber-pluck': { label: 'Rubber pluck', d: 'Short plucked bass, bouncy — tech house, melodic techno', k: { model: 'pluck', cut: 220, res: 0.25, envAmt: 3.2, fDec: 0.08, aAtk: 0.002, aDec: 0.16, aSus: 0.25, aRel: 0.05, sub: 0.6, drive: 1.6, gain: 1 } },
    'dark-reese': { label: 'Dark Reese', d: 'Moving detuned saws with sub — dnb, jungle, bass music', k: { model: 'reese', detune: 0.75, cut: 650, res: 0.2, sub: 0.6, aAtk: 0.005, aDec: 0.5, aSus: 0.9, aRel: 0.12, gain: 0.85 } },
    'acid-303': { label: 'Acid 303', d: 'Squelchy resonant bass with slides — acid, techno', k: { model: 'acid', cut: 450, res: 0.76, envAmt: 3.4, fDec: 0.12, aAtk: 0.001, aDec: 0.18, aSus: 0.3, aRel: 0.04, drive: 1.9, glide: 0.045, gain: 0.55 } },
    'fm-growl': { label: 'FM growl', d: 'Moving FM bass — dubstep, bass house', k: { model: 'fm', ratio: 2, index: 3, drive: 2.4, cut: 1600, sub: 0.6, lfoSync: 2, aAtk: 0.003, aDec: 0.4, aSus: 0.85, aRel: 0.08, gain: 0.7 } },
    'log-drum': { label: 'Log drum', d: 'Amapiano log drum: woody pitched knock', k: { model: 'log', drive: 2.2, cut: 1400, aAtk: 0.001, aDec: 0.35, aSus: 0.25, aRel: 0.12, glide: 0.07, gain: 1 } },
  },
  arp: {
    'psy-pluck': { label: 'Psy pluck', d: 'Tight resonant 16th pluck — psytrance, progressive psy', k: { model: 'pluck', cut: 1200, res: 0.45, envAmt: 2.6, fDec: 0.06, aAtk: 0.001, aDec: 0.1, aSus: 0, aRel: 0.05, gain: 0.4 } },
    'crystal': { label: 'Crystal pluck', d: 'Bright tuned string pluck — progressive, melodic techno', k: { model: 'kspluck', bright: 0.85, aAtk: 0.001, aDec: 0.6, aSus: 0.2, aRel: 0.3, gain: 0.5 } },
    'saw-pluck': { label: 'Saw pluck', d: 'Classic filtered saw pluck — trance, house arps', k: { model: 'pluck', cut: 900, res: 0.25, envAmt: 3, fDec: 0.09, aAtk: 0.001, aDec: 0.16, aSus: 0, aRel: 0.12, gain: 0.4 } },
    'bell-arp': { label: 'Bell arp', d: 'FM bells — ambient, downtempo, melodic techno', k: { model: 'bell', ratio: 4, index: 2, aAtk: 0.001, aDec: 0.8, aSus: 0.05, aRel: 0.4, gain: 0.4 } },
  },
  kick: {
    'punchy': { label: 'Punchy', d: 'Tight club kick, clear click', k: { fEnd: 50, fStart: 210, pDec: 0.032, punch: 0.45, len: 0.42, click: 0.45, clickF: 3600, drive: 1.7, lp: 9000 } },
    'deep-long': { label: 'Deep long', d: 'Round, long body — deep house, melodic techno', k: { fEnd: 46, fStart: 160, pDec: 0.04, punch: 0.25, len: 0.62, click: 0.15, clickF: 2600, drive: 1.3, lp: 5000 } },
    'hard': { label: 'Hard', d: 'Driven, distorted — hard techno, hardstyle', k: { fEnd: 52, fStart: 260, pDec: 0.03, punch: 0.6, len: 0.45, click: 0.55, clickF: 4200, drive: 3, lp: 10000 } },
    'boom': { label: 'Boom', d: 'Sub-heavy boom — trap, dubstep, reggaeton', k: { fEnd: 42, fStart: 150, pDec: 0.045, punch: 0.3, len: 0.85, click: 0.2, clickF: 3000, drive: 1.6, lp: 6000 } },
  },
  snare: {
    'tight-clap': { label: 'Tight clap', d: 'Short layered clap', k: { kind: 'clap', claps: 3, clapGap: 0.008, clapF: 1300, clapQ: 1.2, clapTail: 0.12 } },
    'wide-clap': { label: 'Wide clap', d: 'Long clap with room — house, future bass', k: { kind: 'clap', claps: 4, clapGap: 0.011, clapF: 1150, clapQ: 1, clapTail: 0.26 } },
    'fat-snare': { label: 'Fat snare', d: 'Tuned body with crack — dnb, trap, synthwave', k: { kind: 'snare', tone: 185, tone2: 330, toneAmt: 0.6, nDec: 0.2, snap: 0.6, nHp: 1300, nLp: 9000 } },
    'rim': { label: 'Rim', d: 'Woody rim shot — amapiano, garage, minimal', k: { kind: 'rim', rimF: 1750 } },
  },
  hats: {
    'crisp': { label: 'Crisp', d: 'Bright, short, modern', k: { cDec: 0.03, oDec: 0.3, hpF: 8500, bpF: 11000, noise: 0.35 } },
    'dusty': { label: 'Dusty', d: 'Softer, noisier, darker — lo-fi, deep house', k: { cDec: 0.045, oDec: 0.35, hpF: 6000, bpF: 8200, noise: 0.55 } },
    'metallic': { label: 'Metallic', d: '808 metal, ringing — techno, electro', k: { base: 520, cDec: 0.04, oDec: 0.45, hpF: 7200, bpF: 10500, noise: 0.2 } },
  },
};
function presetKit(slot, name) { const b = SOUND_BANK[slot]; if (b && b[name]) return b[name].k; const L = LEGACY_KITS[slot]; return L && L[name] || null; }
// ---------- v7: the wavetable generation (model 'wt': morphing harmonic tables, up to 7-voice stereo unison, sub, breath
// noise, wavefolder, ladder / band / high / FORMANT / tuned COMB filter, a tempo-locked LFO that moves the table, the vowel
// and the pitch). Every table is built from integer partials and every comb is tuned to the note: whatever moves, the
// chords stay chords. Levels are matched in context by the compiler like every preset.
const WT_BANK = {
  lead: {
    'wt-hyper': { label: 'Hyperwave', d: 'Seven-voice wavetable saw, wide, slight vibrato — the modern festival / trance lead', k: { model: 'wt', table: 0, pos: 0.85, uni: 7, detune: 0.45, spread: 0.9, cut: 5200, res: 0.12, envAmt: 0.8, fDec: 0.3, aAtk: 0.003, aDec: 0.5, aSus: 0.8, aRel: 0.3, keytrack: 0.4, l2Rate: 5.5, l2Pitch: 6, gain: 0.32 } },
    'talk-lead': { label: 'Talking lead', d: 'Vowels that move on the beat (a → e → i): the psychedelic talking synth', k: { model: 'wt', table: 2, pos: 0.4, posLfo: 0.35, l2Sync: 1, ftype: 3, vow: 0.5, vowLfo: 1.6, uni: 2, detune: 0.1, spread: 0.5, aAtk: 0.005, aDec: 0.3, aSus: 0.75, aRel: 0.15, glide: 0.04, gain: 0.5 } },
    'glass-fm': { label: 'Glass FM', d: 'FM table opening on the attack: clear, modern, emotional — melodic techno, dnb', k: { model: 'wt', sub: 0.45, table: 4, pos: 0.3, posEnv: 0.5, fDec: 0.35, uni: 3, detune: 0.15, spread: 0.6, cut: 7000, res: 0.05, aAtk: 0.002, aDec: 0.6, aSus: 0.55, aRel: 0.35, gain: 0.4 } },
    'sync-scream': { label: 'Sync screamer', d: 'Hard-sync sweep with a fold: aggressive, cutting — psy, hard techno, big room', k: { model: 'wt', table: 3, pos: 0.2, posEnv: 0.7, fDec: 0.25, posLfo: 0.2, l2Sync: 4, uni: 3, detune: 0.25, spread: 0.6, fold: 0.25, cut: 4000, res: 0.25, aAtk: 0.002, aDec: 0.3, aSus: 0.7, aRel: 0.12, glide: 0.03, gain: 0.32 } },
    'whistle': { label: 'Breath whistle', d: 'Hollow tone with breath and vibrato: organic, intimate — downtempo, ambient, emotional breaks', k: { model: 'wt', sub: 0.3, table: 7, pos: 0.05, uni: 1, noiseAmt: 0.06, l2Rate: 5, l2Pitch: 9, ftype: 1, cut: 1800, res: 0.2, keytrack: 1, aAtk: 0.04, aDec: 0.4, aSus: 0.8, aRel: 0.4, glide: 0.05, gain: 0.5 } },
    'neuro-lead': { label: 'Neuro lead', d: 'Growl table moving every eighth, folded — bass music, dnb', k: { model: 'wt', table: 6, pos: 0.2, posLfo: 0.6, l2Sync: 0.5, fold: 0.35, uni: 2, detune: 0.12, cut: 3000, res: 0.3, aAtk: 0.003, aDec: 0.3, aSus: 0.8, aRel: 0.1, gain: 0.35 } },
    'pulse-lead': { label: 'Mellow pulse', d: 'Slow pulse-width motion, round filter — deep house, nu-disco, synthwave', k: { model: 'wt', table: 1, pos: 0.3, posLfo: 0.25, l2Sync: 8, uni: 2, detune: 0.12, spread: 0.5, cut: 2400, res: 0.15, envAmt: 0.5, fDec: 0.3, aAtk: 0.005, aDec: 0.4, aSus: 0.7, aRel: 0.25, gain: 0.35 } },
    'comb-lead': { label: 'Hollow flute', d: 'A saw through a comb tuned to every note: woody, breathy, in tune — organic house, downtempo', k: { model: 'wt', table: 0, pos: 1, ftype: 4, res: 0.75, cut: 5000, uni: 1, noiseAmt: 0.04, aAtk: 0.02, aDec: 0.4, aSus: 0.7, aRel: 0.3, l2Rate: 4.5, l2Pitch: 5, gain: 0.45 } },
  },
  chords: {
    'wt-chord': { label: 'Wide wavetable chords', d: 'Five-voice morphing saw chords, wide and soft-edged — melodic house, progressive, future', k: { model: 'wt', table: 0, pos: 0.75, uni: 5, detune: 0.35, spread: 0.9, cut: 3200, res: 0.1, envAmt: 0.6, fDec: 0.35, aAtk: 0.004, aDec: 0.6, aSus: 0.55, aRel: 0.3, gain: 0.26 } },
    'juno-stab': { label: 'Pulse stab', d: 'Pulse chord with a quick filter snap — deep house, tech house, garage', k: { model: 'wt', table: 1, pos: 0.25, uni: 2, detune: 0.15, spread: 0.6, cut: 1400, res: 0.25, envAmt: 2.2, fDec: 0.15, aAtk: 0.002, aDec: 0.25, aSus: 0, aRel: 0.15, gain: 0.42 } },
    'formant-chord': { label: 'Vowel chords', d: 'Chords that slowly say a vowel — dreamy, garage, emotional breaks', k: { model: 'wt', table: 2, pos: 0.5, ftype: 3, vow: 2, vowLfo: 0.8, l2Sync: 16, uni: 2, detune: 0.12, spread: 0.6, aAtk: 0.02, aDec: 0.6, aSus: 0.6, aRel: 0.4, gain: 0.5 } },
    'comb-keys': { label: 'Comb keys', d: 'FM tone through tuned combs: a glassy mallet-piano — organic, afro, downtempo', k: { model: 'wt', table: 4, pos: 0.2, ftype: 4, res: 0.7, cut: 6000, uni: 1, aAtk: 0.001, aDec: 0.8, aSus: 0.2, aRel: 0.4, gain: 0.5 } },
    'sync-stab': { label: 'Sync stab', d: 'Bright hard-sync stab, short and driven — techno, psy, electro', k: { model: 'wt', table: 3, pos: 0.5, posEnv: 0.4, fDec: 0.12, uni: 3, detune: 0.2, spread: 0.6, cut: 3000, res: 0.3, envAmt: 1.6, aAtk: 0.001, aDec: 0.22, aSus: 0, aRel: 0.12, gain: 0.36 } },
    'glass-chord': { label: 'Glass chords', d: 'Hollow odd-partial chords with slow motion — ambient, melodic techno, dnb', k: { model: 'wt', table: 7, pos: 0.4, posLfo: 0.15, l2Sync: 8, uni: 4, detune: 0.2, spread: 0.8, cut: 5000, aAtk: 0.01, aDec: 0.8, aSus: 0.6, aRel: 0.5, gain: 0.32 } },
    'organ-keys': { label: 'Morph organ', d: 'Drawbar mixes turning bell-like on the attack — house, gospel-tinged deep, amapiano', k: { model: 'wt', table: 5, pos: 0.15, posEnv: 0.35, fDec: 0.2, uni: 2, detune: 0.06, cut: 4000, aAtk: 0.003, aDec: 0.4, aSus: 0.35, aRel: 0.15, gain: 0.4 } },
  },
  pad: {
    'evolve-pad': { label: 'Evolving pad', d: 'Six voices drifting through the table over 16 beats — progressive, trance breaks, melodic techno', k: { model: 'wt', table: 0, pos: 0.3, posLfo: 0.45, l2Sync: 16, uni: 6, detune: 0.4, spread: 1, cut: 2600, res: 0.08, aAtk: 0.8, aDec: 1, aSus: 0.85, aRel: 1.6, gain: 0.2 } },
    'vocal-pad': { label: 'Choir morph', d: 'A choir that changes vowel over the phrase — breaks, ambient, emotional builds', k: { model: 'wt', table: 2, pos: 0.2, posLfo: 0.5, l2Sync: 32, ftype: 3, vow: 0, vowLfo: 1.2, uni: 4, detune: 0.2, spread: 0.9, aAtk: 0.7, aDec: 1, aSus: 0.85, aRel: 1.5, gain: 0.36 } },
    'glass-pad': { label: 'Crystal pad', d: 'Glassy partials and air, slowly turning — ambient, dnb, chill', k: { model: 'wt', table: 7, pos: 0.6, posLfo: 0.3, l2Sync: 16, uni: 5, detune: 0.25, spread: 1, noiseAmt: 0.02, cut: 6000, aAtk: 1, aDec: 1, aSus: 0.85, aRel: 2, gain: 0.22 } },
    'dark-drone': { label: 'Dark motion', d: 'A low growl table breathing over 32 beats — techno, dnb, dark progressive', k: { model: 'wt', table: 6, pos: 0.1, posLfo: 0.2, l2Sync: 32, uni: 4, detune: 0.2, spread: 1, cut: 700, res: 0.25, aAtk: 1.4, aDec: 1, aSus: 0.9, aRel: 1.5, gain: 0.26 } },
    'organ-pad': { label: 'Warm organ pad', d: 'Soft drawbars, slow attack — deep house, gospel house, downtempo', k: { model: 'wt', table: 5, pos: 0.15, uni: 3, detune: 0.12, spread: 0.8, cut: 2000, aAtk: 0.4, aDec: 1, aSus: 0.85, aRel: 0.9, gain: 0.28 } },
    'breath-pad': { label: 'Breath pad', d: 'Air through a band-pass with a hollow tone under it — ambient, lo-fi, intimate breaks', k: { model: 'wt', table: 7, pos: 0.1, noiseAmt: 0.12, ftype: 1, cut: 1600, res: 0.15, uni: 3, detune: 0.15, spread: 1, aAtk: 1, aDec: 1, aSus: 0.85, aRel: 1.4, gain: 0.34 } },
  },
  bass: {
    'neuro-bass': { label: 'Neuro bass', d: 'Growl table moving on the beat, folded, sub underneath — dnb, dubstep, bass house', k: { model: 'wt', table: 6, pos: 0.25, posLfo: 0.55, l2Sync: 1, fold: 0.4, sub: 0.7, uni: 2, detune: 0.08, cut: 1800, res: 0.25, aAtk: 0.003, aDec: 0.4, aSus: 0.9, aRel: 0.08, gain: 0.6 } },
    'hollow-sub': { label: 'Warm sub', d: 'A sine with its first harmonics: felt on a club system AND heard on a laptop — garage, deep, dnb', k: { model: 'wt', table: 0, pos: 0.12, uni: 1, cut: 900, sub: 0.2, aAtk: 0.004, aDec: 0.3, aSus: 0.9, aRel: 0.08, glide: 0.04, gain: 0.9 } },
    'psy-fm-roll': { label: 'FM roll', d: 'The rolling psy bass with an FM bite on each sixteenth, settling to a clean body', k: { model: 'wt', table: 4, pos: 0.04, posEnv: 0.45, cut: 200, res: 0.15, envAmt: 3.4, fDec: 0.05, aAtk: 0.001, aDec: 0.09, aSus: 0, aRel: 0.03, sub: 0.6, drive: 1.6, gain: 0.95 } },
    'house-growl': { label: 'House growl', d: 'Sync table wobbling on eighths — bass house, tech house, UKG speed', k: { model: 'wt', table: 3, pos: 0.3, posLfo: 0.5, l2Sync: 0.5, fold: 0.3, sub: 0.6, cut: 1500, res: 0.3, aAtk: 0.002, aDec: 0.3, aSus: 0.8, aRel: 0.06, gain: 0.6 } },
    'moog-bass': { label: 'Ladder bass', d: 'Two warm saws in a resonant ladder: the analog bass — techno, melodic, nu-disco', k: { model: 'wt', table: 0, pos: 0.9, uni: 2, detune: 0.05, cut: 420, res: 0.3, envAmt: 2, fDec: 0.18, aAtk: 0.002, aDec: 0.3, aSus: 0.6, aRel: 0.06, drive: 1.6, sub: 0.4, gain: 0.8 } },
    'organ-bass': { label: '2-step organ bass', d: 'The organ bass of UK garage: round, short, with a bite', k: { model: 'wt', table: 5, pos: 0.1, cut: 1200, sub: 0.5, aAtk: 0.002, aDec: 0.25, aSus: 0.5, aRel: 0.06, gain: 0.8 } },
    'rubber-wt': { label: 'Rubber pulse', d: 'Pulse pluck with a filter snap and sub — tech house, minimal, afro', k: { model: 'wt', table: 1, pos: 0.35, posEnv: 0.4, cut: 300, res: 0.3, envAmt: 3, fDec: 0.09, aAtk: 0.002, aDec: 0.18, aSus: 0.2, aRel: 0.05, sub: 0.6, gain: 0.9 } },
  },
  arp: {
    'wt-pluck': { label: 'Wavetable pluck', d: 'Three-voice morphing pluck, filter snap — progressive, trance, melodic house', k: { model: 'wt', table: 0, pos: 0.6, posEnv: 0.4, uni: 3, detune: 0.2, spread: 0.7, cut: 900, res: 0.2, envAmt: 3, fDec: 0.1, aAtk: 0.001, aDec: 0.2, aSus: 0, aRel: 0.15, gain: 0.4 } },
    'comb-pluck': { label: 'Koto pluck', d: 'A tuned comb rung by a saw: plucked-string tone — afro, organic, downtempo', k: { model: 'wt', table: 0, pos: 1, ftype: 4, res: 0.88, cut: 7000, uni: 1, aAtk: 0.001, aDec: 0.5, aSus: 0, aRel: 0.3, gain: 0.45 } },
    'marimba': { label: 'FM marimba', d: 'Wooden mallet: FM attack, quick decay — afro, amapiano, deep', k: { model: 'wt', table: 4, pos: 0.25, posEnv: 0.5, fDec: 0.05, cut: 6000, aAtk: 0.001, aDec: 0.35, aSus: 0, aRel: 0.2, gain: 0.45 } },
    'psy-glass': { label: 'Glass sixteenths', d: 'Resonant glass pluck, very short — psytrance, progressive psy, techno', k: { model: 'wt', table: 7, pos: 0.5, posEnv: 0.3, ftype: 1, cut: 2400, res: 0.4, envAmt: 2, fDec: 0.06, aAtk: 0.001, aDec: 0.09, aSus: 0, aRel: 0.05, gain: 0.4 } },
    'vocal-pluck': { label: 'Vowel pluck', d: 'Short notes that say a vowel, moving every two beats — psy, garage, future', k: { model: 'wt', table: 2, pos: 0.6, ftype: 3, vow: 2.5, vowLfo: 1, l2Sync: 2, aAtk: 0.001, aDec: 0.18, aSus: 0, aRel: 0.1, gain: 0.5 } },
  },
};
for (const slot in WT_BANK) Object.assign(SOUND_BANK[slot], WT_BANK[slot]);
// v8.9: the drum and melodic presets of v8 were curated by measured timbre distance (decay, attack, spectrum, glide), measured
// with the engine itself: a drum or percussion preset stays only if it is at least 0.5 from every other preset in its slot,
// a melodic one at least 0.4 (that bank is denser). Percussion must keep its crest factor (peak over level) under 30 dB.
const BANK_V8 = {
  kick: {
    'machine-808': { label: '808 tuned', d: 'Long sub with a slow pitch fall — trap, hip hop, bass music', k: { fEnd: 40, fStart: 120, pDec: 0.06, punch: 0.1, len: 0.95, click: 0.05, clickF: 2000, drive: 1.2, lp: 4000, sub: 0.35 } },
    'gabber': { label: 'Gabber', d: 'Hard-driven kick with a distorted tail — hardcore, gabber, hard techno', k: { fEnd: 56, fStart: 300, pDec: 0.03, punch: 0.6, len: 0.5, click: 0.6, clickF: 4800, drive: 3.6, tail: 1, tailDrive: 2.5, lp: 11000 } },
    'click': { label: 'Click', d: 'Mostly transient, little body — minimal, micro house, sub bass in the mix', k: { fEnd: 60, fStart: 180, pDec: 0.02, punch: 0.3, len: 0.18, click: 0.8, clickF: 5200, drive: 1.4, lp: 8000 } },
    'pop': { label: 'Pop', d: 'Bright, tight, short — pop, electro, dance-pop', k: { fStart: 380, fEnd: 78, pDec: 0.022, punch: 0.8, len: 0.22, click: 0.3, clickF: 4500, drive: 1.6, lp: 7000 } },
    'tonal': { label: 'Tonal', d: 'Held low pitch, almost no click — dub techno, ambient, downtempo', k: { fStart: 72, fEnd: 56, pDec: 0.5, punch: 0, len: 0.6, click: 0, drive: 1, lp: 2500 } },
    'dub-sub': { label: 'Dub sub', d: 'Dark, long sub with a low cut — dub, dubstep, reggae', k: { fStart: 60, fEnd: 34, pDec: 0.12, punch: 0, len: 1.8, click: 0, drive: 1, lp: 550 } },
    'thud': { label: 'Thud', d: 'Felt beater, short and round — pop, indie, lo-fi', k: { fStart: 110, fEnd: 62, pDec: 0.03, punch: 0.2, len: 0.28, click: 0.5, clickF: 900, drive: 1.3, lp: 1600 } },
    'zap': { label: 'Zap', d: 'Electro bloop: a pitch dive with a bright tip — electro, booty bass, synthpop', k: { fStart: 640, fEnd: 70, pDec: 0.03, punch: 0.6, len: 0.2, click: 0.2, clickF: 3000, drive: 1.5, lp: 6000 } },
    'tom-kick': { label: 'Tom kick', d: 'Pitched, round tom-like kick — tribal, afro, minimal', k: { fStart: 130, fEnd: 80, pDec: 0.15, punch: 0, len: 0.5, click: 0.2, clickF: 3000, drive: 1.2, lp: 3000 } },
  },
  snare: {
    'electro': { label: 'Electro snare', d: 'Bright, tight snare with a high tone snap — electro, tech house, pop', k: { kind: 'snare', tone: 230, tone2: 460, toneAmt: 0.45, toneDec: 0.05, nDec: 0.12, snap: 0.9, nHp: 2200, nLp: 11000 } },
    'brush': { label: 'Brush', d: 'Soft swish with a little body — jazz, lo-fi, downtempo', k: { kind: 'snare', tone: 210, tone2: 300, toneAmt: 0.15, nDec: 0.3, snap: 0, nHp: 2400, nLp: 9500 } },
    'rimshot': { label: 'Rimshot', d: 'Low knock on the rim — pop, rock, classic', k: { kind: 'rim', rimF: 850 } },
    'tom-snare': { label: 'Tom snare', d: 'Tuned low body, short noise — electro, minimal, dub', k: { kind: 'snare', tone: 120, tone2: 240, toneAmt: 0.9, toneDec: 0.2, nDec: 0.05, snap: 0.2, nHp: 1200, nLp: 6000 } },
    'hiss-snare': { label: 'Hiss snare', d: 'Soft hiss around a faint body — lo-fi, chill, breaks', k: { kind: 'snare', tone: 180, tone2: 300, toneAmt: 0.2, toneDec: 0.05, nDec: 0.3, snap: 0, nHp: 2500, nLp: 10000 } },
    'dry-snare': { label: 'Dry snare', d: 'Crisp snap, no tail — pop, R&B, hip hop', k: { kind: 'snare', tone: 240, tone2: 480, toneAmt: 0.4, toneDec: 0.04, nDec: 0.04, snap: 1, nHp: 1800, nLp: 10000 } },
  },
  hats: {
    'tight-909': { label: '909 tight', d: 'Short, bright, hard-edged — house, techno', k: { base: 470, cDec: 0.028, oDec: 0.22, hpF: 8200, bpF: 10000, noise: 0.25 } },
    'trap-tick': { label: 'Trap tick', d: 'Very short, sharp ticks for rolls — trap, drill, UK', k: { base: 450, cDec: 0.018, oDec: 0.16, hpF: 9000, bpF: 12000, noise: 0.3 } },
    'lofi-hat': { label: 'Lo-fi', d: 'Soft, dull and low-toned — lo-fi, chill, boom bap', k: { base: 330, cDec: 0.05, oDec: 0.3, hpF: 4500, bpF: 6500, noise: 0.7 } },
    'ride-bell': { label: 'Ride bell', d: 'A ringing ride with a bell on top — nu-disco, rock, jazz-tinged', k: { rideF: 880, rideDec: 1.3, bpF: 9000, hpF: 5000 } },
    'long-crash': { label: 'Long crash', d: 'A big crash with a long wash — drops and transitions', k: { crashDec: 3.2, bpF: 9000 } },
    'dark-hat': { label: 'Dark hat', d: 'Soft and low — deep house, lo-fi, garage', k: { base: 260, cDec: 0.07, oDec: 0.3, hpF: 4200, bpF: 6000, noise: 0.6 } },
    'sizzle': { label: 'Sizzle', d: 'Bright and metallic, quick shimmer — trance, electro, big room', k: { base: 700, cDec: 0.09, oDec: 0.5, hpF: 10000, bpF: 13000, noise: 0.12 } },
    'ride-dry': { label: 'Dry ride', d: 'Short, dry ride — jazz-tinged, pop, indie', k: { rideF: 520, rideDec: 0.5, bpF: 7000, hpF: 4000 } },
  },
  perc: {
    'deep-drums': { label: 'Deep drums', d: 'Low, ringing drum body — dub, downtempo, house', k: { pitch: 0.6, dec: 1.5, noise: 0.4, gain: 1.2 } },
    'chirp': { label: 'Chirp', d: 'High, quick and bright — electro, techno, minimal', k: { pitch: 2.2, dec: 0.45, noise: 0.25, gain: 1.2 } },
    'dry-tight': { label: 'Dry tight', d: 'Short and dry, nothing after the hit — techno, tech house', k: { pitch: 1, dec: 0.3, noise: 0.25, gain: 1.7 } },
    'ring-long': { label: 'Ring', d: 'Long resonant ring — breaks, cinematic, dub', k: { pitch: 1.3, dec: 2.6, noise: 0.15, gain: 0.7 } },
    'tom-hard': { label: 'Hard tom', d: 'Low, short tom with a hard hit — trap, electro, hardstyle', k: { pitch: 0.7, dec: 0.6, noise: 0.15, gain: 1.26 } },
    'tick': { label: 'Tick', d: 'Very high, very short tick — minimal, micro house, glitch', k: { pitch: 2.8, dec: 0.15, noise: 0.05, gain: 1.6 } },
  },
  lead: {
    'sine-lead': { label: 'Sine lead', d: 'Pure round tone with a soft bloom — flute-like leads, chill, ambient', k: { model: 'sub', drive: 1.1, aAtk: 0.01, aDec: 0.4, aSus: 0.8, aRel: 0.2, glide: 0.05, gain: 0.45 } },
    'fm-lead': { label: 'FM lead', d: 'Bright FM lead with a soft body — synth-pop, melodic house', k: { model: 'fm', ratio: 2, index: 1.2, drive: 1.2, cut: 6000, aAtk: 0.005, aDec: 0.3, aSus: 0.7, aRel: 0.2, gain: 0.4 } },
  },
  chords: {
    'clav-chord': { label: 'Clav stab', d: 'Short, bright, clavinet-like stab — funk, disco, nu-funk', k: { model: 'kspluck', bright: 0.95, aAtk: 0.001, aDec: 0.25, aSus: 0, aRel: 0.05, gain: 0.55 } },
  },
  bass: {
    'fm-bass': { label: 'FM bass', d: 'Sine pair with a bite of FM — electro, house, hip hop', k: { model: 'fm', ratio: 1, index: 1.6, cut: 500, res: 0.2, sub: 0.3, aAtk: 0.002, aDec: 0.25, aSus: 0.7, aRel: 0.08, drive: 1.4, gain: 0.8 } },
    'saw-bass': { label: 'Saw bass', d: 'Classic filtered saw bass — funk, electro, house', k: { model: 'saw', cut: 700, res: 0.3, envAmt: 2.2, fDec: 0.1, aAtk: 0.002, aDec: 0.3, aSus: 0.6, aRel: 0.06, drive: 1.3, gain: 0.8 } },
  },
  arp: {
    'ep-pluck': { label: 'Electric pluck', d: 'Short electric piano plucks — house, afro, disco', k: { model: 'ep', aAtk: 0.001, aDec: 0.5, aSus: 0, aRel: 0.2, gain: 0.45 } },
    'steel-pluck': { label: 'Steel pluck', d: 'Bright metallic pluck, quick — trance, progressive arps', k: { model: 'pluck', cut: 3200, res: 0.1, envAmt: 1.5, fDec: 0.08, aAtk: 0.001, aDec: 0.2, aSus: 0, aRel: 0.08, gain: 0.4 } },
  },
};
// v8.8 presets that v8.9 no longer lists: a saved score that names one still plays its exact v8.8 sound (presetKit reads these)
const LEGACY_KITS = {
  kick: {
    'machine-909': { fEnd: 48, fStart: 200, pDec: 0.03, punch: 0.5, len: 0.36, click: 0.5, clickF: 4000, drive: 2, lp: 9000 },
    'sub': { fEnd: 38, fStart: 90, pDec: 0.06, punch: 0.05, len: 1, click: 0, drive: 1, lp: 1500 },
    'acoustic': { fEnd: 58, fStart: 140, pDec: 0.05, punch: 0.2, len: 0.35, click: 0.25, clickF: 1800, drive: 1.1, lp: 4500 },
  },
  snare: {
    'clap-909': { kind: 'clap', claps: 4, clapGap: 0.009, clapF: 1500, clapQ: 1.4, clapTail: 0.1 },
    'clap-room': { kind: 'clap', claps: 5, clapGap: 0.013, clapF: 1000, clapQ: 0.9, clapTail: 0.42 },
    'short': { kind: 'snare', tone: 200, tone2: 360, toneAmt: 0.6, toneDec: 0.07, nDec: 0.07, snap: 0.8, nHp: 1600, nLp: 9500 },
    'finger-snap': { kind: 'rim', rimF: 2600 },
    '808-snare': { kind: 'snare', tone: 165, tone2: 250, toneAmt: 0.75, toneDec: 0.12, nDec: 0.28, snap: 0.3, nHp: 1000, nLp: 7000 },
  },
  perc: {
    'latin-set': { pitch: 1.05, dec: 0.9, noise: 1.6, gain: 0.94 },
    'hand-drums': { pitch: 0.85, dec: 1.2, noise: 1.2, gain: 0.81 },
    'wood-block': { pitch: 1.4, dec: 0.5, noise: 0.3, gain: 1.26 },
    'metal-perc': { pitch: 1.3, dec: 1.5, noise: 0.25, gain: 0.73 },
    'tight-perc': { pitch: 1, dec: 0.45, noise: 0.5, gain: 1.1 },
    'dub-perc': { pitch: 0.8, dec: 1.7, noise: 0.7, gain: 0.69 },
    'floor-toms': { pitch: 0.75, dec: 1.1, noise: 0.4, gain: 0.85 },
    'bright-set': { pitch: 1.2, dec: 0.8, noise: 1.8, gain: 1 },
    'electro-toms': { pitch: 1.15, dec: 0.6, noise: 0.2, gain: 1.15 },
    'room-toms': { pitch: 0.9, dec: 1.4, noise: 0.5, gain: 0.76 },
  },
  hats: {
    'open-wash': { cDec: 0.05, oDec: 0.7, hpF: 6500, bpF: 9000, noise: 0.45 },
  },
  lead: {
    'piano-lead': { model: 'piano', bright: 0.75, aAtk: 0.001, aDec: 1, aSus: 0.3, aRel: 0.45, gain: 0.5 },
    'soft-supersaw': { model: 'supersaw', detune: 0.2, width: 0.6, cut: 3800, res: 0.1, envAmt: 0.3, fDec: 0.4, aAtk: 0.03, aDec: 0.6, aSus: 0.7, aRel: 0.5, keytrack: 0.4, gain: 0.3 },
  },
  chords: {
    'ep-chords': { model: 'ep', aAtk: 0.01, aDec: 1.1, aSus: 0.5, aRel: 0.5, gain: 0.5 },
  },
  pad: {
    'vox-pad': { model: 'vox', aAtk: 0.8, aDec: 1, aSus: 0.85, aRel: 1.6, gain: 0.3 },
  },
};
for (const slot in BANK_V8) Object.assign(SOUND_BANK[slot] || (SOUND_BANK[slot] = {}), BANK_V8[slot]);
// v9: the signature sounds of each style (psytrance first): measured, not guessed — a bass keeps its fundamental (its sub in phase,
// joined after the filter), a psy kick holds its tuned body ~45 ms and is 30 dB down before the first bass sixteenth
const BANK_V9 = {
  kick: {
    'psy-kick': { label: 'Psy kick', d: 'Punchy, tuned, gone before the first bass sixteenth — psytrance, full-on, progressive psy', k: { len: 0.27, fEnd: 55, fStart: 260, pDec: 0.011, punch: 0.55, hold: 0.045, click: 0.8, clickF: 5000, drive: 1.9, lp: 9500, sub: 0.3 } },
    'rumble-kick': { label: 'Rumble', d: 'Driven kick with its dark reverberated rumble filling the beat — techno, warehouse', k: { len: 0.5, fEnd: 47, fStart: 210, pDec: 0.0144, punch: 0.35, hold: 0.015, click: 0.4, clickF: 3200, drive: 3.2, lp: 6500, rumble: 0.7 } },
    'hard-rumble': { label: 'Hard rumble', d: 'Distorted kick with a heavy rumble — hard techno, industrial', k: { len: 0.55, fEnd: 48, fStart: 290, pDec: 0.01, punch: 0.7, hold: 0.012, click: 0.7, clickF: 3600, drive: 6, lp: 7000, rumble: 0.9 } },
  },
  snare: {
    'trap-clap': { label: 'Trap clap', d: 'A clap stacked on a snappy snare — trap, drill, hip hop', k: { kind: 'clap', claps: 3, clapGap: 0.008, clapF: 1300, clapQ: 1.2, clapTail: 0.16, layer: 0.55, tone: 200, tone2: 340, toneAmt: 0.5, toneDec: 0.07, nDec: 0.09, snap: 0.8, nHp: 1600, nLp: 9000 } },
    'big-clap': { label: 'Big clap', d: 'Wide layered clap with a snare body — big room, EDM, future bass', k: { kind: 'clap', claps: 4, clapGap: 0.01, clapF: 1100, clapQ: 0.9, clapTail: 0.28, layer: 0.5, tone: 185, tone2: 320, toneAmt: 0.55, toneDec: 0.1, nDec: 0.14, snap: 0.6, nHp: 1300, nLp: 8500 } },
    'psy-snare': { label: 'Psy snare', d: 'Tight snappy snare with a short clap under it — psytrance, techno', k: { kind: 'snare', tone: 215, tone2: 390, toneAmt: 0.35, toneDec: 0.05, nDec: 0.11, snap: 0.9, nHp: 1900, nLp: 10500, layer: 0.45, clapF: 1500, clapQ: 1.3, clapGap: 0.007, clapTail: 0.09, claps: 2 } },
  },
  hats: {
    'psy-hats': { label: 'Psy hats', d: 'Crisp off-beat “tss” and tight sixteenths — psytrance, trance', k: { base: 500, noise: 0.3, cDec: 0.02, oDec: 0.11, bpF: 12500, hpF: 9000, rideF: 720, rideDec: 0.9, shakF: 9200, shakDec: 0.05 } },
  },
  bass: {
    'psy-hollow-roll': { label: 'Hollow roll', d: 'Square-wave rolling bass, darker and hollow — full-on, dark psy', k: { model: 'pluck', wave: 1, pw: 0.5, cut: 190, res: 0.22, envAmt: 3.8, fDec: 0.045, aAtk: 0.001, aDec: 0.085, aSus: 0, aRel: 0.025, sub: 0.5, subPost: 1, drive: 1.8, gain: 1 } },
    'psy-prog-roll': { label: 'Prog roll', d: 'Rounder, longer rolling bass — progressive psy, melodic', k: { model: 'pluck', cut: 140, res: 0.15, envAmt: 3.2, fDec: 0.06, aAtk: 0.002, aDec: 0.11, aSus: 0, aRel: 0.04, sub: 0.8, subPost: 1, drive: 1.5, gain: 1 } },
  },
  lead: {
    'psy-acid': { label: 'Psy acid', d: 'Screaming resonant acid sixteenths, filter moving on the bar — psytrance, full-on', k: { model: 'acid', cut: 480, res: 0.82, envAmt: 3.8, fDec: 0.12, aAtk: 0.001, aDec: 0.18, aSus: 0.25, aRel: 0.04, drive: 2.2, glide: 0.035, lfoSync: 8, lfoDepth: 0.7, gain: 0.42 } },
    'psy-scream': { label: 'Psy scream', d: 'Driven resonant lead with slides — the climax voice of full-on psy', k: { model: 'screech', cut: 2200, res: 0.65, envAmt: 1.6, fDec: 0.3, aAtk: 0.01, aDec: 0.5, aSus: 0.7, aRel: 0.25, drive: 2.8, glide: 0.07, gain: 0.24 } },
  },
  arp: {
    'psy-acid-seq': { label: 'Psy acid line', d: 'The acid second voice of full-on psy: resonant sixteenths with slides, the filter moving on the bar', k: { model: 'acid', cut: 500, res: 0.78, envAmt: 3.6, fDec: 0.11, aAtk: 0.001, aDec: 0.16, aSus: 0.25, aRel: 0.04, drive: 2, glide: 0.035, lfoSync: 8, lfoDepth: 0.6, gain: 0.38 } },
    'psy-scream': { label: 'Psy scream', d: 'Driven resonant second voice with slides — full-on psy', k: { model: 'screech', cut: 2200, res: 0.65, envAmt: 1.6, fDec: 0.3, aAtk: 0.01, aDec: 0.5, aSus: 0.7, aRel: 0.25, drive: 2.8, glide: 0.07, gain: 0.24 } },
    'psy-bell': { label: 'Psy bell', d: 'Short FM bell sixteenths, glassy and in key — progressive psy, goa', k: { model: 'fm', ratio: 5, index: 1.4, cut: 5000, res: 0.1, aAtk: 0.001, aDec: 0.14, aSus: 0, aRel: 0.08, drive: 1.1, gain: 0.34 } },
  },
  pad: {
    'psy-pad': { label: 'Psy pad', d: 'Dark wide supersaw swell for the breakdown — psytrance', k: { model: 'supersaw', detune: 0.4, cut: 1400, res: 0.15, aAtk: 1.2, aDec: 1, aSus: 0.9, aRel: 2, width: 1, gain: 0.26 } },
  },
};
for (const slot in BANK_V9) Object.assign(SOUND_BANK[slot] || (SOUND_BANK[slot] = {}), BANK_V9[slot]);
// genre palettes: the sounds that belong to a family, per slot (old and new). A new track takes a palette sound for some of
// its melodic parts (seeded, level-matched in context) and Auto's "Sounds" swaps only inside the palette — a hoover never lands
// in a deep-house groove. Chord presets are tagged by what they can play: s = short stabs, p = held chords.
const CHORD_FIT = { 'future-chord': 'p', 'deep-stab': 's', 'dub-chord': 's', 'house-organ': 'sp', 'rhodes': 'sp', 'grand': 'sp', 'pluck-chord': 's', 'wt-chord': 'p', 'juno-stab': 's', 'formant-chord': 'p', 'comb-keys': 'sp', 'sync-stab': 's', 'glass-chord': 'p', 'organ-keys': 'sp', 'clav-chord': 's' };
const SEQ_OK = new Set(['acid-line', 'squelch', 'zap', 'talk-lead', 'sync-scream', 'neuro-lead', 'glass-fm', 'psy-acid']); // mono sequence leads (slides, accents)
// riff leads (v9.1): a riff is sixteenths all through the drop — the screech (psy-scream) and the FM zap there measured 6–12 dB too
// bright above 5.6 kHz against the master curve (a scream is a sustained climax voice, not a rolling line)
const RIFF_OK = new Set(['sync-scream', 'talk-lead', 'glass-fm', 'wt-hyper', 'psy-acid', 'acid-line', 'squelch']);
const PALETTE = {
  house: { lead: ['glass-lead', 'pulse-lead', 'wt-hyper', 'comb-lead'], chords: ['deep-stab', 'house-organ', 'rhodes', 'juno-stab', 'wt-chord', 'organ-keys', 'formant-chord'], pad: ['air-pad', 'warm-strings', 'evolve-pad', 'organ-pad'], bass: ['deep-sub', 'rubber-pluck', 'rubber-wt', 'moog-bass', 'hollow-sub'], arp: ['saw-pluck', 'wt-pluck', 'marimba', 'crystal'] },
  techno: { lead: ['acid-line', 'squelch', 'glass-fm', 'sync-scream', 'talk-lead'], chords: ['dub-chord', 'deep-stab', 'sync-stab', 'glass-chord', 'wt-chord'], pad: ['dark-pad', 'dark-drone', 'evolve-pad', 'glass-pad'], bass: ['rubber-pluck', 'moog-bass', 'acid-303', 'rubber-wt'], arp: ['psy-pluck', 'wt-pluck', 'psy-glass', 'crystal'] },
  trance: { lead: ['hyper-saw', 'wt-hyper', 'glass-fm', 'whistle'], chords: ['future-chord', 'wt-chord', 'glass-chord'], pad: ['air-pad', 'evolve-pad', 'gated-pad', 'vocal-pad', 'glass-pad'], bass: ['rubber-pluck', 'moog-bass', 'rubber-wt'], arp: ['saw-pluck', 'wt-pluck', 'crystal', 'comb-pluck'] },
  psy: { lead: ['psy-scream', 'sync-scream', 'talk-lead', 'zap', 'glass-fm', 'wt-hyper', 'psy-acid'], chords: ['wt-chord', 'future-chord', 'glass-chord', 'sync-stab'], pad: ['psy-pad', 'dark-drone', 'gated-pad', 'vocal-pad', 'evolve-pad'], bass: ['psy-roll', 'psy-fm-roll', 'psy-hollow-roll', 'psy-prog-roll'], arp: ['psy-acid-seq', 'psy-pluck', 'psy-glass', 'psy-scream', 'vocal-pluck', 'psy-bell'] }, // v9.1: riff leads (not acid sequences), chords that can be held and gated, the acid line as the second voice
  dnb: { lead: ['neuro-lead', 'glass-fm', 'whistle', 'hoover'], chords: ['wt-chord', 'rhodes', 'glass-chord'], pad: ['dark-pad', 'dark-drone', 'warm-strings', 'glass-pad'], bass: ['dark-reese', 'neuro-bass', 'deep-sub', 'hollow-sub'], arp: ['crystal', 'wt-pluck', 'bell-arp'] },
  bass: { lead: ['neuro-lead', 'sync-scream', 'talk-lead', 'zap'], chords: ['future-chord', 'wt-chord', 'glass-chord'], pad: ['dark-drone', 'dark-pad'], bass: ['fm-growl', 'neuro-bass', 'house-growl'], arp: ['vocal-pluck', 'wt-pluck'] },
  hiphop: { lead: ['bell-lead', 'glass-fm', 'whistle', 'brass-lead'], chords: ['grand', 'rhodes', 'glass-chord', 'wt-chord'], pad: ['dark-pad', 'choir', 'breath-pad'], bass: ['modern-808'], arp: ['bell-arp', 'marimba'] },
  garage: { lead: ['vocal-lead', 'pulse-lead', 'talk-lead'], chords: ['deep-stab', 'rhodes', 'juno-stab', 'organ-keys', 'formant-chord'], pad: ['air-pad', 'organ-pad'], bass: ['deep-sub', 'organ-bass', 'hollow-sub', 'house-growl'], arp: ['vocal-pluck', 'wt-pluck'] },
  afro: { lead: ['comb-lead', 'whistle', 'glass-fm', 'vocal-lead'], chords: ['rhodes', 'pluck-chord', 'comb-keys', 'organ-keys', 'juno-stab', 'house-organ'], pad: ['warm-strings', 'organ-pad', 'breath-pad'], bass: ['log-drum', 'deep-sub', 'rubber-wt', 'hollow-sub'], arp: ['marimba', 'comb-pluck', 'crystal'] },
  latin: { lead: ['brass-lead', 'glass-lead', 'pulse-lead'], chords: ['deep-stab', 'juno-stab', 'rhodes', 'grand'], pad: ['air-pad', 'warm-strings'], bass: ['modern-808', 'deep-sub', 'hollow-sub'], arp: ['marimba', 'saw-pluck'] },
  hard: { lead: ['hyper-saw', 'wt-hyper', 'sync-scream', 'brass-lead', 'hoover'], chords: ['future-chord', 'wt-chord'], pad: ['air-pad', 'evolve-pad'], bass: ['rubber-pluck', 'moog-bass'], arp: ['saw-pluck', 'wt-pluck'] },
  pop: { lead: ['glass-lead', 'pulse-lead', 'wt-hyper', 'bell-lead'], chords: ['future-chord', 'wt-chord', 'formant-chord', 'glass-chord'], pad: ['air-pad', 'evolve-pad', 'glass-pad', 'warm-strings'], bass: ['deep-sub', 'moog-bass', 'hollow-sub'], arp: ['wt-pluck', 'saw-pluck', 'crystal', 'vocal-pluck'] },
  breaks: { lead: ['acid-line', 'sync-scream', 'glass-fm', 'pulse-lead'], chords: ['deep-stab', 'sync-stab', 'juno-stab'], pad: ['dark-pad', 'evolve-pad'], bass: ['dark-reese', 'moog-bass', 'rubber-wt'], arp: ['psy-pluck', 'wt-pluck', 'crystal'] },
  chill: { lead: ['soft-lead', 'whistle', 'comb-lead', 'bell-lead'], chords: ['rhodes', 'grand', 'comb-keys', 'glass-chord', 'organ-keys'], pad: ['warm-strings', 'breath-pad', 'glass-pad', 'organ-pad'], bass: ['deep-sub', 'hollow-sub', 'moog-bass'], arp: ['bell-arp', 'comb-pluck', 'marimba', 'crystal'] },
  ambient: { lead: ['whistle', 'bell-lead', 'comb-lead'], chords: ['glass-chord', 'grand', 'comb-keys'], pad: ['glass-pad', 'breath-pad', 'vocal-pad', 'evolve-pad', 'air-pad'], bass: ['deep-sub', 'hollow-sub'], arp: ['bell-arp', 'comb-pluck', 'crystal'] },
};
// (v9.2) a family's palette minus what is off-genre for one of its genres — measured on 9.1 over 40 seeds: melodic techno's lead played
// by squelch, talk, acid or scream voices in 15 of 40 tracks and its arp by psy plucks; dub techno got the acid-303 bass and sync-stab
// chords; big room Rhodes or organ chords in 13 of 40; progressive house organ / Rhodes chords and a glass lead; afro house the
// log drum of amapiano
const PALETTE_NOT = { 'melodic-techno': { lead: ['squelch', 'talk-lead', 'acid-line', 'sync-scream'], arp: ['psy-pluck', 'psy-glass'], bass: ['acid-303'] }, 'dub-techno': { bass: ['acid-303'], chords: ['sync-stab'] },
  'big-room': { chords: ['rhodes', 'organ-keys', 'house-organ', 'deep-stab', 'formant-chord'] }, 'progressive-house': { chords: ['house-organ', 'rhodes', 'organ-keys'], lead: ['glass-lead'] }, 'afro-house': { bass: ['log-drum'] } };
// palette sounds that fit a genre's parts (role-aware): slot → [preset names]
function paletteFor(gid) { const G = GENRE_BY_ID[gid]; if (!G) return {}; const P = PALETTE[G.family] || {}, out = {}, NOT = PALETTE_NOT[gid] || {};
  for (const slot of ['lead', 'chords', 'pad', 'bass', 'arp']) { let list = (P[slot] || []).filter((n, i, a) => a.indexOf(n) === i && SOUND_BANK[slot] && SOUND_BANK[slot][n] && !(NOT[slot] && NOT[slot].includes(n)) && tagOk(gid, slot, n));
    if (slot === 'lead') { if (!G.lead || G.lead.role === 'chop' || (G.lead.role === 'arp' && G.family === 'psy')) list = []; else if (G.lead.role === 'seq') list = list.filter((n) => SEQ_OK.has(n)); else if (G.lead.role === 'riff') list = list.filter((n) => RIFF_OK.has(n)); } // (the psy palette's leads are riff voices: a progressive-psy pluck arpeggio keeps its pluck)
    if (slot === 'chords') { if (!G.chords || G.chords.role === 'none' || !G.chords.kit) list = []; else { const need = G.chords.role === 'stab' ? 's' : 'p'; list = list.filter((n) => (CHORD_FIT[n] || 'sp').includes(need)); } }
    if (slot === 'pad' && !G.pad) list = []; if (slot === 'arp' && !(G.arp || G.hook)) list = []; if (slot === 'arp' && G.hook && G.hook.role === 'seq') list = list.filter((n) => n !== 'psy-scream'); // (the acid second voice plays sixteenths too)
    if (list.length) out[slot] = list; }
  return out; }
// a new track's sounds (v9.4): most parts take a palette sound (lead, chords, pad, arp 80 %, bass 60 %), the track leans towards one
// character, two parts avoid one engine and two bright voices in one register, and each pick is varied for this track (varyKit)
function paletteSounds(gid, seed, pref) { /* (v9.5) pref: the user's sound (ui/taste.js) — weights on tags and on sounds; null: as before */ const pal = paletteFor(gid), r = rng((((seed >>> 0) * 2654435761) >>> 0) ^ hashStr('palette/' + gid)), out = {}, models = [], picked = {};
  const ch = r() < 0.75 ? CHARACTERS[Math.floor(r() * CHARACTERS.length) % CHARACTERS.length][1].split(' ') : [];
  for (const slot of ['bass', 'chords', 'pad', 'lead', 'arp']) { const x = r(), list = pal[slot]; if (!list || x >= (slot === 'bass' ? 0.6 : 0.8)) continue;
    const w = list.map((n) => { const e = SOUND_BANK[slot][n], t = e.tags || [], md = e.k && e.k.model; let q = 1;
      if (ch.length && t.some((z) => ch.includes(z))) q *= 2.5; if (md && models.includes(md)) q *= 0.3; // one engine per track where there is a choice
      if (slot === 'arp' && picked.lead && t.includes('bright') && tagsOf('lead', picked.lead).includes('bright')) q *= 0.4; // two bright voices in the same register mask each other
      if (slot === 'pad' && picked.chords && t.includes('huge') && tagsOf('chords', picked.chords).includes('huge')) q *= 0.4;
      if (e.v94) q *= 1.3; if (pref) { let tw = 0; for (const z of t) tw += pref.tags && pref.tags[z] || 0; q *= Math.max(0.25, Math.exp(0.35 * clamp(tw, -4, 6))); const nw = pref.names && pref.names[slot + '/' + n]; if (nw) q *= Math.max(0.2, Math.exp(0.45 * clamp(nw, -3, 5))); } return q; }); // (the new engines are under-represented in the older palettes)
    let sum = 0; for (const q of w) sum += q; let y = r() * sum, k = 0; while (k < list.length - 1 && (y -= w[k]) > 0) k++;
    const n = list[k]; picked[slot] = n; const md = SOUND_BANK[slot][n].k && SOUND_BANK[slot][n].k.model; if (md) models.push(md); out[slot] = { preset: n, vary: (r() * 1e9) >>> 0 }; }
  const fam = kitFor(gid, r); if (fam) out.drums = { family: fam };
  return out; }
