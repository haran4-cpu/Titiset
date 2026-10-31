// v9.3 listening pack, phase A: the six drum families on one groove, and harmony excerpts (where the chords meet the kick), as MP3.
// Usage: node tools/listen_v93.cjs <outdir> [tag=v9.3] [--harmony-only]   (--harmony-only also runs on a 9.2 tree: the "before")
const { X, renderTrack, wav } = require('./render.cjs'); const { lufs, truePeak } = require('./lib/dsp.cjs'); const { execFileSync } = require('child_process'); const fs = require('fs');
const OUT = process.argv[2] || 'listen', TAG = (process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : 'v9.3'), ONLY_H = process.argv.includes('--harmony-only'); fs.mkdirSync(OUT, { recursive: true });
const lines = [];
function out(name, r, note) { const f = `${OUT}/${name}-${TAG}`; wav(f + '.wav', r.L, r.R, r.sr); execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', f + '.wav', '-b:a', '256k', f + '.mp3']); fs.unlinkSync(f + '.wav');
  const l = `${name}-${TAG}.mp3  ${(r.L.length / r.sr).toFixed(1)} s · ${lufs(r.L, r.R, r.sr).I.toFixed(1)} LUFS · true peak ${truePeak(r.L, r.R).toFixed(2)} dBTP${note ? ' · ' + note : ''}`; lines.push(l); console.log(l); }
function excerpt(gid, seed, type, bars, mod) { const s = X.composeTrack(gid, seed), k = Math.max(0, s.sections.findIndex((x) => x.type === type)), S = s.sections[k]; if (mod) mod(s);
  return renderTrack(gid, seed, { score: s, fromBar: S.bar0, toBar: Math.min(s.meta.bars, S.bar0 + bars) }); }
// 1. drums: one tech-house drop, the same notes, six families (and the 9.2 synthesized voices)
if (!ONLY_H) for (const fam of ['forge', '808', '909', '707', 'linn', 'acoustic', 'lofi']) out(`drums-${fam}`, excerpt('tech-house', 3, 'drop', 8, (s) => { s.kits.drumFam = fam; }), fam === 'forge' ? 'the 9.2 synthesized voices' : fam + '-style family');
// 2. harmony: where the chords and pads enter (9.2: on the downbeat with the kick, every change)
for (const [g, t, seed] of [['deep-house', 'drop', 2], ['melodic-techno', 'drop', 4], ['trance', 'break', 1], ['dnb', 'drop', 5], ['house', 'groove', 6]]) out(`harmony-${g}-${t}`, excerpt(g, seed, t, 16));
fs.writeFileSync(`${OUT}/LEVELS-${TAG}.txt`, `FORGE ${TAG} listening pack (phase A) — rendered through the app's own engine path, measured to BS.1770-4\n\n` + lines.join('\n') + '\n');
