// lead musicality metrics on the drop of generated tracks (hook genres): harmony fit, phrase structure, variety,
// contour, rhythm placement. Usage: node tools/lead_metrics.cjs [loaderPath] [seeds]  — compare two builds by loader.
const path = require('path');
const loaderPath = process.argv[2] && process.argv[2] !== '-' ? path.resolve(process.argv[2]) : path.join(__dirname, 'load.cjs');
const X = require(loaderPath).load(); const seeds = (process.argv[3] || '1,2,3,4,5,6,7,8,9,10').split(',').map(Number);
const MODES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], phrygian: [0, 1, 3, 5, 7, 8, 10], harmonic: [0, 2, 3, 5, 7, 8, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10], lydian: [0, 2, 4, 6, 7, 9, 11], phrygdom: [0, 1, 4, 5, 7, 8, 10] };
function chordTones(s, bar) { const c = s.chords[bar]; if (c.tones) return c.tones; const iv = c.q === 'min' ? [0, 3, 7] : c.q === 'dim' ? [0, 3, 6] : [0, 4, 7]; return iv.map((x) => (c.root + x) % 12); }
// an anticipation (step 14/15, held into the next bar) is judged against the chord it anticipates
function metrics(s) {
  const sec = s.sections.find((x) => x.type === 'drop') || s.sections[0], ev = s.ev, bars = Math.min(16, sec.bars), b0 = sec.bar0; const notes = [];
  for (let i = 0; i < ev.n; i++) if (ev.ch[i] === 7) { const t = ev.t[i] - b0 * 16; if (t >= -2 && t < bars * 16) notes.push({ t, m: Math.round(ev.a[i]), d: ev.d[i], v: ev.v[i] }); }
  if (notes.length < 4) return null; notes.sort((a, b) => a.t - b.t);
  let strong = 0, strongCT = 0, avoid = 0; const barsTxt = []; for (let b = 0; b < bars; b++) barsTxt.push('');
  for (const n of notes) { const st = Math.round(n.t), ant = ((st % 16) + 16) % 16 >= 14 && n.d >= 1.5, bar = Math.max(0, Math.floor((st + (ant ? 2 : 0)) / 16)); const pcs = chordTones(s, Math.min(s.meta.bars - 1, b0 + bar)), pc = ((n.m % 12) + 12) % 12;
    if (st % 4 === 0 || n.d >= 2.7 || ant) { strong++; if (pcs.includes(pc)) strongCT++; else if (pcs.some((c) => (pc - c + 12) % 12 === 1)) avoid++; }
    if (bar < bars) barsTxt[bar] += (st % 16) + ':' + n.m + ' '; }
  let period = bars; for (const p of [1, 2, 4, 8]) { let ok = true; for (let b = p; b < bars; b++) if (barsTxt[b] !== barsTxt[b - p]) { ok = false; break; } if (ok) { period = p; break; } }
  const uniq = new Set(barsTxt).size;
  // contour: where the highest note of each 8-bar phrase falls (0 = start, 1 = end)
  const climax = []; for (let ph = 0; ph < bars; ph += 8) { let hi = -1, at = 0; for (const n of notes) if (n.t >= ph * 16 && n.t < (ph + 8) * 16 && n.m > hi) { hi = n.m; at = (n.t - ph * 16) / 128; } climax.push(at); }
  // phrase endings: last note before each 8-bar line is a chord tone and held ≥ 2 steps
  let ends = 0, endOk = 0; for (let ph = 8; ph <= bars; ph += 8) { const last = notes.filter((n) => n.t < ph * 16).pop(); if (!last) continue; ends++; const pcs = chordTones(s, b0 + Math.min(bars - 1, Math.floor(last.t / 16))); if (pcs.includes(((last.m % 12) + 12) % 12) && last.d >= 1.8) endOk++; }
  const onsets = notes.map((n) => Math.round(n.t)); const off8 = onsets.filter((x) => x % 2).length / onsets.length; const antic = notes.filter((n) => { const st = Math.round(n.t) % 16; return (st === 14 || st === 15) && n.d >= 1.5; }).length;
  const firstOn = []; for (let b = 0; b < bars; b++) { const f = notes.find((n) => n.t >= b * 16 - 0.01 && n.t < b * 16 + 16); if (f) firstOn.push(Math.round(f.t) - b * 16); } const onOne = firstOn.filter((x) => x === 0).length / Math.max(1, firstOn.length);
  let leaps = 0, steps = 0; for (let i = 1; i < notes.length; i++) { const d = Math.abs(notes[i].m - notes[i - 1].m); if (d > 4) leaps++; else steps++; }
  const ms = notes.map((n) => n.m), range = Math.max(...ms) - Math.min(...ms); const vels = notes.map((n) => n.v), vRange = Math.max(...vels) - Math.min(...vels);
  return { strongCT: strongCT / Math.max(1, strong), avoid, period, uniq, climax: climax.reduce((a, b) => a + b, 0) / climax.length, endRes: ends ? endOk / ends : null, density: notes.length / bars, off8, antic, onOne, leapRatio: leaps / Math.max(1, leaps + steps), range, vRange };
}
const genres = X.GENRES.filter((g) => g.lead && g.lead.role === 'hook').map((g) => g.id), rows = [];
for (const g of genres) for (const sd of seeds) { const m = metrics(X.composeTrack(g, sd)); if (m) rows.push(Object.assign({ g, sd }, m)); }
const keys = ['strongCT', 'avoid', 'period', 'uniq', 'climax', 'endRes', 'density', 'off8', 'antic', 'onOne', 'leapRatio', 'range', 'vRange'];
const mean = (k) => { const v = rows.map((r) => r[k]).filter((x) => x != null); return v.reduce((a, b) => a + b, 0) / v.length; };
const dist = (k) => { const c = {}; for (const r of rows) c[r[k]] = (c[r[k]] || 0) + 1; return JSON.stringify(c); };
console.log(`${rows.length} drops (${genres.length} hook genres × ${seeds.length} seeds) from ${path.relative(process.cwd(), loaderPath)}`);
for (const k of keys) console.log(k.padEnd(10), mean(k).toFixed(3), k === 'period' || k === 'uniq' ? dist(k) : '');
if (process.argv[4] === 'json') console.log(JSON.stringify(rows));
