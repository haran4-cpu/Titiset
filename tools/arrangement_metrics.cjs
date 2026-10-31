// arrangement flow: per bar, which parts are playing (a part plays in a bar if a note of it starts or sounds there). At every
// bar line we count how many parts switch on or off at once. A drop's downbeat (the impact) and a break's first bar (the
// cut) and a build's first bar (drums return under the roll) are allowed to switch many at once; anywhere else, 3+ parts switching together is a "jump" — producers bring parts
// in and out one or two at a time. Also: does each build end on the turnaround chord (the chord that leads home)?
// Usage: node tools/arrangement_metrics.cjs [loader root|-] [genres|all] [seeds]
const root = process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : require('path').join(__dirname, '..');
const { X } = require(root + '/tools/render.cjs'); const ids = !process.argv[3] || process.argv[3] === 'all' ? X.GENRES.map((g) => g.id) : process.argv[3].split(','), NS = +(process.argv[4] || 3);
let bounds = 0, jumps = 0, sw = 0, builds = 0, buildsHome = 0, dead = 0; const worst = {}, deadAt = [];
for (const g of ids) for (let seed = 1; seed <= NS; seed++) { const s = X.composeTrack(g, seed), E = s.ev, B = s.meta.bars, on = Array.from({ length: B }, () => new Set());
  for (let i = 0; i < E.n; i++) { const c = E.ch[i]; if (c > 8) continue; const b0 = Math.floor(E.t[i] / 16), b1 = Math.min(B - 1, Math.floor((E.t[i] + Math.max(0, Math.min(E.d[i], 64)) - 0.01) / 16)); for (let b = b0; b <= b1; b++) on[b].add(c); }
  for (let b = 0; b < B; b++) if (!on[b].size) { dead++; if (deadAt.length < 8) deadAt.push(`${g}/${seed} bar ${b + 1}`); } // a bar with nothing playing at all
  const starts = new Map(s.sections.map((S) => [S.bar0, S.type]));
  for (let b = 1; b < B; b++) { const t = starts.get(b); if (t === 'drop' || t === 'break' || t === 'build') continue; let n = 0; for (let c = 0; c <= 8; c++) if (on[b].has(c) !== on[b - 1].has(c)) n++; bounds++; sw += n; if (n >= 3) { jumps++; worst[g] = (worst[g] || 0) + 1; } }
  for (const S of s.sections) if (S.type === 'build') { builds++; const last = s.chords[S.bar0 + S.bars - 1], prog = s.meta.prog; const pc = (s.meta.key + X.planTrack(g, seed).prog[prog.length - 1].root) % 12; if (last && last.root === pc) buildsHome++; } }
console.log(`bar lines ${bounds} · parts switching per line ${(sw / bounds).toFixed(3)} · 3+ parts at once (not a drop / break start): ${jumps} (${(100 * jumps / bounds).toFixed(2)} %) · builds ending on the turnaround chord ${buildsHome}/${builds} · bars with nothing playing ${dead}${dead ? ' (' + deadAt.join(', ') + ')' : ''}`);
console.log('most jumps:', Object.entries(worst).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => k + ' ' + v).join(', '));
