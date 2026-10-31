'use strict';
// Minimal analysis DSP for the critic: FFT, biquads, K-weighting, band envelopes, onsets, chroma.
function fft(re, im) { // in-place radix-2
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) { const a = i + k, b = a + len / 2, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
}
// RBJ biquad
function biquad(type, f0, q, sr, gainDb) {
  const w = 2 * Math.PI * f0 / sr, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * q), A = Math.pow(10, (gainDb || 0) / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
  else if (type === 'hs') { const sq = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) + (A - 1) * cs + sq); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - sq); a0 = (A + 1) - (A - 1) * cs + sq; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - sq; }
  const B0 = b0 / a0, B1 = b1 / a0, B2 = b2 / a0, A1 = a1 / a0, A2 = a2 / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x) => { const y = B0 * x + B1 * x1 + B2 * x2 - A1 * y1 - A2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
}
function filt(sig, ...fs) { const o = new Float32Array(sig.length); for (let i = 0; i < sig.length; i++) { let x = sig[i]; for (const f of fs) x = f(x); o[i] = x; } return o; }
// envelope (RMS) at hop
function env(sig, sr, hopSec) { const hop = Math.max(1, Math.round(sr * hopSec)), n = Math.floor(sig.length / hop), e = new Float32Array(n); for (let k = 0; k < n; k++) { let s = 0; for (let i = k * hop; i < (k + 1) * hop; i++) s += sig[i] * sig[i]; e[k] = Math.sqrt(s / hop); } return e; }
const db = (x) => 20 * Math.log10(Math.max(1e-12, x));
const pdb = (x) => 10 * Math.log10(Math.max(1e-24, x));
// integrated loudness (BS.1770, gated) of stereo
function lufs(L, R, sr) {
  const kw = () => { const a = biquad('hs', 1681.97, 0.7072, sr, 4.0), b = biquad('hp', 38.13, 0.5003, sr); return (x) => b(a(x)); };
  const fl = kw(), fr = kw(), blk = Math.round(0.4 * sr), hop = Math.round(0.1 * sr);
  const ml = new Float64Array(L.length);
  for (let i = 0; i < L.length; i++) { const a = fl(L[i]), b = fr(R[i]); ml[i] = a * a + b * b; }
  const cs = new Float64Array(L.length + 1); for (let i = 0; i < L.length; i++) cs[i + 1] = cs[i] + ml[i];
  const bl = []; for (let s = 0; s + blk <= L.length; s += hop) bl.push((cs[s + blk] - cs[s]) / blk);
  const ld = (z) => -0.691 + 10 * Math.log10(Math.max(1e-20, z));
  let g = bl.filter((z) => ld(z) > -70); if (!g.length) return { I: -99, ST: [] };
  const rel = ld(g.reduce((a, b) => a + b, 0) / g.length) - 10; g = g.filter((z) => ld(z) > rel);
  const I = ld(g.reduce((a, b) => a + b, 0) / g.length);
  // short-term 3 s
  const st = [], b3 = Math.round(3 * sr); for (let s = 0; s + b3 <= L.length; s += Math.round(sr)) st.push(ld((cs[s + b3] - cs[s]) / b3));
  return { I, ST: st };
}
// long-term average spectrum in 1/3 octave bands (dB, mid channel)
function thirdOct(M, sr) {
  const N = 8192, win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  const acc = new Float64Array(N / 2); let frames = 0;
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let s = 0; s + N <= M.length; s += N / 2) { for (let i = 0; i < N; i++) { re[i] = M[s + i] * win[i]; im[i] = 0; } fft(re, im); for (let k = 0; k < N / 2; k++) acc[k] += re[k] * re[k] + im[k] * im[k]; frames++; }
  const centers = []; for (let f = 25; f <= 16000; f *= Math.pow(2, 1 / 3)) centers.push(f);
  const bands = centers.map((fc) => { const lo = fc / Math.pow(2, 1 / 6), hi = fc * Math.pow(2, 1 / 6); let e = 0; for (let k = Math.ceil(lo * N / sr); k <= Math.floor(hi * N / sr) && k < N / 2; k++) e += acc[k]; return pdb(e / Math.max(1, frames)); });
  return { centers, bands };
}
module.exports = { fft, biquad, filt, env, db, pdb, lufs, thirdOct };
// true peak per ITU-R BS.1770-4 (Annex 2): 4× oversampling with a windowed-sinc polyphase interpolator (48 taps per phase,
// Kaiser β = 8), the largest absolute value over all phases and both channels, in dBTP
function truePeak(L, R) { const P = 4, T = 48, h = []; const I0 = (x) => { let s = 1, t = 1; for (let k = 1; k < 30; k++) { t *= (x / 2 / k) ** 2; s += t; } return s; }, B = 8;
  for (let p = 0; p < P; p++) { const row = new Float64Array(T); for (let k = 0; k < T; k++) { const n = (k - T / 2) + p / P, w = I0(B * Math.sqrt(Math.max(0, 1 - ((k + p / P - T / 2) / (T / 2)) ** 2))) / I0(B); row[k] = (n === 0 ? 1 : Math.sin(Math.PI * n) / (Math.PI * n)) * w; } h.push(row); }
  let m = 0; for (const X of [L, R]) { for (let i = T; i < X.length; i++) { for (let p = 0; p < P; p++) { const row = h[p]; let y = 0; for (let k = 0; k < T; k++) y += row[k] * X[i - T + 1 + k]; if (y < 0) y = -y; if (y > m) m = y; } } }
  return 20 * Math.log10(m + 1e-12); }
module.exports.truePeak = truePeak;
