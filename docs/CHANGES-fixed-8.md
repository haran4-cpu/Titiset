# FORGE v8.7-fixed-8 — what changed (full cumulative ZIP + delta patch on fixed-7)

Brief: "lots of jumps and instability, especially under load".

## What was measured first (one-core Firecracker VM, Chromium 1194 via Playwright 1.56, test.html, techno start, 14 s, the engine's own dropout counter)
- Live engine, default buffer (23 ms): a burst of 7-13 dropouts in 4 of 5 starts on fixed-7 (7, 7, 9, 8) and in 3 of 5 on this build (8, 13, 7); with two CPU hogs 1 of 3.
  The bursts are 100-200 ms gaps between audio callbacks (DSP load stays at 6-13 %): the audio thread is not slow, it is not scheduled while the composer / analysis workers run on the same core.
- A bigger output buffer absorbs those gaps: hint 0.1 s -> 2 of 5 starts burst; hint 0.25 s (Chrome caps it at ~186 ms) -> 0 of 5, and 0 of 3 with two CPU hogs.
- Buffered (Stable) engine: 0 dropouts idle, but 4700 in 40 s with two CPU hogs on one core (worst load 1.89). Not the default; not changed.
- Deferring the composer warm-up (the second compose 300 ms after the audio starts) made no measurable difference (3 of 5 vs 4 of 5): tried, reverted.

## Changes
1. New engine **Live · safe** (src/ui/app.js, index.html): the Live engine with `latencyHint` 0.25 s, i.e. the biggest buffer the browser gives. Pick it in the engine menu (needs a reload, like the other engines).
   Cost, measured here: output delay 746 ms (186 base + 560 output) against 95 ms (23 + 72) for Live. The header shows the real figure; MIDI clock-out and the playhead are compensated from the context's own latency.
2. **Default engine when nothing has been chosen**: Live · safe on a machine with 2 logical cores or fewer, or one whose Live engine glitched before; Live otherwise. An explicit choice always wins; test browsers (navigator.webdriver) keep the plain Live default so the suites measure the same thing everywhere.
3. **Glitch watch**: a Live engine that glitches 6 times in its first 2 minutes, or 15 times in all, shows a toast and remembers it (`forge.autoSafe`) so the next start uses Live · safe, unless an engine was chosen explicitly. It counts the browser's playout glitches when `playoutStats` exists, otherwise callbacks later than the output buffer + 40 ms (src/ui/health.js).
4. With a big output buffer (A.lat > 120 ms) the heard-position estimate uses the reported latency (currentTime advances a whole buffer at a time there), and a MIDI Start from a pause starts the deck that far into the bar so it is on the external downbeat from the first heard note (src/ui/midi.js). Default Live is untouched (A.lat is ~25-95 ms).

## Verified
- Startup dropouts, 14 s, Live · safe: 0 of 5 starts idle, 0 of 3 with two CPU hogs (Live: 3 of 5 and 1 of 3).
- Default 2-core / 1-core / 8-core / automation selection, the safe context's latency (185.8 ms base), the glitch toast and the remembered next start: tested end to end in Chromium.
- Default configuration: live-ui 20, midiclock 6, health 8, ask-ui 8, offline 5, perform-ui 31, layout 32 pass; browser's 16-bar mix lands on grid offset 0.0000.
- Forced Live · safe: live-ui 20, midiclock 6, perform-ui 31 pass; the browser mix lands on grid offset 0.0000.

## Known limits
- Live · safe trades latency for steadiness (about 0.75 s to the controls in this headless sink; a real device reports its own figure). Use Live or Live · fast when you need tight control.
- phaselock under Live · safe: the offset after 24-36 beats is 0.28-0.30 beat (limit 0.05); the first beats are within ±0.05. The heard position cannot be known better than about one device buffer there. Use Live for tight external clock-in.
- phaselock in default Live is itself unstable on this VM now (fixed-7 and fixed-8 both fail 1-2 of 3 idle runs, up to 1.5 beat): the VM, not this change.
- Everything was measured on one VM core with 3-5 runs per condition. If glitches continue on your machine, send the Report file (header -> Report): it records what ran when the audio glitched.
