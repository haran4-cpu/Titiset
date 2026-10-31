// v9.3 acceptance: how the harmony meets the kick, and how much the tracks of one genre differ. 20 tracks × 8 genres.
//  · harmony changes landing exactly on a kick            ≤ 50 %  (9.2: every sustained change sat on the downbeat with the kick)
//  · stab / gate onsets on a kick                          ≤ 25 %
//  · anticipated changes (pushed before the bar line)      ≥ 30 %  in the genres whose style pushes
//  · section starts whose harmony does not enter on the downbeat ≥ 40 %
//  · identical drum skeletons between two tracks of a genre ≤ 20 %
//  · two hits of one drum voice in a row never play the same one-shot (the bank's round robin)
// Usage: node tools/rhythm_stats.cjs [--tracks 20] [--json out.json]. Exit 1 when a threshold fails (the numbers are printed either way).
const { load } = require('./load.cjs'); const E = load();
const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const NT = +arg('--tracks', 20), GEN = ['house', 'deep-house', 'tech-house', 'techno', 'melodic-techno', 'trance', 'dnb', 'ukg'];
const PUSHERS = new Set(['house', 'deep-house', 'tech-house', 'ukg', 'dnb', 'trance']); // the styles whose harmony anticipates the bar
const CH = E.CH; const res = {}; let fail = 0;
const pct = (a, b) => (b ? (100 * a) / b : 0);
for (const gid of GEN) {
  let chg = 0, chgKick = 0, ant = 0, stab = 0, stabKick = 0, secN = 0, secOff = 0; const skel = new Map();
  for (let k = 0; k < NT; k++) {
    const sc = E.composeTrack(gid, 1000 + k * 7919, {}), ev = sc.ev, n = ev.n, kicks = new Set(), on = new Map();
    for (let i = 0; i < n; i++) { const t = ev.t[i], c = ev.ch[i]; if (c === CH.kick) kicks.add(Math.round(t * 4));
      else if (c === CH.chords || c === CH.pad) { const key = Math.round(t * 4); if (!on.has(key)) on.set(key, { t, pcs: new Set(), long: false, ch: new Set() }); const o = on.get(key); o.pcs.add(((ev.a[i] | 0) % 12)); o.ch.add(c); if (ev.d[i] >= 6) o.long = true; } }
    const keys = [...on.keys()].sort((a, b) => a - b); let prev = '';
    for (const key of keys) { const o = on.get(key), sig = [...o.pcs].sort((a, b) => a - b).join(','), onKick = kicks.has(key);
      if (!o.long) { stab++; if (onKick) stabKick++; }
      if (sig !== prev) { chg++; if (onKick) chgKick++; const st = ((o.t % 16) + 16) % 16; if (st >= 13.5) ant++; } prev = sig; }
    for (const s of sc.sections) { const t0 = s.bar0 * 16; let first = null; for (const key of keys) { const t = on.get(key).t; if (t >= t0 - 2.01 && t < t0 + 16) { first = t; break; } } if (first == null) continue; secN++; if (Math.abs(first - t0) > 0.01) secOff++; }
    // the drum skeleton of the first drop's first bar (kick, snare, hats step patterns)
    const d = sc.sections.find((s) => s.type === 'drop') || sc.sections[0], b0 = d.bar0 * 16, pat = { 0: Array(16).fill('.'), 1: Array(16).fill('.'), 2: Array(16).fill('.') };
    for (let i = 0; i < n; i++) { const t = ev.t[i] - b0, c = ev.ch[i]; if (t >= 0 && t < 16 && c <= 2) pat[c][Math.round(t) & 15] = 'x'; }
    const sk = pat[0].join('') + '|' + pat[1].join('') + '|' + pat[2].join(''); skel.set(sk, (skel.get(sk) || 0) + 1); }
  let dup = 0; for (const v of skel.values()) if (v > 1) dup += v;
  const r = res[gid] = { changes: chg, changesOnKick: +pct(chgKick, chg).toFixed(1), anticipated: +pct(ant, chg).toFixed(1), stabs: stab, stabsOnKick: +pct(stabKick, stab).toFixed(1), sectionStarts: secN, sectionStartsOffDownbeat: +pct(secOff, secN).toFixed(1), identicalSkeletons: +pct(dup, NT).toFixed(1) };
  const bad = []; if (r.changesOnKick > 50) bad.push('changes on kick'); if (stab >= 20 && r.stabsOnKick > 25) bad.push('stabs on kick'); if (PUSHERS.has(gid) && r.anticipated < 30) bad.push('anticipation'); if (secN >= 10 && r.sectionStartsOffDownbeat < 40) bad.push('section entries'); /* a genre whose harmony never starts a section (techno's sparse stabs) has nothing to measure */ if (r.identicalSkeletons > 20) bad.push('identical skeletons');
  if (bad.length) fail++;
  console.log(`${bad.length ? '✗' : '✓'} ${gid.padEnd(15)} changes on kick ${String(r.changesOnKick).padStart(5)} %  anticipated ${String(r.anticipated).padStart(5)} %  stabs on kick ${String(r.stabsOnKick).padStart(5)} % (${stab})  section entries off the one ${String(r.sectionStartsOffDownbeat).padStart(5)} %  identical skeletons ${String(r.identicalSkeletons).padStart(5)} %${bad.length ? '   FAIL: ' + bad.join(', ') : ''}`); }
// the round robin: 12 hits of every voice of every family, no two in a row on the same one-shot
{ let rep = 0, hits = 0; for (const fam of E.BANK_FAMILIES) { const P = new E.BankPlayer(48000); P.setFamily(fam); P.ready(); for (const key of E.BANK_VOICES) { let last = null; for (let k = 0; k < 12; k++) { P.trigger(0, 0.9, key, 1, 0, 0, 1); const v = P.v.find((x) => x.on && x.t === 0 && x.key === key && x.wait === 0); hits++; if (v && v.buf === last) rep++; last = v ? v.buf : null; for (const x of P.v) x.on = 0; } } }
  res.roundRobin = { hits, repeats: rep }; if (rep) fail++; console.log(`${rep ? '✗' : '✓'} drum bank round robin: ${rep} repeated one-shots in ${hits} hits`); }
const out = arg('--json', null); if (out) require('fs').writeFileSync(out, JSON.stringify(res, null, 1));
console.log(fail ? `rhythm stats: ${fail} failing` : 'rhythm stats: all thresholds met'); process.exit(fail ? 1 : 0);
