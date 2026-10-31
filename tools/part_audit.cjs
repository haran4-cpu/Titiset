// Is the pitch that is written the pitch that is heard? Every pitched part (bass, chords, pad, lead, arp) is rendered ALONE through the real engine code and compared with the notes the
// composer wrote for it, with analysis that shares no code with the engine:
//   · chords / pad / lead / arp: the pitch classes of the rendered part against the pitch classes of its own notes (each with its overtones), at all 12 transpositions —
//     the right answer is "not transposed" (no other transposition may fit better by more than 0.03), and it must correlate (≥ 0.6). A wrong octave table, a transposition bug or a mistuned kit would put the best match elsewhere.
//   · bass: the fundamental of every note that sustains long enough to measure (normalised autocorrelation over the note's sustain, searched ± 3 semitones around the written pitch)
//     against the written pitch: at least 85 % of the notes within 50 cents. (Sub-bass notes are below what a spectrum can resolve into semitones, so they get a time-domain check.)
// Usage: node tools/part_audit.cjs [genres|all] [seeds=1] [bars=8] [--quiet]
const { X, renderTrack, appScore } = require('./render.cjs'); const A = require('./lib/audio_audit.cjs'); const fs = require('fs'), path = require('path'), os = require('os');
const DEFAULT_KIT = process.argv.includes('--default-kit'); // tracks are built the way the app builds a new one (palette sounds); --default-kit: the genre's plain kit
const args = process.argv.slice(2), QUIET = args.includes('--quiet'), pos = args.filter((a) => !a.startsWith('--'));
const G = !pos[0] || pos[0] === 'all' ? X.GENRES.map((g) => g.id) : pos[0].split(','), SEEDS = (pos[1] || '1').split(',').map(Number), BARS = +(pos[2] || 8);
if (!A.havePython()) { console.log('part_audit: unavailable (python3 with numpy + scipy not found) — nothing was checked'); process.exit(0); }
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-parts-')), MODES = A.modeTable(), NAMES = { 5: 'chords', 6: 'pad', 7: 'lead', 8: 'arp' };
// fundamental of mono[a..b) near `hz`: McLeod's normalised square difference over lags of ± 3 semitones; returns cents against hz (null when the segment is too short)
function f0Cents(x, a, b, hz, sr) {
  const tmin = Math.floor(sr / (hz * Math.pow(2, 3 / 12))), tmax = Math.ceil(sr / (hz * Math.pow(2, -3 / 12))); if (b - a < Math.max(tmax * 2.5, 5 * sr / hz)) return null; /* at least 5 periods: a 64 ms pluck at 98 Hz has 6, and its first cycles are not yet its pitch */ const W = b - a - tmax; let mean = 0; for (let i = a; i < b; i++) mean += x[i]; mean /= (b - a);
  let best = -2, bt = 0; const ns = new Float64Array(tmax + 2);
  for (let t = tmin - 1; t <= tmax + 1; t++) { let acf = 0, m = 0; for (let j = 0; j < W; j++) { const p = x[a + j] - mean, q = x[a + j + t] - mean; acf += p * q; m += p * p + q * q; } ns[t] = m > 0 ? 2 * acf / m : 0; }
  for (let t = tmin; t <= tmax; t++) if (ns[t] > best) { best = ns[t]; bt = t; }
  if (best < 0.5) return { cents: null, clarity: best };
  // the first strong peak, not the highest: a lower octave repeats the pattern at twice the lag
  for (let t = tmin; t <= tmax; t++) if (ns[t] >= 0.9 * best && ns[t] >= ns[t - 1] && ns[t] >= ns[t + 1]) { bt = t; break; }
  const y0 = ns[bt - 1], y1 = ns[bt], y2 = ns[bt + 1], den = y0 - 2 * y1 + y2, d = Math.abs(den) > 1e-12 ? 0.5 * (y0 - y2) / den : 0, tau = bt + Math.max(-0.5, Math.min(0.5, d));
  return { cents: 1200 * Math.log2((sr / tau) / hz), clarity: best }; }
let fails = 0, warns = 0; const rows = [];
for (const g of G) for (const seed of SEEDS) {
  const score = DEFAULT_KIT ? X.composeTrack(g, seed) : appScore(g, seed), sec = X.peakSectionOf(score), from = sec.bar0, to = Math.min(score.meta.bars, from + Math.min(BARS, sec.bars)), ev = score.ev, m = score.meta; const line = []; let bad = false;
  const have = {}; for (let i = 0; i < ev.n; i++) if (ev.t[i] >= from * 16 && ev.t[i] < to * 16 && ev.ch[i] >= 4 && ev.ch[i] <= 8) have[ev.ch[i]] = (have[ev.ch[i]] || 0) + 1;
  for (const ch of [5, 6, 7, 8]) { if ((have[ch] || 0) < 8) continue; const on = new Array(11).fill(false); on[ch] = true; const r = renderTrack(g, seed, { score, fromBar: from, toBar: to, chanOn: on }), file = path.join(TMP, `${g}-${seed}-${NAMES[ch]}.wav`); A.writeWavF32(file, r.L, r.R, r.sr);
    const sub = { ev: { n: 0, ch: [], t: [], d: [], v: [], a: [] } }; for (let i = 0; i < ev.n; i++) if (ev.ch[i] === ch) { const k = sub.ev.n++; sub.ev.ch[k] = ch; sub.ev.t[k] = ev.t[i]; sub.ev.d[k] = ev.d[i]; sub.ev.v[k] = ev.v[i]; sub.ev.a[k] = ev.a[i]; }
    const a = A.analyze(file, { expected: A.expectedChroma(sub, from * 16, to * 16) }), ok = a.notes.corr >= 0.6 && a.notes.corr >= a.notes.bestCorr - 0.03; /* not transposed = no other transposition fits clearly better (a diatonic set is nearly its own transposition by a fifth: ties within 0.03 count) */ if (!ok) bad = true;
    line.push(`${NAMES[ch]} ${a.notes.corr.toFixed(2)}${ok ? '' : ' ✗ (best at +' + a.notes.best + ' ' + a.notes.bestCorr.toFixed(2) + ')'}`); rows.push({ g, seed, part: NAMES[ch], corr: a.notes.corr, best: a.notes.best, ok }); }
  if ((have[4] || 0) >= 8) { const on = new Array(11).fill(false); on[4] = true; const r = renderTrack(g, seed, { score, fromBar: from, toBar: to, chanOn: on }), x = r.L, sr = r.sr, sps = r.sps; const bass = []; for (let i = 0; i < ev.n; i++) if (ev.ch[i] === 4 && ev.t[i] >= from * 16 && ev.t[i] < to * 16) bass.push(i);
    const errs = []; for (let k = 0; k < bass.length; k++) { const i = bass[k]; if (ev.f[i] & 1) continue; /* slide: the pitch is moving */ const nxt = k + 1 < bass.length ? ev.t[bass[k + 1]] : Infinity; const dd = Math.min(ev.d[i], nxt - ev.t[i]); const t0 = (ev.t[i] - from * 16) * sps;
      const a0 = Math.round(t0 + 0.35 * dd * sps), b0 = Math.round(t0 + 0.95 * dd * sps), hz = 440 * Math.pow(2, (ev.a[i] - 69) / 12); if (a0 < 0 || b0 > x.length) continue; const c = f0Cents(x, a0, b0, hz, sr); if (c && c.cents != null) errs.push(c.cents); }
    const within = errs.filter((c) => Math.abs(c) <= 50).length, absMed = errs.length ? errs.map(Math.abs).sort((p, q) => p - q)[errs.length >> 1] : null;
    if (errs.length >= 5) { const ok = within / errs.length >= 0.85; if (!ok) bad = true; line.push(`bass ${within}/${errs.length} within 50 ¢ (median |err| ${absMed.toFixed(0)} ¢)${ok ? '' : ' ✗'}`); rows.push({ g, seed, part: 'bass', n: errs.length, within, absMed, ok }); }
    else line.push(`bass n/a (${errs.length} notes long enough to measure)`); }
  if (bad) fails++; if (!QUIET || bad) console.log(`${bad ? '✗' : '✓'} ${(g + '/' + seed).padEnd(22)} ${line.join(' · ')}`); }
const mids = rows.filter((r) => r.part !== 'bass'), bs = rows.filter((r) => r.part === 'bass');
console.log(`\n${G.length * SEEDS.length} tracks · mid/high parts: ${mids.filter((r) => r.ok).length} of ${mids.length} not transposed, correlation ${mids.length ? Math.min(...mids.map((r) => r.corr)).toFixed(2) + '…' + Math.max(...mids.map((r) => r.corr)).toFixed(2) : 'n/a'} · bass: ${bs.reduce((s, r) => s + r.within, 0)} of ${bs.reduce((s, r) => s + r.n, 0)} measured notes within 50 cents`);
console.log(fails ? `part_audit: ${fails} track(s) FAILED` : 'part_audit: all checks pass'); process.exit(fails ? 1 : 0);
