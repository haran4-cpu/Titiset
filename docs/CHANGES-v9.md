# FORGE 9.0 — what changed, and what was checked

## One base from every branch
The versions made between 8.7 and today (fixed-6, fixed-7, fixed-8 in two variants, 8.7-final, 8.8, 8.9) were merged into one tree with
three-way merges against 8.7, conflict by conflict:
- **fixed-8 (safe)**: the *Live · safe* engine (the biggest output buffer the browser gives), chosen automatically on a machine with two
  cores or fewer or after a glitchy session; the glitch watch; heard-position and MIDI clock compensation for big buffers.
- **fixed-8 (web)**: Apple WebKit unlock inside the tap (iPhone, iPad, Safari), `FORGE.html` as one complete page, version + build id,
  deferred fonts, `verify_all` / `ci` exit codes, the BS.1770 4× FIR true peak in the critic.
- **fixed-7**: the composer holds sustained notes to the next chord and keeps the drop gap silent; the engine's `at` command (commands
  that wait for their step, sample-exact); Auto's moves timed by the engine; the timing / at / auto-move tests.
- **8.8 / 8.9**: seven new percussion kinds (agogo, guiro, triangle, djembe, taiko, maraca, cajon) with decay and noise controls, the
  curated preset bank (and the legacy kits a saved score may still name), the voice swap on a drum lane's name.
- **fixed-6 (latest)**: the hardware-check page (`selfcheck.html`), the independent audio audits (ffmpeg / numpy: wav_audit,
  part_audit, capture_test, midi_quality_test), MIDI clock-out that keeps whole ticks across latency refinements.
- **8.7-final**: hosted saves that report a declined or failed save, a `.wav` the viewer refuses offered again inside a zip.

## Sound: why psytrance sounded like house, measured
Rendered and measured, not guessed (tools/signature_test.cjs keeps every one of these fixed):
1. **The sub oscillator cancelled the fundamental.** On the saw, acid, pluck and lead models the sub sine was added in the opposite
   phase to the saw's own fundamental: at sub 0.6 the fundamental dropped by 26 dB. Every bass that used `sub` (the psy roll, the
   trance and techno basses…) had lost its weight, and the calibration had compensated with +9…+14 dB on the bass channel and up to
   +9 dB of sub shelf — loud harmonics, mud at 120–500 Hz, no low end. Now the sub is in phase (also on the reese and the FM basses),
   with an option to join after the filter (`subPost`: a resonant ladder takes 6–8 dB off the fundamental). Every genre was recalibrated.
2. **The kicks were knocks.** Measured on the 32 kits: 6–28 % of a kick's energy below 70 Hz and 40–60 % at 120–250 Hz (a slow pitch
   sweep through the loud part of the hit). The pitch envelopes of 25 kits were retuned so the body sits at the fundamental (35–52 %),
   with the punch and click kept.
3. **Psytrance rebuilt** from full-on practice: a kick that holds its tuned body ~45 ms and is 27 dB down before the first bass
   sixteenth; the K-B-B-B roll with its fundamental back; a tight snare with a short clap under it (it was a two-burst house clap);
   ticks, rims and toms on the top (it had no percussion at all); a dark pad for intros, breakdowns and builds only; the acid
   sequence, a screaming second voice; and the **ear candy** — zaps, squelches, bubbles, lasers and swirls in key, panned, with
   their own 3/16 ping-pong echo (it had 0.1 FX per bar, all of them transitions; now ~0.5).
4. **Progressive Psy** (new genre): rounder roll, gated chords, delayed pluck arpeggios, chords every four bars, fewer FX.
5. **Techno rumble**: the kit parameter existed with no sound behind it; now three short dark combs, low-passed, driven and ducked
   under the next kick fill the beat (+11 dB in the second half of each beat). Techno, melodic techno, hard techno.
6. **Narrow pulses had DC**: with the envelope on it, a thump at the note rate under every narrow-pulse lead. Removed. **The screech
   sat 6 cents sharp** (one saw in tune, one 12 cents up): now centred on the note, in the JavaScript and the WebAssembly voice alike.
   **A DC offset** of 0.011–0.017 on six drops (the in-phase sub on short roll notes, the heavier kicks): a 5 Hz DC blocker on the
   mid before the limiter takes it to 0.001–0.006, the stems too.
7. New sounds: psy kick / snare / hats, rumble and hard-rumble kicks, layered trap and big-room claps (the snare engine stacks a clap
   under a snare or the reverse), four psy basses (two new, two redesigned — the FM roll put 75 % of its energy at 250–500 Hz),
   psy acid, psy scream, psy bell, psy pad; the ear-candy one-shots as pads in the Perform view and the dock (in key, on the next 16th).

## AI models
The Ask bar writes with Claude (inside Claude), Google Gemini, OpenRouter's free models (OpenAI's open GPT models, Llama, Gemma,
Qwen…), Groq, OpenAI, the Anthropic API, Mistral, Pollinations, a model on the person's own computer (Ollama, LM Studio) or any
OpenAI-compatible endpoint. Keys stay in the browser. A score the validator rejects goes back once with the validator's messages;
the model decides whether the words asked for a change or a new track. Versions of existing songs keep the style and write an
original melody (no protected melody, hook or lyric is copied). Tested with the providers' real URLs intercepted (tools/ai_models_test.cjs).
The format guide the model gets is about 9,000 tokens, which is more than some free plans and local defaults take in one request:
- **Groq** defaults to Llama 4 Scout: the free tier's per-minute token limit on GPT-OSS is smaller than the guide.
- **Ollama** is called through its own API with a 24K-token context; its OpenAI-compatible API cannot raise the context, and the
  default context would silently cut the guide. LM Studio's note says to load the model with 24K or more.
- **Test** in the settings sends the full guide, so a plan or context too small for it shows there and not on the first track.
- A request that is too big, a rate limit, a refused key and a timeout are each reported in words. Local models get 15 minutes, providers 4.
- Gemini may write up to 32K tokens: its thinking counts against the limit.

## Stability at the busy points
- The workers that render offline (the pre-analysis of every new track, WAV / stem export) used to hold a core for one to forty
  seconds; on one or two cores the audio thread then missed its turn. They now render in 10 ms slices with 2 ms rests, and after a
  glitch in 4 ms / 4 ms slices for a minute (`PACE`, 10_analysis.js). Export runs while a set plays.
- The start card asks what the set is for: a gig (the steadiest buffer), live (balanced) or studio (fastest).
- tools/busy_test.cjs measures the sound card's glitches at the busy points of a set: a track composed and analysed on the other
  deck, the mix, an export while playing, ear-candy pads hammered — with optional CPU hogs and an unpaced A/B.

## Layout
- Tablets (820–1099 px): the two decks side by side, the mixer a horizontal strip under them (channels as compact 2 × 2 knob blocks
  with their faders, the crossfader and the transition beside them).
- Phones: the Ask input on its own row (16 px, no zoom on iOS), the model picker and settings beside Go; a compact centred mixer.
- Touch screens: every button at least 36 px tall.

## Checked
On a 2-core cloud machine, headless Chromium with a virtual sound card. Real-time numbers on your own machine: `selfcheck.html`.

**Full suite** (`node tools/ci.cjs --full`, run in two parts across a machine restart): **all 44 graded steps pass**, plus 5
information steps. One step failed on the way and was fixed: `selfcheck` (the new ear-candy pads used the attribute name of the
hardware check's answer buttons); it passes on the final build together with the Perform test. The critic over every genre
(`verify_all`, seed 11, `verification/v9_0_33genres_seed11.jsonl`): 33 runs, 0 failing checks, 3 warn-only (kick/bass separation in
deep house and dub techno, stereo width in acid). The independent audio audit (ffmpeg / numpy, every genre): pass; the full-mix
pitch match is loose in deep house, tech house and prog-psy (percussion and effects are not part of the written notes), while every
pitched part alone matches its own notes (`part_audit`).

**Sound**
| check | result |
|---|---|
| tonal balance of every drop (two seeds) | median worst octave 3.2 dB (v8.7: 3.4); 30 of 33 genres within ±6 dB in every octave (v8.7: 27 of 32) |
| tuning (`pitch_test`) | 350 sustained notes, every one within ±5 cents (worst 4.7) |
| JavaScript vs WebAssembly voice | bit-identical (55 renders + 5 two-deck mixes) |
| true peak, every genre (BS.1770-4) | worst −1.11 dBTP, none over −1.0 |
| DC offset on the drops | 0.001–0.006 (the six genres that failed at 0.011–0.017 before the DC blocker) |
| presets in context (`bank_test`) | all 129 level-matched within 3 LU, no new clicks, no clipping |
| knobs | 706 of 706 change the sound |

**The busy points of a set** (`tools/busy_test.cjs`, sound-card glitch events per phase: steady play · a new track composed and
analysed on deck B · the mix · a WAV export while playing · 24 ear-candy pads)
| engine | busy processes | glitch events | export of the playing track |
|---|---|---|---|
| Live | 0 | 0 · 0 · 0 · 0 · 0 | 50 s |
| Live | 1 (on 2 cores) | 0 · 0 · 0 · 0 · 0 | 84 s (paced) |
| Live, export unpaced (the v8 worker) | 1 | 0 · 0 · 0 · 0 · 0 | 52 s |
| Live · safe (gig) | 1 | 0 · 0 · 0 · 0 · 0 | 71 s |

On this machine the unpaced export was clean too, so the pacing's benefit is not measurable here: it is there for machines with fewer
free cores (it costs a slower export while a set plays).

**v8.7 against v9, the same machine and scripts**
| test | v9 | v8.7 |
|---|---|---|
| `liveset_stress` (CPU emulated 3× slower, 2 busy processes on 2 cores, 90 s, 24 actions), run 1 | 0 dropouts, longest main-thread task 0 ms | 0 dropouts, 68 ms |
| run 2 | 0 dropouts, 0 ms | 0 dropouts, 89 ms |
| `soak` (4 min, 45 actions, Live) | clean | (run lost to a machine restart) |

In the first full-suite run of this build, `liveset` showed one event of two underruns and `soak` one dropout next to a 2-second
stall of the test harness itself; neither repeated in the runs above.
