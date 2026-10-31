// sound bank test: every preset in a genre that has the slot — rendered through the real engine (peak section, 8 bars) —
// must stay finite, keep the true peak under the limiter ceiling, and sit within 3 LU of the genre's own sound for that
// part (level matching works), with no clicks the genre's own sound does not have.
const { X, renderTrack } = require('./render.cjs'); const { stemLufs, clicks, mono } = require('./critic.cjs');
const HOST = { lead: 'trance', chords: 'deep-house', pad: 'progressive-house', bass: 'tech-house', arp: null, kick: 'house', snare: 'house', hats: 'house', perc: 'afro-house' };
const CH = { lead: 7, chords: 5, pad: 6, bass: 4, arp: 8, kick: 0, snare: 1, hats: 2, perc: 3 };
if (!HOST.arp) HOST.arp = (X.GENRES.find((g) => g.arp || g.hook) || {}).id;
let fails = 0; const out = [];
function measure(gid, sound) { const spec = { forge: 1, genre: gid, seed: 4 }; if (sound) spec.sound = sound; const s = X.compileSpec(spec), sec = X.peakSectionOf(s);
  const r = renderTrack(gid, 4, { score: s, fromBar: sec.bar0, toBar: sec.bar0 + 8, stems: true }); let fin = true, pk = 0; for (const x of r.L) { if (!isFinite(x)) fin = false; pk = Math.max(pk, Math.abs(x)); }
  const lv = (c) => stemLufs(r.stems[c], r.sr), on = (c) => { const o = []; for (let i = 0; i < s.ev.n; i++) if (s.ev.ch[i] === c && s.ev.t[i] >= r.fromStep) o.push((s.ev.t[i] - r.fromStep) * r.sps); return o; }; return { fin, pk, lv, on, stems: r.stems, sr: r.sr }; }
for (const [slot, gid] of Object.entries(HOST)) { if (!gid || !X.SOUND_BANK[slot]) continue; const base = measure(gid), c = CH[slot], ref = slot === 'kick' ? base.lv(1) : base.lv(0), b0 = base.lv(c) - ref, bc = clicks(mono(base.stems[c]), base.sr, base.on(c));
  for (const name of Object.keys(X.SOUND_BANK[slot])) { if (process.argv[2] && !process.argv[2].split(',').includes(slot + '/' + name)) continue; const m = measure(gid, { [slot]: { preset: name } }), rel = m.lv(c) - (slot === 'kick' ? m.lv(1) : m.lv(0)), d = rel - b0, ck = clicks(mono(m.stems[c]), m.sr, m.on(c));
    const tol = slot === 'kick' || slot === 'snare' || slot === 'hats' ? 4 : 3, ok = m.fin && m.pk <= 1 && Math.abs(d) <= tol && ck <= bc + 2;
    if (!ok) fails++; out.push(`${ok ? '✓' : '✗'} ${slot}/${name.padEnd(13)} in ${gid.padEnd(17)} ${(d >= 0 ? '+' : '') + d.toFixed(1)} LU vs the genre's ${slot}${ck > bc + 2 ? `, clicks ${ck} (genre ${bc})` : ''}${m.pk > 1 ? ', CLIPS' : ''}`); } }
console.log(out.join('\n')); console.log(fails ? `${fails} preset(s) failed` : `all ${out.length} presets: level-matched, clean`); process.exit(fails ? 1 : 0);
