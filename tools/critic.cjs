// FORGE critic — measures the RENDERED AUDIO (not the code's intentions) against each genre's own contract.
// Everything is computed from the master and post-fader stems of an offline render that runs the exact worklet code.
const { fft, biquad, filt, db, lufs, thirdOct, truePeak: truePeakBS } = require('./lib/dsp.cjs');
const stemProfile = require('./lib/stemprof.cjs');
const { X, renderTrack } = require('./render.cjs');
const PCN = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

function mono(st) { const n = st.length / 2, o = new Float32Array(n); for (let i = 0; i < n; i++) o[i] = (st[2 * i] + st[2 * i + 1]) * 0.5; return o; }
function sideOf(st) { const n = st.length / 2, L = new Float32Array(n), R = new Float32Array(n); for (let i = 0; i < n; i++) { L[i] = st[2 * i]; R[i] = st[2 * i + 1]; } return [L, R]; }
function stemLufs(st, sr) { const [L, R] = sideOf(st); return lufs(L, R, sr).I; }
// expected per-step hit rate of a drum lane in a section, straight from the score events (what the composer wrote)
function scoreRates(ev, ch, fromStep, bars, filter) { const r = new Float64Array(16); for (let i = 0; i < ev.n; i++) { if (ev.ch[i] !== ch) continue; const t = ev.t[i] - fromStep; if (t < -0.5 || t >= bars * 16 - 0.5) continue; if (filter && !filter(i)) continue; r[((Math.round(t) % 16) + 16) % 16] += 1; } return Array.from(r, (x) => Math.min(1, x / bars)); }
// expected per-step rate from the GENRE CONTRACT (independent of the composer): union of drop variants' lanes
function contractRates(G, lane, bars, sec) { const r = new Float64Array(16); const nV = G.drums.main.length; let cnt = 0; const lb = (str, b) => (!str || str.length <= 16 ? str : str.slice(((b % (str.length / 16)) | 0) * 16, ((b % (str.length / 16)) | 0) * 16 + 16));
  for (let b = 0; b < bars; b++) { const vi = sec && sec.dv && sec.dv.length ? sec.dv[Math.floor(b / 8) % sec.dv.length] % nV : sec && sec.type !== 'drop' ? (sec.type === 'groove' && sec.layer === 'groove2' ? 1 : Math.floor(b / 16)) % nV : (Math.floor(b / 8) + 1) % nV; const v = G.drums.main[vi]; cnt++; const hit = new Uint8Array(16); for (const ln of lane === 's' ? ['s', 'rim'] : [lane]) { const p = lb(v[ln], b); if (p) for (let s = 0; s < 16; s++) if (p[s] && p[s] !== '.' && p[s] !== '-') hit[s] = 1; }
    if (lane === 's' && v.p) for (const [kind, , p0] of v.p) if (kind === 'rim') { const p = lb(p0, b); for (let s = 0; s < 16; s++) if (p[s] !== '.') hit[s] = 1; } for (let s = 0; s < 16; s++) r[s] += hit[s]; }
  return Array.from(r, (x) => x / cnt); }
function cmpRates(meas, exp) { let d = 0; const bad = []; for (let s = 0; s < 16; s++) { const e = Math.abs(meas[s] - exp[s]); d += e; if (e > 0.3) bad.push(s + ':' + exp[s].toFixed(1) + '→' + meas[s].toFixed(1)); } return { score: +(1 - d / 16).toFixed(3), bad }; }
// chroma per bar (FFT 8192, hann, 60 Hz – 2 kHz, log-magnitude folded to pitch classes)
function chromaBars(sig, sr, sps, bars) { const N = 8192, out = [], win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  for (let b = 0; b < bars; b++) { const c = new Float64Array(12); const s0 = Math.round(b * 16 * sps), s1 = Math.round((b + 1) * 16 * sps); let frames = 0;
    for (let st = s0; st + N <= s1 || (frames === 0 && st + N <= sig.length); st += N / 2) { const re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < N; i++) re[i] = (sig[st + i] || 0) * win[i]; fft(re, im); frames++;
      for (let k = Math.ceil(60 * N / sr); k < 2000 * N / sr; k++) { const f = k * sr / N, m = Math.sqrt(re[k] * re[k] + im[k] * im[k]); const midi = 69 + 12 * Math.log2(f / 440), pc = ((Math.round(midi) % 12) + 12) % 12; if (Math.abs(midi - Math.round(midi)) < 0.35) c[pc] += m; } if (frames > 6) break; }
    const mx = Math.max(...c) || 1; out.push(Array.from(c, (x) => x / mx)); }
  return out; }
function cos(a, b) { let s = 0, x = 0, y = 0; for (let i = 0; i < 12; i++) { s += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return s / Math.sqrt(x * y + 1e-12); }
// f0 estimate (normalised autocorrelation) of a mono signal segment
function f0(sig, s0, len, sr, fmin, fmax) { const n = Math.min(len, sig.length - s0); if (n < 256) return 0; let best = 0, bl = 0; let e0 = 0; for (let i = 0; i < n; i++) e0 += sig[s0 + i] * sig[s0 + i]; if (e0 < 1e-7) return 0;
  const lmin = Math.floor(sr / fmax), lmax = Math.ceil(sr / fmin); const r = new Float64Array(lmax + 2);
  for (let l = lmin; l <= lmax; l++) { let s = 0, a = 0, b = 0; for (let i = 0; i + l < n; i++) { const x = sig[s0 + i], y = sig[s0 + i + l]; s += x * y; a += x * x; b += y * y; } r[l] = s / Math.sqrt(a * b + 1e-12); }
  // first peak above 0.8 of the global max (avoids octave errors)
  let gm = 0; for (let l = lmin; l <= lmax; l++) gm = Math.max(gm, r[l]); for (let l = lmin + 1; l < lmax; l++) if (r[l] >= 0.85 * gm && r[l] >= r[l - 1] && r[l] >= r[l + 1]) { bl = l; best = r[l]; break; }
  if (!bl || best < 0.5) return 0; const a = r[bl - 1], b = r[bl], c = r[bl + 1], d = (a - c) / (2 * (a - 2 * b + c) || 1); return sr / (bl + d); }
function goertzel(x, s0, n, f, sr) { const w = 2 * Math.PI * f / sr, c = 2 * Math.cos(w); let a = 0, b = 0; for (let i = 0; i < n; i++) { const win = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n); const y = (x[s0 + i] || 0) * win + c * a - b; b = a; a = y; } return a * a + b * b - c * a * b; }
function salientPc(x, s0, n, sr) { let e = 0; for (let i = 0; i < n; i++) e += (x[s0 + i] || 0) ** 2; if (e < 1e-6 * n) return -1; const pcs = new Float64Array(12);
  let best = -1, bm = 0; for (let m = 24; m <= 60; m++) { const f = 440 * Math.pow(2, (m - 69) / 12); let sal = 0; for (let h = 1; h <= 5; h++) sal += Math.sqrt(goertzel(x, s0, n, f * h, sr)) / h; if (sal > bm) { bm = sal; best = m; } }
  return best < 0 ? -1 : best % 12; }
function centroid(x, sr) { const N = 4096; let num = 0, den = 0; const re = new Float64Array(N), im = new Float64Array(N);
  for (let st = 0; st + N <= x.length; st += N * 4) { let e = 0; for (let i = 0; i < N; i++) { const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N); re[i] = x[st + i] * w; im[i] = 0; e += x[st + i] * x[st + i]; } if (e < 1e-6) continue; fft(re, im);
    for (let k = 1; k < N / 2; k++) { const m = re[k] * re[k] + im[k] * im[k]; num += m * k * sr / N; den += m; } } return den > 0 ? num / den : 0; }
function clicks(sig, sr, onsets) { // a click = a curvature spike that is novel: > 0.05 and > 3× the largest spike of the previous AND the next 40 ms
  // (periodic waveform edges of low saws repeat every period and are not clicks); spikes within 4 ms of a scheduled onset are attacks
  const n = sig.length, d = new Float32Array(n); for (let i = 2; i < n; i++) d[i] = Math.abs(sig[i] - 2 * sig[i - 1] + sig[i - 2]);
  const B = Math.round(sr * 0.001), nb = Math.ceil(n / B), bm = new Float32Array(nb); for (let i = 0; i < n; i++) { const k = (i / B) | 0; if (d[i] > bm[k]) bm[k] = d[i]; }
  const ok = new Uint8Array(n); if (onsets) for (const o of onsets) { const a = Math.max(0, Math.round(o - sr * 0.001)), b = Math.min(n, Math.round(o + sr * 0.008)); for (let i = a; i < b; i++) ok[i] = 1; }
  let cnt = 0, last = -1e9; for (let i = 0; i < n; i++) { if (d[i] <= 0.05 || ok[i] || i - last < sr * 0.05) continue; const k = (i / B) | 0; let pm = 0, nm = 0; for (let j = Math.max(0, k - 42); j < k - 2; j++) if (bm[j] > pm) pm = bm[j]; for (let j = k + 3; j < Math.min(nb, k + 42); j++) if (bm[j] > nm) nm = bm[j];
    if (k > 42 && d[i] > 3 * pm && d[i] > 3 * nm) { cnt++; last = i; } } return cnt; } // isolated in BOTH directions: periodic edges and decaying attacks are not clicks
// hat onsets: >5 kHz energy, 1 ms hop, rise ≥ 4 dB over 3 ms (overlapping hats: a closed hat on an open-hat tail still shows)
function hatProfile(sig, sr, bpm) { const hp1 = biquad('hp', 5000, 0.707, sr), hp2 = biquad('hp', 5000, 0.707, sr); const x = new Float32Array(sig.length); for (let i = 0; i < sig.length; i++) x[i] = hp2(hp1(sig[i]));
  const hop = Math.round(sr * 0.001), win = Math.round(sr * 0.002), n = Math.floor((x.length - win) / hop); const lv = new Float32Array(n); let mx = -200;
  for (let k = 0; k < n; k++) { let e = 0; for (let i = k * hop; i < k * hop + win; i++) e += x[i] * x[i]; lv[k] = 10 * Math.log10(e / win + 1e-14); if (lv[k] > mx) mx = lv[k]; }
  const sp = 60 / bpm / 4, nb = Math.floor(x.length / sr / (sp * 16)), rate = new Float64Array(16), off = Array.from({ length: 16 }, () => []);
  for (let b = 0; b < nb; b++) for (let s = 0; s < 16; s++) { const tc = (b * 16 + s) * sp, w = sp * 0.45; let best = 0, bt = 0;
    for (let k = Math.max(3, Math.floor((tc - w) / 0.001)); k <= Math.min(n - 1, Math.ceil((tc + w) / 0.001)); k++) { const r = lv[k] > mx - 40 ? lv[k] - lv[k - 3] : 0; if (r > best) { best = r; bt = k * 0.001 - tc; } }
    if (best >= 4) { rate[s]++; off[s].push(bt / sp); } }
  return { rate: Array.from(rate, (v) => v / Math.max(1, nb)), off }; }
function lowMonoCorr(L, R, sr) { const lp1 = biquad('lp', 120, 0.541, sr), lp2 = biquad('lp', 120, 0.541, sr), lp3 = biquad('lp', 120, 1.307, sr), lp4 = biquad('lp', 120, 1.307, sr); let s = 0, a = 0, b = 0; for (let i = 0; i < L.length; i++) { const x = lp3(lp1(L[i])), y = lp4(lp2(R[i])); /* 4th-order: actually below 120 Hz */ s += x * y; a += x * x; b += y * y; } return s / Math.sqrt(a * b + 1e-12); }
function slope(L, R, sr) { const M = new Float32Array(L.length); for (let i = 0; i < L.length; i++) M[i] = (L[i] + R[i]) * 0.5; const T = thirdOct(M, sr); const t = T.centers.map((f, i) => ({ f, db: T.bands[i] })); const pts = t.filter((b) => b.f >= 60 && b.f <= 12000); const xs = pts.map((b) => Math.log2(b.f)), ys = pts.map((b) => b.db);
  const mx = xs.reduce((a, b) => a + b) / xs.length, my = ys.reduce((a, b) => a + b) / ys.length; let num = 0, den = 0; for (let i = 0; i < xs.length; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; } return { slope: +(num / den).toFixed(2), bands: t }; }

function analyzeGenre(gid, seed, o) {
  o = o || {}; const sc0 = o.score || X.composeTrack(gid, seed); const sec = X.peakSectionOf(sc0);
  const bars = Math.min(16, sec.bars); const r = renderTrack(gid, seed, { fromBar: sec.bar0, toBar: sec.bar0 + bars, stems: true, cal: o.cal, masterDb: o.masterDb, score: sc0 });
  const { sr, stems, score, L, R, sps } = r, G = score.contract || X.GENRE_BY_ID[gid], bpm = score.meta.bpm, ev = score.ev, from = sec.bar0 * 16;
  const res = { gid, seed, bpm, key: PCN[score.meta.key] + ' ' + score.meta.mode, prog: score.meta.prog.join('-'), section: sec.type + '@' + sec.bar0 };
  // --- rhythm: audio onsets of each drum stem vs (a) what the score says, (b) what the genre contract says
  const rh = {}; const lanes = { kick: [0, 'k'], snare: [1, 's'], hats: [2, null] };
  for (const [name, [ch, lane]] of Object.entries(lanes)) { const sig = mono(stems[ch]); const p = ch === 2 ? hatProfile(sig, sr, bpm) : stemProfile(sig, sr, bpm, 0); const exS = scoreRates(ev, ch, from, bars, ch === 2 ? (i) => ev.a[i] !== 4 : ch === 1 ? (i) => ev.a[i] !== 2 : null);
    const vsScore = cmpRates(p.rate, exS); const out = { meas: p.rate.map((x) => +x.toFixed(2)), vsScore: vsScore.score, badScore: vsScore.bad };
    if (lane) { const exC = contractRates(G, lane, bars, sec); const c = cmpRates(p.rate, exC); out.vsContract = c.score; out.badContract = c.bad; }
    if (ch === 2) { const odd = []; for (let s = 1; s < 16; s += 2) odd.push(...p.off[s]); const ev2 = []; for (let s = 0; s < 16; s += 2) ev2.push(...p.off[s]); const med = (a) => a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1] : 0;
      out.swingSteps = +(med(odd) - med(ev2)).toFixed(3); out.swingTarget = +((G.swing - 50) / 50).toFixed(3); }
    rh[name] = out; }
  res.rhythm = rh;
  // --- harmony: does the audio carry the chords the score claims, and how often do they change?
  const mus = new Float32Array(L.length); for (const c of [4, 5, 6, 7, 8]) { const m = mono(stems[c]); for (let i = 0; i < m.length; i++) mus[i] += m[i]; }
  const chroma = chromaBars(mus, sr, sps, bars); let hit = 0, changes = 0, expChanges = 0, margin = 0; const lab = [];
  for (let b = 0; b < bars; b++) { const c = score.chords[sec.bar0 + b]; const tones = X.planTrack ? null : null; const tpl = new Array(12).fill(0); const pcs = chordPcs(c, score); for (const pc of pcs) tpl[pc] = 1; tpl[pcs[0]] = 1.5; // the root (bass) carries the harmony
    // compare with the other chords of the progression: the bar's chroma must match its own chord best
    let own = cos(chroma[b], tpl), bestOther = -1; for (const oc of uniqChords(score, sec)) { if (oc.label === c.label) continue; const t2 = new Array(12).fill(0); const p2 = chordPcs(oc, score); for (const pc of p2) t2[pc] = 1; t2[p2[0]] = 1.5; bestOther = Math.max(bestOther, cos(chroma[b], t2)); }
    if (own >= bestOther) hit++; margin += own - Math.max(0, bestOther); lab.push(c.label);
    if (b > 0) { if (cos(chroma[b], chroma[b - 1]) < 0.9) changes++; if (score.chords[sec.bar0 + b].label !== score.chords[sec.bar0 + b - 1].label) expChanges++; } }
  res.harmony = { margin: +(margin / bars).toFixed(3), chordMatch: +(hit / bars).toFixed(2), changesPerBar: +(changes / (bars - 1)).toFixed(2), expectedChangesPerBar: +(expChanges / (bars - 1)).toFixed(2), labels: [...new Set(lab)].join(' ') };
  // --- bass: per BAR, the pitch class that sounds longest in the score (≥ 4 sixteenths, so plucky rolling basses are
  // excluded — their pitch is not measurable at 40–50 Hz from 60 ms notes) vs the most salient pitch class in the bass
  // stem (harmonic-sum over MIDI 24..60 across the bar: ≤ 0.6 Hz resolution, a semitone at 41 Hz is 2.4 Hz)
  const bassSig = mono(stems[4]); let bOk = 0, bN = 0; const bErr = [];
  for (let bar = 0; bar < bars; bar++) { const dur = new Float64Array(12); let longest = 0, slid = false; for (let i = 0; i < ev.n; i++) { if (ev.ch[i] !== 4) continue; const t = ev.t[i] - from, e = t + ev.d[i]; const a0 = Math.max(t, bar * 16), a1 = Math.min(e, bar * 16 + 16); if (a1 > a0) { dur[((ev.a[i] % 12) + 12) % 12] += a1 - a0; longest = Math.max(longest, ev.d[i]); if (ev.f[i] & 1) slid = true; } }
    if (longest < 3.5 || slid) continue; // only bars with a sustained, unslid note: short retriggered notes and glides are not pitch-measurable
    let want = -1, wd = 4; for (let k = 0; k < 12; k++) if (dur[k] >= wd) { wd = dur[k]; want = k; } if (want < 0) continue;
    const pc = salientPc(bassSig, Math.round(bar * 16 * sps), Math.round(16 * sps), sr); if (pc < 0) continue; bN++; if (pc === want) bOk++; else if (bErr.length < 6) bErr.push('bar' + bar + ':' + PCN[want] + '→' + PCN[pc]); }
  res.bass = { beats: bN, pitchClassOk: bN ? +(bOk / bN).toFixed(2) : null, errors: bErr };
  // --- low end: kick tail level at bass onsets (collision), mono correlation below 120 Hz
  const kick = mono(stems[0]); const kEnv = (i) => { let s = 0; const w = Math.round(sr * 0.005); for (let k = i; k < i + w && k < kick.length; k++) s += kick[k] * kick[k]; return Math.sqrt(s / w); };
  let kpk = 0; for (let i = 0; i < kick.length; i += 64) kpk = Math.max(kpk, kEnv(i)); const coll = [];
  for (let i = 0; i < ev.n; i++) if (ev.ch[i] === 4) { const t = ev.t[i] - from; if (t < 0 || t >= bars * 16) continue; coll.push(db(kEnv(Math.round(t * sps)) / (kpk || 1))); }
  coll.sort((a, b) => b - a);
  // low-band overlap: Σ min(kick, bass) / Σ max(kick, bass) of 30–150 Hz power in 5 ms frames (0 = interleaved, 1 = fully stacked)
  const lowBand = (sig) => { const f1 = biquad('lp', 150, 0.707, sr), f2 = biquad('hp', 30, 0.707, sr), w = Math.round(sr * 0.005), o = new Float64Array(Math.floor(sig.length / w)); for (let k = 0; k < o.length; k++) { let e = 0; for (let i = k * w; i < (k + 1) * w; i++) { const y = f2(f1(sig[i])); e += y * y; } o[k] = e; } return o; };
  const kb = lowBand(kick), bb = lowBand(bassSig); let mn = 0, mxx = 0; for (let k = 0; k < kb.length; k++) { mn += Math.min(kb[k], bb[k]); mxx += Math.max(kb[k], bb[k]); }
  res.lowEnd = { kickAtBassOnsetDb_p90: coll.length ? +coll[Math.floor(coll.length * 0.1)].toFixed(1) : null, lowOverlap: +(mn / (mxx || 1)).toFixed(3), monoCorr120: +lowMonoCorr(L, R, sr).toFixed(3) };
  const mixNoTex = new Float32Array(L.length); for (let c = 0; c < 10; c++) { const m = mono(stems[c]); for (let i = 0; i < m.length; i++) mixNoTex[i] += m[i]; }
  res.mixClicks = clicks(mixNoTex, sr, onsetsOf(ev, from, sps, -1, bars));
  // --- loudness / dynamics / spectrum / clicks
  const lu = lufs(L, R, sr).I; const tp = truePeakBS(L, R); let ss = 0; for (let i = 0; i < L.length; i++) ss += (L[i] * L[i] + R[i] * R[i]) / 2; const rms = db(Math.sqrt(ss / L.length));
  const sl = slope(L, R, sr);
  res.master = { lufs: +lu.toFixed(1), target: G.mix.lufs, truePeak: +tp.toFixed(2), plr: +(tp - lu).toFixed(1), crest: +(tp - rms).toFixed(1), slopeDbOct: sl.slope, clicksMaster: clicks(L, sr, onsetsOf(ev, from, sps, -1, bars)) };
  // stem balance (gated BS.1770 loudness relative to the kick) + clicks per stem
  const k0 = stemLufs(stems[0], sr); res.balance = {}; res.stemClicks = {};
  for (let c = 0; c < 11; c++) { const l = stemLufs(stems[c], sr); res.balance[X.CH_NAMES[c]] = l < -69 ? null : +(l - k0).toFixed(1); const ck = c === 10 ? 0 : clicks(mono(stems[c]), sr, onsetsOf(ev, from, sps, c, bars)); if (ck) res.stemClicks[X.CH_NAMES[c]] = ck; }
  // stereo image + timbre sanity: side/mid energy ratio of the master; spectral centroid of every stem
  let sm = 0, mm = 0; for (let i = 0; i < L.length; i++) { const m = (L[i] + R[i]) / 2, sd = (L[i] - R[i]) / 2; sm += sd * sd; mm += m * m; } res.master.sideMidDb = +(10 * Math.log10(sm / (mm || 1) + 1e-12)).toFixed(1);
  res.centroid = {}; for (let c = 0; c < 10; c++) { const cc = centroid(mono(stems[c]), sr); if (cc) res.centroid[X.CH_NAMES[c]] = Math.round(cc); }
  res.renderMs = r.ms; return res;
}
function onsetsOf(ev, from, sps, ch, bars) { const o = []; for (let i = 0; i < ev.n; i++) { if (ch >= 0 && ev.ch[i] !== ch) continue; const t = ev.t[i] - from; if (t >= -1 && t < bars * 16) o.push(t * sps); } return o; }
function chordPcs(c, score) { // chord tones from the label the composer printed: triad + 7th (b7 or maj7) + 9th
  const L = c.label, q = c.q; const base = q === 'min' ? [0, 3, 7] : q === 'dim' ? [0, 3, 6] : q === 'sus2' ? [0, 2, 7] : q === 'sus4' ? [0, 5, 7] : q === 'pow' ? [0, 7] : [0, 4, 7];
  if (/maj(7|9)/.test(L)) base.push(11); else if (/(^|[^d])(7|9)$/.test(L) || /m(7|9)$/.test(L)) base.push(10); if (/9$/.test(L)) base.push(2);
  return base.map((x) => (c.root + x) % 12); }
function uniqChords(score, sec) { const m = new Map(); for (let b = sec.bar0; b < sec.bar0 + sec.bars; b++) { const c = score.chords[b]; m.set(c.label, c); } for (const c of score.chords) m.set(c.label, c); return [...m.values()]; }
function analyzeScore(score, o) { return analyzeGenre(score.meta.gid, score.meta.seed, Object.assign({}, o, { score })); }
module.exports = { analyzeScore, analyzeGenre, mono, stemLufs, clicks, truePeak: truePeakBS };
if (require.main === module) { const ids = process.argv[2] ? process.argv[2].split(',') : X.GENRES.map((g) => g.id); const seed = +(process.argv[3] || 1);
  for (const id of ids) { const r = analyzeGenre(id, seed); console.log(JSON.stringify(r)); } }
