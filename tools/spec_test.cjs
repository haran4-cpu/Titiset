// score-format tests: (1) round trip — every genre × seeds: compileSpec(exportSpec(score)) must give the same events;
// (2) the exported spec validates with 0 errors; (3) fuzz — broken specs never crash the validator and every error has a path.
const { load } = require('./load.cjs'); const X = load();
let fails = 0, checked = 0; const seeds = (process.argv[2] || '3,17,101').split(',').map(Number);
function eqScore(a, b) { const A = a.ev, B = b.ev; if (A.n !== B.n) return `event count ${A.n} vs ${B.n}`;
  for (let i = 0; i < A.n; i++) { if (A.ch[i] !== B.ch[i] || Math.abs(A.t[i] - B.t[i]) > 1e-6 || Math.abs(A.a[i] - B.a[i]) > 1e-4 || Math.abs(A.v[i] - B.v[i]) > 1e-4 || Math.abs(A.d[i] - B.d[i]) > 1e-3 || A.f[i] !== B.f[i])
    return `event ${i}: ch ${A.ch[i]}/${B.ch[i]} t ${A.t[i].toFixed(3)}/${B.t[i].toFixed(3)} a ${A.a[i]}/${B.a[i]} v ${A.v[i].toFixed(3)}/${B.v[i].toFixed(3)} d ${A.d[i].toFixed(3)}/${B.d[i].toFixed(3)}`; } return null; }
for (const G of X.GENRES) for (const seed of seeds) {
  const s = X.composeTrack(G.id, seed); const spec = X.exportSpec(s); const v = X.validateSpec(JSON.parse(JSON.stringify(spec)));
  if (!v.ok) { fails++; console.log('EXPORT INVALID', G.id, seed, v.errors.slice(0, 3)); continue; }
  const s2 = X.compileSpec(JSON.parse(JSON.stringify(spec))); const d = eqScore(s, s2); checked++;
  if (d) { fails++; console.log('ROUND TRIP', G.id, seed, d); }
  // the editor's form: no melody text, the melody comes back from its seed
  const d2 = eqScore(s, X.compileSpec(X.exportSpec(s, { melody: false }))); if (d2) { fails++; console.log('ROUND TRIP (melody from seed)', G.id, seed, d2); }
  // melody text round trip: export → text → parse → text is stable
  for (const f of X.exportSpec(s, { melody: true }).form) if (f.melody) { const p = X.parseMelody(f.melody); if (p.errors.length || X.melodyToText(p.bars, X.spellFor(s.meta.key, s.meta.mode)) !== f.melody) { fails++; console.log('MELODY TEXT', G.id, seed, p.errors[0] || 'not stable'); break; } }
}
// fuzz: mutate valid specs at random; the validator must never throw and every message needs a path
const R = X.rng(42); let fuzzN = 0, fuzzCrash = 0, noPath = 0, compiled = 0, compileCrash = 0;
const garbage = [null, -1, 1e9, 'x', '', [], {}, [1, 2], { a: 1 }, 'X...', 'C9 ' .repeat(16), true, 0.5, 'i bVI', NaN];
function mutate(o, depth) { if (o && typeof o === 'object') { const ks = Object.keys(o); if (!ks.length) return; const k = ks[Math.floor(R() * ks.length)];
    if (depth > 0 && o[k] && typeof o[k] === 'object' && R() < 0.6) mutate(o[k], depth - 1); else if (R() < 0.15) delete o[k]; else o[k] = garbage[Math.floor(R() * garbage.length)]; } }
for (let i = 0; i < 3000; i++) { const G = X.GENRES[i % X.GENRES.length]; const spec = X.exportSpec(X.composeTrack(G.id, i)); for (let m = 0; m < 1 + Math.floor(R() * 3); m++) mutate(spec, 4); fuzzN++;
  let v; try { v = X.validateSpec(spec); } catch (e) { fuzzCrash++; if (fuzzCrash < 4) console.log('VALIDATOR CRASH', e.stack.split('\n').slice(0,3).join(' | ')); continue; }
  for (const e of v.errors) if (typeof e.path !== 'string' || !e.msg) noPath++;
  if (v.ok) { try { X.compileSpec(spec); compiled++; } catch (e) { compileCrash++; if (compileCrash < 8) { console.log('COMPILE CRASH ON VALID SPEC', G.id, e.stack.split('\n').slice(0,3).join(' | ')); require('fs').writeFileSync('/tmp/claude-0/crash' + compileCrash + '.json', JSON.stringify(spec, null, 1)); } } } }
console.log(`round trip: ${checked} scores, ${fails} failures · fuzz: ${fuzzN} mutated specs, ${fuzzCrash} validator crashes, ${noPath} messages without a path, ${compiled} still-valid specs compiled, ${compileCrash} compile crashes`);
process.exit(fails || fuzzCrash || compileCrash || noPath ? 1 : 0);
