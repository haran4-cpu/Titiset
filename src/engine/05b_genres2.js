/* ===================== GENRE BIBLE · part 2 =====================
   22 more contracts. Same DSL as part 1. Where a genre's identity is a rhythm (dembow, amen, jersey kick, tresillo
   log drum, boom-bap, reverse bass) it is written out literally — the composer never "approximates" a groove. */
Object.assign(FORMS, {
  pop: [['intro', 8, 'drums1'], ['intro', 8, 'intro'], ['groove', 16, 'verse'], ['build', 8, 'build'], ['drop', 16, 'drop'], ['groove', 16, 'verse'], ['build', 8, 'build'], ['drop', 16, 'drop'], ['break', 8, 'break2'], ['drop', 16, 'drop'], ['outro', 16, 'outro']],
  chill: [['intro', 8, 'intro'], ['groove', 16, 'chillA'], ['groove', 16, 'chillB'], ['break', 8, 'break2'], ['groove', 16, 'chillB'], ['groove', 8, 'chillA'], ['outro', 8, 'outro']],
  ambient: [['intro', 16, 'ambA'], ['groove', 32, 'ambB'], ['break', 16, 'ambA'], ['groove', 32, 'ambB'], ['outro', 16, 'ambA']],
  hard: [['intro', 16, 'drums1'], ['groove', 16, 'groove'], ['break', 32, 'break'], ['build', 16, 'build'], ['drop', 32, 'drop'], ['break', 16, 'break2'], ['build', 8, 'build'], ['drop', 32, 'drop'], ['outro', 16, 'outro']],
});
Object.assign(LAYERS, {
  verse: { kick: 1, snare: 1, hats: 1, perc: 0.5, bass: 0.8, chords: 0.6, pad: 0.6, lead: 0.5, texture: 1 },
  chillA: { kick: 1, snare: 1, hats: 1, perc: 0.6, bass: 1, chords: 1, pad: 0.5, lead: 0.6, texture: 1 },
  chillB: { kick: 1, snare: 1, hats: 1, perc: 1, bass: 1, chords: 1, pad: 0.8, lead: 1, texture: 1 },
  ambA: { pad: 1, chords: 0.6, lead: 0.4, texture: 1 }, ambB: { pad: 1, chords: 1, lead: 0.9, texture: 1, perc: 0.3, bass: 0.7 },
});
const K909 = { fEnd: 50, fStart: 210, pDec: 0.018, punch: 0.42, aDec: 0.27, hold: 0.01, click: 0.5, clickF: 3600, drive: 1.9, lp: 8000 };
const CLAP909 = { kind: 'clap', clapF: 1200, clapQ: 1.1, clapGap: 0.009, clapTail: 0.17, claps: 3 };
const HAT909 = { base: 440, noise: 0.5, cDec: 0.032, oDec: 0.24, bpF: 10500, hpF: 7500, rideF: 640, shakF: 8500 };
GENRES.push(
{ id: 'house', name: 'House (Piano)', family: 'house', bpm: [122, 126], swing: 54, modes: ['major', 'minor', 'mixolydian'], form: 'club',
  kit: { kick: Object.assign({}, K909, { len: 0.5, sub: 0.3 }), snare: CLAP909, hats: HAT909 },
  drums: { main: [
      { k: 'X...X...X...X...', s: '....X.......X...', ho: '..x...x...x...x.', hc: 'gggggggggggggggg', p: [['tamb', 0, '....x.......x...']] },
      { k: 'X...X...X...X...', s: '....X.......X...', ho: '..x...x...x...x.', sh: 'xgogxgogxgogxgog', p: [['conga', 0, '..x..x....x..x..']] }],
    fill: ['............x.xx', '..........x...xX'] },
  bass: { kit: { model: 'pluck', cut: 320, res: 0.2, envAmt: 2, fDec: 0.12, aAtk: 0.003, aDec: 0.22, aSus: 0.4, aRel: 0.06, sub: 0.5, drive: 1.3, gain: 1 }, oct: 36, gate: 0.7,
    pats: [{ n: '..R..O.R..R..O.R' }, { n: '..R...R...R...O.' }, { n: '..R..R.O..R..A..' }] },
  harm: { progs: [['IVmaj7', 'iii7', 'ii7', 'Imaj7'], ['i7', 'iv9', 'bVImaj7', 'v7'], ['ii7', 'V7', 'Imaj7', 'vi7'], ['i7', 'bVII', 'bVI', 'bVII']], hr: 1, ext: '7' }, // v7: the I–V–vi–IV pop loop out — soulful, descending and minor colours in
  chords: { role: 'stab', kit: { model: 'piano', aAtk: 0.001, aDec: 0.9, aSus: 0.2, aRel: 0.3, bright: 0.7, gain: 0.7 }, range: [55, 77], rhythm: ['...x..x...x..x..', '..x..x....x..x..', '..x...x...x...x.'], len: 2 },
  pad: { kit: { model: 'strings', detune: 0.5, cut: 3200, aAtk: 0.5, aDec: 1, aSus: 0.9, aRel: 1, width: 1, gain: 0.28 }, range: [55, 74] },
  lead: { role: 'chop', kit: { model: 'vox', aAtk: 0.005, aDec: 0.16, aSus: 0.35, aRel: 0.1, gain: 0.55 }, range: [64, 81], rhythm: ['x..x......x.x...', '..x.x..x........', 'x.x...x...x.....'] },
  texture: 'none', mix: { lufs: -8.5, verb: 0.22, delay: 0.18, sc: 0.35 } },

// (v9.2) progressive house, apart from melodic techno: Dorian and major colour (add9, maj7, sus), a chord every four bars and eight
// over the breakdowns, the house groove (swing 53, shaker and rim instead of techno sixteenths), 120–126 BPM, more of the dotted-
// eighth delay on the plucked motif
{ id: 'progressive-house', name: 'Progressive House', family: 'house', bpm: [120, 126], swing: 53, modes: ['dorian', 'minor', 'major'], form: 'trance',
  kit: { kick: { len: 0.45, fEnd: 50, fStart: 220, pDec: 0.0169, punch: 0.42, aDec: 0.24, hold: 0.01, click: 0.4, clickF: 3800, drive: 2, lp: 8500, sub: 0.3 }, snare: CLAP909, hats: HAT909 },
  drums: { main: [
      { k: 'X...X...X...X...', s: '....x.......x...', ho: '..x...x...x...x.', sh: 'g.gxg.gxg.gxg.gx', rim: '.......g......g.' },
      { k: 'X...X...X...X...', s: '....x.......x...', ho: '..x...x...x...x.', hc: 'x.g.x.g.x.g.x.gg', sh: 'g.g.g.g.g.g.g.g.', ride: '..g...g...g...g.' }],
    fill: ['............xxxx', '..........x.xxxX'] },
  bass: { kit: { model: 'pluck', cut: 240, res: 0.2, envAmt: 2.4, fDec: 0.08, aAtk: 0.002, aDec: 0.12, aSus: 0.15, aRel: 0.04, sub: 0.6, drive: 1.4, gain: 1 }, oct: 36, gate: 0.6,
    pats: [{ n: '.RRR.RRR.RRR.RRR' }, { n: '..R...R...R...R.' }, { n: '.RRO.RRR.RRO.RRR' }] },
  harm: { progs: [['i', 'IV', 'bVII', 'i'], ['i', 'bIII', 'IV', 'bVII'], ['vi', 'IVmaj7', 'I', 'Vsus4'], ['IVmaj7', 'vi', 'iii', 'V'], ['i', 'bVII', 'bVI', 'bVII']], hr: 4, breakHr: 8, ext: 'add9' },
  chords: { role: 'pad', kit: { model: 'supersaw', detune: 0.3, cut: 1900, res: 0.1, aAtk: 0.3, aDec: 1, aSus: 0.9, aRel: 0.9, width: 0.9, gain: 0.3 }, range: [55, 74] },
  lead: { role: 'arp', kit: { model: 'pluck', cut: 900, res: 0.3, envAmt: 3.2, fDec: 0.1, aAtk: 0.001, aDec: 0.2, aSus: 0, aRel: 0.15, gain: 0.42 }, range: [60, 84], arp: { pat: [0, 2, 1, 3, 2, 1, 3, 4], rate: 1, oct: 2 } },
  hook: { kit: { model: 'kspluck', bright: 0.7, aAtk: 0.001, aDec: 0.6, aSus: 0.3, aRel: 0.3, gain: 0.45 }, range: [67, 86], rhythm: ['x..x..x...x.x...', 'x.....x.x..x....'] },
  texture: 'air', mix: { lufs: -8, verb: 0.3, delay: 0.32, sc: 0.5 } },

{ id: 'afro-house', name: 'Afro House', family: 'afro', bpm: [120, 124], swing: 56, modes: ['minor', 'dorian', 'phrygian'], form: 'deep',
  kit: { kick: { len: 0.55, fEnd: 52, fStart: 180, pDec: 0.021, punch: 0.3, aDec: 0.3, hold: 0.012, click: 0.2, clickF: 3000, drive: 1.4, lp: 6000 }, snare: { kind: 'clap', clapF: 1100, clapQ: 0.9, clapGap: 0.012, clapTail: 0.24, claps: 4 }, hats: { base: 400, noise: 0.5, cDec: 0.03, oDec: 0.2, bpF: 9500, hpF: 7000, shakF: 7800, shakDec: 0.06 } },
  drums: { main: [
      { k: 'X...X...X...X...', s: '....x.......x...', sh: 'xgogxgogxgogxgog', p: [['conga', 0, '..x..x.x..x...x.'], ['bongo', 0, 'x..x...x..x.x...'], ['tom', 45, '......x.......x.']] },
      { k: 'X...X...X...X...', s: '....x.......x...', sh: 'xgogxgogxgogxgog', ho: '..g...g...g...g.', p: [['conga', 0, '...x..x...x..xx.'], ['wood', 0, '..x...x..x..x...'], ['tom', 43, '..........x...x.']] }],
    fill: ['..........g.x.xx', '............xxxx'] },
  bass: { kit: { model: 'sub', drive: 1.8, sub: 0.5, aAtk: 0.004, aDec: 0.25, aSus: 0.7, aRel: 0.06, glide: 0.04, gain: 1 }, oct: 36, gate: 0.8,
    pats: [{ n: '...R..R...R..R.R' }, { n: '..R..R.R...R.R..' }, { n: '...R..R.F...R.A.' }] },
  harm: { progs: [['i', 'bVII', 'bVI', 'bVII'], ['i7', 'iv7'], ['i', 'bIII', 'bVII', 'iv'], ['i7', 'v7']], hr: 2, ext: '7' },
  chords: { role: 'pad', kit: { model: 'pad', detune: 0.5, cut: 1500, aAtk: 0.6, aDec: 1, aSus: 0.85, aRel: 1.2, width: 0.9, gain: 0.32 }, range: [52, 71] },
  lead: { role: 'arp', kit: { model: 'kspluck', bright: 0.45, aAtk: 0.001, aDec: 0.5, aSus: 0.2, aRel: 0.25, gain: 0.55 }, range: [60, 84], arp: { pat: [0, 2, 1, 2, 3, 2, 1, 2], rate: 1, oct: 2 } },
  hook: { kit: { model: 'vox', aAtk: 0.01, aDec: 0.3, aSus: 0.5, aRel: 0.2, gain: 0.5 }, range: [62, 76], rhythm: ['x.....x...x.....', '..x...x.x.......'] },
  texture: 'air', mix: { lufs: -8.5, verb: 0.26, delay: 0.22, sc: 0.35, bassDuck: 0.7 } },

{ id: 'hard-techno', name: 'Hard Techno', family: 'techno', bpm: [148, 155], swing: 50, modes: ['minor', 'phrygian'], form: 'techno',
  kit: { kick: { len: 0.55, fEnd: 48, fStart: 290, pDec: 0.01, punch: 0.7, aDec: 0.26, hold: 0.012, click: 0.7, clickF: 3600, drive: 6, lp: 7000, sub: 0.2 , rumble: 0.75 },
    snare: { kind: 'clap', clapF: 1700, clapQ: 1.8, clapGap: 0.006, clapTail: 0.12, claps: 3 }, hats: { base: 480, noise: 0.25, cDec: 0.022, oDec: 0.15, bpF: 12000, hpF: 9000, rideF: 700 } },
  drums: { main: [
      { k: 'X...X...X...X...', s: '....X.......X...', ho: '..X...X...X...X.', hc: 'xxxxxxxxxxxxxxxx' },
      { k: 'X...X...X...X...', ho: '..X...X...X...X.', hc: 'xgxxxgxxxgxxxgxx', ride: 'x.x.x.x.x.x.x.x.', p: [['tom', 41, '...........x..x.']] }],
    fill: ['............XXXX', '........x.x.xxXX'] },
  bass: { kit: { model: 'pluck', cut: 160, res: 0.2, envAmt: 2.6, fDec: 0.05, aAtk: 0.002, aDec: 0.09, aSus: 0, aRel: 0.03, sub: 0.7, drive: 3, gain: 1 }, oct: 36, gate: 0.55,
    pats: [{ n: '.RRR.RRR.RRR.RRR' }, { n: '.RR..RR..RR..RR.' }, { n: '..RR..RR..RR..RR' }] },
  harm: { progs: [['i'], ['i', 'bII'], ['i', 'i', 'bVII', 'i']], hr: 4, ext: 'triad' },
  chords: { role: 'none' },
  lead: { role: 'seq', kit: { model: 'acid', wave: 1, cut: 500, res: 0.6, envAmt: 3, fDec: 0.12, aAtk: 0.001, aDec: 0.15, aSus: 0.3, aRel: 0.04, drive: 3, glide: 0.04, gain: 0.42, lfoDepth: 0.8, lfoSync: 32 }, range: [48, 64], rhythm: ['x.xxx.x.xx.x.xx.', 'xx.x.xx.x.xx.x.x', 'x.x.x.x.x.x.xxx.'] },
  texture: 'dark', mix: { lufs: -7, verb: 0.18, delay: 0.12, sc: 0.45 } },

{ id: 'dub-techno', name: 'Dub Techno', family: 'techno', bpm: [118, 124], swing: 52, modes: ['minor', 'dorian'], form: 'techno',
  kit: { kick: { len: 0.6, fEnd: 49, fStart: 160, pDec: 0.0273, punch: 0.2, aDec: 0.3, hold: 0.012, click: 0.1, clickF: 2500, drive: 1.2, lp: 4000 },
    snare: { kind: 'rim', rimF: 1500, gain: 0.8 }, hats: { base: 400, noise: 0.55, cDec: 0.03, oDec: 0.22, bpF: 8500, hpF: 6500, shakF: 7000, shakDec: 0.05 } },
  drums: { main: [
      { k: 'X...X...X...X...', s: '....g.......g...', ho: '..g...g...g...g.', sh: 'g.g.g.g.g.g.g.g.' },
      { k: 'X...X...X...X...', ho: '..g...g...g...g.', hc: '.g.g.g.g.g.g.g.g', s: '.......g......g.' }],
    fill: ['..............gg'] },
  bass: { kit: { model: 'sub', drive: 1.3, sub: 0.3, aAtk: 0.01, aDec: 0.4, aSus: 0.8, aRel: 0.1, gain: 1 }, oct: 36, gate: 0.85,
    pats: [{ n: '..R...R...R...R.' }, { n: '..R..R....R...R.' }] },
  harm: { progs: [['i9'], ['i9', 'i9', 'iv9', 'iv9'], ['i7', 'bVIImaj7']], hr: 4, ext: '9' },
  chords: { role: 'stab', kit: { model: 'stab', cut: 750, res: 0.25, envAmt: 1.6, fDec: 0.25, aAtk: 0.003, aDec: 0.35, aSus: 0.1, aRel: 0.6, gain: 0.55 }, range: [53, 70], rhythm: ['..x.............', '......x.........', '..x.......x.....'], len: 1 },
  pad: { kit: { model: 'pad', detune: 0.5, cut: 900, aAtk: 2, aDec: 1, aSus: 0.9, aRel: 2.5, width: 1, gain: 0.22 }, range: [48, 67] },
  texture: 'vinyl', mix: { lufs: -10, verb: 0.4, delay: 0.5, sc: 0.25 } },

{ id: 'acid', name: 'Acid Techno', family: 'techno', bpm: [128, 134], swing: 52, modes: ['minor', 'phrygian'], form: 'techno',
  kit: { kick: Object.assign({}, K909, { len: 0.45 }), snare: { kind: 'clap', clapF: 1300, clapQ: 1.3, clapGap: 0.008, clapTail: 0.15, claps: 3 }, hats: HAT909 },
  drums: { main: [
      { k: 'X...X...X...X...', s: '....x.......x...', ho: '..x...x...x...x.', hc: 'xgxgxgxgxgxgxgxg' },
      { k: 'X...X...X...X...', ho: '..x...x...x...x.', hc: 'xxxgxxxgxxxgxxxg', s: '....x.......x...', p: [['cowbell', 0, '..x.....x.x.....']] }],
    fill: ['............xxxx'] },
  bass: { kit: { model: 'sub', drive: 1.5, aAtk: 0.003, aDec: 0.2, aSus: 0.6, aRel: 0.05, gain: 1 }, oct: 36, gate: 0.6,
    pats: [{ n: '..R...R...R...R.' }, { n: '..R..R....R..R..' }] },
  harm: { progs: [['i'], ['i', 'bVII'], ['i', 'iv']], hr: 4, ext: 'triad' },
  chords: { role: 'none' },
  lead: { role: 'seq', kit: { model: 'acid', wave: 0, cut: 380, res: 0.78, envAmt: 3.6, fDec: 0.16, aAtk: 0.001, aDec: 0.2, aSus: 0.45, aRel: 0.04, drive: 2, glide: 0.05, gain: 0.55, lfoDepth: 0.9, lfoSync: 64 }, range: [40, 58], rhythm: ['xxxxxxxxxxxxxxxx', 'x.xxx.xxx.xxxx.x', 'xx.xxx.xx.xxx.xx'] },
  texture: 'none', mix: { lufs: -7.5, verb: 0.2, delay: 0.2, sc: 0.3 } },

{ id: 'big-room', name: 'Big Room', family: 'house', bpm: [126, 128], swing: 50, modes: ['minor', 'harmonic'], form: 'club',
  kit: { kick: { len: 0.6, fEnd: 52, fStart: 260, pDec: 0.018, punch: 0.6, aDec: 0.42, hold: 0.015, click: 0.5, clickF: 4000, drive: 2.6, lp: 7500, sub: 0.3 },
    snare: { kind: 'clap', clapF: 1250, clapQ: 1, clapGap: 0.008, clapTail: 0.22, claps: 4 }, hats: HAT909 },
  drums: { main: [
      { k: 'X...X...X...X...', s: '....X.......X...', ho: '..x...x...x...x.', hc: 'g.g.g.g.g.g.g.g.' },
      { k: 'X...X...X...X...', s: '....X.......X...', ho: '..x...x...x...x.', ride: 'x.x.x.x.x.x.x.x.' }],
    fill: ['........x.x.xxxx', '............XXXX'] },
  bass: { kit: { model: 'sub', drive: 2.2, aAtk: 0.003, aDec: 0.15, aSus: 0.7, aRel: 0.04, gain: 1 }, oct: 36, gate: 0.7,
    pats: [{ n: '..R...R...R...R.' }, { n: '..R...R...O...R.' }] },
  harm: { progs: [['i', 'bVI', 'bVII', 'i'], ['i', 'v', 'bVI', 'bVII'], ['i', 'bIII', 'bVII', 'bVI']], hr: 2, ext: 'triad', breakHr: 2 },
  chords: { role: 'pad', kit: { model: 'supersaw', detune: 0.45, cut: 3500, aAtk: 0.4, aDec: 1, aSus: 0.9, aRel: 1, width: 1, gain: 0.3 }, range: [55, 76] },
  lead: { role: 'hook', kit: { model: 'square', pw: 0.42, voices: 2, detune: 0.6, cut: 3800, res: 0.15, envAmt: 1.4, fDec: 0.12, aAtk: 0.002, aDec: 0.12, aSus: 0.55, aRel: 0.06, gain: 0.4 }, range: [64, 84], rhythm: ['x.x...x.x.x.x...', 'x..x..x.x.......', 'x.xx..x...x.x...'] },
  texture: 'none', mix: { lufs: -7, verb: 0.26, delay: 0.16, sc: 0.6 } },

{ id: 'hardstyle', name: 'Hardstyle', family: 'hard', bpm: [148, 152], swing: 50, modes: ['minor', 'harmonic'], form: 'hard',
  kit: { kick: { len: 0.85, fEnd: 55, fStart: 420, pDec: 0.02, punch: 0.8, aDec: 0.42, hold: 0.02, click: 0.7, clickF: 4200, drive: 5, lp: 9000, tail: 1, tailDrive: 4, sub: 0.3 },
    snare: { kind: 'clap', clapF: 1400, clapQ: 1.3, clapGap: 0.007, clapTail: 0.2, claps: 3 }, hats: { base: 470, noise: 0.3, cDec: 0.025, oDec: 0.16, bpF: 11500, hpF: 8500 } },
  drums: { main: [
      { k: 'X...X...X...X...', s: '....x.......x...', ho: '..x...x...x...x.', hc: 'g.g.g.g.g.g.g.g.' },
      { k: 'X...X...X...X...', s: '....x.......x...', ho: '..x...x...x...x.', hc: 'gxgxgxgxgxgxgxgx' }],
    fill: ['........X.X.XXXX', '............XXXX'] },
  bass: { kit: { model: 'saw', cut: 260, res: 0.3, envAmt: 0.8, fDec: 0.1, aAtk: 0.07, aDec: 0.1, aSus: 1, aRel: 0.015, drive: 2.5, sub: 0.6, gain: 0.9 }, oct: 36, gate: 0.95, lo: 31,
    pats: [{ n: '..R-..R-..R-..R-' }, { n: '..R-..R-..R-..O-' }] },
  harm: { progs: [['i', 'bVI', 'bIII', 'bVII'], ['i', 'v', 'bVI', 'iv'], ['i', 'bVII', 'bVI', 'v']], hr: 2, ext: 'triad' },
  chords: { role: 'pad', kit: { model: 'supersaw', detune: 0.5, cut: 4200, aAtk: 0.3, aDec: 1, aSus: 0.9, aRel: 1, width: 1, gain: 0.3 }, range: [55, 76] },
  lead: { role: 'hook', kit: { model: 'supersaw', detune: 0.38, cut: 7000, res: 0.1, aAtk: 0.004, aDec: 0.3, aSus: 0.75, aRel: 0.2, width: 0.9, gain: 0.34 }, range: [67, 88], rhythm: ['x..x..x.x.x.x...', 'x.x.x..x..x.x...', 'x..x..x...x.xx..'] },
  texture: 'none', mix: { lufs: -6.5, verb: 0.28, delay: 0.18, sc: 0.3 } },

{ id: 'future-bass', name: 'Future Bass', family: 'pop', bpm: [140, 160], swing: 50, modes: ['major', 'lydian', 'minor'], form: 'pop',
  kit: { kick: { len: 0.45, fEnd: 52, fStart: 230, pDec: 0.0139, punch: 0.5, aDec: 0.22, hold: 0.01, click: 0.5, clickF: 4000, drive: 2, lp: 9000 },
    snare: { kind: 'snare', tone: 220, tone2: 360, toneDec: 0.06, toneAmt: 0.4, nDec: 0.18, nHp: 1800, nLp: 11000, snap: 1 }, hats: { base: 500, noise: 0.3, cDec: 0.022, oDec: 0.14, bpF: 12000, hpF: 9000 } },
  drums: { main: [
      { k: 'X.........X.....', s: '........X.......', hc: 'x.x.x.x.x.xrx.x.' },
      { k: 'X.....x...X.....', s: '........X.......', hc: 'x.x.x.xrx.x.x.zx', p: [['clave', 0, '...x......x.....']] }],
    fill: ['..........x.xxXX', '............rqzq'] },
  bass: { kit: { model: 'sub', drive: 1.6, aAtk: 0.004, aDec: 0.4, aSus: 0.8, aRel: 0.08, glide: 0.06, gain: 1 }, oct: 36, gate: 1,
    pats: [{ n: 'R-----R---R-----' }, { n: 'R---------R---R-' }] },
  harm: { progs: [['IVmaj7', 'V', 'iii7', 'vi7'], ['Imaj7', 'V', 'vi7', 'IVmaj7'], ['vi7', 'IVmaj7', 'Imaj7', 'V']], hr: 1, ext: '9' },
  chords: { role: 'gate', kit: { model: 'supersaw', detune: 0.5, cut: 6000, res: 0.1, aAtk: 0.004, aDec: 0.2, aSus: 0.75, aRel: 0.08, width: 1, gain: 0.32 }, range: [57, 81], gate: ['x.x.xx.x..x.x.x.', 'xx.xx.x.x.xx.x..', 'x..x..x...x..x..'] },
  lead: { role: 'chop', kit: { model: 'vox', aAtk: 0.004, aDec: 0.14, aSus: 0.3, aRel: 0.08, gain: 0.55 }, range: [67, 84], rhythm: ['x.x.x.....x.x...', '..x.x.x...x.....', 'x..x..x.x.......'] },
  texture: 'air', mix: { lufs: -7.5, verb: 0.24, delay: 0.2, sc: 0.7 } },

{ id: 'breakbeat', name: 'Breakbeat', family: 'breaks', bpm: [130, 136], swing: 52, modes: ['minor', 'dorian'], form: 'club',
  kit: { kick: { len: 0.45, fEnd: 53, fStart: 230, pDec: 0.0158, punch: 0.45, aDec: 0.2, hold: 0.01, click: 0.5, clickF: 3800, drive: 2, lp: 9000, sub: 0.3 },
    snare: { kind: 'snare', tone: 200, tone2: 330, toneDec: 0.08, toneAmt: 0.5, nDec: 0.16, nHp: 1500, nLp: 9000, snap: 0.8 }, hats: HAT909 },
  drums: { main: [
      { k: 'X.........X.....', s: '....X..g.g..X...', hc: 'x.x.x.x.x.x.x.x.', ho: '..............x.' },
      { k: 'X.X.......X..x..', s: '....X.......X..g', hc: 'xgxgxgxgxgxgxgxg' }],
    fill: ['..........x.xxXX', '............XxXx'] },
  bass: { kit: { model: 'reese', detune: 0.8, cut: 600, res: 0.25, aAtk: 0.008, aDec: 0.4, aSus: 0.85, aRel: 0.1, sub: 0.8, drive: 1.6, lfoRate: 0.4, lfoDepth: 0.3, gain: 0.9 }, oct: 36, gate: 0.9,
    pats: [{ n: 'R.....R...R..R..' }, { n: 'R-----R-F---R---' }] },
  harm: { progs: [['i', 'bVII'], ['i', 'bVI', 'bVII', 'i'], ['i7', 'iv7']], hr: 2, ext: '7' },
  chords: { role: 'stab', kit: { model: 'stab', cut: 1200, res: 0.3, envAmt: 2, fDec: 0.15, aAtk: 0.002, aDec: 0.2, aSus: 0, aRel: 0.15, gain: 0.45 }, range: [55, 70], rhythm: ['...x..x.........', '...x.......x....'], len: 1, sparse: 0.5 },
  lead: { role: 'seq', kit: { model: 'acid', wave: 0, cut: 450, res: 0.7, envAmt: 3.2, fDec: 0.14, aAtk: 0.001, aDec: 0.18, aSus: 0.4, aRel: 0.04, drive: 1.6, glide: 0.05, gain: 0.45, lfoDepth: 0.6, lfoSync: 32 }, range: [50, 66], rhythm: ['x.xx.x.xx.x.xx.x', 'xx.x.xx..xx.x.x.'] },
  texture: 'none', mix: { lufs: -8, verb: 0.2, delay: 0.18, sc: 0.3, bassDuck: 0.8 } },

{ id: 'jungle', name: 'Jungle', family: 'dnb', bpm: [160, 170], swing: 50, modes: ['minor', 'dorian'], form: 'dnb',
  kit: { kick: { len: 0.4, fEnd: 56, fStart: 240, pDec: 0.0116, punch: 0.45, aDec: 0.16, hold: 0.008, click: 0.5, clickF: 3800, drive: 1.6, lp: 8000, sub: 0.3 },
    snare: { kind: 'snare', tone: 230, tone2: 380, toneDec: 0.06, toneAmt: 0.45, nDec: 0.13, nHp: 1300, nLp: 8000, snap: 0.9 }, hats: { base: 460, noise: 0.45, cDec: 0.025, oDec: 0.18, bpF: 10000, hpF: 7500, rideF: 620 } },
  drums: { main: [
      { k: 'X.X.......XX....', s: '....X..x.x....x.', ride: 'x.x.x.x.x.x.x.x.' },
      { k: 'X.X.......X.....', s: '....X..x.x..X..x', hc: 'xgxgxgxgxgxgxgxg' },
      { k: 'X.........X.x...', s: '....X..g.x..X.xx', ride: 'x.x.x.x.x.x.x.x.' }],
    fill: ['........x.xxxXxX', '..........XxXxXX'] },
  bass: { kit: { model: 'sub', drive: 1.4, aAtk: 0.006, aDec: 0.5, aSus: 0.9, aRel: 0.1, glide: 0.05, gain: 1 }, oct: 36, gate: 1,
    pats: [{ n: 'R-------R---F---' }, { n: 'R-----R-----O---' }, { n: 'R---------R-r---' }] },
  harm: { progs: [['i', 'bVI'], ['i9', 'iv9'], ['i', 'bVII', 'bVI', 'bVII']], hr: 2, ext: '9' },
  chords: { role: 'pad', kit: { model: 'pad', detune: 0.6, cut: 1300, aAtk: 0.6, aDec: 1, aSus: 0.9, aRel: 1.4, width: 1, gain: 0.3 }, range: [52, 72] },
  lead: { role: 'hook', kit: { model: 'stab', cut: 1800, res: 0.2, envAmt: 1.5, fDec: 0.2, aAtk: 0.002, aDec: 0.3, aSus: 0.2, aRel: 0.3, gain: 0.35 }, range: [64, 81], rhythm: ['x.....x...x.....', '..x.....x...x...'] },
  texture: 'dark', mix: { lufs: -8.5, verb: 0.26, delay: 0.2, sc: 0.3 } },

{ id: 'reggaeton', name: 'Reggaeton', family: 'latin', bpm: [90, 96], swing: 50, modes: ['minor', 'phrygian', 'harmonic'], form: 'pop',
  kit: { kick: { len: 0.45, fEnd: 50, fStart: 200, pDec: 0.021, punch: 0.4, aDec: 0.26, hold: 0.012, click: 0.4, clickF: 3500, drive: 2, lp: 7000 },
    snare: { kind: 'snare', tone: 240, tone2: 400, toneDec: 0.05, toneAmt: 0.45, nDec: 0.09, nHp: 2000, nLp: 10000, snap: 1 }, hats: { base: 470, noise: 0.35, cDec: 0.025, oDec: 0.15, bpF: 11000, hpF: 8500 } },
  drums: { main: [
      { k: 'X...X...X...X...', s: '...X..X....X..X.', hc: 'x.x.x.x.x.x.x.x.' },
      { k: 'X...X...X...X...', s: '...X..X....X..X.', hc: 'x.xgx.xgx.xgx.xg', p: [['timbale', 0, '..............xx']] }],
    fill: ['...X..X...XXXXXX', '...X..X....XxXxX'] },
  bass: { kit: { model: 'b808', drive: 2, aAtk: 0.002, aDec: 0.5, aSus: 0.7, aRel: 0.1, glide: 0.05, gain: 0.95 }, oct: 36, gate: 0.9,
    pats: [{ n: 'R..R..R.R..R..R.' }, { n: 'R..R..R.R..R..O.' }] },
  harm: { progs: [['i', 'bVI', 'bIII', 'bVII'], ['i', 'bVII', 'bVI', 'bVII'], ['i', 'iv', 'bVII', 'bIII']], hr: 1, ext: 'triad' },
  chords: { role: 'stab', kit: { model: 'kspluck', bright: 0.6, aAtk: 0.001, aDec: 0.5, aSus: 0.2, aRel: 0.2, gain: 0.55 }, range: [57, 76], rhythm: ['...x..x....x..x.', '...x..x...x..x..'], len: 2 },
  pad: { kit: { model: 'pad', detune: 0.4, cut: 1800, aAtk: 0.4, aDec: 1, aSus: 0.8, aRel: 0.8, width: 0.9, gain: 0.22 }, range: [55, 72] },
  lead: { role: 'hook', kit: { model: 'lead', voices: 2, detune: 0.3, cut: 3200, res: 0.15, envAmt: 0.8, fDec: 0.2, aAtk: 0.004, aDec: 0.2, aSus: 0.6, aRel: 0.12, gain: 0.36 }, range: [64, 81], rhythm: ['x..x..x.x.......', '..x.x..x..x.....', 'x.x...x...x.x...'] },
  texture: 'none', mix: { lufs: -8, verb: 0.2, delay: 0.16, sc: 0.2 } },

{ id: 'moombahton', name: 'Moombahton', family: 'latin', bpm: [108, 112], swing: 50, modes: ['minor', 'phrygian'], form: 'bass',
  kit: { kick: { len: 0.5, fEnd: 52, fStart: 230, pDec: 0.0158, punch: 0.5, aDec: 0.26, hold: 0.012, click: 0.5, clickF: 3800, drive: 2.4, lp: 8000 },
    snare: { kind: 'clap', clapF: 1300, clapQ: 1.2, clapGap: 0.008, clapTail: 0.16, claps: 3 }, hats: { base: 460, noise: 0.35, cDec: 0.025, oDec: 0.16, bpF: 11000, hpF: 8200 } },
  drums: { main: [
      { k: 'X...X...X...X...', s: '....X.......X...', rim: '...x..x....x..x.', hc: 'x.x.x.x.x.x.x.x.' },
      { k: 'X...X...X...X...', s: '....X.......X...', rim: '...x..x....x..x.', hc: 'xgx.xgx.xgx.xgx.', p: [['timbale', 0, '...........x..xx'], ['tom', 47, '......x.......x.']] }],
    fill: ['..........x.xxXX'] },
  bass: { kit: { model: 'square', pw: 0.5, cut: 700, res: 0.25, envAmt: 1.2, fDec: 0.12, aAtk: 0.003, aDec: 0.25, aSus: 0.7, aRel: 0.06, sub: 0.6, drive: 2.2, gain: 0.85 }, oct: 36, gate: 0.85,
    pats: [{ n: 'R..R..R.R..R..R.' }, { n: 'R..R..R...R.R.O.' }] },
  harm: { progs: [['i', 'bVI', 'bVII', 'i'], ['i', 'iv', 'v', 'i'], ['i', 'bII']], hr: 2, ext: 'triad' },
  chords: { role: 'stab', kit: { model: 'stab', cut: 1600, res: 0.25, envAmt: 2, fDec: 0.12, aAtk: 0.002, aDec: 0.18, aSus: 0, aRel: 0.12, gain: 0.45 }, range: [55, 72], rhythm: ['...x..x....x..x.', '...x..x...x.....'], len: 1 },
  lead: { role: 'hook', kit: { model: 'square', pw: 0.35, voices: 2, detune: 0.5, cut: 3000, res: 0.2, envAmt: 1.2, fDec: 0.1, aAtk: 0.002, aDec: 0.15, aSus: 0.5, aRel: 0.08, gain: 0.38 }, range: [62, 81], rhythm: ['x..x..x.x.......', 'x.x...x.x..x....'] },
  texture: 'none', mix: { lufs: -7.5, verb: 0.2, delay: 0.15, sc: 0.4 } },

{ id: 'amapiano', name: 'Amapiano', family: 'afro', bpm: [110, 115], swing: 56, modes: ['dorian', 'minor', 'major'], form: 'deep',
  kit: { kick: { len: 0.6, fEnd: 50, fStart: 150, pDec: 0.04, punch: 0.2, aDec: 0.32, hold: 0.012, click: 0.1, clickF: 2500, drive: 1.2, lp: 4000, gain: 0.85, sub: 0.3 },
    snare: { kind: 'rim', rimF: 1750, gain: 1 }, hats: { base: 420, noise: 0.55, cDec: 0.025, oDec: 0.16, bpF: 9500, hpF: 7000, shakF: 8200, shakDec: 0.055 } },
  drums: { main: [
      { k: 'X...X...X...X...', s: '....X.......X...', sh: 'xgxgxgxgxgxgxgxg', p: [['wood', 0, '..x...x..x...x..'], ['conga', 0, '...x..x....x..x.']] },
      { k: 'X.......X..x....', s: '....X.......X...', sh: 'xgxgxgxgxgxgxgxg', ho: '..g.......g.....', p: [['wood', 0, '..x..x..x..x..x.'], ['tamb', 0, '....x.......x...']] }],
    fill: ['..........x.x.xx'] },
  bass: { kit: { model: 'log', drive: 2.2, aAtk: 0.001, aDec: 0.35, aSus: 0.25, aRel: 0.12, glide: 0.07, cut: 1400, gain: 1 }, oct: 36, gate: 0.9, lo: 33,
    pats: [{ n: '..R..R.R..r...O.' }, { n: 'R..R..R...R.o.R.' }, { n: '...R..R.R...R.r.' }] },
  harm: { progs: [['ii9', 'V9', 'Imaj9', 'vi9'], ['i9', 'iv9'], ['Imaj7', 'vi7', 'ii7', 'V7'], ['i7', 'bVIImaj7', 'bVImaj7', 'v7']], hr: 2, ext: '9' },
  chords: { role: 'stab', kit: { model: 'ep', aAtk: 0.002, aDec: 1.2, aSus: 0.3, aRel: 0.5, gain: 0.7 }, range: [55, 77], rhythm: ['..x...x...x.....', '..x...x......x..', '...x......x..x..'], len: 3 },
  pad: { kit: { model: 'strings', detune: 0.5, cut: 2400, aAtk: 0.8, aDec: 1, aSus: 0.85, aRel: 1.2, width: 1, gain: 0.2 }, range: [57, 76] },
  lead: { role: 'chop', kit: { model: 'vox', aAtk: 0.006, aDec: 0.22, aSus: 0.4, aRel: 0.15, gain: 0.5 }, range: [64, 79], rhythm: ['x.....x.x.......', '..x.x.....x.....'] },
  texture: 'air', mix: { lufs: -9, verb: 0.26, delay: 0.2, sc: 0.25 } },

{ id: 'synthwave', name: 'Synthwave', family: 'pop', bpm: [96, 110], swing: 50, modes: ['minor', 'dorian'], form: 'pop',
  kit: { kick: { len: 0.5, fEnd: 52, fStart: 180, pDec: 0.0239, punch: 0.35, aDec: 0.26, hold: 0.012, click: 0.3, clickF: 3000, drive: 1.6, lp: 6000, sub: 0.3 },
    snare: { kind: 'snare', tone: 180, tone2: 300, toneDec: 0.1, toneAmt: 0.4, nDec: 0.28, nHp: 900, nLp: 7000, snap: 0.8 }, hats: { base: 430, noise: 0.45, cDec: 0.03, oDec: 0.2, bpF: 10000, hpF: 7500 } },
  drums: { main: [
      { k: 'X.......X.......', s: '....X.......X...', hc: 'x.x.x.x.x.x.x.x.' },
      { k: 'X...X...X...X...', s: '....X.......X...', hc: 'xxxxxxxxxxxxxxxx', ho: '..............x.' }],
    fill: ['............xxxx', '........x.x.x.xx'] },
  bass: { kit: { model: 'pluck', cut: 500, res: 0.25, envAmt: 2, fDec: 0.1, aAtk: 0.002, aDec: 0.15, aSus: 0.3, aRel: 0.05, sub: 0.4, drive: 1.3, gain: 0.95 }, oct: 36, gate: 0.7, lo: 33,
    pats: [{ n: 'R.R.R.R.R.R.R.R.' }, { n: 'RRRRRRRRRRRRRRRR' }, { n: 'R.ROR.ROR.ROR.RO' }] },
  harm: { progs: [['i', 'bVI', 'bIII', 'bVII'], ['i', 'bVII', 'bVI', 'bVII'], ['i', 'iv', 'bVI', 'v']], hr: 2, ext: 'triad' },
  chords: { role: 'pad', kit: { model: 'brass', cut: 2200, res: 0.15, aAtk: 0.08, aDec: 1, aSus: 0.85, aRel: 0.6, gain: 0.35 }, range: [55, 74] },
  pad: { kit: { model: 'pad', detune: 0.6, cut: 2000, aAtk: 0.9, aDec: 1, aSus: 0.9, aRel: 1.6, width: 1, gain: 0.26 }, range: [52, 72] },
  lead: { role: 'hook', kit: { model: 'square', pw: 0.5, voices: 2, detune: 0.25, cut: 3600, res: 0.15, envAmt: 0.6, fDec: 0.3, aAtk: 0.006, aDec: 0.3, aSus: 0.75, aRel: 0.25, lfoRate: 5, lfoDepth: 0.05, gain: 0.34 }, range: [64, 84], rhythm: ['x..x..x.x.......', 'x.....x...x.x...', 'x..x..x...x.....'] },
  arp: { kit: { model: 'pluck', cut: 1100, res: 0.2, envAmt: 2.6, fDec: 0.09, aAtk: 0.001, aDec: 0.15, aSus: 0, aRel: 0.12, gain: 0.3 }, range: [60, 84], arp: { pat: [0, 1, 2, 3, 2, 1, 2, 3], rate: 1, oct: 2 } },
  texture: 'none', mix: { lufs: -9, verb: 0.3, delay: 0.22, sc: 0.15 } },

{ id: 'lofi', name: 'Lo-fi Hip Hop', family: 'chill', bpm: [74, 88], swing: 62, modes: ['dorian', 'minor', 'major'], form: 'chill',
  kit: { kick: { len: 0.5, fEnd: 52, fStart: 150, pDec: 0.04, punch: 0.2, aDec: 0.24, hold: 0.012, click: 0.15, clickF: 2200, drive: 1.3, lp: 2800, sub: 0.3 },
    snare: { kind: 'snare', tone: 200, tone2: 320, toneDec: 0.07, toneAmt: 0.5, nDec: 0.12, nHp: 900, nLp: 5000, snap: 0.3 }, hats: { base: 400, noise: 0.5, cDec: 0.03, oDec: 0.15, bpF: 7500, hpF: 5500 } },
  drums: { main: [
      { k: 'X......x..X.....', s: '....X.......X...', hc: 'x.xgx.x.x.xgx.x.' },
      { k: 'X.........X..x..', s: '....X.......X..g', hc: 'x.x.x.xgx.x.x.x.', p: [['rim', 0, '.......g........']] }],
    fill: ['............x.gx'] },
  bass: { kit: { model: 'sub', drive: 1.5, sub: 0.4, aAtk: 0.006, aDec: 0.4, aSus: 0.6, aRel: 0.08, glide: 0.04, gain: 1 }, oct: 36, gate: 0.85, lo: 33,
    pats: [{ n: 'R.....R...R..A..' }, { n: 'R.......R.F.....' }, { n: 'R..R......R...P.' }] },
  harm: { progs: [['ii9', 'V9', 'Imaj9', 'Imaj9'], ['i9', 'iv9'], ['IVmaj9', 'iii7', 'ii9', 'Imaj9'], ['vi9', 'ii9', 'V9', 'Imaj9']], hr: 1, ext: '9' },
  chords: { role: 'pad', kit: { model: 'ep', aAtk: 0.004, aDec: 2, aSus: 0.4, aRel: 0.5, gain: 0.75 }, range: [55, 77] },
  lead: { role: 'hook', kit: { model: 'kspluck', bright: 0.4, aAtk: 0.001, aDec: 0.5, aSus: 0.3, aRel: 0.3, gain: 0.5 }, range: [64, 81], rhythm: ['x.....x...x.....', '..x...x.x.......', 'x...x.....x.x...'] },
  texture: 'vinyl', mix: { lufs: -12, verb: 0.24, delay: 0.16, sc: 0.1 } },

{ id: 'downtempo', name: 'Downtempo', family: 'chill', bpm: [92, 104], swing: 54, modes: ['minor', 'dorian'], form: 'chill',
  kit: { kick: { len: 0.55, fEnd: 51, fStart: 170, pDec: 0.035, punch: 0.25, aDec: 0.26, hold: 0.012, click: 0.2, clickF: 2800, drive: 1.4, lp: 5000, sub: 0.3 },
    snare: { kind: 'clap', clapF: 1150, clapQ: 0.9, clapGap: 0.011, clapTail: 0.22, claps: 3 }, hats: { base: 420, noise: 0.5, cDec: 0.03, oDec: 0.2, bpF: 9000, hpF: 6800, shakF: 7500, shakDec: 0.06 } },
  drums: { main: [
      { k: 'X.......X..x....', s: '....X.......X...', sh: 'x.g.x.gox.g.x.go' },
      { k: 'X.....x.X.......', s: '....X.......X...', sh: 'xgxgxgxgxgxgxgxg', p: [['bongo', 0, '..........g..g..']] }],
    fill: ['............g.xx'] },
  bass: { kit: { model: 'sub', drive: 1.5, sub: 0.4, aAtk: 0.008, aDec: 0.5, aSus: 0.8, aRel: 0.1, glide: 0.05, gain: 1 }, oct: 36, gate: 1,
    pats: [{ n: 'R-----R---R-----' }, { n: 'R-------R---F---' }] },
  harm: { progs: [['i9', 'bVImaj7'], ['i7', 'iv7', 'bVII', 'bIIImaj7'], ['i9', 'v7']], hr: 2, ext: '9' },
  chords: { role: 'pad', kit: { model: 'pad', detune: 0.5, cut: 1600, aAtk: 0.6, aDec: 1, aSus: 0.85, aRel: 1.2, width: 1, gain: 0.32 }, range: [52, 72] },
  lead: { role: 'arp', kit: { model: 'kspluck', bright: 0.5, aAtk: 0.001, aDec: 0.6, aSus: 0.2, aRel: 0.3, gain: 0.45 }, range: [60, 84], arp: { pat: [0, 2, 1, 3], rate: 2, oct: 2 } },
  hook: { kit: { model: 'bell', ratio: 3, index: 1.6, aAtk: 0.002, aDec: 0.8, aSus: 0.1, aRel: 0.5, gain: 0.28 }, range: [69, 86], rhythm: ['x.......x.......', '....x.......x...'] },
  texture: 'air', mix: { lufs: -10.5, verb: 0.3, delay: 0.24, sc: 0.15 } },

{ id: 'ambient', name: 'Ambient', family: 'ambient', bpm: [66, 76], swing: 50, modes: ['lydian', 'major', 'dorian', 'minor'], form: 'ambient',
  kit: { kick: { len: 0.6, fEnd: 50, fStart: 120, pDec: 0.05, punch: 0, aDec: 0.4, hold: 0.01, click: 0, clickF: 2000, drive: 1, lp: 2500 }, snare: CLAP909, hats: { base: 400, noise: 0.6, cDec: 0.03, oDec: 0.3, bpF: 8000, hpF: 6000, shakF: 7000, shakDec: 0.08 } },
  drums: { main: [{ p: [['tamb', 0, '........g.......']] }], fill: null },
  bass: { kit: { model: 'sub', drive: 1.1, aAtk: 1.2, aDec: 1, aSus: 0.9, aRel: 2, gain: 0.8 }, oct: 36, gate: 1,
    pats: [{ n: 'R---------------' }] },
  harm: { progs: [['Imaj7', 'IVmaj7'], ['i9', 'bVImaj7', 'bIIImaj7', 'bVII'], ['Imaj9', 'iii7', 'vi9', 'IVmaj7']], hr: 4, ext: '9' },
  chords: { role: 'pad', kit: { model: 'strings', detune: 0.5, cut: 2600, aAtk: 2.5, aDec: 1, aSus: 0.9, aRel: 3, width: 1, gain: 0.3 }, range: [52, 76] },
  pad: { kit: { model: 'pad', detune: 0.7, cut: 1200, aAtk: 3, aDec: 1, aSus: 0.9, aRel: 4, width: 1, gain: 0.3 }, range: [45, 67] },
  lead: { role: 'hook', kit: { model: 'bell', ratio: 3, index: 1.4, aAtk: 0.004, aDec: 1.6, aSus: 0.1, aRel: 1.4, gain: 0.3 }, range: [67, 88], rhythm: ['x.......x.......', '....x.........x.', 'x...........x...'] },
  texture: 'air', mix: { lufs: -16, verb: 0.5, delay: 0.32, sc: 0 } },

{ id: 'nu-disco', name: 'Nu-Disco', family: 'house', bpm: [115, 122], swing: 54, modes: ['dorian', 'minor', 'major'], form: 'club',
  kit: { kick: { len: 0.45, fEnd: 52, fStart: 190, pDec: 0.0163, punch: 0.35, aDec: 0.24, hold: 0.01, click: 0.35, clickF: 3200, drive: 1.6, lp: 7000, sub: 0.3 },
    snare: { kind: 'clap', clapF: 1250, clapQ: 1, clapGap: 0.01, clapTail: 0.2, claps: 3 }, hats: { base: 430, noise: 0.5, cDec: 0.03, oDec: 0.26, bpF: 10000, hpF: 7200, shakF: 8000 } },
  drums: { main: [
      { k: 'X...X...X...X...', s: '....X.......X...', ho: '..x...x...x...x.', hc: 'xgxgxgxgxgxgxgxg', p: [['tamb', 0, '....x.......x...']] },
      { k: 'X...X...X...X...', s: '....X.......X...', ho: '..x...x...x...x.', sh: 'xgogxgogxgogxgog', p: [['conga', 0, '..x..x....x..x..'], ['tamb', 0, '....x.......x...']] }],
    fill: ['............x.xx', '..........xx.xXX'] },
  bass: { kit: { model: 'pluck', cut: 480, res: 0.3, envAmt: 2.2, fDec: 0.1, aAtk: 0.002, aDec: 0.18, aSus: 0.35, aRel: 0.05, sub: 0.4, drive: 1.4, gain: 1 }, oct: 36, gate: 0.6, lo: 31,
    pats: [{ n: 'R.O.R.O.R.O.R.O.' }, { n: 'R.ORR.O.R.OR..O.' }, { n: '..R.O..R.OR..O.R' }] },
  harm: { progs: [['i7', 'iv7'], ['i7', 'bVIImaj7', 'bVImaj7', 'v7'], ['IVmaj7', 'iii7', 'ii7', 'Imaj7']], hr: 2, ext: '7' },
  chords: { role: 'stab', kit: { model: 'strings', detune: 0.4, cut: 4000, aAtk: 0.004, aDec: 0.3, aSus: 0.2, aRel: 0.15, width: 1, gain: 0.45 }, range: [57, 76], rhythm: ['..x...x...x...x.', '...x..x...x.....', '..x..x....x..x..'], len: 1 },
  pad: { kit: { model: 'strings', detune: 0.5, cut: 3000, aAtk: 0.6, aDec: 1, aSus: 0.9, aRel: 1, width: 1, gain: 0.24 }, range: [55, 74] },
  lead: { role: 'hook', kit: { model: 'brass', cut: 3000, res: 0.15, aAtk: 0.02, aDec: 0.3, aSus: 0.7, aRel: 0.15, gain: 0.36 }, range: [64, 81], rhythm: ['x..x..x.x.......', '..x.x...x.x.....'] },
  texture: 'none', mix: { lufs: -8.5, verb: 0.22, delay: 0.18, sc: 0.3 } },

{ id: 'electro', name: 'Electro', family: 'breaks', bpm: [126, 132], swing: 50, modes: ['minor', 'phrygian'], form: 'techno',
  kit: { kick: { len: 0.7, fEnd: 48, fStart: 150, pDec: 0.0341, punch: 0.3, aDec: 0.38, hold: 0.012, click: 0.2, clickF: 2800, drive: 1.4, lp: 5000, sub: 0.3 },
    snare: { kind: 'clap', clapF: 1100, clapQ: 1, clapGap: 0.008, clapTail: 0.16, claps: 3 }, hats: { base: 420, noise: 0.3, cDec: 0.02, oDec: 0.15, bpF: 10000, hpF: 7500 } },
  drums: { main: [
      { k: 'X.....X...X.....', s: '....X.......X...', hc: 'XxgxXxgxXxgxXxgx', p: [['cowbell', 0, '..x.....x.x.....']] },
      { k: 'X.....X..XX.....', s: '....X.......X...', hc: 'xxxxxxxxxxxxxxxx', p: [['clave', 0, '...x..x....x....']] }],
    fill: ['..........xxXXXX'] },
  bass: { kit: { model: 'square', pw: 0.5, cut: 600, res: 0.3, envAmt: 1.8, fDec: 0.1, aAtk: 0.002, aDec: 0.2, aSus: 0.5, aRel: 0.05, sub: 0.6, drive: 1.8, gain: 0.85 }, oct: 36, gate: 0.7,
    pats: [{ n: 'R.....R...R...R.' }, { n: 'R..R..R...R.O...' }] },
  harm: { progs: [['i'], ['i', 'bVI'], ['i', 'bII']], hr: 4, ext: 'triad' },
  chords: { role: 'stab', kit: { model: 'stab', cut: 1400, res: 0.35, envAmt: 2, fDec: 0.1, aAtk: 0.002, aDec: 0.15, aSus: 0, aRel: 0.1, gain: 0.4 }, range: [55, 70], rhythm: ['..x.........x...', '...x.......x....'], len: 1, sparse: 0.5 },
  lead: { role: 'arp', kit: { model: 'square', pw: 0.3, cut: 2400, res: 0.3, envAmt: 1.5, fDec: 0.08, aAtk: 0.001, aDec: 0.1, aSus: 0.3, aRel: 0.05, gain: 0.32 }, range: [60, 79], arp: { pat: [0, 1, 2, 0, 3, 1, 2, 0], rate: 1, oct: 2 } },
  texture: 'none', mix: { lufs: -8, verb: 0.18, delay: 0.2, sc: 0.25 } },

{ id: 'jersey-club', name: 'Jersey Club', family: 'hiphop', bpm: [138, 145], swing: 50, modes: ['minor', 'dorian'], form: 'bass',
  kit: { kick: { len: 0.35, fEnd: 52, fStart: 230, pDec: 0.0108, punch: 0.5, aDec: 0.18, hold: 0.008, click: 0.5, clickF: 3800, drive: 2.2, lp: 9000 },
    snare: { kind: 'clap', clapF: 1350, clapQ: 1.3, clapGap: 0.007, clapTail: 0.13, claps: 3 }, hats: { base: 480, noise: 0.3, cDec: 0.022, oDec: 0.14, bpF: 11500, hpF: 8500 } },
  drums: { main: [
      { k: 'X...X...X..X..X.', s: '....X.......X...', hc: 'x.x.x.x.x.x.x.x.' },
      { k: 'X...X...X.XX..X.', s: '....X.......X...', hc: 'x.x.x.x.x.x.xrxr' }],
    fill: ['........x.x.xXxX'] },
  bass: { kit: { model: 'b808', drive: 2.4, aAtk: 0.002, aDec: 0.3, aSus: 0.4, aRel: 0.06, glide: 0.04, gain: 0.95 }, oct: 36, gate: 0.8,
    pats: [{ n: 'R...R...R..R..R.' }, { n: 'R...R...R.RR..O.' }] },
  harm: { progs: [['i', 'bVI'], ['i', 'iv'], ['i', 'bVII', 'bVI', 'bVII']], hr: 2, ext: 'triad' },
  chords: { role: 'pad', kit: { model: 'pad', detune: 0.5, cut: 1800, aAtk: 0.3, aDec: 1, aSus: 0.8, aRel: 0.8, width: 1, gain: 0.25 }, range: [55, 72] },
  lead: { role: 'chop', kit: { model: 'vox', aAtk: 0.003, aDec: 0.1, aSus: 0.3, aRel: 0.06, gain: 0.6 }, range: [64, 79], rhythm: ['x.x.x.....x.x...', 'xxx.x...x.x.x...', 'x.xx..x.x.......'] },
  texture: 'none', mix: { lufs: -7.5, verb: 0.16, delay: 0.14, sc: 0.2 } },

{ id: 'uk-drill', name: 'UK Drill', family: 'hiphop', bpm: [140, 144], swing: 50, modes: ['minor', 'harmonic', 'phrygian'], form: 'bass',
  kit: { kick: { len: 0.35, fEnd: 50, fStart: 190, pDec: 0.0158, punch: 0.4, aDec: 0.14, hold: 0.008, click: 0.4, clickF: 3600, drive: 1.8, lp: 9000, sub: 0.3 },
    snare: { kind: 'snare', tone: 230, tone2: 380, toneDec: 0.05, toneAmt: 0.4, nDec: 0.12, nHp: 2000, nLp: 11000, snap: 1 }, hats: { base: 500, noise: 0.25, cDec: 0.02, oDec: 0.14, bpF: 12000, hpF: 9000 } },
  drums: { main: [
      { k: 'X.........X.....', s: '........X.......', hc: 'x..x..x.x..x..x.' },
      { k: 'X.........X..x..', s: '........X.....x.', hc: 'x..x..x.x.rx..x.' }],
    fill: ['..........x.xXxX'] },
  bass: { kit: { model: 'b808', drive: 2.6, aAtk: 0.002, aDec: 1, aSus: 0.8, aRel: 0.2, glide: 0.11, pEnv: 2, pDec: 0.04, gain: 0.95 }, oct: 36, gate: 1,
    pats: [{ n: 'R-----o---R-f---' }, { n: 'R---t---F-----o-' }, { n: 'R-----R-s-----r-' }] },
  harm: { progs: [['i', 'bVI'], ['i', 'bII'], ['i', 'iv', 'bVI', 'v']], hr: 2, ext: 'triad' },
  chords: { role: 'pad', kit: { model: 'strings', detune: 0.5, cut: 2000, aAtk: 0.4, aDec: 1, aSus: 0.85, aRel: 1, width: 1, gain: 0.26 }, range: [55, 74] },
  lead: { role: 'hook', kit: { model: 'piano', aAtk: 0.001, aDec: 0.9, aSus: 0.15, aRel: 0.4, bright: 0.5, gain: 0.5 }, range: [67, 84], rhythm: ['x..x..x...x.....', 'x.....x.x..x....'] },
  texture: 'dark', mix: { lufs: -7.5, verb: 0.2, delay: 0.16, sc: 0 } },
);
for (const g of GENRES) GENRE_BY_ID[g.id] = g;
// channel character per genre (DeckMix.setCharacter): heat scales every strip's saturation, punch the transient shapers.
// 1 = the house default. Tape-ish genres run hot, hard genres drive the bass and lead, ambient stays clean and soft.
const GENRE_CHARACTER = { lofi: [1.6, 0.6], psytrance: [1.3, 1.1], techno: [1.3, 1.1], 'hard-techno': [1.5, 1.2], hardstyle: [1.4, 1.2], acid: [1.4, 1], dubstep: [1.4, 1.2],
  'uk-drill': [1.2, 1.2], trap: [1.2, 1.2], 'dub-techno': [1.2, 0.7], synthwave: [1.1, 0.9], ambient: [0.4, 0.4], downtempo: [0.8, 0.8], 'deep-house': [1.1, 0.9], dnb: [1.1, 1.3], jungle: [1.2, 1.3], breakbeat: [1.1, 1.2], 'big-room': [1.2, 1.2], 'future-bass': [1, 1.1], amapiano: [0.9, 1], 'afro-house': [1, 1.1] };
for (const g of GENRES) { const c = GENRE_CHARACTER[g.id] || [1, 1]; if (g.mix.heat == null) g.mix.heat = c[0]; if (g.mix.punch == null) g.mix.punch = c[1]; }
// texture beds: OFF everywhere except lo-fi's vinyl surface (the genre's own signature). Listening verdict on v5: the
// noise / resonator beds made every genre worse ("horrible"); a professional track has no constant bed it does not need.
for (const g of GENRES) g.texture = g.id === 'lofi' ? 'vinyl' : 'none';

// one SET loudness: the genres used to range from −6.5 (hardstyle) to −16 LUFS (ambient) — every track change in a mix was a
// volume jump of up to 9.5 LU. Club genres now sit within one LU of each other (−8.5 … −7.5), chill genres at −10, ambient at −12
// (it would be crushed louder). The character of a genre lives in its sound and its dynamics, not in the master fader.
for (const g of GENRES) g.mix.lufs = g.id === 'lofi' || g.id === 'downtempo' ? -10 : g.id === 'ambient' ? -12 : clamp(g.mix.lufs, -8.5, -7.5);

// the room per family (a sound engineer's defaults): reverb time and damping of the shared space, and how wet the drums are.
// v6 put one 2.4 s hall under every genre — over 174 BPM drum & bass it was a wash ("the ambience rises over the drums and bass").
const FAMILY_SPACE = { dnb: [1.3, 0.55, 0.45], breaks: [1.4, 0.5, 0.5], techno: [1.7, 0.5, 0.7], hard: [1.4, 0.55, 0.5], bass: [1.5, 0.5, 0.5], hiphop: [1.4, 0.5, 0.55], garage: [1.6, 0.45, 0.75],
  house: [1.9, 0.45, 0.85], afro: [1.9, 0.4, 0.85], latin: [1.6, 0.45, 0.75], trance: [2.6, 0.4, 0.85], psy: [2.0, 0.5, 0.6], pop: [2.2, 0.4, 0.85], chill: [2.8, 0.45, 0.9], ambient: [4.0, 0.35, 1] };
for (const g of GENRES) { const f = FAMILY_SPACE[g.family] || [2.2, 0.4, 0.85]; g.mix.space = [f[0], f[1]]; g.mix.drumVerb = f[2]; }
