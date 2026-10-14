# Style analyser

A dev-time tool. It reads Guitar Pro transcriptions and measures how real lead
playing is phrased, then writes those measurements to
`src/generate/styleProfiles.json` for the exercise generator to aim at.

It is not part of the app and never runs in the browser.

## Why it exists

Overture's generator is correct by construction — four independent validators
check theory, rhythm, playability and technique. But correct is not the same as
musical, and the gap was measurable. Against Slash's solo on *Sweet Child
o' Mine*:

| | the solo | the generator |
|---|---:|---:|
| repeated notes | 23% | 0% |
| notes per change of direction | 1.7 | 4.2 |
| notes on the top three strings | 90% | 44% |

The generator never repeated a note, ran in one direction four times too long,
and spent half its time on the bass strings. None of that is a bug in the
validators; it is phrasing, which they were never asked to judge. This tool
replaces guesses about phrasing with numbers.

## Running it

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python analyse.py                      # finds ./songs or ./src/songs
.venv/bin/python analyse.py --songs ~/tabs        # or point it anywhere
```

It writes two files:

- **`src/generate/styleProfiles.json`** — what the app imports. Numbers only:
  no note data and no song titles, so nothing about the source transcriptions
  reaches the shipped bundle.
- **`tools/style-analyser/report.json`** — the same profiles plus which files
  were read, how many lead passages each gave up, and a per-artist breakdown.
  For checking the tool's work. Not shipped, and not committed.

Your `.gp` files stay on your machine. They are gitignored, because they are
copyrighted transcriptions.

## How a lead passage is found

Markers come first: a marker whose name mentions a solo or a lead proposes a
bar range. The four files in the current sample that have no usable marker fall
back to detecting stretches where a track plays single notes rather than chords.

Either way, **every** candidate then has to pass the same test, because neither
method is sufficient on its own:

- A solo marker marks a stretch of *time*, so reading it off every guitar track
  also hands you the rhythm parts playing underneath the solo. That wrongly
  included Sweet Child's second guitar and the whole of A7X's rhythm track.
- Monophony does not settle it either. Hotel California's twelve-string intro
  is one note at a time and is not a lead.

So a passage counts as lead only if consecutive notes stay on one string at
least 30% of the time, and at least half its notes are on the top three
strings. Both thresholds were read off the marked solos in the sample rather
than guessed: arpeggios measure 0.05–0.08 on the first, real leads 0.41–0.77;
low rhythm parts measure 0.00–0.12 on the second. The gate rejected 37 of 82
candidates. A figure that repeats verbatim is counted once.

## What is deliberately not measured

**The key.** A solo does not state its own tonic — the harmony does — and the
diatonic modes are rotations of one pitch-class set, so coverage cannot tell
aeolian from mixolydian. Reading the key off the lead gave the right pitch set
with the wrong root often enough to be useless (C mixolydian for *Sultans of
Swing*, which is in D minor). Reading it off the bass was no better: Hotel
California has no bass track, and elsewhere the most common bass root is
whichever chord gets the most bars, not the tonic.

It also does not matter. Overture generates in whatever key the user picked, so
what the generator needs is the *shape* of note choice, not its absolute
position. The profiles therefore carry rotation-invariant measures —
`coreFiveShare` (how hard playing concentrates on its five most-used notes) and
`chromaticRate` (how much falls outside any seven-note scale) — and nothing
that depends on knowing the tonic. A mode label is still reported under
`likelyScales`, with the share of passages whose root was clear at all, for
interest only. The generator ignores it.

## Adding songs

Drop more `.gp3`/`.gp4`/`.gp5` files in and re-run. Files are named
`artist-title.ext`; the artist is taken from the filename, because the artist
field inside the files cannot be trusted — across the current sample it holds
`Avenged Sevenfold (A7X)`, `guns n roses`, plain `Eagles`, and four empty
strings.

Each artist maps to a broad style in the `STYLES` table at the top of
`analyse.py`. That mapping is a musical judgement rather than something the
files can tell us, so it lives in one readable place; add a line when you add
an artist, or the songs land in `unclassified`.

## Trusting the output

`src/generate/styleProfiles.test.ts` checks the generated JSON on every test
run: rates are shares, interval classes stay disjoint, histograms sum to one,
frets stay on the neck, and the styles actually differ from each other.

That suite exists because a regeneration can go wrong quietly. It did once: a
shadowed variable made the interval histogram report pitch classes instead of
semitone distances, and the profiles cheerfully claimed 58% of lead playing was
wide leaps. The numbers looked like numbers. Now that shape fails a test.
