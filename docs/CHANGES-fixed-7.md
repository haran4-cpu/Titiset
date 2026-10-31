# FORGE v8.7-fixed-7 — what changed (full cumulative ZIP, no patch)

fixed-7 = fixed-6 (worklet from a data: URL when the page runs from disk) + fixed-5 (MIDI clock-out smoothing) + the tooling rounds before them + the changes below.
Earlier rounds (fixed, fixed-2, fixed-5, fixed-6) did not touch the composer or the timing of the engine.

## Brief: "quantize", notes written correctly, structure and transitions that do not sit exactly
Read as: events not on the grid, notes written against the harmony, and section boundaries / drops / transitions off by a hair.
Measured first, on rendered audio (exact worklet code):
- Drum onsets sit on the grid to the sample: kick sd 0.05 ms, closed hats 0.08 ms, rim 0.03 ms, snare roll 0.11 ms; deck-to-deck transitions land with grid offset 0.00000; swing is on every odd 16th of every channel (a 32nd snare roll stays straight).
- So the grid itself was not wrong. Three real defects were found around it:

## 1. Composer: notes written through chord changes and through the drop gap (src/compose/composer.js)
- Sustained pad / chord notes ignored the forced turnaround chord at the end of a build and the 2-step gap before a drop (the gap was only subtracted for 1-bar slots), so the old chord rang under the new one for up to two bars and notes sounded through the half-beat that must be silent before a drop.
  Bass, written melody, hook lead, chops, second-hook (arp channel), stabs and the arp rendered through the gap too, and the percussion rim lane ignored the gap.
- Now: `chordVoicedAt` / `chordRunBars` / `chordHoldSteps` hold a pad or chord to the next voiced chord and not past it (also across the turnaround); `DROP_GAP = 2` is applied to every pitched role through `cap()` and to the arp and the rim lane.
- tools/timing_test.cjs (new, graded): 96 tracks (32 genres x seeds 1,2,3). fixed-6: 1 chord clash, 447 pitched notes ringing into the gap, 4 drum hits inside it. fixed-7: 0 / 0 / 0. It also checks swing on every odd 16th and that nothing sustained outlives its section.
- Nothing else in the music moved. tools/score_diff.cjs (new) against fixed-6, 128 tracks (32 genres x seeds 1,2,3,11), 691,342 events: 99.91 % identical; 592 sustained notes shorter (start, pitch and velocity untouched; the longest cut is 2 bars of a chord ringing under the next one), 6 rim hits inside the gap removed (tech-house), 0 added; sections, chords and meta identical. The critic over all 32 genres (verify_all, seed 11): 0 failing checks and the same 4 warnings as fixed-6, master loudness within 0.3 LU; the arrangement, lead, voicing, stab and dialogue metrics are identical.

## 2. Engine: commands that wait for a step (src/engine/09_processor.js)
- New command `{ type: 'at', deck, atStep, list, rest?, id? }`: the engine holds it and runs `list` in the block that contains `atStep`, a sound on its exact sample (like a quantised jump). `fxNow` accepts `until` (a riser ends exactly on that step). `cancelAt` clears a deck.
  A seek, jump, new track or held loop settles what was waiting (`rest` commands run at once, the others are dropped); the engine reports `{ type: 'at', how: 'ran' | 'settled' | 'dropped', deck, at, pos, off, id }`.
- tools/at_test.cjs (new, graded): sample-exact at 90 - 174 BPM, blocks of 128 / 512, fractional steps; riser `until`; paused deck; settle rules; order inside a block; tempo glide in between.

## 3. UI: moves timed by the page, from the heard position (src/ui/auto.js, perform.js, app.js)
- Auto's moves (filter sweep, echo throw, energy dip) and the Build -> Drop snare-up were timed with `setTimeout` from the HEARD position: late by the output latency or the render-ahead of the Stable engine, plus page jitter, and by seconds in a background tab.
- Now the engine holds them (`at`); the page only follows (pad lit, energy knob) when the engine reports. Moves are planned 70 - 76 steps ahead and never under a held loop; SAFE sends `cancelAt` first.
- tools/auto_move_test.cjs (new, Chromium): all moves run on their step to the sample, a jump on air and SAFE settle waiting moves, Build -> Drop runs the snare-up in the engine. `[live|fast|buffered|fallback]` selects the engine.

## Wiring
- tools/ci.cjs runs `timing`, `at` (graded) and `auto-move` (browser); tools/build.cjs exposes `autoMove` and `buildToDrop` on `window.__forge.auto` for the test.
- README: "Timing and writing" section and the three new tests in the verification list.

## Run it
- Double-click `dist/test.html` (the complete page; Chromium engines tested from file:// in the Live engine). `dist/index.html` is the same page without the `<html>` shell, for embedding / artifact hosts: opened alone from disk it has no doctype and a browser renders it in quirks mode (a few pixels of spacing off).
- Or `node tools/build.cjs && cd dist && python3 -m http.server`, then open http://localhost:8000/test.html (the browser tests use port 8765).

## Not covered
Firefox and Safari were not run (Chromium only, as in all earlier rounds). The Claude artifact page cannot be inspected from here; if sound does not start there, use the HTML file.
