// content audit (v9.1): what a track of each genre actually CONTAINS, measured on the composed score (no audio), the way a
// producer would describe it — not how it sounds, what is there:
//   chords     distinct chords in the track · chord changes per 16 bars of the drops (does the harmony move?)
//   loop       in the main drop, how many times the lead's (and the second voice's) bar repeats itself on average:
//              1-bar loop over 32 bars = 32; a 2-bar riff with a variation and turnarounds ≈ 4–6; a written 8-bar period ≈ 1–2
//   layers     pitched parts sounding (bass, chords, pad, lead, second voice) per section type
//   bare       the longest stretch outside the intro where only drums and bass play (bars)
//   bassPc     distinct bass notes (pitch classes) in the drops
// and grades each against what the genre's practice expects (EXPECT below: the harmony moves or may stay; how much the lead
// may loop; the longest bare stretch). Usage: node tools/content_audit.cjs [genres|all] [seeds=1,2,3]
const { X, appScore } = require('./render.cjs');
const args = process.argv.slice(2), gids = !args[0] || args[0] === 'all' ? X.GENRES.map((g) => g.id) : args[0].split(','), seeds = (args[1] || '1,2,3').split(',').map(Number);
// per family: moves = the harmony should change in the drops; loop = the most a lead bar may repeat itself on average in a drop;
// bare = the longest drums-and-bass-only stretch after the intro (bars). Static harmony is idiomatic in techno, minimal, dub
// techno and acid; elsewhere a track that sits on one chord for minutes is a loop, not a song.
const EXPECT = { house: { moves: 1, loop: 8, bare: 32 }, techno: { moves: 0, loop: 16, bare: 48 }, trance: { moves: 1, loop: 6, bare: 16 }, psy: { moves: 1, loop: 8, bare: 32 },
  dnb: { moves: 1, loop: 8, bare: 32 }, bass: { moves: 1, loop: 8, bare: 32 }, hiphop: { moves: 1, loop: 8, bare: 32 }, garage: { moves: 1, loop: 8, bare: 32 }, afro: { moves: 1, loop: 8, bare: 32 },
  latin: { moves: 1, loop: 8, bare: 32 }, hard: { moves: 1, loop: 8, bare: 32 }, pop: { moves: 1, loop: 6, bare: 16 }, breaks: { moves: 1, loop: 8, bare: 32 }, chill: { moves: 1, loop: 6, bare: 16 }, ambient: { moves: 1, loop: 8, bare: 999 } };
const STATIC_OK = new Set(['techno', 'hard-techno', 'dub-techno', 'acid']);
const PITCHED = [4, 5, 6, 7, 8], NAMES = { 4: 'bass', 5: 'chords', 6: 'pad', 7: 'lead', 8: 'voice2' };
let fails = 0; const rows = [];
for (const gid of gids) { const G = X.GENRE_BY_ID[gid]; if (!G) { console.log('unknown', gid); continue; } const ex = EXPECT[G.family] || EXPECT.house, acc = { chords: [], moves: [], loop: [], loop2: [], bare: [], bassPc: [], layers: {} };
  for (const seed of seeds) { const s = appScore(gid, seed), E = s.ev, bars = s.meta.bars, byBar = Array.from({ length: bars }, () => ({}));
    for (let i = 0; i < E.n; i++) { const b = Math.floor(E.t[i] / 16); if (b < 0 || b >= bars) continue; const c = E.ch[i]; if (!PITCHED.includes(c)) continue; const o = byBar[b][c] = byBar[b][c] || []; o.push(`${Math.round((E.t[i] - b * 16) * 4)}:${Math.round(E.a[i])}`); }
    acc.chords.push(new Set(s.chords.map((c) => c.label)).size);
    let drops = s.sections.filter((x) => x.type === 'drop'); if (!drops.length) drops = s.sections.filter((x) => x.type === 'groove'); let ch = 0, n16 = 0; // (genres without drops — lo-fi, downtempo, ambient — are judged on their grooves)
    for (const d of drops) { for (let b = d.bar0 + 1; b < d.bar0 + d.bars; b++) if (s.chords[b].label !== s.chords[b - 1].label) ch++; n16 += d.bars / 16; }
    acc.moves.push(n16 ? ch / n16 : 0);
    const main = drops.reduce((a, d) => (!a || d.bars > a.bars ? d : a), null);
    for (const [c, key] of [[7, 'loop'], [8, 'loop2']]) { if (!main) continue; const sig = []; for (let b = main.bar0; b < main.bar0 + main.bars; b++) if (byBar[b][c]) sig.push(byBar[b][c].join(' ')); if (sig.length >= 4) acc[key].push(sig.length / new Set(sig).size); }
    let run = 0, best = 0; const intro = s.sections.filter((x) => x.type === 'intro').reduce((a, x) => Math.max(a, x.bar0 + x.bars), 0);
    for (let b = intro; b < bars; b++) { const sec = s.sections.find((x) => b >= x.bar0 && b < x.bar0 + x.bars); const melodic = [5, 6, 7, 8].some((c) => byBar[b][c]); if (!melodic && sec.type !== 'outro') { run++; best = Math.max(best, run); } else run = 0; }
    acc.bare.push(best);
    const bp = new Set(); for (const d of drops) for (let b = d.bar0; b < d.bar0 + d.bars; b++) for (const n of byBar[b][4] || []) bp.add(+n.split(':')[1] % 12); acc.bassPc.push(bp.size);
    for (const sec of s.sections) { const k = sec.type; let tot = 0; for (let b = sec.bar0; b < sec.bar0 + sec.bars; b++) tot += PITCHED.filter((c) => byBar[b][c]).length; (acc.layers[k] = acc.layers[k] || []).push(tot / sec.bars); } }
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN), f1 = (x) => (isNaN(x) ? '—' : x.toFixed(1));
  const moves = avg(acc.moves), loop = avg(acc.loop), loop2 = avg(acc.loop2), bare = Math.max(...acc.bare), chords = avg(acc.chords);
  const bad = []; if (ex.moves && !STATIC_OK.has(gid) && moves < 0.5) bad.push('harmony does not move in the drops'); if (loop > ex.loop) bad.push(`lead loops (${f1(loop)}× > ${ex.loop})`); if (loop2 > ex.loop * 1.5) bad.push(`second voice loops (${f1(loop2)}×)`); if (bare > ex.bare) bad.push(`${bare} bars of drums + bass only`);
  if (bad.length) fails++;
  rows.push(`${bad.length ? '✗' : '✓'} ${gid.padEnd(18)} chords ${f1(chords).padStart(4)} · changes/16 bars ${f1(moves).padStart(4)} · lead loop ${f1(loop).padStart(5)}× · voice2 ${f1(loop2).padStart(5)}× · bare ${String(bare).padStart(3)} · bass notes ${f1(avg(acc.bassPc))} · layers ${Object.entries(acc.layers).map(([k, v]) => k + ' ' + f1(avg(v))).join(' ')}${bad.length ? '\n     ' + bad.join(' · ') : ''}`); }
console.log(rows.join('\n')); console.log(fails ? `\n${fails} genre(s) below their practice` : '\ncontent: every genre within its practice'); process.exit(fails ? 1 : 0);
