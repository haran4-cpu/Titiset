// (v9.5) YOUR SOUND (ui/taste.js) in the composer: the palette leans toward the tags and sounds the user favours, and away from the
// ones turned down, in any genre; with no preference it picks exactly as before; Auto-DJ's next genre leans toward the genres kept.
// Usage: node tools/taste_test.cjs
const X = require('./load.cjs').load(); let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
const share = (gid, pref, tag) => { let n = 0, hit = 0; for (let seed = 1; seed <= 300; seed++) { const s = X.paletteSounds(gid, seed, pref); for (const slot of ['lead', 'chords', 'pad', 'bass', 'arp']) if (s[slot]) { n++; if ((X.SOUND_BANK[slot][s[slot].preset].tags || []).includes(tag)) hit++; } } return hit / Math.max(1, n); };
let same = true; for (const g of X.GENRES) for (let seed = 1; seed <= 20; seed++) if (JSON.stringify(X.paletteSounds(g.id, seed)) !== JSON.stringify(X.paletteSounds(g.id, seed, null))) same = false;
ok(same, 'no preference: every genre\'s palette picks exactly as before');
for (const [gid, tag] of [['deep-house', 'warm'], ['melodic-techno', 'dark'], ['trance', 'bright'], ['techno', 'gritty']]) { const base = share(gid, null, tag), up = share(gid, { tags: { [tag]: 4 } }, tag), down = share(gid, { tags: { [tag]: -3 } }, tag);
  ok(up > base * 1.25 + 0.02 && down < base, `${gid}: sounds tagged "${tag}" ${(100 * base).toFixed(0)} % of the picks → ${(100 * up).toFixed(0)} % when the user leans to it, ${(100 * down).toFixed(0)} % when away`); }
{ const P = X.paletteFor('deep-house'), slot = Object.keys(P).find((k) => P[k].length > 2), name = P[slot][1]; let n0 = 0, n1 = 0; for (let seed = 1; seed <= 300; seed++) { const a = X.paletteSounds('deep-house', seed), b = X.paletteSounds('deep-house', seed, { names: { [slot + '/' + name]: 4 } }); if (a[slot] && a[slot].preset === name) n0++; if (b[slot] && b[slot].preset === name) n1++; }
  ok(n1 > n0 * 1.5, `a favourite sound (${slot} ${name}) comes back more often: ${n0} → ${n1} of 300 tracks`); }
{ let base = 0, pref = 0; for (let k = 0; k < 400; k++) { const ctx = { hist: ['tech-house', 'tech-house'], step: k % 8, bpm: 126 }; if (X.planNext('tech-house', Object.assign({ rnd: X.rng(k * 7919 + 13) }, ctx)).gid === 'deep-house') base++; if (X.planNext('tech-house', Object.assign({ rnd: X.rng(k * 7919 + 13), pref: { 'deep-house': 3 } }, ctx)).gid === 'deep-house') pref++; }
  ok(pref > base * 1.5 + 5, `Auto-DJ after tech-house: deep house ${base} → ${pref} of 400 when the user keeps deep-house tracks`); }
console.log(fails ? `${fails} failure(s)` : 'taste: all checks pass'); process.exit(fails ? 1 : 0);
