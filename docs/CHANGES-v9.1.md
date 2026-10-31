# FORGE 9.1 — what changed, and what was checked

## Why 9.0 jumped on Android, and what plays there now
Reported on an Android phone: the *gig* engine jumped constantly from the first seconds, the *balanced* one at the transitions
and the busy sections ("suddenly fast, as if unstable"). Both ran the DSP inside Chrome's audio worklet with a large output
buffer — the gig setting asked for a quarter of a second, the balanced one for the 'playback' size. That combination is a known
Chrome-on-Android failure: Chromium issue 40133762, *AudioWorklet audio skips / glitches with "playback" latency on Android
Chrome*. The small buffer is the path Android's low-latency audio is built for, but with the whole engine on the audio thread it
leaves the DSP about 3 ms per callback, and on a phone core that leaves little room at the busy points (two decks mixing, effects).

**On Android every choice now runs the Stable engine**: the whole engine renders ahead in its own worker thread, the audio thread
only copies finished audio (nothing on it can take longer than a memory copy), on a low-latency context. The start card's choice
sets how far ahead it renders: a gig 340 ms, live 170 ms, studio 85 ms (also how much later the knobs answer). The chosen cushion
is kept for the whole set (before, the worker gave lead back down to 93 ms after clean stretches); after a dropout it grows,
up to 680 ms. Desktop browsers keep the 9.0 engines (the DSP on the browser's real-time audio thread).

**When a device runs short of time** (the worker above 88 % of real time for a second, or more than 60 % of its cushion spent), the
engine thins itself one step at a time, at most every 4 s, and goes back one step after 20 s under 50 %:
1. channel character (heat / punch) off;
2. supersaw stacks play their centre and two outer saws instead of seven (level-matched), wavetable unison capped at 2, the
   shimmer and resonator sends off.
Before, the only step came at 75 % and saved little (measured ~5 %). Both steps together now save 10–15 % on the heaviest genres
(trance 19.0 → 16.2 % of real time, psytrance 12.4 → 10.6, melodic techno 15.7 → 13.6, house 16.4 → 14.8).

On Android the background workers (the next track's composition and pre-analysis, exports) also run at the tight pace
(4 ms of work, 4 ms of rest), so the engine's thread keeps a fast core.

## Less CPU for the same sound
- **Hi-hats**: a voice's state in locals for the whole block, the three filters inlined — bit-identical output, 30 % less time.
- **The deck mixer**: channel by channel instead of sample by sample, the buses summed in doubles in the same order; the strips'
  high-pass as one block pass; the DJ EQ skipped while it is flat (a 0 dB shelf is the identity); the drum-bus compressor as a
  block; the chords/pad ensemble skips its delay reads while its input has been silent longer than its delay line (its LFO keeps
  turning). Against 9.0 the master output differs by at most 3.6 × 10⁻⁷ (−118 dB under the music): rounding.

## Content
**Psytrance, rebuilt from full-on practice.** Measured on 9.0: one chord (i, or i–bII) for the whole track, the lead one bar of
an acid sequence looped for 48 bars, the bass a single repeated note, nothing but drums and bass for the first 48 bars.
- Progressions that move (natural and harmonic minor, Phrygian; i–bVI–bVII–i, i–bVI–iv–V, i–bII–bVII–i …): a chord every
  4 bars in the drops, every 2 in the breakdowns; the bass roll follows the roots.
- **Trance chords**: gated supersaw chords (the trance gate, three patterns) under the drops, entering three quarters into the
  groove; held chords over the breakdowns.
- **The riff** (a new lead role): a two-bar call and answer in sixteenths that follows the chords diatonically — pedal, rolling
  arpeggio, 3+3+2 gallop or stepwise melody — with a variation for alternate eight bars and a turnaround bar into the next
  phrase. In the build it teases (more of it every bar, the filter opening); over the breakdown its **theme** plays in long
  gliding notes.
- **The acid line** as a second voice: two bars, following the chord roots, answering the riff in its gaps; it enters halfway
  through the first groove with its filter opening and carries on through the drops.
- The psy palette: sync screamer, talking, glass-FM, hyperwave and acid riff voices, wavetable and glass chords, the acid sequence,
  psy plucks and bells. The riff and the acid voice play sixteenths all through a drop, so they take only voices that suit that:
  the screech (psy-scream) and the FM zap measured 6–12 dB too bright above 5.6 kHz as a riff (the first full suite run caught
  psytrance at +7.1 dB at 8 kHz against the master curve); the scream stays for melodic hooks (progressive psy's second
  voice). Psytrance's mastering EQ is now calibrated on the tracks as the app plays them, its palette included (`tone_cal.cjs --app`).
- Progressive Psy gets the same development (gated chords every four bars, arpeggio lead with variations).

**Every genre: parts that develop over eight bars** (measured on 9.0: the same lead bar for a whole drop, 8–27 repeats):
- sequenced leads (techno, hard techno, acid, breakbeat): two bars, a call and its answer;
- vocal chops (house, deep / tech house, UK garage, amapiano, future bass, Jersey club): alternate eight bars swap the rhythm
  and the voicing, every fourth bar re-cuts its last beat;
- arpeggios (melodic techno, progressive house, prog psy, afro house, downtempo, electro, trance, synthwave): alternate eight
  bars play the pattern rotated with its last beat an octave up, and the phrase's last bar runs up the chord tones into the next.

`tools/content_audit.cjs` measures what each genre's tracks contain — distinct chords, chord changes per 16 bars of the drops,
how often the lead's bar repeats, the longest drums-and-bass-only stretch, the bass notes, the layers per section — and grades
it against the genre's practice (static harmony is idiomatic only in techno, hard techno, dub techno and acid).

## Checked
On a 2-core cloud machine, headless Chromium with a virtual sound card. **What this machine cannot do: reproduce the Android
failure itself** (its sound card is simulated, and Chrome's Android audio path is not there). What it can show is whether the engine
keeps up — on a CPU emulated several times slower, through Auto-DJ's track loads, analysis and mixes — and whether the page picks
the right engine when it sees an Android phone.

**A set played the way you play it** (`tools/session_test.cjs`: the start card, psytrance, *A gig*, Auto-DJ on, hands off; the
page sees a Pixel 7 with Chrome; the engine rendered 3× or 6× per block — a device 3× or 6× slower than this machine):
| run | engine picked | the render-ahead player ran dry | lowest cushion (of 340 ms) | eco steps | transport jumps | sound-card glitches* |
|---|---|---|---|---|---|---|
| Android, ×3, 8 min, 2 mixes | Stable · gig (42 ms context) | 0 | 325 ms | 0 | 0 | 1 |
| Android, ×6, 8 min, 2 mixes | Stable · gig | 0 | 325 ms | 0 | 0 | 1 |
| desktop (9.0's gig engine), ×3, 8 min, 2 mixes | Live · safe | — | — | 0 | 0 | 0 |

\* this machine's audio thread runs without real-time priority and shares two cores with the browser's own processes; an
earlier 12-minute run showed what that means — while another job ran on the machine for 45 s, the worker was starved (its load
read 134 %), the player ran dry once (about a third of a second of silence), the cushion grew to 662 ms, the engine stepped to eco 2, and it stepped back to eco 0 by
itself 50 s after the job ended and played the next mix clean.

**The busy points of a set** (`tools/busy_test.cjs --android`: steady play · a new track composed and analysed on deck B · the
mix · a WAV export while playing · 24 ear-candy pads): 0 · 0 · 0 · 0 · 0 glitch events (sound card and player together).

**CPU** (`tools/cpu_bench.cjs`, every genre: deck A's peak section with deck B mixing in, best of two runs, the same machine and
script for both versions): mean 13.0 % of real time on 9.0 → 12.3 % on 9.1; techno −3.3, trance −2.0, melodic techno −2.0,
synthwave −2.0, dnb −1.4 points; psytrance +2.5 (it now plays chords, a riff and a second voice where 9.0 had one looped bar).
The eco-2 supersaw got its own loop after a first version slowed the full stack by ~5 % in trance; the full stack's code is
unchanged and the WebAssembly voice is bit-identical to the JavaScript one. A thinned supersaw (eco 2) measures within 0.5 dB of
the full one. Every performance effect alone adds less than this machine's measurement noise (~2 %); all of them at once ~4 %.

**Full suite** (`node tools/ci.cjs --full`): 43 of 44 graded steps passed on the first run; `signature` failed — psytrance's
drop sat +7.1 dB over the master curve at 8 kHz with its palette sounds (see Content: the riff voices). After the fix, the steps
that measure the sound were run again — `bank` (all 130 presets level-matched, clean), `truepeak` (worst −1.10 dBTP), `signature`
(33 of 33 genres within ±7 dB in every octave), `audio` and `audio-parts` (the independent ffmpeg / numpy audits), `verify` (the
critic, 33 genres: 0 failing checks; the same 3 warnings as 9.0 — kick/bass separation in deep house and dub techno, stereo width
in acid) — all pass. The browser suites (startup, jumps, stall, soak, liveset, capture, the UI layers) passed in the first run;
the fix changed sound only. Critic run: `verification/v9_1_33genres_seed11.jsonl`.

**Content and balance**: `tools/content_audit.cjs all` — every genre within its practice. The mix balance (each stem relative to
the kick over the main drop, two seeds) against 9.0: unchanged within 0.75 LU in every genre except the two psy genres, which were
recalibrated on purpose (psytrance: the riff −0.9 LU, the second voice +0.8; progressive psy: the arpeggio −0.8 — its gated
chords keep their own target, −8 LU, where full-on psy's sit at −10 behind the riff).
