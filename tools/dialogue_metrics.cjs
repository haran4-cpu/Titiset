// part dialogue in drops: how often the arp / second hook (ch 8) hits on the same 16th as a lead onset (they talk over each
// other) and the arp's velocity in bars/beats where the lead rests vs where it plays (an answer should be heard in the gaps).
// Usage: node tools/dialogue_metrics.cjs [genres|all] [seeds]
const { X } = require('./render.cjs'); const ids = !process.argv[2] || process.argv[2] === 'all' ? X.GENRES.map((g) => g.id) : process.argv[2].split(','), NS = +(process.argv[3] || 4);
let col = 0, arpN = 0, vRest = 0, nRest = 0, vPlay = 0, nPlay = 0, tracks = 0;
for (const g of ids) for (let seed = 1; seed <= NS; seed++) { const s = X.composeTrack(g, seed), E = s.ev; const lead = new Set(), leadHeld = new Set(); let any = false;
  for (let i = 0; i < E.n; i++) if (E.ch[i] === 7) { const t = Math.round(E.t[i]); lead.add(t); for (let k = 0; k < Math.max(1, Math.round(E.d[i])); k++) leadHeld.add(t + k); }
  for (const sec of s.sections) { if (sec.type !== 'drop') continue; const a = sec.bar0 * 16, b = a + sec.bars * 16;
    for (let i = 0; i < E.n; i++) if (E.ch[i] === 8 && E.t[i] >= a && E.t[i] < b) { any = true; const t = Math.round(E.t[i]); arpN++; if (lead.has(t)) col++; if (leadHeld.has(t) || lead.has(t)) { vPlay += E.v[i]; nPlay++; } else { vRest += E.v[i]; nRest++; } } }
  if (any && lead.size) tracks++; }
console.log(`tracks with lead + arp in drops: ${tracks} · arp notes ${arpN} · on a lead onset ${(100 * col / arpN).toFixed(1)} % · arp velocity where the lead plays ${(vPlay / nPlay).toFixed(2)} vs where it rests ${(vRest / nRest).toFixed(2)} (${(100 * nRest / arpN).toFixed(0)} % of arp notes in lead gaps)`);
