/* ===================== MUSIC THEORY =====================
   Roman-numeral progressions are parsed to semitone roots + qualities (explicit, never inferred): uppercase = major,
   lowercase = minor, b/# accidentals, suffixes 7 maj7 m7 9 m9 add9 sus2 sus4 dim 5 6. Voicings are voice-led. */
const MODES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10], harmonic: [0, 2, 3, 5, 7, 8, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10], lydian: [0, 2, 4, 6, 7, 9, 11], phrygdom: [0, 1, 4, 5, 7, 8, 10] };
const RN = { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 };
function parseChord(tok) {
  const m = /^([b#]?)(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)(.*)$/.exec(tok); if (!m) return { root: 0, iv: [0, 4, 7], q: 'maj' };
  let root = RN[m[2].toUpperCase()] + (m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0); root = (root + 12) % 12;
  const minor = m[2] === m[2].toLowerCase(), suf = m[3];
  let iv = minor ? [0, 3, 7] : [0, 4, 7], q = minor ? 'min' : 'maj';
  if (suf === 'dim') { iv = [0, 3, 6]; q = 'dim'; }
  else if (suf === '5') { iv = [0, 7]; q = 'pow'; }
  else if (suf === 'sus2') { iv = [0, 2, 7]; q = 'sus2'; }
  else if (suf === 'sus4') { iv = [0, 5, 7]; q = 'sus4'; }
  else if (suf === '7') iv = minor ? [0, 3, 7, 10] : [0, 4, 7, 10];
  else if (suf === 'maj7') iv = [0, 4, 7, 11];
  else if (suf === 'm7') iv = [0, 3, 7, 10];
  else if (suf === '9') iv = minor ? [0, 3, 7, 10, 14] : [0, 4, 7, 10, 14];
  else if (suf === 'maj9') iv = [0, 4, 7, 11, 14];
  else if (suf === 'add9') iv = minor ? [0, 3, 7, 14] : [0, 4, 7, 14];
  else if (suf === '6') iv = minor ? [0, 3, 7, 9] : [0, 4, 7, 9];
  else if (suf === '11') iv = [0, 3, 7, 10, 14, 17];
  return { root, iv, q };
}
// expand a chord's intervals by the track's extension policy ('triad' | '7' | '9' | 'add9' | 'sus2' | 'power').
// With a scale (intervals from the tonic) the added 7th / 9th are DIATONIC: V in major gets a b7 (dominant), I gets maj7,
// a minor chord gets b7 only if the scale has it, a 9th is added only if it is in the scale (never a b9 by accident).
function extendChord(c, ext, sc) {
  if (c.iv.length > 3 || c.q === 'pow' || c.q === 'dim' || c.q === 'sus2' || c.q === 'sus4') return c.iv.slice();
  const min = c.q === 'min', third = min ? 3 : 4, inSc = (iv) => !sc || sc.includes((c.root + iv) % 12);
  const sev = () => (min ? (inSc(10) ? 10 : -1) : (inSc(11) && (!sc || !inSc(10)) ? 11 : inSc(10) && sc ? 10 : 11));
  const out = [0, third, 7];
  if (ext === '7' || ext === '9') { const s7 = sev(); if (s7 > 0) out.push(s7); }
  if ((ext === '9' || ext === 'add9') && inSc(14)) out.push(14);
  if (ext === 'sus2') return [0, 2, 7];
  if (ext === 'power') return [0, 7, 12];
  return out;
}
// voice-led voicing: choose the inversion / octave placement of the chord tones (pitch classes) inside [lo,hi]
// that moves least from the previous voicing; first chord: close position centred in range.
// open = 1 (pads, sustained chords): the candidates are drop-2 voicings (the second voice from the top dropped an octave —
// the spread of a string section or a played Rhodes, not a keyboard block) and, for 4+ tones, drop-2-and-4; close position is
// only the fallback when nothing open fits the range. Every candidate pays for low mud (a 4th or less under E3) and for a top
// voice that leaps (the line the ear follows should move by step).
function voiceLead(rootMidi, ivs, prev, lo, hi, nMax, open) {
  const pcs = ivs.map((x) => (rootMidi + x) % 12), uniq = [...new Set(pcs)].slice(0, nMax || 5);
  let best = null, bestCost = 1e9;
  const center = (lo + hi) / 2;
  const judge = (notes) => { if (notes[0] < lo || notes[notes.length - 1] > hi) return;
    let cost = 0;
    if (prev && prev.length) { for (const n of notes) { let d = 99; for (const p of prev) d = Math.min(d, Math.abs(n - p)); cost += d; } if (open) { const l = Math.abs(notes[notes.length - 1] - prev[prev.length - 1]); if (l > 2) cost += (l - 2) * 0.6; } }
    else cost = Math.abs((notes[0] + notes[notes.length - 1]) / 2 - center) * 2;
    if (open) for (let k = 1; k < notes.length; k++) if (notes[k] - notes[k - 1] <= 5 && notes[k - 1] < 52) cost += 6;
    if (cost < bestCost) { bestCost = cost; best = notes; } };
  for (let pass = open && uniq.length >= 3 ? 0 : 1; pass < 2 && !best; pass++)
    for (let inv = 0; inv < uniq.length; inv++) for (let base = lo - 24; base <= hi; base += 12) {
      const notes = []; let last = base - 1;
      for (let k = 0; k < uniq.length; k++) { const pc = uniq[(inv + k) % uniq.length]; let n = last + 1; while ((n % 12 + 12) % 12 !== pc) n++; notes.push(n); last = n; }
      if (pass === 1) { judge(notes); continue; }
      const m = notes.length, d2 = notes.slice(); d2[m - 2] -= 12; judge(d2.sort((x, y) => x - y));
      if (m >= 4) { const d24 = notes.slice(); d24[m - 2] -= 12; d24[m - 4] -= 12; judge(d24.sort((x, y) => x - y)); } }
  return best || uniq.map((pc) => lo + ((pc - lo % 12 + 12) % 12));
}
// nearest pitch with a given pitch class to a reference
function nearPc(pc, ref) { let n = ref - ((ref - pc) % 12 + 12) % 12; if (ref - n > 6) n += 12; return n; }
// scale helpers
function scaleNotes(key, mode) { return MODES[mode].map((x) => (key + x) % 12); }
function snapToScale(m, key, mode) { const sc = MODES[mode]; const rel = ((m - key) % 12 + 12) % 12; let best = 0, bd = 99; for (const s of sc) { const d = Math.abs(s - rel); if (d < bd) { bd = d; best = s; } } return m - rel + best; }
// rhythm DSL: 'X' 1.0, 'x' .8, 'o' .6, 'g' .35, other non-rest chars carry tokens (notes), '-' extends, '.' rest
const VEL = { X: 1, x: 0.82, o: 0.62, g: 0.38 };
function parsePat(s) { const out = []; for (let i = 0; i < s.length; i++) { const c = s[i]; if (c === '.' || c === ' ' || c === '-') continue; let len = 1; while (i + len < s.length && s[i + len] === '-') len++; out.push({ step: i, ch: c, vel: VEL[c] || 0.85, len }); } return out; }
const VOWEL_IDX = { a: 0, e: 1, i: 2, o: 3, u: 4 }, VOWEL_LIST = ['a', 'e', 'i', 'o', 'u'];
