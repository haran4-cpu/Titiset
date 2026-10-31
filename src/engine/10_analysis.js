/* ===================== TRACK LOUDNESS PRE-ANALYSIS =====================
   Like a DJ library's auto-gain, but exact: before a track is heard, its peak section (first drop, or the densest
   section) is rendered through the very same deck + master chain at the genre's calibrated gain; the integrated
   loudness (BS.1770, gated) gives a per-track trim toward the genre target. Runs in a Worker (or offline tools). */
function peakSectionOf(score) { const d = score.sections.find((s) => s.type === 'drop'); if (d) return d; let best = score.sections[0], bw = -1;
  for (const s of score.sections) { const L = LAYERS[s.layer]; let w = 0; for (const k in L) w += L[k]; if (w > bw) { bw = w; best = s; } } return best; }
function analyseTrack(score, cal, sr, bars, trimDb) {
  sr = sr || 44100; bars = bars || 8; const sec = peakSectionOf(score), deck = new Deck(sr, 0), M = new Master(sr);
  deck.load(score, cal); if (trimDb) { deck.mix.trim = dbToGain(trimDb); deck.mix.trimS = deck.mix.trim; } deck.playing = 1; M.setTempo(score.meta.bpm); M.setLoudness(cal ? cal.master : 0);
  const from = sec.bar0 * 16, pre = Math.min(from, 32); deck.seek(from - pre);
  const L = new Float32Array(128), R = new Float32Array(128), preN = Math.round(pre * deck.sps), N = Math.round(Math.min(bars, sec.bars) * 16 * deck.sps); let done = 0;
  for (let d = 0; d < preN; d += 128) { deck.process(128); M.run([deck.mix], 1, L, R, 128); } M.meter.reset(); // pre-roll (tails, reverb) then measure
  while (done < N) { deck.process(128); M.run([deck.mix], 1, L, R, 128); done += 128; }
  const lufs = M.meter.integrated(); const target = score.mix.lufs; return { lufs, target, trimDb: clamp((trimDb || 0) + target - lufs, -6, 6) };
}
// two passes: the limiter makes loudness sub-linear in gain, so a second render with the first trim refines it
// v7: rendered at 22.05 kHz over 6 bars (+0.18 dB, the measured mean offset to a 44.1 kHz render; spread 0.4 dB over 12 genres):
// ~4× cheaper. At full rate it took 2.3–2.7 s of CPU per track — on a two-core machine that competed with the engine thread
// for the first seconds of every new track (measured as dropouts).
// v9 · pacing: a worker that renders offline (pre-analysis, export) used to hold its core for one to forty seconds; on a machine with
// one or two cores the audio thread then missed its turn (measured: 100–200 ms gaps in the callbacks while the workers ran —
// heard as jumps). The async versions below give the CPU back every few milliseconds: `work` ms of rendering, then a `rest` ms
// sleep. The page tightens the pace while the audio has trouble (PACE.set from the health watch).
const PACE = { work: 10, rest: 2, t: 0, now: () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) };
async function paced() { const n = PACE.now(); if (!PACE.t) PACE.t = n; if (n - PACE.t >= PACE.work) { await new Promise((r) => setTimeout(r, PACE.rest)); PACE.t = PACE.now(); } }
async function analyseTrackAsync(score, cal, sr, bars, trimDb) {
  sr = sr || 44100; bars = bars || 8; const sec = peakSectionOf(score), deck = new Deck(sr, 0), M = new Master(sr);
  deck.load(score, cal); if (trimDb) { deck.mix.trim = dbToGain(trimDb); deck.mix.trimS = deck.mix.trim; } deck.playing = 1; M.setTempo(score.meta.bpm); M.setLoudness(cal ? cal.master : 0);
  const from = sec.bar0 * 16, pre = Math.min(from, 32); deck.seek(from - pre);
  const L = new Float32Array(128), R = new Float32Array(128), preN = Math.round(pre * deck.sps), N = Math.round(Math.min(bars, sec.bars) * 16 * deck.sps); let done = 0, k = 0;
  for (let d = 0; d < preN; d += 128) { deck.process(128); M.run([deck.mix], 1, L, R, 128); if ((++k & 7) === 0) await paced(); } M.meter.reset();
  while (done < N) { deck.process(128); M.run([deck.mix], 1, L, R, 128); done += 128; if ((++k & 7) === 0) await paced(); }
  const lufs = M.meter.integrated(); const target = score.mix.lufs; return { lufs, target, trimDb: clamp((trimDb || 0) + target - lufs, -6, 6) }; }
// opt.lite (v9.2, Android): one pass at 16 kHz instead of up to two at 22.05 kHz — a third of the CPU. Measured on 9.1: a track load
// cost the workers 0.7–1.7 s of CPU, which on a phone is taken from the engine's own worker; the remaining error (a few tenths of a
// dB, where the master's compression bends the second pass) is taken up by the engine's loudness servo
async function trackTrimAsync(score, cal, opt) { const lite = !!(opt && opt.lite), sr = lite ? 16000 : 22050, off = 0.18, fix = (r) => { r.lufs += off; r.trimDb = clamp(r.trimDb - off, -6, 6); return r; };
  const a = fix(await analyseTrackAsync(score, cal, sr, 6, 0)); if (lite && Math.abs(a.trimDb) >= 0.4) { a.trimDb = clamp(a.trimDb * 1.4, -6, 6); a.lite = 1; } // (the master's compression takes ~40 % of a trim back: what the second pass measures)
  if (lite || Math.abs(a.trimDb) < 0.4) return a; const b = fix(await analyseTrackAsync(score, cal, sr, 6, a.trimDb)); b.first = a.lufs; return b; }
function trackTrim(score, cal) { const sr = 22050, off = 0.18, fix = (r) => { r.lufs += off; r.trimDb = clamp(r.trimDb - off, -6, 6); return r; };
  const a = fix(analyseTrack(score, cal, sr, 6, 0)); if (Math.abs(a.trimDb) < 0.4) return a; const b = fix(analyseTrack(score, cal, sr, 6, a.trimDb)); b.first = a.lufs; return b; }
