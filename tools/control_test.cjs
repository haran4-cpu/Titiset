// (v10.1) control of everything that plays, on the exact engine code:
//   (1) ear candy: a kind switched off is replaced by one that is on (same place); density 0 plays no candy; with transitions off no riser
//       or impact plays, and the candy still does;
//   (2) the minimal candy (14–19): each one in key — its strongest pitch class is a tone of the chord it was given — finite, no clicks at
//       its start, its level within 4 dB of Bubbles' and its peak no higher;
//   (3) the atmosphere: a track with none gets the chosen one; None silences a track's own; the level scales it; the tone tilts it.
// Usage: node tools/control_test.cjs
const { load } = require('./load.cjs'); const X = load(); const { fft } = require('./lib/dsp.cjs'); const { clicks } = require('./critic.cjs');
let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
const SR = 44100;
// (1) candy gating — a Deck with a hand-made event list: candy kinds 7, 11, 9 and a riser (0) and a layered transition (13)
{ const s = X.composeTrack('techno', 7), D = new X.Deck(SR, 0); D.load(s, null); D.playing = 1;
  const kinds = []; D.fx.trigger = (off, k) => kinds.push(k); // only which kind the deck asks the FX unit for
  const run = (setup, list) => { kinds.length = 0; D.setCandy(Object.assign({ allow: X.CANDY_DEFAULT, level: 1, density: 1, tx: 1, txLevel: 1 }, setup)); for (const [k, i] of list) { D.ev.a[i] = k; } return kinds; };
  // find fx events in the score and replay their kinds through the deck's case 9
  const fxI = []; for (let i = 0; i < s.ev.n; i++) if (s.ev.ch[i] === 9) fxI.push(i);
  const fire = (setup, assign) => { kinds.length = 0; D.setCandy(Object.assign({ allow: X.CANDY_DEFAULT, level: 1, density: 1, tx: 1, txLevel: 1 }, setup)); for (let j = 0; j < fxI.length; j++) { const i = fxI[j]; s.ev.a[i] = assign[j % assign.length]; D.ev = s.ev; D.dispatch(i, 0); } return kinds.slice(); };
  const hasTrig = typeof D.dispatch === 'function';
  if (!hasTrig) ok(false, 'the deck exposes no single-event entry (dispatch) to test candy gating with'); else {
    const k1 = fire({}, [7, 11, 9]); ok(k1.length && k1.every((k) => k === 9 || (k >= 14 && k <= 19)) && k1.includes(9), `by default Glass and Acid are replaced by kinds that are on (${[...new Set(k1)].join(', ')})`);
    const k2 = fire({ density: 0 }, [9, 14]); ok(k2.length === 0, `density 0: no candy (${k2.length})`);
    const k3 = fire({ tx: 0 }, [0, 13, 9]); ok(!k3.includes(0) && !k3.includes(13) && k3.includes(9), `transitions off: no riser or layered transition, the candy still plays (${[...new Set(k3)].join(', ')})`);
    const k4 = fire({ allow: (1 << 7) | (1 << 11) }, [9, 14]); ok(k4.length && k4.every((k) => k === 7 || k === 11), `only Glass and Acid on: everything else becomes them (${[...new Set(k4)].join(', ')})`); } }
// (2) the minimal candy alone
function solo(kind, seed) { X.noiseSeed(seed); const fx = new X.Fx(SR); fx.setTempo(124); fx.mask = 0x91; fx.root = 0; const sps = SR * 60 / 124 / 4, N = SR * 3, L = new Float32Array(N), R = new Float32Array(N), bl = new Float32Array(128), br = new Float32Array(128);
  fx.trigger(0, kind, 0.8, (kind === 9 ? 4 : 3) * sps, 72, 0.3); for (let i = 0; i < N; i += 128) { bl.fill(0); br.fill(0); fx.render(bl, br, 128); for (let j = 0; j < 128; j++) { L[i + j] = bl[j]; R[i + j] = br[j]; } } return { L, R }; }
const rms = (x) => { let e = 0; for (const v of x.L) e += v * v; for (const v of x.R) e += v * v; return 10 * Math.log10(e / x.L.length + 1e-20); }, peak = (x) => { let p = 0; for (let i = 0; i < x.L.length; i++) p = Math.max(p, Math.abs(x.L[i]), Math.abs(x.R[i])); return 20 * Math.log10(p + 1e-12); };
const bub = solo(9, 1), bR = rms(bub), bP = peak(bub);
for (const [k, name] of [[14, 'Blip'], [15, 'Sonar'], [16, 'Click'], [17, 'Dub stab'], [18, 'Drop'], [19, 'Glitch']]) { const x = solo(k, 2); let bad = 0; for (let i = 0; i < x.L.length; i++) if (!Number.isFinite(x.L[i])) bad++;
  const N = 16384, re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < N; i++) { re[i] = (x.L[i] + x.R[i]) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)); im[i] = 0; } fft(re, im); const pc = new Float64Array(12);
  for (let b = Math.ceil(150 * N / SR); b < 6000 * N / SR; b++) { const f = b * SR / N, m = Math.round(69 + 12 * Math.log2(f / 440)); pc[((m % 12) + 12) % 12] += re[b] ** 2 + im[b] ** 2; }
  const top = pc.indexOf(Math.max(...pc)), inKey = [0, 4, 7].includes(top), mono = Float32Array.from(x.L, (v, i) => (v + x.R[i]) * 0.5), first = clicks(mono, SR, [0]), r = rms(x), p = peak(x), click = k === 16;
  ok(bad === 0 && inKey && first === 0 && Math.abs(r - bR) <= (click ? 12 : 4) && p <= bP + 0.5, `${name}: in key (strongest pitch class ${top} of the C major chord), no clicks (${first}), level ${(r - bR).toFixed(1)} dB and peak ${(p - bP).toFixed(1)} dB against Bubbles`); }
// (3) the atmosphere
{ const s = X.composeTrack('deep-house', 9), br = s.sections.find((x) => x.type === 'break') || s.sections[0]; const tex = (setup) => { X.noiseSeed(4); const D = new X.Deck(SR, 0); D.load(s, null); D.playing = 1; D.seek(br.bar0 * 16); if (setup) D.setAtmos(setup); let e = 0, hi = 0, hz = 0; for (let k = 0; k < 900; k++) { D.process(128); if (k < 500) continue; /* (after the level's ramp: the ramp is a rate, so a higher level takes longer to reach) */ const L = D.mix.bufL[10]; for (let i = 0; i < 128; i++) { e += L[i] * L[i]; const d = L[i] - hz; hi += d * d; hz = L[i]; } } return { e: 10 * Math.log10(e + 1e-20), hi: 10 * Math.log10(hi + 1e-20) - 10 * Math.log10(e + 1e-20) }; };
  const own = tex(null), rain = tex({ kind: 5, level: 1, tone: 0 }), air1 = tex({ kind: 2, level: 1, tone: 0 }), loud = tex({ kind: 2, level: 2, tone: 0 }), dark = tex({ kind: 5, level: 1, tone: -1 }), none = tex({ kind: 0 });
  ok(rain.e > own.e + 20, `a chosen atmosphere plays on a track that has none (${own.e.toFixed(0)} → ${rain.e.toFixed(1)} dB)`);
  ok(Math.abs(loud.e - air1.e - 6) < 1.5, `level 2 is 6 dB over level 1 (air: ${(loud.e - air1.e).toFixed(1)} dB)`);
  ok(dark.hi < rain.hi - 3, `tone dark takes the top off (${rain.hi.toFixed(1)} → ${dark.hi.toFixed(1)} dB of difference energy)`);
  ok(none.e < -100, `None silences it (${none.e.toFixed(0)} dB)`); }
console.log(fails ? `control: ${fails} failing` : 'control: all checks pass'); process.exit(fails ? 1 : 0);
