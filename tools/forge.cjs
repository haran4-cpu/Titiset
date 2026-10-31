#!/usr/bin/env node
// FORGE score CLI — the loop an author (person or AI) runs on a score file:
//   check  <song.json>                 validate (errors + warnings with paths and fixes), compile, summarise the result
//   grade  <song.json>                 check + render the peak section through the real engine + critic grades
//   wav    <song.json> <out.wav> [a-b] render bars a..b (default: the peak section) to a 16-bit WAV
//   export <genre> [seed]              print a complete spec for a genre track (a starting point to edit)
//   genres                             list genres with tempo, form, roles
//   card                               print the score guide for AI models (docs/FORGE-SCORE.md + live genre table)
const fs = require('fs');
const { X, renderTrack, wav } = require('./render.cjs');
const PCN = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const [cmd, a1, a2, a3] = process.argv.slice(2);
function readSpec(p) { const txt = fs.readFileSync(p, 'utf8'); try { return JSON.parse(txt); } catch (e) { console.log(`✗ ${p} is not valid JSON: ${e.message}`); process.exit(2); } }
function report(spec) {
  const v = X.validateSpec(spec);
  for (const e of v.errors) console.log(`✗ ${e.path || '(root)'}: ${e.msg}${e.hint ? `\n    fix: ${e.hint}` : ''}`);
  for (const w of v.warnings) console.log(`! ${w.path || '(root)'}: ${w.msg}${w.hint ? ` — ${w.hint}` : ''}`);
  if (!v.ok) { console.log(`\n${v.errors.length} error(s): nothing compiled.`); process.exit(1); }
  const s = X.compileSpec(spec), m = s.meta, ev = s.ev, cnt = new Array(11).fill(0); for (let i = 0; i < ev.n; i++) cnt[ev.ch[i]]++;
  const secs = m.bars * 16 * 60 / m.bpm / 4;
  console.log(`✓ "${m.name}" · ${X.GENRE_BY_ID[m.gid].name} base · ${m.bpm} BPM · ${PCN[m.key]} ${m.mode} · ${m.bars} bars = ${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, '0')}`);
  console.log('  form   ' + s.sections.map((x) => `${x.name}(${x.bars})`).join(' → '));
  const labels = []; let last = ''; for (const c of s.chords) if (c.label !== last) { labels.push(c.label); last = c.label; } console.log('  chords ' + labels.slice(0, 16).join(' ') + (labels.length > 16 ? ' …' : ''));
  console.log('  events ' + X.CH_NAMES.map((n, c) => (cnt[c] ? `${n} ${cnt[c]}` : '')).filter(Boolean).join(' · '));
  for (const w of X.lintScore(s)) console.log(`! ${w.path}: ${w.msg} — ${w.hint}`);
  const silent = ['kick', 'bass', 'lead'].filter((n) => !cnt[X.CH[n === 'lead' ? 'lead' : n]]); if (silent.length) console.log('! nothing plays on: ' + silent.join(', '));
  return s;
}
if (cmd === 'check') report(readSpec(a1));
else if (cmd === 'grade') { const s = report(readSpec(a1)); const C = require('./critic.cjs'), V = require('./verify_all.cjs'); const r = C.analyzeScore(s); const g = V.grade(r, s.contract);
  console.log(`\ncritic on "${r.section}" (16 bars, ${r.bpm} BPM):`); for (const x of g) console.log(`  ${x.st === 'pass' ? '✓' : x.st === 'warn' ? '!' : '✗'} ${x.k}: ${typeof x.v === 'number' ? +x.v.toFixed(3) : x.v} (want ${x.want})`);
  console.log(`  balance vs kick (LU): ${Object.entries(r.balance).filter(([, v]) => v != null && v !== 0).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  // balance against the genre's calibrated mix (measured when the genre was calibrated): > 3 LU off is audible as a wrong mix
  const ref = (require('../src/engine/calibration.json')[s.meta.gid] || {}).check; if (ref && ref.rel) { const NAMES = X.CH_NAMES; const off = [];
    NAMES.forEach((n, c) => { const v = r.balance[n], t = ref.rel[c]; if (v != null && t != null && c !== 9 && c !== 10 && Math.abs(v - t) > 3) off.push(`${n} ${v > t ? '+' : ''}${(v - t).toFixed(1)} LU vs the genre mix`); });
    console.log(off.length ? `  ! mix: ${off.join(' · ')} — adjust sound.<slot>.gain` : '  ✓ mix balance within 3 LU of the genre on every part'); }
  process.exit(g.some((x) => x.st === 'fail') ? 1 : 0); }
else if (cmd === 'wav') { const s = report(readSpec(a1)); const sec = X.peakSectionOf(s); let [from, to] = a3 ? a3.split('-').map(Number) : [sec.bar0, sec.bar0 + Math.min(16, sec.bars)];
  const r = renderTrack(s.meta.gid, s.meta.seed, { score: s, fromBar: from, toBar: to }); wav(a2, r.L, r.R, r.sr); console.log(`wrote ${a2}: bars ${from + 1}–${to}, ${(r.L.length / r.sr).toFixed(1)} s, ${r.lufsInt.toFixed(1)} LUFS`); }
else if (cmd === 'export') { const s = X.composeTrack(a1, +(a2 || 1)); console.log(JSON.stringify(X.exportSpec(s, { melody: true }), null, 1)); } // generated hooks written out as text: a starting point (loses per-note dynamics)
else if (cmd === 'card') process.stdout.write(require('./card.cjs').cardText(X));
else if (cmd === 'genres') for (const G of X.GENRES) console.log(`${G.id.padEnd(18)} ${String(G.bpm[0]).padStart(3)}–${G.bpm[1]} BPM · swing ${G.swing} · chords ${G.chords.role} · lead ${G.lead ? G.lead.role : 'none'} · modes ${G.modes.join('/')}`);
else { console.log('usage: forge.cjs check|grade <song.json> · wav <song.json> <out.wav> [fromBar-toBar] · export <genre> [seed] · genres · card (the AI guide)'); process.exit(2); }
