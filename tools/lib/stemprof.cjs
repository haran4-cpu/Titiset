'use strict';
// drum step profile from an isolated stem: onsets = rise of a smoothed log envelope (12 ms RMS window, 2 ms hop,
// 8 ms lag) above 8 dB and within 30 dB of the stem's loudest point; mapped to the 16th grid of each bar.
module.exports = function stemProfile(sig, sr, bpm, t0) {
  const hop = Math.round(sr * 0.002), win = Math.round(sr * 0.012), n = Math.floor((sig.length - win) / hop);
  const cs = new Float64Array(sig.length + 1); for (let i = 0; i < sig.length; i++) cs[i + 1] = cs[i] + sig[i] * sig[i];
  const lv = new Float32Array(n); let mxl = -200; for (let k = 0; k < n; k++) { const s = k * hop; lv[k] = 10 * Math.log10((cs[s + win] - cs[s]) / win + 1e-14); if (lv[k] > mxl) mxl = lv[k]; }
  const f = new Float32Array(n); for (let k = 4; k < n; k++) f[k] = lv[k] > mxl - 30 ? Math.max(0, lv[k] - lv[k - 4]) : 0;
  const ht = 0.002, sp = 60 / bpm / 4, dur = sig.length / sr, nb = Math.floor((dur - t0) / (sp * 16)), prof = new Float64Array(16), hit = new Float64Array(16), off = Array.from({ length: 16 }, () => []);
  for (let b = 0; b < nb; b++) for (let s = 0; s < 16; s++) { const tc = t0 + (b * 16 + s) * sp, w = sp * 0.45; let best = 0, bt = 0;
    for (let k = Math.max(0, Math.floor((tc - w) / ht)); k <= Math.min(n - 1, Math.ceil((tc + w) / ht)); k++) if (f[k] > best) { best = f[k]; bt = k * ht - tc; }
    prof[s] += best; if (best > 8) { hit[s]++; off[s].push(bt / sp); } }
  const mx = Math.max(...prof) || 1;
  return { prof: Array.from(prof, (x) => +(x / mx).toFixed(2)), rate: Array.from(hit, (x) => +(x / Math.max(1, nb)).toFixed(2)), off, bars: nb, energy: cs[sig.length] };
};
