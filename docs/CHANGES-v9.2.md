# FORGE 9.2 — what changed, and what was checked

## How this release was made
Three independent reviews of 9.1, each by a specialist working from the code and from measurements, not from the change notes:
the **audio engine's architecture** (the DSP, the real-time paths, export), the **app's architecture** (state, live-set flows, the
screen, security, the main thread) and **the music as a DJ hears it** (mixing practice, the writing in each genre). Every finding
was reproduced on 9.1 with a probe before anything was changed; the fix was checked with the same probe; and the probes that
describe a situation in a live set became two new test suites (`tools/engine_flows_test.cjs`, `tools/flows_ui_test.cjs`) that
fail on 9.1. The order was the one asked for: first make what exists stand (29 findings, below), then add. Before delivery a fourth
reviewer, who had not seen the work, checked the release against these notes: what that check found, and what was done about it, is
its own section below — it corrected some of the numbers here, and found one serious defect.

## Mixing — what 9.1 did wrong, and what it does now
- **A ghost of the outgoing track after every mix.** 9.1 put the outgoing deck's fader and EQ back up in the same block the mix
  ended, while its last downbeat and its reverb and delay tails still sounded: a −8 to −15 dBFS burst of the old track after each
  mix. The outgoing deck now stops with its fader down and its EQ as the mix left it, until it is loaded or played again: the
  loudest block in the second after a mix is −64 dBFS.
- **The bass swap.** 9.1 swapped the basses at 60 % of the mix over one beat — never on a bar line (32 bars: mix bar 19, between
  beats 1 and 2) — and the bars before the swap lost 2–5 dB (the outgoing track was already in its thinner outro, the incoming
  one's low end still held out). The swap is now on a bar line: the first one from the middle of the mix on where the incoming
  track actually plays bass, at the latest where the outgoing track starts to fade (70 %). Most incoming tracks bring their bass in
  four bars into their second intro section; a swap on the middle bar line would leave those four bars with no bass at all.
  Measured on Auto-DJ handovers in the app's geometry, the quietest bar from the middle of the mix on against the bars before it —
  on my 15 genre pairs: 9.1 median 3.1 dB, worst 5.0 dB → 9.2 median 1.6 dB, worst 2.9 dB; on the independent check's 15 pairs:
  9.1 median 3.6 dB, worst 5.1 dB → 9.2 median 1.7 dB, worst 3.2 dB. The review's target was 1.5 dB: 10 or 11 of those 15
  handovers are still over it (one sits at 1.5 dB, above or below with the noise of the run) — the incoming track's intro is lighter
  than the drop it takes over from. The hole is smaller, not gone; it is in the list of what is not done. The middle bar line
  alone — the first 9.2 version — measured worst 7.0 dB: it made the hole longer.
  The mix's status line says where the swap will be.
- **The incoming track comes in from silence.** Its fader sat at 1 from its load until the mix's fade-in caught it, so its first
  downbeat came through at −10 to −15 dBFS for about 20 ms (in 9.1 too; found while fixing what the independent check found). The
  mix now starts it at 0: −80 dBFS in its first 24 ms.
- **A mix can be called off.** *Cancel mix* (a button in the mixer and in the mix strip, or Shift+Esc) disarms an armed mix or
  stops a running one: the outgoing track comes back to full, the incoming deck stops. Esc (SAFE) and switching Auto-DJ off
  disarm a mix that has not started (a running mix is music: it finishes unless it is cancelled). Pausing the incoming deck
  cancels the mix and brings the outgoing deck back (9.1: silence). An outgoing track that ends before its mix does hands over at
  once (9.1: the mix hung with the incoming bass held out). A mix called off by hand — Cancel mix, Esc, pausing the incoming deck —
  also switches **Auto-DJ off**, and says so: with Auto-DJ on, the independent check saw a cancel undone within 4–6 s (Auto-DJ
  composed another track over the cued one and armed a new mix). The cued track stays on its deck, with any edits; switched on
  again, Auto-DJ mixes that track in — it now always takes a track that is waiting on the other deck, loaded by hand or cued
  before, instead of composing over it (a running mix called off by hand leaves its incoming track waiting too, so the next mix
  plays its first bars again from the cue point; a saved set remembers which deck's track has played, so a resumed set never
  mixes in again the track that just played out). A deck whose mix was called off before it started plays at full the next time
  it is played (the check found it silent: its fader had stayed down from an earlier mix-out).
- **The deck on air is never replaced.** One load policy for every way of loading — the library, the Ask bar, Perform view's
  *Next track → Load*, the Score tab's *Load as new*, MIDI *Load next*: a track goes to the free deck, and a load aimed at the
  only deck playing is refused with a message (9.1: Perform's Load and the Score tab replaced the playing deck — silence).
- **Ask during a mix** waits for the mix to finish and loads on the deck the mix freed (9.1: it replaced the incoming deck mid-mix
  and left the outgoing one half faded with its bass cut).
- **Tempo and grid.** A mix whose start bar has already passed starts on the next bar line (9.1: at once, 3 to 7 sixteenths off the
  beat). During a mix the incoming deck follows the outgoing one's tempo (9.1: a tempo change on one deck drifted 1.7 sixteenths
  in 8 s). A load clears the last track's tempo glide (it drifted the next mix) and its part mutes (the bass stayed silent while
  its button showed it on). Auto-DJ's glide after a mix is bounded by the time to the next mix.
- **Harmonic mixing.** 9.1 lumped the modes together and guessed the next track's mode from a probe, so about one mix in four
  landed two or more steps away on the Camelot wheel (22.6 % of simulated mixes). The next track's seed is chosen first, its real
  mode read, and the key set by Camelot distance (same key, ±1, or the relative): over 4,000 simulated mixes 52 % land on the same
  key signature, 48 % one step away, none two or more.
- **Phrases follow the track.** Mixes, Auto's moves and score swaps wait for the next line of the track's own phrase structure
  (its sections, in 4- or 16-bar steps from where each section starts). 9.1 used the absolute 16-bar grid; in 11 of the forms
  sections start on bar 8, 24, 40 …, so those landed 8 bars into a phrase.

## The engine survives bad input
- **One non-finite number silenced the master for good** in 9.1 (a NaN in 7 of 11 command types, or in a hand-edited set file:
  the limiter and the reverb kept it forever). Commands with a non-finite or wrongly typed number are refused (a `rejected`
  message names them); a non-finite sample at the master rebuilds the deck that made it from its own score and clears the master's
  state (`heal`); an exception inside the audio callback is caught — in the worklet, the render-ahead worker and the ScriptProcessor
  fallback (the last one only since the independent check) — the engine rebuilt and the set kept (`rescue`; three in two seconds
  report `engineReset` to the page instead of looping). A mix in flight is called off properly (the check found the mix frozen: both
  decks at fader 1, the incoming bass held out for good). EQ values are kept within −40…+12 dB (an EQ of 1e9 dB looped the self-heal:
  333 heals in 1000 blocks), and four heals within a second stop the deck whose own sound keeps breaking and tell the page — a mix
  it is in is called off, or handed over when it is the outgoing deck, and the other deck plays on without being rebuilt each time;
  both decks stop only when the broken sound shows in neither deck's own output. A track that breaks the sound again after every
  rebuild no longer loops. Set files are checked field by field before they are applied.
- **Score text.** A section name carrying markup ran as script in the dock's section menu (it could read the AI keys). Section names
  and titles are escaped where they are shown, and the validator refuses markup and control characters in them (titles up to 60
  characters, section names up to 48).
- **The AI repair round** sent the model the word `undefined` in place of each error (wrong field names) and its test passed
  anyway. The model now gets each error and its fix, and the test asserts the exact text.
- **AI keys on a page opened from disk.** Every HTML file opened from disk shares the browser's storage for files (Chromium: one
  `file://` origin): on 9.1 another file in another folder read the saved keys. Opened as a file, FORGE now keeps keys for the
  session only, says so in the AI settings, and saves them only if *Remember my keys on this computer anyway* is ticked; served
  from a folder or hosted, the page's storage is its own and keys are saved as before.
- **Blocks longer than 128 samples.** Every host renders 128 samples at a time, but the engine accepted longer blocks and left the
  samples past 128 unwritten (in 9.1 too). It now renders a long block as 128-sample pieces; the self-heal had made this visible.

## Sound details
- **Mutes ramp inside the block** (9.1 stepped the gain once per block: an audible click, energy above 2 kHz at −28.7 dBFS → −67.9).
- **Effects fade out in 5 ms** on a seek, a jump or a load, and the echo rings on (9.1 cut every effect voice and its echo dead).
- **Exported stems add up to the mix.** 9.1's five stems, summed, came out 4.5 dB louder than the mix with peaks at +6.1 dBFS
  (clipped integer WAVs: each stem went through its own master compressor and limiter). Now one pass renders the mix and records
  what the master does to it — the glue compressor and level, the soft clip, the limiter — and each stem is replayed through
  exactly those gain moves, written as 32-bit float WAV: on six whole tracks (techno, psytrance, trance, dub techno, melodic techno,
  deep house) the stems summed differ from the mix by 74–80 dB under it. The final check caught the first 9.2 version 23 dB off on
  techno: an effect fed by two stems (the deck's echo) idled in a pass that had only one of them and came back with its delay line
  and its LFO elsewhere; the export now runs without the effects' idle shortcuts — counted, so that a WAV export of the other deck
  finishing meanwhile no longer switches that off under the stems (the independent check: −28 dB instead of −74). The drum stem alone
  can peak over full scale (+0.8 to +1.9 dBFS on the check's tracks): it is float, nothing is lost, but a tool that reads it as
  integer would clip it. A stems export takes six full passes — about the track's length, 3.6× a 9.1 export.
- **Where the music is heard.** The playhead, the MIDI clock and the cue were placed from the frames queued but not always the
  device's output latency (Bluetooth: early by its whole latency). Heard position = frames queued + output latency, smoothed.
- **The render-ahead player** (Android) copies into recycled buffers (245 → 78 bytes allocated per audio quantum), fades in after a
  re-buffer and fades the edge of a dropout instead of cutting, and the worker's cushion follows the lead it was given.
- **Analysis on Android** (the per-track gain) runs light — 16 kHz, one pass: half the CPU per load (16 tracks: 10.7 s against 21.0 s),
  within 0.32 dB of the full analysis.

## The screen
- **Phones and tablets.** The start card fits a 360–412 px screen (9.1: 447 px wide). Every button on a touch screen is at least
  36 px tall. The **mix strip** keeps the crossfader, the deck faders, Auto-DJ and Cancel mix on the first screen of a phone or
  tablet; the dock starts folded on phones.
- **Held controls stay held.** The dock re-rendered its whole body when a new section began: a knob mid-drag went dead and an FX
  held with Shift stuck on. Re-renders now wait until the pointer is released.
- **Less main-thread work** (it takes cores from the Android render-ahead worker): text and widths are written only when they
  change, colours and canvas sizes are cached, the Score tab compiles off the page thread. Phone profile, CPU 4× slower: the main
  thread busy 28–31 % with the dock folded (9.1: 58–65 %), 10 layouts a second (9.1: about 95); Score → Check returns in 132–160 ms
  with no long task (two runs).
- **Honest status.** A degraded engine (no worklet, a strict content policy) is named from what actually runs, with a banner and a
  line in Health (9.1: the Android fallback was labelled "Live · safe"). Battery text no longer says "laptop" on a phone.
  Two messages within 1.5 s stack instead of the second overwriting the first (a message of the same kind — "Energy 60 %",
  "Rendering … 45 %" — replaces the last one); the BPM box follows the engine right after a load; the first track shows that it is
  being composed. After a live edit (new drums, new melody …) the dock and the part buttons are redrawn in the next frame, not in
  the task that swaps the score.
- **MIDI encoders.** Relative encoders in all three common encodings (two's complement, offset binary, sign-magnitude), chosen per
  binding, without the centre snap that sent a one-step turn back (9.1 read only two's complement: an offset-binary encoder swept
  the control to one end). New controller targets: Cancel mix, tempo, sync, beat jump ±1 bar, loop halve/double, load next.

## Content
- **Psytrance: the riff and the acid voice apart.** In 9.1 they started together on 44–75 % of the sixteenths, 1–4 semitones apart.
  The acid voice now plays an octave under the riff (riff 60–81, acid 43–60) and skips the riff's onsets — 0 % together over six
  seeds, their median pitches 9–20 semitones apart. The gated chords play in alternate eight-bar blocks; the riff breathes (rests
  at the ends of its phrases); the acid voice leaves the outro to drums and bass (a DJ mixes over that).
- **No bass under the floor.** Bass notes fold up an octave below D1 (36.7 Hz), below E1 (41.2 Hz) in the psy genres. 9.1: 33 % of
  psytrance's bass time under 40 Hz, 43 % of progressive psy's, 32 % of progressive house's. Now nothing under 35 Hz in any genre;
  psytrance and progressive psy 0 % under 40 Hz (lowest note E1, 41.2 Hz), progressive house 16 % (D1–D#1, where its key puts the root).
- **Kick and bass apart.** A bass-only sidechain duck in the genres where they collided (UK garage, breakbeat, dubstep, afro house,
  drum & bass, deep house): the bass under 100 Hz now sits 6–10 dB under the kick in the kick's first 60 ms (UK garage 6.1, breakbeat
  7.1, dubstep 8.2, drum & bass 8.5, deep house 10.2, afro house 10.3; 9.1: −0.3 dB in UK garage, −1.4 dB in breakbeat).
- **Melodies that breathe.** Hooks are written as open and closed periods (a question ending away from the tonic, an answer ending
  on it), with suspensions resolving by step and a third block (C) in long drops: tonic period endings 38 % → 22 %, distinct
  eight-bar blocks per drop 2.0 → 3.9.
- **Melodic techno is not progressive house.** They shared one contract in effect (similarity 0.84). Melodic techno now has
  Phrygian and harmonic minor, a chord every four bars, progressions with the Phrygian bII and the harmonic-minor V; progressive
  house its own tempo, swing, drums and progressions: similarity 0.64.
- **Palettes per genre** leave out sounds that do not belong (a measured exclusion list per genre).
- Recalibrated after these changes: balance and loudness, tone, arrangement levels and palette levels for the 24 genres whose
  content changed (`tools/calibrate.cjs` → `tone_cal.cjs` → `arrange_cal.cjs` → `preset_gain.cjs`).

## New
- **Auto-DJ plans the set.** The next genre is chosen by a set brain (`planNext` in `src/compose/composer.js`): a genre plays 2.35
  tracks on average — a single track 29 % of the time, rarely more than four — then the set moves; no A → B → A within four
  tracks; an energy arc around where the set started; the set's home style pulls it back and is always one move away; tempo moves
  stay within reach of a glide. The Journey choice (flow / family / same
  genre) sits under the crossfader with the Auto-DJ switch, and the reason for each pick is shown.
  Simulated over 20,000 picks per start, the way the app calls it: a genre runs 2.35 tracks on average; a return to one of the last
  four genres 0.5–4 % of picks (9.1: 11.8 %; the two-genre families, drum & bass / jungle and ambient / lofi, alternate); a family
  change on 15–33 % of picks (9.1: 64.7 %); a set started on psytrance stays psy-led — the psy family 55 % of the tracks, trance 18 %
  (9.1: psytrance 0.3 % of a long set). A first version weighted staying in the genre among the neighbours and came out at a new
  genre every 1.4 tracks; staying now has a set chance by the length of the run.
- **The set saves itself** every 20 s while it plays and when the page is hidden; the start card offers to resume it (48 hours).
- **Two live-set suites**: `tools/engine_flows_test.cjs` (the real engine: 22 deterministic checks — the mix-end ghost, the swap,
  the bass hole on 15 genre pairs, cancel and hand-over, the grid, a glide and a tempo change, mutes, refused commands, heal, rescue,
  FX fades, mute ramps, stems that sum, and the engine defects the independent check found) and `tools/flows_ui_test.cjs` (the
  page in Chromium, 17 checks: the load policy, Cancel mix, Esc, Ask during a mix, the validator, Auto-DJ after a cancel, a deck
  whose mix was called off, a saved set that remembers which track played, each host's exception catch, the phone's mix strip).
  Both are steps of `tools/ci.cjs`. On 9.1 the engine suite fails every check it reaches; the checks added after the independent
  check fail on the build it checked (e35cc95) — the ones that make the engine throw because the `testFail` hook is new (the
  worklet and the worker caught exceptions already there).
- **A test hook**: the engine command `testFail` makes the next `render()` throw, so the suites can check every host's catch.

## Found by the reviews, not done in 9.2
Each is measured and written down with its probe; none of them breaks a set, which is why they come after the above.
- **Android control latency.** The knobs answer after the render-ahead cushion (85 / 170 / 340 ms plus the device), and after a
  dropout the cushion grows to as much as 680 ms and gives back 12 ms every 20 s clean — about 11 minutes back to 340 ms. A faster
  give-back or controls that bypass the cushion need measuring on a phone first.
- **The eco ladder's first step** (channel character off) is the audible one; reordering it waits for the same phone measurements.
  The CPU budget (`cpu_bench`) is measured at 44.1 kHz on default kits; the palette tracks at 48 kHz cost up to ~30 % more.
- **Sound.** The psy scream voice aliases (alias energy 16.5–19 dB under its harmonics; 4× oversampling measured −32 to −34 dB) —
  it is no longer a riff voice, but it is still a melodic voice in progressive psy. The master soft clip runs at 1× (aliasing −33
  to −35 dB in 10–20 kHz on the loudest drops).
- **CPU.** The render path makes 11.6 MB per second of short-lived garbage (V8 number boxing in the master, the motion echo, the
  drums); the WebAssembly voice is slower than the JavaScript one for 3 of 4 models (buffer copies, maths calls back into JS) — it
  stays on, because the JavaScript voice makes 20–50 MB of garbage per second of audio.
- **DJ tools in the tracks.** Only psytrance's acid voice leaves the outro; 32-bar drum-and-root outros, beat-led intros in the
  bass genres, an isolator EQ and more transition shapes (drop swap, echo out) are designed, not built.
- **Controllers.** No factory maps (Pioneer / Numark / Hercules / Akai / Korg): MIDI learn maps any controller.
- **Genres.** Beatport sub-genres (organic / melodic house, raw / hypnotic trance and techno, liquid / neuro DnB …) are not there;
  the Mood setting changes harmony only.
- **The bass hole of a handover** is smaller, not gone: 10 or 11 of the independent check's 15 genre pairs are still over the review's
  1.5 dB target (median 1.7 dB, worst 3.2 dB). Closing it needs the incoming intro's low end (or the outgoing outro's) shaped for the
  mix — a change to the music, to be judged by ear.
- **Bass between 35 and 40 Hz** stays where a genre's key puts its root there: techno and electro 19 % of the drop's bass time, hard
  techno 17 %, progressive house 16 % (the floor is D1, 36.7 Hz; nothing under 35 Hz anywhere).
- **Tracks from the Ask bar** are not key-matched to the deck that plays (as in 9.1); Auto-DJ's and the library's are.
- **Small.** A jump drops the notes of its own block that fall just before its line (914 of 361,836 events, all hats); the MIDI
  clock looks 60 ms ahead on a 25 ms page timer; Safari and iOS are untested.

## The independent check, before delivery
A reviewer who had not seen the work checked the build that was about to be delivered (e35cc95) against these notes, with the three
reviews' probes and its own, in about 45 minutes of work. It held the release, and was right to.
- **Confirmed, with its own numbers:** the mix-end ghost is gone (9.1 −8.3 to −12.8 dBFS → −75 to −87, three pairs × blend / cut /
  echo); one bad command no longer silences the set (fuzzed: 42 of 60 runs left silent → 0, 167 commands refused); the load policy;
  pausing the incoming deck mid-mix; Ask during a mix; the markup in section names (refused, and escaped where shown — it noted that
  a section's type was still inserted as it is, harmless behind the validator's fixed list; it is escaped now too); key matching
  (200 transitions: 56.5 % the same key signature, 43.5 % one step, none two or more); the psy riff and acid voice (0 % together over
  seeds 1–6, 9–20 semitones apart); the stems (deep house, 64 bars: +4.5 dB → −78.4 dB; dub techno −79.5); the kick/bass duck to the
  decimal; the mix-end, timing, tempo and FX numbers of these notes.
- **Found, and fixed before delivery** — each is now a check in the suites, and each of those checks fails on e35cc95 (those that
  make the engine throw, because their `testFail` hook is new):
  1. *A deck could go on air silent.* Arming a mix onto a deck that an earlier mix had faded out cleared the flag that brings its
     fader back, and calling that mix off before it started restored nothing: the next Play on that deck was silent (−51.7 LUFS).
     Esc and switching Auto-DJ off took the same path.
  2. *With Auto-DJ on, Cancel mix and Esc were undone within 4–6 s* (Auto-DJ composed another track over the cued one and armed a
     new mix: the cued track was replaced, with any edits made to it). A mix called off by hand now switches Auto-DJ off; the cued
     track stays.
  3. *An exception mid-mix froze the mix*: the rescue dropped it as it stood — both decks at fader 1, the incoming bass held at
     −30 dB for good, while the page said the mix was called off. The rescue now calls the mix off properly.
  4. *The self-heal could loop*: an EQ of 1e9 dB passed (only non-finite numbers were refused), overflowed the filter, and each
     rebuild copied it back — 333 heals in 1000 blocks, nearly all silent; the blocks of that storm took 5.1 ms at the 95th
     percentile and up to 13.7 ms. Only an engine command reached it (the page's knobs and set files clamped EQ already). EQ is
     clamped, a rebuild clamps what it copies, and four heals within a second stop the deck that keeps breaking, with a message.
  5. *Two exports at once broke the stems*: a WAV export of one deck finishing during a stems export of the other switched the
     export's exact mode off (stems −28 dB from the mix instead of −74). The mode is now counted.
  6. *The ScriptProcessor fallback did not catch an exception* (the worklet and the worker did). It does now.
  Found while fixing these: the incoming deck's first downbeat at −10 to −15 dBFS before the fade-in (in 9.1 too; above).
- **Tests weaker than their messages**, made honest: the Auto-DJ handover check allowed 2 dB on the three pairs it had been fitted
  to (1.6 / 0.9 / 1.9; 4 of the check's 15 pairs failed it) — it now measures those 15 pairs, guards against sliding back (median
  ≤ 2.0, worst ≤ 3.5 dB) and prints how many miss the 1.5 dB target; the UI suite could let two steps pass without their
  precondition (a mix that never started, a Load button not found — in the check's runs both held) and took the Ask track on either
  deck — every precondition is checked now, and the track must land on the deck the mix freed; the timing test (`at`) took the
  sound's sample from the engine's own
  position — it counts rendered samples again (worst error 0.5 samples, as before); the tempo check's glide was cancelled by the next
  command before it ran — the glide is checked on its own (0.0000 steps of drift); the engine's rescue check calls the rescue itself
  — it says so, and the UI suite now makes each host (worklet, worker, ScriptProcessor) throw and play on. `liveset` had been counted
  as passing on its one run under 100 ms (below). No assertion had been weakened, and the engine suite's sensitivity held: every
  check failed on 9.1.
- **Numbers corrected** in these notes: the bass hole (both sets of pairs, above), the mute step of 9.1 (0.0455, not 0.06), the set
  brain (a single track 29 % of the time — it said "two to four"), Cancel and Esc with Auto-DJ on, exceptions in the ScriptProcessor
  fallback, the stems (74–80 dB under the mix, not 79–80).
- **Its look at the fixes** (build d9be30e): it confirmed all six fixed with its own probes (the silent deck now −15.2 LUFS in the
  page; Cancel and Esc switch Auto-DJ off and the cued track keeps its seed; an EQ of 1e9 dB clamped, 0 heals; stems −74 dB with a
  WAV export finishing alongside; two forced exceptions caught in the ScriptProcessor fallback), and a hands-off Auto-DJ set still
  brought in a new track at every mix (three in a row, the third a new genre). It found two more: a resumed set marked both decks'
  tracks as waiting, so Auto-DJ's next mix brought back the track that had played two mixes earlier; and the first version of the
  four-heal stop stopped both decks when only the incoming one was broken — silence, where e35cc95 had kept the outgoing track
  playing, with 17 % of its blocks silent. Both are fixed — saved sets remember which track played; only the broken deck stops,
  the mix is called off, and a repeated heal no longer rebuilds the healthy deck (which glitched it three times more) — and I
  checked them here with its probes: after the resume the same chain brings in a new track; the healthy deck plays on at −12 dB
  with 12 silent blocks in 4000 (131 with the first version of the fix). A read of that last change found no logic errors; it
  pointed out the cases left: a NaN that only the master sees still stops both decks. It also found the "Checked" section stale and
  the start-burst and bass-hole numbers a little off: the numbers are corrected above, and "Checked" is written for the build
  that is delivered.
- **Not looked at by it** (the suites and sessions here cover them): Android and the render-ahead player, the heard position, the
  critic, the melody and genre contracts, listening.

## Checked
On a 2-core cloud machine with headless Chromium and a virtual sound card. What this machine cannot do: a phone's audio path, a
real controller, a club system, an ear. What it can do is below. Every number comes from a run of the delivered build, **71e0146**,
unless it names another build.

**The full suite** (`node tools/ci.cjs --full`), run once on 71e0146, in two halves so that the real-time half had the machine to
itself: **45 of the 46 graded steps pass.** `jumps` failed: 1 of its 10 jumps glitched — the browser's audio thread was not scheduled
for 61–68 ms (gaps between its callbacks; the engine's render time was not slow). Run alone afterwards, alternately with e35cc95 (the
build the independent check reviewed), three times each: 71e0146 0, 0, 0 jumps glitched; e35cc95 0, 0, 1. This machine's sound card
glitches now and then whatever runs on it (the sessions below), but in this run the step failed, and it is counted as failed.
`liveset` passed (76 ms) — see the last item below for what its runs look like. The stems exported through the app add up to the mix
81.2 dB under it (deep house, 302 s).

On the way, the suite and the final checks caught these problems of this release, each fixed and re-run (before the independent
check; what it found is its own section above):
- `timing`: 13 lead notes in 128,982 were held 1.7 steps into a chord they are not part of (the long notes the new open and closed
  periods end on); a long note before the bar line is now cut at it when the next chord does not contain it;
- `at`: a 512-sample block came out silent — the self-heal found the samples past 128 that the engine never wrote (in 9.1 too:
  nothing renders blocks that long, but the engine accepted them); long blocks are now rendered as 128-sample pieces;
- the build's dead-code guard: a line of the set loader had ended up behind a `//` comment (a set's per-deck Auto was not restored,
  also on resume);
- the stems: 23 dB off the mix on techno (the echo idling in one pass, above), then — in an attempt to make the export faster by
  rendering only each stem's own parts — 5–10 dB off: the parts share one noise generator, so leaving parts out handed the others
  different noise. Reverted: a stems export takes six full passes, about as long as the track; `export` now also checks, through the
  app's own export, that the five stems add up to the mix (80.1 dB under it);
- `capture`: the track the app composed was 0.05 dB apart from the one the tool rebuilt — the palette level match drew its noise
  from wherever the thread happened to be; it now starts both of its renders from the same noise;
- `midi-quality`: the MIDI clock's tempo spread was 1.2 BPM on some runs (limit 0.8): every new estimate of the sound card's latency
  moved the heard position and the clock followed it through its low-pass, bending a beat. A new estimate is now taken in one step
  and only when it moves more than 5 ms: 0.29–0.37 BPM over four runs (9.1: 0.37–0.43);
- the set brain's runs (above);
- three suites asserted 9.1 behaviour that 9.2 changed on purpose, and were updated, not loosened: `perform-ui` loaded a new track
  onto the deck that was playing (now refused — the test pauses it first, as a DJ would); `ai-models` expected an Ask during a mix
  to replace the incoming track within 30 s (it now waits for the mix); `hosted` read the whole toast (two messages within 1.5 s now
  stack; it reads the newest). Progress messages ("Rendering … 45 %") replace each other instead of stacking. `export` waited 5
  minutes for the stems download; six passes of a 5-minute track took 6 on this machine — it now waits 12, and also checks the sum;
  `phaselock`, run right after that timed-out export, failed with it, and passed three times alone and in the re-run;
- an Android session (below) showed one transport jump that no command explained: the playhead stepped back 2.4 steps. A meter
  message that reaches the page late reads the render-ahead queue short by its delay, and 9.2 took any change of the queue over
  0.25 s at once — the heard position, and the MIDI clock with it, jumped. A reading far off the running estimate now counts only
  when the next ones agree;
- `liveset` (no main-thread task over 100 ms while 2 busy processes run and the engine is made 3× slower, on 2 cores) is at its
  limit: 76 ms in the final suite run; six more runs of the final code 75, 80, 85, 91, 105 and 137 ms; run alternately with 9.1
  twice each, 9.1 92 and 56 ms against 91 and 137 (earlier builds: 9.1 81 and 105, 9.2 113 and 121). The longest tasks follow the
  live edits (a re-roll, a new part, a load). About one run in three is over the limit: open. Dropouts: 0 in every run.

The critic over 33 genres (seed 11, the final run): 0 failing checks, the same 3 warnings as 9.1 (bass notes that start on the kick in
deep house and dub techno — the idiom of those bass lines, which the duck now carves around — and the stereo width of acid):
`verification/v9_2_33genres_seed11.jsonl`. True peak worst −1.11 dBTP; all 130 bank presets level-matched and clean; the WebAssembly
voice bit-identical; every genre within ±7 dB per octave of the master curve (`signature`); the independent ffmpeg / numpy audits
(`audio`, `audio-parts`) pass.

**Engine flows** (`tools/engine_flows_test.cjs`, 22 checks, all pass): after a mix the outgoing deck stays under −64.2 dBFS (9.1: −8
to −15); the bass swaps on the bar line where the incoming bass comes in; on the independent check's 15 handovers the quietest bar
from the middle of the mix on is median 1.7 / worst 3.2 dB under the bars before it (9.1: 3.6 / 5.1; 10 of 15 over the 1.5 dB
target); pausing the incoming deck at 75 % brings the outgoing one back at full; an outgoing track that ends mid-mix hands over; a
mix armed 7.3 steps late starts 0.000 steps off the grid; a glide and a tempo change mid-mix move both decks (0.0000 steps of drift);
a load clears glide and mutes; 5 non-finite commands refused with 0 bad samples; a NaN inside a deck heals; an exception in render()
is survived; FX stopped mid-sound step −54.6 dBFS; a mute's largest sample step 0.0004 (9.1: 0.0455); a mix called off before it
started leaves its deck playing at fader 1 (−15.2 dB); the incoming deck's first 24 ms −80.2 dBFS (before: −10); an exception at
60 % of a mix calls it off; an EQ of 1e9 dB clamped, 0 heals; a broken track stopped after 4 heals — alone, and mixed in under a
healthy deck that plays on unrebuilt (−10.5 dB); five float stems 74.0 dB under the mix, also with a WAV export of the other deck
finishing alongside.

**UI flows** (`tools/flows_ui_test.cjs`, 17 checks, all pass): the load policy; Perform's Load (the button found, the track on deck
B); Cancel mix armed and running (the mix ran first); Esc; Ask during a running mix (the incoming deck keeps its track, the new one
lands on deck A, the deck the mix freed); the validator refusing markup; Auto-DJ's running mix cancelled — Auto-DJ off, nothing
re-armed in 8 s, deck B's track kept, and Auto-DJ on again mixes that same track in; a mix called off before it started leaves deck A
at fader 1.00 (−15.1 LUFS); a saved set keeps which track already played; the worklet, the render-ahead worker and the ScriptProcessor
fallback each made to throw once — caught, reported, the deck plays on; the phone's mix strip driving the crossfader.

**The reviewers' reproductions, on the delivered build** (the probes that the suites above do not already cover):
- the start card on 360, 390 and 412 px phones: 328–380 px wide, no sideways scroll (9.1: 447 px);
- every dock tab on a touch screen: 0 buttons under 36 px tall (9.1: 88–203 per tab);
- a knob dragged across a section line keeps working, a Tape stop held with Shift lets go (9.1: a dead knob, a stuck effect);
- the first tap on a phone with the CPU 4× slower: "Starting audio…" on the button at once, "Composing Tech House…" as soon as the
  engine is up, sound at 5.3 s (4.1 s on e35cc95 — this machine's spread) (9.1: "Empty deck", and nothing to say the tap had landed);
- the page served alone under a strict content policy, Android: "⚠ Live (fallback)" with a message saying why and what to do (9.1:
  "Live · safe", silently); desktop: plays, and the export says it needs a worker;
- relative encoders, one click each way on a centred filter: ±1 step (0.508 / 0.492) in all three encodings (9.1: two's complement
  stayed at 0.500, offset binary swept to 0.004 / 0.996);
- a set file whose deck position is the text "32": the deck plays (9.1: silent until a new track was loaded); a numeric title is
  refused by the validator (9.1: it broke the WAV export for the session); the BPM box shows the engine's tempo from the first
  300 ms (9.1: stale for 5–9 s); a second Ask while the first is still being written supersedes it and its reply plays once;
- a set saved on `pagehide` comes back from the start card after a reload: the track, its place to the bar, playing, Auto-DJ with its
  journey, the deck's own Auto;
- AI keys on a page opened from disk stay in memory and are not readable by another file; ticked, they are saved; served, saved as
  before;
- the main thread on a phone profile with the CPU 4× slower: busy 28 % with the dock folded (9.1: 58–65 %), 10 layouts a second
  (9.1: about 95), Score → Check back in 132 ms with no long task.
The two probes that end in an error say so only because this sandbox blocks Google Fonts (`net::ERR_TUNNEL_CONNECTION_FAILED`).
Screenshots of a running mix on a desktop and a phone (the status line with the swap point, the reason Auto-DJ gives for its pick,
the phone's mix strip) are in the delivery.

**A set played the way it is played** (`tools/session_test.cjs`: the start card, psytrance, *A gig*, Auto-DJ on, hands off, 8 minutes;
the page sees an Android phone; the engine rendered 3× or 6× per block — a device that much slower):
| run | the render-ahead player ran dry | lowest cushion (of 340 ms) | eco steps | transport jumps | sound-card glitches* |
|---|---|---|---|---|---|
| **9.2 delivered (71e0146)**, Android ×3, two runs | 0 · 0 | 325 · 319 ms | 0 | 0 · 0 | 0 · 2 |
| 9.2 e35cc95 (the build the independent check reviewed), Android ×3, two runs | 0 · 0 | 322 · 322 ms | 0 | 0 · 0 | 1 · 2 |
| 9.2 7364838, Android ×3, two runs | 0 · 0 | 325 · 325 ms | 0 | 0 · 1 (the late-meter jump above) | 4 · 3 |
| 9.2 7364838, Android ×6 | 0 | 325 ms | 0 | 0 | 5 |
| 9.1, the same evening as 7364838, Android ×3, two runs | 0 · 0 | 319 · 325 ms | 0 | 0 · 0 | 7 · 2 |
| 9.2 7364838, desktop (Live · safe) ×3 | — | — | 0 | 0 | 0 |

In each run on the delivered build Auto-DJ loaded and mixed in two new tracks in the 8 minutes.
\* this machine's virtual sound card runs without real-time priority on two cores shared with the browser; 9.1 measured 1 on this test at its
release and 2–7 since, run alternately with 9.2. The number that says whether the engine kept up is the player running dry: 0 in every run.

**The busy points of a set** (`tools/busy_test.cjs safe --android`: steady play · a new track composed and analysed on deck B · the
mix · a WAV export while playing · 24 ear-candy pads): on the delivered build, in the final run, 0 · 0 · 0 · 2 · 0 glitch events;
the render-ahead player never ran dry. The export phase is not settled: run alternately with e35cc95, the delivered build had 1, 1
and 2 glitch events there against 0, 0 and 0 — yet in a timeline of the same mix and export (three runs each) it had 0, 0 and 1
against e35cc95's 2, 0 and 0, and the code that exports and mixes renders at the same speed in both (a whole deep-house track in
node: 32.7–35.3 s against 32.6–35.8 s). This machine's sound card cannot decide it; it is open, for a phone to measure.

**The listening pack** (`FORGE-v9.2-listen.zip`): each excerpt rendered by the 9.1 source and by this one, as the app plays them
(palette sounds, calibration, master); each version's own calibration puts every pair within 0.1 LU of each other — psytrance and
progressive psy (the riff and the acid voice, the bass floor), the six genres with the bass duck, the deep sub of techno and
progressive house, melodic techno against progressive house, the melodies of trance, house and future bass — and three whole
Auto-DJ handovers (24 bars, a 32-bar mix, 16 bars after). The 9.2 files come from the final code: the single excerpts render the same
as on e35cc95 (nothing after it touches a single deck), the three handovers were rendered again for the incoming deck that now comes
in from silence. Measured on the files themselves, the quietest bar from the middle of each mix on against the bars before it: deep
house → tech house 3.9 → 1.7 dB, tech house → melodic techno 2.6 → 1.6 dB, techno → progressive house 4.4 → 2.0 dB.
`LISTEN-he.txt` says what to listen for.

**The local run** (a Playwright probe): the delivered single file, `FORGE-v9.2.html`, opened from disk (`file://`) in
Chromium — on a desktop it plays on the Live engine (*Live · safe*), sound 2.0 s after the start; with an Android phone's profile on
the render-ahead engine (*Stable · gig · WASM · buffer 337 ms · 0 dropouts*), sound after 2.4 s; both at −14 LUFS, the transport
moving at the track's tempo, no page errors. Rebuilt from the source zip, the build is the same, byte for byte (71e0146).
