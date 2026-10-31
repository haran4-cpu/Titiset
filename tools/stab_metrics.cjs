// chord-stab placement metrics on the drop of stab genres: how many stab onsets collide with a kick (the sidechain pump
// swallows them), how many sit on the downbeat, pushes into chord changes, dynamics, rhythmic variety.
// Usage: node tools/stab_metrics.cjs [loaderPath|-] [seeds]
const path = require('path');
const lp = process.argv[2] && process.argv[2] !== '-' ? path.resolve(process.argv[2]) : path.join(__dirname, 'load.cjs');
const X = require(lp).load(); const seeds = (process.argv[3] || '1,2,3,4,5,6,7,8').split(',').map(Number);
const rows = [];
for (const G of X.GENRES.filter((g) => g.chords.role === 'stab')) for (const sd of seeds) { const s = X.composeTrack(G.id, sd), sec = s.sections.find((x) => x.type === 'drop') || X.peakSectionOf(s), ev = s.ev;
  const t0 = sec.bar0 * 16, t1 = t0 + Math.min(16, sec.bars) * 16, kicks = new Set(), stabs = new Map();
  for (let i = 0; i < ev.n; i++) { const t = ev.t[i]; if (t < t0 || t >= t1) continue; const st = Math.round(t - t0); if (ev.ch[i] === 0) kicks.add(st); if (ev.ch[i] === 5 && !stabs.has(st)) stabs.set(st, ev.v[i]); }
  if (!stabs.size) continue; let onKick = 0, onOne = 0, push = 0; const bars = new Array(16).fill('');
  for (const [st, v] of stabs) { if (kicks.has(st)) onKick++; if (st % 16 === 0) onOne++; if (st % 16 >= 14) { const b = Math.floor(st / 16); if (s.chords[sec.bar0 + b + 1] && s.chords[sec.bar0 + b + 1].label !== s.chords[sec.bar0 + b].label) push++; } bars[Math.floor(st / 16)] += (st % 16) + ','; }
  const vs = [...stabs.values()]; rows.push({ g: G.id, onKick: onKick / stabs.size, onOne: onOne / stabs.size, push, perBar: stabs.size / 16, vRange: Math.max(...vs) - Math.min(...vs), uniq: new Set(bars).size }); }
const mean = (k) => rows.reduce((a, r) => a + r[k], 0) / rows.length;
console.log(`${rows.length} drops (stab genres × ${seeds.length} seeds) from ${path.relative(process.cwd(), lp)}`);
for (const k of ['onKick', 'onOne', 'push', 'perBar', 'vRange', 'uniq']) console.log(k.padEnd(8), mean(k).toFixed(3));
const by = {}; for (const r of rows) { (by[r.g] = by[r.g] || []).push(r.onKick); } console.log('on-kick by genre: ' + Object.entries(by).map(([g, v]) => `${g} ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2)}`).join(' · '));
