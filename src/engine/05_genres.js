/* ===================== GENRE BIBLE =====================
   Each genre is a musical contract, written from the genre's production practice: tempo window, swing, drum
   grammar (patterns per section + fills), bass grammar (rhythm + note roles), harmony (progressions + harmonic
   rhythm + extensions), parts (chords / pad / lead roles), kits (sound design), arrangement form and mix targets.
   Pattern DSL (16 steps per bar, 32 for two bars): X x o g = velocities 1 .82 .62 .38; '.' rest; '-' extends a note;
   hats: r = two 32nds, z = three, q = four; bass: R root, O octave, F fifth, T third, S seventh, A approach (semitone
   under the next root), N next root, P passing (scale step toward next root); lowercase = slide/legato into it. */
const FORMS = {
  club: [['intro', 16, 'drums0'], ['intro', 16, 'drums1'], ['groove', 32, 'groove'], ['break', 16, 'break'], ['build', 8, 'build'], ['drop', 32, 'drop'], ['groove', 16, 'groove2'], ['outro', 16, 'outro']],
  deep: [['intro', 16, 'drums0'], ['intro', 16, 'drums1'], ['groove', 32, 'groove'], ['break', 16, 'break'], ['build', 4, 'build'], ['drop', 32, 'drop'], ['groove', 16, 'groove2'], ['outro', 16, 'outro']],
  techno: [['intro', 16, 'drums0'], ['intro', 16, 'drums1'], ['groove', 32, 'groove'], ['break', 8, 'break'], ['build', 8, 'build'], ['drop', 32, 'drop'], ['groove', 32, 'groove2'], ['outro', 16, 'outro']],
  trance: [['intro', 16, 'drums0'], ['intro', 16, 'drums1'], ['groove', 16, 'groove'], ['break', 32, 'break'], ['build', 16, 'build'], ['drop', 32, 'drop'], ['break', 8, 'break2'], ['build', 8, 'build'], ['drop', 16, 'drop'], ['outro', 16, 'outro']],
  psy: [['intro', 16, 'drums1'], ['groove', 32, 'groove'], ['break', 16, 'break'], ['build', 8, 'build'], ['drop', 48, 'drop'], ['groove', 16, 'groove2'], ['outro', 16, 'outro']],
  bass: [['intro', 16, 'intro'], ['build', 8, 'build'], ['drop', 32, 'drop'], ['break', 16, 'break'], ['build', 8, 'build'], ['drop', 32, 'drop'], ['outro', 16, 'outro']],
  dnb: [['intro', 16, 'drums1'], ['intro', 16, 'groove'], ['build', 8, 'build'], ['drop', 32, 'drop'], ['break', 16, 'break'], ['build', 8, 'build'], ['drop', 32, 'drop'], ['outro', 16, 'outro']],
  garage: [['intro', 16, 'drums1'], ['groove', 16, 'groove'], ['drop', 32, 'drop'], ['break', 8, 'break'], ['drop', 32, 'drop'], ['outro', 16, 'outro']],
};
// alternative forms (the story is not the same in every track of a genre): a club track may break twice and come back for a
// shorter second drop (which is re-harmonised — see planTrack). Chosen per track by a hash of genre + seed (outside the random
// streams, so nothing else in the track moves); a written form or an explicit sections list always wins.
const FORMS_ALT = {
  club: [['intro', 16, 'drums0'], ['intro', 16, 'drums1'], ['groove', 16, 'groove'], ['break', 16, 'break'], ['build', 8, 'build'], ['drop', 32, 'drop'], ['break', 8, 'break'], ['build', 4, 'build'], ['drop', 16, 'drop'], ['outro', 16, 'outro']],
  deep: [['intro', 16, 'drums1'], ['groove', 32, 'groove'], ['break', 16, 'break'], ['build', 4, 'build'], ['drop', 32, 'drop'], ['break', 8, 'break'], ['drop', 16, 'drop'], ['outro', 16, 'outro']],
  techno: [['intro', 16, 'drums0'], ['intro', 16, 'drums1'], ['groove', 32, 'groove'], ['break', 16, 'break'], ['build', 8, 'build'], ['drop', 32, 'drop'], ['groove', 16, 'groove2'], ['break', 8, 'break'], ['drop', 16, 'drop'], ['outro', 16, 'outro']],
  psy: [['intro', 16, 'drums1'], ['groove', 32, 'groove'], ['break', 16, 'break'], ['build', 8, 'build'], ['drop', 32, 'drop'], ['break', 8, 'break'], ['build', 8, 'build'], ['drop', 32, 'drop'], ['outro', 16, 'outro']],
};
// which parts play in each layer set (1 = full, fractions = density / level cue for the composer)
const LAYERS = {
  drums0: { kick: 1, hats: 0.5, perc: 0.3 }, drums1: { kick: 1, snare: 1, hats: 1, perc: 0.6, bass: 0.7 },
  groove: { kick: 1, snare: 1, hats: 1, perc: 1, bass: 1, chords: 0.7, pad: 0.4, texture: 1 },
  groove2: { kick: 1, snare: 1, hats: 1, perc: 1, bass: 1, chords: 1, lead: 0.5, texture: 1 },
  break: { pad: 1, chords: 0.8, lead: 0.8, texture: 1, perc: 0.2, bass: 0.3 }, break2: { pad: 1, chords: 0.6, lead: 0.5, texture: 1 },
  build: { snare: 1, hats: 1, perc: 0.5, bass: 0.6, chords: 0.8, pad: 0.6, lead: 0.6, riser: 1, kick: 0.5, texture: 1 },
  drop: { kick: 1, snare: 1, hats: 1, perc: 1, bass: 1, chords: 1, pad: 0.4, lead: 1, texture: 0.5 }, // (v10.1: the pad 0.6 → 0.4 in drops — the bed under chords, lead and arp, not a fourth voice in the middle)
  outro: { kick: 1, snare: 0.6, hats: 1, perc: 0.6, bass: 0.4 }, intro: { pad: 1, chords: 0.6, texture: 1, hats: 0.3, lead: 0.4 },
  // (v9.4) the false drop: after a build, the hook and the harmony arrive with the hats and percussion — but no kick and no bass yet
  tease: { snare: 0.6, hats: 1, perc: 1, chords: 1, pad: 0.6, lead: 1, texture: 0.6 },
};
const GENRES = [
{ id: 'deep-house', name: 'Deep House', family: 'house', bpm: [120, 124], swing: 56, modes: ['dorian', 'minor'], form: 'deep',
  kit: { kick: { len: 0.6, fEnd: 52, fStart: 165, pDec: 0.03, punch: 0.25, aDec: 0.3, hold: 0.012, click: 0.12, clickF: 2800, drive: 1.3, lp: 5000, sub: 0.3 },
    snare: { kind: 'clap', clapF: 1150, clapQ: 1.0, clapGap: 0.011, clapTail: 0.2, claps: 3 }, hats: { base: 380, noise: 0.45, cDec: 0.035, oDec: 0.26, bpF: 9500, hpF: 7000, shakF: 8000, shakDec: 0.06 } },
  drums: { main: [
      { k: 'X...X...X...X...', s: '....x.......x...', ho: '..o...o...o...o.', sh: 'g.gog.gog.gog.go', rim: '.......g.....g..' },
      { k: 'X...X...X...X...', s: '....x.......x...', ho: '..o...o...o...o.', hc: 'g...g...g...g...', sh: 'g.gog.gog.gog.go', p: [['bongo', 0, '...g......g..g..']] }],
    fill: ['............g.gx', '..........g...xo'] },
  bass: { kit: { model: 'sub', drive: 1.6, sub: 0.6, aAtk: 0.004, aDec: 0.3, aSus: 0.85, aRel: 0.06, gain: 1 }, oct: 36, gate: 0.85,
    pats: [{ n: '..R...R...R..RA.' }, { n: '..R..R.R..R...R.' }, { n: '...R..R...R.R.A.' }] },
  harm: { progs: [['i9', 'iv9'], ['i9', 'bVIImaj7'], ['i7', 'bVImaj7', 'bVII', 'i7'], ['i9', 'v7']], hr: 2, ext: '9' },
  chords: { role: 'stab', kit: { model: 'ep', aAtk: 0.002, aDec: 0.9, aSus: 0.25, aRel: 0.35, gain: 0.8 }, range: [57, 76], rhythm: ['...x..x...x.....', '...x......x..x..', '..x...x......x..'], len: 2 },
  pad: { kit: { model: 'pad', detune: 0.5, cut: 1600, res: 0.1, aAtk: 0.8, aDec: 1, aSus: 0.9, aRel: 1.4, width: 0.8, gain: 0.5 }, range: [52, 72] },
  lead: { role: 'chop', kit: { model: 'vox', aAtk: 0.006, aDec: 0.18, aSus: 0.3, aRel: 0.12, gain: 0.55 }, range: [64, 79], rhythm: ['..x.....x..x....', '......x...x.x...', '..x..x......x...'] },
  texture: 'vinyl', mix: { lufs: -9, verb: 0.24, delay: 0.18, sc: 0.35, bassDuck: 0.7 } },

{ id: 'tech-house', name: 'Tech House', family: 'house', bpm: [124, 128], swing: 54, modes: ['minor', 'dorian'], form: 'club',
  kit: { kick: { len: 0.45, fEnd: 49, fStart: 230, pDec: 0.0158, punch: 0.45, aDec: 0.26, hold: 0.01, click: 0.45, clickF: 3800, drive: 2.2, lp: 8000, sub: 0.3 },
    snare: { kind: 'clap', clapF: 1350, clapQ: 1.3, clapGap: 0.008, clapTail: 0.13, claps: 3 }, hats: { base: 430, noise: 0.3, cDec: 0.03, oDec: 0.22, bpF: 11000, hpF: 7800 } },
  drums: { main: [
      { k: 'X...X...X...X...', s: '....X.......X...', ho: '..x...x...x...x.', hc: 'gxgxgxgxgxgxgxgx', p: [['bongo', 0, '...x..x....x..x.'], ['rim', 0, '......g.......g.']] },
      { k: 'X...X...X...X...', s: '....X.......X...', ho: '..x...x...x...x.', hc: 'g.xxg.xxg.xxg.xx', p: [['conga', 0, '.x....x..x...x..'], ['rim', 0, '...g......g.....']] }],
    fill: ['............xxXX', '..........x.x.xX'] },
  bass: { kit: { model: 'pluck', cut: 220, res: 0.25, envAmt: 3.2, fDec: 0.09, aAtk: 0.002, aDec: 0.18, aSus: 0.5, aRel: 0.05, sub: 0.6, drive: 1.6, gain: 1 }, oct: 36, gate: 0.6,
    pats: [{ n: '..R..R.R..R..RO.' }, { n: '.R.R..R..R.R..R.' }, { n: '..Rr..R...Rr..Ro' }] },
  harm: { progs: [['i'], ['i', 'bVII'], ['i', 'iv']], hr: 4, ext: '7' },
  chords: { role: 'stab', kit: { model: 'organ', aAtk: 0.002, aDec: 0.25, aSus: 0.0, aRel: 0.1, bright: 0.6, gain: 0.55 }, range: [55, 72], rhythm: ['..x.......x.....', '......x.......x.', '...x..x.........'], len: 1, sparse: 0.5 },
  lead: { role: 'chop', kit: { model: 'vox', aAtk: 0.004, aDec: 0.12, aSus: 0.2, aRel: 0.08, gain: 0.55 }, range: [62, 76], rhythm: ['x..x..x.........', '..x...x.x.......', 'x.x...x...x.....'] },
  texture: 'none', mix: { lufs: -8, verb: 0.16, delay: 0.14, sc: 0.45 } },

{ id: 'techno', name: 'Techno', family: 'techno', bpm: [128, 134], swing: 50, modes: ['minor', 'phrygian'], form: 'techno',
  kit: { kick: { len: 0.5, fEnd: 47, fStart: 210, pDec: 0.0144, punch: 0.35, aDec: 0.34, hold: 0.015, click: 0.4, clickF: 3200, drive: 3.2, lp: 6500, rumble: 0.6 },
    snare: { kind: 'clap', clapF: 1500, clapQ: 1.6, clapGap: 0.007, clapTail: 0.16, claps: 3 }, hats: { base: 460, noise: 0.25, cDec: 0.028, oDec: 0.2, bpF: 11500, hpF: 8200, rideF: 640 } },
  drums: { main: [
      { k: 'X...X...X...X...', s: '....o.......o...', ho: '..X...X...X...X.', hc: 'x.xgx.xgx.xgx.xg', p: [['tom', 45, '..........g.....']] },
      { k: 'X...X...X...X...', ho: '..X...X...X...X.', hc: 'xgxxxgxxxgxxxgxx', ride: 'x.x.x.x.x.x.x.x.', p: [['rim', 0, '...g..g....g....']] }],
    fill: ['............oooo', '..............xx'] },
  bass: { kit: { model: 'pluck', cut: 150, res: 0.15, envAmt: 2.2, fDec: 0.06, aAtk: 0.002, aDec: 0.11, aSus: 0.0, aRel: 0.04, sub: 0.8, drive: 1.4, gain: 1 }, oct: 36, gate: 0.55,
    pats: [{ n: '.RRR.RRR.RRR.RRR' }, { n: '..R...R...R...R.' }, { n: '.R.R.R.R.R.R.R.R' }] },
  harm: { progs: [['i'], ['i', 'bII'], ['i', 'bVII']], hr: 4, ext: 'triad' },
  chords: { role: 'stab', kit: { model: 'stab', cut: 900, res: 0.35, envAmt: 2.5, fDec: 0.12, aAtk: 0.002, aDec: 0.2, aSus: 0, aRel: 0.12, gain: 0.45 }, range: [52, 67], rhythm: ['..x.............', '......x.......x.', '...x......x.....'], len: 1, sparse: 0.6 },
  lead: { role: 'seq', kit: { model: 'acid', wave: 0, cut: 400, res: 0.65, envAmt: 3, fDec: 0.15, aAtk: 0.002, aDec: 0.2, aSus: 0.4, aRel: 0.05, drive: 1.5, glide: 0.05, gain: 0.5, lfoDepth: 0.6, lfoSync: 16 }, range: [48, 62], rhythm: ['x.xxx.x.xx.x.xx.', 'xx.x.xx.x.xx.x.x'] },
  texture: 'none', mix: { lufs: -7.5, verb: 0.2, delay: 0.16, sc: 0.5 } },

// (v9.2) melodic techno and progressive house were one contract (similarity 0.84 — the same drums, bass, chords and arp). Melodic
// techno now speaks its own language: Phrygian and harmonic minor as well as natural minor, a chord every four bars (hypnotic, not
// a loop of four), progressions with the Phrygian bII and the harmonic-minor V
{ id: 'melodic-techno', name: 'Melodic Techno', family: 'techno', bpm: [122, 126], swing: 50, modes: ['minor', 'harmonic', 'phrygian'], form: 'club',
  kit: { kick: { len: 0.5, fEnd: 49, fStart: 220, pDec: 0.0163, punch: 0.4, aDec: 0.28, hold: 0.012, click: 0.35, clickF: 3500, drive: 2.4, lp: 7000, sub: 0.3 , rumble: 0.3 },
    snare: { kind: 'clap', clapF: 1300, clapQ: 1.2, clapGap: 0.009, clapTail: 0.22, claps: 3 }, hats: { base: 420, noise: 0.3, cDec: 0.03, oDec: 0.24, bpF: 10500, hpF: 7600 } },
  drums: { main: [
      { k: 'X...X...X...X...', s: '....x.......x...', ho: '..x...x...x...x.', hc: 'gxgxgxgxgxgxgxgx', p: [['tom', 47, '..........g.....']] },
      { k: 'X...X...X...X...', s: '....x.......x...', ho: '..x...x...x...x.', hc: 'gxxxgxxxgxxxgxxx', ride: '..x...x...x...x.' }],
    fill: ['............xxxx'] },
  bass: { kit: { model: 'pluck', cut: 180, res: 0.2, envAmt: 2.6, fDec: 0.08, aAtk: 0.002, aDec: 0.13, aSus: 0.1, aRel: 0.05, sub: 0.7, drive: 1.5, gain: 1 }, oct: 36, gate: 0.6,
    pats: [{ n: '.RRR.RRR.RRR.RRR' }, { n: '.RRO.RRR.RRO.RRR' }] },
  harm: { progs: [['i', 'bII', 'i', 'bVII'], ['i', 'bVI', 'V', 'i'], ['i', 'bVI', 'bVII', 'i'], ['i', 'v', 'bVI', 'iv'], ['i', 'bVI', 'iv', 'v']], hr: 4, breakHr: 4, ext: 'add9' },
  chords: { role: 'pad', kit: { model: 'supersaw', detune: 0.35, cut: 1400, res: 0.1, aAtk: 0.4, aDec: 1, aSus: 0.9, aRel: 1.2, width: 0.9, gain: 0.35 }, range: [55, 74] },
  pad: { kit: { model: 'pad', detune: 0.6, cut: 1100, aAtk: 1.2, aDec: 1, aSus: 0.9, aRel: 2, width: 1, gain: 0.35 }, range: [48, 67] },
  lead: { role: 'arp', kit: { model: 'pluck', cut: 700, res: 0.3, envAmt: 3.4, fDec: 0.12, aAtk: 0.001, aDec: 0.22, aSus: 0, aRel: 0.15, gain: 0.45 }, range: [60, 84], arp: { pat: [0, 2, 1, 3, 2, 4, 1, 3], rate: 1, oct: 2 } },
  hook: { kit: { model: 'saw', voices: 2, detune: 0.4, cut: 2600, res: 0.15, envAmt: 1, fDec: 0.3, aAtk: 0.01, aDec: 0.4, aSus: 0.7, aRel: 0.3, gain: 0.32 }, range: [67, 84], rhythm: ['x..x..x.x...x...', 'x.....x...x..x..'] },
  texture: 'air', mix: { lufs: -8.5, verb: 0.3, delay: 0.24, sc: 0.5 } },

{ id: 'trance', name: 'Uplifting Trance', family: 'trance', bpm: [136, 140], swing: 50, modes: ['minor'], form: 'trance',
  kit: { kick: { len: 0.55, fEnd: 50, fStart: 260, pDec: 0.013, punch: 0.5, aDec: 0.21, hold: 0.01, click: 0.5, clickF: 4000, drive: 2.2, lp: 9000, sub: 0.45 }, // longer, deeper body: the audit measured trance 15 dB short of sub
    snare: { kind: 'clap', clapF: 1400, clapQ: 1.2, clapGap: 0.008, clapTail: 0.18, claps: 3 }, hats: { base: 450, noise: 0.3, cDec: 0.03, oDec: 0.2, bpF: 11000, hpF: 8000, rideF: 640 } },
  drums: { main: [
      { k: 'X...X...X...X...', s: '....x.......x...', ho: '..X...X...X...X.', hc: 'x.x.x.x.x.x.x.x.', ride: 'g.g.g.g.g.g.g.g.' },
      { k: 'X...X...X...X...', s: '....x.......x...', ho: '..X...X...X...X.', hc: 'xgxgxgxgxgxgxgxg' }],
    fill: ['........x.x.xxxx', '............xxxx'] },
  bass: { kit: { model: 'pluck', cut: 260, res: 0.2, envAmt: 2.4, fDec: 0.07, aAtk: 0.002, aDec: 0.12, aSus: 0.3, aRel: 0.05, sub: 1, drive: 1.4, gain: 1 }, oct: 36, gate: 0.6,
    pats: [{ n: '.RRR.RRR.RRR.RRR' }, { n: '..O...O...O...O.' }, { n: '.RRO.RRO.RRO.RRO' }] },
  harm: { progs: [['i', 'bVI', 'bIII', 'bVII'], ['bVI', 'bVII', 'i', 'i'], ['i', 'bVII', 'bVI', 'bVII'], ['bVI', 'bIII', 'bVII', 'i']], hr: 1, ext: 'add9', breakHr: 2 },
  chords: { role: 'gate', kit: { model: 'supersaw', detune: 0.45, cut: 5200, res: 0.1, aAtk: 0.003, aDec: 0.12, aSus: 0.7, aRel: 0.06, width: 1, gain: 0.32 }, range: [57, 79], gate: ['x.xx.xx.x.xx.xx.', 'xxx.xxx.xxx.xxx.', '.x.x.xx..x.x.xx.'] },
  pad: { kit: { model: 'supersaw', detune: 0.5, cut: 2400, aAtk: 0.9, aDec: 1, aSus: 0.9, aRel: 2, width: 1, gain: 0.32 }, range: [55, 76] },
  lead: { role: 'hook', kit: { model: 'supersaw', detune: 0.3, cut: 6500, res: 0.1, aAtk: 0.004, aDec: 0.3, aSus: 0.75, aRel: 0.18, width: 0.8, gain: 0.34 }, range: [69, 88], rhythm: ['x..x..x.x.x.x...', 'x.x.x..x..x.x...', 'x..x..x...x.xx..'] },
  arp: { kit: { model: 'pluck', cut: 900, res: 0.25, envAmt: 3, fDec: 0.09, aAtk: 0.001, aDec: 0.16, aSus: 0, aRel: 0.12, gain: 0.35 }, range: [62, 86], arp: { pat: [0, 1, 2, 3, 2, 1, 3, 4], rate: 1, oct: 2 } },
  texture: 'air', mix: { lufs: -7.5, verb: 0.32, delay: 0.26, sc: 0.55 } },

{ id: 'psytrance', name: 'Psytrance', family: 'psy', bpm: [142, 146], swing: 50, modes: ['minor', 'harmonic', 'phrygian'], form: 'psy',
  // v9: rebuilt from full-on production practice. Measured on v8: the kick had 7 % of its energy at its own fundamental and 49 % at
  // 120–250 Hz (a tom, not a psy kick); the "rolling bass" had its fundamental cancelled by its own sub (−26 dB, see 03_synth.js);
  // the snare was a two-burst house clap; nothing on the top but hats; no percussion at all. Now: a punchy kick that holds its
  // tuned body ~45 ms and is gone (-30 dB) before the first bass sixteenth; the KBBB roll with its fundamental back and the sub
  // after the filter; a tight snare with a short clap under it; ticks and rims on the top; a dark pad for the breakdowns only;
  // the acid sequence, a screaming second voice, and the ear candy (zaps, squelches, bubbles, swirls) of the production layer.
  kit: { kick: { len: 0.27, fEnd: 55, fStart: 260, pDec: 0.011, punch: 0.55, aDec: 0.04, hold: 0.045, click: 0.8, clickF: 5000, drive: 1.9, lp: 9500, sub: 0.3 },
    snare: { kind: 'snare', tone: 215, tone2: 390, toneAmt: 0.35, toneDec: 0.05, nDec: 0.11, snap: 0.9, nHp: 1900, nLp: 10500, layer: 0.45, clapF: 1500, clapQ: 1.3, clapGap: 0.007, clapTail: 0.09, claps: 2 },
    hats: { base: 500, noise: 0.3, cDec: 0.02, oDec: 0.11, bpF: 12500, hpF: 9000, rideF: 720, rideDec: 0.9, shakF: 9200, shakDec: 0.05 },
    perc: { pitch: 1, dec: 0.8, noise: 0.6 } },
  drums: { main: [
      { k: 'X...X...X...X...', s: '....x.......x...', ho: '..X...X...X...X.', hc: 'xg.gxg.gxg.gxg.g', ride: '..g...g...g...g.', p: [['rim', 0, '.......g.......g'], ['tick', 0, '.g...g.g.g...g.g']] },
      { k: 'X...X...X...X...', s: '....x.......x...', ho: '..X...X...X...X.', hc: 'x..gx..gx..gx..g', sh: 'g.g.g.g.g.g.g.g.', p: [['rim', 0, '...g.......g..g.'], ['tick', 0, '.g.g.g.g.g.g.g.g']] },
      { k: 'X...X...X...X...', s: '....x.......x...', ho: '..X...X...X...X.', hc: 'xx.xxx.xxx.xxx.x', ride: 'x.x.x.x.x.x.x.x.', p: [['tom', 48, '..............g.'], ['tick', 0, '.g.g.g.g.g.g.g.g']] }],
    fill: ['............xxxx', '..........x.xxxx', '........x.x.xxXX'] },
  bass: { kit: { model: 'pluck', cut: 160, res: 0.25, envAmt: 3.8, fDec: 0.045, aAtk: 0.001, aDec: 0.085, aSus: 0, aRel: 0.025, sub: 0.7, subPost: 1, drive: 1.8, gain: 1 }, oct: 36, gate: 0.62,
    pats: [{ n: '.RRR.RRR.RRR.RRR' }, { n: '.RRR.RRR.RRR.RRO' }, { n: '.RRR.RRR.RRR.RFR' }, { n: '.RRR.RRR.RRR.ORR' }] },
  // v9.1 — the user's verdict on v9: "psy is not psy: no trance chords, no content". Measured: one chord (i, or i–bII) for the
  // whole track, the lead ONE bar of an acid sequence looped for 48 bars, the bass a single repeated note, nothing but drums
  // and bass for the first 48 bars. Now, from full-on practice: progressions that move (natural and harmonic minor, Phrygian)
  // with a chord every 4 bars in the drops and every 2 in the breakdowns; gated supersaw chords (the trance gate) under the
  // drops and held chords over the breakdowns; a rolling RIFF as the lead (a two-bar call and answer that follows the chords,
  // with a variation and a turnaround), its THEME in long gliding notes over the breakdown; the acid line as a second voice
  // that enters halfway through the groove with its filter opening and answers the riff in its gaps.
  harm: { progs: [['i', 'bVI', 'bVII', 'i'], ['i', 'bVI', 'iv', 'V'], ['i', 'iv', 'bVI', 'V'], ['i', 'bVII', 'bVI', 'bVII'], ['i', 'bII', 'bVII', 'i'], ['i', 'bVI', 'bIII', 'bVII'], ['i', 'v', 'bVI', 'bVII'], ['i', 'i', 'bVI', 'bVII']], hr: 4, breakHr: 2, ext: 'triad' },
  chords: { role: 'gate', kit: { model: 'supersaw', detune: 0.38, cut: 2400, res: 0.14, aAtk: 0.002, aDec: 0.1, aSus: 0.55, aRel: 0.05, width: 1, gain: 0.2 }, range: [55, 74], gate: ['x.x.x.x.x.x.x.x.', '.x.x.x.x.x.x.x.x', 'x.xx.xx.x.xx.xx.'], in: { groove: 0.6 }, from: { groove: 0.75 }, dropAlt: 1 }, // (v9.2) in the drops, the second 8 bars of every 16 (the lift): 48 bars of gated triads under the riff measured as one wall
  pad: { kit: { model: 'supersaw', detune: 0.4, cut: 1400, res: 0.15, aAtk: 1.2, aDec: 1, aSus: 0.9, aRel: 2, width: 1, gain: 0.26 }, range: [50, 72] }, only: { pad: ['intro', 'break', 'build'], bass: ['intro', 'groove', 'build', 'drop', 'outro'] }, // (the roll stops for the breakdowns)
  lead: { role: 'riff', kit: { model: 'saw', voices: 2, detune: 0.16, cut: 2300, res: 0.34, envAmt: 2.2, fDec: 0.1, aAtk: 0.001, aDec: 0.18, aSus: 0.55, aRel: 0.06, drive: 1.6, glide: 0.035, gain: 0.36 }, range: [60, 81],
    theme: ['x.......x...x...', 'x...x.......x...', 'x.....x.....x...'] },
  hook: { role: 'seq', kit: { model: 'acid', wave: 0, cut: 520, res: 0.76, envAmt: 3.6, fDec: 0.11, aAtk: 0.001, aDec: 0.16, aSus: 0.25, aRel: 0.04, drive: 2, glide: 0.035, gain: 0.38, lfoDepth: 0.6, lfoSync: 8 }, range: [43, 60], // (v9.2) an octave under the riff (both sat at 55–81: median pitches 1–4 semitones apart)
    rhythm: ['x.xxx.xxx.xxx.x.', 'xxx.xx.xxx.xx.xx', 'x.x.xxx.x.xxx.xx'], in: { groove: 0.75, build: 0.45, drop: 0.8, groove2: 1, break: 0.35 }, from: { groove: 0 } }, // (v9.2: out of the outro — a DJ mixes over drums and bass; it played all 16 outro bars)
  texture: 'none', mix: { lufs: -7.5, verb: 0.18, delay: 0.26, sc: 0.25 } },

{ id: 'prog-psy', name: 'Progressive Psy', family: 'psy', bpm: [136, 140], swing: 50, modes: ['minor', 'phrygian', 'harmonic'], form: 'psy', ear: 0.55,
  // v9: the melodic side of psytrance (progressive psy): the same tight kick and rolling KBBB bass, rounder and a little slower;
  // hypnotic delayed pluck arpeggios, gated chords in the drops, chord changes every four bars, and fewer FX flying around
  kit: { kick: { len: 0.3, fEnd: 52, fStart: 240, pDec: 0.012, punch: 0.5, aDec: 0.04, hold: 0.04, click: 0.6, clickF: 4500, drive: 1.7, lp: 8500, sub: 0.3 },
    snare: { kind: 'snare', tone: 205, tone2: 370, toneAmt: 0.4, toneDec: 0.06, nDec: 0.13, snap: 0.75, nHp: 1700, nLp: 9500, layer: 0.5, clapF: 1400, clapQ: 1.2, clapGap: 0.008, clapTail: 0.12, claps: 3 },
    hats: { base: 480, noise: 0.32, cDec: 0.022, oDec: 0.13, bpF: 12000, hpF: 8800, rideF: 700, rideDec: 1, shakF: 8800, shakDec: 0.055 },
    perc: { pitch: 1, dec: 0.9, noise: 0.5 } },
  drums: { main: [
      { k: 'X...X...X...X...', s: '....x.......x...', ho: '..X...X...X...X.', hc: 'x..gx..gx..gx..g', sh: 'g.g.g.g.g.g.g.g.', p: [['rim', 0, '.......g.......g']] },
      { k: 'X...X...X...X...', s: '....x.......x...', ho: '..X...X...X...X.', hc: 'xg.gxg.gxg.gxg.g', ride: '..g...g...g...g.', p: [['tick', 0, '.g...g...g...g.g'], ['rim', 0, '...........g....']] },
      { k: 'X...X...X...X...', s: '....x.......x...', ho: '..X...X...X...X.', hc: 'xx.xxx.xxx.xxx.x', ride: 'x.x.x.x.x.x.x.x.', p: [['tick', 0, '.g.g.g.g.g.g.g.g']] }],
    fill: ['............xxxx', '..........x.xxxx'] },
  bass: { kit: { model: 'pluck', cut: 140, res: 0.15, envAmt: 3.2, fDec: 0.06, aAtk: 0.002, aDec: 0.11, aSus: 0, aRel: 0.04, sub: 0.8, subPost: 1, drive: 1.5, gain: 1 }, oct: 36, gate: 0.66,
    pats: [{ n: '.RRR.RRR.RRR.RRR' }, { n: '.RR..RR..RR..RRR' }, { n: '.RRR.RRR.RRR.RRO' }] },
  harm: { progs: [['i', 'bVI', 'bVII', 'i'], ['i', 'v', 'bVI', 'bVII'], ['i', 'bIII', 'bVII', 'iv'], ['i', 'i', 'bVI', 'bVII']], hr: 4, ext: 'add9', breakHr: 4 },
  chords: { role: 'gate', kit: { model: 'supersaw', detune: 0.35, cut: 2600, res: 0.12, aAtk: 0.003, aDec: 0.12, aSus: 0.6, aRel: 0.06, width: 1, gain: 0.24 }, range: [57, 76], gate: ['x.x.x.x.x.x.x.x.', '.x.x.x.x.x.x.x.x', 'x.xx.xx.x.xx.xx.'] },
  pad: { kit: { model: 'supersaw', detune: 0.45, cut: 1600, res: 0.12, aAtk: 1.4, aDec: 1, aSus: 0.9, aRel: 2.2, width: 1, gain: 0.26 }, range: [50, 72] }, only: { pad: ['intro', 'break', 'build'] },
  lead: { role: 'arp', kit: { model: 'pluck', cut: 1100, res: 0.4, envAmt: 2.8, fDec: 0.07, aAtk: 0.001, aDec: 0.13, aSus: 0, aRel: 0.08, gain: 0.42 }, range: [60, 84], arp: { pat: [0, 2, 1, 3, 0, 2, 4, 3], rate: 1, oct: 2 } },
  hook: { kit: { model: 'saw', voices: 2, detune: 0.35, cut: 2800, res: 0.2, envAmt: 1.2, fDec: 0.3, aAtk: 0.01, aDec: 0.4, aSus: 0.7, aRel: 0.3, glide: 0.04, gain: 0.3 }, range: [67, 86], rhythm: ['x.......x...x...', 'x...x.....x.x...'] },
  texture: 'none', mix: { lufs: -7.5, verb: 0.24, delay: 0.3, sc: 0.25 } },

{ id: 'dnb', name: 'Drum & Bass', family: 'dnb', bpm: [172, 176], swing: 50, modes: ['minor', 'dorian'], form: 'dnb',
  kit: { kick: { len: 0.45, fEnd: 55, fStart: 260, pDec: 0.0116, punch: 0.5, aDec: 0.18, hold: 0.008, click: 0.6, clickF: 4200, drive: 1.9, lp: 10000 },
    snare: { kind: 'snare', tone: 210, tone2: 340, toneDec: 0.07, toneAmt: 0.5, nDec: 0.15, nHp: 1600, nLp: 9500, snap: 0.9 }, hats: { base: 470, noise: 0.35, cDec: 0.025, oDec: 0.18, bpF: 11500, hpF: 8500, rideF: 680, shakF: 9000 } },
  drums: { main: [
      { k: 'X.........X.....', s: '....X.......X...', hc: 'x.x.x.x.x.x.x.x.', sh: 'gggggggggggggggg' },
      { k: 'X.........X..x..', s: '....X..g....X...', hc: 'x.xgx.x.x.xgx.x.', ride: 'g.g.g.g.g.g.g.g.' },
      { k: 'X.X.......X.....', s: '....X.......X..g', hc: 'xgxgxgxgxgxgxgxg' }],
    fill: ['..........xx.xXX', '............XxXx'] },
  bass: { kit: { model: 'reese', detune: 0.9, cut: 520, res: 0.25, aAtk: 0.01, aDec: 0.5, aSus: 0.9, aRel: 0.12, sub: 0.9, drive: 1.6, lfoRate: 0.3, lfoDepth: 0.4, gain: 0.9 }, oct: 36, gate: 1,
    pats: [{ n: 'R---------R-----' }, { n: 'R-------F-----R-' }, { n: 'R---------O---R-' }] },
  harm: { progs: [['i9', 'bVImaj7', 'iv9', 'v7'], ['i9', 'bVII', 'bVImaj7', 'v'], ['iv9', 'v7', 'i9', 'i9']], hr: 2, ext: '9' },
  chords: { role: 'pad', kit: { model: 'ep', aAtk: 0.004, aDec: 1.8, aSus: 0.35, aRel: 0.6, gain: 0.6 }, range: [57, 76] },
  pad: { kit: { model: 'strings', detune: 0.6, cut: 3000, aAtk: 0.7, aDec: 1, aSus: 0.9, aRel: 1.5, width: 1, gain: 0.32 }, range: [55, 76] },
  lead: { role: 'hook', kit: { model: 'bell', ratio: 3, index: 2.4, aAtk: 0.002, aDec: 0.8, aSus: 0.1, aRel: 0.5, gain: 0.32 }, range: [69, 86], rhythm: ['x.....x...x.....', '..x.....x...x...'] },
  texture: 'air', mix: { lufs: -8, verb: 0.26, delay: 0.2, sc: 0.35, bassDuck: 0.8 } },

{ id: 'dubstep', name: 'Dubstep', family: 'bass', bpm: [140, 140], swing: 50, modes: ['minor', 'phrygian'], form: 'bass',
  kit: { kick: { len: 0.5, fEnd: 50, fStart: 240, pDec: 0.0158, punch: 0.5, aDec: 0.24, hold: 0.012, click: 0.55, clickF: 4000, drive: 2.4, lp: 9000, sub: 0.3 },
    snare: { kind: 'snare', tone: 190, tone2: 310, toneDec: 0.09, toneAmt: 0.55, nDec: 0.2, nHp: 1300, nLp: 8500, snap: 0.7 }, hats: { base: 440, noise: 0.35, cDec: 0.03, oDec: 0.2, bpF: 11000, hpF: 8000 } },
  drums: { main: [
      { k: 'X.........x.....', s: '........X.......', hc: 'x..x..x..x..x.x.', p: [['tom', 45, '..............g.']] },
      { k: 'X......x..X.....', s: '........X.......', hc: 'x.x.xx.x.xx.x.x.' }],
    fill: ['..........x.xXXX'] },
  bass: { kit: { model: 'wobble', cut: 300, res: 0.45, aAtk: 0.004, aDec: 0.4, aSus: 0.9, aRel: 0.08, drive: 3.5, sub: 0.9, lfoDepth: 1, lfoSync: 0.5, keytrack: 0, gain: 0.85 }, oct: 36, gate: 1, wobble: [0.5, 0.25, 1, 0.333, 0.5],
    pats: [{ n: 'R-------R---R---' }, { n: 'R-----R-----F---' }, { n: 'R---R---R-------' }] },
  harm: { progs: [['i'], ['i', 'bVI'], ['i', 'bII']], hr: 2, ext: 'triad' },
  chords: { role: 'pad', kit: { model: 'pad', detune: 0.6, cut: 900, aAtk: 1, aDec: 1, aSus: 0.9, aRel: 2, width: 1, gain: 0.35 }, range: [50, 70] },
  lead: { role: 'hook', kit: { model: 'bell', ratio: 2, index: 1.6, aAtk: 0.002, aDec: 0.6, aSus: 0.2, aRel: 0.4, gain: 0.25 }, range: [67, 84], rhythm: ['x.....x...x.....'] },
  texture: 'dark', mix: { lufs: -7, verb: 0.22, delay: 0.2, sc: 0.4, bassDuck: 0.8 } },

{ id: 'trap', name: 'Trap', family: 'hiphop', bpm: [138, 146], swing: 50, modes: ['minor', 'harmonic', 'phrygian'], form: 'bass',
  kit: { kick: { len: 0.4, fEnd: 52, fStart: 190, pDec: 0.0158, punch: 0.4, aDec: 0.16, hold: 0.008, click: 0.45, clickF: 3500, drive: 1.8, lp: 9000, sub: 0.3 },
    snare: { kind: 'clap', clapF: 1300, clapQ: 1.1, clapGap: 0.007, clapTail: 0.14, claps: 3 }, hats: { base: 500, noise: 0.25, cDec: 0.022, oDec: 0.16, bpF: 12000, hpF: 9000 } },
  drums: { main: [
      { k: 'X......x..X.....', s: '........X.......', hc: 'x.x.x.x.x.x.xrxr' },
      { k: 'X.....x...x..x..', s: '........X.......', hc: 'x.x.xzx.x.x.x.qx' },
      { k: 'X.........X.x...', s: '........X.......', hc: 'xxx.x.xrx.x.xzx.' }],
    fill: ['..........x.xxXX'] },
  bass: { kit: { model: 'b808', drive: 2.4, aAtk: 0.002, aDec: 0.9, aSus: 0.75, aRel: 0.2, glide: 0.07, pEnv: 3, pDec: 0.04, gain: 0.95 }, oct: 36, gate: 1, followKick: 1,
    pats: [{ n: 'R------R--R-----' }, { n: 'R-----R---f-----' }, { n: 'R---------R.o---' }] },
  harm: { progs: [['i', 'bVI'], ['i', 'iv', 'bVI', 'v'], ['i', 'bII']], hr: 2, ext: 'triad' },
  chords: { role: 'pad', kit: { model: 'pad', detune: 0.5, cut: 1500, aAtk: 0.6, aDec: 1, aSus: 0.8, aRel: 1.5, width: 1, gain: 0.25 }, range: [55, 72] },
  lead: { role: 'hook', kit: { model: 'bell', ratio: 3, index: 2, aAtk: 0.001, aDec: 0.5, aSus: 0.05, aRel: 0.3, gain: 0.32 }, range: [72, 89], rhythm: ['x.x...x.x...x.x.', 'x..x..x.x..x....'] },
  texture: 'none', mix: { lufs: -7.5, verb: 0.18, delay: 0.16, sc: 0.0 } },

{ id: 'ukg', name: 'UK Garage', family: 'garage', bpm: [132, 136], swing: 64, modes: ['minor', 'dorian'], form: 'garage',
  kit: { kick: { len: 0.5, fEnd: 52, fStart: 200, pDec: 0.018, punch: 0.4, aDec: 0.22, hold: 0.01, click: 0.35, clickF: 3200, drive: 1.6, lp: 8000, sub: 0.3 },
    snare: { kind: 'clap', clapF: 1250, clapQ: 1.2, clapGap: 0.008, clapTail: 0.14, claps: 3 }, hats: { base: 440, noise: 0.35, cDec: 0.03, oDec: 0.2, bpF: 10500, hpF: 7800, shakF: 8500 } },
  drums: { main: [
      { k: 'X.........X.....', s: '....X.......X...', rim: '.......g......g.', ho: '..x...x...x...x.', hc: '...g.g.....g.g..', sh: 'g.g.g.g.g.g.g.g.' },
      { k: 'X.........x..X..', s: '....X.......X...', rim: '...g......g....g', ho: '..x...x...x...x.', hc: '.g...g.g.g...g..' }],
    fill: ['...........g.gxX'] },
  bass: { kit: { model: 'sub', drive: 2, sub: 0.4, aAtk: 0.003, aDec: 0.25, aSus: 0.8, aRel: 0.05, glide: 0.05, gain: 1 }, oct: 36, gate: 0.8,
    pats: [{ n: 'R.....R...R.R...' }, { n: 'R..R......R..r..' }, { n: 'R.....O...R..A..' }] },
  harm: { progs: [['i7', 'iv7'], ['i9', 'bVImaj7', 'bVII', 'i9'], ['ii7', 'v7']], hr: 2, ext: '7' },
  chords: { role: 'stab', kit: { model: 'organ', aAtk: 0.002, aDec: 0.3, aSus: 0.1, aRel: 0.12, bright: 0.5, gain: 0.5 }, range: [57, 74], rhythm: ['...x..x..x......', '...x..x....x....', '..x...x..x......'], len: 1 },
  lead: { role: 'chop', kit: { model: 'vox', aAtk: 0.004, aDec: 0.14, aSus: 0.25, aRel: 0.08, gain: 0.55 }, range: [64, 79], rhythm: ['x..x......x..x..', '..x.x...x.......'] },
  texture: 'vinyl', mix: { lufs: -8.5, verb: 0.2, delay: 0.18, sc: 0.35, bassDuck: 0.85 } },
];
const GENRE_BY_ID = {}; for (const g of GENRES) GENRE_BY_ID[g.id] = g;
