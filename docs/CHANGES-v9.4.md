# FORGE 9.4 — what changed

9.4 answers the complaints about 9.3: too many sounds alike; the same structures, the same riser every time; tracks too short; no way to keep one track going; no MP3. Most of the work went into the sounds.

## Sounds
- **Eight new synthesis engines** (FORGE's own code, `src/engine/03x_engines.js`):
  - **4-operator FM** with eight algorithms and feedback.
  - **Phase distortion** (CZ-style saw, square and resonant waves).
  - **Additive** (eight partials with tilt, odd/even, formant, shimmer, stretch).
  - **Struck / modal** (eight materials: marimba, vibes, glass, bell, kalimba, wood, steel, tube).
  - **Granular** (a cloud of grains over a texture rendered for each note).
  - **Hyper saw** (nine drifting saws in two stereo layers, with an octave layer).
  - **Two-oscillator analog** (saw, square, triangle or sine, with hard sync, ring and cross modulation).
  - **Plucked string** (with a pick position and a resonant body).

  Each engine can use one of **seven filters**: ladder, 12 dB, MS-20-style, SEM-style morph (low-pass → notch → high-pass), diode, band-pass, formant. Each can use one of **five drives**: soft, tape, fold, crush, tube. They all go through the same envelopes, glide, LFOs and velocity as the older models. They render in JavaScript (the WebAssembly voice keeps the 25 older models), and their per-voice cost is in the same range as the older models in JavaScript.
- **403 presets** (9.3: 130).
  - **Melodic:** 290 (lead 81, bass 64, chords 60, pad 49, arp 60).
  - **Drums:** 89 (kick 30, snare 23, hats 22, percussion 14).
  - 273 of them are new. Every preset is tagged by character (bright, warm, glassy, acid, organic, …) and by the genre families it suits.
  - All of them render finite and DC-free, and every melodic preset plays in tune: `tools/pitch_test.cjs`, 732 sustained notes, worst error 4.75 cents, none outside ±5 cents. Getting there meant retuning the inharmonic designs: the FM bells moved to whole-number ratios; glass, bell and tube got quieter or harmonic upper modes; the ring and cross-mod voices sit an octave and a fifth apart instead of a fifth; small detunes now spread both oscillators around the note.
- **Every bass keeps its low end.** Measured before release: the plucked, phase-distortion, hyper-saw and FM-4 basses had their fundamental 14–42 dB under the note, and the drops of afro house, reggaeton, moombahton and UK drill fell 8–11 dB under the modern-master curve at 63 Hz. The new engines now have a sine on the fundamental (inverted for an FM carrier whose index turns its fundamental over); seventeen basses use it; the upright pluck, the FM slap and the crushed bass left the styles they did not belong in (the 808 styles, reggaeton, moombahton). Over 116 drops of new tracks (29 genres × 4 seeds, `tools/lowend_scan.cjs`), the low octaves sit at −2.4 dB median against the modern-master curve (9.3: −1.6 dB), and 4 drops are more than 7 dB under it (9.3: 3; the FM slap in tech house, the FM reese in techno, −8.8 dB each). `tools/signature_test.cjs` now checks that every bass preset (64) keeps at least −12 dB of its note's power at its fundamental (weakest: −11.5 dB, the band-pass bass, by design), and the tonal balance of all 33 genres is inside ±7 dB again.
- **Parts play the notes they were written in.** Found by the part audit before release: every track's kits get a small per-track variation (±6 %), and in 9.4 it also reached the new engines' operator ratios, algorithm, oscillator and filter switches — an FM carrier at 0.94 put a whole part a semitone flat, and an algorithm of 0.97 became another algorithm. These (and the 9.3 wavetable's table, filter type and unison count) are no longer varied. Six of the audit's 15 failing tracks were a semitone flat; none is now.
- **Every melodic preset reads at its own pitch class.** 24 of 250 sounded, one note at a time, closer to another pitch class than their own (an FM bell chord a minor seventh off; folded, cross-modulated, resonant and band-passed voices a fifth or a third off — their 3rd or 5th harmonic over the note). Each got a sine on its fundamental (or a gentler fold or index); `tools/signature_test.cjs` checks all 250. Six 9.3 voices whose vowel, breath or scream is the sound (choir, vocal pad, breath pad, psy glass, psy scream ×2) are reported, not graded. The FM 808 dives a fifth on its attack instead of an octave (its short notes read 2 semitones sharp).
- **Every track gets its own sounds.**
  - Each melodic part takes a sound from its genre's palette: lead, chords, pad and arp 80 % of the time, bass 60 %. 9.3 did this half the time, from palettes of 3–7 sounds.
  - A track leans towards one character (organic, analog, digital, airy, dark or bright).
  - Two parts avoid the same engine, and avoid two bright voices in one register.
  - Every pick is varied for its track (`varyKit`: cutoff, decay, FM index, grain, body…). Its level is matched in context, as before.
  - Measured with `tools/timbre_diversity.cjs` on 12 genres × 6 tracks: the mean spectral-shape distance between two tracks of the same genre went from **6.8 dB (9.3) to 9.8 dB**.
- **Six new drum kit families:** CR-78-style, minimal, industrial, vintage break, trap and garage, 12 in all. Each is built on an older family's voices and then re-voiced. About half the tracks of a genre now play one of the families that also suit it.
- **32 percussion instruments** (9.3: 16): surdo, tabla, udu, frame drum, finger snap, temple block, cuica, hand bell, gong, metal pipe, click, zap, blip, noise sweep, cabasa and log drum, each level-trimmed against the older ones. A track may swap a percussion voice for one of its family (organic or machine).
- **EDIT · Sound:**
  - The new engines have a **Character** row: algorithm / wave / material / oscillators, then filter type and drive type, then their own knobs.
  - The preset grid has a **character filter** (fits this genre, new in 9.4, and the bank's most common characters).
  - Each card shows its engine and character.

## Structure
- **Forms from a grammar, not 12 templates.** Each track draws its own form from its style's grammar:
  - how it opens (a DJ intro of drums, or straight into the groove);
  - how many drops it has (1–3), and how each one is reached:
    - a breakdown and a build;
    - a breakdown straight into the drop;
    - a lift out of the groove;
    - a long trance breakdown;
    - a peak section after a short break;
    - a **false drop** that brings in the hook and the harmony without kick and bass, then builds again.
  - what comes between the drops, and how it comes down before the outro.

  Over 20 tracks per genre, 19–20 forms are different in every genre.
- **Lengths:** **Radio** (about 3–4½ minutes; about 3 for the pop-length styles), **Club** (the default: 6–8 minutes for house and techno, 7–9 for psytrance, 5–6.5 for drum & bass), **Extended** (about 1.4× Club). Choose it under SET → "New tracks".
- **Builds are no longer all alike.** Each build combines:
  - a drum shape: the classic roll, a late roll over a running groove, a kick roll, a clap build, a tom run, half-time drums, or no drums;
  - an effect: noise riser, pitched rise, noise sweep, reverse cymbal, swirl, zap, or none;
  - an ending: a beat repeat (1/8 → 1/32), a tape stop, an echo throw (over the last half bar or the last beat), a snare roll into the line, half a beat of silence, a full beat of air, or a straight cut.

  No track repeats a combination or uses the same shape or effect twice in a row, and the noise riser is under **at most every other build: 49 % of 1116 builds** measured (20 Club tracks of every genre, `tools/form_test.cjs`). Breakdowns are entered as many ways (downlifter, crash, sweep or a dry cut, after an echo freeze, a tape stop, a stutter or nothing). A breakdown that goes straight into its drop ends on a fill, a reverse cymbal, half a beat of air, or nothing.
- **A second melodic voice (LEAD 2).** Where a genre has no arpeggio or hook of its own, a track may add one:
  - an **answer** that speaks in the lead's rests (call and response);
  - a **counter-line** below the lead in longer notes;
  - or, where the genre has no lead, a **motif** over the drop.

  Its sound comes from the palette on an engine the lead does not use. Its level is set in context, 6 dB under the line it accompanies (8 dB for an answer, 3 dB for a motif), and it follows when that line's level is refined. 84 of 198 tracks measured carry one.
- **A top percussion loop:** one or two light voices on a euclidean rhythm in the drops (organic or machine, by family), in 117 of 198 tracks.
- **Grooves:**
  - **The house piano push.** A stab rhythm that already plays in the bar's last beat (all three house rhythms do) never anticipated a chord change in 9.3. Its last hit, when it falls an 8th or a 16th before the bar, now carries the new chord as often as the genre family pushes (`tools/rhythm_stats.cjs`: house 33.5 % of changes anticipated, deep house 52 %, tech house 64 %).
  - **Broken grooves** (2-step, drum & bass, breaks…): three tracks in four get the drummer's ghost hats (9.3: half). Two tracks of UK garage share their first drop bar less often: 0.55 % of pairs over 200 tracks (9.3: 0.71 %).
- **Extend · Ride · Endless** (PLAY, under the transport). The deck keeps playing the same track, longer, with no transition:
  - **Extend** adds one more act after the drop that is playing or coming, so a build is never cut off from its drop (with no drop ahead: after the section that is playing; in the outro: the outro is cut at its next 4-bar line, then a new act and a fresh outro).
  - **Ride** carries the playing section on (in a build: the drop it leads to).
  - **Endless** adds an act whenever the track reaches its last drop.

  The continuation comes from the track's own seed, sounds and ideas, and swaps in on the next 4-bar line. The form stays written in the score, so a saved set keeps the longer track.

## Export and recording
- **MP3 320 kbit/s, FORGE's own encoder.** MPEG-1 Layer III in C (`src/wasm/mp3enc.c`), built to WebAssembly (`tools/mp3_build.cjs`, 67 KB). It has:
  - the ISO polyphase filterbank;
  - the hybrid MDCT with long, start, short and stop blocks (window switching on transients);
  - alias reduction;
  - a psychoacoustic threshold per scalefactor band;
  - the rate and distortion loops;
  - Huffman coding with the best table per region and the best region split;
  - mid/side joint stereo;
  - the bit reservoir.

  The tables the standard defines (the Huffman codes and the window) were read from the system's MP3 libraries by `tools/mp3_tables.py`, which checks each code table is complete and prefix-free.
  - **Quality** (`tools/mp3_test.cjs`, against libmp3lame 320k on the same files): music SNR 39.4 / 34.3 / 33.0 dB against LAME's 38.4 / 34.6 / 32.8. Drum-like transients: 30.3 dB with pre-echo −39.8 dB, against LAME's 17.9 dB / −33.9 dB. Sines: 79.0 dB against 78.3. ffmpeg decodes every file without a warning.
  - **Speed:** about 15–25× real time in V8.
  - **No gapless tag:** the file carries the usual MP3 decoder delay (1057 samples, 24 ms at 44.1 kHz, of silence at the start).
- **WAV is now 24-bit** (TPDF dither at the 24th bit). Stems stay 32-bit float.
- The deck has an **MP3** button next to WAV and Stems.
- **The set recording is MP3 320.** The master is taken sample by sample from the engine's output (a tap worklet) and encoded on the composer thread as the set plays, so the file is ready when you stop and only the MP3 is held in memory. It falls back to the browser's Opus recorder.

## Not done (from the approved plan)
- **Two new mixer channels.** LEAD 2 plays on the existing arp channel (genres that have their own arp keep it and get no LEAD 2), and the top loop plays on the percussion bus. A new channel touches the mixer, the calibration of 33 genres, the stems, the editor and the transitions, so I chose the safer route for the same musical result.
- **Master chain.** Measured on 9.4 renders: true peak −1.2 dBTP (target ≤ −1), loudness −7.6 to −9.6 LUFS integrated at club level. The planned 3-band glue and exciter were not added: the stems export replays the master's gain curve so the stems add up to the mix, and a multiband stage cannot be replayed that way.
- **FLAC** (last in the plan's cut order).
- **Key changes inside a track** (part of long-form evolution).

## Faster
- **The deck map** (sections, ruler, chord lane) is drawn once per track and size and copied each frame; only the playhead, loop and played shade are drawn live. It was the main thread's biggest cost in a live set (Club tracks have twice the bars): 840 ms of main-thread time per 90 s of a stress set → 149 ms.

## Known limits
- The new engines render in JavaScript, not WebAssembly. On a slow phone, ECO mode thins the additive (4 partials) and hyper-saw (3 saws) voices.
- MP3 files have no gapless tag (see above). Extend swaps in on the next 4-bar line; the few bars left of the section that is playing may change slightly at that line (a fill or a variation leading into the new act).
- Exports take longer because tracks are longer: a Club track is 6–8 minutes, and its stems are six passes over it (render speed per second of music is unchanged: 5.6× real time against 9.3's 5.8× in the same test). `tools/export_test.cjs` now waits in proportion to the track's length, at the ratio its fixed waits were set for in 9.2 (a 280 s track), instead of a fixed 12 minutes for the stems.
- `tools/wav_audit.cjs` renders a section from far enough back to hear a chord held into it (it rendered 2 bars before, and an ambient chord held over 4 bars into a late entry came out as 433 ms of digital silence; the app plays the chord — measured in a continuous render).
- A build may now run straight into its drop with no gap (the "cut" ending). `tools/timing_test.cjs` checks each build at its own gap length (none, half a beat or a beat) instead of assuming half a beat.
