// listening pack: 16-bar excerpts rendered through the app's own path (deck + master, calibration, auto-trim), each with its
// loudness and BS.1770 true peak, as MP3 (320 kb/s) in one folder. Usage: node tools/listen_pack.cjs <outdir> [tag=v8]
const { X, renderTrack, wav } = require('./render.cjs'); const { lufs, truePeak } = require('./lib/dsp.cjs'); const { execFileSync } = require('child_process'); const fs = require('fs');
const OUT = process.argv[2] || 'listen', TAG = process.argv[3] || 'v8'; fs.mkdirSync(OUT, { recursive: true });
const SET = [['afro-house', 'drop'], ['deep-house', 'drop'], ['dnb', 'drop'], ['downtempo', 'intro'], ['dubstep', 'build'], ['melodic-techno', 'drop'], ['progressive-house', 'break'], ['psytrance', 'build'], ['techno', 'build'], ['trance', 'break']];
const lines = [];
for (const [g, type] of SET) { const s = X.composeTrack(g, 1), k = Math.max(0, s.sections.findIndex((x) => x.type === type)), S = s.sections[k];
  const r = renderTrack(g, 1, { score: s, fromBar: S.bar0, toBar: Math.min(s.meta.bars, S.bar0 + 16 + (type === 'build' ? 8 : 0)) });
  const f = `${OUT}/${g}-${type}-${TAG}`; wav(f + '.wav', r.L, r.R, r.sr); execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', f + '.wav', '-b:a', '320k', f + '.mp3']); fs.unlinkSync(f + '.wav');
  const l = `${g}-${type}-${TAG}.mp3  ${(r.L.length / r.sr).toFixed(1)} s · ${lufs(r.L, r.R, r.sr).I.toFixed(1)} LUFS · true peak ${truePeak(r.L, r.R).toFixed(2)} dBTP${type === 'build' ? ' (build → drop)' : ''}`; lines.push(l); console.log(l); }
fs.writeFileSync(`${OUT}/LEVELS-${TAG}.txt`, `FORGE ${TAG} listening pack — rendered through the app's own engine path, measured to BS.1770-4\n\n` + lines.join('\n') + '\n');
