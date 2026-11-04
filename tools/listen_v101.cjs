// DJ TiTo 10.1 listening pack — the app's own engine path and MP3 encoder.
//   master-<genre>-10.0 / -10.1   the same 8 bars of a drop: 10.0 as the last pack played it (Club master, no Smooth) against 10.1 (Clean master,
//                                 Smooth on) — the Clean master sits 3 dB lower: turn the 10.1 clip up to compare
//   candy-<kind>                  4 bars of a techno groove, the candy fired on bar 2 (in key, into its echo)
//   atmos-<kind>                  4 bars of a deep house breakdown with an atmosphere chosen (level 1.4 so it can be heard)
// Usage: node tools/listen_v101.cjs <outdir>
const { X, renderTrack, appScore } = require('./render.cjs'); const { lufs, truePeak } = require('./lib/dsp.cjs'); const fs = require('fs'); const cal = require('../src/engine/calibration.json');
const OUT = process.argv[2] || 'listen-v10.1'; fs.mkdirSync(OUT, { recursive: true }); const lines = [], sr = 44100;
function mp3(name, r, note) { const e = X.mp3Encoder(r.sr, 2, 192); e.push(r.L, r.R, r.L.length); fs.writeFileSync(`${OUT}/${name}.mp3`, e.finish());
  const l = `${name}.mp3\t${(r.L.length / r.sr).toFixed(1)} s · ${lufs(r.L, r.R, r.sr).I.toFixed(1)} LUFS · ${truePeak(r.L, r.R).toFixed(2)} dBTP\t${note || ''}`; lines.push(l); console.log(l); }
// 1. master: 10.0 (Club, no Smooth) against 10.1 (Clean, Smooth)
for (const [g, seed] of [['deep-house', 3001], ['tech-house', 3002], ['trance', 3003], ['melodic-techno', 3004], ['dnb', 3005], ['afro-house', 3006]]) { const s = appScore(g, seed), d = X.peakSectionOf(s);
  X.noiseSeed(11); const a = renderTrack(g, seed, { score: s, fromBar: d.bar0, toBar: d.bar0 + 8, masterDb: cal[g].master, smooth: 0 }); mp3(`master-${g}-10.0`, a, `${g}: 10.0 — Club master, no Smooth`);
  X.noiseSeed(11); const b = renderTrack(g, seed, { score: s, fromBar: d.bar0, toBar: d.bar0 + 8, masterDb: cal[g].master - 4 }); mp3(`master-${g}-10.1`, b, `${g}: 10.1 — Clean master (−4 dB into the limiter), Smooth on`); }
// a deck in the engine, from a section, with commands at given bars (one bar = 16 steps)
function play(g, seed, secType, bars, at, setup) { const s = appScore(g, seed), sec = s.sections.find((x) => x.type === secType) || X.peakSectionOf(s), E = new X.Engine(sr); E.cmd({ type: 'load', deck: 0, score: s, cal: cal[g], play: true, from: sec.bar0 * 16 }); E.cmd({ type: 'level', db: -4 }); for (const c of setup || []) E.cmd(c);
  const D = E.decks[0], n = Math.round(bars * 16 * D.sps), L = new Float32Array(n), R = new Float32Array(n), bl = new Float32Array(128), br = new Float32Array(128);
  for (let i = 0; i < n; i += 128) { for (const [bar, c] of at) { const t = Math.round(bar * 16 * D.sps); if (t >= i && t < i + 128) E.cmd(c); } E.render(bl, br, 128); for (let j = 0; j < 128 && i + j < n; j++) { L[i + j] = bl[j]; R[i + j] = br[j]; } } return { L, R, sr }; }
// 2. the minimal candy, one by one, over a techno groove
for (const [k, name] of [[14, 'blip'], [15, 'sonar'], [16, 'click'], [17, 'dub-stab'], [18, 'drop'], [19, 'glitch'], [9, 'bubbles']]) { X.noiseSeed(11);
  mp3(`candy-${name}`, play('techno', 3011, 'groove', 4, [[1, { type: 'fxNow', deck: 0, kind: k, v: 0.9, steps: k === 9 ? 4 : 3, note: 72 }], [2.5, { type: 'fxNow', deck: 0, kind: k, v: 0.8, steps: k === 9 ? 4 : 3, note: 76 }]], [{ type: 'candy', deck: 0, allow: 0, density: 0 }]), `techno groove: ${name}, bars 2 and 3`); }
// 3. atmospheres under a deep house breakdown
for (const [k, name] of [[1, 'vinyl'], [2, 'air'], [3, 'dark'], [5, 'rain']]) { X.noiseSeed(11); mp3(`atmos-${name}`, play('deep-house', 3021, 'break', 4, [], [{ type: 'atmos', deck: 0, kind: k, level: 1.4, tone: 0 }]), `deep house breakdown: atmosphere ${name}`); }
fs.writeFileSync(`${OUT}/LEVELS.txt`, 'DJ TiTo 10.1 listening pack — the app\'s own engine path, its own MP3 encoder (192 kbit/s)\n' + lines.join('\n') + '\n'); console.log('wrote', OUT);
