// forms, transitions and Extend (v9.4), over every genre (no audio):
//   (1) forms: of 20 new tracks per genre at the Club length, at least 12 have a form of their own; Club tracks last 6–8 minutes in the
//       house and techno styles (each style's own range, 0.3 min of slack for the 4-bar grid), Radio and Extended tracks theirs;
//   (2) builds: the noise riser under at most half of all builds; no track repeats a build's combination (drum shape, effect, ending),
//       and no track uses the same shape or the same effect twice in a row;
//   (3) Extend: a written form with one more act spliced in after a drop compiles, is longer by exactly that act, and keeps every
//       section before the splice.
// Usage: node tools/form_test.cjs [tracks per genre = 20]
const { load } = require('./load.cjs'); const X = load(); const N = +process.argv[2] || 20;
let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
const RANGE = { club: [6, 8], deep: [6, 8], techno: [6, 8], garage: [5, 6.5], trance: [6.5, 8.5], hard: [5.5, 7], psy: [7, 9], dnb: [5, 6.5], bass: [3.5, 4.8], pop: [3.3, 4.5], chill: [3, 4.5], ambient: [4.5, 7] };
const range = (st, len) => { const m = RANGE[st] || RANGE.club; return len === 'radio' ? [Math.max(2.6, m[0] * 0.5), Math.max(3.2, m[1] * 0.56)] : len === 'extended' ? [m[0] * 1.35, m[1] * 1.45] : m; };
let builds = 0, risers = 0, dupCombo = 0, sameNext = 0; const fewForms = [], outOfRange = [];
for (const G of X.GENRES) for (const len of ['club', 'radio', 'extended']) { const forms = new Set(), n = len === 'club' ? N : 6; let off = 0, worst = '';
  for (let k = 0; k < n; k++) { const s = X.composeTrack(G.id, 1000 + k * 7919, { length: len }), min = s.meta.bars * 4 / s.meta.bpm, [lo, hi] = range(G.form, len);
    forms.add(s.sections.map((x) => x.type[0] + x.bars + (x.layer === 'tease' ? 't' : '')).join(' ')); if (min < lo - 0.3 || min > hi + 0.3) { off++; worst = `${min.toFixed(1)} min (range ${lo.toFixed(1)}–${hi.toFixed(1)})`; }
    if (len !== 'club') continue; const bs = s.sections.filter((x) => x.type === 'build'), seen = new Set(); let prev = null;
    for (const b of bs) { builds++; if (!b.bx) continue; if (b.bx.fx === 'riser') risers++; const key = b.bx.shape + '/' + b.bx.fx + '/' + b.bx.end; if (seen.has(key)) dupCombo++; seen.add(key); if (prev && (prev.shape === b.bx.shape || prev.fx === b.bx.fx)) sameNext++; prev = b.bx; } }
  if (len === 'club' && forms.size < Math.ceil(0.6 * n)) fewForms.push(`${G.id} ${forms.size}/${n}`); if (off) outOfRange.push(`${G.id} ${len}: ${off} of ${n} out, e.g. ${worst}`); }
ok(!fewForms.length, `forms: at least 60 % of ${N} Club tracks per genre have their own form${fewForms.length ? ' — not: ' + fewForms.join(', ') : ''}`);
ok(!outOfRange.length, `lengths: Club, Radio and Extended tracks of every genre inside their style's range${outOfRange.length ? ' — ' + outOfRange.slice(0, 4).join('; ') : ''}`);
ok(builds > 500 && risers <= builds / 2, `the noise riser under ${risers} of ${builds} builds (${(100 * risers / builds).toFixed(0)} %, at most half)`);
ok(dupCombo === 0 && sameNext === 0, `no track repeats a build (shape · effect · ending): ${dupCombo} repeats, ${sameNext} times the same shape or effect twice in a row`);
{ let bad = 0, n = 0; const ex = []; for (const gid of ['techno', 'trance', 'house', 'dnb', 'psytrance', 'dubstep', 'lofi', 'afro-house', 'ukg', 'synthwave']) { const s0 = X.compileSpec({ forge: 1, genre: gid, seed: 31 }, { fastLevels: true }), spec = X.exportSpec(s0, { melody: false });
    const k = Math.max(0, s0.sections.map((x) => x.type).lastIndexOf('drop')), act = X.extensionAct(X.GENRE_BY_ID[gid], X.rng(7), 'extend', s0.sections[k]).map(([t, b, l]) => ({ section: t, bars: b, layer: l })), add = act.reduce((a, f) => a + f.bars, 0);
    spec.form = spec.form.slice(0, k + 1).concat(act, spec.form.slice(k + 1)); let s1 = null; try { s1 = X.compileSpec(spec, { fastLevels: true }); } catch (e) { s1 = null; } n++;
    const same = s1 && s0.sections.slice(0, k + 1).every((x, i) => s1.sections[i].type === x.type && s1.sections[i].bars === x.bars && s1.sections[i].bar0 === x.bar0);
    if (!s1 || s1.meta.bars !== s0.meta.bars + add || !same) { bad++; ex.push(gid); } }
  ok(!bad, `Extend: ${n} tracks with one more act spliced in after their last drop compile, are longer by exactly that act and keep every section before it${bad ? ' — not: ' + ex.join(', ') : ''}`); }
console.log(fails ? `${fails} failure(s)` : 'forms: all checks pass'); process.exit(fails ? 1 : 0);
