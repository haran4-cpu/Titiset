// the sound of each style, measured (v9): the fixes that made the genres sound like themselves must stay fixed.
//  1. a sub oscillator REINFORCES its voice's fundamental (v8 added it out of phase on saw voices: −26 dB at sub 0.6)
//  2. a narrow pulse has no DC (v8: a thump at the note rate under every narrow-pulse note)
//  3. every club kick has its body at its fundamental (v8: 6–28 % of the energy below 70 Hz, a tom-like knock)
//  4. psytrance: the kick is 25 dB down before the first bass sixteenth; the bass rolls K-B-B-B with its fundamental on top;
//     percussion on the top; ear candy flies over the drop; the breakdown pad never plays in the drop
//  5. techno: the rumble fills the beat between the kicks
//  6. tonal balance of every genre's drop as the app plays it (palette sounds) within ±7 dB of the modern-master curve per octave
// Usage: node tools/signature_test.cjs [--balance=all|genres|off]
const { X, renderTrack, appScore } = require('./render.cjs'); const sr = 44100;
let fails = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fails++; };
const args = process.argv.slice(2), balArg = (args.find((a) => a.startsWith('--balance=')) || '--balance=all').slice(10);
function goertzel(x, f, from) { const w = 2 * Math.PI * f / sr; let s1 = 0, s2 = 0; for (let i = from; i < x.length; i++) { const s0 = x[i] + 2 * Math.cos(w) * s1 - s2; s2 = s1; s1 = s0; } return 10 * Math.log10(s1 * s1 + s2 * s2 - 2 * Math.cos(w) * s1 * s2 + 1e-12); }
function note(kit, n, secs) { const syn = new X.Synth(sr, 2, true); syn.bpm = 124; syn.setKit(kit); syn.trigger(0, n, 1, Math.round(sr * secs), {}); const N = Math.round(sr * secs), x = new Float32Array(N), L = new Float32Array(128), R = new Float32Array(128);
  for (let i = 0; i < N; i += 128) { L.fill(0); R.fill(0); syn.render(L, R, 128); x.set(L.subarray(0, Math.min(128, N - i)), i); } return x; }
// 1 · sub phase
{ const base = { cut: 400, res: 0.1, aSus: 1, aDec: 0.3, envAmt: 0, drive: 1 }; const bad = [];
  for (const m of ['acid', 'pluck', 'saw', 'lead', 'square', 'reese', 'wobble']) for (const extra of [{}, { voices: 2 }, { wave: 1 }]) { if (m === 'square' && extra.wave) continue;
    const k0 = Object.assign({ model: m }, base, extra, { sub: 0 }), a = goertzel(note(k0, 33, 0.4), 55, 4096), b = goertzel(note(Object.assign({}, k0, { sub: 0.6 }), 33, 0.4), 55, 4096); if (b < a + 1) bad.push(`${m}${JSON.stringify(extra)} ${(b - a).toFixed(1)} dB`); }
  for (const n of ['fm-growl', 'fm-bass']) { const k = X.SOUND_BANK.bass[n].k, a = goertzel(note(Object.assign({}, k, { sub: 0 }), 33, 1), 55, 4096), b = goertzel(note(k, 33, 1), 55, 4096); if (b < a) bad.push(`${n} ${(b - a).toFixed(1)} dB`); }
  ok(!bad.length, `the sub reinforces the fundamental on every model and FM bass${bad.length ? ': ' + bad.join(', ') : ''}`); }
// 1b · (v9.4) every bass preset carries its fundamental (the plucked, phase-distortion, hyper-saw and FM-4 basses had it 14–42 dB
//      under the note's total — a club drop without low end, measured on afro house, reggaeton, moombahton, UK drill)
{ const share = (x, f) => { let re = 0, im = 0, e = 0; for (let i = 0; i < x.length; i++) { const w = 2 * Math.PI * f * i / sr; re += x[i] * Math.cos(w); im += x[i] * Math.sin(w); e += x[i] * x[i]; } return 10 * Math.log10((2 * (re * re + im * im) / x.length) / (e + 1e-20) + 1e-12); };
  const weak = []; let worst = [0, '']; for (const [n, p] of Object.entries(X.SOUND_BANK.bass)) { const d = (share(note(p.k, 33, 0.4), 55) + share(note(p.k, 40, 0.4), 82.41)) / 2; if (d < worst[0]) worst = [d, n]; if (d < -12) weak.push(`${n} ${d.toFixed(1)} dB`); }
  ok(!weak.length, `every bass preset (${Object.keys(X.SOUND_BANK.bass).length}) carries its fundamental: at least −12 dB of the note's power at A1 and E2 (weakest ${worst[1]} ${worst[0].toFixed(1)} dB)${weak.length ? ' — not: ' + weak.join(', ') : ''}`); }
// 2 · pulse DC
{ const x = note({ model: 'square', pw: 0.28, cut: 8000, aSus: 1, envAmt: 0 }, 60, 0.5); let m = 0; for (let i = 4096; i < x.length; i++) m += x[i]; m /= x.length - 4096; let r = 0; for (let i = 4096; i < x.length; i++) r += x[i] * x[i]; r = Math.sqrt(r / (x.length - 4096));
  ok(Math.abs(m) < 0.02 * r, `a 28 % pulse has no DC (mean ${(m / r * 100).toFixed(2)} % of its RMS)`); }
// 3 · kick bodies
function kickBands(kit, bpm) { const k = new X.Kick(sr); k.setTempo(bpm); k.setKit(kit); const n = Math.round(sr * 60 / bpm), L = new Float32Array(n), R = new Float32Array(n); k.trigger(0, 1);
  const bl = new Float32Array(128), br = new Float32Array(128); for (let i = 0; i < n; i += 128) { bl.fill(0); br.fill(0); k.render(bl, br, 128); for (let j = 0; j < 128 && i + j < n; j++) L[i + j] = bl[j]; }
  const N = 8192, be = [0, 0, 0]; for (let b = 1; b < 1200; b++) { const f = b * sr / N; let cr = 0, ci = 0; const w = 2 * Math.PI * b / N; for (let i = 0; i < Math.min(n, N); i++) { cr += L[i] * Math.cos(w * i); ci -= L[i] * Math.sin(w * i); } const p = cr * cr + ci * ci; if (f < 70) be[0] += p; else if (f < 120) be[1] += p; else if (f < 250) be[2] += p; }
  const tot = be[0] + be[1] + be[2]; return { body: be[0] / tot, knock: be[2] / tot, L }; }
{ const KNOCK = new Set(['hardstyle', 'electro']), BROKEN = new Set(['dnb', 'jungle', 'breakbeat', 'jersey-club', 'uk-drill', 'trap', 'dubstep', 'future-bass']); const low = [];
  for (const g of X.GENRES) { if (KNOCK.has(g.id)) continue; const r = kickBands(g.kit.kick, (g.bpm[0] + g.bpm[1]) / 2), need = BROKEN.has(g.id) ? 0.3 : 0.35; if (r.body < need) low.push(`${g.id} ${(100 * r.body).toFixed(0)} %`); }
  ok(!low.length, `every club kick has its body at the fundamental (≥ 35 % below 70 Hz, broken-beat ≥ 30 %)${low.length ? ': ' + low.join(', ') : ''}`); }
// 4 · psytrance
{ const G = X.GENRE_BY_ID.psytrance, bpm = 144, r = kickBands(G.kit.kick, bpm), s16 = Math.round(sr * 60 / bpm / 4); let pk = 0, e16 = 0; for (let i = 0; i < r.L.length; i++) pk = Math.max(pk, Math.abs(r.L[i])); for (let i = s16; i < s16 + 200; i++) e16 = Math.max(e16, Math.abs(r.L[i]));
  ok(20 * Math.log10(e16 / pk) < -25, `psy kick: ${(20 * Math.log10(e16 / pk)).toFixed(1)} dB at the first bass sixteenth (≤ −25), body ${(100 * r.body).toFixed(0)} %`);
  let fxBars = 0, dropBars = 0, perc = 0, padInDrop = 0, kbbb = 0, kbbbBars = 0;
  for (const seed of [1, 2, 3, 4]) { const s = appScore('psytrance', seed), ev = s.ev;
    for (const sec of s.sections.filter((x) => x.type === 'drop')) { dropBars += sec.bars; const a = sec.bar0 * 16, b = a + sec.bars * 16;
      for (let i = 0; i < ev.n; i++) { if (ev.t[i] < a || ev.t[i] >= b) continue; const c = ev.ch[i]; if (c === 9 && ev.a[i] >= 7) fxBars++; if (c === 3) perc++; if (c === 6) padInDrop++; }
      for (let bar = sec.bar0; bar < sec.bar0 + sec.bars; bar++) { const steps = new Set(); for (let i = 0; i < ev.n; i++) if (ev.ch[i] === 4 && ev.t[i] >= bar * 16 && ev.t[i] < bar * 16 + 16) steps.add(Math.round(ev.t[i] - bar * 16) % 4); kbbbBars++; if (steps.has(1) && steps.has(2) && steps.has(3) && !steps.has(0)) kbbb++; } } }
  ok(kbbb / kbbbBars > 0.8, `psy bass rolls K-B-B-B in ${(100 * kbbb / kbbbBars).toFixed(0)} % of drop bars`);
  ok(fxBars / dropBars >= 0.3, `psy ear candy over the drops: ${(fxBars / dropBars).toFixed(2)} per bar (≥ 0.3)`);
  ok(perc / dropBars >= 2, `psy percussion on the top: ${(perc / dropBars).toFixed(1)} hits per drop bar`);
  ok(padInDrop === 0, `the psy breakdown pad stays out of the drops (${padInDrop} pad notes there)`);
  const kit = X.SOUND_BANK.bass['psy-roll'].k, x = note(kit, 33, 0.09); const f0 = goertzel(x, 55, 0), h5 = goertzel(x, 275, 0);
  ok(f0 > h5 + 6, `psy-roll: the fundamental leads its 5th harmonic by ${(f0 - h5).toFixed(1)} dB (v8 was honky: 250–500 Hz carried 75 %)`); }
// 5 · techno rumble
{ const k = X.GENRE_BY_ID.techno.kit.kick, bpm = 130, beat = Math.round(sr * 60 / bpm), run = (kit) => { const K = new X.Kick(sr); K.setTempo(bpm); K.setKit(kit); const n = beat * 8, L = new Float32Array(n), R = new Float32Array(n), bl = new Float32Array(128), br = new Float32Array(128);
    for (let i = 0; i < n; i += 128) { for (let b = 0; b < 8; b++) { const t = b * beat; if (t >= i && t < i + 128) K.trigger(t - i, 1); } bl.fill(0); br.fill(0); K.render(bl, br, 128); for (let j = 0; j < 128 && i + j < n; j++) L[i + j] = bl[j]; }
    let tail = 0; for (let b = 4; b < 8; b++) for (let i = b * beat + beat / 2; i < (b + 1) * beat; i++) tail += L[i] * L[i]; return tail; };
  const d = 10 * Math.log10(run(k) / run(Object.assign({}, k, { rumble: 0 })));
  ok(d > 6, `techno rumble: the second half of each beat is ${d.toFixed(1)} dB fuller than a dry kick`); }
// 6 · tonal balance as the app plays it
if (balArg !== 'off') { const EDGES = [31.25, 62.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000], TGT = [0, 0, -3, -5.5, -7, -8.5, -10.6, -13, -16.8], TOL = 7;
  const KEEP = { 'dub-techno': [7, 8], lofi: [6, 7, 8], ambient: [0, 1, 7, 8], downtempo: [8] }; // character, not faults (dark or soft by design)
  function fftPow(x) { const n = x.length, re = new Float64Array(n), im = new Float64Array(n); for (let i = 0; i < n; i++) re[i] = x[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)));
    for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; } }
    for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr; re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
    const m = new Float64Array(n / 2); for (let i = 0; i < n / 2; i++) m[i] = re[i] * re[i] + im[i] * im[i]; return m; }
  const gids = balArg === 'all' ? X.GENRES.map((g) => g.id) : balArg.split(','), out = [];
  for (const gid of gids) { const acc = new Array(9).fill(0); for (const seed of [1, 2]) { const score = appScore(gid, seed), sec = X.peakSectionOf(score), r = renderTrack(gid, seed, { score, fromBar: sec.bar0, toBar: sec.bar0 + 8 });
      const n = 16384, sp = new Float64Array(n / 2); let cnt = 0; const mono = new Float32Array(r.L.length); for (let i = 0; i < mono.length; i++) mono[i] = (r.L[i] + r.R[i]) / 2;
      for (let st = 0; st + n <= mono.length; st += n / 2) { const p = fftPow(mono.subarray(st, st + n)); for (let i = 0; i < n / 2; i++) sp[i] += p[i]; cnt++; }
      const df = sr / n, ob = EDGES.slice(0, -1).map((a, k) => { let e = 0; for (let i = Math.ceil(a / df); i < Math.floor(EDGES[k + 1] / df); i++) e += sp[i]; return 10 * Math.log10(e / cnt + 1e-20); });
      const mid = (ob[4] + ob[5]) / 2 - (TGT[4] + TGT[5]) / 2; ob.forEach((d, i) => { acc[i] += (d - mid - TGT[i]) / 2; }); }
    const keep = KEEP[gid] || [], worst = acc.reduce((w, d, i) => (keep.includes(i) ? w : Math.abs(d) > Math.abs(w[1]) ? [i, d] : w), [0, 0]); out.push([gid, worst]);
    if (Math.abs(worst[1]) > TOL) console.log(`  ${gid}: ${Math.round(EDGES[worst[0]])} Hz octave ${worst[1] > 0 ? '+' : ''}${worst[1].toFixed(1)} dB · ` + acc.map((d) => d.toFixed(1)).join(' ')); }
  const bad = out.filter(([, w]) => Math.abs(w[1]) > TOL); ok(!bad.length, `tonal balance (app sounds, 2 seeds): every octave of every drop within ±${TOL} dB of the modern-master curve — ${out.length - bad.length}/${out.length} genres${bad.length ? ' · off: ' + bad.map(([g, w]) => `${g} ${Math.round(EDGES[w[0]])} Hz ${w[1].toFixed(1)}`).join(', ') : ''}`); }
console.log(fails ? `${fails} failure(s)` : 'signature: all checks pass'); process.exit(fails ? 1 : 0);
