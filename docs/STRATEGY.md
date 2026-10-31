# FORGE: how it leads instead of being "another one"

## Where it stands, honestly

**v8.2 (stability + mastering round).** The default engine is now *Live*: the DSP on the browser's real-time audio thread with a
playback-size device buffer (~70 ms). The previous default (a Worker rendering ahead) is an ordinary-priority thread and was
starved on busy machines — measured: thousands of dropouts in a 2-minute live set with background load, against 0 for Live even
on a CPU emulated 3× slower. Composing runs on its own thread (no screen freezes from new parts / tracks). The master limiter
detects true peak with a 4× polyphase FIR (the cubic estimate let masters reach +0.26 dBTP); every genre now measures ≤ −1.0 dBTP.
A black box (Report button) records glitches, load, slow audio-thread calls and the command timeline on the player's machine.
Still open: latency (70 ms; WebAssembly DSP would make the 30 ms mode safe on weak machines), clock-in sync, WAV/stem recording.

**v8.3 (WebAssembly round).** The synth voice — 25 models, every filter, envelope and wavetable path — runs as WebAssembly
(src/wasm/voice.c), bit-identical to the JavaScript (proved per model and on whole mixes). It removed the synths' garbage on the
audio thread (the JS loop boxed 20–50 MB of doubles per second of audio, depending on the JIT's inlining from run to run) and
made their cost deterministic; per voice it is 1.0–1.6× faster than V8's own optimised code. A tokenizer-based check then found
three statements that had been swallowed by trailing comments and never ran: the reverb send of every melodic part (since v8),
the wavetable Breath knob, and the start-up output level — all restored, and the check now gates the build.
The 30 ms mode is still not glitch-free in the test environment; the black box shows why: the audio thread is not scheduled
for 20–360 ms at a time (no real-time priority in a headless container) — faster DSP cannot fix that. A Report from real
hardware decides whether it is.

**v8.7 (running-it round).** The page now runs from a double-clicked file (`dist/FORGE.html`; the worklet loads from a `data:` URL where Chromium refuses a `blob:` one), the outgoing MIDI clock is smoothed, the composer holds notes to the next chord and keeps the drop gap clear, the engine can hold a command for an exact step and Auto's moves use it (all in `docs/CHANGES-fixed-7.md`), and the gates were audited. Measured on this build: the critic over all 32 genres (seed 11) finds 0 failing checks and 4 warnings (stereo width on techno, hard-techno and acid; kick/bass separation on deep-house), and true peak is at most −1.07 dBTP on every genre by the BS.1770-4 estimator, which the critic now uses too (it used a cubic estimate against a −0.9 limit, and `verify_all` could not fail at all: it printed FAIL and exited 0). The browser certification had not been checking the right track: it read the score before the asynchronous `loadDeck` had set it. What a single-core container cannot say is whether the real-time suites pass on real hardware; that needs a run on a normal machine (see `CHANGES.md`).

**What is real today, all measured:**
- A sample-accurate, two-deck, generative engine.
- Every musical decision can be read and written as text (the score format). An AI model, or a person, can edit it, and the edit lands on the next bar.
- Auto per part, with a harmonic generator.
- Phrase-aligned mixing with key matching and tempo discipline.
- An **audio engine with three paths**: *Live* (the default) runs the DSP on the browser's real-time audio thread with a ~70 ms device buffer; *Live · fast* does the same with a 30 ms buffer for strong machines; *Buffered* (the former Stable engine) runs it in a Worker ahead of the audio clock and plays what it receives, so garbage collection, JIT recompiles and a busy page are absorbed by the buffer (a dropout is counted and shown, and the buffer grows on its own). Without an AudioWorklet a ScriptProcessor fallback plays as a last resort. Live measured better on busy machines (see v8.2 above).
- **Effects that know the music**:
  - an echo whose repeats climb by consonant intervals;
  - four combs tuned to the current chord, which turn drums and noise into harmony;
  - an octave shimmer;
  - beat repeat, tape stop and a frequency-shifter swirl.
  
  Each track draws its own production style, and every move is written into the arrangement on the grid.
- A **wavetable voice**:
  - morphing harmonic tables;
  - up to 7-voice stereo unison;
  - formant and tuned-comb filters;
  - a bar-locked LFO.
  
  It adds 33 new sounds, organised into genre palettes. Each sound's level is matched in context.
- **One set loudness** across genres: measured on the drops of v8.7 (2 seeds), the club genres sit between −8.7 and −7.4 LUFS (1.3 LU); ambient, lofi and downtempo are lower by design (down to −12.0 for ambient). Mixes keep the room level through the transition.
- A release gate that runs the real page in a real browser, covering:
  - every one of the 32 genres;
  - every part of each genre;
  - a 10-minute monkey soak;
  - the fallback engine;
  - offline use.

**What is not there yet, and what decides whether a professional takes it seriously:**
- **Sound realism.** Every sound is synthesised in real time from simple oscillators. Professional records are built from recorded and carefully designed sounds, plus mixing. No amount of composition can hide a synthetic snare. Automated tests cannot judge taste either. The texture beds passed every metric and were judged "horrible" by ear.
- **Taste validation.** The only valid judge of musical quality is a trained ear. The gate proves engineering; it does not prove music.

## The market, in one line each

- **Pioneer, Serato, Traktor:** they play other people's finished audio, superbly.
- **Ableton, FL Studio:** they help people make music. They do not make it with them live.
- **Suno, Udio:** they render a fixed audio file. Nothing in it can be edited or mixed live, and it cannot follow a crowd.
- **Endel and other generative apps:** functional background music, not club-grade, and no performance control.

**The open space:** a live instrument whose music is generated, editable at the note level, and steerable in real time by a DJ (or by words, or by a controller). Nobody owns this space. FORGE already stands in it.

## The five levers, in the order that changes the product most

1. **Hybrid sound engine.** Keep synthesis where it is strongest: basses, acid, leads, pads, risers. Play drums and acoustic or electric instruments from recorded multisamples (owned or licensed, round-robin, velocity layers). The engine already has the hooks for this: per-slot kits, level matching in context, and per-channel strips. This is the single biggest step in perceived quality.
2. **One tension curve drives everything.** Today, sections have layers, and the flow engine staggers entries. The next step is a continuous energy and tension value per bar, written by the composer and moved live by the Energy control. Density, filter, harmonic rhythm, FX and mix all read it. A DJ then rides one control and the whole arrangement breathes, the way a producer automates twenty things at once.
3. **Taste as data.** Two signals already exist: Back (undo an automatic change and leave that part alone) and the sounds a player keeps. Record them, and let generation favour what this player keeps. Over a few sets, the instrument becomes theirs.
4. **Native core.** One Rust DSP core for the browser (WASM), standalone hardware and plug-ins. See `NATIVE-ENGINE.md`. Hardware partners (Pioneer DJ, Korg, Yamaha) need this to ship anything. The existing test bed proves parity sample by sample.
5. **Listening panel as a release criterion.** Each release gets blind A/B pairs: the previous version against the new one, the same seed, every family. Trained listeners rate the pairs. A change ships only if it wins, or at least does not lose. The automated gate stays as the floor for engineering.

## What a release means now

`node tools/ci.cjs --gate` must pass. It covers:
- build guards;
- engine, score, FX, cue, bank and tuning tests;
- block cost per live command;
- the browser certification and soak tests of the release gate;
- browser certification of all 32 genres (the intro and the drop of each);
- a 10-minute monkey soak and a fallback soak;
- an offline run;
- the critic over every genre.

After the gate, a listening pack is produced for the human verdict.

The real-time suites (startup, jumps, stall, soak, cert, liveset) are only meaningful on a quiet machine with at least two cores and a real audio device; on one core they report dropouts that say nothing about the product.
