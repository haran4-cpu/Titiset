# FORGE 9.5 — what changed

9.5 answers the review of 9.4 and the IntelliDAW comparison. The asks were:
- more and better risers and FX;
- better drums;
- patterns and structures to switch on every part;
- easier octave changes;
- the same knobs on every sound;
- advanced sound-design effects;
- a library for preparing a set;
- an app that learns its user.

From IntelliDAW only ideas were taken: none of its presets, code or sounds.

## Transitions
- **66 layered transition recipes** (`src/engine/06c_risers.js`), all in the key of the track:
  - 34 risers, 10 downlifters, 4 sub drops, 8 impacts, 6 swells and 4 washes.
  - The layers are noise, a supersaw, a staircase of the chord's tones, rolls and claps, and gates. Stereo width moves over the length of the sound.
  - Impacts are tuned booms with a crack and a tail. Sub drops dive from the key.
  - Every recipe fades out over 6 ms, so none ends in a click.
- **The composer picks a recipe** for each build, breakdown and drop, from the genre family's own recipes. It never uses the same recipe twice in one track. The 9.4 effects remain the fallback.
- **FX screen · Transitions:**
  - Fire any recipe, 1–8 bars long.
  - A riser ends exactly on the next 4-bar line, with an optional impact on the landing.
  - Dice picks a recipe of the genre at random.
- **BUILD → DROP** and the FX screen's riser, sweep, downlifter, impact and snare-roll pads now play layered recipes.
- `tools/riser_test.cjs` checks each recipe:
  - level within ±3 dB of the 9.4 effect it replaces, and peak at most +4.5 dB over it;
  - no click where it ends;
  - the tonal recipes end in key;
  - every two recipes of a type differ in band, time, movement and width.

## Ear candy, rebuilt to the Bubbles standard
- Zap, rise, swirl, squelch and laser became **Glass, Harp, Wind, Acid and Ping** (`src/engine/06e_candy.js`).
- Each one is now a short phrase of the chord that is playing:
  - placed on the beat grid;
  - moving across the stereo field;
  - played inside the candy's own echo.
- The voices:
  - **Glass:** falling FM bells.
  - **Harp:** a rising plucked arpeggio.
  - **Wind:** noise tuned by combs to the root and fifth.
  - **Acid:** a 303 phrase with slides and an accent.
  - **Ping:** a plucked note thrown left and right.
- **Bubbles is unchanged.**
- `tools/candy_test.cjs`: levels within ±3 dB of the 9.4 sounds, peaks at most +4 dB, in key, no clicks.

## Mangle — sound design on the FX screen
- **Eight beat-locked, key-aware engines** (`src/engine/06d_mangle.js`), on the whole deck or on one part:
  - **Slice:** the last bar re-cut on the grid — reversed, stuttered, half-speed, pitched, gated.
  - **Grain:** a cloud tuned to the chord, or frozen.
  - **Spectral:** Freeze, Blur, Key (drums and noise come back as the chord) or Partials.
  - **Steps:** a pitched multi-tap echo on the grid.
  - **Spiral:** an endless shifter.
  - **Ring/FM:** on the chord's root.
  - **Vowel:** a talkbox.
  - **Fold:** into a crush tuned to the key.
- **Controls:**
  - Two slots with a Morph between them.
  - A Macro, three knobs and a choice on each engine.
  - A touch pad that plays a slot while it is held.
  - 22 recipes, and Dice.
  - **Keep in track:** the Mangle setting is saved in the track (`spec.fx.mangle`) and comes back when the track loads.
- `tools/mangle_test.cjs`, on every engine and every choice:
  - level and peaks;
  - clicks, including on engage, release and engine changes;
  - cost: worst 50 ms per audio second;
  - timing: Slice at Chaos 0 is the bar before, sample for sample;
  - key: Spectral · Key and Steps.

## Drums
- **New hits in every lane:**
  - `2 3 4` ratchets;
  - `?` a hit on about half the bars (decided per bar, the same on every play);
  - `f` flams.
- **Each lane has its own feel** (`drums.lanes`): Swing, Nudge, Chance and Human.
- **EDIT · Drums:**
  - A brush for the grid.
  - Per-lane tools: shift, reverse, mutate, ratchet all, Euclid fills, a rhythm library per kind of lane.
  - **Answer bar**: adds a bar that answers the current one, every lane in its own idiom.
- **The same six knobs on every drum:** Tune, Decay, Tone, Snap, Drive, Level.
  - They act the same on a synthesized voice, a kit family's one-shot or your own sample.
  - The voice's own knobs sit under them.
  - The kick has a **kick designer** (sweep, sweep time, click tone, sub) and **Key track**, which tunes the body to the track's root.
  - `tools/drum_knobs_test.cjs` measures each knob on four parts of the synthesized kit and three parts of a 909-style family.
- **One honest note:** a kit family's one-shot cannot ring longer than it was made, so its Decay only shortens.

## Bass
- A brush of the chord-relative tokens.
- An **accent lane** (`bass.accents`): accented notes open the filter further, like a 303 accent.
- Tools: shift, mutate, thin, octaves, **Answer bar** and **Lock to kick**.
- A library of 14 styles: rolling, offbeat, gallop, octave bounce, acid, dembow, walking, sub drone, reese, 808 glide, and more.

## Chords
- Chord rhythms can now be shifted, mutated and answered.
- **Between the bass:** stabs leave the bass's notes alone and answer them on the next 8th.

## Octave (register)
- **Octave −2 … +2** for bass, chords, pad, lead and arp (EDIT · Sound).
- A note that would fall under the part's floor folds back up, so lowered chords open up instead of muddying the bass. The floors are:
  - chords and pad: E3;
  - lead: A2;
  - arp: C3;
  - bass: E1.
- A moved note gets a little brighter and louder per octave down (and the reverse per octave up), so the part keeps its timbre and level.
- The channel's high-pass opens for a lowered part.
- `tools/register_test.cjs`: level within ±2.5 dB at −1.
- Most basses already sit on their floor, so for them only +1 moves.

## The same knobs on every sound
- **Core knobs everywhere:** Cutoff, Reso, Env amount, Env decay, the envelope, Drive and Level now show on every synth model.
  - A model with no filter of its own uses its Tone filter.
  - A struck, additive or granular engine switches its 12 dB filter on when Cutoff is turned.
  - The eleven classic models that had no drive get a saturator after their tone filter, in both JS and WASM (bit-identical).
- `tools/knob_test.cjs`: 800 of the 800 knobs shown act on the sound.

## My library and set prep (SET)
- **Save** on a deck, or Save deck A / B, keeps the track with every edit, its Mangle and its hot cues (in this browser, IndexedDB).
- Each track has a rating, tags and notes. Search, filter by family, and sort by BPM, key (Camelot) or rating.
- **Playlists in order** show how each pair of tracks meets: key steps and tempo.
- **Play set** puts the first two tracks on the decks, and Auto-DJ mixes the list in order instead of composing.
- **Backup / Restore** writes the whole library to one file and reads it back.
- `tools/library_ui_test.cjs`.

## Your sound — FORGE learns its user (SET)
- **The mood you pick stays** on every new track — yours or Auto-DJ's — until you pick another one or Genre.
- **Sounds and knob moves are learned:**
  - The sounds you choose, and your knob moves (brighter or darker, cleaner or dirtier), become weights on the sound bank's tags and on the sounds themselves.
  - A new track's palette leans that way in any genre.
  - Measured: "warm" sounds 51 % → 78 % of deep-house picks when leaned to.
- **Tracks you keep and skip are learned:**
  - Tracks you keep (saved, or played past 60 %) pull Auto-DJ's next genre toward them.
  - Tracks you skip push it away.
- **Mixes and effects lean your way:** the mix styles you choose by hand lean the mixes, and the Mangle recipes and Beat FX you use lean the FX screen.
- **Recent lessons count most:** every lesson decays the older ones a little.
- **SET · Your sound** shows what was learned. You can forget one thing, pause learning, or reset everything.
- With nothing learned, every palette picks exactly as in 9.4.
- `tools/taste_test.cjs`, `tools/taste_ui_test.cjs`.

## UI
- The editor fits half a wide window (container queries): it used to overflow at 1280 px.
- New on the start card: what's new in 9.5.

## Not in 9.5
- No new presets: there are still 403. They all have the core knobs now.
- MIDI export, the regular-effects pass and per-note bends move to 9.6.
- The 9.5 sounds — transitions, Mangle and the rebuilt candy — were tested for level, clicks, timing and key. They were **not** judged by ear. The preview pack exists for that judgement.

## Found and fixed by the release gate
- **The glitch counter was blind on current Chrome.** Chrome renamed the sound card's counter, from `AudioContext.playoutStats` (`fallbackFramesEvents`) to `AudioContext.playbackStats` (`underrunEvents`), and Chrome 153 has only the new name. 9.2–9.4 read only the old name, which caused three things:
  - On a current Chrome, the Live engine counted no dropouts: the status line, the glitch watch and the Report all said nothing.
  - The `health` failure that 9.2–9.4 put down to "this sandbox's browser" was this bug.
  - The `startup` and `jumps` tests passed without measuring anything.
  
  FORGE now reads both names. With the counter working, the real-time tests in this sandbox count dropouts for the first time (see the gate results below).
- **The plucked string's level depended on luck.** The pluck2 engine started each note from a burst of noise. Over one period of a high note, that burst gives a fundamental of random strength: two plucks of the same note differed by up to 7 dB (5th–95th percentile), and a whole track's level depended on the noise drawn before it. In the sound bank test, Muted string measured −1.2 LU alone and −3.6 LU after the other 400 presets.
  - A note now starts from the string's shape when it is let go: a triangle peaking at the pick position, plus a little noise for the pick, smoothed by Bright. The same note now varies by under 0.3 dB, and Muted string measures −1.2 / −1.3 LU wherever it runs.
  - The 13 plucked sounds' level table was re-measured (`tools/preset_gain.cjs` can now re-measure named sounds only).
- **The first transition of a set could block the audio thread.** The warm-up now runs every transition recipe once before anything plays. The browser certification had measured 72–85 ms blocks at the drops of UK garage and lofi; re-run, they measure 3–5 ms.
- **The Mangle panel forced a layout on every track load:** it measured its touch pad to place the dot, which cost 93 ms on a 3× slowed CPU. The dot is now placed in percent, and a load re-renders the panel only for the deck it shows.

## Tests
- New: `riser_test`, `mangle_test`, `drum_knobs_test`, `register_test`, `candy_test`, `taste_test`, `library_ui_test` and `taste_ui_test`. All of them are in `tools/ci.cjs`.
- The release gate results are below.

## Release gate
`node tools/ci.cjs --gate` on the final tree, in a 2-core cloud sandbox with a headless Chromium 153. It ran in three parts, because one command may run for at most 2 hours.

**This sandbox's sound device:**
- It is a headless sink whose clock runs 4.4 % off the computer's (the self-check page measured −43 844 ppm). It is not a sound card.
- Since the glitch-counter fix, the real-time tests count its under-runs as dropouts. Earlier gates could not see them at all.
- So these results are the first in which the soaks, the certification and the self-check judge dropouts in this sandbox. Their failures are reported as they came. The tests' limits are unchanged.

**Engine and score — 31 of 31 pass:**
- Score round trip and fuzz; timing; live control; engine flows; FX; cue; rhythm statistics; Beat FX.
- Transition styles and Auto-DJ variety: 8.2 different styles per 10 mixes.
- Forms; the new tests for risers, Mangle, drum knobs, register, candy and taste; MP3.
- **The sound bank:** all 403 presets level-matched and clean, Muted string included.
- Tuning: 732 notes, worst 4.75 cents.
- Live command blocks; motion; knobs: 800 of 800 act.
- True peak: worst −1.15 dBTP.
- WebAssembly bit-identical; genre signatures; dead code; controls.
- CPU inside the budget.

**Browser — 25 of 30 pass:**
- **Pass:**
  - startup: 1 of 4 starts glitched, against an allowed 2;
  - jumps: 0 of 10;
  - layout; export (WAV, stems, MP3); MIDI clock; phase lock;
  - health: the forced overload is now counted, 89 glitches;
  - the UI suites: browser, flows, dock, live, perform, library, taste, shell, Ask, Auto, Auto moves, hosted, AI models, offline;
  - stall; MIDI quality; the self-check page;
  - **the 10-minute soak: clean.**
- **✗ liveset:** the longest main-thread task was 160 ms, against a 100 ms limit, with 0 dropouts. This is the weak-machine test: the CPU is made 3× slower and 2 busy processes run beside it.
  - Here the 9.4 build measured 171, 201 and 127 ms, and 9.5 measured 294, 111, 225 and 160 ms. Both builds fail this test in this sandbox; 9.4 passed it in its own sandbox at 61 ms.
  - The one cost 9.5 added on a track load (the Mangle panel, 93 ms) is fixed above.
- **✗ soak (4 minutes):** one dropout, 3 quanta, at 101 s.
- **✗ soak-fallback (3 minutes):** one dropout, 1 quantum, at 19 s.
- **✗ capture:** in the Live · fast engine, the audio thread's frame counter skipped twice. The captured audio is clean: no silence, no replayed buffer, 0 dropouts. Live and Stable passed, and the run before passed all three.
- **✗ cert:** 4 of 66 sections fail.
  - techno, progressive house and hard techno failed on 1–3 dropouts, with audio blocks of at most 6 ms.
  - trance failed on a 58 ms block and 4 dropouts.
  - The failing genres change from run to run: a run on a quiet machine had 1 failure (jersey club, 58 ms), and the genres that failed alone passed 3 times in a row.
