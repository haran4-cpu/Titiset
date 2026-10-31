// one-channel calibration: after a change to one part (texture beds, transition FX), set only that channel's trim
// (calibration bal[c]) so it sits at its family target relative to the kick in the drop (tools/calibrate.cjs targets).
// Usage: node tools/tex_cal.cjs [genres|all] [channel: texture (default) | fx]
const fs = require('fs'), path = require('path'); const { X, renderTrack } = require('./render.cjs'); const { stemLufs } = require('./critic.cjs'); const { TARGET, merge, peakSection } = require('./calibrate.cjs');
const DIR = path.join(__dirname, '..', 'src', 'engine', 'calibration.json.d');
const CHN = process.argv[3] || 'texture', C = CHN === 'fx' ? 9 : 10;
const ids = !process.argv[2] || process.argv[2] === 'all' ? X.GENRES.filter((g) => C === 9 || (g.texture && g.texture !== 'none')).map((g) => g.id) : process.argv[2].split(',');
for (const gid of ids) { const f = path.join(DIR, gid + '.json'), cal = JSON.parse(fs.readFileSync(f, 'utf8')), G = X.GENRE_BY_ID[gid], T = TARGET[G.family] || TARGET.house, ref = T.ref || 0;
  const meas = () => { let a = 0, n = 0; for (const seed of [1, 2]) { const sec = peakSection(X.planTrack(gid, seed)), r = renderTrack(gid, seed, { fromBar: sec.bar0, toBar: sec.bar0 + 8, stems: true, cal, autoTrim: false }); const l = stemLufs(r.stems[C], r.sr); if (l > -69) { a += l - stemLufs(r.stems[ref], r.sr); n++; } } return n ? a / n : null; };
  const before = meas(); if (before == null) { console.log(gid, 'no ' + CHN + ' in the drop'); continue; } const d = T[CHN] - before; cal.bal[C] = +(cal.bal[C] + Math.max(-24, Math.min(24, d))).toFixed(2);
  const after = meas(); fs.writeFileSync(f, JSON.stringify(cal)); console.log(`${gid.padEnd(18)} ${CHN} ${before.toFixed(1)} → ${after.toFixed(1)} LU vs ref (target ${T[CHN]}) · trim ${cal.bal[C]}`); }
merge();
