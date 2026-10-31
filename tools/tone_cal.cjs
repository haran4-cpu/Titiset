// tone calibration: render each genre's drop (seeds 1,2; 8 bars), measure its long-term spectrum against the modern-master
// tilt used by tools/audit.cjs and the side/mid level above 2.5 kHz, and set the deck's tone EQ (calibration.json → tone) to
// pull each region toward the reference — partially, and only where it is clearly off (a genre keeps its character: dub
// techno stays dark, lo-fi stays soft). Then re-land the drop on the genre's loudness target. Usage: tone_cal.cjs <genres|all> [--app]
// --app (v9.1): measure the tracks as the app plays them — the genre's palette of sounds, not only its default kit (psytrance's
// palette leads and chords are brighter than its default ones: measured +7.1 dB at 8 kHz against the curve with them)
const fs = require('fs'), path = require('path');
const { X, renderTrack, appScore } = require('./render.cjs'); const APP = process.argv.includes('--app'); const { thirdOct, lufs } = require('./lib/dsp.cjs'); const { truePeak } = require('./critic.cjs');
const DIR = path.join(__dirname, '..', 'src', 'engine', 'calibration.json.d');
const T = { 31.5: 6, 40: 8, 50: 9, 63: 9, 80: 8, 100: 7, 125: 6, 160: 5, 200: 4, 250: 3, 315: 2.5, 400: 2, 500: 1.5, 630: 1, 800: 0.5, 1000: 0, 1250: -0.5, 1600: -1, 2000: -1.8, 2500: -2.6, 3150: -3.4, 4000: -4.2, 5000: -5, 6300: -6, 8000: -7.2, 10000: -8.7, 12500: -10.5, 16000: -13 };
const TF = Object.keys(T).map(Number), tgt = (f) => { let b = TF[0]; for (const x of TF) if (Math.abs(Math.log2(x / f)) < Math.abs(Math.log2(b / f))) b = x; return T[b]; };
const REG = { sub: [28, 70], low: [70, 180], lowmid: [180, 560], presence: [2200, 5600], air: [5600, 16500] };
const KEEP = { 'dub-techno': { air: true, presence: true }, lofi: { air: true, presence: true }, ambient: { air: true }, downtempo: { air: true } }; // character, not faults
const ids = process.argv[2] === 'all' ? X.GENRES.map((g) => g.id) : process.argv[2].split(',');
function measure(gid, cal) { const out = { sub: 0, low: 0, lowmid: 0, presence: 0, air: 0, side: 0, lufs: 0, plr: 0 }; const seeds = [1, 2];
  for (const seed of seeds) { const s = APP ? appScore(gid, seed) : X.composeTrack(gid, seed), sec = X.peakSectionOf(s), r = renderTrack(gid, seed, { score: s, fromBar: sec.bar0, toBar: sec.bar0 + 8, cal, autoTrim: false });
    const M = new Float32Array(r.L.length), Sd = new Float32Array(r.L.length); for (let i = 0; i < M.length; i++) { M[i] = (r.L[i] + r.R[i]) / 2; Sd[i] = (r.L[i] - r.R[i]) / 2; }
    const tm = thirdOct(M, r.sr), ts = thirdOct(Sd, r.sr); let ref = 0, n = 0; tm.centers.forEach((f, i) => { if (f >= 560 && f <= 2200) { ref += tm.bands[i] - tgt(f); n++; } }); ref /= n;
    for (const [k, [lo, hi]] of Object.entries(REG)) { let a = 0, m = 0; tm.centers.forEach((f, i) => { if (f >= lo && f < hi) { a += tm.bands[i] - tgt(f) - ref; m++; } }); out[k] += a / m / seeds.length; }
    let sw = 0, m = 0; tm.centers.forEach((f, i) => { if (f >= 2500 && f < 12000) { sw += ts.bands[i] - tm.bands[i]; m++; } }); out.side += sw / m / seeds.length;
    const L = lufs(r.L, r.R, r.sr); out.lufs += L.I / seeds.length; out.plr += (truePeak(r.L, r.R) - L.I) / seeds.length; }
  return out; }
const cl = (x, a, b) => Math.max(a, Math.min(b, x)), fmt = (o) => `sub ${o.sub.toFixed(1)} low ${o.low.toFixed(1)} box ${o.lowmid.toFixed(1)} pres ${o.presence.toFixed(1)} air ${o.air.toFixed(1)} side ${o.side.toFixed(1)} · ${o.lufs.toFixed(1)} LUFS PLR ${o.plr.toFixed(1)}`;
for (const gid of ids) { const f = path.join(DIR, gid + '.json'), cal = JSON.parse(fs.readFileSync(f, 'utf8')), G = X.GENRE_BY_ID[gid], keep = KEEP[gid] || {};
  const t = Object.assign({ sub: 0, box: 0, pres: 0, air: 0, wide: 0 }, cal.tone || {}); const before = measure(gid, Object.assign({}, cal, { tone: t }));
  let m = before; for (let it = 0; it < 2; it++) {
    t.sub = cl(t.sub + 0.8 * (-2 - m.sub), -6, 9);
    if (Math.abs(m.lowmid) > 1.5) t.box = cl(t.box - 0.7 * m.lowmid, -6, 3);
    if (!keep.presence && Math.abs(m.presence) > 2) t.pres = cl(t.pres - 0.6 * m.presence, -5, 4);
    if (!keep.air && Math.abs(m.air) > 2) t.air = cl(t.air - 0.7 * m.air, -7, 4);
    t.wide = cl(t.wide + 0.8 * (-9 - m.side), 0, 8);
    for (const k of Object.keys(t)) t[k] = +t[k].toFixed(2); cal.tone = t; m = measure(gid, cal); }
  for (let it = 0; it < 3 && Math.abs(G.mix.lufs - m.lufs) > 0.25; it++) { cal.master = +(cal.master + (G.mix.lufs - m.lufs)).toFixed(2); m = measure(gid, cal); } // keep the drop on its loudness target
  fs.writeFileSync(f, JSON.stringify(cal)); console.log(`${gid.padEnd(18)} before: ${fmt(before)}\n${''.padEnd(18)} after:  ${fmt(m)}  tone ${JSON.stringify(t)}`); }
require('./calibrate.cjs').merge();
