# DJ TiTo 10.1 — what changed after the 10.0 listening

The review of 10.0, in your words:
- the sound was still hard to digest — harsh highs, too loud and squashed, too busy, cheap sounds;
- the mix carve made no difference you could hear;
- the FX need to be better, and the ones you didn't like must go;
- the atmosphere could not be controlled;
- muting and soloing the channels was clumsy.

## Master: Clean by default
- **The clips you heard used the Club master.** It drives every genre's drop into its limiter: measured on six genres, the drops kept only 5.6–7.3 dB between their peaks and their average loudness (PLR). That is squashed, and the clipping adds harmonics that tire the ear.
- **Clean is now the default.** It sits 4 dB under the genre's target into the limiter, and the same drops keep 8.6–10.5 dB.
- The choice (Club · Balanced · Clean · Home) is now in **SET · Session**. It used to be at the bottom of SET. Exports follow it.
- A choice saved by 10.0 is not carried over: everyone starts on Clean.

## Smooth: the tiring top end
- **What carries it, measured per part on the drops:**
  - the clap/snare: 54–71 % of the 2.5–8 kHz band in house, tech house, afro house and drum & bass;
  - the hats: 64–89 % of 8–16 kHz;
  - in trance, the supersaw chords: 68 % of the presence band.
- **Smooth** is a gentle static EQ on those parts:
  - clap/snare −3 dB at 3.6 kHz and −2.5 dB above 6.5 kHz;
  - hats −2 dB above 9 kHz;
  - chords −2.5 dB at 3.3 kHz and −1.5 dB above 7 kHz;
  - arp −1.5 dB above 8.5 kHz.
- A **Smooth** knob on MIX · Deck sound sets how much (0 = the 10.0 sound). It is learned like the other deck-sound knobs.

## Less busy
- In drops the pad plays at 0.4 instead of 0.6: it is the bed under the chords, lead and arp, not a fourth voice in the middle.

## Channels (MIX)
- Every part that plays, and the FX and the atmosphere, each with:
  - **M** (mute);
  - **S** (solo — several at once);
  - **◎** (solo this part alone; again to clear);
  - a level fader with its dB.
- Solo groups: Drums · Bass · Music · FX · Atmos. **Clear solo** brings everything back and keeps your own mutes.
- On the PLAY deck, a tap still mutes a part, and **holding it solos it alone**.
- A part's level is the same one EDIT · Mix shows, and it is learned like before.

## Atmosphere (FX)
- Choose the background under the track: the track's own, none, vinyl, air, dark, psy or rain.
- Its **level** (0–2) and its **tone** (dark ↔ bright).
- A track without an atmosphere of its own gets a steady bed of the one you choose. None silences a track's own.
- The choice is kept in the track (`fx.atmos`), so a library track brings it back.

## Ear candy (FX)
- **Six new minimal-techno sounds**, all in key, on the grid and into the candy echo:
  - **Blip:** tiny FM dots;
  - **Sonar:** a pitched ping with a long soft tail;
  - **Click:** a woody tuned tick;
  - **Dub stab:** a filtered chord stab left to the echo;
  - **Drop:** water drops;
  - **Glitch:** an accelerating micro-stutter.
  
  They sit 1–3 dB under Bubbles' level, with peaks no higher.
- Techno, house, chill and afro tracks now use them. Techno's candy used to be Glass, Ping and Acid.
- **The Ear candy panel** (both decks, remembered in this browser):
  - every kind on or off. A kind switched off is replaced by one that is on, in the same place;
  - candy level and density;
  - **risers and impacts** on or off, with their level.
- **By default:** Bubbles and the six minimal sounds are on; Glass, Harp, Wind, Acid and Ping are off.

## Tests
- `tools/control_test.cjs` (engine) checks:
  - candy kinds are replaced when switched off; density 0 plays none; transitions off keeps the candy;
  - each minimal sound is in key, has no clicks, and its level and peak sit against Bubbles';
  - the atmosphere plays where the track has none, level 2 is 6 dB over level 1, the dark tone takes the top off, and None silences it.
- `tools/control_ui_test.cjs` (browser) checks:
  - solo on two parts, solo alone, the Drums group, Clear keeping your mute, and the fader;
  - hold-to-solo on PLAY;
  - candy and transitions sent to both decks and remembered;
  - the atmosphere sent, kept in the track, and brought back from the library.
- `tools/bank_test.cjs` now starts every render from the same noise. Chords/fm-epiano measured +3.7 LU after 300 other presets and +2.5 LU alone.
- `tools/listen_v101.cjs` makes the listening pack. The master pairs are level-matched (the 10.0 clip turned down after its master, so its squash stays).
- `tools/ai_models_test.cjs` expected the validator's old tempo text (60…200). The validator says 50…220 since 10.0; the test now expects that, word for word as before.

## The 10.1 gate (this sandbox, headless Chromium)
- **Engine and sound (34 steps):** all pass. Bank 403 presets; the signature sounds; true peak −1.14 dBTP.
- **Browser (31 steps):** 30 pass, including startup (0 dropouts in 4), jumps (0 in 10), every UI test (channels, candy, atmosphere, library, taste, perform), soak, soak-long (10 min), soak-fallback, capture, MIDI, self-check and certification (every genre plays every part it writes).
- **One fails: liveset.** One dropout in 24 live actions (a reroll, with a 186 ms main-thread task) under 3× CPU emulation on two busy cores. 9.4 fails this step the same way in this sandbox, so it says more about the sandbox than about 10.1. It is reported as failing, not skipped.
- ai-models failed on the first run (the test's old tempo text, above) and passes after the fix.
- **Audio audits:**
  - `audio` (33 renders against ffmpeg) passes: meters within 0.19 LU, highest true peak −1.10 dBTP, the pulse at 100 % of the tempo in 32 of 33. Five ungraded warnings, one more than 10.0: deep house's whole-mix pitch classes match its notes a little more loosely (r 0.51 → 0.45).
  - **✗ `audio-parts`: 9 of 33 tracks.** The same 9 as in 9.4, 9.5 and 10.0, for the reason given in 9.4: colored timbres whose 3rd or 5th harmonic reads stronger than the audit's model of a note. Their scores are equal or better than 10.0's (lofi chords 0.27 → 0.43, electro lead 0.52 → 0.57).
  - Ungraded measures (timbre, stabs, voicing, dialogue, texture, arrangement, balance) ran. Balance: drops from −12.2 to −7.0 LUFS track to track (10.0: −12.0 to −7.0).

# DJ TiTo 10 — what changed

FORGE is now **DJ TiTo**. Version 10 answers the review of 9.5. The asks were:
- a better interface;
- more intelligence;
- better sounds;
- effects that work on every part at once;
- a cleaner, less crowded mix with a stronger root;
- producer's tricks;
- learning the user further;
- fixing logic where features collide;
- wider limits;
- the files delivered.

## The name
- The app, the window title, the Android app, its icon (a T and the cue dot), exported files and the release now say DJ TiTo:
  - `DJ-TiTo-<track>.wav / .mp3`, `DJ-TiTo-set-….json`, `DJ-TiTo-library-….json`;
  - `dist/DJ-TiTo.html`;
  - `DJ-TiTo.apk`.
- Your saved library, what DJ TiTo learned about you, and set files from 9.2 on keep loading:
  - the storage keys and file formats are unchanged;
  - `FORGE.html` is still built for old links;
  - the score format keeps its name.

## SET, in the order you use it
1. **Session:** ● Rec, Set (save or load a set file), Cue, Controller, Safe, Perform, Audio.
2. **My library and its playlists.**
3. **Styles** (the genre library).
4. **New tracks:** Ask and the track length.
5. **Your sound.**
6. The telemetry.

## Effects on every part at once
- 9.5 had one part-effect unit per deck: a Beat FX or Mangle set on the chords was taken off the bass. Now the whole deck and every part have their own Beat FX and their own Mangle, each keeping its own settings.
- On the FX screen, a row of part chips picks the part you edit. A lit dot shows every part with effects running.
- **All off** clears a deck, on every part.
- **Safe** clears every part's Beat FX and Mangle. 9.5's Safe left a part's Beat FX on while the panel showed it off.
- Repeat and Tape act on the whole deck only, as before; their chips say so.
- A track keeps every part's Mangle (`fx.mangles`). The 9.5 single unit (`fx.mangle`) still loads.
- Engine: a unit is made the first time a part gets an effect (about 1 ms). `tools/partfx_test.cjs` checks it:
  - a delay on the bass and a reverb on the chords run together;
  - each part is changed by its own effect only;
  - one part's effect switched off leaves the other on;
  - three Mangle units run together;
  - the 9.5 messages still work.

## A cleaner mix: the parts make room for each other (Space)
- **What was crowded:** a new audit, `tools/mix_audit.cjs`, measured how crowded the mix is. In each drop it counts the third-octave cells where two parts are loud and within 6 dB of each other, so neither is heard clearly.
  - The chords sat on everything: chords/lead, chords/arp, chords/pad and bass/chords were the worst pairs.
  - Synthwave (47 %) and melodic techno (33 %) were the most crowded.
- **The carve:** a dynamic EQ on each deck, the way a mix engineer would set it up. A part is dipped around the frequencies another part needs, and only while that part plays. When it rests, the dipped part comes back whole.
  - chords under the lead and the arp (1.8 kHz) and around the arp's body (900 Hz);
  - the pad under the lead, the arp and the chords (1.5 kHz);
  - the chords' and the pad's low-mids out of the bass's way (230–260 Hz);
  - the arp under the lead's presence (2.6 kHz);
  - the snare's body through the chords and the bass;
  - **the bass's sub under each kick, as a low shelf that lets go quickly.** The kick's fundamental gets through and the bass keeps its body and growl: a split, not a duck.
- **Measured on 24 drops (12 genres × 2):**

  | Measure | 9.5 | 10 |
  | --- | --- | --- |
  | Masked energy between parts | 17.8 % | 11.5 % |
  | Low-mids (250–500 Hz) | −10.4 dB of the mix | −11.1 dB |
  | Bass sub in the 40 ms after a kick | −6.4 dB | −8.2 dB |
  | Low end, share of the energy | 63 % | 65 % |

- **Space knob** on MIX · Deck sound: 0 is the 9.5 mix, 1 the full carve (the default). A track keeps its setting (`mix.carve`).
- The carve takes 0.3–0.5 LU off a drop: it removes energy where parts collided. The genres' gain calibration was left as it was.
  - A master-only recalibration was tried and rolled back. It wanted +2 to +2.5 dB on some genres: tech house, hard techno, breakbeat, drum & bass, dubstep. That would drive their limiters harder, the opposite of a cleaner mix.
  - The "before" clips in the listening pack are a little louder: compare them by ear, not by level.
- `tools/carve_test.cjs` checks:
  - Space 0 renders exactly the 9.5 mix;
  - a part is untouched while nothing it makes room for plays;
  - no new clicks;
  - loudness and true peak;
  - the crowding, low-mid and kick/bass numbers above.

## Cleaner synths
- **No more aliasing on high FM notes.** The 4-operator FM engine now scales its modulation indices by pitch, the way a DX7 does:
  - Carson's rule is applied per modulator and per cascade, and the feedback is held under the band edge;
  - low and middle notes are unchanged;
  - measured against a 192 kHz render of the same note, up to 100 dB of folded-back junk is gone on presets like Glass lead, DX brass and the tine sounds.
- **The grain engine's texture is band-limited** (PolyBLEP saws). Its naive saws folded back into hash on high notes.
- **Every voice's sub is mono:** the stereo part of a voice is high-passed at 150 Hz (12 dB/octave). Unison and two-oscillator spreads put the fundamental in the side channel. One bass measured −0.46 correlation under 150 Hz, and the mono sum a club system plays cancelled its sub. Now 63 of 64 basses are above 0.9.
- `tools/sound_audit.cjs` measures every preset for aliasing, fizz, mud, dullness, width and stereo lows.

## Production tricks
- **Breakdowns breathe.** In trance, progressive house and melodic techno, the pads keep pumping on the beat with no kick. This ghost sidechain grows from half to 80 % of the kick's depth over the breakdown, so the pulse of the drop is felt before the drums return.
- **The bass steps out before the drop.** In house, techno, trance, psy, bass music, garage and hard styles, two builds in three drop the bass for their last two beats. The drop's first bass note lands into the gap.
- These join the tricks already in the composer: false drops, kick mutes, layered risers in key, echo freezes, tape stops and stutters into breakdowns, a re-harmonised second drop, and an octave-doubled lead in the last drop.

## DJ TiTo learns more of you
- **Deck sound:** how far you move Reverb, Delay, Pump, Heat, Punch or Space from a genre's own setting is remembered. Recent moves count most. New tracks, by hand or from Auto-DJ, start at 70 % of that.
- **Part levels:** a part you keep turning up or down on EDIT · Mix starts the next track that way, at 70 %. A track from your library or a set plays as saved.
- **♥ More / Less** on every deck: a strong lesson on the track that is playing (its genre, its sounds, its mood).
- SET · Your sound shows the deck-sound and part-level lessons; ✕ forgets any of them.

## Logic: where features collided
- **Safe** now clears every part's Beat FX and Mangle (see above).
- **A prepared track is not re-composed under you.** A library track loaded on a deck whose Auto variations are on pauses them, and Auto brings them back. Before, a prepared set could be rewritten while it played.
- A Mangle recipe that belongs on one part (Tuned drums, Bell arp, Talkbox, Yoy bass) goes to that part's own unit. The deck's own Mangle keeps playing, where 9.5 moved the deck's unit away.
- PLAY: the transport bar is opaque under its own rows. The Next mix row read through onto the deck's controls.

## Wider limits
- Tempo: 50–220 BPM, in 0.1 steps. It was 60–200 in 0.5 steps. Score files accept the same range.
- A part's Level: up to +6 dB (it was +3.5).

## Files
The APK, the HTML and these notes are attached in the conversation. The listening pack is described in `docs/LISTEN.txt`.
