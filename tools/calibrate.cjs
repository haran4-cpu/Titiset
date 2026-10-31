// gain staging by measurement: render each genre's drop (3 seeds), measure every post-fader stem's gated BS.1770
// loudness relative to the kick, move the channel trims toward the family balance target, then find the master gain
// that lands the drop on the genre's LUFS target through the real limiter. Writes src/engine/calibration.json.
const fs = require('fs'), path = require('path');
const { X, renderTrack } = require('./render.cjs');
const { stemLufs } = require('./critic.cjs');
const { lufs } = require('./lib/dsp.cjs');
const OUT = path.join(__dirname, '..', 'src', 'engine', 'calibration.json');
const NAMES = ['kick', 'snare', 'hats', 'perc', 'bass', 'chords', 'pad', 'lead', 'arp', 'fx', 'texture'];
// balance targets (LU relative to the kick, gated loudness of each stem over the drop). Engineering targets from club
// practice — kick leads, bass just under it, clap a few LU down, hats far down (K-weighting makes them read loud).
const TARGET = {
  house: { snare: -5, hats: -11, perc: -12, bass: -2, chords: -7, pad: -11, lead: -7, arp: -10, fx: -13, texture: -24 },
  techno: { snare: -6, hats: -10, perc: -12, bass: -3, chords: -9, pad: -11, lead: -7, arp: -9, fx: -13, texture: -24 },
  trance: { snare: -5, hats: -10, perc: -12, bass: -2.5, chords: -6, pad: -10, lead: -4.5, arp: -8, fx: -12, texture: -24 }, // the kick and bass carry a modern trance drop; the supersaw wall sat on top of them (audit: sub −15 dB)
  psy: { snare: -7, hats: -10, perc: -12, bass: -1, chords: -10, pad: -10, lead: -6, arp: -8.5, fx: -12, texture: -17 }, // v9.1: the gated chords sit behind the riff, the acid voice just under it
  dnb: { snare: -1, hats: -9, perc: -11, bass: -1, chords: -7, pad: -10, lead: -7, arp: -9, fx: -12, texture: -24 },
  bass: { snare: -1, hats: -10, perc: -11, bass: 0, chords: -10, pad: -11, lead: -9, arp: -10, fx: -12, texture: -22 },
  hiphop: { snare: -3, hats: -9, perc: -11, bass: 1, chords: -10, pad: -11, lead: -6, arp: -9, fx: -12, texture: -24 },
  garage: { snare: -4, hats: -11, perc: -12, bass: -2, chords: -7, pad: -11, lead: -6, arp: -10, fx: -13, texture: -24 },
  afro: { snare: -6, hats: -11, perc: -9, bass: -2, chords: -8, pad: -12, lead: -7, arp: -8, fx: -14, texture: -24 },
  latin: { snare: -4, hats: -11, perc: -10, bass: -1, chords: -7, pad: -12, lead: -5, arp: -9, fx: -13, texture: -24 },
  hard: { snare: -6, hats: -11, perc: -12, bass: -2, chords: -7, pad: -10, lead: -3, arp: -8, fx: -12, texture: -24 },
  pop: { snare: -3, hats: -10, perc: -12, bass: -2, chords: -3, pad: -9, lead: -4, arp: -8, fx: -12, texture: -22 },
  chill: { snare: -3, hats: -11, perc: -11, bass: -3, chords: -3, pad: -8, lead: -5, arp: -7, fx: -14, texture: -24 },
  breaks: { snare: -2, hats: -10, perc: -11, bass: -2, chords: -8, pad: -11, lead: -6, arp: -7, fx: -12, texture: -24 },
  ambient: { ref: 6, chords: -2, lead: -4, arp: -7, bass: -9, perc: -14, fx: -14, texture: -12 },
};
// a genre whose balance differs from its family's (LU relative to the kick, over the family target)
const GENRE_TARGET = { 'prog-psy': { chords: -8 } }; // v9.1: progressive psy's gated chords carry its drops (full-on psy keeps them behind the riff)

const SEEDS = [1, 2, 3];
function load() { try { return JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { return {}; } }
function dropOf(gid, seed) { return peakSection(X.planTrack(gid, seed)); }
function peakSection(P) { const d = P.sections.find((s) => s.type === 'drop'); if (d) return d; let best = P.sections[0], bw = -1; for (const s of P.sections) { const L = X.LAYERS[s.layer]; let w = 0; for (const k in L) w += L[k]; if (w > bw) { bw = w; best = s; } } return best; }
function measure(gid, cal) { const acc = new Array(11).fill(0), cnt = new Array(11).fill(0); let lu = 0;
  for (const seed of SEEDS) { const sec = dropOf(gid, seed); const r = renderTrack(gid, seed, { fromBar: sec.bar0, toBar: sec.bar0 + 16, stems: true, cal, autoTrim: false });
    const ref = (TARGET[X.GENRE_BY_ID[gid].family] || {}).ref || 0; const k0 = stemLufs(r.stems[ref], r.sr); for (let c = 0; c < 11; c++) { if (c === ref) continue; const l = stemLufs(r.stems[c], r.sr); if (l > -69) { acc[c] += l - k0; cnt[c]++; } }
    lu += lufs(r.L, r.R, r.sr).I; }
  return { rel: acc.map((a, c) => (cnt[c] ? a / cnt[c] : null)), lufs: lu / SEEDS.length }; }
function calibrate(gid) {
  const G = X.GENRE_BY_ID[gid], T = Object.assign({}, TARGET[G.family] || TARGET.house, GENRE_TARGET[gid] || {}); const all = load();
  const cal = { bal: X.BAL_DEFAULT.slice(), master: 0 }; const REF = T.ref || 0; cal.bal[REF] = 0;
  for (let it = 0; it < 3; it++) { const m = measure(gid, cal); let worst = 0;
    for (let c = 0; c < 11; c++) { if (c === REF || m.rel[c] == null || T[NAMES[c]] == null) continue; const d = T[NAMES[c]] - m.rel[c]; worst = Math.max(worst, Math.abs(d)); cal.bal[c] = +(cal.bal[c] + Math.max(-24, Math.min(24, d))).toFixed(2); }
    console.error(gid, 'balance iter', it, 'worst', worst.toFixed(2)); if (worst < 0.6) break; }
  for (let it = 0; it < 4; it++) { const m = measure(gid, cal); const d = G.mix.lufs - m.lufs; console.error(gid, 'loudness iter', it, m.lufs.toFixed(2), '→', G.mix.lufs); if (Math.abs(d) < 0.25) break; cal.master = +(cal.master + d * (it ? 1.1 : 1)).toFixed(2); }
  const fin = measure(gid, cal); cal.check = { lufs: +fin.lufs.toFixed(2), rel: fin.rel.map((x) => (x == null ? null : +x.toFixed(1))) };
  fs.mkdirSync(OUT + '.d', { recursive: true }); const prevF = path.join(OUT + '.d', gid + '.json'); try { const prev = JSON.parse(fs.readFileSync(prevF, 'utf8')); if (prev.arr) cal.arr = prev.arr; if (prev.tone) cal.tone = prev.tone; } catch (e) { /* first calibration */ } // section levels belong to arrange_cal
  fs.writeFileSync(prevF, JSON.stringify(cal)); merge(); return cal; }
function merge() { const d = OUT + '.d', cur = {}; for (const f of fs.readdirSync(d)) if (f.endsWith('.json')) cur[f.slice(0, -5)] = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')); fs.writeFileSync(OUT, JSON.stringify(cur, null, 1)); }
module.exports = { calibrate, TARGET, merge, peakSection };
if (require.main === module) { for (const g of process.argv.slice(2)) { const c = calibrate(g); console.log(g, JSON.stringify(c)); } }
