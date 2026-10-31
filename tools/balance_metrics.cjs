// balance + level consistency, measured on rendered audio (the app's own path: calibration, auto-trim):
//   track    — the drop's loudness (LUFS, 8 bars) per genre × seed: the spread is what a set hears as "volume jumps" between tracks
//   sections — intro / break / build / drop loudness of each track: jumps inside a track
//   parts    — every part's loudness relative to the master in the drop, per genre × seed: a part whose level wanders by
//              more than a few LU from seed to seed (or from preset to preset) is "imbalance"
// Usage: node tools/balance_metrics.cjs [genres|all] [seeds=1,2,3] [--json]
const { X, renderTrack } = require('./render.cjs'); const { lufs } = require('./lib/dsp.cjs');
const args = process.argv.slice(2), pos = args.filter((a) => !a.startsWith('--')), JSONOUT = args.includes('--json');
const G = !pos[0] || pos[0] === 'all' ? X.GENRES.map((g) => g.id) : pos[0].split(','), SEEDS = (pos[1] || '1,2,3').split(',').map(Number);
const NAMES = ['kick', 'snare', 'hats', 'perc', 'bass', 'chords', 'pad', 'lead', 'arp'];
const stereo = (st) => { const n = st.length / 2, L = new Float32Array(n), R = new Float32Array(n); for (let i = 0; i < n; i++) { L[i] = st[2 * i]; R[i] = st[2 * i + 1]; } return [L, R]; };
const out = { tracks: [], parts: {} };
for (const g of G) for (const seed of SEEDS) { const s = X.composeTrack(g, seed), drop = X.peakSectionOf(s);
  const r = renderTrack(g, seed, { score: s, fromBar: drop.bar0, toBar: drop.bar0 + 8, stems: true }), Ld = lufs(r.L, r.R, r.sr).I;
  const parts = {}; for (let c = 0; c < 9; c++) { const [a, b] = stereo(r.stems[c]); let pk = 0; for (let i = 0; i < a.length; i++) pk = Math.max(pk, Math.abs(a[i])); if (pk < 1e-4) continue; parts[NAMES[c]] = +(lufs(a, b, r.sr).I - Ld).toFixed(1); }
  const secs = {}; for (const t of ['intro', 'break', 'build']) { const S = s.sections.find((x) => x.type === t); if (!S) continue; const rr = renderTrack(g, seed, { score: s, fromBar: S.bar0, toBar: S.bar0 + Math.min(8, S.bars) }); secs[t] = +(lufs(rr.L, rr.R, rr.sr).I - Ld).toFixed(1); }
  out.tracks.push({ g, seed, drop: +Ld.toFixed(1), secs, parts }); for (const k in parts) ((out.parts[g] = out.parts[g] || {})[k] = out.parts[g][k] || []).push(parts[k]);
  if (!JSONOUT) console.log(`${g.padEnd(18)} s${seed} drop ${Ld.toFixed(1)} LUFS · ${Object.entries(secs).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(' ')} · parts ${Object.entries(parts).map(([k, v]) => `${k} ${v}`).join(' ')}`); }
const drops = out.tracks.map((t) => t.drop), mn = Math.min(...drops), mx = Math.max(...drops);
let worstPart = [0, '']; for (const g in out.parts) for (const k in out.parts[g]) { const v = out.parts[g][k]; const sp = Math.max(...v) - Math.min(...v); if (sp > worstPart[0]) worstPart = [sp, `${g} ${k} ${v.join('/')}`]; }
const secJ = out.tracks.flatMap((t) => Object.values(t.secs)), secMin = Math.min(...secJ);
const sum = { dropRange: +(mx - mn).toFixed(1), dropMin: mn, dropMax: mx, worstPartSpread: +worstPart[0].toFixed(1), worstPart: worstPart[1], quietestSection: secMin };
if (JSONOUT) console.log(JSON.stringify(Object.assign(out, { sum }))); else console.log(`\ntrack-to-track (drops): ${mn.toFixed(1)} … ${mx.toFixed(1)} LUFS (range ${(mx - mn).toFixed(1)} LU) · widest part wander across seeds: ${worstPart[0].toFixed(1)} LU (${worstPart[1]}) · quietest section ${secMin} LU under its drop`);
