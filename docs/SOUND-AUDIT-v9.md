# Sound audit (v9): what kept the genres from sounding professional, measured

Every number here comes from the engine's own code rendering the music offline (tools/render.cjs), measured with plain FFTs and
BS.1770 loudness — the same path the app plays. The checks that keep these fixed run in `tools/signature_test.cjs`.

## 1. The sub oscillator cancelled the bass fundamental
The `sub` parameter adds a sine at the note's fundamental, to give a bass its weight. On the saw-based models
(acid, pluck, saw, lead) the saw's own fundamental is −sin; v8 added +sin. Result, measured at 55 Hz on a held note:

| model | fundamental, sub 0 | sub 0.6 (v8) | sub 0.6 (v9) |
|---|---|---|---|
| acid / pluck / saw / lead | 63.6 dB | 37.4 dB (**−26.2**) | 69.2 dB (+5.6) |
| pluck, 2 saws | 65.1 | 51.7 (−13.5) | 70.0 (+4.8) |
| reese | 71.2 | 67.6 (−3.6) | 74.2 (+3.0) |
| FM basses (fm-growl, fm-bass) | — | −12…−16 dB vs the sub inverted | in phase |

The psy roll measured 3 % of its energy at 45–70 Hz (its own fundamental) and 75 % at 250–500 Hz for the FM roll: a honky
mid-bass, not a psy bass. To make up for the missing weight the calibration had pushed the bass channel up 9–14 dB and the
master sub shelf to its +9 dB limit in seven genres. After the fix and a full recalibration the bass trims came down
6–9 dB (house 11.1 → 4.3 dB, techno 13.8 → 5.0, trance 8.9 → 1.0, psytrance 9.7 → 3.9) and the sub shelves with them.

## 2. Kicks that were knocks
Share of a single kick's energy below 70 Hz (its body) — v8 → v9 (the pitch envelope retuned; punch and click kept):

| genre | v8 | v9 | genre | v8 | v9 |
|---|---|---|---|---|---|
| techno | 9 % | 43 % | house | 18 % | 44 % |
| hard techno | 7 % | 41 % | tech house | 16 % | 42 % |
| trance | 22 % | 52 % | progressive house | 15 % | 41 % |
| psytrance | 8 % | 46 % | melodic techno | 16 % | 44 % |
| drum & bass | 9 % | 32 % | jersey club | 6 % | 36 % |
| dubstep | 15 % | 37 % | trap | 15 % | 36 % |
| afro house | 25 % | 44 % | nu-disco | 19 % | 45 % |
| big room | 18 % | 40 % | breakbeat | 14 % | 38 % |
| dub techno | 30 % | 46 % | uk drill | 12 % | 32 % |

Hardstyle (its distorted tail is the point) and electro kept their own.

## 3. Psytrance played with house tools
| | v8 | v9 |
|---|---|---|
| kick 45 ms after the hit / at the first bass 16th | knock, 49 % of energy at 120–250 Hz | holds its tuned body, −27 dB at the first bass 16th |
| bass | fundamental cancelled; FM roll 75 % at 250–500 Hz | K-B-B-B with the fundamental leading its 5th harmonic by 28 dB |
| snare | a two-burst house clap | tight snappy snare, short clap layered under it |
| percussion | none | rims, ticks, toms: ~6.8 hits per drop bar |
| ear candy | 0.1 FX per bar (all transitions) | ~0.5 per bar: zaps, squelches, bubbles, lasers, swirls in key with a 3/16 echo |
| pad | none in the breakdowns | a dark pad in intros, breakdowns and builds — never in the drop |
| sub-genres | one | + Progressive Psy |

## 4. Smaller fixes
- A narrow pulse wave carried DC (2·pw − 1): a thump at the note rate under every narrow-pulse lead. Removed.
- The kit parameter `rumble` (techno) had no sound behind it. It now fills the second half of each beat (+11 dB vs a dry kick).
- The screech model (the psytrance hook, the psy scream) sat 6 cents sharp: of its two saws one was in tune and one 12 cents up.
  They are now 12 cents apart centred on the note (tools/pitch_test.cjs: every pitched sound within ±5 cents, worst 4.7).
- **DC offset at the master** (found by the independent audio audit, ffmpeg/numpy): with the sub now in phase, short low notes whose
  oscillators start on the same phase every time (the psy and techno rolls) and the heavier kicks added up to a mean of 0.011–0.017
  on six genres' drops (the gate is 0.01). A DC blocker (one pole, 5 Hz) on the mid before the clip and the limiter brings them to
  0.001–0.006; the exported stems get the same. (A blocker after the limiter took the DC to zero but lifted the true peak by 1.1 dB:
  it shifts the bass's phase against the top. Not used.)
- The new psy bell first used an FM ratio of 3.5, which puts partials between the harmonics (a bell, but not in key under a
  minor-key roll). Ratio 5 keeps it glassy and harmonic.

## 5. Tonal balance of the drops (as the app plays them, two seeds)
Deviation per octave from the modern-master curve (tools/tone_cal.cjs), dB, the peak section of seeds 1 and 2 rendered as the app
plays them (palette sounds). v8.7 sat close to the curve only because the master EQ was compensating for basses without a
fundamental: the sub shelf was at its +9 dB limit in seven genres (trance, progressive house, melodic techno, nu-disco, synthwave,
hardstyle, ambient) — the low end came from boosting everything under 70 Hz, not from the bass. In v9 only ambient and hardstyle
keep it (by design), and psytrance, tech house, hard techno and breakbeat now *cut* the sub (−6 dB): their basses carry the weight.

```
               31    63   125   250   500  1000  2000  4000  8000   max|dev|
psytrance v8.7 -2.8  -0.7   0.8   3.3   1.6  -1.6  -4.3  -3.7  -1.9    4.3
psytrance v9    1.5   0.5  -0.8  -0.2   0.6  -0.6  -0.8  -1.4  -1.8    1.8
prog-psy  v9   -0.9  -2.9  -3.2   0.2   0.4  -0.4  -0.4  -2.9  -1.0    3.2
techno v8.7    -1.0   0.6   2.4  -1.2  -0.7   0.7  -2.6  -3.3  -2.1    3.3
techno v9       0.0  -1.6   0.9   0.1  -0.3   0.3  -2.4  -0.7   1.1    2.4
hardstyle v8.7 -6.2  -8.2  -1.4  -0.4   0.5  -0.5  -2.3  -4.0  -2.4    8.2
hardstyle v9   -4.6   0.0  -1.3  -0.7   0.5  -0.5  -1.5  -3.6  -2.5    4.6
jungle v8.7     3.6  -7.2   0.7   1.8   0.7  -0.7   0.9   3.0  -1.0    7.2
jungle v9       3.6  -6.4   0.3   1.6   0.6  -0.6   1.3   3.9   1.3    6.4
```

| | v8.7 | v9 |
|---|---|---|
| median of the worst octave per genre | 3.4 dB | **3.2 dB** |
| genres within ±6 dB in every octave | 27 / 32 | **30 / 33** |
| largest gains | | hardstyle 8.2 → 4.6, psytrance 4.3 → 1.8, big room 4.5 → 2.9, hard techno 2.9 → 1.5 |
| still outside ±6 | deep house, dubstep, hardstyle, jungle, ambient | dubstep (+6.1 at 4 kHz, its top), jungle (−6.4 at 63 Hz, the break carries it), ambient (no low end by design) |

The full table for all 33 genres: `node tools/tone_balance.cjs` (any source tree, so v8.7 and v9 can be compared). The graded
check is the balance step of `tools/signature_test.cjs`: ±7 dB in every octave (ambient's lows, lo-fi's and dub techno's highs are
character and not graded).

## 6. What still separates this from a commercial record (honest)
- **Synthesis, not samples.** Every drum and instrument is synthesized from a model. That is what makes the instrument infinite and
  tiny, and also why a kick or a snare can be very good but never the exact sound of a sample pack a label uses.
- **No vocals.** Commercial dance music leans on vocals and vocal chops; FORGE has vowel synths and chops, not singers.
- **The ear is still the judge.** Everything above is measured against production practice and reference curves; the final voicing of
  a genre needs listening (the A/B pack shipped with this build: v8.7 vs v9 on the same seeds).
- **Mix automation is per section, not per note.** A producer rides levels, filters and sends inside phrases; FORGE automates
  per section and phrase (filter sweeps, throws, energy) — enough for a DJ set, less than a finished record.
