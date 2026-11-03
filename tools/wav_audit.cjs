// "Listening" without ears: every genre's peak section is rendered with the real engine code, written as a float WAV and measured by tools that share no code with the engine —
// ffmpeg's EBU R128 meter (loudness, loudness range, true peak) and numpy (clipping, DC, silence, repeated blocks, tempo from the audio, how much of the sound sits on the
// claimed scale, spectrum bands). Optionally one spectrogram per genre to look at (--png).
// Graded: the engine's own LUFS meter agrees with ffmpeg's (≤ 0.5 LU), true peak ≤ -1.0 dBTP, no NaN, no sample at full scale, DC < 0.01, no digital silence > 5 ms, held frame > 1 ms or replayed buffer
// > 0.5 ms inside the peak section, the audio's pulse is at the score's tempo (±1 %),
// The written notes against the heard pitch classes of the whole mix, and the key's share of the sound, are printed (not graded: see part_audit.cjs).
// Usage: node tools/wav_audit.cjs [genres|all] [seeds=1,2] [outdir] [--png] [--bars=16]
const fs = require('fs'), path = require('path'), os = require('os');
const { X, renderTrack, appScore } = require('./render.cjs'); const A = require('./lib/audio_audit.cjs');
const DEFAULT_KIT = process.argv.includes('--default-kit'); // the tracks are built the way the app builds a new one (the genre's palette of sounds); --default-kit renders the genre's plain kit instead
const args = process.argv.slice(2), PNG = args.includes('--png'), barsArg = args.find((a) => a.startsWith('--bars=')), BARS = barsArg ? +barsArg.slice(7) : 16, pos = args.filter((a) => !a.startsWith('--'));
const G = !pos[0] || pos[0] === 'all' ? X.GENRES.map((g) => g.id) : pos[0].split(','), SEEDS = (pos[1] || '1,2').split(',').map(Number), OUT = pos[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'forge-wav-'));
if (!A.haveFfmpeg() || !A.havePython()) { console.log(`wav_audit: unavailable (${!A.haveFfmpeg() ? 'ffmpeg with ebur128' : 'python3 with numpy + scipy'} not found) — nothing was checked`); process.exit(0); }
const MODES = A.modeTable(); let fails = 0, warns = 0; const rows = [];
const dBtp = (v) => (v == null ? 'n/a' : (v === -Infinity ? '-inf' : v.toFixed(2)));
for (const g of G) for (const seed of SEEDS) {
  const score = DEFAULT_KIT ? X.composeTrack(g, seed) : appScore(g, seed), sec = X.peakSectionOf(score), from = sec.bar0, to = Math.min(score.meta.bars, from + Math.min(BARS, sec.bars));
  // (v9.4) the pre-roll reaches back to the start of every note still sounding (or releasing, its last bar) when the section begins:
  // a chord held 4 bars up to a late entry rendered as digital silence — the 2-bar pre-roll had skipped its onset; the app plays it
  let pre = 32; for (let i = 0; i < score.ev.n; i++) { const t = score.ev.t[i]; if (score.ev.ch[i] < 9 && t < from * 16 && t + score.ev.d[i] > from * 16 - 16) pre = Math.max(pre, Math.min(256, Math.ceil(from * 16 - t) + 2)); }
  const r = renderTrack(g, seed, { score, fromBar: from, toBar: to, pre }), file = path.join(OUT, `${g}-${seed}.wav`); A.writeWavF32(file, r.L, r.R, r.sr);
  // the engine's own BS.1770 meter on exactly the samples that were written (not the render's running meter, which also heard the 2-bar pre-roll)
  const lm = new X.Loudness(r.sr); for (let i = 0; i < r.L.length; i += 128) { const n = Math.min(128, r.L.length - i); lm.block(r.L.subarray(i, i + n), r.R.subarray(i, i + n), n); }
  const own = lm.integrated(), ff = A.ffmpegLoudness(file), m = score.meta, a = A.analyze(file, { bpm: m.bpm, scale: MODES[m.mode], key: m.key, expected: A.expectedChroma(score, from * 16, to * 16), png: PNG ? path.join(OUT, `${g}-${seed}.png`) : null });
  const f = [], w = []; const bad = (c, msg) => { if (!c) f.push(msg); }, soft = (c, msg) => { if (!c) w.push(msg); };
  bad(ff && ff.lufs != null && Math.abs(ff.lufs - own) <= 0.5, `LUFS: engine meter ${own.toFixed(2)} vs ffmpeg ${ff && ff.lufs}`);
  bad(ff && ff.truePeak != null && ff.truePeak <= -1.0, `true peak ${dBtp(ff && ff.truePeak)} dBTP (limit -1.0)`);
  bad(a.nan === 0, `${a.nan} NaN/Inf samples`); bad(a.clipped === 0, `${a.clipped} samples at full scale`);
  bad(Math.abs(a.dc[0]) < 0.01 && Math.abs(a.dc[1]) < 0.01, `DC offset ${a.dc}`);
  bad(a.silenceMs <= 5, `${a.silenceMs} ms of digital silence in the peak section`); bad(a.stutterMs <= 1, `one frame held for ${a.stutterMs} ms (an under-run's hold)`); bad(a.replayMs <= 0.5, `the sound repeats the buffer before it for ${a.replayMs} ms (an under-run's replay)`);
  // tempo: the audio's pulse comb peaks at the score's tempo (±1 %); a beatless piece has no pulse to measure and is not graded
  bad(!a.tempo.pulse || Math.abs(a.tempo.bestScale - 1) <= 0.01, `the audio's pulse peaks at ${(a.tempo.bestScale * 100).toFixed(1)} % of the score's ${m.bpm} BPM`);
    // (information only on the whole mix: drums, overtones and sub-bass notes below the analysis band blur it; tools/part_audit.cjs grades every part ALONE)
  soft(a.notes.corr >= 0.5 && a.notes.bestCorr - a.notes.corr <= 0.1, `the mix's pitch classes match the written notes only loosely (correlation ${a.notes.corr}, ${a.notes.bestCorr} at a transposition of ${a.notes.best} semitones)`);
  if (f.length) fails++; if (w.length) warns++;
  rows.push({ g, seed, bpm: m.bpm, lufsOwn: +own.toFixed(2), lufsFf: ff.lufs, lra: ff.lra, tp: ff.truePeak, a, f, w });
  console.log(`${f.length ? '✗' : w.length ? '!' : '✓'} ${(g + '/' + seed).padEnd(22)} ${String(m.bpm).padStart(3)} BPM  LUFS ${own.toFixed(1).padStart(6)} (ffmpeg ${String(ff.lufs).padStart(6)})  TP ${dBtp(ff.truePeak).padStart(6)}  pulse ${a.tempo.pulse ? (a.tempo.bestScale * 100).toFixed(1).padStart(5) + '%' : ' none'}  notes r=${a.notes.corr.toFixed(2)}${a.notes.best ? ' (best at +' + a.notes.best + ')' : ''}  in-key ${(a.key.inKey * 100).toFixed(0)}%/${(a.key.other * 100).toFixed(0)}%${f.length ? '\n    ' + f.join('\n    ') : ''}${w.length ? '\n    ! ' + w.join('\n    ! ') : ''}`);
}
// the detectors must see what they are for: the first render with a 5 ms dropout, a held frame and a replayed buffer put into it. A detector that cannot see these passes everything.
{ const f0 = path.join(OUT, `${rows[0].g}-${rows[0].seed}.wav`), w0 = A.readWav(f0), sr = w0.sr, inj = (name, fn, want) => { const L = Float32Array.from(w0.L), R = Float32Array.from(w0.R); fn(L, R); const file = path.join(OUT, 'inject-' + name + '.wav'); A.writeWavF32(file, L, R, sr);
    const a = A.analyze(file, {}), got = want(a); console.log(`${got ? '✓' : '✗'} detector self-check: ${name} → ${JSON.stringify({ silenceMs: a.silenceMs, stutterMs: a.stutterMs, replayMs: a.replayMs })}`); if (!got) fails++; };
  const at = Math.floor(sr * 6.123); inj('dropout', (L, R) => { L.fill(0, at, at + 220); R.fill(0, at, at + 220); }, (a) => a.silenceMs >= 4);
  inj('held frame', (L, R) => { L.fill(L[at], at, at + 300); R.fill(R[at], at, at + 300); }, (a) => a.stutterMs >= 5); inj('replayed buffer', (L, R) => { L.copyWithin(at + 512, at, at + 512); R.copyWithin(at + 512, at, at + 512); }, (a) => a.replayMs >= 5); }
fs.writeFileSync(path.join(OUT, 'wav_audit.json'), JSON.stringify(rows, null, 1));
const lufsErr = rows.map((r) => Math.abs(r.lufsOwn - r.lufsFf)), tpMax = Math.max(...rows.map((r) => r.tp));
console.log(`\n${rows.length} renders · engine meter vs ffmpeg: worst ${Math.max(...lufsErr).toFixed(2)} LU, mean ${(lufsErr.reduce((s, v) => s + v, 0) / rows.length).toFixed(2)} LU · highest true peak ${tpMax.toFixed(2)} dBTP · pulse found in ${rows.filter((r) => r.a.tempo.pulse).length} of ${rows.length}, all at ${[...new Set(rows.filter((r) => r.a.tempo.pulse).map((r) => (r.a.tempo.bestScale * 100).toFixed(1) + ' %'))].join(' / ')} of the score tempo · notes correlation ${Math.min(...rows.map((r) => r.a.notes.corr)).toFixed(2)}…${Math.max(...rows.map((r) => r.a.notes.corr)).toFixed(2)}`);
console.log(`files: ${OUT}`);
console.log(fails ? `wav_audit: ${fails} of ${rows.length} renders FAILED` : `wav_audit: all checks pass${warns ? ` (${warns} with warnings)` : ''}`); process.exit(fails ? 1 : 0);
