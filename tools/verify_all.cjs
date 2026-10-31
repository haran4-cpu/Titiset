// run the critic for a list of genres and seeds; append JSON lines; grade every measurement against fixed thresholds
// (thresholds are written here once and never moved to make a genre pass — a failing genre gets fixed or reported)
// exit code 1 when any check has status fail; warn-only checks are listed but do not fail the run, exit code 0 otherwise
const fs = require('fs');
const { analyzeGenre } = require('./critic.cjs');
const { X } = require('./render.cjs');
const TH = { kick: 0.9, snare: 0.85, chordMatch: 0.7, lufsTol: 1.0, tp: -1.0, mono: 0.95, smLo: -22, smHi: -4, kbTail: -10, overlap: 0.35 };
function grade(r, contract) { const G = contract || X.GENRE_BY_ID[r.gid], out = []; const add = (k, ok, v, want, warnOnly) => out.push({ k, st: ok ? 'pass' : warnOnly ? 'warn' : 'fail', v, want });
  const k = r.rhythm.kick; if (G.drums.main[0].k) add('kick grammar', k.vsContract >= TH.kick, k.vsContract, '≥ ' + TH.kick);
  const s = r.rhythm.snare; if (s.vsContract != null && G.drums.main.some((v) => v.s)) add('snare grammar', s.vsContract >= TH.snare, s.vsContract, '≥ ' + TH.snare);
  const h = r.harmony; if (h.expectedChangesPerBar > 0 && (G.chords.role !== 'none' || G.pad)) add('chords audible', h.margin > 0 && h.chordMatch >= 0.5, `margin ${h.margin}, bars ${h.chordMatch}`, 'margin > 0 and ≥ half the bars'); // bar-wise argmax alone is unstable for chords sharing 2 of 3 tones (i–bVI)
  if (r.bass.pitchClassOk != null && r.bass.beats >= 6) add('bass on the right notes', r.bass.pitchClassOk >= 0.8, r.bass.pitchClassOk, '≥ 0.8', true);
  add('loudness', Math.abs(r.master.lufs - r.master.target) <= TH.lufsTol, r.master.lufs, r.master.target + ' ± ' + TH.lufsTol);
  add('true peak', r.master.truePeak <= TH.tp, r.master.truePeak, '≤ ' + TH.tp);
  add('mono lows', r.lowEnd.monoCorr120 >= TH.mono, r.lowEnd.monoCorr120, '≥ ' + TH.mono);
  add('stereo width', r.master.sideMidDb >= TH.smLo && r.master.sideMidDb <= TH.smHi, r.master.sideMidDb, TH.smLo + '…' + TH.smHi + ' dB', true);
  add('clicks', r.mixClicks === 0, r.mixClicks, '0', r.mixClicks <= 2);
  const four = G.drums.main[0].k === 'X...X...X...X...', offBass = G.bass.pats.every((p) => p.n[0] === '.');
  if (four && offBass && r.lowEnd.kickAtBassOnsetDb_p90 != null) add('kick/bass separation', r.lowEnd.kickAtBassOnsetDb_p90 <= TH.kbTail, r.lowEnd.kickAtBassOnsetDb_p90, '≤ ' + TH.kbTail + ' dB', true);
  add('low-end overlap', r.lowEnd.lowOverlap <= TH.overlap, r.lowEnd.lowOverlap, '≤ ' + TH.overlap, true);
  return out; }
module.exports = { grade, TH };
if (require.main === module) { const ids = process.argv[2] === 'all' ? X.GENRES.map((g) => g.id) : process.argv[2].split(','); const seeds = (process.argv[3] || '11').split(',').map(Number); const out = process.argv[4]; let runs = 0, failing = 0, warns = 0;
  for (const id of ids) for (const seed of seeds) { const r = analyzeGenre(id, seed); r.grade = grade(r); const line = JSON.stringify(r); if (out) fs.appendFileSync(out, line + '\n'); const bad = r.grade.filter((g) => g.st !== 'pass'); runs++; warns += bad.filter((g) => g.st === 'warn').length; if (bad.some((g) => g.st === 'fail')) failing++;
    console.log(id.padEnd(18), seed, bad.length ? bad.map((g) => `${g.st.toUpperCase()} ${g.k}=${g.v} (${g.want})`).join(' · ') : 'all pass'); }
  console.log(`\n${runs} run(s): ${failing} with a failing check · ${warns} warning(s)`); process.exit(failing ? 1 : 0); }
