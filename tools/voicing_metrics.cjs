// chord voicing quality over many tracks (chords + pad channels): voice movement per chord change, top-voice leap, low mud
// (an interval of a 4th or less with its lower note below E3 — it turns to rumble on a club system), spread, and how often the
// top voice moves by step (≤ 2 semitones) — the line the ear follows. Usage: node tools/voicing_metrics.cjs [genres|all] [seeds]
const { X } = require('./render.cjs'); const ids = !process.argv[2] || process.argv[2] === 'all' ? X.GENRES.map((g) => g.id) : process.argv[2].split(','), NS = +(process.argv[3] || 4);
const tot = { ch: 0, move: 0, leap: 0, step: 0, mud: 0, chords: 0, spread: 0 };
for (const g of ids) { const row = { ch: 0, move: 0, leap: 0, step: 0, mud: 0, chords: 0, spread: 0 };
  for (let seed = 1; seed <= NS; seed++) { const s = X.composeTrack(g, seed), E = s.ev; for (const chn of (process.env.VCH || '5,6').split(',').map(Number)) { const by = new Map();
      for (let i = 0; i < E.n; i++) if (E.ch[i] === chn) { const t = Math.round(E.t[i] * 4); if (!by.has(t)) by.set(t, []); by.get(t).push(E.a[i]); }
      const ts = [...by.keys()].sort((a, b) => a - b); let prev = null;
      for (const t of ts) { const v = [...new Set(by.get(t))].sort((a, b) => a - b); if (v.length < 3) continue; row.chords++; row.spread += v[v.length - 1] - v[0];
        for (let k = 1; k < v.length; k++) if (v[k] - v[k - 1] <= 5 && v[k - 1] < 52) row.mud++;
        if (prev && prev.join() !== v.join()) { row.ch++; let mv = 0; for (const n of v) { let d = 99; for (const p of prev) d = Math.min(d, Math.abs(n - p)); mv += d; } row.move += mv / v.length; const l = Math.abs(v[v.length - 1] - prev[prev.length - 1]); row.leap += l; if (l <= 2) row.step++; }
        prev = v; } } }
  for (const k in tot) tot[k] += row[k];
  if (ids.length <= 8) console.log(g.padEnd(18), `changes ${row.ch} · move/voice ${(row.move / Math.max(1, row.ch)).toFixed(2)} · top leap ${(row.leap / Math.max(1, row.ch)).toFixed(2)} · top by step ${(100 * row.step / Math.max(1, row.ch)).toFixed(0)} % · mud/chord ${(row.mud / Math.max(1, row.chords)).toFixed(2)} · spread ${(row.spread / Math.max(1, row.chords)).toFixed(1)}`); }
console.log(`ALL: changes ${tot.ch} · move/voice ${(tot.move / tot.ch).toFixed(2)} · top leap ${(tot.leap / tot.ch).toFixed(2)} · top by step ${(100 * tot.step / tot.ch).toFixed(0)} % · mud/chord ${(tot.mud / tot.chords).toFixed(3)} · spread ${(tot.spread / tot.chords).toFixed(1)} semitones`);
