// log-frequency spectrogram PNG of a rendered section (visual listening aid): rows 30 Hz–16 kHz, columns 10 ms
const zlib = require('zlib'), fs = require('fs');
const { fft } = require('./lib/dsp.cjs');
const { X, renderTrack } = require('./render.cjs');
function png(w, h, rgb) { const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0); return Buffer.concat([len, td, crc]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2; ih[10] = 0; ih[11] = 0; ih[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); }
let CRC; function crc32(b) { if (!CRC) { CRC = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c; } } let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return c ^ -1; }
function heat(v) { // 0..1 → dark blue → magenta → orange → white
  const s = [[8, 10, 20], [40, 30, 90], [150, 40, 120], [235, 120, 40], [255, 240, 200]]; const x = Math.max(0, Math.min(0.9999, v)) * (s.length - 1), i = Math.floor(x), f = x - i; return s[i].map((a, k) => Math.round(a + (s[i + 1][k] - a) * f)); }
function spectro(L, R, sr, H) { const N = 4096, hop = Math.round(sr * 0.01), W = Math.floor((L.length - N) / hop), img = Buffer.alloc(W * H * 3); const win = new Float64Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  const re = new Float64Array(N), im = new Float64Array(N); const f0 = 30, f1 = 16000;
  for (let x = 0; x < W; x++) { for (let i = 0; i < N; i++) { re[i] = (L[x * hop + i] + R[x * hop + i]) * 0.5 * win[i]; im[i] = 0; } fft(re, im);
    for (let y = 0; y < H; y++) { const fa = f0 * Math.pow(f1 / f0, (H - 1 - y) / H), fb = f0 * Math.pow(f1 / f0, (H - y) / H); let m = 0; for (let k = Math.floor(fa * N / sr); k <= Math.ceil(fb * N / sr); k++) m = Math.max(m, re[k] * re[k] + im[k] * im[k]);
      const db = 10 * Math.log10(m + 1e-12); const v = (db + 10) / 70; const c = heat(v); img[(y * W + x) * 3] = c[0]; img[(y * W + x) * 3 + 1] = c[1]; img[(y * W + x) * 3 + 2] = c[2]; } }
  return { W, H, img }; }
module.exports = { spectro, png };
if (require.main === module) { const [gid, seed, bars, out] = [process.argv[2], +process.argv[3] || 1, +process.argv[4] || 8, process.argv[5]];
  const P = X.planTrack(gid, seed); const sec = require('./calibrate.cjs').peakSection(P); const from = +process.argv[6] >= 0 && process.argv[6] != null ? +process.argv[6] : sec.bar0 - 2;
  const r = renderTrack(gid, seed, { fromBar: Math.max(0, from), toBar: Math.max(0, from) + bars }); const s = spectro(r.L, r.R, r.sr, 220); fs.writeFileSync(out, png(s.W, s.H, s.img)); console.log('wrote', out, s.W + 'x' + s.H, 'from bar', from); }
