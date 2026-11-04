# FORGE Score Format v1: a guide for writing music with an AI model

FORGE is a two-deck instrument that plays songs written as plain JSON. A **score** describes a song: genre, key, tempo, form, drum lanes, bass lines, chord progressions, melodies, sounds and mix. FORGE validates the score, composes whatever you left out from the genre's rules, and plays it sample-accurately. Write only the parts you care about; every other part comes from the genre.

**Your job when asked for a song:** return one JSON object in this format, inside a ```json block, with no comments. It must be valid JSON: double quotes, no trailing commas.

## 1. The smallest valid score
```json
{ "forge": 1, "genre": "deep-house" }
```
This is a complete deep-house track. Add fields only to say something the genre would not say by itself.

## 2. Top-level fields

| field | type | meaning |
|---|---|---|
| `forge` | `1` | required: the format version |
| `genre` | id | required: one of the genre ids in section 9 |
| `title` | string | the song's name |
| `mood` | `emotional deep dreamy uplifting dark hypnotic` | picks the harmony by feeling: mode, progression, chord colour and harmonic rhythm. An explicit `harmony` / `mode` still wins. Prefer this over choosing scales. |
| `seed` | int ≥ 0 | fixes every random choice; the same score always sounds the same |
| `variation` | int ≥ 0 | re-draws the drum, bass and hook choices while keeping the plan |
| `melodySeed` | int ≥ 0 | re-draws only the generated melodies |
| `seeds` | `{ drums, bass, chords }` ints | re-draws only that part (its variations, fills, rhythm choices); everything else stays identical |
| `bpm` | 50–220 | tempo. Stay inside the genre's range unless you mean it |
| `key` | `C C# Db D Eb E F F# Gb G Ab A Bb B` | tonic only. The mode goes in `mode` |
| `mode` | `major minor dorian phrygian lydian mixolydian harmonic phrygdom` | `harmonic` = harmonic minor; `phrygdom` = phrygian dominant |
| `swing` | 50–75 | MPC-style swing on odd 16ths. 50 is straight, 54 light, 56–58 house, 62–66 garage or lo-fi |
| `harmony` | object | section 4 |
| `drums` | object | section 5 |
| `bass` | object | section 6 |
| `chords` | `{ role, rhythm, gate, range }` | role is `stab`, `pad`, `gate` or `none` |
| `lead` | `{ role, rhythm, range }` | role is `hook`, `arp`, `chop` (vocal chops), `seq` (mono sequence), `riff` (a rolling two-bar riff that follows the chords — psytrance) or `none` |
| `form` | array | section 3: the arrangement, section by section |
| `sound` | object | section 8 |
| `mix` | `{ lufs, verb, delay, echo, sidechain, heat, punch }` | loudness target −20…−5, sends 0…1, `echo` 0…2 = the harmonic echo send, sidechain pump 0…0.9; `heat` 0…2 = saturation on every channel (warmth, grit; 1 = the genre's own), `punch` 0…2 = transient shaping on the drums |
| `notes` | string | free text for people; ignored by the engine |
| `length` | `radio club extended` | (v9.4) how long the generated form is when no `form` is written: Radio about 3–4 minutes, Club 6–8 (house, techno), Extended about 1.4× Club |

## 3. Form: the arrangement
`form` is an ordered list of sections. Each section has:
- `section`: one of `intro groove break build drop outro`. This sets what the section does: builds get a riser, a high-pass sweep and a snare-up; drops get an impact; breaks get a downlifter.
- `bars`: 1–128. Use multiples of 4, ideally 8 or 16. DJs mix on 16- and 32-bar phrases.
- `layer` (optional): which parts play. Either a name or an object of part levels from 0 to 1:
  - Names: `drums0 drums1 intro groove groove2 verse break break2 build drop outro chillA chillB ambA ambB`.
  - The default for each section type is its own name; `intro` defaults to `drums1`, a DJ-friendly drums-only intro.
  - Object example: `{"kick":1,"hats":1,"bass":0.7,"pad":1}`. The parts are `kick snare hats perc bass chords pad lead texture`. A level below 1 means filtered or thinned, and 0 or absent means silent.
- `drums` / `bass` (optional): the name of a pattern from `drums.patterns` / `bass.patterns`, or a list of names that switch every 8 bars (`["A","B"]` gives A for 8 bars, then B, then A…).
- `progression` and `barsPerChord` (optional): harmony for this section only.
- `melody` (optional): a written lead melody for this section (section 7). It plays even where the layer has no lead part.
- `name` (optional): a label such as `"drop 2"`.
- `level` (optional): the section's loudness relative to the drop, in dB, from −12 to 3. Each genre already has measured levels (break about −6, groove −2, build rising into the drop), so set this only to break the rule on purpose.

The total length is at most 512 bars. A club track is about 112–160 bars.

## 4. Harmony
```json
"harmony": { "progression": ["i", "bVI", "bIII", "bVII"], "barsPerChord": 2, "extension": "add9", "breakBarsPerChord": 4 }
```
Chords are roman numerals relative to the key:
- Uppercase is major and lowercase is minor.
- A `b` or `#` prefix borrows a chord from outside the key.
- An optional suffix sets the quality: `7 maj7 m7 9 maj9 add9 sus2 sus4 dim 5 6 11`.
- `extension` colours every chord: `triad 7 9 add9 sus2 power`.
- `barsPerChord` is 1, 2, 4 or 8. The progression loops for the whole track.
- `breakBarsPerChord` slows the harmony in breaks.

Progressions that work:
- Minor: `i bVI bIII bVII`, `i iv bVII bIII`, `i bVII bVI bVII`, `i v bVI iv`.
- Major: `I V vi IV`, `vi IV I V`.
- Jazzy: `ii7 V7 Imaj7 vi7`.

The bass, chords, pad, arps and generated melodies all follow the harmony automatically.

## 5. Drums: lanes of 16 steps per bar
```json
"drums": {
  "patterns": {
    "A": { "kick": "X...X...X...X...", "snare": "....X.......X...", "closed": "x.x.x.x.x.x.x.x.", "open": "..x...x...x...x." },
    "B": { "kick": "X...X...X...X...|X...X...X...X.x.", "closed": "xxxxxxxxxxxxxxxx",
           "perc": [ { "kind": "conga", "steps": "..x..x.x..x...x." } ] }
  },
  "fill": ["............xxxx"]
}
```
- One character per 16th note:
  - `X` accent, `x` normal, `o` soft, `g` ghost, `.` rest.
  - Hat lanes also take `r`, `z` and `q`: rolls of 2, 3 and 4 hits inside one step.
- Lanes: `kick snare rim closed open ride shaker`, plus `perc`, a list of `{kind, steps, note?}`.
  - Percussion kinds: `tom conga bongo cowbell clave wood tamb timbale tick agogo guiro triangle djembe taiko maraca cajon rim` (16 in all; `rim` plays on the snare channel). Each percussion row takes its own kind; the percussion kit (`sound.perc`) tunes all of them at once.
  - `note` is an optional MIDI pitch for toms and congas.
- A lane can be 16, 32, 48 or 64 steps long (1–4 bars). It loops on its own. Spaces and `|` are ignored, so use them to mark bars or beats.
- Patterns have names that sections refer to. Without references the genre decides: drops rotate through the patterns and grooves use the first.
- `fill`: a list of one-bar snare fills played at phrase ends, or `false` for no fills.
- `vary` (0–1, default 0.5): how much each section varies the patterns. It adds and removes ghost notes, hat rolls and percussion; written hits are never removed, and the four-on-the-floor kick never changes. Use 0 to play exactly as written.
- The genre's own snare type applies: rim in amapiano, clap in house and so on.

## 6. Bass: tokens that follow the chords
```json
"bass": { "patterns": { "A": ".RRR.RRR.RRR.RRR", "B": "R..R..R.R..R..RO" }, "gate": 0.8 }
```
One token per 16th:

| token | plays |
|---|---|
| `R` | chord root |
| `O` | root an octave up |
| `F` | fifth |
| `T` | third |
| `S` | seventh |
| `A` | approach note into the next chord |
| `N` | next chord's root |
| `P` | passing tone |
| `-` | hold the previous note |
| `.` | rest |

A lowercase token (`r o f t s a n p`) **slides** into the note (legato glide, 303/808 style).

Because the tokens name chord functions, not pitches, a bass line stays correct in any key and over any progression. `vary` (0–1, default 0.4) adds octave jumps, slides and pickups that never land on a kick step. `gate` (0.2–1) is the note length as a fraction of its slot. Patterns can be 1–4 bars long and are referenced from `form` like drum patterns.

## 7. Melodies: one token per 16th, bars split by `|`
```json
"melody": "C5 - - Ab4 . . C5 - Eb5 - - . C5 - Bb4 . | Ab4 - - - - - . . F4 - G4 - Ab4 - C5 -"
```
Each bar has **exactly 16 tokens**:
- A note name with an octave (`C5`, `F#4`, `Bb3`; C4 is middle C).
- `-` extends the previous note by one 16th; `.` is a rest.
- Prefixes: `!` accents a note (`!C5`) and `~` slides into it (`~D5`).
- `E5:6` gives an explicit length in 16ths, which may cross the bar line.

The bars cycle over the section: a 2-bar melody in a 16-bar drop plays 8 times. Write 2, 4 or 8 bars.

Rules for melodies that sound good:
- Land on chord tones on beats (steps 1, 5, 9, 13) and use passing notes between them.
- The validator warns when a strong-beat note sits a semitone above a chord tone. That is almost always a typo.
- Keep leads between C4 and C6 (`lead.range`, default about E4–C6).
- Leave space: rests are part of a hook.
- If the chords change every 2 bars, write the melody in 2-bar thoughts: question (bars 1–2), answer (bars 3–4).

## 8. Sound
```json
"sound": { "lead": { "model": "supersaw", "cut": 2400, "aRel": 0.3 }, "kick": { "len": 0.5, "fEnd": 48 }, "bass": { "drive": 2 } }
```
- Slots: `kick snare hats perc bass chords pad lead arp`.
- Synth models: `sub b808 reese acid pluck wobble fm organ log supersaw pad stab piano ep bell kspluck vox hoover screech strings brass lead saw square wt`.
- (v9.4) Eight more engines: `fm4` (4-operator FM: `algo` 0–7, `r1…r4` ratios, `i2…i4` indexes, `fb` feedback, `md`/`ms` the modulators' decay and sustain), `pd` (phase distortion: `pdw` 0 saw · 1 square · 2 resonant, `dcw` 0–1, `det2` detune), `add` (additive: `tilt`, `odd`, `fpk` formant Hz, `fwd`, `shimmer`, `stretch`), `modal` (struck: `mat` 0 marimba · 1 vibes · 2 glass · 3 bell · 4 kalimba · 5 wood · 6 steel · 7 tube, `hard`), `grain` (granular: `gsize` s, `density`, `scan`, `gjit`, `noiseAmt`), `hyper` (nine saws: `detune`, `oct2`), `va` (two oscillators: `osc1`/`osc2` 0 saw · 1 square · 2 triangle · 3 sine, `det2` semitones, `oct2`, `sync`, `ring`, `xmod`, `pw`), `pluck2` (string: `body`, `pick`, `bright`). On these, `flt` picks the filter (−1 the engine's own, 0 none, 1 ladder, 2 12 dB, 3 MS-20-style, 4 SEM-style with `fmorph`, 5 diode, 6 band-pass, 7 formant with `vow`/`vowLfo`), `dtype` the drive (0 none, 1 soft, 2 tape, 3 fold, 4 crush, 5 tube) with `drv` 0–1, and `stereo` 0–1 the width.
- Synth parameters:
  - Filter: `cut` (Hz), `res` (0–0.9), `envAmt` (0–1), `fDec` (s).
  - Envelope: `aAtk aDec aSus aRel` (s, except `aSus` 0–1).
  - Character: `detune` (0–1), `drive` (1–5), `glide` (s), `width` (0–1), `gain` (level, about 0.2–1.5).
- Kick parameters: `fEnd` (tuning, Hz), `len` (length in beats), `punch`, `click`, `drive`, `gain`.
- Snare parameters: `kind` (`snare clap rim`), `tone` (Hz), `nDec`, `snap`, `clapTail`, `gain`.
- Hats parameters: `cDec`, `oDec`, `hpF`, `base`, `gain`.
- Percussion parameters: `pitch` (tuning, ×0.5–2), `dec` (decay, ×0.3–2.5), `noise` (noise and slap, ×0–2), `gain`.
- LFO (any synth slot): `lfoSync` sets beats per cycle (tempo-locked: 0.5 = 1/8 note, 4 = one bar). `lfoDepth` sends it to the filter and `lfoAmp` to the volume. `lfoShape` is 0 sine, 1 gate or 2 saw. Gate shape on a pad gives a trance gate; filter depth on an acid line gives a psy squelch.
- Filter automation is written by the composer for you: breaks darken and open, builds rise, psy and acid lines sweep over 16–32 bars.

**Presets** (the sound bank): `"sound": { "lead": { "preset": "neon-pluck" } }` replaces the slot's sound with a curated
one. Any fields after `preset` adjust it (`{ "preset": "hyper-saw", "cut": 3600 }`). Changing a sound with a preset or model
keeps the part at the genre's measured level automatically, so it never wrecks the mix.
<!--PRESETS-->

Only override what you mean to change. The genre kits are measured and balanced.

## 9. Genres
<!--GENRES-->

## 10. How a song gets checked (you can run this loop)
```
node tools/forge.cjs check song.json     # errors with path + fix, warnings, musical lint, summary of the form/chords/events
node tools/forge.cjs grade song.json     # renders the peak section through the real engine and grades it (loudness, kick grammar, chords audible, low end, clicks)
node tools/forge.cjs export techno 7     # a complete score for a generated track: a starting point to edit
```
In the app, open the **Score** tab in the bottom dock. Paste the JSON, press **Check**, then press **Apply** (it swaps in on the next 4 bars) or **Load as a new track**.

Each error names the exact path, for example `form[3].melody: bar 2 has 15 tokens — write exactly 16`. Fix it and check again.

## 11. A complete example
```json
{
 "forge": 1, "title": "Midnight Ferry", "genre": "melodic-techno", "seed": 2026,
 "bpm": 124, "key": "F", "mode": "minor",
 "harmony": { "progression": ["i", "bVI", "bIII", "bVII"], "barsPerChord": 2, "extension": "add9" },
 "drums": { "patterns": {
   "A": { "kick": "X...X...X...X...", "snare": "....x.......x...", "closed": "gxgxgxgxgxgxgxgx", "open": "..x...x...x...x." },
   "B": { "kick": "X...X...X...X...|X...X...X...X.g.", "snare": "....x.......x...", "closed": "gxxxgxxxgxxxgxxx", "open": "..x...x...x...x.", "ride": "..g...g...g...g." } } },
 "bass": { "patterns": { "A": ".RRR.RRR.RRR.RRR", "B": ".RRO.RRR.RRF.RRR|.RRO.RRR.RRO.RRA" }, "gate": 0.6 },
 "lead": { "role": "hook", "range": [62, 84] },
 "form": [
  { "section": "intro", "bars": 16, "drums": "A", "bass": "A" },
  { "section": "groove", "bars": 16, "drums": "A", "bass": "A" },
  { "section": "break", "bars": 16, "progression": ["bVI", "bVII", "i", "i"] },
  { "section": "build", "bars": 8 },
  { "section": "drop", "bars": 32, "drums": ["B"], "bass": ["B", "A"],
    "melody": "C5 - - Ab4 . . C5 - Eb5 - - . C5 - Bb4 . | Ab4 - - - - - . . F4 - G4 - Ab4 - C5 - | Db5 - - Ab4 . . Db5 - F5 - - . Eb5 - Db5 . | C5 - - - - - . . Ab4 - Bb4 - C5 - Db5 -" },
  { "section": "outro", "bars": 16, "drums": "A", "bass": "A" }
 ]
}
```

## 12. Writing checklist
1. Pick the genre first. Its tempo, swing, drum grammar and sounds carry most of the style.
2. Choose the key and mode, then a progression with 2–4 chords. Choose `barsPerChord` by genre: 1 for pop and trance energy, 2 for most club music, 4 for techno.
3. Write the form: a 16-bar intro, a groove, a break, an 8-bar build, a 16–32-bar drop, and an outro for DJs.
4. Write 1–3 drum patterns and 1–2 bass lines, and point the sections at them.
5. Write the drop hook last, on the chords; then optionally a slower break melody.
6. Check it. Fix every error, and read every warning.

## 13. Sounding like the style (v9)
The genre kits already carry each style. When you change sounds, keep the signature ones:
- **Psytrance / progressive psy**: kick `psy-kick` (tight, gone before the first bass sixteenth), snare `psy-snare`, hats `psy-hats`; bass `psy-roll`, `psy-fm-roll`, `psy-hollow-roll` (full-on) or `psy-prog-roll` (progressive) on `.RRR.RRR.RRR.RRR`; lead `psy-acid` or `squelch` as a `seq`; second voice `psy-scream`, `psy-bell` or `psy-pluck`; pad `psy-pad` only in intros, breakdowns and builds. The composer flies ear candy (zaps, squelches, bubbles, lasers, swirls) over psy drops by itself.
- **Techno**: kick `rumble-kick` (hard techno: `hard-rumble`) — the rumble fills the beat between the kicks; a kick's `rumble` (0–1) sets it.
- **Trap, drill, hip hop**: bass `modern-808`, snare `trap-clap` (a clap stacked on a snare: the snare's `layer`, 0–1, is the level of the other sound under every hit).
- **Big room, future bass, EDM**: snare `big-clap`.
- A bass with `sub` keeps its fundamental; `subPost: 1` adds the sub after the filter (for resonant rolling basses).
