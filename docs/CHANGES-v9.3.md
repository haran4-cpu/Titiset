# FORGE 9.3 — what changed

9.3 answers five complaints about 9.2: thin, inaccurate drums; chords that always land on the one with the kick; tracks that sound alike; too few, too fixed effects and generic transitions; and a cluttered, inconsistent UI that was hard to use on a phone.

## Drums
- **Kit families.** Snares, claps, rims, closed/open/pedal hats (with choke), ride, crash, shaker, toms, conga, bongo, cowbell, clave and tambourine come from six families: 808-style, 909-style, 707-style, Linn-style, Acoustic and Lo-fi tape. They are FORGE's own models (oversampled square-wave metal, modal plates and membranes with pitch drop, a snare-wire model, small rooms, the converters of the old machines), not samples of those machines. The kick stays synthesized (it follows the tempo and each genre's calibration). Every genre has a default family; you can pick another (EDIT · Drums · Sound) or keep the 9.2 synth voices ("Synth (9.2)").
- **Render once, play many.** A family is rendered off the audio thread (≈0.25–0.4 s on a desktop, ~1–1.5 s on a phone) and handed to the engine; until it arrives, the deck plays the synthesized voices. Three round-robin variants per voice (two for ride and crash), so no two hits in a row are the same sample.
- **Velocity and shaping.** Soft hits are darker hits (velocity-dependent brightness — honestly: one rendering per variant, filtered by velocity, not separate recordings per dynamic). Tune, Decay, Tone and Snap for the snare, the hats and the percussion.
- **Your own samples.** Load a WAV/MP3/OGG for any voice. It is level-matched, kept in this browser (IndexedDB) and plays on both decks until you remove it.
- **Level-matched.** Each voice was matched to the 9.2 voice it replaces (tools/bank_level.cjs); the six families land within ±0.2 LU of each other on the same groove.
- A drum sound you pick from the sound bank (rimshot, dry snare, …) is still that synthesized sound: it leaves the family for that part.

## Groove and variety
- **Harmony articulation.** A chord change now lands on the beat, pushed (a 16th or an 8th early, swung like any other 16th) or late (an 8th or a dotted 8th after the kick; at the start of a quiet section sometimes on beat 3), with odds per genre family; big room, hardstyle and hard techno keep the chord with the kick most of the time. Gate chords alternate their accent between the beat and the off-beat per phrase, and a pushed change takes over the last gate hits of the bar before it. A late next chord leaves a breath — the old chord is not bridged over the bass's change.
  - Measured over 20 tracks × 8 genres (tools/rhythm_stats.cjs): harmony changes landing on a kick fell from 66–79 % (house, melodic techno, trance, DnB in 9.2) to 14–40 %; anticipated changes rose from 0 % to 29–56 %; section entries off the downbeat from 0–21 % to 64–100 %.
- **Each track's own drum skeleton.** A track draws its own version of the genre's patterns once (closed-hat grid, ghost snares, open-hat placement, syncopated kicks in the broken genres, rotated or swapped percussion). Tracks of one genre sharing their first drop bar: 30–85 % in 9.2, 0–15 % now.
- **Live groove.** Density (thins ghosts ↔ adds hat ratchets, the same hits every pass) on EDIT · Drums · Pattern, next to the existing Swing; Complexity re-draws the drums further from or closer to the written bar.

## Effects
- **Beat FX** (FX screen): Delay (1/16 … 2 bars, dotted, triplets; feedback, tone in the loop, ping-pong, tape wobble), Dub echo, Reverb (size, damping, pre-delay, freeze), Filter (LP/HP/BP sweep, resonance), Flanger, Phaser, Roll, Brake, Crush, Trans, Noise sweep. Each has Beat and Depth, an X-Pad (x = Beat, y = Depth; touch engages while held), a latching On that can wait for the next beat, and a Target: the whole deck or one part (only the snare, only the chords…).
- Echoes and reverbs ring on after Off and stop by themselves when their tail has died; no clicks at the switches (tools/beatfx_test.cjs).
- **Color FX** (MIX): the filter knob with a colour — Filter, Dub, Space, Noise, Crush; centre is off.
- **Per-part sends** (EDIT · part · Mix): level, Delay and Reverb for each part, with tails.
- One-shots (risers, impacts, downlifters, echo throws) moved from the old editor FX tab to the FX screen.

## Transitions
- Ten styles: Blend + bass swap, Filter blend, Echo out, Stem handover (drums → bass → music, each on a bar line), Breakdown overlay, Tease, Drop swap, Loop-roll out, Brake out, Riser bridge. The hard styles start the incoming track so its first drop lands on the swap line.
- Auto-DJ picks the style per mix: a big tempo jump or a change of genre family favours the hard styles, rising energy the riser / drop swap, falling energy the echo / filter / breakdown; a style does not come back until five other mixes have passed, so any 10 mixes hold at least 6 different styles (checked over 5,000 simulated sets, tools/tx_variety_test.cjs).
- Every style completes in sync (beat offset < 1e-6 steps), leaves the outgoing deck silent (< −60 dBFS), and the smooth styles keep the room within 1.8 dB (tools/tx_styles_test.cjs).

## UI (docs/UI-SPEC-v9.3.md)
- Five screens — PLAY · MIX · FX · EDIT · SET — side by side, a fixed tab bar, swipe or tap between them. Nothing appears, disappears or moves by itself (the 9.2 mix strip that popped up is gone).
- PLAY: the decks and a transport pinned to the bottom (next transition, Play A, Mix →, Play B). MIX: mixer with Color FX, crossfader, Auto-DJ, deck sound. FX: Beat FX, one-shots, performance pads. EDIT: one part at a time with Pattern / Sound / Mix pages — the global Sound and FX tabs are gone. SET: library, Ask, engine and output settings, controller, sets, recording, telemetry.
- One home per control (0 duplicates across the screens), ≥ 48 px touch targets on PLAY / MIX / FX, the main controls do not move during playback, no sideways scroll from 360 to 1440 px; the phone task "start a set → mix the next track in with Echo out → a delay on the snare" takes 7 taps (tools/ui_shell_test.cjs).
- Installable: a web manifest, an icon and an offline cache for the hosted page (FORGE.html stays one self-contained file that works offline).

## Android
- `android/` is a WebView app around the web build (served from the APK over a secure origin, so the AudioWorklet, the workers and the sample store work; the screen stays on; files are picked and saved through the system pickers). `.github/workflows/android.yml` builds a debug-signed APK on GitHub. This sandbox cannot build it (no Android SDK, Google's Maven blocked).

## Known limits
- Velocity layers are one rendering per variant filtered by velocity, not separate dynamics.
- A MIDI controller mapped to the 9.2 FX rack (sweep, phaser, flanger, echo, crush, gate) drives the same engine effects as the Beat FX panel, but the panel does not show those MIDI changes.
- The Android app's exports go through the system "save as" picker; very large stem exports may be slow to hand over.
- 9.2 set files load. Drum patterns saved in them play as written (the per-track skeleton never rewrites written patterns), but their drums now use the genre's kit family and their chords the new articulation, so they do not sound exactly like 9.2. Pick "Synth (9.2)" on EDIT · Drums · Sound for the old drum voices.
- A part's Level (EDIT · part · Mix) and your own drum samples are heard live but are not in exported WAV / stems or in "Copy score" yet.
- A chord pushed before a bar line belongs to that bar: cueing or looping exactly from that bar starts without it until the next change.
- Until a kit family has arrived (the first second of a track in a new family), the deck plays its synthesized voices; a live capture of that first track will not match an offline render bit for bit.
- After an engine self-heal rebuilds a deck, its Beat FX and Color FX positions shown on screen are not re-applied (part levels and the groove are).

## Verification (this build)
- `node tools/ci.cjs --full` run once on the 9.3 tree: every graded step passes except **health** (2 checks: the glitch counter is "not available in this browser" and the forced overload is not recorded). The 9.2 build fails the same 2 checks in the same sandbox browser, so it is the environment, not 9.3 — reported as failing, not waived.
- The run found five real problems, fixed and re-run: Auto-DJ variety could drop to 5 styles in 10 mixes (now structural: a style waits five mixes); the psytrance pad was anticipated into the last beat of a drop; synthwave's Linn-style kit was 7.8 dB short at 8 kHz; the synth snare / hat knobs did nothing while a kit family played (the Sound page now shows the kit's controls there); UK garage and jungle lost snare grammar (0.84 / 0.83 < 0.85) to added ghost snares. After the fixes: signature, controls (46/46 audible), verify (ukg, jungle), timing, rhythm stats and transition variety all pass.
- The audio audit's three warnings (melodic techno, psytrance, prog-psy: the mix's pitch classes match the written notes only loosely) are identical on 9.2 (r = 0.11 / 0.30 / −0.34 there, 0.16 / 0.30 / −0.32 now).
- A read-only code review of the change found 13 issues; the ones that could hurt playback or lose your work were fixed (per-sample garbage in the reverb, written drum patterns rewritten, quantize engaging early, a frozen reverb that could not be stopped, the riser length, bank requests after a score swap, unclamped drum settings, part levels and groove not reset per track, the cue for hard transitions computed before the length was settled, a noise burst on Color Noise release, effect lines allocated on the audio thread); the rest are listed under Known limits.
- UI acceptance (tools/ui_shell_test.cjs, full length): 666 controls, 0 with two homes; all PLAY / MIX / FX controls ≥ 48 px at 390 px; 120 s of playback with a mix running, the 20 main controls moved 0 px; the phone task in 7 taps; no sideways scroll at 360–1440 px.
