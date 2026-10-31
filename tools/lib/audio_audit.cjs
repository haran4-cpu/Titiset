// what the written notes should sound like: 12 pitch-class energies of the pitched parts (bass, chords, pad, lead, arp) between two steps, each note with its first six overtones
// (a note at G also puts D, G, B and D into the spectrum; the audio's chroma has them, so the expectation must too)
function expectedChroma(score, fromStep, toStep) { const ev = score.ev, c = new Array(12).fill(0), off = [0, 0, 7, 0, 4, 7];
  for (let i = 0; i < ev.n; i++) { const ch = ev.ch[i]; if (ch < 4 || ch > 8) continue; const t0 = ev.t[i], t1 = t0 + Math.max(0.5, ev.d[i]); const a = Math.max(t0, fromStep), b = Math.min(t1, toStep); if (b <= a) continue;
    const w = ev.v[i] * ev.v[i] * Math.min(b - a, 4), pc = ((Math.round(ev.a[i]) % 12) + 12) % 12, f0 = 440 * Math.pow(2, (ev.a[i] - 69) / 12);
    // only the partials the analysis can place: from 55 Hz up (a semitone is 2-3 Hz wide below that, finer than the FFT's bins), up to 2.5 kHz
    for (let k = 0; k < 6; k++) { const f = f0 * (k + 1); if (f >= 55 && f <= 2500) c[(pc + off[k]) % 12] += w / ((k + 1) * (k + 1)); } }
  return c; }
// helpers for the independent audio checks: a float32 WAV writer / reader, ffmpeg's EBU R128 meter (an implementation that shares no code with the engine) and the numpy
// analyser in tools/audio_analyze.py. Both tools are optional: a missing one is reported as "unavailable", never as a pass.
const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const PY = path.join(__dirname, '..', 'audio_analyze.py'), CMP = path.join(__dirname, '..', 'audio_compare.py');

function writeWavF32(file, L, R, sr) { // IEEE float, 2 channels: no 16-bit rounding between the engine and the meters
  const n = L.length, b = Buffer.alloc(44 + n * 8); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(3, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 8, 28); b.writeUInt16LE(8, 32); b.writeUInt16LE(32, 34); b.write('data', 36); b.writeUInt32LE(n * 8, 40);
  for (let i = 0; i < n; i++) { b.writeFloatLE(L[i], 44 + i * 8); b.writeFloatLE(R[i], 48 + i * 8); } fs.writeFileSync(file, b); }

function readWav(file) { // float32 or 16-bit PCM, stereo or mono
  const b = fs.readFileSync(file); let p = 12, fmt = null, data = null;
  while (p + 8 <= b.length) { const id = b.toString('ascii', p, p + 4), sz = b.readUInt32LE(p + 4); if (id === 'fmt ') fmt = { tag: b.readUInt16LE(p + 8), ch: b.readUInt16LE(p + 10), sr: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) }; else if (id === 'data') { data = b.subarray(p + 8, Math.min(b.length, p + 8 + sz)); break; } p += 8 + sz + (sz & 1); }
  if (!fmt || !data) throw new Error('not a WAV file: ' + file);
  const bytes = fmt.bits / 8, n = Math.floor(data.length / (bytes * fmt.ch)), L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { const o = i * bytes * fmt.ch; const rd = (q) => (fmt.tag === 3 ? data.readFloatLE(q) : fmt.bits === 16 ? data.readInt16LE(q) / 32768 : data.readInt32LE(q) / 2147483648); L[i] = rd(o); R[i] = fmt.ch > 1 ? rd(o + bytes) : L[i]; }
  return { L, R, sr: fmt.sr }; }

let _ff = null;
function haveFfmpeg() { if (_ff == null) { const r = spawnSync('ffmpeg', ['-hide_banner', '-filters'], { encoding: 'utf8' }); _ff = !r.error && /ebur128/.test(r.stdout || ''); } return _ff; }
// EBU R128 summary from ffmpeg: integrated LUFS, loudness range, true peak (dBTP, 4x oversampled)
function ffmpegLoudness(file) {
  if (!haveFfmpeg()) return null; const r = spawnSync('ffmpeg', ['-nostats', '-hide_banner', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 64 << 20 }), t = (r.stderr || '');
  const sum = t.slice(t.lastIndexOf('Summary:')); const num = (re) => { const m = sum.match(re); return m ? +m[1] : null; };
  const tp = sum.match(/True peak:\s*\n\s*Peak:\s+(-?inf|-?[\d.]+)\s+dBFS/);
  return { lufs: num(/I:\s+(-?[\d.]+|-?inf)\s+LUFS/), lra: num(/LRA:\s+([\d.]+)\s+LU/), truePeak: tp ? (/inf/.test(tp[1]) ? -Infinity : +tp[1]) : null }; }

let _py = null;
function havePython() { if (_py == null) { const r = spawnSync('python3', ['-I', '-c', 'import numpy, scipy.signal, scipy.io.wavfile'], { encoding: 'utf8' }); _py = !r.error && r.status === 0; } return _py; }
function analyze(file, o) { // o: { bpm, scale: [pcs], key, png, skip, seconds }
  if (!havePython()) return null; o = o || {}; const a = ['-I', PY, file]; if (o.bpm) a.push('--bpm', String(o.bpm)); if (o.scale) a.push('--scale', o.scale.join(','), '--key', String(o.key || 0)); if (o.expected) a.push('--expected', o.expected.join(',')); if (o.png) a.push('--png', o.png); if (o.skip) a.push('--skip', String(o.skip)); if (o.seconds) a.push('--seconds', String(o.seconds));
  const r = spawnSync('python3', a, { encoding: 'utf8', maxBuffer: 64 << 20 }); if (r.status !== 0) throw new Error('audio_analyze.py failed: ' + (r.stderr || '').split('\n').filter(Boolean).pop()); return JSON.parse(r.stdout); }

// two aligned renderings of the same music, compared band by band (tools/audio_compare.py)
function compare(a, b) { if (!havePython()) return null; const r = spawnSync('python3', ['-I', CMP, a, b], { encoding: 'utf8', maxBuffer: 64 << 20 }); if (r.status !== 0) throw new Error('audio_compare.py failed: ' + (r.stderr || '').split('\n').filter(Boolean).pop()); return JSON.parse(r.stdout); }

// the scale intervals, read from the engine source so that this tool follows the engine's own mode table
function modeTable() { const src = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'engine', '04_music.js'), 'utf8'), m = src.match(/const MODES = (\{[^}]*\});/); if (!m) throw new Error('MODES not found in 04_music.js'); return new Function('return ' + m[1])(); }

module.exports = { expectedChroma, writeWavF32, readWav, ffmpegLoudness, analyze, compare, haveFfmpeg, havePython, modeTable };
