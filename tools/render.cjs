// offline renderer: score → master stereo + optional post-fader stems (exact same code path as the worklet)
const { load } = require('./load.cjs');
const X = load();
function renderTrack(gid, seed, o) {
  o = o || {}; const sr = o.sr || 44100; const score = o.score || X.composeTrack(gid, seed, o.plan);
  const deck = new X.Deck(sr, 0), M = new X.Master(sr); deck.load(score, o.cal || CAL()[gid] || null); deck.playing = 1; M.setTempo(score.meta.bpm);
  const cal = o.cal || CAL()[gid]; if (cal) M.setLoudness(cal.master); if (o.masterDb != null) M.setLoudness(o.masterDb);
  let trim = null; if (cal && o.autoTrim !== false) { trim = X.trackTrim(score, cal, sr); deck.mix.trim = Math.pow(10, trim.trimDb / 20); deck.mix.trimS = deck.mix.trim; } // per-track auto-gain, exactly as the app does
  const sps = sr * 60 / score.meta.bpm / 4; const fromStep = (o.fromBar || 0) * 16, toStep = (o.toBar != null ? o.toBar : score.meta.bars) * 16;
  // pre-roll: start 2 bars early (so tails/reverb are realistic), discard
  const pre = Math.min(fromStep, 32); deck.seek(fromStep - pre);
  const preN = Math.round(pre * sps), N = Math.round((toStep - fromStep) * sps);
  const L = new Float32Array(N), R = new Float32Array(N), bl = new Float32Array(128), br = new Float32Array(128);
  const stems = o.stems ? Array.from({ length: 11 }, () => new Float32Array(N * 2)) : null; const cap = o.stems ? Array.from({ length: 11 }, () => new Float32Array(256)) : null;
  if (o.chanOn) for (let c = 0; c < 11; c++) deck.chanOn[c] = o.chanOn[c];
  let done = -preN; const t0 = Date.now();
  while (done < N) { const n = 128; deck.mix.cap = stems && done >= 0 ? cap : null; deck.process(n); M.run([deck.mix], 1, bl, br, n);
    for (let i = 0; i < n; i++) { const k = done + i; if (k >= 0 && k < N) { L[k] = bl[i]; R[k] = br[i]; if (stems) for (let c = 0; c < 11; c++) { stems[c][2 * k] = cap[c][2 * i]; stems[c][2 * k + 1] = cap[c][2 * i + 1]; } } }
    done += n; }
  return { score, sr, L, R, stems, sps, fromStep, ms: Date.now() - t0, lufsInt: M.meter.integrated(), master: M, trim };
}
// the track exactly as the app plays a new one: the genre's palette of sounds compiled through the spec path, levels refined in context (src/ui/app.js composeAsync + refineNow).
// X.composeTrack(gid, seed) alone gives the same notes with the genre's default kit instead of the palette.
function appScore(gid, seed) { const snd = X.paletteSounds(gid, seed); let s; if (!Object.keys(snd).length) s = X.composeTrack(gid, seed); else { try { s = X.compileSpec({ forge: 1, genre: gid, seed, sound: snd }, { fastLevels: true }); } catch (e) { s = X.composeTrack(gid, seed); } }
  if (s.levelPending) X.refineLevels(s); return s; }
let _cal = null; function CAL() { if (_cal) return _cal; try { _cal = require('../src/engine/calibration.json'); } catch (e) { _cal = {}; } return _cal; }
function wav(path, L, R, sr) { const n = L.length, b = Buffer.alloc(44 + n * 4); b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(L[i] * 32767))), 44 + i * 4); b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(R[i] * 32767))), 46 + i * 4); } require('fs').writeFileSync(path, b); }
module.exports = { X, renderTrack, appScore, wav, CAL };
