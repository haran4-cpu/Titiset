# FORGE native engine: plan

## Why

The browser engine works and is measured, but hardware makers ship native code:
- Pioneer DJ standalones and rekordbox, Korg and Yamaha instruments, and plug-in hosts all run native code.
- Embedded targets run on ARM SoCs with fixed CPU budgets.

The goal is one DSP core that compiles to three places:
1. WebAssembly for the browser, as a drop-in for today's AudioWorklet engine.
2. A native library (C ABI) for standalone hardware and desktop apps.
3. A plug-in (VST3/AU/CLAP) for DAWs.

The composer, the score format and the UI stay in JavaScript/TypeScript. A score is plain data (struct-of-arrays events plus kits), so it crosses the boundary unchanged.

## Baseline (measured, this container, Node 22, one core)

| what | cost per second of audio |
|---|---|
| one deck, psytrance drop | ≈ 75–85 ms |
| one deck, deep-house drop | ≈ 120–145 ms |
| six performance FX on top | + 25–40 ms |
| master (reverb, delay, glue, limiter, meter) | ≈ 25 ms |

The rule of thumb is that 1000 ms is real time. Two decks in a transition use about 30 % of one core in V8.

From comparable DSP ports (JS to Rust, f32, no SIMD), I expect a 2–4× gain. SIMD adds more on the voice loops. Embedded ARM cores are about 3–5× slower than this machine, so the native core is what makes a 2-deck standalone realistic.

## Shape of the port

| JS module | Rust crate / module | notes |
|---|---|---|
| `00_core`, `01_dsp` | `forge-dsp` | PolyBLEP, SVF, ladder, biquad, FDN reverb, ping-pong, chorus, comp, limiter. Pure, no allocation after init. |
| `02_drums`, `03_synth`, `06_fx` | `forge-voices` | Fixed voice pools, same parameter names as the kits (serde from the score JSON). |
| `07_mix` | `forge-mix` | Channel strips (HP, transient, ADAA saturator), sidechain pump, DJ EQ, FX rack, master, BS.1770 meter. |
| `08_deck`, `09_processor` | `forge-engine` | Step-time playback, automation lane, transitions, cue bus, watchdog. The command enum mirrors the JS `cmd()` switch one to one. |
| `10_analysis` | `forge-engine::analysis` | Loudness pre-analysis (auto-gain). |

Each target gets a thin binding:
- **WASM:** `wasm-bindgen`. Shared memory output buffers; scores are transferred as one `ArrayBuffer`.
- **C ABI:** `cbindgen` → `forge_engine_new`, `forge_cmd(json)`, `forge_render(L, R, n)`, `forge_meters()`.
- **Plug-in:** `nih-plug` (CLAP/VST3).

## How parity is proven: it is the same test bed

The offline harness (`tools/render.cjs`) renders any score through the JS engine. Parity checks for each module, in order:
1. **Sample-level diff.** Render the same score through JS and WASM with the noise stream seeded identically. Required: ≤ −90 dBFS difference on deterministic paths, ≤ −60 dB on paths with float-order sensitivity (the FDN).
2. **Every existing graded tool runs against the WASM build unchanged:**
   - the critic (`verify_all`);
   - `pitch_test`, `fx_test`, `live_test`, `cue_test`;
   - `set_test` (grid offset, clicks, loudness continuity);
   - the browser tests.

   `tools/ci.cjs` gains `--engine wasm`.
3. **Real-time safety is checked by tool, not by review:**
   - no allocation in `render` (a counting allocator in tests);
   - no locks;
   - denormal flush on.

## Order of work (each step ships on its own)

1. `forge-dsp` and `forge-mix` behind the existing JS deck, called through WASM per block. This proves the build, the memory layout and the parity harness on the cheapest-to-verify code.
2. Voices (`forge-voices`). This is where most of the CPU goes. The parity diff has to be per model (25 synth models, 4 drum voices).
3. Deck and engine. After this step the whole AudioWorklet is WASM, and JS only posts commands. Two things to watch:
   - The fallback (ScriptProcessor) path keeps the JS engine.
   - Drop it only when the WASM build has run a month of sets without a regression.
4. C ABI and a minimal standalone host: CPAL audio plus MIDI through `midir`. A Raspberry Pi 5 is the reference board for the embedded budget.
5. The plug-in target.

## Risks and what handles them

- **Floating-point drift in feedback paths** (the reverb, the delay, the resonant filters). Handled by the per-path tolerances above. Musical tests (the critic) are the arbiter; bit-exactness is not.
- **WASM in AudioWorklet** (memory growth must not happen on the audio thread). Pre-size the heap at load and keep one arena per deck.
- **Two code bases drifting while the port is under way.** The JS engine is frozen per module the day its Rust twin passes parity. From then on, a change lands in Rust first.
