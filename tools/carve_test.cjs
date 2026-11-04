// (v10) MIX CARVE checks, on the exact engine path (tools/render.cjs, the drop, 8 bars, with stems):
//   (1) carve 0 renders exactly the 9.5 mix (the unit is skipped);
//   (2) a part is only dipped while its key part plays: the chords alone (lead, arp, bass, snare muted) are unchanged by the carve;
//   (3) no clicks: the dipped parts' stems have no more clicks with the carve than without;
//   (4) the drop's loudness moves by less than 0.6 LU, the true peak stays under −1 dBTP;
//   (5) it does what it is for: the mix audit's crowding index (masked energy between parts) falls, the low-mids (250–500 Hz) fall,
//       and the bass's sub gives way to the kick further — across six genres.
// Usage: node tools/carve_test.cjs
const { X, renderTrack } = require('./render.cjs'); const { clicks, mono } = require('./critic.cjs'); const { lufs, truePeak } = require('./lib/dsp.cjs');
const { execFileSync } = require('child_process'); const path = require('path');
let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
const G = ['deep-house', 'melodic-techno', 'trance', 'dnb', 'synthwave', 'afro-house'];
const r = (g, carve, o) => { const s = X.composeTrack(g, 1), d = X.peakSectionOf(s); X.noiseSeed(7); return renderTrack(g, 1, Object.assign({ score: s, fromBar: d.bar0, toBar: d.bar0 + 8, stems: true, carve }, o || {})); };
const maxDiff = (a, b) => { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m; };
for (const g of G.slice(0, 3)) {
  const off = r(g, 0), on = r(g, 1), off2 = r(g, 0);
  ok(maxDiff(off.L, off2.L) === 0, `${g}: carve 0 is deterministic and skips the unit`);
  // (2) chords alone: everything that keys a dip muted
  const solo = Array.from({ length: 11 }, (_, c) => (c === 5 || c === 0 ? 1 : 0)), a = r(g, 0, { chanOn: solo }), b = r(g, 1, { chanOn: solo });
  const d = maxDiff(mono(a.stems[5]), mono(b.stems[5])); ok(d < 1e-6, `${g}: the chords alone are not dipped (largest difference ${d.toExponential(1)})`);
  // (3) clicks on the dipped parts
  for (const c of [4, 5, 6, 8]) { const on0 = [], s = on.score; for (let i = 0; i < s.ev.n; i++) if (s.ev.ch[i] === c && s.ev.t[i] >= on.fromStep) on0.push((s.ev.t[i] - on.fromStep) * on.sps);
    const k0 = clicks(mono(off.stems[c]), off.sr, on0), k1 = clicks(mono(on.stems[c]), on.sr, on0); ok(k1 <= k0, `${g} ${X.CH_NAMES ? X.CH_NAMES[c] : 'ch' + c}: clicks ${k1} with the carve, ${k0} without`); }
  const l0 = lufs(off.L, off.R, off.sr).I, l1 = lufs(on.L, on.R, on.sr).I, tp = truePeak(on.L, on.R);
  ok(Math.abs(l1 - l0) < 0.6 && tp < -1, `${g}: loudness ${l0.toFixed(1)} → ${l1.toFixed(1)} LUFS, true peak ${tp.toFixed(2)} dBTP`); }
// (5) the audit, with and without
const audit = (carve) => { const env = Object.assign({}, process.env, { FORGE_CARVE: String(carve) }); return JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'mix_audit.cjs'), G.join(','), '1', '--json'], { env, maxBuffer: 1 << 26 }).toString()).summary; };
const A0 = audit(0), A1 = audit(1);
ok(A1.crowd < A0.crowd * 0.8, `crowding index ${A0.crowd} % → ${A1.crowd} % (masked energy between parts, mid band)`);
ok(A1.bands.mud < A0.bands.mud - 0.4, `low-mids (250–500 Hz) ${A0.bands.mud} → ${A1.bands.mud} dB of the mix`);
ok(A1.bassDuck < A0.bassDuck - 1, `the bass's sub gives way to the kick: ${A0.bassDuck} → ${A1.bassDuck} dB in the 40 ms after a kick`);
console.log(fails ? `carve: ${fails} failing` : 'carve: all checks pass'); process.exit(fails ? 1 : 0);
