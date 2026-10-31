# FORGE 9.3 — UI spec (frozen before the build)

One page, five screens, one home per control. Phone first (360–430 px portrait), the same structure on tablets and desktops.

## Frame (never changes while the app runs)
- **Status bar** (top, 40 px, not interactive): FORGE · lead BPM · LUFS · the running mix (style, bars left).
- **Screens**: five full-width pages side by side in a horizontal scroller with snap. Only the person moves between them (tab or swipe).
  From 1100 px wide two pages show at once (PLAY + MIX, FX + EDIT, SET).
- **Tab bar** (bottom, 64 px, always there): PLAY · MIX · FX · EDIT · SET. The current screen is highlighted.
- Nothing appears, disappears or moves by itself. Disabled controls stay where they are (greyed), they are not removed.
  Toasts float over the status bar and never push content.

## Screens and their controls (each control lives on exactly one screen)
| Screen | Holds |
|---|---|
| **PLAY** (default) | The two decks: title, genre, BPM/key, state, arrangement map (tap = jump), section jumps, Play/Pause, Mix in (shows the planned transition), Loop 4/8/16, New variation, Energy, Mood, BPM, New drums/bass/chords/melody, part mutes, export. A **transport row** pinned to the bottom of the screen: the transition for the next mix (Auto or one of ten), then Play A · Mix → · Play B. (Play and Mix in live here, not on the deck cards.) |
| **MIX** | Per deck: channel EQ/filter/gain (the mixer), **Color FX** (Filter · Dub · Space · Noise · Crush, one knob, centre = off). Crossfader. Auto-DJ, journey, mix length, mix progress, Cancel mix. **Deck sound**: Reverb, Delay, Harmonic echo, Pump, Heat, Punch per deck; the shared room (size, damping). |
| **FX** | Deck A / B. **Beat FX**: effect grid (Delay, Dub echo, Reverb, Filter, Flanger, Phaser, Roll, Brake, Crush, Trans, Noise), Beat (1/16 … 2 bars, triplets), Depth, X-Pad (x = Beat, y = Depth; touch engages while held), On (latch) + Quantize, Target (whole deck or one part), the selected effect's own parameters. Below: one-shots (risers, impacts, downlifters, echo throws) and the performance pads (hot cues, fills, ear candy, macros, X/Y, Build → drop). |
| **EDIT** | Deck A / B, one part at a time — Drums · Bass · Chords · Lead · Harmony · Score. Each part has three pages: **Pattern** (the steps / notes; Drums also Groove: Density, Swing, Complexity), **Sound** (that part's sound only: kit family, Tune / Decay / Tone / Snap, your own sample per drum voice; synth model, presets, knobs), **Mix** (that part's level, Delay send, Reverb send; its mute is on the deck). Mood and tempo are on the deck (PLAY). The old global *Sound* and *FX* tabs are gone. |
| **SET** | Library (genres, songs), Ask (describe a track), audio engine, output level, controller, set save / load / record, headphone cue, health report, telemetry. |

## Rules
- Touch targets ≥ 48 × 48 px on phones for everything on PLAY, MIX, FX and the tab bar; ≥ 40 px for the dense editor grids.
- Primary actions (Play, Mix →, FX On, the X-Pad) sit in the bottom 40 % of a portrait phone screen.
- One component library: tokens on `:root` (`--bg`, `--panel`, `--ink`, `--dim`, `--acc`, `--accB`, `--warn`, `--r`, `--gap`, `--tap`), the same button, segmented control, slider and knob everywhere.
- Portrait and landscape; no sideways page scroll at 360 / 390 / 412 / 768 / 1024 / 1440 px.

## Acceptance (tools/ui_shell_test.cjs)
1. Inventory: across the five screens no control label appears twice for the same deck (0 duplicates).
2. Stability: 2 minutes of playback with Auto-DJ mixing — the 20 main controls move 0 px.
3. Layout at 360 / 390 / 412 / 768 / 1024 / 1440 px: no sideways scroll, the tab bar and transport visible.
4. Touch audit at 390 px: every visible control on PLAY / MIX / FX and the tab bar ≥ 48 px in both directions (≥ 40 px in EDIT grids).
5. Phone task at 390 px — start a set → mix the next track in with Echo out → put a delay on the snare — in ≤ 8 taps.
