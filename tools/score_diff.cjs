// What did a change in the composer touch? Event-level diff of two project trees (e.g. two unzipped versions), no audio: every genre x seeds, events matched
// by (channel, pitch, start). Reports the events left alone, only shortened / lengthened (d), removed, added, or changed in another field (v, f, x, y), and per channel.
// Usage: node tools/score_diff.cjs <rootOld> <rootNew> [seeds=1,2,3,11]     (a root is a folder that holds tools/load.cjs, e.g. the app/ folder of an unzipped version)
const [A, B] = [process.argv[2], process.argv[3]], seeds = (process.argv[4] || '1,2,3,11').split(',').map(Number);
const XA = require(A + '/tools/load.cjs').load(), XB = require(B + '/tools/load.cjs').load();
const CHN = ['kick', 'snare', 'hats', 'perc', 'bass', 'chords', 'pad', 'lead', 'arp', 'fx', 'tex', 'auto'];
const per = {}; let tracks = 0, total = 0, same = 0, onlyLen = 0, removed = 0, added = 0, other = 0, metaDiff = 0, secDiff = 0, chordDiff = 0;
const ex = { removed: [], added: [], other: [], longer: [], shorter: [] };
const lenDelta = { shorter: 0, longer: 0, maxShort: 0, maxLong: 0 };
const key = (E, i) => E.ch[i] + '|' + E.a[i] + '|' + E.t[i].toFixed(4);
for (const G of XA.GENRES) for (const seed of seeds) {
  const a = XA.composeTrack(G.id, seed), b = XB.composeTrack(G.id, seed); tracks++;
  if (JSON.stringify(a.meta) !== JSON.stringify(b.meta)) metaDiff++;
  if (JSON.stringify(a.sections) !== JSON.stringify(b.sections)) secDiff++;
  if (JSON.stringify(a.chords) !== JSON.stringify(b.chords)) chordDiff++;
  const EA = a.ev, EB = b.ev, M = new Map(); for (let i = 0; i < EB.n; i++) { const k = key(EB, i); (M.get(k) || M.set(k, []).get(k)).push(i); }
  const used = new Uint8Array(EB.n);
  for (let i = 0; i < EA.n; i++) { total++; const ch = EA.ch[i], P = per[ch] || (per[ch] = { n: 0, same: 0, len: 0, removed: 0, added: 0, other: 0 }); P.n++;
    const lst = M.get(key(EA, i)); let j = -1; if (lst) for (const c of lst) if (!used[c]) { j = c; break; }
    if (j < 0) { removed++; P.removed++; if (ex.removed.length < 6) ex.removed.push(`${G.id}#${seed} ${CHN[ch]} a=${EA.a[i]} t=${EA.t[i].toFixed(2)} d=${EA.d[i].toFixed(2)}`); continue; }
    used[j] = 1; const dv = Math.abs(EA.v[i] - EB.v[j]) > 1e-9, df = EA.f[i] !== EB.f[j], dx = Math.abs(EA.x[i] - EB.x[j]) > 1e-9, dy = Math.abs(EA.y[i] - EB.y[j]) > 1e-9, dd = Math.abs(EA.d[i] - EB.d[j]) > 1e-9;
    if (dv || df || dx || dy) { other++; P.other++; if (ex.other.length < 6) ex.other.push(`${G.id}#${seed} ${CHN[ch]} a=${EA.a[i]} t=${EA.t[i].toFixed(2)} v ${EA.v[i]}->${EB.v[j]} f ${EA.f[i]}->${EB.f[j]} x ${EA.x[i]}->${EB.x[j]} y ${EA.y[i]}->${EB.y[j]}`); continue; }
    if (dd) { onlyLen++; P.len++; const dl = EB.d[j] - EA.d[i]; if (dl < 0) { lenDelta.shorter++; lenDelta.maxShort = Math.min(lenDelta.maxShort, dl); if (ex.shorter.length < 4) ex.shorter.push(`${G.id}#${seed} ${CHN[ch]} a=${EA.a[i]} t=${EA.t[i].toFixed(2)} d ${EA.d[i].toFixed(2)}->${EB.d[j].toFixed(2)}`); } else { lenDelta.longer++; lenDelta.maxLong = Math.max(lenDelta.maxLong, dl); if (ex.longer.length < 4) ex.longer.push(`${G.id}#${seed} ${CHN[ch]} a=${EA.a[i]} t=${EA.t[i].toFixed(2)} d ${EA.d[i].toFixed(2)}->${EB.d[j].toFixed(2)}`); } }
    else { same++; P.same++; } }
  for (let j = 0; j < EB.n; j++) if (!used[j]) { added++; const ch = EB.ch[j], P = per[ch] || (per[ch] = { n: 0, same: 0, len: 0, removed: 0, added: 0, other: 0 }); P.added++; if (ex.added.length < 6) ex.added.push(`${G.id}#${seed} ${CHN[ch]} a=${EB.a[j]} t=${EB.t[j].toFixed(2)}`); } }
console.log(`${tracks} tracks (${XA.GENRES.length} genres x seeds ${seeds.join(',')}), ${total} events in the old composer`);
console.log(`unchanged ${same} (${(100 * same / total).toFixed(2)} %) · only the length changed ${onlyLen} · removed ${removed} · added ${added} · other field changed (v/f/x/y) ${other}`);
console.log(`length changes: ${lenDelta.shorter} shorter (longest cut ${(-lenDelta.maxShort).toFixed(2)} steps), ${lenDelta.longer} longer (largest ${lenDelta.maxLong.toFixed(2)} steps)`);
console.log(`tracks whose meta / sections / chord list differ: ${metaDiff} / ${secDiff} / ${chordDiff}`);
console.log('per channel (events · only length · removed · added · other):'); for (const ch of Object.keys(per).sort((x, y) => x - y)) { const P = per[ch]; console.log(`  ${CHN[ch].padEnd(7)} ${String(P.n).padStart(7)} · ${String(P.len).padStart(5)} · ${String(P.removed).padStart(4)} · ${String(P.added).padStart(4)} · ${String(P.other).padStart(4)}`); }
for (const k of Object.keys(ex)) if (ex[k].length) console.log(`e.g. ${k}:\n   ` + ex[k].join('\n   '));
