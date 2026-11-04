// v9.5 preview pack (for judging before more is built): rendered through the app's own engine path, FORGE's own MP3 encoder.
//   build-*      the last 4 bars of a build and 2 bars of its drop, as the composer now writes them (a layered transition recipe)
//   tx-*         single recipes on their own (a riser, a downlifter, a sub drop, an impact, a swell), in the key of C minor
//   mangle-*     2 bars of a drop as written, then 4 bars with one Mangle engine on (the whole deck unless said)
// Usage: node tools/listen_v95a.cjs <outdir>
const { X, renderTrack, appScore } = require('./render.cjs'); const { lufs, truePeak } = require('./lib/dsp.cjs'); const fs = require('fs'); const cal = require('../src/engine/calibration.json');
const OUT = process.argv[2] || 'listen-v9.5a'; fs.mkdirSync(OUT, { recursive: true }); const lines = [], sr = 44100;
function mp3(name, r, note) { const e = X.mp3Encoder(r.sr, 2, 192); e.push(r.L, r.R, r.L.length); fs.writeFileSync(`${OUT}/${name}.mp3`, e.finish());
  const l = `${name}.mp3\t${(r.L.length / r.sr).toFixed(1)} s · ${lufs(r.L, r.R, r.sr).I.toFixed(1)} LUFS · ${truePeak(r.L, r.R).toFixed(2)} dBTP\t${note || ''}`; lines.push(l); console.log(l); }
const RNAME = (k) => (X.TX_RECIPES.find((r) => r.k === k) || { id: '?' }).id;
// 1. builds into drops, as composed
{ const used = new Set(); let n = 0; const typ = (k) => (X.TX_RECIPES.find((r) => r.k === k) || {}).type;
  for (const gid of ['melodic-techno', 'trance', 'progressive-house', 'techno', 'psytrance', 'dnb', 'future-bass', 'deep-house']) { for (let seed = 1; seed < 30; seed++) { const s = appScore(gid, 9500 + seed), E = s.ev; let hit = null;
    for (const b of s.sections) { if (b.type !== 'build') continue; const t0 = b.bar0 * 16, t1 = (b.bar0 + b.bars) * 16; for (let i = 0; i < E.n; i++) if (E.ch[i] === 9 && E.a[i] === 13 && E.t[i] >= t0 && E.t[i] < t1 && typ(E.f[i]) === 'rise' && !used.has(E.f[i])) { hit = { b, k: E.f[i] }; break; } if (hit) break; }
    if (!hit) continue; used.add(hit.k); const b = hit.b, t1 = (b.bar0 + b.bars) * 16, land = []; for (let i = 0; i < E.n; i++) if (E.ch[i] === 9 && E.a[i] === 13 && E.t[i] >= t1 - 1 && E.t[i] < t1 + 16) land.push(`${typ(E.f[i])} ${RNAME(E.f[i])}`);
    mp3(`build-${++n}-${gid}`, renderTrack(gid, 9500 + seed, { score: s, fromBar: Math.max(0, b.bar0 + b.bars - 4), toBar: Math.min(s.meta.bars, b.bar0 + b.bars + 2) }), `${gid} · riser: ${RNAME(hit.k)}${land.length ? ' · on the drop: ' + land.join(', ') : ''}`); break; } } }
// 2. single recipes
function solo(k, steps, note) { X.noiseSeed(7); const fx = new X.Fx(sr); fx.setTempo(126); const sps = sr * 60 / 126 / 4, dur = Math.round(steps * sps), N = dur + Math.round(sr * 2.5), L = new Float32Array(N), R = new Float32Array(N), bl = new Float32Array(128), br = new Float32Array(128);
  fx.trigger(0, 13, 0.9, dur, note, 3, k); for (let i = 0; i < N; i += 128) { bl.fill(0); br.fill(0); fx.render(bl, br, 128); for (let j = 0; j < 128 && i + j < N; j++) { L[i + j] = bl[j]; R[i + j] = br[j]; } }
  let pk = 0; for (let i = 0; i < N; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i])); const g = 0.6 / Math.max(1e-6, pk); for (let i = 0; i < N; i++) { L[i] *= g; R[i] *= g; } return { L, R, sr }; } /* (each alone, peak-normalised to −4.4 dBFS: for listening to its shape, not its level) */
for (const [id, steps] of [['euphoric-climb', 64], ['shimmer-swell-rise', 64], ['clap-roll-rise', 32], ['wide-swirl-rise', 64], ['noise-fall', 32], ['gated-fall', 32]]) { const R = X.TX_RECIPES.find((r) => r.id === id); if (R) mp3(`tx-${id}`, solo(R.k, steps, 60), `${R.type} · ${steps / 16} bars`); }
for (const type of ['sub', 'impact', 'swell']) { const R = X.TX_RECIPES.find((r) => r.type === type); mp3(`tx-${R.id}`, solo(R.k, type === 'swell' ? 16 : 32, type === 'sub' ? 36 : 60), R.type); }
// 3. Mangle on a drop
function mangled(gid, seed, m, note) { const s = appScore(gid, seed), d = s.sections.find((x) => x.type === 'drop') || X.peakSectionOf(s), E = new X.Engine(sr); E.cmd({ type: 'load', deck: 0, score: s, cal: cal[gid], play: true, from: d.bar0 * 16 }); const D = E.decks[0];
  const n = Math.round(96 * D.sps), on = Math.round(32 * D.sps), L = new Float32Array(n), R = new Float32Array(n), bl = new Float32Array(128), br = new Float32Array(128);
  for (let i = 0; i < n; i += 128) { if (i <= on && on < i + 128) for (const c of m) E.cmd(Object.assign({ type: 'mangle', deck: 0 }, c)); E.render(bl, br, 128); for (let j = 0; j < 128 && i + j < n; j++) { L[i + j] = bl[j]; R[i + j] = br[j]; } } mp3(`mangle-${note.split(' ')[0].toLowerCase()}-${gid}`, { L, R, sr }, note); }
mangled('techno', 41, [{ slot: 0, on: true, mode: 'slice', sub: 1, macro: 0.6, a: 0.3, b: 0.25, c: 0, hold: 1 }], 'Slice · 1/16 · Chaos 0.6 (Glitch roll)');
mangled('deep-house', 42, [{ target: 5 }, { slot: 0, on: true, mode: 'grain', sub: 2, macro: 0.6, a: 0.3, b: 0.7, c: 0.2, hold: 1 }], 'Grain · Chord · frozen, on the chords (Frozen choir)');
mangled('tech-house', 43, [{ target: 3 }, { slot: 0, on: true, mode: 'spectral', sub: 2, macro: 0.9, a: 0.55, b: 0.5, c: 0 }], 'Spectral · Key on the percussion (Tuned drums)');
mangled('melodic-techno', 44, [{ slot: 0, on: true, mode: 'spectral', sub: 0, macro: 1, a: 0.55, b: 0.5, c: 0.3 }], 'Spectral · Freeze (Ice)');
mangled('progressive-house', 45, [{ target: 7 }, { slot: 0, on: true, mode: 'steps', sub: 0, macro: 0.7, a: 0.45, b: 0.7, c: 0.6 }], 'Steps · Up, on the lead (Stairway)');
mangled('trance', 46, [{ slot: 0, on: true, mode: 'spiral', sub: 2, macro: 0.75, a: 0.35, b: 0.5, c: 0.7 }], 'Spiral · rising over 2 bars (Barber pole)');
mangled('acid', 47, [{ target: 4 }, { slot: 0, on: true, mode: 'vowel', sub: 3, macro: 0.5, a: 0.8, b: 0.7, c: 0.6 }], 'Vowel · 1/4 LFO on the bass (Yoy bass)');
mangled('techno', 48, [{ slot: 0, on: true, mode: 'slice', sub: 2, macro: 0.85, a: 0.7, b: 0.5, c: 0.35, hold: 0 }, { slot: 1, on: true, mode: 'spectral', sub: 1, macro: 0.8, a: 0.45, b: 0.5, c: 0.1 }, { morph: 0.5 }], 'Morph · Tape chop and Smear half and half');
fs.writeFileSync(`${OUT}/LEVELS.txt`, lines.join('\n') + '\n');
// 4. the ear candy, 9.4 against 9.5, in a drop: fired on beat 3 of every bar for 4 bars, in key (the chord that plays)
function candy(gid, seed, kind, steps, legacy) { const s = appScore(gid, seed), d = s.sections.find((x) => x.type === 'drop') || X.peakSectionOf(s), E = new X.Engine(sr); E.cmd({ type: 'load', deck: 0, score: s, cal: cal[gid], play: true, from: d.bar0 * 16 }); const D = E.decks[0]; D.fx.legacy = legacy ? 1 : 0;
  const n = Math.round(80 * D.sps), L = new Float32Array(n), R = new Float32Array(n), bl = new Float32Array(128), br = new Float32Array(128), fire = [8, 24, 40, 56].map((x) => Math.round(x * D.sps));
  for (let i = 0; i < n; i += 128) { for (const f of fire) if (i <= f && f < i + 128) { const bar = d.bar0 + Math.floor(f / D.sps / 16), tones = (s.chords && s.chords[bar] && s.chords[bar].tones) || [s.meta.key]; E.cmd({ type: 'fxNow', deck: 0, kind, steps, note: 60 + (((tones[(f / D.sps / 16) % tones.length] || 0) % 12) + 12) % 12, pan: 0.4, v: 0.85 }); }
    E.render(bl, br, 128); for (let j = 0; j < 128 && i + j < n; j++) { L[i + j] = bl[j]; R[i + j] = br[j]; } } return { L, R, sr }; }
for (const [kind, name, steps, gid] of [[7, 'glass', 2.5, 'psytrance'], [8, 'harp', 3, 'trance'], [10, 'wind', 16, 'melodic-techno'], [11, 'acid', 2.5, 'psytrance'], [12, 'ping', 2, 'techno']]) {
  mp3(`candy-${name}-new`, candy(gid, 77, kind, steps, 0), `9.5 ${name} in a ${gid} drop`); mp3(`candy-${name}-old`, candy(gid, 77, kind, steps, 1), `9.4 sound it replaces, same bars`); }
fs.writeFileSync(`${OUT}/LEVELS.txt`, lines.join('\n') + '\n');
