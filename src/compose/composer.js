/* ===================== COMPOSER =====================
   Runs off the audio thread (main thread or a Worker). It turns a genre contract + seed into a complete SCORE:
   a struct-of-arrays event list in musical time (16th-note steps, swing and humanisation already applied), the
   section map, the sound kits and the mix targets. The audio thread only plays scores — it never composes, so a
   new track or a re-roll can never cause a dropout.
   Event fields: t (step, float) · ch · a (note / kind) · v (velocity) · d (length in steps) · f (flags) · x (brightness,
   0 = kit default) · y (aux: pan for hats/perc, vowel index for vox chops, LFO rate in beats for wobble basses).
   flags: bit0 slide, bit1 accent, bits 2..5 perc kind. */
const CH = { kick: 0, snare: 1, hats: 2, perc: 3, bass: 4, chords: 5, pad: 6, lead: 7, arp: 8, fx: 9, tex: 10, auto: 11 }; // 11: automation (not an audio channel)
const CH_NAMES = ['kick', 'snare', 'hats', 'perc', 'bass', 'chords', 'pad', 'lead', 'arp', 'fx', 'texture'];
const PERC_PAN = { tom: -0.25, conga: 0.5, bongo: -0.55, cowbell: 0.35, clave: -0.45, wood: 0.45, tamb: 0.6, timbale: -0.4, tick: 0.6, rim: 0.15, agogo: 0.4, guiro: -0.45, triangle: 0.55, djembe: -0.3, taiko: 0.1, maraca: 0.5, cajon: -0.1, surdo: -0.15, tabla: 0.35, udu: -0.35, frame: 0.2, snap: -0.5, temple: 0.45, cuica: -0.4, bell: 0.55, gong: 0, metal: -0.35, click: 0.6, zap: -0.5, blip: 0.4, sweep: 0, cabasa: 0.55, logdrum: -0.2 };
const HAT_KIND = { hc: 0, ho: 1, ride: 2, sh: 3, crash: 4, ped: 5 };
const FX_KIND = { riser: 0, impact: 1, down: 2, sweep: 3, snareup: 4, reverse: 5, crash: 6, zap: 7, rise: 8, bubbles: 9, swirl: 10, squelch: 11, laser: 12 };
// ear candy (v9): the small one-shots producers fly over a groove — zaps, squelches, bubbles, lasers, swirls (06_fx.js), in key
// and panned. Per family: the chance per bar in a drop (other sections scaled), the kinds with weights, and the chance of a swirl
// into each 8-bar phrase. Psytrance lives on them (measured on v8: 0.1 FX per bar in its drops, all of them transitions); the
// others get a few. Deterministic per bar, outside the random streams: nothing else in the track moves.
const EAR = { psy: { p: 0.55, kinds: [['zap', 3], ['squelch', 2], ['bubbles', 2], ['laser', 1.5], ['rise', 1]], swirl: 0.9 },
  techno: { p: 0.1, kinds: [['zap', 2], ['laser', 1], ['squelch', 1]], swirl: 0.35 }, hard: { p: 0.14, kinds: [['laser', 2], ['zap', 2]], swirl: 0.4 },
  bass: { p: 0.16, kinds: [['zap', 2], ['laser', 2], ['bubbles', 1]], swirl: 0.3 }, breaks: { p: 0.1, kinds: [['laser', 2], ['zap', 2]], swirl: 0.3 },
  trance: { p: 0.05, kinds: [['rise', 1], ['bubbles', 1]], swirl: 0.7 } };
const EAR_SEC = { drop: 1, groove: 0.8, break: 0.45, build: 0.6, intro: 0.3, outro: 0.35 }, EAR_LEN = { zap: 2.5, squelch: 2.5, bubbles: 4, laser: 2, rise: 3 }, EAR_AT = [6, 10, 11, 13, 14, 15, 3, 7];
const DROP_GAP = 2; // the half-beat of silence at the very end of a build, before the drop (in 16th-note steps)
// production layer per family (what a producer adds on top of the parts): crash on phrase starts, a reverse cymbal into the
// next phrase / section, the kick muted for the last beat before a 16-bar phrase ("the breath before the one")
const PROD = { house: { crash: 1, rev: 1, kickMute: 1 }, techno: { crash: 0.6, rev: 0.7, kickMute: 1 }, trance: { crash: 1, rev: 1, kickMute: 0 }, psy: { crash: 0.7, rev: 0.8, kickMute: 1 },
  dnb: { crash: 1, rev: 1 }, bass: { crash: 1, rev: 1 }, hiphop: { crash: 0.5, rev: 0.8 }, garage: { crash: 0.8, rev: 1 }, afro: { crash: 0.7, rev: 0.8, kickMute: 1 }, hard: { crash: 1, rev: 1 },
  pop: { crash: 1, rev: 1 }, breaks: { crash: 1, rev: 0.8 }, latin: { crash: 0.8, rev: 0.8 }, chill: { rev: 0.6 }, ambient: { rev: 0.5 } };
const TOM_FAM = new Set(['house', 'techno', 'afro', 'dnb', 'breaks', 'garage', 'latin', 'trance', 'pop', 'hard', 'psy']);
const TEX_KIND = { none: 0, vinyl: 1, air: 2, dark: 3, psyfx: 4, rain: 5 };

class ScoreBuilder {
  constructor() { this.n = 0; this.cap = 4096; this.alloc(this.cap); }
  alloc(c) { const o = this; const T = new Float64Array(c), C = new Uint8Array(c), A = new Float32Array(c), V = new Float32Array(c), D = new Float32Array(c), F = new Uint16Array(c), X = new Float32Array(c), Y = new Float32Array(c);
    if (o.t) { T.set(o.t); C.set(o.ch); A.set(o.a); V.set(o.v); D.set(o.d); F.set(o.f); X.set(o.x); Y.set(o.y); }
    o.t = T; o.ch = C; o.a = A; o.v = V; o.d = D; o.f = F; o.x = X; o.y = Y; o.cap = c; }
  push(t, ch, a, v, d, f, x, y) { if (this.n === this.cap) this.alloc(this.cap * 2); const i = this.n++; this.t[i] = Math.max(0, t); this.ch[i] = ch; this.a[i] = a; this.v[i] = clamp(v, 0, 1.5); this.d[i] = d; this.f[i] = f || 0; this.x[i] = x || 0; this.y[i] = y || 0; }
  finish() { // stable sort by time, then channel (kick before bass at the same instant)
    const n = this.n, idx = new Uint32Array(n); for (let i = 0; i < n; i++) idx[i] = i;
    const t = this.t, ch = this.ch; const arr = Array.from(idx); arr.sort((i, j) => (t[i] - t[j]) || (ch[i] - ch[j]) || (i - j));
    const out = { n, t: new Float64Array(n), ch: new Uint8Array(n), a: new Float32Array(n), v: new Float32Array(n), d: new Float32Array(n), f: new Uint16Array(n), x: new Float32Array(n), y: new Float32Array(n) };
    for (let k = 0; k < n; k++) { const i = arr[k]; out.t[k] = t[i]; out.ch[k] = ch[i]; out.a[k] = this.a[i]; out.v[k] = this.v[i]; out.d[k] = this.d[i]; out.f[k] = this.f[i]; out.x[k] = this.x[i]; out.y[k] = this.y[i]; }
    return out; }
}

// ---------- planning ----------
// mode choice: the mode (among the genre's) in which the chosen progression has the fewest out-of-scale chord tones
function chooseMode(modes, chords, ext, r) {
  let best = [], bc = 1e9;
  for (const m of modes) { const sc = MODES[m]; let c = 0; for (const ch of chords) for (const iv of extendChord(ch, ext, null)) if (!sc.includes((ch.root + iv) % 12)) c++;
    if (c < bc) { bc = c; best = [m]; } else if (c === bc) best.push(m); }
  return pick(r, best);
}
// kit jitter: each track gets its own sound inside the genre's envelope (tuning, decays, tone ±%)
const NO_JITTER = new Set(['model', 'kind', 'claps', 'voices', 'wave', 'vowel', 'lfoSync', 'oct', 'keytrack', 'ratio']);
function jitterKit(k, r, amt) { const o = {}; for (const key in k) { const v = k[key]; o[key] = (typeof v === 'number' && !NO_JITTER.has(key)) ? v * (1 + (r() * 2 - 1) * amt) : v; } return o; }
// tune the kick: if a key root / fifth lies within ±8 % of the kit's natural pitch, snap the body to it
function tuneKick(kick, key) { const f0 = kick.fEnd; let best = f0, bd = 0.08;
  for (const iv of [0, 7]) for (let m = 24; m < 48; m++) if (((m - key - iv) % 12 + 12) % 12 === 0) { const f = mtof(m), d = Math.abs(f / f0 - 1); if (d < bd) { bd = d; best = f; } }
  return Object.assign({}, kick, { fEnd: best }); }

const ROMAN = ['I', 'bII', 'II', 'bIII', 'III', 'IV', '#IV', 'V', 'bVI', 'VI', 'bVII', 'VII'];
function thirdSub(toks, mode) { const sc = MODES[mode] || MODES.minor, c = parseChord(toks[toks.length - 1]), prev = parseChord(toks[toks.length - 2]), d = sc.indexOf(c.root); if (d < 0 || c.q === 'pow') return null;
  for (const step of [5, 2]) { const nd = (d + step) % 7, root = sc[nd], third = (sc[(nd + 2) % 7] - root + 12) % 12, fifth = (sc[(nd + 4) % 7] - root + 12) % 12;
    if (fifth !== 7 || root === prev.root || root === parseChord(toks[0]).root) continue; const r = ROMAN[root]; return third === 3 ? r.replace(/[IV]+/, (x) => x.toLowerCase()) : r; }
  return null; }
// ---------- (v9.4) the form: a grammar, not a template ----------
// 9.3 had twelve fixed forms (one or two per genre style): every track of a genre told the same story at the same length (3.2–6.7
// minutes). Now a track's form is drawn from its style's grammar — how it opens (a DJ intro of drums, an atmosphere, straight into
// the groove), how many drops it has and how each one is reached (a breakdown and a build, a breakdown straight into the drop, a lift
// out of the groove, a false drop that teases the hook without kick and bass), what happens between them and how it ends — at the
// length asked for: Radio, Club (the default) or Extended. Seeded (its own stream: nothing else in the track moves); a written form
// or an explicit section list always wins.
const FORM_MIN = { club: [6, 8], deep: [6, 8], techno: [6, 8], garage: [5, 6.5], trance: [6.5, 8.5], hard: [5.5, 7], psy: [7, 9], dnb: [5, 6.5], bass: [3.5, 4.8], pop: [3.3, 4.5], chill: [3, 4.5], ambient: [4.5, 7] };
const FORM_LENGTHS = ['radio', 'club', 'extended'];
function formMinutes(style, len) { const m = FORM_MIN[style] || FORM_MIN.club; if (len === 'radio') return [Math.max(2.6, m[0] * 0.5), Math.max(3.2, m[1] * 0.56)]; if (len === 'extended') return [m[0] * 1.35, m[1] * 1.45]; return m; }
function makeForm(G, r, len) { const st = G.form, F = [], ch = (a) => a[Math.floor(r() * a.length) % a.length], add = (type, bars, layer, x) => F.push([type, bars, layer, x || null]);
  const nDrops = len === 'radio' ? (r() < 0.6 ? 1 : 2) : len === 'extended' ? (r() < 0.6 ? 3 : 2) : (r() < 0.65 ? 2 : r() < 0.6 ? 1 : 3);
  if (st === 'chill' || st === 'ambient') { const A = st === 'chill' ? ['chillA', 'chillB'] : ['ambA', 'ambB'], nSec = len === 'radio' ? 2 + Math.floor(r() * 3) : len === 'extended' ? 6 + Math.floor(r() * 4) : 3 + Math.floor(r() * 4); add('intro', ch([8, 16]), st === 'chill' ? 'intro' : 'ambA');
    for (let k = 0; k < nSec; k++) { if (k > 0 && r() < 0.25) add('break', 8, st === 'chill' ? 'break2' : 'ambA'); add('groove', ch(st === 'chill' ? [8, 16, 16, 24] : [16, 24, 32]), A[(k + (r() < 0.2 ? 1 : 0)) % 2]); }
    add('outro', ch([8, 16]), st === 'chill' ? 'outro' : 'ambA'); return F; }
  if (st === 'pop') { const rad = len === 'radio'; add('intro', 8, 'drums1'); if (r() < (rad ? 0.2 : 0.6)) add('intro', 8, 'intro'); const n = Math.max(2, nDrops + (len === 'extended' ? 1 : 0));
    for (let k = 0; k < n; k++) { if (k === n - 1 && n > 2 && r() < 0.6) add('break', 8, 'break2'); else { add('groove', ch(rad ? [8, 8, 8, 16] : [8, 16, 16]), 'verse'); if (r() < (rad ? 0.5 : 0.75)) add('build', ch(rad ? [4, 4, 8] : [4, 8]), 'build'); } add('drop', ch(rad ? [16, 16, 16, 24] : [16, 16, 24, 32]), 'drop'); }
    add('outro', ch(rad ? [8, 8, 8, 16] : [8, 16]), 'outro'); return F; } /* (a radio edit of a pop-length song is about 3 minutes: its sections are drawn short, or 60 draws rarely found one that short — measured, reggaeton) */
  // the opening
  const dj = st === 'club' || st === 'deep' || st === 'techno' || st === 'garage' || st === 'trance' || st === 'hard';
  const intro = st === 'bass' ? ch(['atmos', 'short']) : st === 'psy' ? 'dj1' : st === 'dnb' ? ch(['dj1', 'dj2']) : ch(['dj2', 'dj2', 'dj1', 'groovy']); // (a mixable track opens on its drums, and its first section after the intro is a groove: an Auto-DJ handover that landed on an intro without drums, or on a breakdown, sagged — measured)
  if (intro === 'dj2') { add('intro', ch([16, 16, 32]), 'drums0'); add('intro', ch([16, 16, 32]), 'drums1'); } else if (intro === 'dj1') add('intro', ch([16, 32, 32]), 'drums1');
  else if (intro === 'atmos') { add('intro', ch([8, 16]), 'intro'); if (st !== 'bass') add('intro', 16, 'drums1'); } else if (intro === 'short') add('intro', 8, 'intro'); else { add('intro', 16, 'drums1'); add('groove', ch([16, 32]), 'groove'); }
  if (intro !== 'groovy' && st !== 'bass' && (st === 'psy' || st === 'dnb' || dj || r() < 0.75)) add(st === 'dnb' ? 'intro' : 'groove', st === 'psy' ? ch([32, 48, 64]) : st === 'dnb' ? 16 : ch([16, 32, 32]), 'groove');
  // the drops, each reached its own way
  const ACTS = st === 'trance' || st === 'hard' ? [['classic', 5], ['long', 3], ['false', 2], ['direct', 1]] : st === 'psy' ? [['classic', 5], ['direct', 2], ['lift', 2], ['false', 1]] : st === 'dnb' ? [['classic', 4], ['direct', 3], ['false', 1]]
    : st === 'bass' ? [['classic', 5], ['direct', 2], ['false', 2]] : st === 'techno' ? [['classic', 3], ['direct', 3], ['peak', 3], ['lift', 2], ['false', 1]] : [['classic', 5], ['direct', 2], ['lift', 2], ['false', 2], ['peak', 1]];
  let prevAct = '';
  for (let k = 0; k < nDrops; k++) { let a = wpick(r, ACTS.map((x) => x[0]), ACTS.map((x) => (x[0] === prevAct ? x[1] * 0.25 : x[1]))); if (k === 0 && st === 'dnb' && r() < 0.6) a = 'firstdrop'; if (k === 0 && st === 'bass') a = r() < 0.6 ? 'firstdrop' : a; prevAct = a;
    const dropLen = st === 'bass' ? ch([16, 16, 32]) : st === 'psy' ? ch([32, 48, 64]) : st === 'dnb' ? ch([32, 32, 48, 64]) : ch([16, 32, 32, 48]);
    if (a === 'firstdrop') { add('build', ch([4, 8]), 'build'); add('drop', dropLen, 'drop'); }
    else if (a === 'classic') { add('break', st === 'bass' ? ch([8, 16]) : ch([8, 16, 16, 32]), k ? 'break' : 'break'); add('build', ch(st === 'trance' || st === 'hard' ? [8, 16, 16] : [4, 8, 8, 16]), 'build'); add('drop', dropLen, 'drop'); }
    else if (a === 'long') { add('break', ch([32, 48]), 'break'); add('build', ch([16, 32]), 'build'); add('drop', ch([32, 48]), 'drop'); }
    else if (a === 'direct') { add('break', ch([8, 16]), k ? 'break2' : 'break'); add('drop', dropLen, 'drop'); }
    else if (a === 'lift') { add('groove', ch([16, 32]), 'groove2'); add('build', ch([4, 8]), 'build'); add('drop', dropLen, 'drop'); }
    else if (a === 'peak') { add('break', 8, 'break2'); add('drop', ch([48, 64]), 'drop'); }
    else { add('break', ch([8, 16]), 'break'); add('build', 8, 'build'); add('groove', ch([4, 8]), 'tease', { fake: 1 }); add('build', ch([4, 8]), 'build'); add('drop', dropLen, 'drop'); } // the false drop
    if (k < nDrops - 1 && st !== 'bass' && r() < (st === 'psy' || st === 'techno' ? 0.6 : 0.4)) add('groove', ch([16, 32]), 'groove2'); }
  // the ending
  const down = r(); if (dj || (st === 'psy' && down < 0.7) || (st === 'dnb' && down < 0.5)) add('groove', ch([16, 16, 32]), 'groove2'); else if (st !== 'bass' && down < 0.85) add('break', 8, 'break2'); // (after the last drop the track comes down before its outro: the DJ mixes the next one in over a groove, not over the peak — measured on the Auto-DJ handovers)
  add('outro', st === 'bass' ? ch([8, 16]) : ch([16, 16, 24, 32]), 'outro'); return F; }
// (v9.4) more of the same track, live: one more act (how the track reaches a new drop) in the track's own style, or the playing
// section carried on. Returns [[type, bars, layer], …] — the caller splices it into the written form (src/ui/extend.js).
function extensionAct(G, r, how, cur) { const st = G.form, ch = (a) => a[Math.floor(r() * a.length) % a.length], F = [], add = (t, b, l) => F.push([t, b, l]);
  if (how === 'ride') { const t = cur && cur.type !== 'outro' && cur.type !== 'build' && cur.type !== 'intro' ? cur.type : 'groove', l = t === 'groove' ? 'groove2' : cur.layer || t; add(t, cur && cur.type === 'drop' ? ch([16, 32]) : 32, l); return F; }
  if (st === 'chill' || st === 'ambient') { const A = st === 'chill' ? ['chillA', 'chillB'] : ['ambA', 'ambB']; if (r() < 0.4) add('break', 8, st === 'chill' ? 'break2' : 'ambA'); add('groove', ch([16, 16, 24]), A[0]); add('groove', ch([16, 24]), A[1]); return F; }
  const dropLen = st === 'bass' ? ch([16, 32]) : st === 'psy' ? ch([32, 48]) : ch([32, 32, 48]), a = ch(['classic', 'classic', 'direct', 'lift', 'false']);
  if (cur && cur.type === 'drop' && r() < 0.5) add('groove', ch([16, 32]), 'groove2'); // out of a drop: a groove first, then the new breakdown
  if (a === 'classic') { add('break', ch([8, 16, 16]), 'break'); add('build', ch([4, 8, 8]), 'build'); add('drop', dropLen, 'drop'); }
  else if (a === 'direct') { add('break', ch([8, 16]), 'break2'); add('drop', dropLen, 'drop'); }
  else if (a === 'lift') { add('groove', 16, 'groove2'); add('build', ch([4, 8]), 'build'); add('drop', dropLen, 'drop'); }
  else { add('break', 8, 'break'); add('build', 8, 'build'); add('groove', ch([4, 8]), 'tease'); add('build', 4, 'build'); add('drop', dropLen, 'drop'); }
  return F; }
// a form at the asked length: drawn until one lands inside the style's range (or the closest of 60 draws)
function pickForm(G, gid, seed, bpm, len) { const r = rng(hashStr('form/' + gid + '/' + (seed >>> 0) + '/' + (len || 'club'))), [lo, hi] = formMinutes(G.form, len); let best = null, bd = 1e9;
  for (let k = 0; k < 60; k++) { const F = makeForm(G, r, len), bars = F.reduce((a, x) => a + x[1], 0), min = bars * 4 / bpm, d = min < lo ? lo - min : min > hi ? min - hi : 0; if (d < bd) { bd = d; best = F; } if (!d) break; }
  return best; }
// ---------- (v9.4) a second melodic voice, and a top percussion loop ----------
// In 9.3 only psytrance carried two lines at once (the riff and the acid answer); most genres had one melody or none. Now, where a
// genre has no arpeggio or hook of its own, a track may add LEAD 2 on that channel: an ANSWER that speaks in the lead's rests (call
// and response), a COUNTER line below it in longer notes, or — where the genre has no lead — a MOTIF over the drop. Its sound is
// drawn from the family's palette on an engine the lead does not use, and its level is set in context, about 6 dB under the line
// it accompanies. (Seeded per track, in its own stream; the same function runs for a new track and for a score, so they agree.)
const LEAD2_P = { house: 0.7, techno: 0.55, dnb: 0.6, bass: 0.6, hiphop: 0.65, garage: 0.7, afro: 0.7, latin: 0.65, hard: 0.5, pop: 0.6, breaks: 0.6, chill: 0.5 };
const L2_RH = { counter: ['x.......x.......', 'x...........x...', 'x.......x...x...', '....x.......x...', 'x.....x.........'], answer: ['........x..x.x..', '..........x.x.x.', '........x.x...x.', '.........x..x.x.', '......x.x...x...'],
  motif: ['x..x..x.........', '..x...x...x.....', 'x.....x...x.x...', '...x..x.....x...'] };
const L2_TAGS = { counter: ['soft', 'warm', 'round', 'pure', 'hollow', 'woody', 'organic', 'keys'], answer: ['plucked', 'bell', 'glassy', 'metallic', 'keys', 'fm'], motif: ['plucked', 'bell', 'keys', 'glassy', 'organic', 'bright'] };
function withLead2(G, gid, seed) { if (G.arp || G.hook || !G.chords || G.chords.role === 'none' || !LEAD2_P[G.family] || typeof SOUND_BANK === 'undefined') return G; const r = rng(hashStr('lead2/' + gid + '/' + (seed >>> 0)));
  if (r() >= LEAD2_P[G.family]) return G; const mode = G.lead && G.lead.role !== 'chop' ? (r() < 0.55 ? 'answer' : 'counter') : 'motif', P = PALETTE[G.family] || {}, lm = G.lead && G.lead.kit && G.lead.kit.model;
  const names = [...(P.arp || []).map((n) => ['arp', n]), ...(P.lead || []).map((n) => ['lead', n])].filter(([sl, n]) => { const e = SOUND_BANK[sl] && SOUND_BANK[sl][n]; return e && e.k && e.k.model !== lm && tagOk(gid, sl, n) && !(e.tags || []).some((t) => t === 'acid' || t === 'squelchy' || t === 'screechy' || t === 'huge'); });
  if (!names.length) return G; const w = names.map(([sl, n]) => ((SOUND_BANK[sl][n].tags || []).some((t) => L2_TAGS[mode].includes(t)) ? 3 : 1)); let x = r() * w.reduce((a, b) => a + b, 0), k = 0; while (k < names.length - 1 && (x -= w[k]) > 0) k++;
  const [sl, nm] = names[k], kit = varyKit(Object.assign({}, SOUND_BANK[sl][nm].k), (r() * 1e9) >>> 0); kit.aRel = Math.min(kit.aRel || 0.2, 0.6); // (a counter line must not smear into the next chord)
  const lo = G.lead && G.lead.range ? G.lead.range[0] : 62, hi = G.lead && G.lead.range ? G.lead.range[1] : 79, range = mode === 'counter' ? [lo - 10, lo + 5] : mode === 'answer' ? [lo, hi] : [62, 79];
  return Object.assign({}, G, { hook: { role: 'lead2', mode, lead2: 1, kit, preset: nm, range, rhythm: L2_RH[mode] } }); }
// the top loop: one or two light percussion voices on a euclidean rhythm, in the drops (and the groove after a drop)
const TOP_P = { house: 0.6, techno: 0.7, trance: 0.4, psy: 0.6, dnb: 0.5, bass: 0.4, hiphop: 0.5, garage: 0.6, afro: 0.7, latin: 0.6, hard: 0.4, pop: 0.4, breaks: 0.6, chill: 0.4, ambient: 0.2 };
const TOP_KINDS = { organic: ['cabasa', 'temple', 'snap', 'maraca', 'clave', 'bell', 'frame', 'udu'], machine: ['click', 'blip', 'cabasa', 'metal', 'tick', 'zap', 'temple', 'bell'] };
function euclid(k, n, rot) { const out = []; for (let i = 0; i < n; i++) out.push(((i + rot) * k) % n < k ? 'x' : '.'); return out.join(''); }
function topPerc(P) { const G = P.G, r = rng(hashStr('top/' + P.gid + '/' + P.seed)); if (r() >= (TOP_P[G.family] || 0)) return null; const K = TOP_KINDS[PERC_ORGANIC.has(G.family) ? 'organic' : 'machine'], n = r() < 0.4 ? 2 : 1, out = [];
  for (let i = 0; i < n; i++) { const kind = K[Math.floor(r() * K.length) % K.length]; if (out.some((x) => x[0] === kind)) continue; const len = r() < 0.5 ? 16 : 32, k = len === 16 ? [3, 5, 5, 7, 9][Math.floor(r() * 5)] : [5, 7, 9, 11, 13][Math.floor(r() * 5)];
    out.push([kind, euclid(k, len, Math.floor(r() * len)), 0.32 + 0.2 * r(), (r() * 2 - 1) * 0.7]); }
  return out.length ? out : null; }
function planTrack(gid, seed, o) {
  o = o || {}; let G = o.contract || GENRE_BY_ID[gid]; if (!G) throw new Error('unknown genre ' + gid); const J = o.jitter != null ? o.jitter : 1; if (!o.contract && o.lead2 !== false) G = withLead2(G, gid, seed);
  const r = rng((seed >>> 0) ^ hashStr(gid));
  // every random draw happens whether or not it is overridden: an override never shifts the stream (round-trip safety)
  const bpmR = Math.round(G.bpm[0] + r() * (G.bpm[1] - G.bpm[0])), bpm = o.bpm || bpmR;
  const progR = pick(r, G.harm.progs); let progToks = o.prog || progR;
  const modeR = chooseMode(G.modes, progR.map(parseChord), G.harm.ext, r); let mode = o.mode || modeR;
  const keyR = Math.floor(r() * 12), key = o.key != null ? o.key : keyR, moodR = r();
  // mood: the musical intent picks the harmony (mode, progression, chord colour, harmonic rhythm) — the person picks a feeling,
  // not a scale. Explicit progression / mode / extension / bars-per-chord in the score still win.
  const M = o.mood && MOODS[o.mood]; if (M) { const e = M.sets[Math.floor(moodR * M.sets.length)]; if (!o.prog) progToks = e.prog.slice(); if (!o.mode) mode = e.mode;
    G = Object.assign({}, G, { harm: Object.assign({}, G.harm, o.extFixed ? {} : { ext: M.ext }, o.hrFixed ? {} : { hr: M.hr, breakHr: M.breakHr || G.harm.breakHr }) }); }
  const prog = progToks.map(parseChord);
  const sections = []; let bar = 0;
  if (o.sections) for (const x of o.sections) { sections.push(Object.assign({}, x, { bar0: bar })); bar += x.bars; } // explicit form (score format)
  else if (o.formAlt != null || o.length === 'classic') { const alt = FORMS_ALT[G.form] && o.formAlt !== false && (o.formAlt === true || hashStr(gid + '/' + (seed >>> 0)) % 2 === 1); for (const [type, bars, layer] of (alt ? FORMS_ALT : FORMS)[G.form]) { sections.push({ type, bar0: bar, bars, layer }); bar += bars; } } // (the 9.3 forms, for comparison)
  else for (const [type, bars, layer, x] of pickForm(G, gid, seed, bpm, o.length)) { sections.push(Object.assign({ type, bar0: bar, bars, layer }, x || {})); bar += bars; }
  // the second drop is not a copy of the first: its turnaround (the last chord of the progression) is re-harmonised to the
  // diatonic chord a third below (it shares two tones, so the hook — fitted to chord tones bar by bar — stays consonant).
  // Generated forms only; a written form keeps exactly what it says (and the export writes this progression out).
  if (!o.sections) { const drops = sections.filter((x) => x.type === 'drop'); const sub = drops.length > 1 && progToks.length >= 3 ? thirdSub(progToks, mode) : null;
    if (sub) for (const d of drops.slice(1)) { d.progTok = progToks.slice(0, -1).concat(sub); d.prog = d.progTok.map(parseChord); } }
  const kits = {
    kick: (o.tuneKick === false ? (x) => x : (x) => tuneKick(x, key))(jitterKit(G.kit.kick, r, 0.06 * J)), snare: jitterKit(G.kit.snare, r, 0.05 * J), hats: jitterKit(G.kit.hats, r, 0.05 * J), perc: Object.assign({ gain: 1 }, G.kit.perc || {}, { pitch: (G.kit.perc && G.kit.perc.pitch || 1) * (1 + (r() - 0.5) * 0.1 * J) }),
    bass: jitterKit(G.bass.kit, r, 0.05 * J), chords: G.chords.kit ? jitterKit(G.chords.kit, r, 0.06 * J) : null, pad: G.pad ? jitterKit(G.pad.kit, r, 0.06 * J) : null,
    lead: G.lead ? jitterKit(G.lead.kit, r, 0.06 * J) : null, hook: G.hook ? jitterKit(G.hook.kit, r, 0.06 * J) : null, arp: G.arp ? jitterKit(G.arp.kit, r, 0.06 * J) : null };
  // bass register: the tonic sits in F1…E2, then the whole line drops an octave if its chord roots would average above C#2
  // (69 Hz). Measured: the same genre lost 15–20 dB of sub in keys D…E because the line lived at 73–92 Hz, an octave above
  // where a sub is felt; lines that average 27–34 (39–58 Hz) measured right. Relative motion is untouched (no new leaps).
  // (v9.2) and a floor: a bass note that would fall below the genre's floor is played an octave up (only that note: the line keeps its
  // register — moving the whole line up lost the sub). The floor is D1 (36.7 Hz), E1 (41.2 Hz) for psy, whose basses roll on the root
  // in E…G in practice. Measured on 9.1: psytrance spent 33 % of its drop time under 40 Hz (down to 27.5 Hz), prog-psy 43 %, progressive
  // house 32 % (18 % under 35 Hz), dub techno went down to 24.5 Hz — below what a club system gives back; the sub's energy fell out of
  // the mix (the master's 60–200 Hz band dropped 3 dB on those chords)
  const bassFloor = G.bass.floor || (G.family === 'psy' ? 28 : 26), bassLo = G.bass.lo || 29; let tonicBass = bassLo + ((key - bassLo) % 12 + 12) % 12;
  if (!G.bass.lo) { const avg = prog.reduce((a, c) => a + nearPc((key + c.root) % 12, tonicBass), 0) / prog.length; if (avg > 37) tonicBass -= 12; }
  return { G, gid, seed: seed >>> 0, bpm, key, mode, progToks, prog, sections, bars: bar, kits, tonicBass, bassFloor, swing: G.swing, mix: G.mix, texture: G.texture || 'none' };
}

// ---------- harmony timeline ----------
function hrFor(P, sec) { if (sec.hr) return sec.hr; const H = P.G.harm; return (sec.type === 'break' || sec.type === 'intro') && H.breakHr ? H.breakHr : H.hr; }
function progOf(P, sec) { return sec.prog || P.prog; } // a section may carry its own progression (score format)
// a build always ends on the progression's last chord (the turnaround) so the drop's first chord is a resolution, not a jump
// (measured: 10 of 133 builds ended elsewhere)
function chordIndexAt(P, sec, bar) { const n = progOf(P, sec).length; if (sec.type === 'build' && n > 1 && bar >= sec.bar0 + sec.bars - Math.min(2, hrFor(P, sec))) return n - 1; return Math.floor((bar - sec.bar0) / hrFor(P, sec)) % n; }
function sectionAt(P, bar) { for (const s of P.sections) if (bar >= s.bar0 && bar < s.bar0 + s.bars) return s; return P.sections[P.sections.length - 1]; }
function chordAt(P, bar) { const s = sectionAt(P, bar); return progOf(P, s)[chordIndexAt(P, s, bar)]; }
// the bars where a chord is voiced again: the first bar of a section, every harmonic-rhythm slot, and wherever the chord really changes
// (the forced turnaround of a build lands off the slot grid when the slot is longer than 2 bars)
function chordVoicedAt(P, sec, b) { return b === 0 || b % hrFor(P, sec) === 0 || chordIndexAt(P, sec, sec.bar0 + b) !== chordIndexAt(P, sec, sec.bar0 + b - 1); }
// how many bars the chord voiced at bar b of a section keeps sounding: until it is voiced again or the section ends. The sustained parts (pad,
// chord pad) used to hold for a whole harmonic-rhythm slot, so over the forced turnaround of a build the old chord rang on under the new
// one (a 4-bar slot in a 16-bar build: 2 bars of two chords at once), and the half-beat of silence before the drop was only cut for
// one-bar slots — the notes rang straight through it
function chordRunBars(P, sec, b) { let n = 1; while (b + n < sec.bars && !chordVoicedAt(P, sec, b + n)) n++; return n; }
// a sustained chord's length in steps: to the next voicing, minus the drop gap when it runs into the end of a build
// (v9.3) HARMONY ARTICULATION: where a new chord lands against the bar line. 9.2 put every sustained chord and pad on the
// downbeat, together with the kick, on every change — the same entrance all night. Now each change is placed ON the beat, PUSHED
// (a 16th or an 8th early, the chord arriving before the bar it belongs to — the house/garage anticipation), or LATE (an 8th or a
// dotted 8th after the kick, the techno/dub entrance; at the start of a quiet section, sometimes on beat 3). The odds belong to the
// genre family; the big-room / hardstyle / hard-techno contract keeps the chord with the kick most of the time. A push never
// lands in the half-beat of silence before a drop. Deterministic per track, bar and chord seed ("new chords" re-draws it).
const ART_W = { house: [0.3, 0.4, 0.3], garage: [0.25, 0.45, 0.3], afro: [0.3, 0.35, 0.35], latin: [0.35, 0.4, 0.25], pop: [0.35, 0.4, 0.25], techno: [0.25, 0.3, 0.45], trance: [0.42, 0.38, 0.2], psy: [0.42, 0.38, 0.2], hard: [0.7, 0.3, 0], dnb: [0.38, 0.42, 0.2], bass: [0.38, 0.42, 0.2], breaks: [0.38, 0.42, 0.2], hiphop: [0.38, 0.37, 0.25], chill: [0.35, 0.25, 0.4], ambient: [0.3, 0.25, 0.45] };
const ART_KICKLOCK = new Set(['big-room', 'hardstyle', 'hard-techno']);
function harmArt(P, bar, cseed) { const si = P.sections.findIndex((x) => bar >= x.bar0 && bar < x.bar0 + x.bars); if (si < 0) return 0; const sec = P.sections[si], start = bar === sec.bar0;
  const W = ART_KICKLOCK.has(P.gid) ? ART_W.hard : ART_W[P.G.family] || ART_W.house, r = rng(hashStr(P.seed + ':art:' + bar + ':' + cseed)), u = r(), v = r();
  const afterGap = start && si > 0 && P.sections[si - 1].type === 'build'; let on = W[0] * (start && !ART_KICKLOCK.has(P.gid) ? 0.7 : 1), push = afterGap ? 0 : W[1], late = W[2]; const sum = on + push + late;
  const x = u * sum; if (x < on) return 0; if (x < on + push) return v < 0.6 ? -2 : -1;
  const calm = sec.type === 'intro' || sec.type === 'break' || sec.type === 'outro'; return start && calm && v < 0.3 && chordRunBars(P, sec, 0) >= 2 ? 8 : v < 0.65 ? 2 : 3; }
function chordHoldSteps(P, sec, b) { const run = chordRunBars(P, sec, b); return Math.max(1, run * 16 - (sec.type === 'build' && b + run >= sec.bars ? (sec.bx ? sec.bx.gap : DROP_GAP) : sec.dx === 'gap' && b + run >= sec.bars ? DROP_GAP : 0)) - 0.25; }
// multi-bar lane strings: a lane of 32/48/64 steps plays its bars in turn (variation inside a pattern, Elektron-style)
function laneBar(str, b) { if (!str || str.length <= 16) return str; const n = Math.floor(str.length / 16); const k = ((b % n) + n) % n; return str.slice(k * 16, k * 16 + 16); }
function chordPc(P, c) { return (P.key + c.root) % 12; }
function chordIvs(P, c) { return extendChord(c, P.G.harm.ext, MODES[P.mode]); }
function chordTonesPc(P, c) { return chordIvs(P, c).map((iv) => (P.key + c.root + iv) % 12); }
// bass root: nearest octave of the chord root to the tonic (bass moves within ±6 semitones of home, never leaps an octave)
function nRootDiffers(P, c, n) { return chordPc(P, c) !== chordPc(P, n); }
function bassRoot(P, c) { const n = nearPc(chordPc(P, c), P.tonicBass), f = P.bassFloor || 26; return n < f ? n + 12 : n; } // (v9.2: never under the genre's floor)

// ---------- melodic helpers ----------
function degToMidi(P, d, base) { const sc = MODES[P.mode], o = Math.floor(d / 7), i = ((d % 7) + 7) % 7; return base + P.key + sc[i] + 12 * o; }
function midiToDeg(P, m, base) { const sc = MODES[P.mode]; let best = 0, bd = 99; for (let d = -14; d <= 84; d++) { const x = degToMidi(P, d, base); const dd = Math.abs(x - m); if (dd < bd) { bd = dd; best = d; } } return best; }
function isChordTone(pcs, m) { return pcs.includes(((m % 12) + 12) % 12); }
function isAvoid(pcs, m) { const pc = ((m % 12) + 12) % 12; for (const c of pcs) if ((pc - c + 12) % 12 === 1) return true; return false; } // b9 over a chord tone
function nearestChordTone(pcs, m) { let best = m, bd = 99; for (let d = -6; d <= 6; d++) { if (isChordTone(pcs, m + d) && Math.abs(d) < bd) { bd = Math.abs(d); best = m + d; } } return best; }
function fold(m, lo, hi) { while (m < lo) m += 12; while (m > hi) m -= 12; return m < lo ? lo : m; }

// ---------- part generators (each returns a reusable per-section "idea"; bars are rendered from ideas) ----------
// hook: an 8-bar PERIOD, the shape of a written top line (measured on the old 4-bar loop: half the drops repeated one
// 4-bar idea for 16 bars, the peak note came in the first quarter of the phrase, 82 % of bars started dead on the
// downbeat, velocities were two values). Now:
//   antecedent  bar 1 call (rhythm A) · bar 2 response (B) · bar 3 call, pushed (first note anticipated a 16th-pair
//               early) · bar 4 half cadence (open, on the fifth) with a pickup into bar 5
//   consequent  bar 5 the call sequenced a third UP (lift) · bar 6 a new response that holds the CLIMAX (highest note
//               of the period) · bar 7 the call again, pushed · bar 8 full cadence, home, held
// Melodic grammar in scale-degree space (survives any chord change): mostly steps, a leap is followed by a step back,
// no pitch more than twice in a row, ambitus ≤ an octave per walk. Strong beats and long notes become chord tones in
// the direction of the line; anticipated notes are fitted to the chord they anticipate. Velocity follows the contour
// (higher = stronger), downbeats and pushes are accented, phrase ends relax.
function makeHook(P, r, rhythms, lo, hi) {
  const A = pick(r, rhythms), others = rhythms.filter((x) => x !== A), B = others.length ? pick(r, others) : A;
  const on = (s) => { const out = []; for (let i = 0; i < 16; i++) if (s[i] !== '.' && s[i] !== '-') out.push(i); return out; };
  const loD = midiToDeg(P, lo, 0), hiD = midiToDeg(P, hi, 0), homeD = midiToDeg(P, nearPc(P.key, lo + (hi - lo) * 0.3), 0); // home in the lower third: headroom for the lift and the climax
  const walk = (start, n, arch) => { const out = []; let d = start, last = 0, rep = 0, peak = start, low = start;
    for (let i = 0; i < n; i++) { if (i) { const up = arch ? (i < n * 0.55 ? 0.68 : 0.3) : 0.5; let mv;
        if (Math.abs(last) >= 3) mv = -Math.sign(last) * (r() < 0.7 ? 1 : 2); // gap fill after a leap
        else { const size = wpick(r, [1, 2, 3, 4, 0], [46, 24, 13, 7, 10]); mv = size * (r() < up ? 1 : -1); }
        if (mv === 0 && rep >= 1) mv = r() < up ? 1 : -1;
        if (Math.max(peak, d + mv) - Math.min(low, d + mv) > 7) mv = -mv; // ambitus ≤ an octave (7 scale steps)
        d += mv; rep = mv === 0 ? rep + 1 : 0; last = mv; }
      if (d > hiD) d -= 2 * (d - hiD); if (d < loD) d += 2 * (loD - d); peak = Math.max(peak, d); low = Math.min(low, d); out.push(d); } return out; };
  const sA = on(A), sB = on(B), half = sA.filter((x) => x < 8), start = homeD + pick(r, [0, 2, 4, 2]);
  const dA = walk(start, sA.length, true), dB = walk(dA[dA.length - 1] + pick(r, [-1, 1, 2, -2]), sB.length, false);
  const dA3 = dA.slice(); if (dA3.length > 2) { dA3[dA3.length - 1] += pick(r, [-1, 1, 2]); } // the repeat is not a copy: its tail turns
  const cad = (endD) => { const x = dA.slice(0, half.length); if (x.length) x[x.length - 1] = endD; return x; };
  const lift = 2, dA5 = dA.map((d) => Math.min(hiD, d + lift));
  const climaxOf = () => { const before = Math.max(...dA, ...dB, ...dA3, ...dA5); let x = walk(dA5[dA5.length - 1] + pick(r, [1, 2]), sB.length, true); const mx = Math.max(...x);
    if (mx <= before) x = x.map((d) => d + Math.min(before + 1 - mx, Math.max(0, hiD - mx))); // bar 6 holds the highest note of the period
    const top = Math.max(...x); for (const arr of [dA, dB, dA3, dA5]) for (let i = 0; i < arr.length; i++) if (arr[i] >= top) arr[i] = top - 1; // nothing before it reaches it
    return x; };
  const build = (d2, d6, endHalf, endFull, cl) => { const ns = [], add = (bar, steps, ds) => steps.forEach((st, i) => ds[i] != null && ns.push({ s: bar * 16 + st, d: ds[i], cb: bar })); cl = cl || { a: dA, a3: dA3, a5: dA5 };
    const cadC = (endD) => { const x = cl.a.slice(0, half.length); if (x.length) x[x.length - 1] = endD; return x; };
    add(0, sA, cl.a); add(1, sB, d2); add(2, sA, cl.a3); add(3, half.length ? half : [0], half.length ? cadC(endHalf) : [endHalf]);
    add(4, sA, cl.a5); add(5, sB, d6); add(6, sA, cl.a); add(7, half.length ? half : [0], half.length ? cadC(endFull) : [endFull]);
    for (const bar of [2, 6]) { const f = ns.find((n) => n.s === bar * 16); if (f && !ns.some((n) => n.s === bar * 16 - 2 || n.s === bar * 16 - 1)) { f.s -= 2; f.push = 1; } } // anticipation: the call lands a 16th-pair early
    if (!ns.some((n) => n.s >= 60 && n.s < 64)) ns.push({ s: 62, d: dA5[0] - 1, cb: 4, pick: 1 }); // pickup into the lift
    ns.sort((a, b) => a.s - b.s);
    for (let i = 0; i < ns.length; i++) { const nx = i + 1 < ns.length ? ns[i + 1].s : 128, fin = ns[i].cb === 7 && i === ns.length - 1; ns[i].len = Math.max(1, Math.min(nx - ns[i].s, fin ? 12 : ns[i].cb === 3 && ns[i].s < 56 ? 8 : 4) - (ns[i].push ? 0 : 0)); }
    const b6 = ns.filter((n) => n.cb === 5); if (b6.length) { const t = Math.max(...b6.map((n) => n.d)); b6.find((n) => n.d === t).peak = 1; }
    const dmin = Math.min(...ns.map((n) => n.d)), dmax = Math.max(...ns.map((n) => n.d)), span = Math.max(1, dmax - dmin);
    for (const n of ns) n.v = Math.min(1, 0.74 + 0.18 * (n.d - dmin) / span + (n.s % 16 === 0 ? 0.05 : 0) + (n.push ? 0.06 : 0) - (n.pick ? 0.08 : 0)); return ns; };
  const notes = build(dB, climaxOf(), homeD + 4, homeD);
  // variation (alternate 8 bars of long drops): new answers, the half cadence rests on the third instead of the fifth
  const dBv = walk(dA[dA.length - 1] + pick(r, [2, -2, 3, -1]), sB.length, true), notesB = build(dBv, climaxOf(), homeD + 2, homeD);
  // (v9.2) EMOTION AND FLOW — measured on 9.1: 98 % of strong-beat notes were chord tones and every 8-bar period closed on the tonic,
  // so every phrase said the same full stop. Now (a) the first period of each 16 bars ends OPEN, on the third, and only the second
  // one comes home — a question and its answer at the scale of the phrase; (b) a third block for long drops: the call sequenced a
  // step higher with its own answer and climax, ending open (development: the drop goes somewhere instead of looping A B A B);
  // (c) suspensions: a few strong-beat notes are held a step above the chord tone and resolve down to it on the next note (the 9–8,
  // 4–3, 6–5 of written melody), never a minor ninth against the chord (see fitLine).
  const notesO = build(dB, climaxOf(), homeD + 4, homeD + 2);
  const shiftUp = (arr) => arr.map((d) => Math.min(hiD, d + 1)), cC = { a: shiftUp(dA), a3: shiftUp(dA3), a5: dA5.map((d) => Math.min(hiD, d + 1)) };
  const dBc = walk(cC.a[cC.a.length - 1] + pick(r, [1, -1, 2]), sB.length, true), dCc = walk(cC.a5[cC.a5.length - 1] + pick(r, [1, 2]), sB.length, true);
  { const top = Math.max(...dCc), lim = Math.max(...cC.a, ...dBc, ...cC.a3, ...cC.a5); if (top <= lim) for (let i = 0; i < dCc.length; i++) dCc[i] = Math.min(hiD, dCc[i] + (lim + 1 - top)); const t2 = Math.max(...dCc); for (const arr of [cC.a, dBc, cC.a3, cC.a5]) for (let i = 0; i < arr.length; i++) if (arr[i] >= t2) arr[i] = t2 - 1; }
  const notesC = build(dBc, dCc, homeD + 4, homeD + 4, cC);
  for (const L of [notes, notesB, notesO, notesC]) { let k = 0; for (let i = 0; i + 1 < L.length; i++) { const n = L[i], nx = L[i + 1]; if (n.s % 4 === 0 && !n.peak && !n.pick && !nx.peak && Math.abs(nx.d - n.d) <= 2 && Math.floor(nx.s / 16) === Math.floor(n.s / 16) && nx.s - n.s <= 4 && k < 2 && r() < 0.4) { n.sus = 1; nx.res = 1; k++; } } }
  // augmentation for breakdowns: the strong-beat skeleton of the period, held long (copies — never alias the main line)
  const aug = notes.filter((n) => (n.s % 4 === 0 || n.peak) && !n.pick).map((n) => ({ s: n.s, d: n.d, cb: n.cb, v: n.v * 0.92, len: 0, peak: n.peak }));
  for (let i = 0; i < aug.length; i++) aug[i].len = Math.max(3, Math.min((i + 1 < aug.length ? aug[i + 1].s : 128) - aug[i].s, 16));
  return { notes, notesB, notesO, notesC, aug, lo, hi };
}
// one bar of the 8-bar period → [{s, m, len, v}]. form: 0 main · 1 variation · 2 augmented (breaks, intros) ·
// 3 tease (the call every bar — builds) · 4 antecedent only, bars 5–8 silent (the groove before the drop hints, the drop answers)
// The whole line is fitted to the chords in one pass (chord tones on strong beats, in the direction of the line), then the
// climax rule is enforced on the RESULT: the peak of bar 6 is the highest pitch of the period and nothing else reaches it.
function fitLine(P, idea, line, chordPcsAt) { const out = []; let prevM = -1, prevD = null;
  let resD = null; for (const n of line) { const pcs = chordPcsAt(n.cb != null ? n.cb : Math.floor(n.s / 16)); let d = n.d, m = degToMidi(P, d, 0); const strong = n.s % 4 === 0 || n.len >= 3 || n.push;
    if (n.res && resD != null) { d = resD; m = degToMidi(P, d, 0); resD = null; } // the suspension's resolution: the chord tone a step under it
    else if (n.sus && (() => { const td = isChordTone(pcs, m) ? d : isChordTone(pcs, degToMidi(P, d - 1, 0)) ? d - 1 : null, sm = td == null ? 0 : degToMidi(P, td + 1, 0); if (td == null || isChordTone(pcs, sm) || isAvoid(pcs, sm) || sm > idea.hi) return false; d = td + 1; m = sm; resD = td; return true; })()) { /* a suspension: held a step above the chord tone it resolves to */ }
    else if (strong || isAvoid(pcs, m)) { resD = null; const dir = n.peak ? 1 : prevD == null ? 1 : Math.sign(n.d - prevD) || 1; let best = null;
      for (const step of [0, dir, -dir, 2 * dir, -2 * dir]) { const mm = degToMidi(P, d + step, 0); if (isChordTone(pcs, mm) && (mm !== prevM || step === 0 && !strong)) { best = d + step; break; } }
      if (best == null) for (const step of [0, dir, -dir, 2 * dir, -2 * dir]) { if (isChordTone(pcs, degToMidi(P, d + step, 0))) { best = d + step; break; } }
      if (best != null) { d = best; m = degToMidi(P, d, 0); } }
    while (m > idea.hi + 2) { d -= 7; m = degToMidi(P, d, 0); } while (m < idea.lo - 2) { d += 7; m = degToMidi(P, d, 0); }
    out.push({ s: n.s, d, m, len: n.len, v: n.v || 0.85, cb: n.cb, peak: n.peak, pcs }); prevM = m; prevD = n.d; }
  const pk = out.filter((x) => x.peak); if (pk.length) { const top = Math.max(...pk.map((x) => x.m));
    for (const x of out) if (!x.peak && x.m >= top) { const strong = x.s % 4 === 0 || x.len >= 3; // step down to the nearest fitting note under the peak
      for (let d = x.d - 1; d >= x.d - 8; d--) { const m = degToMidi(P, d, 0); if (m < top && !isAvoid(x.pcs, m) && (!strong || isChordTone(x.pcs, m))) { x.d = d; x.m = m; break; } } } }
  return out; }
// form 5: the main period ending open (on the third); 6: the development block (v9.2)
function renderHook(P, idea, barInPhrase, chordPcsAt, out, form) {
  out.length = 0; if (form === 4 && barInPhrase >= 4) return out;
  if (form === 3) { const call = idea.notes.filter((n) => n.cb === 0 && !n.pick); for (const x of fitLine(P, idea, call.map((n) => Object.assign({}, n, { cb: 0 })), () => chordPcsAt(barInPhrase))) out.push({ s: x.s, m: x.m, len: Math.min(x.len, 4), v: x.v }); return out; }
  const line = form === 1 ? idea.notesB : form === 2 ? idea.aug : form === 5 ? idea.notesO || idea.notes : form === 6 ? idea.notesC || idea.notesB : idea.notes; // (v9.2: 5 = the main period ending open, 6 = the development block)
  for (const x of fitLine(P, idea, line, chordPcsAt)) { const st = x.s - barInPhrase * 16; if (st >= 0 && st < 16) out.push({ s: st, m: x.m, len: x.len, v: x.v }); }
  return out;
}

// moods (harmony by intent). Emotional avoids the stock i–bVI–bIII–bVII / I–V–vi–IV loops: maj7 and add9 colour, borrowed
// chords, suspended resolutions, slower harmonic rhythm — the language of melodic house, emotional garage, film-score electronica.
const MOODS = {
  emotional: { ext: 'add9', hr: 2, breakHr: 4, sets: [{ mode: 'minor', prog: ['i9', 'bVImaj7', 'bIIImaj7', 'bVII6'] }, { mode: 'major', prog: ['IVmaj7', 'V6', 'iii7', 'vi9'] }, { mode: 'major', prog: ['vi9', 'IVmaj7', 'Iadd9', 'Vsus4'] }, { mode: 'dorian', prog: ['i9', 'bIIImaj7', 'IVadd9', 'bVIImaj7'] }, { mode: 'minor', prog: ['iv9', 'v7', 'bVImaj7', 'i9'] }] },
  deep: { ext: '9', hr: 2, sets: [{ mode: 'dorian', prog: ['i9', 'IV9'] }, { mode: 'dorian', prog: ['i7', 'bIIImaj7', 'iv7', 'bVII9'] }, { mode: 'minor', prog: ['i9', 'iv9', 'bVImaj7', 'v7'] }] },
  dreamy: { ext: 'add9', hr: 2, breakHr: 4, sets: [{ mode: 'lydian', prog: ['Imaj7', 'II'] }, { mode: 'major', prog: ['Imaj9', 'vi9', 'IVmaj7', 'Imaj7'] }, { mode: 'lydian', prog: ['Imaj7', 'iii7', 'IVmaj7', 'II'] }] },
  uplifting: { ext: 'add9', hr: 1, breakHr: 2, sets: [{ mode: 'major', prog: ['I', 'V6', 'vi9', 'IVadd9'] }, { mode: 'major', prog: ['IVadd9', 'I', 'Vsus4', 'vi'] }, { mode: 'mixolydian', prog: ['I', 'bVII', 'IV', 'I'] }] },
  dark: { ext: 'triad', hr: 2, sets: [{ mode: 'phrygian', prog: ['i', 'bII', 'i', 'bvii'] }, { mode: 'minor', prog: ['i', 'iv', 'i', 'bVI'] }, { mode: 'harmonic', prog: ['i', 'bVI', 'V', 'i'] }] },
  hypnotic: { ext: 'sus2', hr: 4, sets: [{ mode: 'minor', prog: ['i'] }, { mode: 'dorian', prog: ['i', 'bVII'] }, { mode: 'phrygian', prog: ['i', 'bII'] }] },
};

// ---------- part variation (Elektron-style probability, inside the genre's grammar) ----------
// The audit counted 2 drum patterns and 2–3 bass lines per genre: a long set hears the same bars for minutes. Each section
// gets its own variation of the written patterns, drawn from the part's own random stream (so "new drums" re-rolls only the
// drums), scaled by `vary` (score: drums.vary / bass.vary, 0 = exactly as written) and by the section (drops vary most,
// DJ intros and outros least). Rules: a written hit is never removed — only ghost notes come and go; the kick stays sacred
// in four-on-the-floor; bass changes never land on a kick step.
// human feel: where each part sits against the grid, in 16th-steps (+ = behind the beat). Measured practice of the styles:
// lo-fi / downtempo lay snare and keys back, house hats push ahead, garage hats drag, dnb snares sit on top. Every hit also
// gets a few ms of random spread (rh) — machines that breathe, without smearing the kick.
const FEEL_FAM = { house: { snare: 0.012, hats: -0.018, chords: 0.025 }, afro: { perc: 0.02, hats: -0.01, chords: 0.02 }, garage: { hats: 0.022, snare: 0.01, chords: 0.02 }, chill: { snare: 0.06, hats: 0.03, chords: 0.045 }, hiphop: { snare: 0.045, hats: 0.02 }, dnb: { snare: -0.015 }, latin: { perc: 0.015, chords: 0.015 }, pop: { snare: 0.008 }, breaks: { snare: 0.02, hats: 0.01 } };
const VARY_SEC = { drop: 1, groove: 0.7, build: 0.5, break: 0.5, intro: 0.25, outro: 0.25 };
function varyDrums(v, r, amt, four) { if (!(amt > 0)) return v; const o = Object.assign({}, v);
  for (const ln of ['hc', 'sh', 'ride']) { const s = v[ln]; if (!s) continue; const a = s.split('');
    for (let i = 0; i < a.length; i++) { if (a[i] === 'g' && r() < 0.25 * amt) a[i] = '.'; else if (a[i] === '.' && (i & 1) && r() < 0.16 * amt) a[i] = 'g'; }
    if (ln === 'hc' && r() < 0.3 * amt) { const i = a.length - 1 - (r() < 0.5 ? 1 : 0); if (a[i] !== '.' && a[i] !== '-') a[i] = 'r'; } o[ln] = a.join(''); } // a 32nd roll at the bar end
  if (v.s && r() < 0.4 * amt) { const a = v.s.split(''); const i = [7, 9, 15, 3, 11][Math.floor(r() * 5)] % a.length; if (a[i] === '.') a[i] = 'g'; o.s = a.join(''); } // a ghost snare
  if (!four && v.k && r() < 0.35 * amt) { const a = v.k.split(''), n = a.length, idx = []; for (let i = 0; i < n; i++) if (a[i] === '.' && a[(i + 1) % n] === '.' && a[(i + n - 1) % n] === '.' && i % 16 !== 4 && i % 16 !== 12) idx.push(i); if (idx.length) a[idx[Math.floor(r() * idx.length)]] = 'o'; o.k = a.join(''); } // a ghost kick in broken grooves
  if (v.p) o.p = v.p.map(([kind, note, pat]) => { const a = pat.split(''); if (r() < 0.5 * amt) { const i = Math.floor(r() * a.length); if (a[i] === '.') a[i] = 'g'; } for (let i = 0; i < a.length; i++) if (a[i] === 'g' && r() < 0.2 * amt) a[i] = '.'; return [kind, note, a.join('')]; });
  return o; }
// (v9.3) A TRACK'S OWN DRUM SKELETON. 9.2 played a genre's few written main patterns almost unchanged in every drop (45–85 % of
// the tracks of a genre shared their first drop bar). Each track now draws its own version once, from the drums seed: a closed-hat
// grid (the off-beat open hat and the genre's accents stay; a closed hat never lands where the open hat rings), one or two ghost
// snares, the open hat thinned or moved to the bar end, a syncopated kick in the broken genres (never on the backbeat), the
// percussion rotated or swapped for its neighbour. The written pattern stays the identity; this is the drummer's version of it.
const HAT_GRIDS = ['g...g...g...g...', 'g.g.g.g.g.g.g.g.', 'g..gg..gg..gg..g', 'gg.ggg.ggg.ggg.g', '.g.g.g.g.g.g.g.g', 'g.ggg.ggg.ggg.gg', 'x..g..x.g..g..x.', 'g.xgg.xgg.xgg.xg', 'ggxgggxgggxgggxg', '..x...x...x...x.', 'g.x..gx.g.x..gx.', '.g...g...g...g..', '...g...g...g...g', 'g..g..g.g..g..g.', 'gg...g..gg...g..', /* v9.4: more of a drummer's hands */ 'g.gxg.gxg.gxg.gx', 'x.g.x.g.x.g.x.gg', 'g..xg..xg..xg.xx', '.gxg.gxg.gxg.gxg', 'gxg.gxg.gxg.gxg.', 'g.g.gxg.g.g.gxgg'];
const PERC_NEIGHBOUR = { conga: 'bongo', bongo: 'conga', clave: 'rim', rim: 'clave', cowbell: 'agogo', agogo: 'cowbell', tamb: 'shaker', shaker: 'tamb', tom: 'conga' };
// (v9.4) the wider choice per genre family: a track may swap a percussion voice for one of these (its own instrument, same pattern)
const PERC_ALT = { organic: { conga: ['bongo', 'djembe', 'tabla', 'udu', 'frame'], bongo: ['conga', 'tabla', 'udu'], tom: ['conga', 'surdo', 'frame', 'logdrum'], clave: ['rim', 'temple', 'snap', 'wood'], wood: ['temple', 'clave'], cowbell: ['agogo', 'bell', 'cuica'], agogo: ['cowbell', 'bell'], tamb: ['shaker', 'cabasa', 'maraca'], timbale: ['cajon', 'frame'], triangle: ['bell'], djembe: ['conga', 'frame', 'udu'] },
  machine: { conga: ['bongo', 'blip', 'logdrum'], bongo: ['conga', 'blip'], tom: ['conga', 'zap', 'surdo'], clave: ['rim', 'click', 'blip', 'snap'], wood: ['click', 'temple'], cowbell: ['agogo', 'metal', 'bell'], agogo: ['cowbell', 'metal'], tick: ['click', 'blip'], tamb: ['shaker', 'cabasa'], triangle: ['bell', 'metal'], timbale: ['metal', 'zap'] } };
const PERC_ORGANIC = new Set(['afro', 'latin', 'chill', 'ambient', 'garage', 'house', 'hiphop']);
function skeletonize(v, r, four, fam, allowS) { const o = Object.assign({}, v), lanes16 = (str, f) => { const a = str.split(''); for (let i = 0; i < a.length; i++) a[i] = f(i % 16, a[i], i); return a.join(''); };
  const busy = (ln, i) => { const x = o[ln]; return !!x && x[i % x.length] != null && x[i % x.length] !== '.' && x[i % x.length] !== '-'; };
  if (o.ho && r() < 0.3) { const k = r(); o.ho = lanes16(o.ho, (j, c) => (c === '.' || c === '-' ? c : k < 0.5 ? (j % 8 === 6 ? c : '.') : (j === 14 ? c : '.'))); } // open hat on 2-and / 4-and only, or the bar end only
  if (o.hc && four && r() < 0.75) { const g = HAT_GRIDS[Math.floor(r() * HAT_GRIDS.length)]; o.hc = lanes16(o.hc, (j, c, i) => (busy('ho', i) ? '.' : g[j])); }
  else if (o.hc && r() < 0.75) { const a = o.hc.split(''), n = a.length; for (let i = 1; i < n; i += 2) if (a[i] === '.' && !busy('ho', i) && r() < 0.3) a[i] = 'g'; o.hc = a.join(''); } /* (v9.4: three broken grooves in four get the drummer's ghost hats — half of them played the written hat line note for note) */
  if (o.sh && r() < 0.4) { if (r() < 0.4) delete o.sh; else o.sh = lanes16(o.sh, (j, c) => (j % 4 === 3 ? '.' : c)); } // (no shaker at all, or a thinner one)
  if (o.s) { const n = Math.floor(r() * 3); const a = o.s.split(''); for (let k = 0; k < n; k++) { const pos = [7, 10, 15, 3, 13, 6, 9][Math.floor(r() * 7)]; if (!four && allowS && !allowS.has(pos)) continue; for (let i = pos; i < a.length; i += 16) if (a[i] === '.') a[i] = 'g'; } o.s = a.join(''); } // (a broken beat keeps its snare grammar: ghosts only where the genre's own patterns put snares)
  if (!four && o.k && r() < 0.6) { const a = o.k.split(''), n = a.length, hits = []; for (let i = 0; i < n; i++) if (a[i] !== '.' && a[i] !== '-' && i % 16 !== 0) hits.push(i);
    if (hits.length && r() < 0.5) { const i = hits[Math.floor(r() * hits.length)], j = i + (r() < 0.5 ? 1 : -1); if (j > 0 && j < n && a[j] === '.' && j % 16 !== 4 && j % 16 !== 12) { a[j] = a[i]; a[i] = '.'; } }
    else { const free = []; for (let i = 1; i < n; i++) if (a[i] === '.' && a[i - 1] === '.' && (i + 1 >= n || a[i + 1] === '.') && i % 16 !== 4 && i % 16 !== 12) free.push(i); if (free.length) a[free[Math.floor(r() * free.length)]] = 'o'; }
    o.k = a.join(''); }
  if (o.p) o.p = o.p.map(([kind, note, pat]) => { let k = kind, pt = pat; if (r() < 0.45) { const sh = [2, 4, 6, 8][Math.floor(r() * 4)], n = pt.length; pt = pt.slice(n - sh) + pt.slice(0, n - sh); } let nt = note; const alt = (PERC_ORGANIC.has(fam) ? PERC_ALT.organic : PERC_ALT.machine)[k], x = r(); if (x < 0.3 && PERC_NEIGHBOUR[k] && PERC_KINDS[PERC_NEIGHBOUR[k]] != null) k = PERC_NEIGHBOUR[k]; else if (x < 0.55 && alt) { const y = alt[Math.floor(r() * alt.length) % alt.length]; if (PERC_KINDS[y] != null || y === 'rim') { k = y; nt = 0; } } return [k, nt, pt]; }); // (another instrument plays at its own pitch)
  return o; }
// a phrase-end turn on one drum bar: the last beat changes the way a drummer or producer marks the 4th bar
function phraseTurn(v, r, four, amt) { const o = varyDrums(v, r, Math.min(1, amt), four), k = Math.floor(r() * 4);
  const set = (ln, i, ch) => { const s = o[ln]; if (!s) return; const a = s.split(''); const j = (a.length - 16) + i; if (j >= 0 && j < a.length && (a[j] === '.' || ch === 'r')) { a[j] = ch; o[ln] = a.join(''); } };
  if (k === 0 && o.hc) set('hc', 14 + Math.floor(r() * 2), 'r'); else if (k === 1) { if (o.ho) set('ho', 14, 'x'); else if (o.hc) set('hc', 15, 'r'); } else if (k === 2 && o.s) { set('s', 13, 'g'); set('s', 15, 'g'); } else if (!four && o.k) set('k', 14 + Math.floor(r() * 2), 'o'); else if (o.hc) set('hc', 15, 'r');
  if (o.p && r() < 0.6) o.p = o.p.map(([kind, note, pat]) => { const a = pat.split(''); const j = a.length - 1; if (a[j] === '.') a[j] = 'x'; return [kind, note, a.join('')]; });
  return o; }
const FLOW_ORDER = ['kick', 'hats', 'perc', 'snare', 'bass', 'pad', 'chords', 'lead', 'texture'];
function layerAtBar(L, prevL, entry, exit, b) { let o = null;
  for (const p in entry) if (b < entry[p]) { o = o || Object.assign({}, L); o[p] = 0; }
  for (const p in exit) if (b < exit[p]) { o = o || Object.assign({}, L); o[p] = prevL[p]; }
  return o || L; }
function varyBass(n, r, amt, kicks) { if (!(amt > 0)) return n; const a = n.split(''), L = a.length;
  for (let i = 0; i < L; i++) { const c = a[i]; if (c === '.' || c === '-') continue; const up = c.toUpperCase(), sl = c !== up;
    if (up === 'R' && i % 4 !== 0 && r() < 0.18 * amt) a[i] = sl ? 'o' : 'O'; else if (up === 'R' && i % 4 !== 0 && r() < 0.07 * amt) a[i] = sl ? 'f' : 'F';
    if (i + 1 < L && a[i + 1] !== '.' && a[i + 1] !== '-' && r() < 0.1 * amt) a[i + 1] = a[i + 1].toLowerCase(); }
  for (const i of [L - 1, L - 2, L - 3]) if (a[i] === '.' && !kicks.has(i % 16) && a[i - 1] !== '-' && r() < 0.35 * amt) { a[i] = 'A'; break; } // a pickup into the next bar
  return a.join(''); }

// ---------- automation: the knob-riding a producer does (the audit found none at all) ----------
// Each section writes ramps for the synths' filter (octaves around the kit's cutoff) and resonance. Generic arc for every
// genre: breaks start dark and open toward the build, builds open everything, drops land fully open, grooves breathe. Then
// the families that live on automation get their signature moves: psy (16-bar lead and bass sweeps, resonance riding),
// acid / techno sequences (the 32-bar 303 tweak), dub techno (the slow chord filter), trance / progressive (the pad bloom).
const EDIT_FAM = new Set(['dnb', 'breaks']), BREAK_EDITS = [['x...', '..xg'], ['..x.', 'x..x'], ['x.x.', '.x.x'], ['....', 'xgxx'], ['.x..', 'x.gx']];
const AUTO_SLOT = { bass: 0, chords: 1, pad: 2, lead: 3, arp: 4 };
const AUTO_FAM = { psytrance: 'psy', acid: 'acid', techno: 'acid', 'hard-techno': 'acid', 'dub-techno': 'dub', trance: 'bloom', 'progressive-house': 'bloom', 'melodic-techno': 'bloom', house: 'filter', 'deep-house': 'filter', 'nu-disco': 'filter', 'tech-house': 'filter' };
function writeAuto(G, sec, S) { const t0 = sec.bar0 * 16, B = sec.bars * 16, has = { bass: !!G.bass, chords: G.chords.role !== 'none' && !!G.chords.kit, pad: !!G.pad, lead: !!G.lead, arp: !!(G.arp || G.hook) };
  const A = (slot, param, atBars, value, overBars) => { if (has[slot] && atBars * 16 < B) S.push(t0 + atBars * 16, CH.auto, AUTO_SLOT[slot], value, Math.max(0.5, overBars * 16), param, 0, 0); };
  const tone = ['chords', 'pad', 'lead', 'arp'], fam = AUTO_FAM[G.id], half = sec.bars / 2;
  if (sec.type === 'break') { for (const k of ['chords', 'pad']) { A(k, 0, 0, -1.3, 2); A(k, 0, half, 0, half); } A('lead', 0, 0, -0.6, 2); A('lead', 0, half, 0, half); }
  else if (sec.type === 'build') { for (const k of tone) { A(k, 0, 0, -0.5, 1); A(k, 0, 1, 0.45, sec.bars - 1); A(k, 1, 0, 0.12, sec.bars); } A('bass', 0, 0, -0.8, sec.bars); }
  else if (sec.type === 'drop') { for (const k of [...tone, 'bass']) { A(k, 0, 0, 0, 0.03); A(k, 1, 0, 0, 0.03); } }
  else if (sec.type === 'groove' || sec.type === 'intro' || sec.type === 'outro') { for (const k of tone) A(k, 1, 0, 0, 1); if (sec.bars >= 16 && fam !== 'filter') for (let b = 0; b < sec.bars; b += 16) { A('chords', 0, b, -0.7, 2); A('chords', 0, b + 2, 0, 14); } }
  // filter house: the loop lives behind a low-pass that opens over the phrase (closed, resonant, then breathing open), dips
  // again every 16 bars; in the drop it only breathes at the phrase end — the oldest trick in the genre, done on the grid
  if (fam === 'filter' && (sec.type === 'groove' || sec.type === 'intro')) for (let b = 0; b < sec.bars; b += 16) { A('chords', 0, b, -1.7, 1); A('chords', 0, b + 1, 0, 11); A('chords', 1, b, 0.22, 1); A('chords', 1, b + 8, 0, 8); A('bass', 0, b, -0.5, 1); A('bass', 0, b + 1, 0, 7); }
  if (fam === 'filter' && sec.type === 'drop') for (let b = 14; b < sec.bars; b += 16) { A('chords', 0, b, -0.9, 1.5); A('chords', 0, b + 1.5, 0, 0.5); }
  if (fam === 'psy' && (sec.type === 'drop' || sec.type === 'groove')) for (let b = 16; b < sec.bars; b += 32) { A('bass', 1, b, 0.16, 8); A('bass', 1, b + 8, 0, 8); } // the rolling bass twists (resonance) every other 16 bars
  if (fam === 'psy' && (sec.type === 'drop' || sec.type === 'groove')) for (let b = 0; b < sec.bars; b += 16) { A('lead', 0, b, -1.4, 1); A('lead', 0, b + 1, 0.8, 7); A('lead', 0, b + 8, -0.9, 8); A('lead', 1, b, 0, 1); A('lead', 1, b + 4, 0.28, 4); A('lead', 1, b + 8, 0.05, 8); A('bass', 0, b, -0.3, 4); A('bass', 0, b + 12, 0.35, 4); }
  if (fam === 'acid' && (sec.type === 'drop' || sec.type === 'groove')) for (let b = 0; b < sec.bars; b += 32) { A('lead', 0, b, -1.6, 1); A('lead', 0, b + 1, 0.6, 15); A('lead', 0, b + 16, -1, 16); A('lead', 1, b, 0, 1); A('lead', 1, b + 8, 0.3, 8); A('lead', 1, b + 20, 0.1, 12); }
  if (fam === 'dub' && sec.type !== 'build') for (let b = 0; b < sec.bars; b += 16) { A('chords', 0, b, -1, 1); A('chords', 0, b + 1, 0.3, 7); A('chords', 0, b + 8, -1, 8); }
  if (fam === 'bloom' && sec.type === 'break') { A('pad', 0, 0, -1.8, 1); A('pad', 0, 1, 0.3, sec.bars - 1); A('pad', 1, 0, 0.18, sec.bars); }
}

// ---------- motion: the effects as part of the arrangement (v7) ----------
// Each track draws its own PRODUCTION STYLE (seeded, weighted by family): which delay division and which harmonic interval its
// echoes climb by, whether its drums ring through the chord resonator, whether its breaks shimmer, how its builds end (a snare
// roll, a beat repeat, a tape stop, a filter rise into silence), and how the filter LFOs are played. Then every section writes
// the moves: delay throws on phrase ends, harmonic resonance rising through builds, shimmering pads in breaks, filter-LFO play
// whose rate and depth evolve through the track — so the same genre never moves the same way twice, and nothing is thrown in
// at random: every move lands on the grid, in the key, at a point of the form where producers use it.
const MP = { echoLead: 0, echoArp: 1, echoChords: 2, echoPerc: 3, echoFb: 4, echoDiv: 5, echoPitch: 6, echoLfo: 7, resDrums: 8, resMusic: 9, resDecay: 10, shimPad: 11, shimLead: 12, repeat: 13, tape: 14, shift: 15, shiftFb: 16, posLead: 17, posChords: 18, posPad: 19, posArp: 20, posBass: 21 };
const MOTION_FAM = { // [echo divisions], [echo intervals], resonator p, shimmer p, shifter p, [build endings + weights], LFO play p
  house: [[0, 2, 0], [0, 0, 2], 0.25, 0.3, 0, [['roll', 4], ['filter', 3], ['repeat', 2], ['silence', 1]], 0.8],
  techno: [[0, 3, 0], [0, 4, 0], 0.6, 0.15, 0.35, [['filter', 4], ['repeat', 3], ['roll', 2], ['silence', 1]], 0.9],
  trance: [[0, 0, 3], [1, 2, 1], 0.3, 0.7, 0.1, [['roll', 5], ['repeat', 3], ['silence', 1]], 0.6],
  psy: [[0, 6, 1], [1, 2, 3], 0.7, 0.3, 0.6, [['repeat', 4], ['tape', 2], ['filter', 2], ['roll', 1]], 0.9],
  dnb: [[0, 3, 1], [0, 4, 1], 0.35, 0.4, 0.2, [['repeat', 3], ['roll', 3], ['tape', 2], ['silence', 1]], 0.6],
  bass: [[1, 0, 6], [4, 0, 2], 0.3, 0.2, 0.5, [['repeat', 4], ['tape', 3], ['silence', 2]], 0.8],
  hiphop: [[0, 2, 7], [0, 4, 1], 0.2, 0.3, 0.1, [['tape', 4], ['repeat', 3], ['silence', 2]], 0.4],
  garage: [[0, 7, 2], [0, 1, 2], 0.3, 0.3, 0, [['repeat', 3], ['filter', 3], ['roll', 2]], 0.6],
  afro: [[0, 2, 3], [0, 2, 1], 0.5, 0.3, 0, [['filter', 3], ['roll', 2], ['silence', 2]], 0.6],
  latin: [[0, 2, 1], [0, 2, 0], 0.2, 0.2, 0, [['repeat', 3], ['roll', 3], ['tape', 1]], 0.5],
  hard: [[0, 1, 0], [0, 4, 1], 0.2, 0.4, 0.3, [['roll', 4], ['repeat', 4], ['silence', 1]], 0.6],
  pop: [[0, 2, 7], [1, 2, 0], 0.3, 0.6, 0.1, [['repeat', 3], ['roll', 3], ['tape', 1]], 0.6],
  breaks: [[0, 1, 3], [0, 4, 2], 0.4, 0.2, 0.3, [['repeat', 3], ['tape', 2], ['roll', 2]], 0.7],
  chill: [[2, 3, 0], [1, 2, 0], 0.5, 0.8, 0, [['filter', 3], ['silence', 2]], 0.5],
  ambient: [[3, 2, 5], [1, 2, 3], 0.6, 0.95, 0.1, [['filter', 3], ['silence', 1]], 0.4],
};
function motionStyle(P) { const F = MOTION_FAM[P.G.family] || MOTION_FAM.house, r = rng(hashStr('motion/' + P.gid + '/' + P.seed));
  const throwPart = P.G.lead && P.G.lead.role !== 'chop' ? (r() < 0.75 ? 'lead' : 'chords') : (P.G.arp || P.G.hook) ? 'arp' : 'chords';
  return { div: pick(r, F[0]), pitch: pick(r, F[1]), res: r() < F[2], shim: r() < F[3], shift: r() < F[4], ends: F[5], lfo: r() < F[6], lfoBase: pick(r, [4, 2, 8]), throwPart, r,
    resPart: r() < 0.6 ? 'drums' : 'music', dub: P.G.id === 'dub-techno' || P.G.id === 'techno' && r() < 0.4 }; }
function writeMotion(P, sec, si, S, st, prevEnd) { const t0 = sec.bar0 * 16, B = sec.bars * 16, G = P.G, r = st.r, fam = G.family;
  const M = (id, atStep, v, ramp) => { if (atStep >= 0 && atStep < B + 0.01) S.push(t0 + atStep, CH.auto, 8 + MP[id], v, ramp || 0, 0, 0, 0); };
  const has = { lead: !!G.lead, arp: !!(G.arp || G.hook), chords: G.chords.role !== 'none' && !!G.chords.kit, pad: !!G.pad, bass: !!G.bass };
  const LFO = (slot, atStep, depth, rate, ramp) => { if (!has[slot] || atStep >= B) return; S.push(t0 + atStep, CH.auto, AUTO_SLOT[slot], depth, ramp || 0, 2, 0, 0); S.push(t0 + atStep, CH.auto, AUTO_SLOT[slot], rate, 0, 3, 0, 0); };
  const type = sec.type, echoKey = { lead: 'echoLead', arp: 'echoArp', chords: 'echoChords' }[st.throwPart];
  // section base: every send and unit returns to its resting value at the section line (nothing left hanging from before)
  const base = type === 'break' ? 0.22 : type === 'intro' || type === 'outro' ? 0.1 : type === 'groove' ? 0.1 : type === 'build' ? 0.12 : 0.06;
  M('echoDiv', 0, st.div); M('echoPitch', 0, type === 'break' || type === 'intro' || (st.pitch && type !== 'drop') ? st.pitch : 0); M('echoLfo', 0, st.dub ? 0.8 : type === 'break' ? 0.4 : 0.15);
  M('echoFb', 0, type === 'break' ? 0.55 : st.dub ? 0.62 : 0.42); M(echoKey, 0, base, 8); M('echoArp', 0, type === 'break' ? 0.18 : 0.05, 8); M('echoPerc', 0, st.dub ? 0.12 : 0, 8);
  if (st.dub && has.chords) M('echoChords', 0, type === 'drop' ? 0.28 : 0.38, 8);
  M('resDrums', 0, 0, 16); M('resMusic', 0, 0, 16); M('shimPad', 0, 0, 16); M('shimLead', 0, 0, 16); M('shift', 0, 0); M('shiftFb', 0, 0); M('repeat', 0, 0); M('tape', 0, 1);
  // delay throws: the last note of a phrase thrown into the echo (half the phrase ends, seeded) — the classic producer move
  if (type === 'drop' || type === 'groove' || type === 'break') for (let b = 7; b < sec.bars; b += 8) if (r() < (type === 'break' ? 0.7 : 0.5)) { const at = b * 16 + 12; M(echoKey, at, 0.75, 0.5); M('echoFb', at, Math.min(0.75, (type === 'break' ? 0.55 : 0.42) + 0.2), 0.5); M(echoKey, at + 4, base, 6); M('echoFb', at + 10, type === 'break' ? 0.55 : 0.42, 16); }
  // breaks: the pad shimmers up (an octave rising out of it), the resonator rings the percussion in the chord
  if (type === 'break') { if (st.shim && has.pad) { M('shimPad', 0, 0.05, 1); M('shimPad', 16, 0.32, B - 32); } else if (st.shim && has.chords) { M('shimPad', 0, 0.2, B - 16); }
    if (st.shim && has.lead) M('shimLead', B / 2, 0.18, B / 2); if (st.res) { M('resDrums', 0, 0.12, 16); M('resDecay', 0, 0.75); }
    if (has.pad) LFO('pad', 0, 0.35, 16, 8); }
  // builds: harmony out of the noise — the drums (or the riser) feed the chord resonator harder and harder, the lead's table opens
  if (type === 'build') { if (st.res || fam === 'psy' || fam === 'trance') { M(st.resPart === 'drums' ? 'resDrums' : 'resMusic', 0, 0.05, 1); M(st.resPart === 'drums' ? 'resDrums' : 'resMusic', 16, 0.55, B - 32); M('resDecay', 0, 0.6); M('resDecay', 16, 0.92, B - 32); }
    M('posLead', 0, 0, 1); M('posLead', 16, 0.35, B - 32); M('posChords', 0, 0, 1); M('posChords', 16, 0.3, B - 32);
    if (st.lfo) { const sl = has.chords ? 'chords' : has.pad ? 'pad' : 'arp'; LFO(sl, 0, 0.25, 2, 4); LFO(sl, B / 2, 0.5, 1, 8); if (B >= 64) LFO(sl, B - 32, 0.6, 0.5, 4); }
    // the ending: weighted by family, never the same ending twice in a row in one track
    let end = wpick(r, st.ends.map((e) => e[0]), st.ends.map((e) => e[1])); if (end === prevEnd && st.ends.length > 1) end = wpick(r, st.ends.map((e) => e[0]), st.ends.map((e) => (e[0] === prevEnd ? 0 : e[1])));
    if (sec.bx) end = sec.bx.end; // (v9.4) the ending planTx chose for this build (the draws above still happen: the stream does not move)
    if (end === 'echo') { M(echoKey, B - 8, 0.7, 0.5); M('echoFb', B - 8, 0.74, 0.5); M('echoArp', B - 8, 0.45, 0.5); }
    if (end === 'repeat') { M('repeat', B - 8, 2); M('repeat', B - 4, 3); M('repeat', B - 2, 4); M('repeat', B - 0.05, 0); } // 1/8 → 1/16 → 1/32 on the last two beats
    else if (end === 'tape') { M('tape', B - 4, 0.02, 3.8); M('tape', B - 0.05, 1); }
    else if (end === 'filter') { M(echoKey, B - 4, 0.8, 0.5); M('echoFb', B - 4, 0.7, 0.5); }
    else if (end === 'silence') { M(echoKey, B - 8, 0.6, 1); M('echoArp', B - 8, 0.5, 1); }
    if (st.shift && end !== 'tape') { M('shift', B - 32, 0.3); M('shift', B - 30, 7, 28); M('shiftFb', B - 32, 0.45); M('shift', B - 0.05, 0); M('shiftFb', B - 0.05, 0); }
    st.lastEnd = end; }
  // drops and grooves: filter-LFO play whose rate and depth evolve through the section (8-bar steps), on the part that carries harmony
  if ((type === 'drop' || type === 'groove') && st.lfo) { const sl = fam === 'bass' || fam === 'psy' ? (has.bass ? 'bass' : 'chords') : has.chords ? 'chords' : has.pad ? 'pad' : 'arp';
    const rates = [st.lfoBase, st.lfoBase / 2, st.lfoBase, st.lfoBase / 4], depthMax = sl === 'bass' ? 0.35 : type === 'drop' ? 0.45 : 0.6;
    for (let b = 0, k = 0; b < sec.bars; b += 8, k++) { const on = type === 'groove' || k % 2 === 1; LFO(sl, b * 16, on ? depthMax * (0.6 + 0.4 * ((k % 3) / 2)) : 0, rates[k % rates.length], 16); } }
  // into a breakdown: the drop ends with an echo freeze (feedback up on the last beat, the tail carries into the break) or a tape stop
  if (type === 'drop' && sec.nextType === 'break') { let tape = (fam === 'bass' || fam === 'psy' || fam === 'hiphop') && r() < 0.5; const oe = sec.outEnd; if (oe) tape = oe === 'tape'; // (v9.4) planTx: echo freeze, tape stop, stutter or a dry cut
    if (oe === 'cut') { /* straight into the breakdown */ } else if (oe === 'stutter') { M('repeat', B - 4, 2); M('repeat', B - 2, 3); M('repeat', B - 0.05, 0); } else if (tape) { M('tape', B - 4, 0.02, 3.8); M('tape', B - 0.05, 1); } else { M(echoKey, B - 4, 0.85, 0.5); M('echoFb', B - 4, 0.78, 0.5); } }
  // the wavetable drifts: pads and chords move slowly through their tables over the section
  if (type !== 'build') { M('posPad', 0, 0, 2); M('posPad', 0, type === 'break' ? 0.35 : 0.15, B); M('posChords', 0, 0, 2); if (type === 'drop') M('posLead', 0, 0.1, 4); else M('posLead', 0, 0, 4); }
}
// ---------- (v9.4) how one section leads into the next ----------
// 9.3 put the same noise riser and the same accelerating snare roll into every build, and the same downlifter into every breakdown.
// Now each build is a combination of a drum shape (the classic roll, a late roll over a running groove, a kick roll, a clap build,
// a tom run, half-time drums, no drums at all), an effect (noise riser, pitched rise, noise sweep, reverse cymbal, swirl, zap — or
// none) and an ending (beat repeat, tape stop, echo throw, silence, a full beat of air, a straight cut). A track never repeats a
// combination, never uses the same shape or effect twice in a row, and puts the noise riser under at most half of its builds.
// Breakdowns are entered as many ways (downlifter, crash, noise sweep or a dry cut; the drop ending in an echo freeze, a tape stop or a
// filter fall), and a breakdown that goes straight into a drop ends with a fill, a reverse cymbal, a gap or nothing.
const TX_SHAPE = { house: [['roll', 3], ['lateroll', 3], ['clap', 3], ['drumless', 2], ['half', 1], ['tom', 1]], techno: [['kickroll', 4], ['lateroll', 3], ['drumless', 2], ['roll', 2]],
  trance: [['roll', 4], ['lateroll', 2], ['drumless', 2], ['half', 1]], psy: [['kickroll', 3], ['roll', 3], ['lateroll', 2], ['drumless', 1]], dnb: [['roll', 3], ['drumless', 3], ['tom', 2], ['half', 2]],
  bass: [['roll', 3], ['half', 3], ['drumless', 2], ['kickroll', 1]], hiphop: [['roll', 2], ['drumless', 3], ['half', 3]], garage: [['lateroll', 3], ['clap', 3], ['roll', 2], ['drumless', 1]],
  afro: [['tom', 4], ['lateroll', 3], ['drumless', 2], ['clap', 1]], latin: [['roll', 3], ['tom', 2], ['drumless', 2], ['clap', 1]], hard: [['roll', 4], ['kickroll', 3], ['drumless', 2]],
  pop: [['roll', 3], ['clap', 2], ['drumless', 2], ['half', 2]], breaks: [['roll', 3], ['tom', 2], ['drumless', 2], ['half', 1]], chill: [['drumless', 3], ['lateroll', 2]], ambient: [['drumless', 3], ['lateroll', 1]] };
const TX_FX = { psy: [['zap', 2], ['rise', 2], ['sweep', 2], ['reverse', 1], ['swirl', 1], ['none', 1]], bass: [['zap', 1], ['rise', 2], ['sweep', 2], ['reverse', 2], ['none', 2]], techno: [['sweep', 3], ['reverse', 2], ['rise', 1], ['none', 3], ['swirl', 1]],
  _: [['rise', 2], ['sweep', 2], ['reverse', 2], ['swirl', 1], ['none', 2]] };
const TX_END = ['repeat', 'tape', 'filter', 'silence', 'gap', 'cut', 'echo'];
function planTx(P) { const r = rng(hashStr('tx/' + P.gid + '/' + P.seed)), fam = P.G.family, SH = TX_SHAPE[fam] || TX_SHAPE.house, FXW = TX_FX[fam] || TX_FX._, ENDW = (MOTION_FAM[fam] || MOTION_FAM.house)[5];
  const builds = P.sections.filter((x) => x.type === 'build'), one = r() < 0.45, off = r() < 0.5 ? 0 : 1, risers = new Set(); // (every draw happens whatever the count: a longer form keeps the first builds as they were)
  if (builds.length === 1) { if (one) risers.add(0); } else for (let i = off; i < builds.length; i += 2) risers.add(i); // which builds keep the riser: every other one, never two in a row
  const used = new Set(); let prev = null;
  builds.forEach((sec, i) => { let bx = null;
    for (let t = 0; t < 40 && !bx; t++) { const shape = wpick(r, SH.map((x) => x[0]), SH.map((x) => (prev && x[0] === prev.shape ? 0 : x[1]))), fx = risers.has(i) ? 'riser' : wpick(r, FXW.map((x) => x[0]), FXW.map((x) => (prev && x[0] === prev.fx ? 0 : x[1])));
      const end = r() < 0.65 ? wpick(r, ENDW.map((e) => e[0]), ENDW.map((e) => (prev && e[0] === prev.end ? 0 : e[1]))) : wpick(r, TX_END, TX_END.map((e) => (prev && e === prev.end ? 0 : 1)));
      const key = shape + '/' + fx + '/' + end; if (!used.has(key) || t > 30) { used.add(key); bx = { shape: sec.bars < 2 && shape === 'lateroll' ? 'roll' : shape, fx, end, gap: end === 'gap' ? 4 : end === 'cut' ? 0 : DROP_GAP }; } }
    sec.bx = bx; prev = bx; });
  let pIx = null, pDx = null;
  P.sections.forEach((sec, si) => { const before = P.sections[si - 1], r = rng(hashStr('tx/' + P.gid + '/' + P.seed + '/' + si)); // (each section its own stream)
    if (sec.type === 'break' && before && before.type === 'drop') { const fx = wpick(r, ['down', 'crash', 'sweep', 'none'], [3, 2, 1, 2].map((w, k) => (pIx && ['down', 'crash', 'sweep', 'none'][k] === pIx.fx ? 0 : w)));
      const end = wpick(r, ['echo', 'tape', 'stutter', 'cut'], [3, fam === 'bass' || fam === 'psy' || fam === 'hiphop' ? 3 : 1, 2, 1].map((w, k) => (pIx && ['echo', 'tape', 'stutter', 'cut'][k] === pIx.end ? w * 0.2 : w))); sec.ix = pIx = { fx, end }; before.outEnd = end; }
    else if (sec.type === 'break' && si > 0) sec.ix = { fx: r() < 0.5 ? 'down' : 'none', end: null };
    if (sec.type === 'drop' && before && before.type !== 'build') { const k = wpick(r, ['fill', 'reverse', 'gap', 'none'], [3, 2, 2, 1].map((w, j) => (pDx && ['fill', 'reverse', 'gap', 'none'][j] === pDx ? 0 : w))); before.dx = pDx = k; } }); }
// ---------- the score ----------
function composeTrack(gid, seed, o) {
  const P = planTrack(gid, seed, o), G = P.G, S = new ScoreBuilder();
  const vs = o && o.vseed != null ? o.vseed >>> 0 : P.seed; // variation seed: same plan (tempo, key, form, sounds), new musical decisions
  // one random stream per part: "new drums" / "new bass" / "new chords" / "new melody" each re-draw ONE part and leave the
  // rest of the track exactly as it was (o.seeds: { drums, bass, chords }; the lead has its own leadSeed)
  const SD = (o && o.seeds) || {}, sd = (k, mul, add) => rng((((SD[k] != null ? SD[k] : vs) >>> 0) * mul + add) >>> 0);
  const rd = sd('drums', 7, 13), rb = sd('bass', 17, 29), rc = sd('chords', 23, 31), rh = rng(vs * 3 + 1); // rh: humanisation
  const rl = rng(((o && o.leadSeed != null ? o.leadSeed : vs) >>> 0) * 11 + 5); // melody ideas have their own stream: "new melody" leaves drums, bass and chords untouched
  const FEEL = G.feel || FEEL_FAM[G.family] || {}, fS = FEEL.snare || 0, fH = FEEL.hats || 0, fP = FEEL.perc || 0, fC = FEEL.chords || 0;
  const swingOff = Math.max(0, (G.swing - 50) / 50) * 2 * 0.5; // MPC swing: odd 16th of each 8th pair lands at S*2 steps → offset = 2S-1
  const sw = (step) => (step & 1 ? swingOff : 0);
  const rSk = sd('drums', 41, 43), allowS = new Set(); for (const m of G.drums.main) if (m.s) for (let i = 0; i < m.s.length; i++) if (m.s[i] !== '.' && m.s[i] !== '-') allowS.add(i % 16); const MAINS = G.userDrums ? G.drums.main : G.drums.main.map((v) => skeletonize(v, rSk, G.drums.main[0].k === 'X...X...X...X...', G.family, allowS)); // (patterns a person wrote, or saved in a set, are played as written) // this track's drum skeleton (drawn from the drums seed)
  const cseed = SD.chords != null ? SD.chords >>> 0 : vs, artC = new Map(), art = (bar) => { if (!artC.has(bar)) artC.set(bar, harmArt(P, bar, cseed)); return artC.get(bar); }, swA = (off) => off + sw((off + 16) & 15); // swA: an articulated start, swung like any other 16th
  // a sustained chord from bar b: its start offset, and its length up to where the next chord really starts (pushed or late)
  const artSpan = (sec, b, hold, prevOn) => { const bar = sec.bar0 + b, off = bar === 0 || (b === 0 && !prevOn) ? Math.max(0, art(bar)) : art(bar), /* (a part never anticipates into a section where it does not play) */ run = chordRunBars(P, sec, b), nb = bar + run, same = b + run < sec.bars, no = nb < P.bars ? art(nb) : 0;
    return [off, Math.max(1, hold - off + (no < 0 ? no : 0))]; }; // (a late next chord leaves a breath, it is not bridged: the bass has already moved)
  const four = G.drums.main[0].k === 'X...X...X...X...'; // four-on-the-floor contract → kick keeps running through the first part of builds
  const prevVoicing = { chords: null, pad: null };
  const voicing = (part, c, lo, hi, nMax, open) => { const v = voiceLead(chordPc(P, c), chordIvs(P, c), prevVoicing[part], lo, hi, nMax, open); prevVoicing[part] = v; return v; };
  let seqIdea = null, hookIdea = null, hook2Idea = null, chopIdea = null, riffIdea = null, seq2Idea = null, lastSecType = '';
  const dropCount = P.sections.filter((x) => x.type === 'drop').length, lastDrop = P.sections.map((x) => x.type).lastIndexOf('drop'); let stabPushed = false;
  const patD = new Int8Array(P.bars).fill(-1), patB = new Int8Array(P.bars).fill(-1), percBySec = []; // which named pattern plays in every bar (the editor highlights it)
  const tmp = [], leadMask = new Uint8Array(16), mst = motionStyle(P), TOP = o && o.top === false ? null : topPerc(P); planTx(P);

  for (let si = 0; si < P.sections.length; si++) {
    const sec = P.sections[si], next = P.sections[si + 1], isLastSec = si === P.sections.length - 1; let L = sec.L || LAYERS[sec.layer] || LAYERS.groove;
    if (!sec.L && G.only) for (const part in G.only) if ((L[part] || 0) > 0 && !G.only[part].includes(sec.type)) { L = Object.assign({}, L); L[part] = 0; } // a part the genre keeps to some sections (psy: the pad only in intros, breakdowns and builds)
    const nVar = G.drums.main.length;
    // section-level decisions
    const percOn = (G.drums.main.some((m) => m.p)) && rd() < (L.perc || 0) + 0.15; percBySec.push(percOn);
    const vAmt = VARY_SEC[sec.type] ?? 0.5, dvA = (G.drums.vary != null ? G.drums.vary : 0.5) * (o && o.complexity != null ? 0.3 + 1.4 * clamp(o.complexity, 0, 1) : 1), /* (v9.3) the Groove map's Complexity: how far the drums stray from the written bar */ bvA = G.bass && G.bass.vary != null ? G.bass.vary : 0.4;
    const dMut = [0, 1].map(() => MAINS.map((v) => varyDrums(v, rd, dvA * vAmt, four))); // two variation sets per section (second half of long sections)
    const kickUnion = new Set(); for (const v of MAINS) if (v.k) parsePat(v.k).forEach((e) => kickUnion.add(e.step % 16));
    const bMut = G.bass ? [0, 1].map(() => G.bass.pats.map((p) => varyBass(p.n, rb, bvA * vAmt, kickUnion))) : null;
    // phrase shape (measured before: every bar of a 16-bar half-section played the SAME drum and bass bar, only fills broke
    // it): bar 2 of every 4 gets a light answer, bar 4 a phrase-end turn (hat roll / open hat / ghost snare / pickup kick /
    // percussion accent; a bass pickup). Own random stream per section: the other streams do not move.
    const rt = rng(hashStr(P.seed + '/phrase/' + si + '/' + ((o && o.seeds && o.seeds.drums) || 0)) ^ (vs >>> 0)), turnAmt = vAmt * (0.6 + dvA);
    const dTwo = dMut.map((set) => set.map((v) => varyDrums(v, rt, turnAmt * 0.6, four))), dTail = dMut.map((set) => set.map((v) => phraseTurn(v, rt, four, turnAmt)));
    const bTail = G.bass ? bMut.map((set) => set.map((n) => varyBass(n, rt, Math.min(1, bvA * vAmt * 1.6 + 0.2), kickUnion))) : null;
    const bassPatAuto = sec.type === 'drop' ? Math.min(G.bass.pats.length - 1, 1 + Math.floor(rb() * (G.bass.pats.length - 1))) : 0; // always drawn: overrides never shift the random stream
    const chordRh = G.chords.rhythm ? [pick(rc, G.chords.rhythm), pick(rc, G.chords.rhythm)] : null;
    const gateRh = G.chords.gate ? [pick(rc, G.chords.gate), pick(rc, G.chords.gate)] : null;
    if (G.lead && (G.lead.role === 'hook') && !hookIdea) hookIdea = makeHook(P, rl, G.lead.rhythm, G.lead.range[0], G.lead.range[1]);
    if (G.lead && G.lead.role === 'riff' && !riffIdea) { riffIdea = makeRiff(rl, G.lead.styles); if (G.lead.theme) hookIdea = makeHook(P, rl, G.lead.theme, G.lead.range[0], G.lead.range[1]); } // the riff for the drops, the theme (its long-note period) for the breakdowns
    if (G.hook && G.hook.role === 'seq') { if (!seq2Idea) seq2Idea = makeSeq2(rl, G.hook.rhythm); }
    else if (G.hook && !hook2Idea) hook2Idea = makeHook(P, rl, G.hook.rhythm, G.hook.range[0], G.hook.range[1]);
    if (G.lead && G.lead.role === 'seq' && (!seqIdea || rl() < 0.35)) seqIdea = makeSeq2(rl, G.lead.rhythm); // two bars, a call and its answer (v9.1: one bar looped measured 9–24 repeats per drop)
    if (G.lead && G.lead.role === 'chop' && (!chopIdea || rl() < 0.4)) { chopIdea = makeChop(rl, G.lead.rhythm); chopIdea.g = chopLevel(G, P.bpm, chopIdea); }
    writeAuto(G, sec, S); sec.nextType = next ? next.type : null; if (o == null || o.motion !== false) writeMotion(P, sec, si, S, mst, mst.lastEnd);
    // texture + fx cues at section starts
    S.push(sec.bar0 * 16, CH.tex, TEX_KIND[P.texture] || 0, (L.texture || 0) * (sec.type === 'drop' ? 0.6 : 1), 16, 0, 0);
    if (sec.type === 'build') { const bx = sec.bx || { fx: 'riser', shape: 'roll', end: mst.lastEnd }, e0 = (sec.bar0 + sec.bars) * 16, note = 72 + ((P.key + 12) % 12) - (P.key > 5 ? 12 : 0); // (v9.4) planTx: this build's own effect
      if (bx.fx === 'riser') S.push(sec.bar0 * 16, CH.fx, FX_KIND.riser, bx.end === 'tape' || bx.end === 'repeat' ? 0.75 : 1, sec.bars * 16, 0, 0);
      else if (bx.fx === 'rise') S.push(e0 - Math.min(2, sec.bars) * 16, CH.fx, FX_KIND.rise, 0.8, Math.min(2, sec.bars) * 16, 0, note, 0);
      else if (bx.fx === 'sweep') S.push(e0 - Math.min(2, sec.bars) * 16, CH.fx, FX_KIND.sweep, 0.8, Math.min(2, sec.bars) * 16, 0, 0);
      else if (bx.fx === 'reverse') S.push(e0 - 8, CH.fx, FX_KIND.reverse, 0.7, 8, 0, 0);
      else if (bx.fx === 'swirl') S.push(e0 - 16, CH.fx, FX_KIND.swirl, 0.75, 16, 0, note, 0);
      else if (bx.fx === 'zap') S.push(e0 - 8, CH.fx, FX_KIND.zap, 0.7, 8, 0, note, 0);
      if (bx.shape === 'roll' || bx.shape === 'lateroll' || bx.shape === 'clap') { if (bx.end === 'roll' || bx.end === 'filter' || !bx.end) S.push((sec.bar0 + sec.bars - 1) * 16, CH.fx, FX_KIND.snareup, 0.8, 16, 0, 0); } } // the snare-up belongs to a snare build
    if (sec.type === 'drop' || sec.layer === 'tease') { S.push(sec.bar0 * 16, CH.fx, FX_KIND.impact, sec.layer === 'tease' ? 0.7 : 1, 32, 0, 0); }
    if (sec.type === 'break' && si > 0) { const fx = sec.ix ? sec.ix.fx : 'down'; if (fx === 'down') S.push(sec.bar0 * 16, CH.fx, FX_KIND.down, 0.9, 32, 0, 0); else if (fx === 'crash') S.push(sec.bar0 * 16, CH.fx, FX_KIND.crash, 0.6, 32, 0, 0); else if (fx === 'sweep') S.push(sec.bar0 * 16, CH.fx, FX_KIND.sweep, 0.6, 16, 0, 0); }
    if (sec.dx === 'reverse') S.push((sec.bar0 + sec.bars) * 16 - 8, CH.fx, FX_KIND.reverse, 0.65, 8, 0, 0); // a breakdown straight into its drop
    if (next && (next.type === 'groove') && sec.type === 'intro') S.push((next.bar0 - 1) * 16, CH.fx, FX_KIND.sweep, 0.7, 16, 0, 0);

    // additive arrangement ("flow"): in intros, grooves and outros the parts that are NEW in this section enter one or two at a
    // time on 4-bar lines (drums first, then bass, harmony, melody), and in an outro the parts that leave go one at a time —
    // measured before: 180 bar lines (5–6 per track) where 3+ parts switched at once outside a drop or break, heard as jumps.
    // Drops (the impact) and breaks (the cut) still change everything on the one, as they should.
    const prevSec = P.sections[si - 1], prevL = prevSec ? (prevSec.L || LAYERS[prevSec.layer] || {}) : {}, entry = {}, exit = {};
    const prevHas = (part) => !!prevSec && (prevL[part] || 0) > 0 && !(G.only && G.only[part] && !G.only[part].includes(prevSec.type)) && !(part === 'chords' && G.chords && G.chords.in && G.chords.in[prevSec.type] === 0); // (v9.3) did this part play in the section before
    if (!sec.L && si > 0 && sec.layer !== 'tease' && (sec.type === 'intro' || sec.type === 'groove' || sec.type === 'outro') && sec.bars >= 8) { // (the first section is the song starting: everything it has plays from bar 1)
      const span = Math.max(4, sec.bars - 4), slots = []; for (let k = 0; k < span; k += 4) slots.push(k);
      const ent = FLOW_ORDER.filter((p) => (L[p] || 0) > 0 && !((prevL[p] || 0) > 0)); ent.forEach((p, k) => { entry[p] = slots[Math.min(slots.length - 1, k)]; }); if (ent.length) entry[ent[0]] = 0;
      if (sec.type === 'outro') { const lv = FLOW_ORDER.slice().reverse().filter((p) => (prevL[p] || 0) > 0 && !((L[p] || 0) > 0)); lv.forEach((p, k) => { exit[p] = slots[Math.min(slots.length - 1, k)] + 4; }); } }
    const Lsec = L;
    for (let b = 0; b < sec.bars; b++) {
      let L = layerAtBar(Lsec, prevL, entry, exit, b); const bx = sec.type === 'build' ? sec.bx : null, shape = bx ? bx.shape : '';
      if (shape === 'drumless') L = Object.assign({}, L, { kick: 0, snare: 0, hats: 0, perc: 0 });
      const bar = sec.bar0 + b, t0 = bar * 16, phraseBar = b % 8, lastOfPhrase = phraseBar === 7 || b === sec.bars - 1;
      const c = chordAt(P, bar), pcs = chordTonesPc(P, c), cNext = chordAt(P, Math.min(P.bars - 1, bar + 1));
      const chordChanged = chordVoicedAt(P, sec, b); // (also on every chord slot: a one-chord progression re-voices its pad instead of going silent after the first slot)
      const buildPos = sec.type === 'build' ? b / sec.bars : -1; // 0..1 through the build
      const gapSteps = sec.type === 'build' && b === sec.bars - 1 ? (bx ? bx.gap : DROP_GAP) : sec.dx === 'gap' && b === sec.bars - 1 ? DROP_GAP : 0; // the half-beat of silence before the drop (v9.4: a beat, half a beat or none — the build's ending)
      const secEnd = b === sec.bars - 1 && si < P.sections.length - 1 && sec.bars <= 8, silentFrom = 16 - gapSteps, cap = (st, len) => (gapSteps ? Math.max(0.25, Math.min(len, silentFrom - st)) : secEnd ? Math.max(0.25, Math.min(len, 16.5 - st)) : len); // (a note started before the gap is cut at it: the half-beat is silence, not a rest the sustained parts ring through. v9.4: in a short section — a false drop, a short build — nothing rings past its end either)
      const dvI = drumVariant(sec, b, nVar), half = b >= 16 ? 1 : 0, vari = (sec.type === 'build' || sec.dv) ? dMut[half][dvI] : b % 4 === 3 ? dTail[half][dvI] : b % 4 === 1 ? dTwo[half][dvI] : dMut[half][dvI]; patD[bar] = dvI;
      // the texture bed follows the harmony (pitch-class mask + root on every chord change; d = -1 marks a chord event)
      if (chordChanged) { let mk = 0; for (const pc of pcs) mk |= 1 << pc; S.push(t0, CH.tex, TEX_KIND[P.texture] || 0, 0, -1, mk, chordPc(P, c), 0); }

      // ---------- drums ----------
      // break edit (dnb / jungle / breaks idiom): mid-phrase the last beat of the break is re-cut — kick and snare hits re-ordered
      // like a chopped Amen, a different cut each time (deterministic per bar, outside the random streams)
      const edit = EDIT_FAM.has(G.family) && (sec.type === 'drop' || sec.type === 'groove') && (phraseBar === 3 || (phraseBar === 5 && sec.type === 'drop')) && silentFrom === 16 ? BREAK_EDITS[hashStr(P.seed + ':' + bar) % BREAK_EDITS.length] : null;
      const lateN = sec.bars >= 8 ? 2 : 1, kickOn = L.kick && !(sec.type === 'build' && (shape === 'lateroll' ? b >= sec.bars - lateN : shape === 'kickroll' ? false : shape === 'half' ? b >= sec.bars - 1 : (!four ? b > 0 : buildPos >= (L.kick || 0))));
      if (shape === 'kickroll' && b === sec.bars - 1) for (let st = 2; st < silentFrom; st += st < 8 ? 2 : 1) if (st % 4) S.push(t0 + st + sw(st), CH.kick, 0, 0.55 + 0.4 * st / 16, 1, 0, 0); // (v9.4) the kick roll: eighths, then sixteenths into the drop
      if (kickOn && edit) for (const e of parsePat(edit[0])) S.push(t0 + 12 + e.step + sw(12 + e.step), CH.kick, 0, e.vel, 1, 0, 0);
      const PL = PROD[G.family] || {}, groovy = sec.type === 'drop' || sec.type === 'groove';
      const kickMute = PL.kickMute && groovy && four && b % 16 === 15 && b !== sec.bars - 1 && hashStr(P.seed + '/km' + bar) % 2 === 0;
      if (L.fx !== 0) { // the production layer (deterministic, outside the random streams)
        // used the way producers use them: a crash marks the drop's downbeat (and the second half of a long drop), a reverse
        // cymbal leads only INTO a drop or a breakdown. (v5 put a crash on every 8 bars and a reverse on every 16 — heard as
        // "throwing sounds around")
        if (PL.crash && sec.type === 'drop' && (b === 0 || (b === 16 && sec.bars >= 32))) S.push(t0, CH.fx, FX_KIND.crash, (b === 0 ? 0.7 : 0.45) * PL.crash, 32, 0, 0);
        const intoBig = b === sec.bars - 1 && next && (next.type === 'drop' || next.type === 'break');
        if (PL.rev && intoBig) S.push(t0 + 8, CH.fx, FX_KIND.reverse, (next.type === 'drop' ? 0.6 : 0.45) * PL.rev, 8, 0, 0);
        const EC = EAR[G.family], es = EC ? EAR_SEC[sec.type] || 0 : 0;
        if (es) { const h = hashStr(P.seed + '/ear/' + bar), u = (h % 1000) / 1000, u2 = ((h >>> 10) % 1000) / 1000, u3 = ((h >>> 20) % 1000) / 1000;
          const tones = []; for (let m = 64; m <= 79; m++) if (pcs.includes(m % 12)) tones.push(m); const note = tones.length ? tones[Math.floor(u2 * tones.length)] : 72;
          if ((phraseBar === 7 || b === sec.bars - 1) && sec.bars >= 8 && u3 < EC.swirl * (sec.type === 'build' ? 0 : 1) && silentFrom === 16) S.push(t0, CH.fx, FX_KIND.swirl, 0.75, 16, 0, note, 0); // a swirl swelling into the next phrase
          else if (u < EC.p * es * (G.ear != null ? G.ear : 1)) { const tot = EC.kinds.reduce((a, k) => a + k[1], 0); let x = u2 * tot, kind = EC.kinds[0][0]; for (const [k, w] of EC.kinds) { x -= w; if (x <= 0) { kind = k; break; } }
            if (sec.type === 'build') kind = 'rise';
            const at = EAR_AT[Math.floor(u3 * EAR_AT.length)], len = EAR_LEN[kind] || 2;
            if (at + len <= silentFrom && !(kickMute && at >= 12)) S.push(t0 + at + sw(at), CH.fx, FX_KIND[kind], 0.55 + 0.35 * u3, len, 0, note, (bar % 2 ? 0.65 : -0.65) * (0.6 + 0.4 * u)); } } }
      if (kickOn && vari.k) for (const e of parsePat(laneBar(vari.k, b))) { if (e.step >= silentFrom || (edit && e.step >= 12) || (kickMute && e.step >= 12)) continue; if (lastOfPhrase && !isLastSec && G.drums.fill && e.step >= 14 && next && next.type !== 'outro' && rd() < 0.5 && b === sec.bars - 1) continue;
        S.push(t0 + e.step + sw(e.step), CH.kick, 0, e.vel, 1, 0, 0); }
      // snare / clap lane (+ rim lane) — build replaces it with an accelerating roll
      const rollBar = shape === 'lateroll' ? b >= sec.bars - lateN : shape === 'half' || shape === 'tom' ? b === sec.bars - 1 : shape === 'kickroll' ? false : true;
      if (sec.type === 'build' && L.snare && rollBar) { const rp = shape === 'lateroll' ? (b - (sec.bars - lateN) + 0.5) / lateN : shape === 'half' || shape === 'tom' ? 0.8 : buildPos;
        const div = rp < 0.25 ? 4 : rp < 0.5 ? 2 : rp < 0.75 ? 1 : 0.5, kind = shape === 'clap' ? 1 : 3;
        if (shape === 'tom') { const tn = [45, 47, 50, 52, 55, 57, 59, 62]; for (let s = 0; s < silentFrom; s += 1) S.push(t0 + s + sw(s), CH.perc, tn[Math.min(tn.length - 1, s >> 1)], 0.5 + 0.03 * s, 1, PERC_KINDS.tom << 2, 0, s % 2 ? 0.35 : -0.35); } // a tom run up into the drop
        else for (let s = 0; s < silentFrom; s += div) { const pr = shape === 'lateroll' ? rp : (b + s / 16) / sec.bars; S.push(t0 + s + (div >= 1 ? sw(s | 0) : 0), CH.snare, kind, 0.35 + 0.6 * pr * pr + 0.05, 1, 0, 0); }
      } else if (sec.type === 'build' && L.snare && (shape === 'half' || shape === 'tom')) { for (const st of shape === 'half' ? [8] : [4, 12]) if (st < silentFrom) S.push(t0 + st, CH.snare, 3, 0.8, 1, 0, 0); } // half time: the snare on three
      else if (sec.type === 'build' && shape === 'kickroll') { /* the kick carries this build: hats and percussion only */ }
      else if (L.snare && vari.s) {
        const fillPat = lastOfPhrase && G.drums.fill && (b === sec.bars - 1 || phraseBar === 7) && sec.type !== 'intro' ? pick(rd, G.drums.fill) : null;
        const fillStart = fillPat ? fillPat.search(/[^.]/) : 99;
        if (edit && !fillPat) for (const e of parsePat(edit[1])) S.push(t0 + 12 + e.step + sw(12 + e.step), CH.snare, 3, e.vel * (0.95 + rh() * 0.1), 1, 0, 0);
        for (const e of parsePat(laneBar(vari.s, b))) if (e.step < fillStart && e.step < silentFrom && !(edit && !fillPat && e.step >= 12)) S.push(t0 + e.step + sw(e.step) + fS + (rh() - 0.5) * 0.02, CH.snare, 3, e.vel * (0.97 + rh() * 0.06), 1, 0, 0);
        if (fillPat) for (const e of parsePat(fillPat)) if (e.step < silentFrom) S.push(t0 + e.step + sw(e.step), CH.snare, 3, e.vel * (0.95 + rh() * 0.1), 1, 0, 0);
      }
      if (sec.dx === 'fill' && b === sec.bars - 1 && !(L.snare && vari.s)) for (const e of parsePat((G.drums.fill || ['............x.xX'])[hashStr(P.seed + '/dxf/' + bar) % (G.drums.fill || [0]).length])) if (e.step < silentFrom) S.push(t0 + e.step + sw(e.step), CH.snare, 3, e.vel * 0.9, 1, 0, 0); // a breakdown straight into its drop: the fill
      if (L.snare && vari.rim && sec.type !== 'build') for (const e of parsePat(laneBar(vari.rim, b))) if (e.step < silentFrom) S.push(t0 + e.step + sw(e.step) + (rh() - 0.5) * 0.03, CH.snare, 2, e.vel * (0.9 + rh() * 0.2), 1, 0, 0);
      // hats: fraction < 1 thins to open hats only (and half the bars at ≤ .3)
      if (L.hats) { const lanes = L.hats >= 1 ? ['hc', 'ho', 'ride', 'sh'] : ['ho'];
        if (!(L.hats <= 0.3 && b % 2)) for (const ln of lanes) { const pat = laneBar(vari[ln], b); if (!pat) continue; const kind = HAT_KIND[ln];
          for (let i = 0; i < pat.length; i++) { const ch = pat[i]; if (ch === '.' || ch === '-') continue; if (i >= silentFrom) continue;
            const n = ch === 'r' ? 2 : ch === 'z' ? 3 : ch === 'q' ? 4 : 1, vel = VEL[ch] || 0.7;
            for (let k = 0; k < n; k++) { const tt = t0 + i + k / n + sw(i) + fH + (rh() - 0.5) * 0.04; const vv = n > 1 ? 0.5 + 0.4 * (k / (n - 1)) : vel * (0.92 + rh() * 0.16);
              S.push(tt, CH.hats, kind, vv * (L.hats < 1 ? 0.85 : 1), 1, 0, 0, kind === 3 ? 0.45 : kind === 0 ? -0.2 : kind === 1 ? 0.24 : kind === 2 ? -0.38 : 0); } } } }
      // percussion
      if (TOP && (sec.type === 'drop' || sec.layer === 'groove2' || sec.layer === 'tease') && (L.perc || 0) > 0) for (const [kind, pat, vel, pan] of TOP) { const pb = laneBar(pat, b); for (let st = 0; st < 16; st++) if (pb[st] === 'x' && st < silentFrom) S.push(t0 + st + sw(st) + fP, CH.perc, 0, vel * (st % 4 === 0 ? 0.8 : 1) * (0.9 + rh() * 0.15), 1, PERC_KINDS[kind] << 2, 0, pan); } // (v9.4) the top loop
      if (percOn && vari.p) for (const [kind, note, pat] of vari.p) if (kind !== 'rim') for (const e of parsePat(laneBar(pat, b))) { if (e.step >= silentFrom) continue; S.push(t0 + e.step + sw(e.step) + fP + (rh() - 0.5) * 0.04, CH.perc, note || 0, e.vel * (0.88 + rh() * 0.2), 1, (PERC_KINDS[kind] ?? 1) << 2, 0, PERC_PAN[kind] || 0); }
      if (vari.p && vari.p.some((p) => p[0] === 'rim') && L.snare) for (const [kind, note, pat] of vari.p) if (kind === 'rim') for (const e of parsePat(laneBar(pat, b))) { if (e.step >= silentFrom) continue; S.push(t0 + e.step + sw(e.step), CH.snare, 2, e.vel * 0.9, 1, 0, 0); }
      // tuned tom fill (v7.1): on some 16-bar phrase ends of drops and grooves the last beat is four toms walking DOWN THROUGH THE
      // CHORD'S OWN TONES (in key, tuned against the kit's pitch) — the electronic tom run, made harmonic. Deterministic per bar.
      if (TOM_FAM.has(G.family) && groovy && b % 16 === 15 && b !== sec.bars - 1 && L.snare && hashStr(P.seed + '/tom' + bar) % 3 === 0) { const tn = []; for (let m = 74; m >= 50; m--) if (pcs.includes(m % 12)) tn.push(m);
        const pt = 12 * Math.log2((P.kits.perc && P.kits.perc.pitch) || 1); for (let k = 0; k < 4 && tn.length; k++) S.push(t0 + 12 + k + sw(12 + k), CH.perc, tn[(k * 2) % tn.length] - pt, 0.78 - 0.06 * k, 1, (PERC_KINDS.tom) << 2, 0, 0.5 - k * 0.33); }
      // crash on phrase starts of drops / grooves
      if ((sec.type === 'drop' || sec.type === 'groove') && b % 16 === 0 && L.hats) S.push(t0, CH.hats, HAT_KIND.crash, sec.type === 'drop' ? 0.85 : 0.6, 1, 0, 0);

      // ---------- bass ----------
      if (L.bass && G.bass) {
        const bvI = bassVariant(sec, b, bassPatAuto, G.bass.pats.length), pat = laneBar((b % 4 === 3 && !sec.bv && sec.type !== 'build' ? bTail : bMut)[b >= 16 ? 1 : 0][bvI], b); patB[bar] = bvI;
        const root = bassRoot(P, c), nRoot = bassRoot(P, cNext), minor = c.q === 'min' || c.iv[1] === 3;
        const evs = parsePat(pat); let prevNote = null;
        if (phraseBar === 7 && b !== sec.bars - 1 && evs.length) { const lastE = evs[evs.length - 1]; if (lastE.len <= 2 && /[RO]/i.test(lastE.ch)) { const sl = lastE.ch !== lastE.ch.toUpperCase(); lastE.ch = nRootDiffers(P, c, cNext) ? (sl ? 'a' : 'A') : (sl ? 'o' : 'O'); } } // phrase turnaround
        const wob = G.bass.wobble ? G.bass.wobble[(b + (phraseBar >> 1)) % G.bass.wobble.length] : 0;
        for (const e of evs) { if (e.step >= silentFrom) continue;
          const tk = e.ch.toUpperCase(), slide = e.ch !== tk;
          let m = root;
          switch (tk) { case 'O': m = root + 12; break; case 'F': m = root + 7 > P.tonicBass + 9 ? root - 5 : root + 7; break; case 'T': m = root + (minor ? 3 : 4); break;
            case 'S': m = root + (c.iv.includes(11) ? 11 : 10); break; case 'A': m = nRoot !== root ? nRoot - 1 : root - 2; break; case 'N': m = nRoot; break;
            case 'P': { const dir = nRoot >= root ? 1 : -1; m = snapToScale(root + dir * 2, P.key, P.mode); break; } }
          if (m < (P.bassFloor || 26)) m += 12; // (v9.2) never under the genre's floor
          const len = cap(e.step, e.len * (e.len > 1 ? 0.98 : G.bass.gate));
          S.push(t0 + e.step + sw(e.step), CH.bass, m, e.vel * (sec.type === 'build' ? 0.85 : 1), len, (slide ? 1 : 0) | (e.vel >= 1 ? 2 : 0), L.bass < 1 ? 0.5 + 0.5 * L.bass : 0, wob);
          prevNote = m; }
      }

      // ---------- chords ----------
      const Ch = G.chords; const cf = (L.chords || 0) * (Ch.in && Ch.in[sec.type] != null ? Ch.in[sec.type] : 1) * (Ch.from && Ch.from[sec.type] != null && si < lastDrop && b < sec.bars * Ch.from[sec.type] ? 0 : 1) * (Ch.dropAlt && sec.type === 'drop' && sec.bars >= 16 && b % 16 < 8 ? 0 : 1); // (dropAlt, v9.2: the chords take the second half of each 16 bars of a drop) // a genre may keep its chords out of a section, or bring them in late (psy: the last quarter of the groove)
      if (cf && Ch.role !== 'none' && Ch.kit) {
        const bright = cf < 1 ? 0.45 + 0.55 * cf : 1;
        if (Ch.role === 'pad') { if (chordChanged) { const vo = voicing('chords', c, Ch.range[0], Ch.range[1], Ch.voices || 5, 1), [off, len] = artSpan(sec, b, chordHoldSteps(P, sec, b), prevHas('chords'));
            for (const m of vo) S.push(t0 + swA(off), CH.chords, m, 0.75 * (0.7 + 0.3 * cf) * (off > 0 ? 0.9 : off < 0 ? 1.04 : 1), len, 0, bright); } }
        else if (Ch.role === 'stab') { const period = Ch.sparse ? Math.max(1, Math.round(1 / (1 - Ch.sparse))) : 1;
          // stab placement (measured before: 31 % of stabs hit a kick — up to 71 % in some genres — where the sidechain pump
          // swallows them and they pop back late; one flat velocity; ~2 distinct bars per 16). Now: a stab never sits on a
          // kick (moved to the off-beat "and", else a 16th early), the 4th bar of each phrase answers with the other rhythm,
          // a chord change is anticipated by a push stab ON THE NEW CHORD, the downbeat after a push stays clear, accents
          // fall on the first hit, repeats are softer, groove sections play a thinned version of the drop's part.
          if (b % period === period - 1 || period === 1) { const p4 = b % 4, rhy = laneBar(chordRh[((b >> 2) + (p4 === 3 ? 1 : 0)) & 1], b), vo = voicing('chords', c, Ch.range[0], Ch.range[1], Ch.voices || 4);
            const kicks = new Set(kickOn && vari.k ? parsePat(laneBar(vari.k, b)).map((e) => e.step) : []), taken = new Set(), hits = [];
            for (const e of parsePat(rhy)) { let st = e.step; if (kicks.has(st)) st = !kicks.has(st + 2) && st + 2 < silentFrom ? st + 2 : st > 0 && !kicks.has(st - 1) ? st - 1 : -1;
              if (st < 0 || st >= silentFrom || taken.has(st) || (stabPushed && st < 2)) continue; taken.add(st); hits.push(st); }
            hits.sort((x, y) => x - y); const a0 = b === 0 ? art(bar) : 0; // (v9.3) a section's first stab: late (a rest, then in), or a pickup into it
            if (a0 > 0) { while (hits.length && hits[0] < a0) hits.shift(); if (a0 < silentFrom && hits[0] !== a0 && !kicks.has(a0)) hits.unshift(a0); }
            else if (a0 < 0 && !stabPushed) for (const m of vo) S.push(t0 + a0 + sw(16 + a0), CH.chords, m, 0.85 * (0.75 + 0.25 * cf), Math.max(0.6, -a0 - 0.2), 0, bright);
            const nextChord = b + 1 < sec.bars && chordIndexAt(P, sec, bar + 1) !== chordIndexAt(P, sec, bar);
            const push = nextChord && silentFrom === 16 && !hits.some((x) => x >= 12) && !kicks.has(14) ? 14 : -1;
            const thin = cf < 1 && sec.type !== 'break'; let k = 0;
            // (v9.4) a rhythm that already plays in the bar's last beat (all three house rhythms do) never anticipated a change: its last
            // hit, when it falls an 8th or a 16th before the bar, now carries the new chord when the bar line is drawn as pushed for this genre family (harmArt) — the house piano push
            const hl = hits.length - 1, pushLast = push < 0 && nextChord && silentFrom === 16 && hl >= 0 && hits[hl] >= 14 && !(thin && hl % 2 === 1) && art(bar + 1) < 0 ? hl : -1; stabPushed = push >= 0 || pushLast >= 0;
            const vNext = pushLast >= 0 ? voicing('chords', cNext, Ch.range[0], Ch.range[1], Ch.voices || 4) : null;
            for (let h = 0; h < hits.length; h++) { const st = hits[h]; if (thin && h % 2 === 1) continue; const gap = (h + 1 < hits.length ? hits[h + 1] : push >= 0 ? push : 16) - st;
              const v = (k === 0 ? (p4 === 0 ? 0.95 : 0.88) : k % 2 ? 0.76 : 0.82) * (0.96 + 0.08 * rh()) * (0.75 + 0.25 * cf), len = cap(st, Math.max(0.6, Math.min((Ch.len || 1) * 0.9, gap - 0.2))); k++;
              if (h === pushLast) { for (const m of vNext) S.push(t0 + st + sw(st) + fC, CH.chords, m, 0.9 * (0.75 + 0.25 * cf), Math.max(len, Math.min(1.5, 16 - st + 1)), 0, bright); continue; }
              for (const m of vo) S.push(t0 + st + sw(st) + fC, CH.chords, m, v, len, 0, bright); }
            if (push >= 0) { const vn = voicing('chords', cNext, Ch.range[0], Ch.range[1], Ch.voices || 4); for (const m of vn) S.push(t0 + push + sw(push), CH.chords, m, 0.9 * (0.75 + 0.25 * cf), Math.max(1.5, (Ch.len || 1) * 0.9), 0, bright); } } }
        else if (Ch.role === 'gate') { const rhy = laneBar(gateRh[(b >> 2) & 1], b); const vo = voicing('chords', c, Ch.range[0], Ch.range[1], Ch.voices || 5);
          const gated = sec.type === 'drop' || sec.type === 'build' || sec.type === 'groove';
          // (v9.3) the accent sits on the beat in kick-locked genres, else it alternates per 4-bar phrase between the beat and the
          // off-beat; a pushed chord change takes over the last gate hits of the bar before it
          const acc = ART_KICKLOCK.has(P.gid) ? 0 : (hashStr(P.seed + ':gacc:' + (bar >> 2) + ':' + cseed) & 1) * 2, nAt = b + 1 < sec.bars && chordVoicedAt(P, sec, b + 1) ? art(bar + 1) : 0, vn = nAt < 0 ? voicing('chords', cNext, Ch.range[0], Ch.range[1], Ch.voices || 5) : null;
          if (gated) { for (let s = 0; s < silentFrom; s++) if (rhy[s] !== '.') for (const m of (vn && s >= 16 + nAt ? vn : vo)) S.push(t0 + s, CH.chords, m, (s % 4 === acc ? 0.95 : 0.78) * (0.75 + 0.25 * cf), 0.8, 0, bright); }
          else if (chordChanged) { const [off, len] = artSpan(sec, b, chordHoldSteps(P, sec, b), prevHas('chords')); for (const m of vo) S.push(t0 + swA(off), CH.chords, m, 0.6, len, 0, 0.5); } }
      }
      // ---------- pad ----------
      if (L.pad && G.pad && chordChanged) { const vo = voicing('pad', c, G.pad.range[0], G.pad.range[1], 4, 1), [off, dur] = artSpan(sec, b, chordHoldSteps(P, sec, b), prevHas('pad'));
        for (const m of vo) S.push(t0 + swA(off), CH.pad, m, 0.7 * (0.6 + 0.4 * L.pad) * (off > 0 ? 0.9 : 1), dur, 0, L.pad < 1 ? 0.7 : 1); }

      // ---------- lead / hook / arp ----------
      const lf = L.lead == null && sec.mel ? 0.85 : L.lead || 0; // a written melody plays even where the layer has no lead part (an explicit 0 still silences it)
      // lead mask for this bar (2 = a lead onset, 1 = a lead note held, 0 = the lead rests): the arp / second hook answer in
      // the gaps instead of talking over the lead (measured before: 48 % of drop arp notes landed on a lead onset, 7 % in a gap,
      // and the arp was as loud under the lead as in its rests)
      leadMask.fill(0); const markLead = (st, len) => { const a = Math.max(0, Math.round(st)); if (a > 15) return; leadMask[a] = 2; for (let k = 1; k < Math.max(1, Math.round(len)); k++) if (a + k < 16 && leadMask[a + k] === 0) leadMask[a + k] = 1; };
      if (lf && G.lead) {
        const bright = lf < 1 ? 0.5 + 0.5 * lf : 1, vscale = 0.7 + 0.3 * lf;
        if (sec.mel) { // a written melody (score format): bars cycle over the section
          const mb = sec.mel[b % sec.mel.length]; for (const n of mb) { if (n.s >= silentFrom) continue; markLead(n.s, n.len); S.push(t0 + n.s + sw(n.s), CH.lead, n.m, (n.acc ? 1 : n.s % 4 === 0 ? 0.95 : 0.8) * vscale, cap(n.s, n.len * 0.92), n.slide ? 1 : 0, bright); }
        } else if (G.lead.role === 'hook' && hookIdea) {
          // the lead's role follows the arrangement: breaks/intros carry the augmented skeleton, builds tease the call,
          // the pre-drop groove states only the question, drops give the whole period (alternate 8 bars varied), the last
          // drop of a multi-drop track doubles it an octave up — the arc of the track, not one loop everywhere
          // (v9.2) the periods of a drop: A open · A home · (32 bars and more) C open, the development · B home · A open · B home …
          const p8 = b % 8, base = bar - p8, k8 = b >> 3, form = sec.type === 'break' || sec.type === 'intro' ? 2 : sec.type === 'build' ? 3 : sec.type === 'groove' || sec.type === 'outro' ? 4 : k8 === 2 && sec.bars >= 32 ? 6 : (k8 & 1) ? (k8 === 1 ? 0 : 1) : 5;
          renderHook(P, hookIdea, p8, (k) => chordTonesPc(P, chordAt(P, Math.min(P.bars - 1, base + k))), tmp, form);
          const dbl = sec.type === 'drop' && dropCount > 1 && si === lastDrop;
          const nextPcs = chordTonesPc(P, cNext), chordMoves = nextPcs.join() !== pcs.join();
          for (const n of tmp) { if (n.s >= silentFrom) continue; markLead(n.s, n.len); let len = cap(n.s, (form === 2 ? Math.min(n.len, 16 - n.s) : n.len) * 0.92); const v = n.v * vscale * (form === 3 ? 0.75 + 0.25 * Math.max(0, buildPos) : 1);
            if (chordMoves && n.s + len > 16.25 && !nextPcs.includes(((n.m % 12) + 12) % 12)) len = Math.max(0.5, 16 - n.s - 0.1); // (v9.2) a long note before the bar line is not held into a chord it is not part of (the open and closed periods end on long notes)
            S.push(t0 + n.s + sw(n.s), CH.lead, n.m, dbl ? v * 0.88 : v, len, 0, bright); if (dbl && n.m + 12 <= 96) S.push(t0 + n.s + sw(n.s), CH.lead, n.m + 12, v * 0.3, len, 0, bright); } // the last drop is bigger in colour (the octave), not in level
        } else if (G.lead.role === 'seq' && seqIdea) {
          const mut = (b >> 3) % 2 ? seqIdea.mut : null, root = nearPc(chordPc(P, c), G.lead.range[0] + 6), cellQ = seqIdea.bars[b & 1];
          for (let s = 0; s < 16; s++) { const st = cellQ[s]; if (!st || s >= silentFrom) continue; const iv = mut && mut[s] != null ? mut[s] : st.iv;
            const m = snapToScale(root + iv, P.key, P.mode); markLead(s, 1); S.push(t0 + s + sw(s), CH.lead, m, (st.acc ? 1 : 0.75) * vscale, st.slide ? 1.05 : 0.6, (st.slide ? 1 : 0) | (st.acc ? 2 : 0), bright); }
        } else if (G.lead.role === 'chop' && chopIdea) {
          const blk = (b >> 3) & 1, rhy = b % 4 === 3 && chopIdea.rh3 ? chopIdea.rh3 : chopIdea.rh[((b >> 1) + blk) & 1]; const vo = voiceLead(chordPc(P, c), chordIvs(P, c), null, G.lead.range[0], G.lead.range[1], 4); // (v9.1: alternate eight bars swap the rhythms and step the notes up one chord tone)
          // chops are short hits like stabs: one on a kick is swallowed by the pump (measured 35 % of chops) → off-beat or a 16th early
          const kicksC = new Set(kickOn && vari.k ? parsePat(laneBar(vari.k, b)).map((x) => x.step) : []), usedC = new Set();
          let k = 0; for (const e of parsePat(rhy)) { let st = e.step; if (kicksC.has(st)) st = !kicksC.has(st + 2) && st + 2 < silentFrom ? st + 2 : st > 0 && !kicksC.has(st - 1) ? st - 1 : -1;
            if (st < 0 || st >= silentFrom || usedC.has(st)) continue; usedC.add(st); markLead(st, 1); const m = vo[(chopIdea.idx[k % chopIdea.idx.length] + blk) % vo.length]; const vw = chopIdea.vow[k % chopIdea.vow.length];
            S.push(t0 + st + sw(st), CH.lead, m, 0.9 * vscale * chopIdea.g, cap(st, chopIdea.len[k % chopIdea.len.length]), 0, bright, vw + 1); k++; }
        } else if (G.lead.role === 'arp') renderArp(P, G.lead, c, t0, silentFrom, CH.lead, vscale, bright, S, sw, null, (b >> 3) & 1, b % 8 === 7 && b !== sec.bars - 1);
        else if (G.lead.role === 'riff' && riffIdea) {
          // drops and the grooves after them: the riff. Breakdowns and intros: the theme in long notes (the augmented period of the
          // genre's theme) over the moving chords. Builds: the call, a little more of it every bar, the filter opening with it.
          const p8 = b % 8, base = bar - p8;
          if ((sec.type === 'break' || sec.type === 'intro') && hookIdea) { renderHook(P, hookIdea, p8, (k) => chordTonesPc(P, chordAt(P, Math.min(P.bars - 1, base + k))), tmp, 2);
            for (const n of tmp) { if (n.s >= silentFrom) continue; markLead(n.s, n.len); S.push(t0 + n.s + sw(n.s), CH.lead, n.m, n.v * vscale, cap(n.s, Math.min(n.len, 16 - n.s) * 0.95), n.len >= 3 ? 1 : 0, bright); } }
          else { const tease = sec.type === 'build', notes = riffBar(P, riffIdea, tease ? 0 : b, c, G.lead.range[0], G.lead.range[1]);
            // (v9.2) a riff that fills (nearly) every sixteenth breathes in every other bar while the acid voice plays: the last two
            // sixteenths of each half bar rest, and the acid answers there (under a pedal or roll riff it had no step of its own)
            const acidOn = G.hook && G.hook.role === 'seq' && seq2Idea && ((G.hook.in && (G.hook.in[sec.layer] != null ? G.hook.in[sec.layer] : G.hook.in[sec.type])) || 0) > 0, breathe = !tease && acidOn && notes.length >= 13 && (b & 1) === 1;
            for (const n of notes) { if (n.s >= silentFrom || (tease && n.s >= 8 + Math.floor(buildPos * 8)) || (breathe && n.s % 8 >= 6)) continue; markLead(n.s, 1);
              const v = (n.acc ? 1 : 0.8) * vscale * (tease ? 0.6 + 0.4 * buildPos : 1);
              S.push(t0 + n.s + sw(n.s), CH.lead, n.m, v, n.slide ? 1.05 : 0.72, (n.slide ? 1 : 0) | (n.acc ? 2 : 0), tease ? bright * (0.5 + 0.5 * buildPos) : bright); } }
        }
      }
      if (G.hook && hook2Idea && (lf >= 1 || (sec.type === 'break' && lf > 0.6 && b >= sec.bars / 2))) {
        const p8 = b % 8, base = bar - p8; renderHook(P, hook2Idea, p8, (k) => chordTonesPc(P, chordAt(P, Math.min(P.bars - 1, base + k))), tmp, 0);
        for (const n of tmp) { if (n.s >= silentFrom) continue; const lm = leadMask[Math.min(15, Math.round(n.s))]; if (G.hook.lead2 && G.hook.mode === 'answer' && lm) continue; if (b === sec.bars - 1 || (G.hook.lead2 && cNext !== c)) n.len = Math.max(0.5, Math.min(n.len, (16 - n.s - (G.hook.lead2 && cNext !== c ? 2.5 : 0.5)) / 0.92)); /* (not past the section's end — v9.4's short sections — nor, for LEAD 2, into the next chord) */ S.push(t0 + n.s + sw(n.s), CH.arp, n.m, (n.s % 4 === 0 ? 0.9 : 0.75) * (lm === 2 ? 0.7 : lm === 1 ? 0.88 : 1.08), cap(n.s, n.len * 0.92), 0, sec.type === 'break' ? 0.6 : 1); }
      }
      // the acid second voice (psytrance, v9.1): two bars, following the chord roots, answering in the riff's gaps — enters halfway
      // through the groove with its filter opening, carries on through the drops (hook.in: its level per section type)
      if (G.hook && G.hook.role === 'seq' && seq2Idea) { const lv = (G.hook.in && (G.hook.in[sec.layer] != null ? G.hook.in[sec.layer] : G.hook.in[sec.type])) || 0, /* by the section's layer first (groove2: the groove after a drop), then its type */ eff = lv * (sec.type === 'groove' && si < lastDrop && G.hook.from && b < sec.bars * (G.hook.from.groove || 0) ? 0 : 1) * (sec.type === 'drop' && sec.bars >= 32 ? 0.75 + 0.35 * (b / sec.bars) : 1); // through a long drop the acid voice comes forward: the drop develops, it does not loop
        if (eff > 0) { const cellS = seq2Idea.bars[b & 1], mut = (b >> 3) % 2 ? seq2Idea.mut : null, root = nearPc(chordPc(P, c), G.hook.range[0] + 6), rise = sec.type === 'groove' && si < lastDrop ? 0.3 + 0.7 * (b / sec.bars) : 1;
          // (v9.2) it really answers in the gaps: no note where the riff starts one (they started together on 44–75 % of sixteenths), a
          // step back under a held riff note, forward in the free steps — an octave under the riff (the contract's range)
          for (let s = 0; s < 16; s++) { const st = cellS[s]; if (!st || s >= silentFrom) continue; const lm = leadMask[s]; if (lm === 2) continue; const iv = mut && mut[s] != null ? mut[s] : st.iv, m = snapToScale(root + iv, P.key, P.mode);
            S.push(t0 + s + sw(s), CH.arp, m, (st.acc ? 0.95 : 0.72) * eff * (lm === 1 ? 0.8 : 1.05), st.slide ? 1.05 : 0.6, (st.slide ? 1 : 0) | (st.acc ? 2 : 0), rise); } } }
      if (G.arp && (L.chords || 0) > 0 && (sec.type === 'break' || sec.type === 'build' || sec.type === 'drop') && (!G.arp.secs || G.arp.secs.includes(sec.type))) renderArp(P, G.arp, c, t0, silentFrom, CH.arp, sec.type === 'drop' ? 0.75 : 0.85, sec.type === 'break' ? 0.6 + 0.4 * (b / sec.bars) : 1, S, sw, lf && G.lead ? leadMask : null, (b >> 3) & 1, b % 8 === 7 && b !== sec.bars - 1);
    }
    lastSecType = sec.type;
  }
  const score = S.finish();
  const out = { meta: { gid, name: (o && o.title) || G.name, family: G.family, seed: P.seed, vseed: vs, leadSeed: o && o.leadSeed != null ? o.leadSeed >>> 0 : null, seeds: o && o.seeds ? Object.assign({}, o.seeds) : null, bpm: P.bpm, key: P.key, mode: P.mode, prog: P.progToks, bars: P.bars, swing: G.swing, texture: P.texture },
    sections: P.sections.map((s) => ({ type: s.type, bar0: s.bar0, bars: s.bars, layer: s.layer, name: s.name || s.type, dv: s.dv || null, bv: s.bv || null, lvl: s.lvl != null ? s.lvl : null, pt: s.progTok || null, bx: s.bx || null, ix: s.ix || null, dx: s.dx || null })), contract: Object.assign({}, G, { drums: Object.assign({}, G.drums, { main: MAINS }) }), /* (the track's own drum skeleton: what the editor shows and a saved spec keeps) */ plan: { prog: P.progToks }, kits: P.kits, mix: G.mix, roles: { chords: G.chords.role, lead: G.lead ? G.lead.role : 'none' }, ev: score, pat: { drums: patD, bass: patB, perc: percBySec },
    chords: Array.from({ length: P.bars }, (_, b) => { const c = chordAt(P, b); return { root: chordPc(P, c), q: c.q, label: chordLabel(P, c), tones: chordTonesPc(P, c) }; }) };
  if (!o || o.normalize !== false) normalizeParts(out); // bass / lead lines leveled against the genre's median line (spec.js)
  if (G.hook && G.hook.lead2 && out.kits.hook && (!o || o.normalize !== false)) levelLead2(out); // (v9.4) LEAD 2 sits ~6 dB under the line it accompanies
  out.top = TOP ? TOP.map((x) => x[0]) : null;
  return out;
}
// the second voice's level, in context: the line it accompanies (the lead, or the chords where there is no lead) over its loudest 4
// bars and the second voice over its own, each at gain 1, give the ratio of the two sounds; with the faders of the two channels
// (calibrated per genre) the second voice sits 6 dB under that line (8 dB for an answer, which speaks alone in the rests; 3 dB for a
// motif over chords). Kept as a ratio to the line's gain: whenever that gain moves (palette sound matched, refined), syncLead2 follows.
function busiest(score, ch) { const ev = score.ev, at = []; for (let i = 0; i < ev.n; i++) if (ev.ch[i] === ch) at.push(i); if (at.length < 3) return null; let best = 0, t0 = 0;
  for (let j = 0; j < at.length; j++) { const from = Math.floor(ev.t[at[j]] / 16) * 16; let c = 0; for (let k = j; k < at.length && ev.t[at[k]] < from + 64; k++) c++; if (c > best) { best = c; t0 = from; } }
  return { t0, idx: at.filter((i) => ev.t[i] >= t0 && ev.t[i] < t0 + 64) }; }
function levelLead2(score) { const K = score.kits, ref = K.lead ? 'lead' : 'chords', base = K[ref]; if (!base || typeof partEnergy === 'undefined') return;
  const a = busiest(score, 8), b = busiest(score, ref === 'lead' ? 7 : 5); if (!a || !b) return; const nz = NZ;
  NZ = 0x2f6b1d3; const eb = partEnergy(score, ref, Object.assign({}, base, { gain: 1 }), b.idx, b.t0); NZ = 0x2f6b1d3; const en = partEnergy(score, 'arp', Object.assign({}, K.hook, { gain: 1 }), a.idx, a.t0); NZ = nz;
  if (!(eb > 1e-12 && en > 1e-12)) return; const H = score.contract && score.contract.hook, off = H && H.mode === 'motif' ? 3 : H && H.mode === 'answer' ? 8 : 6;
  const B = (typeof BAL_REF !== 'undefined' && BAL_REF[score.meta.gid]) || BAL_DEFAULT, d = (ref === 'lead' ? B[7] : B[5]) - B[8] - off;
  score.lead2 = { ref, rel: clamp(Math.sqrt(eb / en) * dbToGain(clamp(d, -24, 24)), 0.005, 50) }; syncLead2(score); }
function syncLead2(score) { const L2 = score.lead2, K = score.kits; if (!L2 || !K.hook || !K[L2.ref]) return null; const g = clamp((K[L2.ref].gain != null ? K[L2.ref].gain : 1) * L2.rel, 0.005, 8);
  if (Math.abs(20 * Math.log10(g / (K.hook.gain || 1e-9))) < 0.1) return null; K.hook.gain = g; score.lead2Gain = +g.toFixed(3); return g; }
// which drum / bass pattern a bar uses: explicit per-section lists (score format) cycle every 8 bars, else the default policy
function drumVariant(sec, b, nVar) { if (sec.dv && sec.dv.length) return sec.dv[Math.floor(b / 8) % sec.dv.length] % nVar; return (sec.type === 'drop' ? Math.floor(b / 8) + 1 : sec.type === 'groove' && sec.layer === 'groove2' ? 1 : Math.floor(b / 16)) % nVar; }
function bassVariant(sec, b, auto, n) { if (sec.bv && sec.bv.length) return sec.bv[Math.floor(b / 8) % sec.bv.length] % n; return (auto + (sec.type === 'drop' && (b % 8) >= 4 && n > 2 && (b >> 3) % 2 ? 1 : 0)) % n; }
const PC_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const PC_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'], PC_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const MODE_PARENT = { major: 0, minor: 3, dorian: 10, phrygian: 8, lydian: 7, mixolydian: 5, harmonic: 3, phrygdom: 8 }; // semitones to the parent major key
// note names spelled for the key: flat keys (F Bb Eb Ab Db Gb as parent major) use flats, the rest sharps
function spellFor(key, mode) { const parent = (key + (MODE_PARENT[mode] || 0)) % 12; return [5, 10, 3, 8, 1, 6].includes(parent) ? PC_FLAT : PC_SHARP; }
function chordLabel(P, c) { const ext = chordIvs(P, c); const n = spellFor(P.key, P.mode)[chordPc(P, c)]; const q = c.q === 'min' ? 'm' : c.q === 'dim' ? 'dim' : c.q === 'sus2' ? 'sus2' : c.q === 'sus4' ? 'sus4' : c.q === 'pow' ? '5' : '';
  const has = (x) => ext.includes(x); let e = ''; if (has(14) && (has(10) || has(11))) e = has(11) ? 'maj9' : '9'; else if (has(11)) e = 'maj7'; else if (has(10)) e = '7'; else if (has(14)) e = 'add9';
  return n + q + e; }

// acid / techno sequence: per-step interval (scale-snapped), accents, slides; plus a mutation layer used every other 8 bars
function makeSeq(r, rhythms) {
  const rh = pick(r, rhythms), steps = []; const IV = [0, 0, 0, 12, 7, 10, 3, 5, -2, 0, 12];
  for (let s = 0; s < 16; s++) steps.push(rh[s] !== '.' ? { iv: pick(r, IV), acc: r() < 0.3, slide: false } : null);
  for (let s = 0; s < 15; s++) if (steps[s] && steps[s + 1] && r() < 0.28) steps[s].slide = true;
  const mut = {}; for (let k = 0; k < 2; k++) { const s = Math.floor(r() * 16); if (steps[s]) mut[s] = pick(r, IV); }
  return { steps, mut };
}
// the second voice of psytrance (v9.1): an acid line over TWO bars — the one-bar cell, then its answer with the last beat
// re-drawn — instead of one bar looped
function makeSeq2(r, rhythms) { const a = makeSeq(r, rhythms), b = a.steps.map((x) => (x ? Object.assign({}, x) : null));
  for (let s = 12; s < 16; s++) if (b[s]) { b[s].iv = pick(r, [0, 12, 7, 10, 3, 5, 12]); b[s].slide = s < 15 && !!b[s + 1] && r() < 0.35; }
  return { bars: [a.steps, b], mut: a.mut }; }
// ---------- riff: the rolling lead of psytrance and trance drops (v9.1) ----------
// Measured on v9: the psy lead was ONE bar of an acid sequence looped for 48 bars over one chord (A4 A4 A3 A3 A4 A3 G3 E4 …
// in every bar), and the second voice played 2–3 long notes a bar — a loop, not a part. A riff is how these leads are written:
//   · a TWO-bar cell in sixteenths, a call and its answer (the answer ends open, on the third or the fifth)
//   · notes are scale steps above the current chord's root, so the riff follows the progression diatonically (the pedal IS the
//     chord root, every accented step is a chord tone)
//   · idiomatic shapes: a pedal answered by a moving upper line · a rolling arpeggio · a 3+3+2 gallop · a stepwise melody
//   · a variation (a new answer) for alternate eight bars, and a turnaround bar that runs into the next phrase
const RIFF_RH = {
  pedal: ['xxxxxxxxxxxxxxxx', 'xx.xxx.xxx.xxx.x', 'x.xxx.xxx.xxx.xx'],
  roll: ['xxxxxxxxxxxxxxxx', 'xxx.xxx.xxx.xxx.', 'xx.xxx.xx.xxx.xx'],
  gallop: ['x..x..x.x..x..x.', 'x.xx.xx.x.xx.xx.', 'xx.xx.x.xx.xx.x.'],
  melody: ['x.x.xxx.x.x.xxx.', 'x.xx.x.xx.xx.x..', 'x..xx.x.x..xx.x.'] };
function nearCT(d) { let best = 0, bd = 99; for (const c of [-3, 0, 2, 4, 7, 9, 11]) { const dd = Math.abs(c - d); if (dd < bd) { bd = dd; best = c; } } return best; } // the nearest chord tone, in scale steps above the root
function makeRiff(r, styles) {
  const style = styles && styles.length ? pick(r, styles) : wpick(r, ['pedal', 'roll', 'gallop', 'melody'], [4, 3, 2, 3]);
  const RH = RIFF_RH[style] || RIFF_RH.pedal, rA = pick(r, RH), rB = r() < 0.6 ? rA : pick(r, RH);
  const gen = (rh, start, endOn) => { const steps = new Array(16).fill(null), on = []; for (let s = 0; s < 16; s++) if (rh[s] !== '.') on.push(s);
    let d = start, up = pick(r, [4, 7, 2]), dir = r() < 0.5 ? 1 : -1, last = 0;
    on.forEach((s, k) => { let x;
      if (style === 'pedal') { if (k % 2 === 0) x = 0; else { x = up; up += dir * (r() < 0.75 ? 1 : 2); if (up >= 9) { up = 9; dir = -1; } if (up <= 2) { up = 2; dir = 1; } } }
      else if (style === 'roll') { const ar = start >= 4 ? [7, 4, 2, 0, 2, 4] : [0, 2, 4, 7, 4, 2]; x = ar[k % ar.length] + (Math.floor(k / ar.length) % 2 ? 2 : 0); }
      else if (style === 'gallop') { const g = s % 8; x = g === 0 ? 0 : g < 3 ? up : g < 6 ? up + 2 : 4; if (g === 7) up = pick(r, [2, 4, 5, 7]); }
      else { if (k) { const mv = Math.abs(last) >= 3 ? -Math.sign(last) : wpick(r, [1, 2, 3, 0], [55, 25, 10, 10]) * (r() < (d < 2 ? 0.75 : d > 7 ? 0.25 : 0.5) ? 1 : -1); d = Math.max(-2, Math.min(9, d + mv)); last = mv; } x = d; }
      if (s % 4 === 0) x = nearCT(x);
      steps[s] = { d: x, acc: s % 4 === 0 || (s % 4 === 2 && r() < 0.35) ? 1 : 0, slide: 0 }; });
    if (endOn != null && on.length) steps[on[on.length - 1]].d = endOn;
    for (let s = 0; s < 15; s++) { const a = steps[s], b = steps[s + 1]; if (a && b && a.d !== b.d && Math.abs(a.d - b.d) <= 2 && r() < 0.22) a.slide = 1; }
    return steps; };
  const startA = style === 'roll' ? pick(r, [0, 4]) : style === 'melody' ? pick(r, [4, 2, 7]) : 0;
  const A = gen(rA, startA, null), B = gen(rB, startA, pick(r, [4, 2])), B2 = gen(rB, startA, pick(r, [2, 4, 7]));
  const T = A.map((x) => (x ? Object.assign({}, x) : null)), up = r() < 0.5; // turnaround: the call, then a run into the next phrase
  for (let s = 8, k = 0; s < 16; s++, k++) T[s] = { d: up ? [0, 2, 4, 7, 9, 7, 9, 11][k] : [7, 6, 5, 4, 3, 2, 1, 0][k], acc: s % 4 === 0 ? 1 : 0, slide: 0 };
  return { style, A, B, B2, T };
}
// one bar of a riff: which cell (call / answer / variation / turnaround) by the bar's place in its phrase; the pedal is the chord root
// nearest the bottom of the range, so the line moves by the smallest step when the chord changes
function riffBar(P, R, b, c, lo, hi) { const p8 = b % 8, alt = (b >> 3) & 1, cell = p8 === 7 ? R.T : p8 % 2 === 0 ? R.A : alt ? R.B2 : R.B;
  const pedal = nearPc(chordPc(P, c), lo + 4), rootD = midiToDeg(P, pedal, 0), out = [];
  for (let s = 0; s < 16; s++) { const st = cell[s]; if (!st) continue; let m = degToMidi(P, rootD + st.d, 0); while (m > hi) m -= 12; while (m < lo) m += 12; out.push({ s, m, acc: st.acc, slide: st.slide }); }
  return out; }
function makeChop(r, rhythms) { const a = pick(r, rhythms), b = pick(r, rhythms), c3 = a.split('').map((ch, i) => (i >= 12 ? (ch === '.' && i % 2 === 0 ? 'x' : '.') : ch)).join(''); // the fourth bar answers: the last beat re-cut
  return { rh: [a, b], rh3: c3, idx: Array.from({ length: 4 }, () => Math.floor(r() * 4)), vow: Array.from({ length: 4 }, () => VOWEL_IDX[pick(r, ['a', 'o', 'e', 'a', 'u'])]), len: Array.from({ length: 3 }, () => pick(r, [0.8, 1, 1.6, 2])) }; }
// vocal chops differ wildly in energy (2 vs 5 hits a bar, 0.8 vs 2-step notes, a dark 'u' vs a bright 'e' formant): measured
// across seeds the chop sat anywhere from 2 to 11 LU under the kick. Each chop idea is rendered once through the genre's own
// vox kit (crudely K-weighted, like the loudness meter) and its velocity scaled to the energy of a reference chop
// (4 hits a bar, one step long, vowel a). Deterministic: the engine noise stream is restored afterwards.
const CHOP_REF = new Map();
function chopEnergy(kit, bpm, rh, len, vow) { const sr = 16000, syn = new Synth(sr, 6, false), sps = sr * 60 / bpm / 4, c = 70; syn.setKit(kit); syn.bpm = bpm;
  const o = { slide: false, accent: false, bright: 1, lfo: 0, pan: 0, vowel: 'a', from: 0, fit: false }, hits = []; rh.forEach((r, bar) => { for (const e of parsePat(r)) hits.push(bar * 16 + e.step); });
  const N = Math.round(32 * sps + sr * 0.3), L = new Float32Array(128), R = new Float32Array(128); let e = 0, k = 0, hp = 0, lp = 0, px = 0; const aLp = 1 - Math.exp(-2 * Math.PI * 1500 / sr), aHp = 1 - Math.exp(-2 * Math.PI * 100 / sr);
  for (let t = 0; t < N; t += 128) { while (k < hits.length && hits[k] * sps < t + 128) { o.vowel = VOWEL_LIST[vow[k % vow.length]]; syn.trigger(Math.max(0, Math.round(hits[k] * sps - t)), c, 0.9, len[k % len.length] * sps, o); k++; }
    L.fill(0); R.fill(0); syn.render(L, R, 128); for (let i = 0; i < 128; i++) { const x = L[i] + R[i]; hp += (x - hp) * aHp; const y0 = x - hp; lp += (y0 - lp) * aLp; const y = y0 + 0.6 * (y0 - lp); e += y * y; px = x; } } void px; return e / N; }
function chopLevel(G, bpm, idea) { const kit = G.lead.kit, nz = NZ; const key = JSON.stringify(kit) + Math.round(bpm);
  if (!CHOP_REF.has(key)) { CHOP_REF.set(key, chopEnergy(kit, bpm, ['x...x...x...x...', 'x...x...x...x...'], [1], [0])); if (CHOP_REF.size > 64) CHOP_REF.clear(); }
  const e = chopEnergy(kit, bpm, idea.rh, idea.len, idea.vow); NZ = nz; const ref = CHOP_REF.get(key);
  return e > 1e-12 && ref ? Math.max(0.6, Math.min(1.6, Math.sqrt(ref / e))) : 1; }
// mask (the lead's bar, see leadMask): a note on a lead onset is dropped to a ghost, under a held lead note it steps back,
// in the lead's gaps it comes forward (and a little brighter) — call and response, not two parts at once
// variant (v9.1): alternate eight bars play the pattern rotated by two and its last beat an octave up; turn: the phrase's last bar ends
// on a run up the chord tones into the next phrase (measured before: the same arpeggio bar for a whole drop, 8–27 repeats)
function renderArp(P, A, c, t0, silentFrom, ch, vel, bright, S, sw, mask, variant, turn) {
  const cfg = A.arp, base = voiceLead(chordPc(P, c), chordIvs(P, c), null, A.range[0], A.range[0] + 12, 4);
  const tones = []; for (let o = 0; o < cfg.oct; o++) for (const m of base) if (m + 12 * o <= A.range[1]) tones.push(m + 12 * o);
  const rate = cfg.rate || 1, pat = variant ? cfg.pat.slice(2).concat(cfg.pat.slice(0, 2)) : cfg.pat; let k = 0, run = 0;
  for (let s = 0; s < 16; s += rate) { if (s >= silentFrom) break; let m = turn && s >= 12 ? tones[Math.min(tones.length - 1, run++ + Math.max(0, tones.length - 5))] : tones[pat[k % pat.length] % tones.length]; if (variant && !turn && s >= 12 && m + 12 <= A.range[1] + 7) m += 12;
    const lm = mask ? mask[Math.min(15, Math.round(s))] : 0, mv = mask ? (lm === 2 ? 0.45 : lm === 1 ? 0.8 : 1.15) : 1;
    S.push(t0 + s + sw(s), ch, m, Math.min(1, vel * (s % 4 === 0 ? 1 : 0.82) * mv), Math.min(rate * 0.85, silentFrom - s), 0, mask && lm === 0 ? Math.min(1, bright * 1.1) : bright); k++; }
}

// ---------- the set brain (v9.2): which genre Auto-DJ plays next ----------
// Measured on 9.1 (20,000 picks of the app's own code): 64.7 % of the moves changed family, 11.8 % went straight back to the genre two
// tracks earlier (A → B → A), a psytrance set left psy within one or two tracks (its long-run share 0.3 %), and no energy or tempo
// plan at all. Now every candidate is weighed: the journey (stay / family / flow), how long the current genre has run (a genre
// plays two or three tracks, then the set moves on), no return to any of the last four genres, the energy the set wants next (an
// endless wave: three tracks rising, one at the top, one breath, around the energy the set started at), and the tempo (the nearer
// the genre's window to the set's tempo, the likelier — the tempo glide after a mix is bounded).
const JOURNEY_NEXT = { house: ['house', 'garage', 'afro', 'techno'], techno: ['techno', 'house', 'trance', 'breaks'], trance: ['trance', 'psy', 'techno', 'house'], psy: ['psy', 'trance', 'techno'], dnb: ['dnb', 'breaks', 'bass'], bass: ['bass', 'hiphop', 'dnb'], hiphop: ['hiphop', 'bass', 'latin'], garage: ['garage', 'house', 'breaks'], afro: ['afro', 'house', 'latin'], latin: ['latin', 'afro', 'hiphop'], hard: ['hard', 'techno', 'trance'], pop: ['pop', 'bass', 'chill'], chill: ['chill', 'ambient', 'pop'], breaks: ['breaks', 'techno', 'dnb'], ambient: ['ambient', 'chill'] };
const SET_ENERGY = { ambient: 0.1, lofi: 0.15, downtempo: 0.25, 'dub-techno': 0.45, 'deep-house': 0.42, 'nu-disco': 0.45, amapiano: 0.45, 'afro-house': 0.5, synthwave: 0.5, house: 0.55, 'progressive-house': 0.56, reggaeton: 0.55, 'tech-house': 0.6, ukg: 0.6, 'future-bass': 0.6, moombahton: 0.6, 'uk-drill': 0.6, 'melodic-techno': 0.64, electro: 0.65, breakbeat: 0.66, trap: 0.66, 'jersey-club': 0.7, 'prog-psy': 0.74, techno: 0.75, acid: 0.76, trance: 0.76, dubstep: 0.8, jungle: 0.8, 'big-room': 0.84, psytrance: 0.86, dnb: 0.86, 'hard-techno': 0.9, hardstyle: 0.95 };
const SET_WAVE = [0, 0.05, 0.1, 0.15, 0.04, -0.06]; // the energy the set reaches for, track after track, around where it started
// ctx: { journey: 'flow'|'family'|'stay', hist: [gid… oldest first, the playing one last], bpm: the set's tempo, home: the energy it
// started at, step: the track count, rnd } → { gid, why, target }
function planNext(gid, ctx) { ctx = ctx || {}; const G = GENRE_BY_ID[gid], rnd = ctx.rnd || Math.random, j = ctx.journey || 'flow', hist = ctx.hist || [gid];
  if (j === 'stay' || !G) return { gid, why: 'the same genre (journey: same genre)' };
  let run = 0; for (let k = hist.length - 1; k >= 0 && hist[k] === gid; k--) run++; run = Math.max(1, run);
  const recent = new Set(hist.slice(-5, -1).filter((x) => x !== gid)), home = ctx.home != null ? ctx.home : SET_ENERGY[gid] ?? 0.6, step = ctx.step || 0, homeFam = ctx.homeFam || (GENRE_BY_ID[hist[0]] || G).family;
  const target = Math.max(0.1, Math.min(1, home + SET_WAVE[step % SET_WAVE.length])), bpm = ctx.bpm || (G.bpm[0] + G.bpm[1]) / 2, fams = JOURNEY_NEXT[G.family] || [G.family];
  const mid = (g) => (g.bpm[0] + g.bpm[1]) / 2, tempoOff = (g) => (bpm < g.bpm[0] ? g.bpm[0] - bpm : bpm > g.bpm[1] ? bpm - g.bpm[1] : 0) / bpm;
  const cands = []; for (const c of GENRES) { let w;
    if (c.id === gid) { cands.push([c.id, 0, SET_ENERGY[c.id] ?? 0.6]); continue; } // (staying: weighted after the loop)
    else if (j === 'family') w = c.family === G.family ? 1 : 0;
    else w = c.family === G.family ? 1 : fams.includes(c.family) ? 0.7 : c.family === homeFam ? 0.7 : 0; // (the home style is always one move away)
    if (!w) continue; if (recent.has(c.id)) w *= 0.03; // no A → B → A within four tracks
    if (homeFam && c.id !== gid) { const hf = JOURNEY_NEXT[homeFam] || [homeFam]; w *= c.family === homeFam ? 2.6 : hf.includes(c.family) ? 1 : 0.25; } // the set's home style pulls: a psy set stays psy-led, with excursions
    const e = SET_ENERGY[c.id] ?? 0.6; w *= Math.exp(-Math.abs(e - target) / 0.12);
    const homeBpm = ctx.homeBpm || bpm; if (c.family !== homeFam || c.id === gid || Math.abs(mid(c) - homeBpm) > homeBpm * 0.12) { const to = tempoOff(c); if (j === 'flow' && c.id !== gid && Math.abs(mid(c) - mid(G)) > mid(G) * 0.09) w *= 0.15; w *= Math.exp(-to / 0.03); } // (the way home is never too far in tempo: the glide after the mix brings the set back)
    cands.push([c.id, w, e]); }
  // a genre plays two to four tracks, then the set moves on: staying has a set chance by the length of the run (72 %, then 62 %, 40 %,
  // 15 %), whatever the number of neighbours (as a weight among them it came out at 20–30 %: a new genre every 1.4 tracks, measured)
  const stay = cands.find((c) => c[0] === gid); let others = 0; for (const c of cands) if (c !== stay) others += c[1];
  if (stay) { const p = [0.72, 0.62, 0.4, 0.15][Math.min(3, run - 1)]; stay[1] = others > 0 ? others * p / (1 - p) : 1; }
  if (!cands.length) return { gid, why: 'nothing fits: the same genre', target };
  let tot = 0; for (const c of cands) tot += c[1]; let x = rnd() * tot, pick = cands[cands.length - 1]; for (const c of cands) { x -= c[1]; if (x <= 0) { pick = c; break; } }
  const name = (id) => (GENRE_BY_ID[id] || { name: id }).name, why = pick[0] === gid ? `${name(gid)} again (track ${run + 1} of the run)` : `${name(gid)} → ${name(pick[0])}: energy ${pick[2] > (SET_ENERGY[gid] ?? 0.6) + 0.02 ? 'up' : pick[2] < (SET_ENERGY[gid] ?? 0.6) - 0.02 ? 'down' : 'level'} (the set reaches for ${target.toFixed(2)})`;
  return { gid: pick[0], why, target }; }
