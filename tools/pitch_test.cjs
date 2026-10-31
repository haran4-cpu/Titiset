// tuning test: every pitched kit of every genre plays sustained notes; the rendered pitch is measured (normalised
// autocorrelation with parabolic peak refinement over 0.5 s after the attack) and compared with the MIDI note.
const { X } = require('./render.cjs');
const sr = 44100;
function pitch(x, a0, n, fmin, fmax) { let best = 0, bl = 0; const r = new Float64Array(Math.ceil(sr / fmin) + 2); const lmin = Math.floor(sr / fmax), lmax = Math.ceil(sr / fmin);
  for (let l = lmin; l <= lmax; l++) { let s = 0, a = 0, b = 0; for (let i = a0; i < a0 + n; i++) { s += x[i] * x[i + l]; a += x[i] * x[i]; b += x[i + l] * x[i + l]; } r[l] = s / Math.sqrt(a * b + 1e-20); }
  let gm = 0; for (let l = lmin; l <= lmax; l++) gm = Math.max(gm, r[l]); for (let l = lmin + 1; l < lmax; l++) if (r[l] >= 0.9 * gm && r[l] >= r[l - 1] && r[l] >= r[l + 1]) { bl = l; best = r[l]; break; }
  if (!bl) return 0; const a = r[bl - 1], b = r[bl], c = r[bl + 1]; return sr / (bl + 0.5 * (a - c) / (a - 2 * b + c)); }
let worst = 0, n = 0, fails = [];
// every genre kit, then every synth preset of the sound bank (as "bank" pseudo-genres)
const NOTES = { bass: [33, 40], chords: [57, 64], pad: [57], lead: [64, 69], hook: [69], arp: [64] };
const SOURCES = X.GENRES.map((G) => ({ id: G.id, parts: [['bass', G.bass.kit], ['chords', G.chords.kit], ['pad', G.pad && G.pad.kit], ['lead', G.lead && G.lead.kit], ['hook', G.hook && G.hook.kit], ['arp', G.arp && G.arp.kit]] }))
  .concat(Object.keys(NOTES).filter((sl) => X.SOUND_BANK[sl]).map((sl) => ({ id: 'bank', parts: Object.entries(X.SOUND_BANK[sl]).map(([k, p]) => [sl, Object.assign({ name: k }, p.k)]) })));
for (const G of SOURCES) for (const [part, kit] of G.parts) { const notes = NOTES[part] || [64];
  if (!kit) continue; for (const note of notes) {
    const s = new X.Synth(sr, 2, part === 'bass'); s.setKit(Object.assign({}, kit, { aSus: Math.max(0.6, kit.aSus || 0), aDec: Math.max(1, kit.aDec || 0), lfoDepth: 0, pEnv: 0, posLfo: 0, vowLfo: 0, l2Pitch: 0 })); // tuning of the oscillator: the modulations (filter LFO, pitch envelope, table and vowel LFO, vibrato) are held still
    s.bpm = 124;
    const N = Math.round(sr * 1.2), L = new Float32Array(N + 4000), R = new Float32Array(N + 4000); s.trigger(0, note, 0.9, N, { bright: 1 });
    for (let o = 0; o < N; o += 128) s.render(L.subarray(o, o + 128), R.subarray(o, o + 128), 128);
    const f = mtof(note), m = pitch(L, Math.round(sr * 0.25), Math.round(sr * 0.5), f / 1.5, f * 1.5); n++;
    const cents = m ? 1200 * Math.log2(m / f) : NaN; const ac = Math.abs(cents); if (!(ac <= worst)) worst = isNaN(ac) ? worst : Math.max(worst, ac);
    if (!(ac < 5)) fails.push(`${G.id}/${part}(${kit.name || kit.model}) note ${note}: ${isNaN(cents) ? 'no pitch' : cents.toFixed(1) + ' c'}`); } }
function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
console.log(`tuning: ${n} sustained notes, worst |error| ${worst.toFixed(2)} cents, ${fails.length} outside ±5 cents`); if (fails.length) console.log(fails.join('\n')); process.exit(fails.length ? 1 : 0); // it was graded in CI but never failed: an out-of-tune preset passed the gate
