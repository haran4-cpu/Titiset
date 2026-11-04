/* ===================== FORGE SCORE FORMAT (v1) =====================
   A plain-JSON song description that a person or any AI model can write. Every field except `forge` and `genre` is
   optional: what is missing comes from the genre contract, so a spec can be one line ("this genre, this key") or a
   fully written song (form, drum lanes, bass lines, progressions, melodies, sounds, mix).
   Pipeline: validateSpec (structure → semantics → musical lint, every message with a path and a fix) → compileSpec
   (spec → derived contract + plan options → composeTrack) → score. exportSpec(score) writes any score back as a spec,
   and compile(export(score)) reproduces the same events (tested for every genre). */
const SPEC_VERSION = 1;
const DRUM_LANE_P = { swing: [0, 1], nudge: [-1, 1], chance: [0, 1], human: [0, 1] }; // (v9.5) drums.lanes.<lane>: swing (its odd 16ths later, up to 1/3 step), nudge (all of it earlier or later, up to 1/4 step), chance (each hit plays with this probability), human (timing and level wander)
const SPEC_LANES = { kick: 'k', snare: 's', rim: 'rim', closed: 'hc', open: 'ho', ride: 'ride', shaker: 'sh' };
const SPEC_LANE_OF = { k: 'kick', s: 'snare', rim: 'rim', hc: 'closed', ho: 'open', ride: 'ride', sh: 'shaker' };
const SPEC_SECTIONS = ['intro', 'groove', 'break', 'build', 'drop', 'outro'];
const SPEC_DEFAULT_LAYER = { intro: 'drums1', groove: 'groove', break: 'break', build: 'build', drop: 'drop', outro: 'outro' };
const SPEC_PARTS = ['kick', 'snare', 'hats', 'perc', 'bass', 'chords', 'pad', 'lead', 'texture'];
const SPEC_SOUND_SLOTS = ['kick', 'snare', 'hats', 'perc', 'bass', 'chords', 'pad', 'lead', 'arp']; // perc: gain + pitch of the percussion voices
const SPEC_ROLES = { chords: ['stab', 'pad', 'gate', 'none'], lead: ['hook', 'arp', 'chop', 'seq', 'riff', 'none'] };
const KEY_PC = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
const NOTE_RE = /^([A-G])(#|b)?(-?\d)$/;
function noteToMidi(tok) { const m = NOTE_RE.exec(tok); if (!m) return null; return 12 * (+m[3] + 1) + KEY_PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); }
function midiToNote(m, names) { return (names || PC_NAMES)[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); }
const LANE_RE = /^[.Xxog]+$/, DRUM_RE = /^[.Xxog234?f]+$/, HAT_RE = /^[.Xxogrzq234?f]+$/, BASS_RE = /^[.\-ROFTSANProftsanp]+$/;

// melody text: bars split by '|', 16 space-separated tokens per bar: C#5 / Eb4 note · '-' hold · '.' rest · 'E5:6' explicit
// length in 16ths · '!E5' accent · '~E5' slide (legato glide into the note). Returns { bars: [[{s, m, len, acc, slide}]], errors }
function parseMelody(str) {
  const errors = [], bars = []; if (typeof str !== 'string') return { bars, errors: ['must be a string of bars separated by |'] };
  const raw = str.trim().split('|').map((b) => b.trim()).filter((b) => b.length);
  let last = null;
  raw.forEach((bs, bi) => { const toks = bs.split(/\s+/); if (toks.length !== 16) errors.push(`bar ${bi + 1} has ${toks.length} tokens — write exactly 16 (one per 16th: note, - or .)`);
    const notes = []; toks.slice(0, 16).forEach((t, s) => {
      if (t === '.') { last = null; return; }
      if (t === '-') { if (last) last.len += 1; else errors.push(`bar ${bi + 1} step ${s + 1}: '-' holds nothing (no note before it)`); return; }
      let acc = false, slide = false, tok = t; while (tok[0] === '!' || tok[0] === '~') { if (tok[0] === '!') acc = true; else slide = true; tok = tok.slice(1); }
      let len = 1; const ci = tok.indexOf(':'); if (ci > 0) { len = +tok.slice(ci + 1); tok = tok.slice(0, ci); if (!(len >= 0.25 && len <= 64)) errors.push(`bar ${bi + 1} step ${s + 1}: length '${t}' must be 0.25…64 sixteenths`); }
      const m = noteToMidi(tok); if (m == null) { errors.push(`bar ${bi + 1} step ${s + 1}: '${t}' is not a note — use names like C4, F#5, Bb3, or - (hold) / . (rest)`); last = null; return; }
      const n = { s, m, len, acc, slide }; notes.push(n); last = ci > 0 ? null : n; });
    bars.push(notes); });
  if (!raw.length) errors.push('no bars — write bars of 16 tokens separated by |');
  return { bars, errors };
}
function melodyToText(bars, names) { // inverse of parseMelody (dashes when the hold fits inside the bar, explicit :len otherwise)
  return bars.map((notes) => { const toks = new Array(16).fill('.'); const sorted = notes.slice().sort((a, b) => a.s - b.s);
    sorted.forEach((n, i) => { const nx = i + 1 < sorted.length ? sorted[i + 1].s : 16; const pre = (n.acc ? '!' : '') + (n.slide ? '~' : '');
      const intLen = Number.isInteger(n.len) && n.len >= 1; if (intLen && n.s + n.len <= nx) { toks[n.s] = pre + midiToNote(n.m, names); for (let k = 1; k < n.len; k++) toks[n.s + k] = '-'; } else toks[n.s] = pre + midiToNote(n.m, names) + ':' + +n.len.toFixed(3); });
    return toks.join(' '); }).join(' | ');
}

// ---------- validation ----------
function validateSpec(spec) {
  try { spec = JSON.parse(JSON.stringify(spec)); } catch (e) { return { ok: false, errors: [{ path: '', msg: 'not serialisable as JSON: ' + e.message }], warnings: [] }; } // what is checked is exactly what JSON can carry (no holes, no NaN)
  const E = [], W = []; const err = (path, msg, hint) => E.push({ path, msg, hint }), warn = (path, msg, hint) => W.push({ path, msg, hint });
  const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x), isNum = (x) => typeof x === 'number' && isFinite(x);
  if (!isObj(spec)) { err('', 'the score must be a JSON object', '{"forge":1,"genre":"tech-house"}'); return { ok: false, errors: E, warnings: W }; }
  const known = ['forge', 'title', 'genre', 'mood', 'seed', 'variation', 'melodySeed', 'seeds', 'complexity', 'bpm', 'key', 'mode', 'swing', 'harmony', 'form', 'drums', 'bass', 'chords', 'lead', 'sound', 'mix', 'notes', 'length', 'ext', 'fx'];
  for (const k of Object.keys(spec)) if (!known.includes(k)) warn(k, 'unknown field — ignored', 'fields: ' + known.join(', '));
  if (spec.fx != null && (!isObj(spec.fx) || (spec.fx.mangle != null && !isObj(spec.fx.mangle)))) err('fx', 'must be an object; fx.mangle: the Mangle unit kept in the track', '{"mangle": {"target": -1, "morph": 0.5, "wet": 1, "s": [{"on": true, "mode": "slice", "sub": 1, "macro": 0.5}]}}'); /* (v9.5) */
  if (spec.forge !== SPEC_VERSION) err('forge', `must be ${SPEC_VERSION}`, '"forge": 1');
  const G = GENRE_BY_ID[spec.genre]; if (!G) err('genre', `unknown genre "${spec.genre}"`, 'one of: ' + GENRES.map((g) => g.id).join(', '));
  for (const k of ['seed', 'variation', 'melodySeed']) if (spec[k] != null && !(Number.isInteger(spec[k]) && spec[k] >= 0)) err(k, 'must be a non-negative integer');
  if (spec.complexity != null && !(isNum(spec.complexity) && spec.complexity >= 0 && spec.complexity <= 1)) err('complexity', 'a number from 0 (as written) to 1 (the drums stray furthest)');
  if (spec.seeds != null) { if (!isObj(spec.seeds)) err('seeds', 'must be an object', '{"drums": 12, "bass": 7, "chords": 3}'); else for (const [k, x] of Object.entries(spec.seeds)) { if (!['drums', 'bass', 'chords'].includes(k)) err(`seeds.${k}`, `unknown part "${k}"`, 'drums, bass, chords (the lead uses melodySeed)'); else if (!(Number.isInteger(x) && x >= 0)) err(`seeds.${k}`, 'must be a non-negative integer'); } }
  if (spec.bpm != null) { if (!isNum(spec.bpm) || spec.bpm < 60 || spec.bpm > 200) err('bpm', 'must be a number 60…200'); else if (G && (spec.bpm < G.bpm[0] - 6 || spec.bpm > G.bpm[1] + 6)) warn('bpm', `${spec.bpm} is outside ${G.name}'s ${G.bpm[0]}–${G.bpm[1]} BPM`, 'allowed, but the genre will feel off'); }
  if (spec.mood != null && !MOODS[spec.mood]) err('mood', `unknown mood "${spec.mood}"`, 'one of: ' + Object.keys(MOODS).join(', '));
  // (v9.2) free text is text: a title or a section name reaches the screen and the file names (a section name carried markup into the
  // dock's section menu, where it ran as script; a numeric title broke every export of the session)
  const textOk = (v, max) => typeof v === 'string' && v.length <= max && !/[\u0000-\u001f<>]/.test(v);
  if (spec.title != null && !textOk(spec.title, 60)) err('title', 'must be text of at most 60 characters, without < >', '"Night Drive"');
  if (spec.notes != null && (typeof spec.notes !== 'string' || spec.notes.length > 4000)) err('notes', 'must be text (at most 4000 characters)');
  if (spec.key != null && KEY_PC[spec.key] == null) err('key', `"${spec.key}" is not a key`, 'C C# Db D Eb E F F# Gb G Ab A Bb B (mode goes in "mode")');
  if (spec.mode != null && !MODES[spec.mode]) err('mode', `"${spec.mode}" is not a mode`, 'one of: ' + Object.keys(MODES).join(', '));
  if (spec.swing != null && (!isNum(spec.swing) || spec.swing < 50 || spec.swing > 75)) err('swing', 'must be 50 (straight) … 75', 'MPC percent: 54 light, 58 house, 62–66 garage / hip-hop');
  const progCheck = (path, p) => { if (!Array.isArray(p) || !p.length) { err(path, 'must be a non-empty array of roman numerals', '["i","bVI","bIII","bVII"]'); return; }
    p.forEach((t, i) => { if (typeof t !== 'string' || !/^([b#]?)(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)(7|maj7|m7|9|maj9|add9|sus2|sus4|dim|5|6|11)?$/.test(t)) err(`${path}[${i}]`, `"${t}" is not a chord numeral`, 'uppercase = major, lowercase = minor, b/# prefix, suffix 7 maj7 9 maj9 add9 sus2 sus4 dim 5 6'); }); };
  const H = spec.harmony; if (H != null) { if (!isObj(H)) err('harmony', 'must be an object'); else { if (H.progression != null) progCheck('harmony.progression', H.progression);
    for (const k of ['barsPerChord', 'breakBarsPerChord']) if (H[k] != null && ![1, 2, 4, 8].includes(H[k])) err('harmony.' + k, 'must be 1, 2, 4 or 8');
    if (H.extension != null && !['triad', '7', '9', 'add9', 'sus2', 'power'].includes(H.extension)) err('harmony.extension', 'one of triad, 7, 9, add9, sus2, power'); } }
  // drums
  const drumNames = new Set(); const D = spec.drums; if (D != null) { if (!isObj(D)) err('drums', 'must be an object'); else {
    if (D.patterns != null) { if (!isObj(D.patterns) || !Object.keys(D.patterns).length) err('drums.patterns', 'must be an object of named patterns', '{"A":{"kick":"X...X...X...X...","snare":"....X.......X..."}}');
      else for (const [name, pat] of Object.entries(D.patterns)) { drumNames.add(name); const base = `drums.patterns.${name}`; if (!isObj(pat)) { err(base, 'must be an object of lanes'); continue; }
        for (const [ln, v] of Object.entries(pat)) { const path = `${base}.${ln}`;
          if (ln === 'perc') { if (!Array.isArray(v)) { err(path, 'must be an array', '[{"kind":"conga","steps":"..x..x.x..x...x."}]'); continue; }
            v.forEach((pc, i) => { if (!isObj(pc) || !(PERC_KINDS.hasOwnProperty(pc.kind) || pc.kind === 'rim')) err(`${path}[${i}].kind`, `unknown percussion "${pc && pc.kind}"`, 'one of: rim, ' + Object.keys(PERC_KINDS).join(', ')); laneCheck(`${path}[${i}].steps`, pc && pc.steps, DRUM_RE); }); continue; }
          if (!SPEC_LANES[ln]) { err(path, `unknown lane "${ln}"`, 'lanes: ' + Object.keys(SPEC_LANES).join(', ') + ', perc'); continue; }
          laneCheck(path, v, ln === 'closed' || ln === 'open' || ln === 'ride' || ln === 'shaker' ? HAT_RE : DRUM_RE); } } }
    if (D.lanes != null) { if (!isObj(D.lanes)) err('drums.lanes', 'must be an object of lanes', '{"snare":{"nudge":0.3},"closed":{"swing":0.4,"human":0.5}}'); else for (const [ln, o] of Object.entries(D.lanes)) { const path = `drums.lanes.${ln}`; if (!SPEC_LANES[ln] && ln !== 'perc') { err(path, `unknown lane "${ln}"`, 'lanes: ' + Object.keys(SPEC_LANES).join(', ') + ', perc'); continue; } if (!isObj(o)) { err(path, 'must be an object', '{"swing":0.3,"nudge":-0.2,"chance":0.9,"human":0.4}'); continue; }
      for (const [k, x] of Object.entries(o)) { const R = DRUM_LANE_P[k]; if (!R) err(`${path}.${k}`, `unknown setting "${k}"`, 'swing 0…1 · nudge −1…1 (a quarter step) · chance 0…1 · human 0…1'); else if (!isNum(x) || x < R[0] || x > R[1]) err(`${path}.${k}`, `must be ${R[0]}…${R[1]}`); } } } /* (v9.5) each lane's own feel */
    if (D.vary != null && (!isNum(D.vary) || D.vary < 0 || D.vary > 1)) err('drums.vary', 'must be 0…1', '0 = play the patterns exactly as written; 0.5 = the genre default');
    if (D.fill != null && D.fill !== false) { if (!Array.isArray(D.fill)) err('drums.fill', 'must be an array of 16-step strings or false'); else D.fill.forEach((f, i) => laneCheck(`drums.fill[${i}]`, f, HAT_RE, true)); } } }
  function laneCheck(path, v, re, oneBar) { if (typeof v !== 'string') { err(path, 'must be a string of steps', '"X...X...X...X..." — X x o g = loud → ghost, . = rest'); return; }
    const s = v.replace(/\s|\|/g, ''); if (!re.test(s)) err(path, `illegal character in "${v}"`, re === BASS_RE ? 'bass tokens: R root, O octave, F fifth, T third, S seventh, A approach, N next root, P passing, lowercase = slide, - hold, . rest' : 'X x o g hits (loud → ghost), . rest' + (re !== LANE_RE ? ', 2 3 4 ratchets (2/3/4 hits in the step), ? a hit on about half the bars, f flam' : '') + (re === HAT_RE ? ', r z q = 2/3/4-hit rolls' : ''));
    else if (s.length % 16 !== 0 || (oneBar && s.length !== 16)) err(path, `${s.length} steps — ${oneBar ? 'must be exactly 16' : 'must be 16 per bar (16, 32, 48 or 64)'}`, 'spaces and | inside the string are ignored, use them to group beats'); else if (s.length > 64) err(path, 'at most 4 bars (64 steps)'); }
  // bass
  const bassNames = new Set(); const B = spec.bass; if (B != null) { if (!isObj(B)) err('bass', 'must be an object'); else {
    if (B.patterns != null) { if (!isObj(B.patterns) || !Object.keys(B.patterns).length) err('bass.patterns', 'must be an object of named patterns', '{"A":"..R..R.R..R..RO."}'); else for (const [name, v] of Object.entries(B.patterns)) { bassNames.add(name); laneCheck(`bass.patterns.${name}`, v, BASS_RE); } }
    if (B.accents != null) { if (!isObj(B.accents)) err('bass.accents', 'must be an object: a pattern name → its accent steps', '{"A":"x...x...x...x..."}'); else for (const [name, a] of Object.entries(B.accents)) { const path = `bass.accents.${name}`; if (!bassNames.has(name)) err(path, `pattern "${name}" is not defined`, 'an accent lane belongs to a bass pattern of the same name'); else if (typeof a !== 'string' || !/^[.x]+$/.test(a.replace(/\s|\|/g, ''))) err(path, 'a string of x (accent) and . (none)', '"x...x...x...x..."'); else if (a.replace(/\s|\|/g, '').length !== B.patterns[name].replace(/\s|\|/g, '').length) err(path, 'as long as its pattern'); } } /* (v9.5) */
    if (B.gate != null && (!isNum(B.gate) || B.gate < 0.2 || B.gate > 1)) err('bass.gate', 'must be 0.2…1');
    if (B.vary != null && (!isNum(B.vary) || B.vary < 0 || B.vary > 1)) err('bass.vary', 'must be 0…1', '0 = the bass lines exactly as written'); } }
  // chords / lead
  for (const part of ['chords', 'lead']) { const P = spec[part]; if (P == null) continue; if (!isObj(P)) { err(part, 'must be an object'); continue; }
    if (P.role != null && !SPEC_ROLES[part].includes(P.role)) err(`${part}.role`, `unknown role "${P.role}"`, 'one of: ' + SPEC_ROLES[part].join(', '));
    if (P.rhythm != null) { if (!Array.isArray(P.rhythm) || !P.rhythm.length) err(`${part}.rhythm`, 'must be a non-empty array of step strings'); else P.rhythm.forEach((x, i) => laneCheck(`${part}.rhythm[${i}]`, x, LANE_RE)); }
    if (P.voices != null && !(Number.isInteger(P.voices) && P.voices >= 2 && P.voices <= 6)) err(`${part}.voices`, 'must be a whole number of notes, 2…6', '4');
    if (P.len != null && !(typeof P.len === 'number' && P.len > 0 && P.len <= 16)) err(`${part}.len`, 'must be a note length in steps, 0…16', '1.5');
    if (P.sparse != null && !(typeof P.sparse === 'number' && P.sparse >= 0 && P.sparse < 1)) err(`${part}.sparse`, 'must be 0 … 0.95 (how many bars stay silent)', '0.5');
    if (P.range != null && !(Array.isArray(P.range) && P.range.length === 2 && P.range.every((n) => Number.isInteger(n) && n >= 24 && n <= 100) && P.range[0] + 7 <= P.range[1])) err(`${part}.range`, 'must be [low, high] MIDI notes, at least a fifth apart', '[60, 84]'); }
  if (spec.chords && spec.chords.role === 'gate' && spec.chords.rhythm) err('chords.rhythm', 'gate role uses "gate" patterns', 'put the patterns in "chords.gate"');
  if (spec.chords && spec.chords.gate != null) { if (!Array.isArray(spec.chords.gate) || !spec.chords.gate.length) err('chords.gate', 'must be an array of 16-step strings'); else spec.chords.gate.forEach((x, i) => laneCheck(`chords.gate[${i}]`, x, LANE_RE)); }
  // form
  if (spec.form != null) { if (!Array.isArray(spec.form) || !spec.form.length) err('form', 'must be a non-empty array of sections', '[{"section":"intro","bars":16},{"section":"drop","bars":32}]');
    else { let total = 0; spec.form.forEach((S, i) => { const p = `form[${i}]`; if (!isObj(S)) { err(p, 'must be an object'); return; }
        if (!SPEC_SECTIONS.includes(S.section)) err(`${p}.section`, `unknown section "${S.section}"`, 'one of: ' + SPEC_SECTIONS.join(', '));
        if (S.name != null && !textOk(S.name, 48)) err(`${p}.name`, 'must be text of at most 48 characters, without < >', '"Drop 2"');
        if (!(Number.isInteger(S.bars) && S.bars >= 1 && S.bars <= 128)) err(`${p}.bars`, 'must be an integer 1…128'); else { total += S.bars; if (S.bars % 4) warn(`${p}.bars`, `${S.bars} bars is not a multiple of 4`, 'phrases of 4/8/16 bars are what DJs and listeners expect'); }
        if (S.layer != null) { if (typeof S.layer === 'string') { if (!LAYERS[S.layer]) err(`${p}.layer`, `unknown layer "${S.layer}"`, 'one of: ' + Object.keys(LAYERS).join(', ')); }
          else if (isObj(S.layer)) { for (const [k, v] of Object.entries(S.layer)) { if (!SPEC_PARTS.includes(k) && k !== 'riser') err(`${p}.layer.${k}`, `unknown part "${k}"`, 'parts: ' + SPEC_PARTS.join(', ')); else if (!isNum(v) || v < 0 || v > 1) err(`${p}.layer.${k}`, 'must be 0…1 (0 = silent, <1 = filtered/thinned, 1 = full)'); } }
          else err(`${p}.layer`, 'must be a layer name or an object of part levels', '{"kick":1,"bass":0.7,"pad":1}'); }
        for (const [k, set] of [['drums', drumNames], ['bass', bassNames]]) if (S[k] != null) { const list = Array.isArray(S[k]) ? S[k] : [S[k]];
          list.forEach((n) => { if (typeof n !== 'string') err(`${p}.${k}`, 'must be a pattern name or an array of names'); else if (!set.has(n)) err(`${p}.${k}`, `pattern "${n}" is not defined`, set.size ? `defined: ${[...set].join(', ')}` : `define it in "${k}.patterns"`); }); }
        if (S.level != null && (!isNum(S.level) || S.level < -12 || S.level > 3)) err(`${p}.level`, 'must be a number −12…3 (dB relative to the drop)', 'omit it: each genre has measured section levels (break −6, groove −2, …)');
        if (S.progression != null) progCheck(`${p}.progression`, S.progression);
        if (S.barsPerChord != null && ![1, 2, 4, 8].includes(S.barsPerChord)) err(`${p}.barsPerChord`, 'must be 1, 2, 4 or 8');
        if (S.melody != null) { const r = parseMelody(S.melody); r.errors.forEach((e) => err(`${p}.melody`, e));
          if (!r.errors.length && G) lintMelody(`${p}.melody`, r.bars, S, spec, G); } });
      if (total > 512) err('form', `${total} bars — at most 512`); } }
  // sound / mix
  if (spec.sound != null) { if (!isObj(spec.sound)) err('sound', 'must be an object'); else for (const [slot, v] of Object.entries(spec.sound)) { if (slot === 'drums') { // (v9.3) the kit family and its per-part Tune / Decay / Tone / Snap
        if (!isObj(v)) { err('sound.drums', 'must be an object', '{"family": "909", "bank": {"snare": {"tune": -2}}}'); continue; } if (v.family != null && !(v.family === 'forge' || BANK_FAMILIES.includes(v.family))) err('sound.drums.family', `unknown kit family "${v.family}"`, 'one of: forge, ' + BANK_FAMILIES.join(', '));
        if (v.bank != null) { if (!isObj(v.bank)) err('sound.drums.bank', 'must be an object'); else for (const [part, q] of Object.entries(v.bank)) { if (!['snare', 'hats', 'perc'].includes(part) || !isObj(q)) { err(`sound.drums.bank.${part}`, 'parts: snare, hats, perc — each an object'); continue; } for (const [k, x] of Object.entries(q)) { const R = { tune: [-24, 24], decay: [0.02, 1], tone: [-1, 1], snap: [0, 1] }[k]; if (!R || !isNum(x) || x < R[0] || x > R[1]) err(`sound.drums.bank.${part}.${k}`, 'tune −24…24, decay 0.02…1, tone −1…1 or snap 0…1'); } } }
        for (const k of Object.keys(v)) if (k !== 'family' && k !== 'bank') err(`sound.drums.${k}`, `unknown key "${k}"`, 'family, bank'); continue; }
      if (!SPEC_SOUND_SLOTS.includes(slot)) { err(`sound.${slot}`, `unknown slot "${slot}"`, 'slots: ' + SPEC_SOUND_SLOTS.join(', ')); continue; }
      if (!isObj(v)) { err(`sound.${slot}`, 'must be an object of parameters'); continue; } for (const [k, x] of Object.entries(v)) { if (k === 'preset') { if (typeof x !== 'string' || !presetKit(slot, x)) err(`sound.${slot}.preset`, `unknown ${slot} preset "${x}"`, 'one of: ' + Object.keys(SOUND_BANK[slot] || {}).join(', ')); } else if (k === 'model') { if (!MODEL.hasOwnProperty(x)) err(`sound.${slot}.model`, `unknown model "${x}"`, 'one of: ' + Object.keys(MODEL).join(', ')); }
        else if (k === 'kind' || k === 'vowel') { if (typeof x !== 'string') err(`sound.${slot}.${k}`, 'must be a string'); } else if (!isNum(x)) err(`sound.${slot}.${k}`, 'must be a number'); } } }
  if (spec.length != null && !['radio', 'club', 'extended', 'classic'].includes(spec.length)) err('length', `unknown length "${spec.length}"`, 'radio, club or extended'); // (v9.4) the form's length when no form is written
  if (spec.mix != null) { if (!isObj(spec.mix)) err('mix', 'must be an object'); else { const R = { lufs: [-20, -5], verb: [0, 1], delay: [0, 1], sidechain: [0, 0.9], heat: [0, 2], punch: [0, 2], echo: [0, 2] };
    for (const [k, v] of Object.entries(spec.mix)) { if (!R[k]) err(`mix.${k}`, 'unknown mix field', 'lufs, verb, delay, echo, sidechain, heat, punch'); else if (!isNum(v) || v < R[k][0] || v > R[k][1]) err(`mix.${k}`, `must be ${R[k][0]}…${R[k][1]}`); } } }
  return { ok: E.length === 0, errors: E, warnings: W };
  function lintMelody(path, bars, S, spec, G) { // musical lint: out-of-key notes, unusual range (warnings, never errors: chromatic notes are legal)
    const key = spec.key != null ? KEY_PC[spec.key] : null, mode = spec.mode || G.modes[0]; if (key == null || !MODES[mode]) return; const sc = MODES[mode].map((x) => (key + x) % 12);
    let out = 0, total = 0, lo = 999, hi = -1; for (const b of bars) for (const n of b) { total++; if (!sc.includes(((n.m % 12) + 12) % 12)) out++; lo = Math.min(lo, n.m); hi = Math.max(hi, n.m); }
    if (out) warn(path, `${out} of ${total} notes are outside ${spec.key} ${mode}`, 'fine as passing tones; on downbeats they clash with the chords');
    if (lo < 48 || hi > 96) warn(path, `range ${midiToNote(lo)}–${midiToNote(hi)} is unusual for a lead`, 'leads usually sit between C4 and C7'); }
}

// ---------- sound overrides keep the genre's measured balance ----------
// A new oscillator (supersaw instead of square, 7 voices instead of 2, more drive) changes the level by up to ±10 dB, and the
// genre's calibration was measured with the original kit — so the raw override would wreck the mix (a supersaw lead landed
// 8 LU over its target). The override is rendered against the genre kit on a fixed test phrase and its gain scaled to the
// same energy. Filter and envelope changes are NOT compensated: those are musical (a closed filter is meant to be quieter).
// `gain` in an override stays in the genre kit's scale (1 × the genre level = the genre's gain value).
const TIMBRE_KEYS = ['model', 'detune', 'voices', 'drive', 'wave', 'pw', 'ratio', 'index', 'bright', 'sub', 'vowel', 'noiseAmt'];
const SOUND_CENTER = { bass: 40, chords: 60, pad: 60, lead: 70, arp: 70 };
function kitEnergy(kit, slot) { const sr = 22050, poly = slot === 'chords' || slot === 'pad', syn = new Synth(sr, poly ? 6 : 2, !poly), c = SOUND_CENTER[slot];
  syn.setKit(Object.assign({}, kit, { gain: 1 })); syn.bpm = 120; const o = { slide: false, accent: false, bright: 1, lfo: 0, pan: 0, vowel: kit.vowel || 'a', from: 0, fit: false };
  const hits = poly ? [[0, [c - 3, c, c + 4]]] : [[0, [c]], [0.3, [c + 3]], [0.6, [c + 7]], [0.9, [c + 5]]]; const L = new Float32Array(128), R = new Float32Array(128); let e = 0, hi = 0, hp = 0, lp = 0, hq = 0, lq = 0; const aHp = 1 - Math.exp(-2 * Math.PI * 38 / sr), aLp = 1 - Math.exp(-2 * Math.PI * 1500 / sr);
  for (let t = 0; t < sr * 1.3; t += 128) { while (hi < hits.length && hits[hi][0] * sr < t + 128) { const off = Math.max(0, Math.round(hits[hi][0] * sr - t)); for (const m of hits[hi][1]) syn.trigger(off, m, 0.9, sr * (poly ? 1.1 : 0.27), o); hi++; }
    L.fill(0); R.fill(0); syn.render(L, R, 128); for (let i = 0; i < 128; i++) { const x = L[i], z = R[i]; hp += (x - hp) * aHp; const y0 = x - hp; lp += (y0 - lp) * aLp; const y = y0 + 0.6 * (y0 - lp); hq += (z - hq) * aHp; const w0 = z - hq; lq += (w0 - lq) * aLp; const w = w0 + 0.6 * (w0 - lq); e += y * y + w * w; } } return e; } // crude K-weighting (38 Hz high-pass, +4 dB shelf over 1.5 kHz): the level the loudness meter and the calibration see
const LM_CACHE = new Map();
function levelMatch(slot, base, kit) { const key = slot + JSON.stringify(base) + JSON.stringify(Object.assign({}, kit, { gain: 0 })); if (LM_CACHE.has(key)) return LM_CACHE.get(key);
  const nz = NZ; const eb = kitEnergy(base, slot), ek = kitEnergy(kit, slot); NZ = nz; // the engine noise stream is left exactly where it was
  const f = ek > 1e-12 && eb > 1e-12 ? Math.max(0.1, Math.min(8, Math.sqrt(eb / ek))) : 1; if (LM_CACHE.size > 200) LM_CACHE.clear(); LM_CACHE.set(key, f); return f; }
function specKits(spec) { const { G } = deriveContract(spec); return { kick: G.kit.kick, snare: G.kit.snare, hats: G.kit.hats, bass: G.bass.kit, chords: G.chords.kit, pad: G.pad && G.pad.kit, lead: G.lead && G.lead.kit, arp: (G.arp || G.hook) && (G.arp || G.hook).kit }; }

// ---------- compile ----------
function deriveContract(spec) {
  const G = withLead2(JSON.parse(JSON.stringify(GENRE_BY_ID[spec.genre])), spec.genre, spec.seed != null ? spec.seed : hashStr(JSON.stringify(spec)) % 100000); const names = { drums: [], bass: [], match: [] }; // (v9.4) the same second voice a new track gets
  if (spec.swing != null) G.swing = spec.swing;
  const H = spec.harmony || {}; if (H.barsPerChord && H.barsPerChord !== G.harm.hr) { G.harm.hr = H.barsPerChord; delete G.harm.breakHr; } if (H.breakBarsPerChord) G.harm.breakHr = H.breakBarsPerChord; if (H.extension) G.harm.ext = H.extension;
  const D = spec.drums || {}; if (D.patterns) { G.userDrums = true; G.drums.main = Object.entries(D.patterns).map(([name, p]) => { names.drums.push(name); const v = {};
      for (const [ln, x] of Object.entries(p)) { if (ln === 'perc') v.p = x.map((pc) => [pc.kind, pc.note || 0, pc.steps.replace(/\s|\|/g, '')]); else v[SPEC_LANES[ln]] = x.replace(/\s|\|/g, ''); } return v; }); }
  if (D.vary != null) G.drums.vary = D.vary; if (D.lanes) G.drums.lanes = JSON.parse(JSON.stringify(D.lanes)); if (D.fill === false) G.drums.fill = null; else if (Array.isArray(D.fill)) G.drums.fill = D.fill.slice();
  const B = spec.bass || {}; if (B.patterns) G.bass.pats = Object.entries(B.patterns).map(([name, n]) => { names.bass.push(name); const o = { n: n.replace(/\s|\|/g, '') }; const a = B.accents && B.accents[name]; if (a) o.acc = a.replace(/\s|\|/g, ''); return o; }); if (B.gate != null) G.bass.gate = B.gate; if (B.vary != null) G.bass.vary = B.vary;
  for (const part of ['chords', 'lead']) { const P = spec[part]; if (!P) continue; if (!G[part] && part === 'lead' && P.role !== 'none') G.lead = { role: 'hook', kit: { model: 'lead', voices: 2, detune: 0.3, cut: 3200, res: 0.15, envAmt: 0.8, fDec: 0.2, aAtk: 0.004, aDec: 0.2, aSus: 0.6, aRel: 0.12, gain: 0.36 }, range: [64, 84], rhythm: ['x..x..x.x.......'] };
    if (!G[part]) continue; for (const k of ['role', 'rhythm', 'range', 'gate', 'len', 'sparse', 'voices']) if (P[k] != null) G[part][k] = Array.isArray(P[k]) ? P[k].map((x) => (typeof x === 'string' ? x.replace(/\s|\|/g, '') : x)) : P[k];
    if (part === 'chords' && G.chords.role === 'gate' && !G.chords.gate) G.chords.gate = ['x.xx.xx.x.xx.xx.'];
    if (part === 'chords' && G.chords.role === 'stab' && !G.chords.rhythm) G.chords.rhythm = ['x..x..x.........'];
    if (part === 'chords' && G.chords.role !== 'none' && !G.chords.range) G.chords.range = [55, 74];
    if (part === 'lead' && G.lead.role === 'arp' && !G.lead.arp) G.lead.arp = { pat: [0, 2, 1, 3, 2, 1, 3, 4], rate: 1, oct: 2 };
    if (part === 'lead' && (G.lead.role === 'hook' || G.lead.role === 'chop' || G.lead.role === 'seq') && !G.lead.rhythm) G.lead.rhythm = ['x..x..x.x.......']; }
  if (!G.lead && Array.isArray(spec.form) && spec.form.some((f) => f && f.melody) && !(spec.lead && spec.lead.role === 'none')) G.lead = { role: 'hook', kit: { model: 'lead', voices: 2, detune: 0.3, cut: 3200, res: 0.15, envAmt: 0.8, fDec: 0.2, aAtk: 0.004, aDec: 0.2, aSus: 0.6, aRel: 0.12, gain: 0.36 }, range: [64, 84], rhythm: ['x..x..x.x.......'] }; // written melody in a genre without a lead
  if (spec.chords && spec.chords.role !== 'none' && !G.chords.kit) G.chords.kit = { model: 'pad', detune: 0.5, cut: 1800, aAtk: 0.3, aDec: 1, aSus: 0.85, aRel: 0.8, width: 1, gain: 0.3 };
  if ((spec.sound || {}).perc && !G.kit.perc) G.kit.perc = {};
  const S = spec.sound || {}; const slot = { kick: G.kit.kick, snare: G.kit.snare, hats: G.kit.hats, perc: G.kit.perc, bass: G.bass.kit, chords: G.chords.kit, pad: G.pad && G.pad.kit, lead: G.lead && G.lead.kit, arp: (G.arp || G.hook) && (G.arp || G.hook).kit };
  for (const [k, v] of Object.entries(S)) if (slot[k]) { const base = Object.assign({}, slot[k]); const pre = v.preset ? presetKit(k, v.preset) : null;
    if (pre && SOUND_CENTER[k]) { for (const key of Object.keys(slot[k])) delete slot[k][key]; Object.assign(slot[k], pre); } else if (pre) Object.assign(slot[k], pre); // a synth preset replaces the sound; a drum preset reshapes the genre's drum
    if (pre && (k === 'snare' || k === 'hats' || k === 'perc')) slot[k].synth = 1; // (v9.3) a drum sound chosen from the bank is a synthesized voice: that part leaves the kit family
    const rest = Object.assign({}, v); delete rest.preset; delete rest.vary; Object.assign(slot[k], rest); if (v.vary != null && SOUND_CENTER[k]) varyKit(slot[k], v.vary); // (v9.4) this track's cut of the preset
    if (pre || (SOUND_CENTER[k] && TIMBRE_KEYS.some((t) => v[t] != null))) { slot[k].gain = v.gain != null ? v.gain : k === 'perc' && pre && pre.gain != null ? pre.gain : base.gain != null ? base.gain : 1; names.match.push({ slot: k, base, preset: v.preset && Object.keys(v).filter((q) => q !== 'vary').length === 1 ? v.preset : null }); } } // level matched in context after composing (compileSpec)
  const M = spec.mix || {}; if (M.lufs != null) G.mix.lufs = M.lufs; if (M.verb != null) G.mix.verb = M.verb; if (M.delay != null) G.mix.delay = M.delay; if (M.sidechain != null) G.mix.sc = M.sidechain; if (M.heat != null) G.mix.heat = M.heat; if (M.punch != null) G.mix.punch = M.punch; if (M.echo != null) G.mix.echo = M.echo;
  return { G, names };
}
function compileSpec(spec, opts) {
  spec = JSON.parse(JSON.stringify(spec)); const fast = !!(opts && opts.fastLevels);
  const v = validateSpec(spec); if (!v.ok) { const e = new Error('score has errors:\n' + v.errors.map((x) => `  ${x.path}: ${x.msg}${x.hint ? ` (${x.hint})` : ''}`).join('\n')); e.validation = v; throw e; }
  const { G, names } = deriveContract(spec), o = { contract: G, title: spec.title };
  if (spec.bpm != null) o.bpm = spec.bpm; if (spec.key != null) o.key = KEY_PC[spec.key]; if (spec.mode != null) o.mode = spec.mode;
  if (spec.harmony && spec.harmony.progression) o.prog = spec.harmony.progression.slice();
  if (spec.mood) { o.mood = spec.mood; o.extFixed = !!(spec.harmony && spec.harmony.extension); o.hrFixed = !!(spec.harmony && spec.harmony.barsPerChord); } if (spec.variation != null) o.vseed = spec.variation; if (spec.seeds) o.seeds = Object.assign({}, spec.seeds); if (spec.complexity != null) o.complexity = spec.complexity; if (spec.melodySeed != null) o.leadSeed = spec.melodySeed;
  if (spec.length) o.length = spec.length;
  if (spec.form) o.sections = spec.form.map((S) => { const x = { type: S.section, bars: S.bars, name: S.name || S.section };
    if (S.layer == null) x.layer = SPEC_DEFAULT_LAYER[S.section]; else if (typeof S.layer === 'string') x.layer = S.layer; else { x.layer = 'custom'; x.L = Object.assign({}, S.layer); if (S.section === 'build' && x.L.riser == null) x.L.riser = 1; }
    if (S.drums != null) x.dv = (Array.isArray(S.drums) ? S.drums : [S.drums]).map((n) => names.drums.indexOf(n));
    if (S.bass != null) x.bv = (Array.isArray(S.bass) ? S.bass : [S.bass]).map((n) => names.bass.indexOf(n));
    if (S.level != null) x.lvl = S.level;
    if (S.progression) x.prog = S.progression.map(parseChord); if (S.barsPerChord) x.hr = S.barsPerChord;
    if (S.melody) x.mel = parseMelody(S.melody).bars; return x; });
  const score = composeTrack(spec.genre, spec.seed != null ? spec.seed : hashStr(JSON.stringify(spec)) % 100000, o);
  { const SDr = spec.sound && spec.sound.drums; if (SDr) { if (SDr.family) score.kits.drumFam = SDr.family; if (SDr.bank) score.kits.drumPrm = JSON.parse(JSON.stringify(SDr.bank)); } } // (v9.3) the deck plays this family with these settings
  // a changed sound keeps the genre's measured level: the part's real notes from this score are rendered with the genre's
  // sound and with the new one, and the new one's gain is set to the same (K-weighted) energy
  for (const m of names.match) { const key = m.slot === 'arp' ? (score.kits.hook ? 'hook' : 'arp') : m.slot, kit = score.kits[key]; if (!kit || m.slot === 'perc') continue; // a percussion kit has no genre sound to match: its preset carries its level
    // a plain palette preset uses its pre-measured in-context level (tools/preset_gain.cjs) — no rendering on the UI thread
    const pg = m.preset && PRESET_GAIN[spec.genre] && PRESET_GAIN[spec.genre][m.slot] ? PRESET_GAIN[spec.genre][m.slot][m.preset] : null;
    const g0 = kit.gain != null ? kit.gain : 1, useTable = fast && pg != null; // (an estimate: refineLevels makes it exact, in context, off the UI thread)
    let f = useTable ? pg : contextMatch(score, m.slot, m.base, kit); if (f == null) f = SOUND_CENTER[m.slot] ? levelMatch(m.slot, m.base, kit) : 1;
    if (useTable) (score.levelPending = score.levelPending || []).push({ slot: m.slot, key, base: m.base, g0 }); // refined later by refineLevels (exact, in context)
    kit.gain = g0 * f; const gk = { kick: G.kit.kick, snare: G.kit.snare, hats: G.kit.hats, bass: G.bass.kit, chords: G.chords.kit, pad: G.pad && G.pad.kit, lead: G.lead && G.lead.kit, arp: (G.arp || G.hook) && (G.arp || G.hook).kit }[m.slot]; if (gk && gk !== kit) gk.gain = kit.gain; }
  if (typeof syncLead2 !== 'undefined') syncLead2(score); // (v9.4) LEAD 2 follows the line it accompanies
  score.spec = spec; score.validation = v; return score;
}
const CM_CACHE = new Map(), CM_CH = { kick: 0, snare: 1, hats: 2, bass: 4, chords: 5, pad: 6, lead: 7, arp: 8 };
// part-level consistency across tracks of one genre (v7): the same genre's bass measured 2.7–4.5 LU apart from seed to seed
// (a rolling line against a sparse one, a register an octave lower), and the master trim then moved every other part with it.
// Each track's bass and lead lines are measured with a fixed neutral sound (so only the notes count: density, length,
// velocity, register) against the genre's median line (src/compose/part_ref.js, tools/part_ref.cjs), and 75 % of the
// difference is taken out of the part's gain (at most ±4 dB) — a busier line still sits a little hotter, as it should.
const PART_PROBE = { bass: { model: 'sub', drive: 1, aAtk: 0.004, aDec: 0.3, aSus: 0.85, aRel: 0.06, gain: 1 }, lead: { model: 'saw', voices: 1, cut: 3000, res: 0.1, aAtk: 0.004, aDec: 0.3, aSus: 0.7, aRel: 0.1, gain: 1 } };
function partProbe(score, slot) { const ch = CM_CH[slot], ev = score.ev, sec = peakSectionOf(score), t0 = sec.bar0 * 16, idx = []; for (let i = 0; i < ev.n; i++) if (ev.ch[i] === ch && ev.t[i] >= t0 && ev.t[i] < t0 + 64) idx.push(i);
  if (idx.length < 2) return null; const nz = NZ; const e = partEnergy(score, slot, PART_PROBE[slot], idx, t0); NZ = nz; return e; }
function normalizeParts(score) { const ref = typeof PART_REF !== 'undefined' ? PART_REF[score.meta.gid] : null; if (!ref) return;
  for (const slot of ['bass', 'lead']) { const r = ref[slot], kit = score.kits[slot]; if (!r || !kit) continue; const e = partProbe(score, slot); if (!e) continue;
    const f = clamp(Math.pow(r / e, 0.5 * 0.75), 0.63, 1.58); kit.gain = (kit.gain != null ? kit.gain : 1) * f; score.partNorm = Object.assign(score.partNorm || {}, { [slot]: +(20 * Math.log10(f)).toFixed(2) }); } }
// the exact in-context level of sounds that started from the pre-measured table (a palette sound on a new track): run when the
// UI is idle; returns [{ slot, gain }] for the parts whose level moves by more than 0.3 dB
function refineLevels(score) { const out = []; for (const p of score.levelPending || []) { const kit = score.kits[p.key]; if (!kit) continue; const f = contextMatch(score, p.slot, p.base, Object.assign({}, kit, { gain: p.g0 })); if (f == null) continue;
    const g = p.g0 * f; if (Math.abs(20 * Math.log10(g / kit.gain)) > 0.3) { kit.gain = g; out.push({ slot: p.slot, gain: g }); } } score.levelPending = null;
  if (typeof syncLead2 !== 'undefined') { const g2 = syncLead2(score); if (g2 != null) out.push({ slot: 'arp', gain: g2 }); } return out; } // (v9.4) LEAD 2 follows the line it accompanies
function contextMatch(score, slot, baseKit, newKit) { const ch = CM_CH[slot], ev = score.ev, key = [slot, score.meta.gid, Math.round(score.meta.bpm), (score.mix || {}).heat, (score.mix || {}).punch, JSON.stringify(baseKit), JSON.stringify(Object.assign({}, newKit, { gain: 1 }))].join('|');
  if (CM_CACHE.has(key)) return CM_CACHE.get(key);
  const sec = peakSectionOf(score); let t0 = sec.bar0 * 16, idx = []; const pick = (from) => { const out = []; for (let i = 0; i < ev.n; i++) if (ev.ch[i] === ch && ev.t[i] >= from && ev.t[i] < from + 64) out.push(i); return out; };
  idx = pick(t0); if (idx.length < 3) { let first = -1; for (let i = 0; i < ev.n; i++) if (ev.ch[i] === ch) { first = i; break; } if (first < 0) return null; t0 = Math.floor(ev.t[first] / 16) * 16; idx = pick(t0); if (idx.length < 3) return null; }
  // (v9.2) both renders draw the same noise from a fixed start: the match no longer depends on what the thread rendered before it (the
  // analysis worker and a tool rebuilding the track measured the same palette lead 0.05 dB apart)
  const nz = NZ; NZ = 0x2f6b1d3; const eb = partEnergy(score, slot, baseKit, idx, t0); NZ = 0x2f6b1d3; const en = partEnergy(score, slot, Object.assign({}, newKit, { gain: baseKit.gain != null ? baseKit.gain : 1 }), idx, t0); NZ = nz;
  const f = en > 1e-12 && eb > 1e-12 ? Math.max(0.1, Math.min(8, Math.sqrt(eb / en))) : null; if (CM_CACHE.size > 300) CM_CACHE.clear(); CM_CACHE.set(key, f); return f; }
// noise-built sounds (plucks, rims, hats) need the top octave to measure like the 44.1 kHz engine: 32 kHz, 16 kHz for bass/kick
function partEnergy(score, slot, kit, idx, t0) { const sr = slot === 'bass' || slot === 'kick' ? 16000 : 32000, bpm = score.meta.bpm, sps = sr * 60 / bpm / 4, ev = score.ev, L = new Float32Array(128), R = new Float32Array(128);
  let inst, trig; const o = { slide: false, accent: false, bright: 1, lfo: 0, pan: 0, vowel: 'a', from: 0, fit: false };
  if (slot === 'kick') { inst = new Kick(sr); inst.setTempo(bpm); inst.setKit(kit); trig = (i, off) => inst.trigger(off, ev.v[i]); }
  else if (slot === 'snare') { inst = new Snare(sr); inst.setKit(kit); trig = (i, off) => inst.trigger(off, ev.v[i], SNARE_KIND[ev.a[i] | 0]); }
  else if (slot === 'hats') { inst = new Hats(sr); inst.setKit(kit); trig = (i, off) => inst.trigger(off, ev.v[i], ev.a[i] | 0, ev.y[i]); }
  else { const mono = slot === 'bass' || (slot === 'lead' && (score.roles.lead === 'seq' || score.roles.lead === 'riff')); inst = new Synth(sr, { chords: 14, pad: 12, lead: 6, arp: 8 }[slot] || 2, mono); inst.setKit(kit); inst.bpm = bpm;
    trig = (i, off) => { const f = ev.f[i]; o.slide = !!(f & 1); o.accent = !!(f & 2); o.bright = ev.x[i] || 1; o.lfo = slot === 'bass' ? ev.y[i] : 0; o.vowel = slot === 'lead' && ev.y[i] > 0 ? VOWEL_LIST[(ev.y[i] - 1) | 0] : 'a'; o.fit = (slot === 'chords' || slot === 'pad') && ev.d[i] >= 8; inst.trigger(off, ev.a[i], ev.v[i], ev.d[i] * sps, o); }; }
  const N = Math.round(64 * sps + sr * 0.4), aHp = 1 - Math.exp(-2 * Math.PI * 38 / sr), aLp = 1 - Math.exp(-2 * Math.PI * 1500 / sr); let e = 0, k = 0, hp = 0, lp = 0, hq = 0, lq = 0;
  const strip = new Strip(), mx = score.mix || {}; stripCharacter(strip, CM_CH[slot] != null ? CM_CH[slot] : 3, mx.heat != null ? mx.heat : 1, mx.punch != null ? mx.punch : 1, sr); // the channel's transient shaper + saturator, as in the deck
  for (let t = 0; t < N; t += 128) { while (k < idx.length && (ev.t[idx[k]] - t0) * sps < t + 128) { trig(idx[k], Math.max(0, Math.min(127, Math.round((ev.t[idx[k]] - t0) * sps - t)))); k++; }
    L.fill(0); R.fill(0); inst.render(L, R, 128); strip.block(L, R, 128); for (let i = 0; i < 128; i++) { const x = L[i], z = R[i]; hp += (x - hp) * aHp; const y0 = x - hp; lp += (y0 - lp) * aLp; const y = y0 + 0.6 * (y0 - lp); hq += (z - hq) * aHp; const w0 = z - hq; lq += (w0 - lq) * aLp; const w = w0 + 0.6 * (w0 - lq); e += y * y + w * w; } } // both channels: a wide sound is as loud as it is (the mono sum hid its sides: wide presets came out 3–4 LU hot)
  return e / N; }

// lint on the compiled score: written-melody notes that clash with the chord under them (a b9 over a chord tone on a
// strong beat or held ≥ 3 sixteenths). These are warnings — tension is a choice — but they are usually typos.
function lintScore(score) { const W = [], ev = score.ev; if (!score.spec || !score.spec.form) return W; const names = spellFor(score.meta.key, score.meta.mode);
  score.sections.forEach((sec, si) => { const f = score.spec.form[si]; if (!f || !f.melody) return; let clashes = 0, first = '';
    for (let i = 0; i < ev.n; i++) { if (ev.ch[i] !== 7) continue; const t = ev.t[i]; if (t < sec.bar0 * 16 || t >= (sec.bar0 + sec.bars) * 16) continue; const bar = Math.floor(t / 16), st = Math.floor(t - bar * 16 + 1e-6);
      if (!(st % 4 === 0 || ev.d[i] >= 2.7)) continue; const tones = score.chords[bar].tones, pc = ((Math.round(ev.a[i]) % 12) + 12) % 12;
      if (!tones.includes(pc) && tones.some((c) => (pc - c + 12) % 12 === 1)) { clashes++; if (!first) first = `bar ${bar - sec.bar0 + 1} step ${st + 1}: ${midiToNote(Math.round(ev.a[i]), names)} over ${score.chords[bar].label}`; } }
    if (clashes) W.push({ path: `form[${si}].melody`, msg: `${clashes} strong-beat note(s) a semitone above a chord tone, first at ${first}`, hint: 'move it a step to a chord tone, or change the chord' }); });
  return W; }
// ---------- export: any score → a spec that reproduces it ----------
function exportSpec(score, opt) {
  opt = opt || {}; const m = score.meta, G = score.contract || GENRE_BY_ID[m.gid]; const spec = { forge: SPEC_VERSION, title: m.name, genre: m.gid, seed: m.seed, variation: m.vseed };
  if (m.leadSeed != null) spec.melodySeed = m.leadSeed; if (m.seeds) spec.seeds = Object.assign({}, m.seeds);
  Object.assign(spec, { bpm: m.bpm, key: spellFor(m.key, m.mode)[m.key], mode: m.mode, swing: G.swing, harmony: { progression: m.prog.slice(), barsPerChord: G.harm.hr, extension: G.harm.ext } }); if (G.harm.breakHr) spec.harmony.breakBarsPerChord = G.harm.breakHr;
  const dn = G.drums.main.map((_, i) => String.fromCharCode(65 + i)), bn = G.bass.pats.map((_, i) => String.fromCharCode(65 + i));
  spec.drums = { patterns: {}, fill: G.drums.fill ? G.drums.fill.slice() : false, vary: G.drums.vary != null ? G.drums.vary : 0.5 }; if (G.drums.lanes) spec.drums.lanes = JSON.parse(JSON.stringify(G.drums.lanes));
  G.drums.main.forEach((v, i) => { const p = {}; for (const [k, x] of Object.entries(v)) { if (k === 'p') p.perc = x.map(([kind, note, steps]) => (note ? { kind, note, steps } : { kind, steps })); else if (SPEC_LANE_OF[k]) p[SPEC_LANE_OF[k]] = x; } spec.drums.patterns[dn[i]] = p; });
  spec.bass = { patterns: {}, gate: G.bass.gate, vary: G.bass.vary != null ? G.bass.vary : 0.4 }; G.bass.pats.forEach((p, i) => { spec.bass.patterns[bn[i]] = p.n; if (p.acc && /x/.test(p.acc)) (spec.bass.accents || (spec.bass.accents = {}))[bn[i]] = p.acc; });
  spec.chords = { role: G.chords.role }; if (G.chords.rhythm) spec.chords.rhythm = G.chords.rhythm.slice(); if (G.chords.gate) spec.chords.gate = G.chords.gate.slice(); if (G.chords.range) spec.chords.range = G.chords.range.slice(); for (const k of ['len', 'sparse', 'voices']) if (G.chords[k] != null) spec.chords[k] = G.chords[k];
  if (G.lead) { spec.lead = { role: G.lead.role, range: G.lead.range.slice() }; if (G.lead.rhythm) spec.lead.rhythm = G.lead.rhythm.slice(); } else spec.lead = { role: 'none' };
  const hasTypeDefault = (s) => s.layer === SPEC_DEFAULT_LAYER[s.type];
  spec.form = score.sections.map((s) => { const f = { section: s.type, bars: s.bars }; if (s.name && s.name !== s.type) f.name = s.name; if (!hasTypeDefault(s)) f.layer = s.layer === 'custom' ? undefined : s.layer;
    // melody text: written melodies are copied as written; a GENERATED hook is reproduced exactly by its seed (text cannot carry
    // its per-note dynamics or the octave doubling of the last drop), so it is only written out on request (opt.melody: true,
    // a lossy starting point for editing — forge export does this)
    const own = score.spec && score.spec.form && score.spec.form[score.sections.indexOf(s)]; if (s.pt && !(own && own.progression)) f.progression = s.pt.slice();
    if (own && own.melody && opt.melody !== false) f.melody = own.melody; else if (opt.melody === true && G.lead && G.lead.role === 'hook') { const mel = sectionMelody(score, s); if (mel) f.melody = mel; } return f; });
  // explicit layer objects (custom) cannot be named: copy them
  score.sections.forEach((s, i) => { if (s.layer === 'custom' && score.spec && score.spec.form && score.spec.form[i]) spec.form[i].layer = score.spec.form[i].layer; });
  spec.mix = { lufs: G.mix.lufs, verb: G.mix.verb, delay: G.mix.delay, sidechain: G.mix.sc, heat: G.mix.heat != null ? G.mix.heat : 1, punch: G.mix.punch != null ? G.mix.punch : 1 }; if (G.mix.echo != null) spec.mix.echo = G.mix.echo;
  if (score.spec && score.spec.sound) spec.sound = JSON.parse(JSON.stringify(score.spec.sound));
  if (score.spec && score.spec.form) score.spec.form.forEach((f, i) => { if (!spec.form[i]) return; for (const k of ['drums', 'bass', 'progression', 'barsPerChord', 'level']) if (f[k] != null) spec.form[i][k] = f[k]; });
  return spec;
}
// the lead notes of one section as melody text, compressed to the shortest period that repeats (1, 2, 4, 8 or 16 bars)
function sectionMelody(score, sec) {
  const ev = score.ev, sw = Math.max(0, (score.contract || GENRE_BY_ID[score.meta.gid]).swing - 50) / 50; const bars = [];
  for (let b = 0; b < sec.bars; b++) bars.push([]);
  for (let i = 0; i < ev.n; i++) { if (ev.ch[i] !== 7) continue; const t = ev.t[i] - sec.bar0 * 16; if (t < -0.01 || t >= sec.bars * 16) continue;     const s0 = Math.floor(t + 1e-6), fr = t - s0; if (!(fr < 1e-3 || ((s0 & 1) && Math.abs(fr - sw) < 1e-3))) return null; // off the (swung) 16th grid: cannot be written as text
    const s = s0 % 16, b = Math.floor(s0 / 16); bars[b].push({ s, m: Math.round(ev.a[i]), len: Math.round(ev.d[i] / 0.92 * 1000) / 1000, acc: false, slide: !!(ev.f[i] & 1) }); }
  if (bars.every((b) => !b.length)) return null;
  const names = spellFor(score.meta.key, score.meta.mode); const txt = bars.map((b) => melodyToText([b], names)); for (const p of [1, 2, 4, 8, 16, 32]) { if (p > txt.length) break; if (txt.length % p === 0 || p >= txt.length) { let ok = true; for (let i = p; i < txt.length; i++) if (txt[i] !== txt[i % p]) { ok = false; break; } if (ok) return txt.slice(0, p).join(' | '); } }
  return txt.join(' | ');
}
