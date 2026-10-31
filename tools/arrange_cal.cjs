// arrangement calibration: render whole tracks with NO section gains, measure every section's K-weighted
// loudness relative to the track's peak section, average per layer over seeds, and store the gain that lands each layer on
// its target (ARR_TARGET in 08_deck.js) as calibration.json[genre].arr. Usage: node tools/arrange_cal.cjs <genre,…> [seeds] [iter]
// iter: measure WITH the current gains and correct the remainder (the master limiter compresses the first pass: a section that
// was limited loses less than its gain cut, so the first pass undershoots the targets)
const fs = require('fs'), path = require('path');
const { load } = require('./load.cjs'); const X = load('globalThis.__AT = ARR_TARGET;'); const T = globalThis.__AT;
const { renderTrack } = require('./render.cjs'); const { biquad } = require('./lib/dsp.cjs');
const OUT = path.join(__dirname, '..', 'src', 'engine', 'calibration.json'), DIR = OUT + '.d'; const sr = 22050;
const ids = process.argv[2] === 'all' ? X.GENRES.map((g) => g.id) : process.argv[2].split(','), seeds = (process.argv[3] || '1,2').split(',').map(Number), ITER = process.argv[4] === 'iter';
function secLoud(L, R, sps, S) { const a = biquad('hs', 1681.97, 0.7072, sr, 4.0), b = biquad('hp', 38.13, 0.5003, sr), c = biquad('hs', 1681.97, 0.7072, sr, 4.0), d = biquad('hp', 38.13, 0.5003, sr);
  const skip = S.type === 'build' || S.bars < 4 ? 0 : 1, i0 = Math.round((S.bar0 + skip) * 16 * sps), i1 = Math.min(L.length, Math.round((S.bar0 + S.bars - skip) * 16 * sps)); let e = 0;
  const w = Math.max(0, i0 - Math.round(sr * 0.5)); for (let i = w; i < i1; i++) { const x = b(a(L[i])), y = d(c(R[i])); if (i >= i0) e += x * x + y * y; } return 10 * Math.log10(e / Math.max(1, i1 - i0) + 1e-12); }
for (const gid of ids) { const cal = JSON.parse(fs.readFileSync(path.join(DIR, gid + '.json'), 'utf8')); const nat = {}, cnt = {};
  for (const seed of seeds) { const s = X.composeTrack(gid, seed), r = renderTrack(gid, seed, { score: s, sr, cal: ITER ? cal : Object.assign({}, cal, { arr: null }) });
    const pk = X.peakSectionOf(s), ref = secLoud(r.L, r.R, r.sps, pk);
    for (const S of s.sections) { const v = secLoud(r.L, r.R, r.sps, S) - ref; nat[S.layer] = (nat[S.layer] || 0) + v; cnt[S.layer] = (cnt[S.layer] || 0) + 1; } }
  const arr = {}, report = []; for (const k of Object.keys(nat)) { const n = nat[k] / cnt[k], t = T[k] != null ? T[k] : 0; arr[k] = +Math.max(-12, Math.min(1.5, (ITER && cal.arr && cal.arr[k] != null ? cal.arr[k] : 0) + t - n)).toFixed(2); report.push(`${k} ${n.toFixed(1)}→${t} (${arr[k] >= 0 ? '+' : ''}${arr[k]})`); }
  cal.arr = arr; fs.writeFileSync(path.join(DIR, gid + '.json'), JSON.stringify(cal)); console.log(gid.padEnd(18), report.join(' · ')); }
require('./calibrate.cjs').merge();
