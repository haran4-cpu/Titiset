// Score-level timing and writing invariants over every genre (no audio): what the composer writes must sit where the music says it sits.
//   (1) swing: on a swung genre every event on an odd 16th carries the swing offset (a snare roll of 32nds is the one thing allowed to stay straight);
//   (2) a chord is never rung into the next one: no sustained note sounds 1.5 steps or more into a chord it is not part of (before v8.7-fixed-7 the
//       forced turnaround of a build left the old pad under the new chord for up to two bars);
//   (3) the gap before a drop is silent: no pitched note is still sounding 0.5 step into it, no drum or percussion hit starts inside it (v9.4: each build
//       chose its own gap — half a beat as before, a whole beat, or none for a build that runs straight into its drop — and a breakdown that drops
//       straight in may end on half a beat of air: each gap is checked at its own length);
//   (4) nothing sustained outlives its section (v9.3: a chord or pad pushed up to an 8th, swung, before a bar line anticipates the section that
//       starts there and belongs to it).
// Usage: node tools/timing_test.cjs [seeds=1,2,3]
const { load } = require('./load.cjs'); const X = load(); const seeds = (process.argv[2] || '1,2,3').split(',').map(Number);
let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
const CHN = ['kick', 'snare', 'hats', 'perc', 'bass', 'chords', 'pad', 'lead', 'arp', 'fx', 'tex', 'auto'], DROP_GAP = 2;
const bad = { swing: [], clash: [], gapNote: [], gapHit: [], spill: [] }; let tracks = 0, swingN = 0, builds = 0, notes = 0, gapsN = 0;
const add = (k, m) => { if (bad[k].length < 4) bad[k].push(m); bad[k].n = (bad[k].n || 0) + 1; };
for (const G of X.GENRES) for (const seed of seeds) {
  const s = X.composeTrack(G.id, seed), E = s.ev, N = E.n, bars = s.meta.bars; tracks++;
  const swingOff = Math.max(0, (G.swing - 50) / 50), secOf = (bar) => s.sections.find((x) => bar >= x.bar0 && bar < x.bar0 + x.bars) || s.sections[s.sections.length - 1];
  const changes = new Set(); for (let b = 1; b < bars; b++) { const a = s.chords[b - 1], c = s.chords[b]; if (a.root !== c.root || a.q !== c.q || a.tones.join() !== c.tones.join()) changes.add(b); }
  const gaps = s.sections.filter((x) => x.type === 'build' || x.dx === 'gap').map((x) => [(x.bar0 + x.bars) * 16, x.type === 'build' ? (x.bx ? x.bx.gap : DROP_GAP) : DROP_GAP]).filter((g) => g[1] > 0); gapsN += gaps.length; builds += s.sections.filter((x) => x.type === 'build').length;
  for (let i = 0; i < N; i++) { const ch = E.ch[i], t = E.t[i], d = E.d[i];
    // (1) swing
    if (swingOff > 0.02 && ch <= 8 && ch !== 1) { const r = Math.round(t), dev = t - r; if ((r & 1) && Math.abs(dev) <= 0.45) { swingN++; if (Math.abs(dev - swingOff) > 0.06) add('swing', `${G.id}#${seed} ${CHN[ch]} at step ${t.toFixed(3)} (odd 16th ${r}, offset ${dev.toFixed(3)}, swing ${swingOff.toFixed(3)})`); } }
    if (ch >= 4 && ch <= 8) { notes++; const pc = ((E.a[i] % 12) + 12) % 12, t1 = t + d;
      // (2) a note across a chord change
      for (let b = Math.floor(t / 16) + 1; b < bars && b * 16 < t1 - 1.5; b++) { if (!changes.has(b)) continue; const tones = s.chords[b].tones; if (tones.includes(pc)) continue;
        add('clash', `${G.id}#${seed} ${CHN[ch]} note ${E.a[i]} from step ${t.toFixed(1)} for ${d.toFixed(1)} still sounds ${(t1 - b * 16).toFixed(1)} steps into ${s.chords[b].label}`); }
      // (3) pitched note through the gap before a drop
      for (const [end, gl] of gaps) if (t < end - gl && t1 > end - gl + 0.5 && t >= end - 64) add('gapNote', `${G.id}#${seed} ${CHN[ch]} note from step ${t.toFixed(1)} (len ${d.toFixed(1)}) rings ${(t1 - (end - gl)).toFixed(1)} steps into the ${gl}-step gap before step ${end}`);
      // (4) outliving the section
      const S = secOf(Math.floor((ch === 5 || ch === 6 ? t + 2.6 : t) / 16)), sEnd = (S.bar0 + S.bars) * 16; if (t1 > sEnd + 1 && S !== s.sections[s.sections.length - 1]) add('spill', `${G.id}#${seed} ${CHN[ch]} note from step ${t.toFixed(1)} ends ${(t1 - sEnd).toFixed(1)} steps after its section`); }
    // (3b) a drum / percussion hit inside the gap (a downbeat hit of the drop with a hair of negative humanise, under 0.1 step before the line, is the drop)
    if (ch <= 3) for (const [end, gl] of gaps) if (t >= end - gl && t < end - 0.1) add('gapHit', `${G.id}#${seed} ${CHN[ch]} hit at step ${t.toFixed(3)} inside the ${gl}-step gap before step ${end}`);
  } }
ok(swingN > 3000 && bad.swing.n === undefined, `swing: ${swingN} events on odd 16ths of swung genres all carry the swing offset${bad.swing.n ? ' — ' + bad.swing.n + ' do not, e.g. ' + bad.swing[0] : ''}`);
ok(bad.clash.n === undefined, `no sustained note rings into a chord it is not part of (${notes} sustained notes in ${tracks} tracks)${bad.clash.n ? ' — ' + bad.clash.n + ', e.g. ' + bad.clash[0] : ''}`);
ok(bad.gapNote.n === undefined, `the gap before a drop is silent for pitched parts (${builds} builds, ${gapsN} gaps)${bad.gapNote.n ? ' — ' + bad.gapNote.n + ', e.g. ' + bad.gapNote[0] : ''}`);
ok(bad.gapHit.n === undefined, `no drum or percussion hit starts inside it${bad.gapHit.n ? ' — ' + bad.gapHit.n + ', e.g. ' + bad.gapHit[0] : ''}`);
ok(bad.spill.n === undefined, `nothing sustained outlives its section${bad.spill.n ? ' — ' + bad.spill.n + ', e.g. ' + bad.spill[0] : ''}`);
console.log(fails ? `${fails} failure(s)` : `timing: all checks pass (${tracks} tracks)`); process.exit(fails ? 1 : 0);
