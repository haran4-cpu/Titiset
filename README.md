# FORGE — generative two-deck engine

A browser instrument for DJs, creators and listeners. Every track is composed from a **genre contract** (tempo window,
swing, drum grammar, bass grammar, harmony, arrangement form, sound kits, mix targets) and played by an AudioWorklet
engine that times every event to the sample. Two decks, phrase-aligned key-compatible mixing with a bass swap,
quantised jumps and loops, live re-composition (key / mode / progression / tempo / variation) on the next bar line.

## 9.5 in one paragraph
A library and a memory: save tracks with every edit, Mangle and hot cue, build playlists that show how each pair meets, and
Play set mixes them in order; FORGE learns your sound — the mood you pick stays, new tracks and Auto-DJ lean toward the sounds,
genres, mixes and effects you choose (SET · Your sound shows it all and forgets on request). 66 layered risers, drops and impacts
in key; ear candy rebuilt; Mangle, eight beat-locked sound-design engines on the FX screen; drums with ratchets, chance hits,
flams, lane feel and the same six knobs on every kit; bass accents and styles; Answer bar; Octave for every part; the same core
knobs on every synth. Details: docs/CHANGES-v9.5.md.

## 9.4 in one paragraph
Many more sounds: eight new synthesis engines (4-operator FM, phase distortion, additive, struck/modal, granular, hyper saw,
two-oscillator analog, plucked string) with seven filters and five drives, 403 presets tagged by character, six new drum kit
families and 32 percussion instruments; every track draws its own sounds, varied for it. Forms drawn from a grammar (false drops,
lifts, peaks; Radio / Club / Extended lengths, Club 6–8 minutes); builds that differ in drum shape, effect and ending; a second
melodic voice (answer, counter-line, motif) and a top percussion loop; Extend · Ride · Endless keep one track going on its deck.
MP3 320 export and set recording through FORGE's own encoder; 24-bit WAV. Details: docs/CHANGES-v9.4.md.

## 9.3 in one paragraph
Real drum kit families and your own samples; chords that push and lag against the kick instead of always landing on the one; a drum
skeleton of its own for every track; Beat FX (delay, dub echo, reverb, filter, roll, brake …) on a deck or one part, a Color FX knob;
ten transition styles chosen by Auto-DJ; a phone-first UI of five screens with one home per control (docs/UI-SPEC-v9.3.md); an
installable offline page and an Android WebView project (android/, .github/workflows/android.yml). Details: docs/CHANGES-v9.3.md.

## Layout
```
src/engine/00_core.js        constants, PRNG, fast sine, tanh, noise
src/engine/01_dsp.js         PolyBLEP, TPT SVF, ZDF ladder, RBJ biquad, FDN reverb (input HP), ping-pong, chorus, compressor (control-rate), true-peak limiter (min-hold + box)
src/engine/02_drums.js       kick (tempo-aware length), snare/clap/rim, 808-metal hats/shaker/ride/crash, percussion
src/engine/02b_wavetable.js  wavetable oscillator: frames (single cycles) the voice morphs through
src/engine/02c_drumbank.js   (9.3) drum kit families: one-shots rendered off the audio thread (808/909/707/Linn-style, acoustic, lo-fi), round robin, Tune/Decay/Tone/Snap, user samples
src/engine/03_synth.js       one voice type, 25 models; click-free hand-over (tail voices); tuned Karplus-Strong; envelopes fitted to harmonic rhythm
src/engine/03x_engines.js    (9.4) eight more engines (FM4, phase distortion, additive, modal, granular, hyper saw, two-osc analog, plucked string), seven filters, five drives — in JavaScript
src/engine/03v_wasm.js       the voice's inner loop as WebAssembly (src/wasm/voice.c → 03w_voice_wasm.js, generated), bit-identical to the JavaScript
src/engine/04_music.js       modes, roman-numeral parser, DIATONIC 7th/9th extension, voice leading, pattern DSL
src/engine/05_genres.js      genre bible part 1 (11 contracts)   05b_genres2.js  part 2 (22 contracts)
src/engine/06c_risers.js     (9.5) 66 layered transition recipes in key (risers, downlifters, sub drops, impacts, swells, washes)
src/engine/06d_mangle.js     (9.5) MANGLE: eight beat-locked, key-aware sound-design engines in two morphing slots
src/engine/06e_candy.js      (9.5) the ear candy rebuilt: Glass, Harp, Wind, Acid, Ping — phrases of the chord on the grid
src/engine/06_fx.js          riser / impact / downlifter / sweep / snare-up / reverse / crash; ear candy (zap, rise, bubbles, swirl, squelch, laser) with its own 3/16 echo; texture beds
src/engine/06b_motion.js     motion FX: the harmonic effects rack per deck (effects that know the chord)
src/engine/07_mix.js         deck mixer (HP per channel, kick-triggered pump, sends, ensemble, DJ EQ + filter), Beat FX / Color FX units (9.3), master (glue, mono lows, soft clip, limiter, BS.1770 meter)
src/engine/08_deck.js        score playback in musical steps (sample-accurate at any tempo), arrangement automation
src/engine/09_processor.js   Engine (2 decks, synced start, transitions, tempo glide, score swap, loudness servo) + AudioWorkletProcessor
src/engine/10_analysis.js    per-track loudness pre-analysis (auto-gain), runs in a Web Worker (light on Android: 16 kHz, one pass)
src/engine/11_bounce.js      a whole track to audio faster than real time (WAV / stems export: one mix pass records the master's gain moves,
                             each stem is replayed through them — float WAVs that add up to the mix), on the composer thread
src/engine/calibration.json  measured channel trims + master gain per genre (tools/calibrate.cjs)
src/host/engine_worker.js    Worker host of the Buffered (formerly Stable) engine: the DSP runs ahead of the audio clock
src/compose/composer.js      plan → score (struct-of-arrays events), hooks with a melodic grammar, bass grammar, chords/pad/arp/chop/seq roles, fills, builds
src/compose/spec.js          FORGE Score Format v1: validate (path + fix on every message) → compile → score; export any score back; melody text; lint
src/ui/                      English UI (index.html template, app.js decks/mixer/library, dock.js bottom editor, midi.js controller layer,
                             (9.5) mangle.js the Mangle panel · drums.js drum/bass/chord tools · mylib.js My library and set prep · taste.js Your sound
                             perform.js Perform view / hot cues / headphone cue / set save-load / recording (MP3), extend.js Extend · Ride · Endless, ai.js the Ask bar, ai_models.js the AI providers, style.css)
src/host/selfcheck.js        the hardware check (dist/selfcheck.html): a panel that plays one track on YOUR machine and measures it (see "Checking a real machine")
src/compose/bank.js          the sound bank: curated presets per slot (level-matched in context by spec.js); each track's own palette pick (character, engines, masking)
src/compose/bank2.js         (9.4) the 273 new presets, their character tags, genre fit, kit families per genre, per-track variation (varyKit)
src/compose/mp3.js           (9.4) MP3 320 joint-stereo encoder (src/wasm/mp3enc.c, FORGE's own, built by tools/mp3_build.cjs into mp3_wasm.js)
src/compose/part_ref.js …    generated measurements used by the composer and the editor (part_ref.js, model_params.js, preset_gain.js; see tools/)
docs/STRATEGY.md             where FORGE stands, the open space in the market, the five levers, what a release means
docs/NATIVE-ENGINE.md        plan: one Rust DSP core for WASM, native hardware and plug-ins, proven by the same test bed
docs/FORGE-SCORE.md          the score guide for people and AI models (the build appends a genre table generated from the live contracts)
songs/                       written songs in the score format (each passes `forge grade`)
tools/                       build, offline renderer, critic, calibration, verification, tuning test, set test, browser test, spectrogram
dist/FORGE.html              the whole app as one complete file — open this (index.html: the same page as a fragment for embedding; test.html: what the tests load)
package.json, CHANGES.md     version + dev dependencies; what changed in this build and what was checked
```

## Setup (dev tools only — the app itself has no dependencies)
```
npm install                          # acorn (the build's dead-code guard) + playwright (the browser tests)
npx playwright install chromium      # the browser binary for the browser tests (tested with Playwright 1.56.0, Node 22)
```
Also on the PATH: `python3` (local server), `clang` (only for tools/wasm_build.cjs), `ffmpeg` (only for tools/listen_pack.cjs).
There is no lockfile yet: run `npm install` once and commit `package-lock.json`.

## Run it
Three ways. The first two need nothing installed.

1. **Double-click `dist/FORGE.html`.** The whole app is that one file: a complete page (doctype, UTF-8, viewport), no server, works offline (the web fonts need a connection; without one a system font is used). Tested in Chromium (Chrome, Edge); Firefox and Safari are not tested. Opened from disk the engine is loaded from the page itself and the audio worklet from a `data:` URL (Chromium refuses a `blob:` module on a `file://` page). On Apple WebKit (iPhone, iPad, Safari) the audio context is unlocked inside the tap; a context that still does not run starts on the next tap.
2. **A local server:** `cd dist && python3 -m http.server`, then open http://localhost:8000/FORGE.html (next to `forge-worklet.js`, `forge-engine.js` and `forge-analysis.js` the page loads them as files, which a strict content policy allows).
3. **Hosted** — publish `dist/FORGE.html` (for example as a Claude page). Inside Claude the Ask bar can use Claude (the `sample` capability) and WAV, stems, reports and set saves go through the `downloads` capability (a `.wav` the viewer refuses is offered inside a `.zip`); everywhere else they are ordinary downloads. `dist/index.fragment.html` is the page without the `<html>` shell, for a host that supplies its own document.

`node tools/build.cjs` rebuilds `dist/` (needs `npm install` once, see Setup): `FORGE.html` = `index.html` = `test.html` (the complete page; `test.html` is the copy the suites load), `index.fragment.html`, `selfcheck.html` (the hardware-check page), and `forge-worklet.js`, `forge-analysis.js`, `forge-engine.js`.

**The engine for the set.** The start card asks what you are playing for: *a gig* (the biggest output buffer the browser gives — the steadiest audio on any machine; it asks the browser for a quarter-second buffer, so the knobs answer about 0.25 s later, more on some devices), *live* (balanced, ~70 ms) or *studio* (~30 ms, for a strong quiet machine). The same choice is in the header (Engine). With nothing chosen a set starts on the gig buffer: steadiness first. (For tight sync to an external MIDI clock, choose Live.)

**On Android** (phones and tablets) every choice runs the *Stable* engine: the sound is computed in its own thread ahead of time, and the audio thread only plays what is ready. Chrome's audio thread skips on Android with a large output buffer (the gig and balanced settings jumped there), and a small one leaves the sound engine too little time per callback on a phone. The choice sets how far ahead it renders — a gig 0.34 s, live 0.17 s, studio 0.085 s — which is also how much later the knobs answer. If the device still runs short of time, the engine thins itself step by step (channel character off, then supersaw / unison stacks thinned) and the header shows it.

**Version.** `package.json` holds the version (9.2.0). The start card, the page title and the Health report show it with a build id: a hash of everything the page is made of.

## Playing a set
- **Loading.** A track goes to the free deck. A load aimed at the only deck playing — from the library, the Ask bar, Perform view,
  the Score tab or a controller — is refused with a message: the deck on air is never replaced. Ask during a mix waits for the
  mix and loads on the deck it freed.
- **Mixing.** Press play on the idle deck while the other plays, or let Auto-DJ do it: the mix starts on the next phrase line of the
  running track (its own sections, not an absolute grid), the incoming track is cued so its first full section lands as the mix
  ends, the keys are matched on the Camelot wheel, and the bass swaps on a bar line — the first from the middle of the mix on where
  the incoming track plays bass. **Cancel mix** (the button under the crossfader, or Shift+Esc) calls it off: the outgoing track
  back to full, the incoming deck stopped. Esc (SAFE) and Auto-DJ off disarm a mix that has not started. A mix called off by hand
  also switches Auto-DJ off (it would arm another); the cued track stays, and Auto-DJ on mixes it in.
- **Auto-DJ** plans the set: a genre plays 2.35 tracks on average (one track 29 % of the time, rarely more than four), the set moves along an energy arc around where it started, its home
  style pulls it back, no A → B → A. The Journey (flow / family / same genre) is under the crossfader; each pick says why.
- **The set saves itself** (every 20 s while playing, and when the page is hidden); the start card offers to resume it.
- **On a phone or tablet** the mix strip keeps the crossfader, the deck faders, Auto-DJ and Cancel mix on screen.
- **Controllers.** MIDI learn on every control; relative encoders in two's complement, offset binary or sign-magnitude (per
  binding); targets include Cancel mix, tempo, sync, beat jump ±1 bar, loop halve / double and Load next.
- **Exports.** WAV of a whole track (about 5× faster than real time, in the background — the set keeps playing), or five 32-bit
  float stems (drums, bass, harmony, lead, FX) that add up to the mix; a stems export renders the track six times and takes about as
  long as the track.

## AI models (Ask bar)
The Ask bar understands the common words offline ("dreamy deep house at 122", "darker", "new bass", "go to the drop"). For anything else — a whole track described in words, *"a psytrance version of a song I love"*, a precise change — pick a model with ⚙:

| Provider | Cost | Notes |
|---|---|---|
| Claude (inside Claude) | your Claude plan | no key; only when FORGE runs as a Claude page |
| Google Gemini | free tier | a Google AI Studio key; default model `gemini-flash-latest`. The free daily quota is small on Flash and much larger on Flash-Lite (`gemini-flash-lite-latest`) |
| OpenRouter | free models | a free key; ids ending in `:free` cost nothing (OpenAI's open GPT models `openai/gpt-oss-120b:free`, Llama, Gemma, Qwen, GLM…) |
| Groq | free tier | a free key; very fast. Default `meta-llama/llama-4-scout-17b-16e-instruct`: the free tier's per-minute token limit is small, and the format guide FORGE sends is about 9,000 tokens — GPT-OSS on Groq needs its paid tier |
| OpenAI (GPT), Anthropic API, Mistral, Pollinations | paid / free tier / free credits | their own keys |
| Ollama, LM Studio | free, private | a model on your own computer (allow the page: `OLLAMA_ORIGINS=*`, LM Studio's CORS switch). Ollama is asked for a 24K-token context through its own API (its default would cut the format guide); in LM Studio load the model with 24K or more |
| Any OpenAI-compatible endpoint | — | base URL + key + model |

Keys are kept in this browser only (localStorage) and sent to nobody but their provider; the page talks to the provider directly. Opened as a file, every HTML file opened from disk shares that storage, so there keys last for the session unless you tick *Remember my keys on this computer anyway* (served from a folder or hosted, the page's storage is its own). **Test** (in ⚙) sends the full format guide, so a plan or a context too small for it shows there and not on your first track; a request that is too big, a rate limit, a refused key and a timeout are each reported in words. The model gets the score format card as its system prompt and answers with a score; a score the validator rejects goes back once with the validator's messages (path + fix), and whatever is still invalid is dropped by path before it plays. The model decides whether the words asked for a change of the playing track or a new track (which is mixed in on the next phrase).
**Versions of existing songs:** the model captures what makes a song recognisable as a style — tempo, key and mode, groove, chord progression, arrangement, sound palette, mood — and writes an *original* melody in its spirit; it never copies a protected melody, hook or lyric note for note (traditional and public-domain tunes may be quoted). Inside a Claude page Claude is built in, and the page may not be allowed to reach other providers; the downloaded `FORGE.html` reaches every provider.

## Writing music as text (people or AI models)
```
node tools/forge.cjs card                    # the guide to paste into any AI model (also: dock → Score → Copy AI prompt)
node tools/forge.cjs check songs/x.json      # errors with path + fix, warnings, musical lint (melody vs chords), summary
node tools/forge.cjs grade songs/x.json      # + render the peak section through the real engine, critic grades, mix balance vs the genre
node tools/forge.cjs wav songs/x.json out.wav
node tools/forge.cjs export techno 7         # any generated track as an editable score
```
In the app the bottom dock edits the same score live: Drums (step grid + kit), Bass (chord-relative tokens + sound),
Harmony (key, mode, progression, harmonic rhythm, tempo), Chords (rhythm, register, voicing, sound and space), Lead (role, melody text), Sound (every slot), FX (performance
pads, sends, room), Score (the JSON, check / apply / load / copy, written songs). Edits land on the next bar
(harmony on the next 4-bar line); sound and FX act instantly.

## Timing and writing (what is guaranteed, and how it is checked)
- Every event is written in musical steps (16ths) and played at `offset = (t − pos) · samplesPerStep`: on its own sample at any tempo. Swing is part of the written time: every event on an odd 16th carries the genre's swing offset (a snare roll of 32nds stays straight). `tools/timing_test.cjs` checks this over every genre.
- The composer holds a pad or chord to the next *voiced* chord and not past it, also across the forced turnaround chord of a build, and leaves the last two 16ths (half a beat) before a drop silent: no pitched note is still sounding in it and no drum or percussion hit starts inside it (`DROP_GAP` in `src/compose/composer.js`). Nothing sustained outlives its section.
- A quantised jump, a score swap and a scheduled command all land on their step inside the audio block that holds it. The scheduled command is `{ type: 'at', deck, atStep, list: [ …commands… ], rest?: 1, id? }`, held by the engine (`src/engine/09_processor.js`). Auto's three moves (filter sweep, echo throw, energy dip) and the snare-up of Build → Drop use it; before v8.7-fixed-7 the page timed them with `setTimeout` from the heard position, which landed them late by the output latency or the render-ahead (and by whatever the page was doing). A jump, seek, new track or held loop on that deck settles what was waiting (`rest` commands run at once, so nothing is left switched on or down; the others are dropped), SAFE does the same, and the engine reports every one as `{ type: 'at', how: 'ran' | 'settled' | 'dropped', … }`.
## Checking a real machine (what a cloud box cannot do)
Everything below runs headless; a sound card, a MIDI interface and an ear are not available there. `dist/selfcheck.html` is the same app with a measuring panel:
serve `dist/` (`python3 -m http.server 8000`), open `http://localhost:8000/selfcheck.html` in Chrome or Edge (not from a file: that runs the slower fallback engine), pick the engine, a track and 1, 3 or 10 minutes, press **Run**.
It plays on the real sound card and records: the engine and its latency (base, output, the app's estimate), sound-card dropouts (Chrome's playoutStats), DSP load, page stalls, the audio clock against the computer's clock (ppm), audio-context state changes, tab visibility, battery.
With a MIDI loopback (IAC Driver on a Mac, loopMIDI on Windows, or a cable from an output to an input) choose the pair: FORGE sends its clock out of one port and the page timestamps every tick on the other, the way a drum machine would see it — jitter, order, gaps and the tempo a receiver measures.
At the end it asks what you heard (clean / clicks / dropouts / distortion) and offers the whole report as text to copy or download (it never leaves the machine by itself). `node tools/selfcheck_test.cjs` drives the page headless with a fake loopback, so a bad number on your machine is the machine.

## Independent audio checks (cloud-testable)
The engine's own meters are not asked whether the engine is right. These tools measure rendered or captured audio with code that shares nothing with it (ffmpeg's EBU R128 meter, numpy/scipy):
```
node tools/wav_audit.cjs [genres|all] [seeds=1,2] [outdir] [--png] [--bars=16] [--default-kit]   # every genre's peak section as a float WAV: LUFS and true peak vs ffmpeg (≤ 0.5 LU), clipping, DC, dropouts / held frames / replayed buffers (with injected faults proving the detectors see them), the audio's pulse vs the score's tempo, spectrogram PNG
node tools/part_audit.cjs [genres|all] [seeds=1] [bars=8] [--quiet]   # each pitched part rendered alone: its pitch classes against its own written notes (not transposed, correlation ≥ 0.6), bass f0 of every sustained note within 50 cents (≥ 85 %)
node tools/capture_test.cjs <outdir> [live,fast,buffered] [genre] [seed] [seconds]   # Chromium: the REAL engines' output captured from the audio thread, replayed offline from the very commands the app sent (the 'seed' command pins the noise): level, low end waveform for waveform, spectrum, band envelopes, stereo image, notes — plus the MIDI clock against the sound card's own output timestamps
node tools/midi_quality_test.cjs [seconds] [base] [genre]   # Chromium: the MIDI clock as a RECEIVER sees it (order, jitter, tempo, gaps) while steady, in a 1-bar loop, in a tempo glide, across a section jump
node tools/selfcheck_test.cjs [seconds] [base] [engines]    # Chromium: the hardware-check page end to end with a fake MIDI loopback
```
All of them build tracks the way the app does (`tools/render.cjs appScore`: the genre's palette of sounds compiled through the spec path, levels refined in context); `X.composeTrack(gid, seed)` alone gives the same notes with the genre's plain kit (`--default-kit`).

## Verification (all measured from rendered audio, exact worklet code)
```
node tools/ci.cjs [--full | --gate] [--no-browser] [--hogs=N]  # EVERYTHING below in one run (starts its own server for the browser tests); exit 0 = all graded steps pass (skipped steps are listed and the summary says so; an unknown --only name exits 2)
                                                              # --gate = the release gate: + browser certification of every genre, 10-min monkey soak, fallback soak
                                                              # --hogs=N = run next to N busy CPU processes (a loaded laptop, a shared CI box): the logic checks must still pass. Real-time checks can fail on a starved core:
                                                              #            dock key change < 1.5 s, phaselock 0.05 beat, live-ui MIDI clock timestamps, and the suites that count sound-card dropouts (startup, jumps, stall, soak, cert)
node tools/cert_test.cjs <outdir> [genres]         # Chromium: every genre's intro and drop — every written part is heard, loudness, no errors, no long blocks
node tools/soak_test.cjs <outdir> [min] [seed] [--fallback]   # Chromium monkey test: tempo surprises, position jumps, stalls, audio blocks, UI stalls
node tools/block_test.cjs                          # audio-thread cost of every live command after the worklet warm-up
node tools/offline_test.cjs                        # the app with all network refused
node tools/arrangement_metrics.cjs [-] [genres] [seeds]   # flow: parts switching at once, builds resolving home, dead bars
node tools/verify_all.cjs all 11,23 out/v.jsonl   # every genre, unseen seeds, graded against fixed thresholds; exit 1 if any check fails (warn-only checks are listed, they do not fail)
node tools/pitch_test.cjs                          # every pitched kit, sustained notes, ±5 cents
node tools/set_test.cjs melodic-techno,trance,progressive-house   # endless set: grid offset, clicks, gaps, block time
node tools/browser_test.cjs <outdir>               # Chromium: AudioWorklet + Worker + transition + ScriptProcessor fallback
node tools/spec_test.cjs 3,17,101                  # score format: round trip for every genre, export validity, 3000-mutation fuzz
node tools/live_test.cjs                           # live edits on the running engine: knob sweeps, model swaps, sends, throws, score swap on the bar, no kit leaks
node tools/timing_test.cjs [seeds]                 # score-level timing and writing over every genre: swing on every odd 16th, no chord rung into the next one, the half-beat before a drop silent, nothing outliving its section
node tools/score_diff.cjs <rootOld> <rootNew> [seeds]   # what did a composer change touch? event-level diff of two unzipped versions over every genre: unchanged / only shorter or longer / removed / added / other fields, per channel
node tools/at_test.cjs                             # commands that wait for a step (cmd 'at') on the exact engine code: sample-exact at several tempos and block sizes, a riser with "until", settled on jump / seek / load / loop, order inside a block
node tools/auto_move_test.cjs <outdir> [live|fast|buffered|fallback]   # Chromium: Auto's moves and the Build → Drop snare-up run in the engine on their steps (sample-exact); a jump on air and SAFE settle them
node tools/dock_test.cjs <outdir>                  # Chromium: every dock tab, every kind of edit reaches the playing deck
node tools/bank_test.cjs                           # every sound-bank preset in context: level-matched within 3 LU, no new clicks, no clipping
node tools/cue_test.cjs                            # headphone cue bus (pre-fader, split, blend) + CPU watchdog eco mode
node tools/perform_ui_test.cjs <outdir>            # Chromium: Perform view, hot cues, FX hold pads, cue routing, set save/load, recording
node tools/ask_ui_test.cjs <outdir>                # Chromium: words → track / live edits; Claude path with a stand-in reply (invalid fields dropped)
node tools/hosted_test.cjs <outdir>                # Chromium: the page inside a Claude viewer (stand-in window.claude): Ask → sample.json, every file through the Downloads capability (a refused .wav comes in a .zip)
node tools/voicing_metrics.cjs [genres] [seeds]    # chord voicings: movement, top-voice steps, low mud, spread (VCH=6 for pads only)
node tools/dialogue_metrics.cjs [genres] [seeds]   # lead ↔ arp call and response in drops
node tools/lead_metrics.cjs [loader] [seeds]       # hook writing: chord tones on strong beats, clashes, phrase period, climax position, anticipations, dynamics
node tools/stab_metrics.cjs [loader] [seeds]       # chord stabs: hits on the kick (swallowed by the pump), pushes into chord changes, dynamics
node tools/flow_metrics.cjs <genres> [seed]        # arrangement: loudness of every section vs the drop, every boundary, holes
node tools/mix_flow.cjs a,b [bars] [seed]          # DJ mix: loudness bar by bar across a full Auto-DJ handover
node tools/arrange_cal.cjs <genres|all> 1,2 [iter] # section levels per genre (calibration.json → arr); run once plain, then once with iter
node tools/audit.cjs [genres|all] [seed]           # sound audit: long-term spectrum vs a modern club-master tilt (sub, low, box, presence, air), PLR, stereo width
node tools/tone_cal.cjs <genres|all>               # per-genre tone EQ + high-band width (calibration.json → tone), loudness re-landed
node tools/fx_test.cjs                             # FX rack on the real engine: audible, finite, no clicks on/off, CPU cost
node tools/stall_test.cjs <outdir>                 # Chromium: the Stable engine under deliberate DSP freezes + main-thread blocks — 0 dropouts; a freeze beyond the buffer is reported and the buffer grows
node tools/cpu_bench.cjs [genres|all] [sec]        # CPU per 128-sample quantum, two decks in a 16-bar mix, every genre (CPU time, best of N runs)
node tools/motion_test.cjs                         # harmonic FX + production style: moves vary per track, resonator on chord tones, build → drop renders, live Repeat / Tape / Swirl
node tools/liveset_stress.cjs [hogs] [sec] --slow=3 # Chromium: a live set on a WEAK, BUSY machine (busy processes + the engine run 3× = a 3× slower CPU) — 0 sound-card glitches, no screen freeze > 100 ms
node tools/health_test.cjs <outdir>                # Chromium: the black box — forced overload is recorded with the commands before it, auto-resume, the Report file holds machine/engine/timeline
node tools/truepeak_test.cjs [genres|all] [seeds]  # BS.1770-4 true peak (4× polyphase FIR) of every genre's drop — ≤ −1.0 dBTP
node tools/controls_test.cjs [genre]               # every live control (rack, sends, throws, pads, fills, part sends, sounds, mutes) changes the rendered sound
node tools/knob_test.cjs                           # no dead knobs: every editor knob of every playing part in every genre changes the sound
node tools/model_params.cjs                        # measures which knobs each synth model uses → src/compose/model_params.js (the editor hides the rest)
node tools/listen_pack.cjs <outdir> [tag]          # 16-bar MP3 excerpts with their LUFS and true peak
node tools/wasm_build.cjs                          # src/wasm/voice.c → src/engine/03w_voice_wasm.js (clang, wasm32 target; the generated file is kept in src/)
node tools/wasm_test.cjs                           # the WebAssembly synth voice vs the JavaScript one: 55 model/variant renders + 5 two-deck mixes — bit-identical
node tools/deadcode_check.cjs                      # no code hidden in a // comment (tokenizer-based; also run by the build)
node tools/export_test.cjs <outdir>               # Chromium: the WAV / stems-zip export — valid files, whole track + tail, the deck keeps playing
node tools/layout_test.cjs <outdir>               # Chromium: one layout at 390…2560 px — no sideways scroll, telemetry spans the width, every dock tab visible
node tools/gc_rate.cjs [sec]                       # Chromium: garbage collections per isolate while the Live engine plays a mix (V8's own --trace-gc)
node tools/balance_metrics.cjs [genres] [seeds]    # track-to-track drop loudness, section levels, every part's level vs the master across seeds
node tools/preset_gain.cjs [genres]                # pre-measured in-context level of every palette sound per genre (src/compose/preset_gain.js)
node tools/wav_audit.cjs | part_audit.cjs | capture_test.cjs | midi_quality_test.cjs | selfcheck_test.cjs   # the independent audio checks (see above)
node tools/live_ui_test.cjs <outdir>               # Chromium + simulated MIDI controller: learn, soft takeover, LEDs, clock/notes out, Mood, parts, Evolve, FX rack
node tools/signature_test.cjs [--balance=all|genres|off]   # the sound of each style stays fixed (v9): sub in phase with the fundamental, no DC on narrow pulses, kick body at the fundamental, the psy kick / roll / percussion / ear candy / pad, the techno rumble, every drop within ±7 dB per octave of the modern-master curve
node tools/tone_balance.cjs [tree] [seeds] [out.json]       # every genre's drop vs the modern-master curve, per octave, for any source tree (compare two versions)
node tools/busy_test.cjs [live|safe|fast] [--hogs=N] [--unpaced] [--runs=N] [--android]   # Chromium: sound-card glitches at the busy points of a set — a track composed + analysed on the other deck, the mix, a WAV export while playing, ear-candy pads (--unpaced: the v8 worker, for an A/B of the pacing)
node tools/session_test.cjs [genre] [minutes] [--engine=safe|live|fast|buffered] [--android] [--slow=N] [--hogs=N]   # Chromium: a set played hands-off the way a person plays it (start card, Auto-DJ) — sound-card glitches, the render-ahead player's dry runs, transport jumps and what came before each; --android: the page sees an Android phone; --slow=N: the engine N× slower
node tools/content_audit.cjs [genres|all] [seeds]           # what each genre's tracks contain (chords, harmonic movement, lead repetition, bare stretches, bass notes, layers) graded against the genre's practice
node tools/engine_flows_test.cjs                   # the live-set situations on the real engine: the mix-end ghost, the bass swap and the bass hole on 15 genre pairs, cancel and hand-over, grid, glide and tempo, load resets, refused commands, heal, rescue, FX fades, mute ramps, stems that sum, and what the independent check of 9.2 found (a silent deck after a called-off mix, the incoming deck's first downbeat, a mix frozen by an exception, a self-heal loop, two exports at once)
node tools/flows_ui_test.cjs [outdir]             # Chromium (FORGE_URL): the load policy, Cancel mix, Esc, Ask during a mix, the validator, Auto-DJ after a cancel, a deck whose mix was called off, each audio host catching an exception (worklet, worker, ScriptProcessor; engine command testFail), the phone's mix strip
node tools/ai_models_test.cjs <outdir>             # Chromium: the AI providers with their real URLs intercepted — the validator round, JSON mode, keys, edit vs new, Ollama's context, errors in words, Test with the full guide

Calibration order after sound changes: calibrate.cjs (balance + loudness) → tone_cal.cjs → arrange_cal.cjs … iter.
node tools/calibrate.cjs <genre…>                  # re-measure gain staging after sound changes
```
Thresholds live in `tools/verify_all.cjs` and are not moved to make a genre pass.

What the gates mean:
- `verify_all` measures true peak with the BS.1770-4 4× FIR (`tools/lib/dsp.cjs`, the same as `truepeak_test`) against ≤ −1.0 dBTP. Checks marked warn-only (bass on the right notes, stereo width, kick/bass separation, low-end overlap, up to 2 clicks) are listed but never fail it; every other check does, and it exits 1.
- The suites that count sound-card dropouts (startup, jumps, stall, soak, cert, liveset) measure real time: run them on a quiet machine with at least two cores and a real audio device. On a single-core container `cert` showed a burst of 7–9 dropouts in about one 12-second window in ten, and `stall` and `liveset` failed (they freeze or load a core on purpose); that says nothing about the product. `startup` fails when more than half of its starts glitch.
- The browser suites wait for conditions, not fixed times. `auto-ui` (at least 3 automatic changes in 70 s) is statistical and may need a rerun on a slow machine; `dock` expects a key change to be scheduled in under 1.5 s.
- `verification/v9_2_33genres_seed11.jsonl` is the critic run of this build (33 genres, seed 11; `v9_1_…` and `v9_0_…` those of 9.1 and 9.0). The other files under `verification/`, `out/`, `soak.json` and the PNGs in the project root are snapshots from earlier builds.
