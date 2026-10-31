// arrangement flow: render whole tracks, K-weighted loudness per beat, and what happens at every section boundary —
// the step across the line (last 2 bars → first 2 bars) and the sharpest single-beat change within ±1 bar of it.
// A boundary that moves > 8 LU inside one beat with no fill/sweep in front of it reads as a cut, not a transition.
const { X, renderTrack } = require('./render.cjs'); const { biquad } = require('./lib/dsp.cjs');
const ids = (process.argv[2] || 'tech-house,melodic-techno,trance,dnb,deep-house,synthwave').split(','), seed = +(process.argv[3] || 5), sr = 22050;
function beatLoud(L, R, sps) { const a = biquad('hs', 1681.97, 0.7072, sr, 4.0), b = biquad('hp', 38.13, 0.5003, sr), c = biquad('hs', 1681.97, 0.7072, sr, 4.0), d = biquad('hp', 38.13, 0.5003, sr);
  const hop = Math.round(sps * 4), out = []; let acc = 0, k = 0; for (let i = 0; i < L.length; i++) { const x = b(a(L[i])), y = d(c(R[i])); acc += x * x + y * y; if (++k === hop) { out.push(-0.691 + 10 * Math.log10(acc / hop + 1e-12)); acc = 0; k = 0; } } return out; }
const all = [];
for (const g of ids) { const s = X.composeTrack(g, seed), r = renderTrack(g, seed, { score: s, sr }); const lb = beatLoud(r.L, r.R, r.sps); const bar = (b) => { const v = lb.slice(b * 4, b * 4 + 4); return 10 * Math.log10(v.reduce((a, x) => a + Math.pow(10, x / 10), 0) / v.length); };
  console.log(`\n${g} seed ${seed} · ${s.meta.bars} bars · integrated ${r.lufsInt.toFixed(1)} LUFS`);
  s.sections.forEach((S, i) => { if (!i) return; const P = s.sections[i - 1], at = S.bar0; const before = (bar(at - 2) + bar(at - 1)) / 2, after = (bar(at) + bar(at + 1)) / 2;
    let sharp = 0, where = 0; for (let k = (at - 1) * 4; k < (at + 1) * 4 - 1; k++) { const dd = lb[k + 1] - lb[k]; if (Math.abs(dd) > Math.abs(sharp)) { sharp = dd; where = k + 1 - at * 4; } }
    const flag = Math.abs(sharp) > 8 ? (S.type === 'drop' && sharp > 0 ? ' (drop hit — intended)' : ' ← CUT') : '';
    all.push({ g, from: P.type, to: S.type, step: after - before, sharp, flag });
    console.log(`  ${P.type.padEnd(6)} → ${S.type.padEnd(6)} bar ${String(at + 1).padStart(3)}: step ${(after - before >= 0 ? '+' : '') + (after - before).toFixed(1)} LU, sharpest beat ${(sharp >= 0 ? '+' : '') + sharp.toFixed(1)} LU at beat ${where}${flag}`); });
  { const secL = (S) => { const v = lb.slice((S.bar0 + (S.bars > 4 ? 1 : 0)) * 4, (S.bar0 + S.bars - (S.bars > 4 && S.type !== 'build' ? 1 : 0)) * 4); return 10 * Math.log10(v.reduce((a, x) => a + Math.pow(10, x / 10), 0) / v.length); };
    const pk = secL(X.peakSectionOf(s)), bd = s.sections.find((S) => S.type === 'build'); console.log('  levels vs peak: ' + s.sections.map((S) => `${S.layer} ${(secL(S) - pk).toFixed(1)}`).join(' · ') + (bd ? ` · last build bar ${(bar(bd.bar0 + bd.bars - 1) - pk).toFixed(1)}` : '')); }
  // holes: beats inside sections > 10 LU below the section's median (unintended dropouts)
  let holes = 0; for (const S of s.sections) { const v = lb.slice(S.bar0 * 4, (S.bar0 + S.bars) * 4).slice().sort((a, b) => a - b), med = v[v.length >> 1]; for (let k = S.bar0 * 4 + 4; k < (S.bar0 + S.bars) * 4 - 4; k++) if (lb[k] < med - 10) holes++; }
  console.log(`  holes inside sections: ${holes} beat(s)`); }
const cuts = all.filter((x) => x.flag.includes('CUT')); console.log(`\n${all.length} boundaries, ${cuts.length} cuts: ${cuts.map((c) => `${c.g} ${c.from}→${c.to} ${c.sharp.toFixed(1)}`).join(' · ')}`);
