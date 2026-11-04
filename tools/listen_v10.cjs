// DJ TiTo 10 listening pack: rendered through the app's own engine path (the palette and levels a new track gets), DJ TiTo's own MP3 encoder.
//   space-<genre>-before / -after   the same 8 bars of a drop with the mix carve off (the 9.5 mix) and on (10)
//   breathe-<genre>                 4 bars of a breakdown: the pads pump on the beat with no kick
//   predrop-<genre>                 the last 2 bars of a build and 2 of the drop: the bass steps out, the drop lands into the gap
//   parts-fx                        8 bars of a drop: a delay on the bass, then a reverb added on the chords — both keep playing
// Usage: node tools/listen_v10.cjs <outdir>
const { X, renderTrack, appScore } = require('./render.cjs'); const { lufs, truePeak } = require('./lib/dsp.cjs'); const fs = require('fs'); const cal = require('../src/engine/calibration.json');
const OUT = process.argv[2] || 'listen-v10'; fs.mkdirSync(OUT, { recursive: true }); const lines = [], sr = 44100;
function mp3(name, r, note) { const e = X.mp3Encoder(r.sr, 2, 192); e.push(r.L, r.R, r.L.length); fs.writeFileSync(`${OUT}/${name}.mp3`, e.finish());
  const l = `${name}.mp3\t${(r.L.length / r.sr).toFixed(1)} s · ${lufs(r.L, r.R, r.sr).I.toFixed(1)} LUFS · ${truePeak(r.L, r.R).toFixed(2)} dBTP\t${note || ''}`; lines.push(l); console.log(l); }
// 1. Space: the drop with the carve off and on
for (const [g, seed] of [['melodic-techno', 1001], ['synthwave', 1002], ['trance', 1003], ['deep-house', 1004], ['dnb', 1005], ['afro-house', 1006]]) {
  const s = appScore(g, seed), d = X.peakSectionOf(s);
  for (const [tag, carve] of [['before', 0], ['after', 1]]) { X.noiseSeed(11); mp3(`space-${g}-${tag}`, renderTrack(g, seed, { score: s, fromBar: d.bar0, toBar: d.bar0 + 8, carve }), `${g} drop · Space ${carve ? 'on (10)' : 'off (9.5)'}`); } }
// 2. breakdowns that breathe
for (const [g, seed] of [['trance', 1011], ['progressive-house', 1012], ['melodic-techno', 1013]]) { const s = appScore(g, seed), b = s.sections.find((x) => x.type === 'break'); if (!b) continue; X.noiseSeed(11);
  mp3(`breathe-${g}`, renderTrack(g, seed, { score: s, fromBar: b.bar0 + Math.max(0, b.bars - 6), toBar: b.bar0 + b.bars }), `${g} breakdown: the pads pump on the beat, no kick`); }
// 3. the bass out before the drop
for (const [g, seed0] of [['techno', 1021], ['tech-house', 1022], ['dubstep', 1023], ['trance', 1024]]) { let done = false;
  for (let seed = seed0; seed < seed0 + 12 && !done; seed++) { const s = appScore(g, seed); for (let k = 0; k < s.sections.length - 1 && !done; k++) { const b = s.sections[k], n = s.sections[k + 1]; if (b.type !== 'build' || n.type !== 'drop') continue;
      const t0 = (b.bar0 + b.bars - 1) * 16 + 8, t1 = t0 + 8; let bass = 0, before = 0; for (let i = 0; i < s.ev.n; i++) if (s.ev.ch[i] === 4) { if (s.ev.t[i] >= t0 && s.ev.t[i] < t1) bass++; if (s.ev.t[i] >= t0 - 16 && s.ev.t[i] < t0) before++; }
      if (bass || !before) continue; X.noiseSeed(11); mp3(`predrop-${g}`, renderTrack(g, seed, { score: s, fromBar: b.bar0 + b.bars - 2, toBar: n.bar0 + 2 }), `${g}: the bass steps out for the last two beats of the build`); done = true; } } }
// 4. effects on two parts at once
{ const g = 'deep-house', s = appScore(g, 1031), d = X.peakSectionOf(s), E = new X.Engine(sr); E.cmd({ type: 'load', deck: 0, score: s, cal: cal[g], play: true, from: d.bar0 * 16 }); const D = E.decks[0];
  const n = Math.round(128 * D.sps), a = Math.round(32 * D.sps), b = Math.round(64 * D.sps), L = new Float32Array(n), R = new Float32Array(n), bl = new Float32Array(128), br = new Float32Array(128);
  for (let i = 0; i < n; i += 128) { if (i <= a && a < i + 128) E.cmd({ type: 'fx', deck: 0, name: 'delay', on: true, amt: 0.6, beat: 2, p: { fb: 0.55 }, q: false, ch: 4 }); if (i <= b && b < i + 128) E.cmd({ type: 'fx', deck: 0, name: 'reverb', on: true, amt: 0.7, p: { size: 0.8 }, q: false, ch: 5 });
    E.render(bl, br, 128); for (let j = 0; j < 128 && i + j < n; j++) { L[i + j] = bl[j]; R[i + j] = br[j]; } }
  mp3('parts-fx', { L, R, sr }, 'deep house drop: bar 3 a delay on the bass, bar 5 a reverb added on the chords — the bass delay keeps going'); }
fs.writeFileSync(`${OUT}/LEVELS.txt`, 'DJ TiTo 10 listening pack — the app\'s own engine path, its own MP3 encoder (192 kbit/s)\n' + lines.join('\n') + '\n'); console.log('wrote', OUT);
