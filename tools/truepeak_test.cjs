// master true peak, measured to BS.1770-4 (4× polyphase FIR) on the loudest part of every genre (its drop, 8 bars, two seeds).
// Standard: ≤ −1.0 dBTP (streaming / broadcast delivery, and headroom for a club's converters and lossy encoders).
// Usage: node tools/truepeak_test.cjs [genres|all] [seeds=1,2]
const { X, renderTrack } = require('./render.cjs'); const { truePeak, lufs } = require('./lib/dsp.cjs');
const pos = process.argv.slice(2), G = !pos[0] || pos[0] === 'all' ? X.GENRES.map((g) => g.id) : pos[0].split(','), SEEDS = (pos[1] || '1,2').split(',').map(Number);
let worst = -99, wg = '', fails = 0;
for (const g of G) for (const seed of SEEDS) { const s = X.composeTrack(g, seed), pk = X.peakSectionOf(s); const r = renderTrack(g, seed, { score: s, fromBar: pk.bar0, toBar: pk.bar0 + 8 });
  let sp = 0; for (const a of [r.L, r.R]) for (const x of a) sp = Math.max(sp, Math.abs(x)); const tp = truePeak(r.L, r.R), I = lufs(r.L, r.R, r.sr).I;
  if (tp > worst) { worst = tp; wg = g + '/' + seed; } if (tp > -1.0) fails++;
  console.log(`${(tp > -1 ? '✗' : '✓')} ${g.padEnd(18)} s${seed}  true peak ${tp.toFixed(2)} dBTP · sample peak ${(20 * Math.log10(sp)).toFixed(2)} dBFS · ${I.toFixed(1)} LUFS · PLR ${(tp - I).toFixed(1)} dB`); }
console.log(`\nworst ${worst.toFixed(2)} dBTP (${wg}) · ${fails} over −1.0 dBTP`); process.exit(fails ? 1 : 0);
