#!/usr/bin/env python3
"""
Measure the phrasing of real guitar parts, and write out a style profile.

Overture's exercise generator is correct by construction — four validators see
to that — but correct is not the same as musical. This tool closes that gap by
measuring what actual lead playing does: how often it repeats a note, how
often it changes direction, where it sits on the neck, how much of the scale
it really uses. The generator then has numbers to aim at instead of guesses.

Nothing copyrighted comes out of this. The input is Guitar Pro files that stay
on your machine; the output is a few dozen aggregate statistics per style. You
could not reconstruct a bar of music from it.

    python3 analyse.py --songs ../../songs --out ../../src/generate/styleProfiles.json
"""

from __future__ import annotations

import argparse
import collections
import datetime as dt
import glob
import json
import os
import statistics
from dataclasses import dataclass, field

import guitarpro as gp

# ---------------------------------------------------------------- constants

PPQ = 960  # Guitar Pro's duration.value is a denominator; 960/value = ticks
TOP_STRINGS = 3  # the strings lead playing actually lives on
MIN_PASSAGE_NOTES = 24  # below this a passage says nothing reliable

# Thresholds that separate a lead line from a rhythm part, measured against
# the marked solos in the sample rather than guessed. A lead plays runs of
# consecutive notes on one string and lives up near the top of the neck; an
# arpeggio or a chord-tone figure changes string on almost every note, and a
# rhythm part sits on the low strings.
LEAD_SAME_STRING_RATE = 0.30  # arpeggios measure 0.05-0.08, leads 0.41-0.77
LEAD_TOP_STRING_SHARE = 0.50  # low rhythm parts measure 0.00-0.12

# Which broad style each artist stands in for. This is a musical judgement,
# not something the files can tell us, so it lives here where it can be read
# and argued with.
STYLES: dict[str, str] = {
    "avenged-sevenfold": "metal",
    "guns-n-roses": "hard-rock",
    "scorpions": "hard-rock",
    "the-eagles": "classic-rock",
    "dire-straits": "blues-rock",
    "pearl-jam": "grunge",
}

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# Scale templates as semitone offsets, used to work out what a passage is in.
SCALES: dict[str, list[int]] = {
    "minor pentatonic": [0, 3, 5, 7, 10],
    "major pentatonic": [0, 2, 4, 7, 9],
    "blues": [0, 3, 5, 6, 7, 10],
    "aeolian": [0, 2, 3, 5, 7, 8, 10],
    "dorian": [0, 2, 3, 5, 7, 9, 10],
    "phrygian": [0, 1, 3, 5, 7, 8, 10],
    "mixolydian": [0, 2, 4, 5, 7, 9, 10],
    "major": [0, 2, 4, 5, 7, 9, 11],
    "harmonic minor": [0, 2, 3, 5, 7, 8, 11],
}
TECHNIQUE_FLAGS = ("bend", "hammer", "slides", "vibrato", "palmMute", "letRing", "staccato", "ghostNote")


# ---------------------------------------------------------------- the notes

@dataclass
class Note:
    bar: int
    string: int          # 1 = highest-pitched string
    fret: int
    midi: int
    start: int           # ticks from the start of the passage
    dur: int             # ticks
    chord: bool          # sounded together with other notes
    effects: set[str] = field(default_factory=set)
    bend_semitones: float | None = None


def beat_ticks(beat) -> int:
    """A beat's length in ticks, allowing for dots and tuplets."""
    ticks = PPQ / beat.duration.value
    if beat.duration.isDotted:
        ticks *= 1.5
    tuplet = beat.duration.tuplet
    if tuplet.enters != tuplet.times:
        ticks = ticks * tuplet.times / tuplet.enters
    return int(round(ticks))


def bend_size(effect) -> float | None:
    """
    Bend height in semitones. Guitar Pro stores bend points in quarter-tones
    in the older formats, so the raw value is halved.
    """
    bend = getattr(effect, "bend", None)
    if not bend or not bend.points:
        return None
    return max(p.value for p in bend.points) / 2.0


def read_notes(track, first_bar: int, last_bar: int) -> list[Note]:
    tuning = [s.value for s in track.strings]
    out: list[Note] = []
    cursor = 0
    for index, measure in enumerate(track.measures):
        bar = index + 1
        if bar < first_bar or bar > last_bar:
            continue
        for voice in measure.voices:
            for beat in voice.beats:
                ticks = beat_ticks(beat)
                if beat.status.name == "rest" or not beat.notes:
                    cursor += ticks
                    continue
                is_chord = len(beat.notes) > 1
                for note in beat.notes:
                    if note.type.name in ("tie", "dead"):
                        continue
                    effects = {name for name in TECHNIQUE_FLAGS if getattr(note.effect, name, None)}
                    out.append(Note(
                        bar=bar, string=note.string, fret=note.value,
                        midi=tuning[note.string - 1] + note.value,
                        start=cursor, dur=ticks, chord=is_chord,
                        effects=effects, bend_semitones=bend_size(note.effect),
                    ))
                cursor += ticks
    return out


# ------------------------------------------------------- finding the leads

def is_guitar(track) -> bool:
    return not track.isPercussionTrack and len(track.strings) >= 6


def marked_solos(track) -> list[tuple[int, int]]:
    """Bar ranges covered by a marker that names a solo or a lead."""
    marks = [(i + 1, m.marker.title) for i, m in enumerate(track.measures) if m.marker]
    spans: list[tuple[int, int]] = []
    for position, (bar, title) in enumerate(marks):
        if not any(word in title.lower() for word in ("solo", "lead")):
            continue
        end = marks[position + 1][0] - 1 if position + 1 < len(marks) else len(track.measures)
        spans.append((bar, end))
    return spans


def same_string_rate(melodic: list[Note]) -> float:
    """How often consecutive notes stay on one string."""
    if len(melodic) < 2:
        return 0.0
    held = sum(1 for i in range(1, len(melodic)) if melodic[i].string == melodic[i - 1].string)
    return held / (len(melodic) - 1)


def top_string_share(melodic: list[Note]) -> float:
    return sum(1 for n in melodic if n.string <= TOP_STRINGS) / len(melodic)


def is_lead(melodic: list[Note]) -> bool:
    """
    Whether a passage is really lead playing.

    Needed on every candidate, however it was found. A solo marker marks a
    stretch of *time*, so reading it off every guitar track hands you the
    rhythm parts that were playing underneath the solo as well — in this
    sample that wrongly included Sweet Child's second guitar and the whole of
    A7X's rhythm track. Monophony alone does not settle it either: Hotel
    California's twelve-string intro is one note at a time and still not a
    lead.
    """
    return (
        len(melodic) >= MIN_PASSAGE_NOTES
        and same_string_rate(melodic) >= LEAD_SAME_STRING_RATE
        and top_string_share(melodic) >= LEAD_TOP_STRING_SHARE
    )


def detect_lead_runs(track, min_bars: int = 4) -> list[tuple[int, int]]:
    """
    Where a track is playing single notes rather than chords.

    Used when a file has no solo marker. This only proposes spans; `is_lead`
    decides whether each one counts.
    """
    verdict: list[bool] = []
    for measure in track.measures:
        beats = [b for v in measure.voices for b in v.beats if b.status.name != "rest" and b.notes]
        if len(beats) < 3:
            verdict.append(False)
            continue
        single = sum(1 for b in beats if len(b.notes) == 1)
        verdict.append(single / len(beats) >= 0.85)

    runs: list[tuple[int, int]] = []
    start = None
    for index, lead in enumerate(verdict):
        if lead and start is None:
            start = index + 1
        elif not lead and start is not None:
            if index + 1 - start >= min_bars:
                runs.append((start, index))
            start = None
    if start is not None and len(verdict) + 1 - start >= min_bars:
        runs.append((start, len(verdict)))
    return runs


# ------------------------------------------------------------- the metrics

def scale_template(offsets: list[int]) -> list[float]:
    """
    How much weight each pitch class should carry if a passage is in this scale.

    Coverage alone cannot name a mode: aeolian, mixolydian and major are
    rotations of one pitch-class set, so every one of them "covers" the notes
    equally well and the winner comes down to dict order. What separates them
    is which note the passage leans on. So the tonic is weighted hardest, then
    the fifth and third, then the rest of the scale, and the result is
    correlated against what was actually played.
    """
    template = [0.0] * 12
    for offset in offsets:
        if offset == 0:
            weight = 5.0
        elif offset == 7:
            weight = 3.0
        elif offset in (3, 4):
            weight = 2.5
        else:
            weight = 1.5
        template[offset % 12] = weight
    return template


def correlate(observed: list[float], template: list[float]) -> float:
    """Pearson correlation of two 12-element pitch-class vectors."""
    n = 12
    mean_o, mean_t = sum(observed) / n, sum(template) / n
    do = [v - mean_o for v in observed]
    dt = [v - mean_t for v in template]
    denominator = (sum(v * v for v in do) * sum(v * v for v in dt)) ** 0.5
    return sum(a * b for a, b in zip(do, dt)) / denominator if denominator else 0.0


def detect_key(notes: list[Note]) -> tuple[int, str, float]:
    """
    Best-fitting root and scale for a passage.

    Krumhansl-Schmuckler in miniature: correlate the pitch-class histogram
    against a weighted template for every root and scale, and take the best
    fit. Where a passage resolves is also a strong cue, so ending on a
    candidate root earns a small bonus.
    """
    counts = collections.Counter(n.midi % 12 for n in notes)
    total = sum(counts.values()) or 1
    observed = [counts[pc] / total for pc in range(12)]
    final = notes[-1].midi % 12 if notes else None

    scored: list[tuple[float, int, str]] = []
    for root in range(12):
        rotated = [observed[(root + i) % 12] for i in range(12)]
        resolves = 0.04 if final is not None and final == root else 0.0
        for name, offsets in SCALES.items():
            # Prefer the tightest scale that still explains the notes, so a
            # pentatonic passage is not reported as "major" just because the
            # bigger scale happens to contain it too.
            score = correlate(rotated, scale_template(offsets)) - 0.004 * len(offsets) + resolves
            scored.append((score, root, name))

    scored.sort(reverse=True)
    score, root, name = scored[0]
    # How clearly the winner beat the next candidate with a different root.
    rival = next((s for s, r, _ in scored[1:] if r != root), score)
    return root, name, max(0.0, score - rival)


def core_five_share(notes: list[Note]) -> float:
    """
    How much of a passage sits on its five most-used pitch classes.

    Deliberately independent of any tonic. Rock lead playing concentrates on a
    five-note core, and that concentration is what the generator needs to
    imitate; which five they are depends on the song's key, which is both
    unknowable from a solo alone and irrelevant here, since Overture generates
    in whatever key the user picked.
    """
    counts = collections.Counter(n.midi % 12 for n in notes)
    top_five = sum(c for _, c in counts.most_common(5))
    return top_five / max(1, sum(counts.values()))


def chromatic_rate(notes: list[Note]) -> float:
    """
    Share of notes falling outside the best-fitting seven-note scale.

    Invariant under modal rotation — every rotation of a diatonic set contains
    the same notes — so unlike a mode name this number is trustworthy.
    """
    counts = collections.Counter(n.midi % 12 for n in notes)
    total = sum(counts.values()) or 1
    best = 0
    for root in range(12):
        for offsets in ([0, 2, 4, 5, 7, 9, 11], [0, 2, 3, 5, 7, 8, 10]):
            members = {(root + o) % 12 for o in offsets}
            best = max(best, sum(c for pc, c in counts.items() if pc in members))
    return 1.0 - best / total


def runs_of_direction(melodic: list[Note]) -> list[int]:
    steps = [
        1 if melodic[i].midi > melodic[i - 1].midi else -1 if melodic[i].midi < melodic[i - 1].midi else 0
        for i in range(1, len(melodic))
    ]
    moving = [s for s in steps if s]
    if not moving:
        return [0]
    runs, current = [], 1
    for i in range(1, len(moving)):
        if moving[i] == moving[i - 1]:
            current += 1
        else:
            runs.append(current)
            current = 1
    runs.append(current)
    return runs


def share(counter: collections.Counter, total: int, places: int = 3) -> dict[str, float]:
    return {str(k): round(v / total, places) for k, v in sorted(counter.items())}


def measure_passage(notes: list[Note]) -> dict | None:
    """Every statistic for one lead passage. None when there is too little to say."""
    melodic = [n for n in notes if not n.chord]
    if not is_lead(melodic):
        return None

    intervals = [abs(melodic[i].midi - melodic[i - 1].midi) for i in range(1, len(melodic))]
    counts = collections.Counter(min(i, 12) for i in intervals)
    total_intervals = len(intervals)

    runs = runs_of_direction(melodic)
    reversals = max(1, len(runs) - 1)

    durations = collections.Counter(n.dur for n in melodic)
    dominant = durations.most_common(1)[0]

    spans = []
    for i in range(len(melodic) - 3):
        frets = [n.fret for n in melodic[i:i + 4] if n.fret > 0]
        if len(frets) > 1:
            spans.append(max(frets) - min(frets))

    effects = collections.Counter()
    for n in melodic:
        effects.update(n.effects)
    bends = [n.bend_semitones for n in melodic if n.bend_semitones]

    root, scale, confidence = detect_key(melodic)
    pitch_counts = collections.Counter(n.midi % 12 for n in melodic)
    core = {pc for pc, _ in pitch_counts.most_common(5)}

    # What a bar tends to end on — the thing the generator never does.
    by_bar: dict[int, list[Note]] = collections.defaultdict(list)
    for n in melodic:
        by_bar[n.bar].append(n)
    last_notes = [bar_notes[-1] for bar_notes in by_bar.values() if bar_notes]
    ends_on_core = sum(1 for n in last_notes if n.midi % 12 in core) / max(1, len(last_notes))

    strings = collections.Counter(n.string for n in melodic)
    frets = [n.fret for n in melodic if n.fret > 0] or [0]

    return {
        "notes": len(melodic),
        "bars": len(by_bar),
        "notesPerBar": round(len(melodic) / max(1, len(by_bar)), 2),
        "intervals": {
            "histogram": share(counts, total_intervals),
            "repeatRate": round(counts[0] / total_intervals, 3),
            "stepwiseRate": round(sum(v for k, v in counts.items() if 0 < k <= 3) / total_intervals, 3),
            "leapRate": round(sum(v for k, v in counts.items() if k >= 5) / total_intervals, 3),
        },
        "contour": {
            "notesPerReversal": round(len([r for r in runs for _ in range(r)]) / reversals, 2),
            "medianRun": round(statistics.median(runs), 2),
            "maxRun": max(runs),
        },
        "rhythm": {
            "histogram": share(durations, len(melodic)),
            "dominantTicks": dominant[0],
            "dominantShare": round(dominant[1] / len(melodic), 3),
        },
        "technique": {name: round(effects[name] / len(melodic), 3) for name in TECHNIQUE_FLAGS},
        "bends": {
            "rate": round(len(bends) / len(melodic), 3),
            "medianSemitones": round(statistics.median(bends), 2) if bends else None,
            "wholeStepShare": round(sum(1 for b in bends if b >= 1.75) / len(bends), 3) if bends else None,
        },
        "hand": {
            "medianSpan": statistics.median(spans) if spans else 0,
            "p90Span": sorted(spans)[int(len(spans) * 0.9)] if spans else 0,
            "maxSpan": max(spans) if spans else 0,
        },
        "strings": {
            "topThreeShare": round(top_string_share(melodic), 3),
            "sameStringRate": round(same_string_rate(melodic), 3),
            "distribution": share(strings, len(melodic)),
        },
        "position": {
            "medianFret": statistics.median(frets),
            "lowFret": min(frets),
            "highFret": max(frets),
        },
        "tonality": {
            "coreFiveShare": round(core_five_share(melodic), 3),
            "chromaticRate": round(chromatic_rate(melodic), 3),
            "distinctPitchClasses": len(pitch_counts),
            # Advisory only. A solo does not state its own tonic — the
            # harmony does — so treat a low confidence as "unknown".
            "likelyRoot": NOTE_NAMES[root],
            "likelyScale": scale,
            "rootConfidence": round(confidence, 3),
        },
        "phraseEnds": {"onCoreFive": round(ends_on_core, 3)},
    }


# ----------------------------------------------------------- the aggregate

NUMERIC_PATHS = [
    ("notesPerBar",), ("intervals", "repeatRate"), ("intervals", "stepwiseRate"), ("intervals", "leapRate"),
    ("contour", "notesPerReversal"), ("contour", "medianRun"),
    ("rhythm", "dominantShare"), ("bends", "rate"), ("bends", "medianSemitones"), ("bends", "wholeStepShare"),
    ("hand", "medianSpan"), ("hand", "p90Span"),
    ("strings", "topThreeShare"), ("strings", "sameStringRate"), ("position", "medianFret"),
    ("tonality", "coreFiveShare"), ("tonality", "chromaticRate"),
    ("tonality", "distinctPitchClasses"), ("phraseEnds", "onCoreFive"),
]
HISTOGRAM_PATHS = [("intervals", "histogram"), ("rhythm", "histogram"), ("strings", "distribution")]
# A ceiling is the highest one seen, not the average of several ceilings.
MAX_PATHS = [("contour", "maxRun"), ("hand", "maxSpan"), ("position", "highFret")]
MIN_PATHS = [("position", "lowFret")]


def dig(data: dict, path: tuple[str, ...]):
    for key in path:
        if data is None:
            return None
        data = data.get(key)
    return data


def put(data: dict, path: tuple[str, ...], value) -> None:
    for key in path[:-1]:
        data = data.setdefault(key, {})
    data[path[-1]] = value


def combine(passages: list[dict]) -> dict:
    """
    Weight each passage by how many notes it contributed, so a 60-bar solo
    counts for more than a four-bar fill.
    """
    weights = [p["notes"] for p in passages]
    total = sum(weights)
    out: dict = {"notes": total, "bars": sum(p["bars"] for p in passages), "passages": len(passages)}

    for path in NUMERIC_PATHS:
        pairs = [(dig(p, path), w) for p, w in zip(passages, weights) if dig(p, path) is not None]
        if not pairs:
            put(out, path, None)
            continue
        put(out, path, round(sum(v * w for v, w in pairs) / sum(w for _, w in pairs), 3))

    for path in MAX_PATHS:
        put(out, path, max(dig(p, path) for p in passages))
    for path in MIN_PATHS:
        put(out, path, min(dig(p, path) for p in passages))

    for path in HISTOGRAM_PATHS:
        merged: collections.Counter = collections.Counter()
        for passage, weight in zip(passages, weights):
            for key, value in (dig(passage, path) or {}).items():
                merged[key] += value * weight
        put(out, path, {k: round(v / total, 4) for k, v in sorted(merged.items(), key=lambda kv: -kv[1])})

    techniques: collections.Counter = collections.Counter()
    for passage, weight in zip(passages, weights):
        for name, rate in passage["technique"].items():
            techniques[name] += rate * weight
    out["technique"] = {k: round(v / total, 3) for k, v in sorted(techniques.items(), key=lambda kv: -kv[1])}

    # Reported for interest, not for the generator to act on, and only for the
    # passages whose root was actually clear.
    confident = [(p, w) for p, w in zip(passages, weights) if p["tonality"]["rootConfidence"] >= 0.02]
    scales: collections.Counter = collections.Counter()
    for passage, weight in confident:
        scales[passage["tonality"]["likelyScale"]] += weight
    confident_total = sum(w for _, w in confident)
    out["likelyScales"] = {
        "share": round(confident_total / total, 3),
        "mix": {k: round(v / confident_total, 3) for k, v in scales.most_common()} if confident_total else {},
    }
    return out


# ------------------------------------------------------------------- main

def passage_fingerprint(notes: list[Note]) -> tuple:
    """Identifies the same figure played twice, so a repeat is not counted twice."""
    return tuple((n.string, n.fret, n.dur) for n in notes if not n.chord)


def analyse_song(path: str) -> tuple[dict, list[dict]]:
    song = gp.parse(path)
    meta = {
        "file": os.path.basename(path),
        "title": song.title or "",
        "artist": song.artist or "",
        "tempo": song.tempo,
        "bars": len(song.tracks[0].measures) if song.tracks else 0,
    }
    passages: list[dict] = []
    seen: set[tuple] = set()
    for track in song.tracks:
        if not is_guitar(track):
            continue
        # Markers are preferred when present; monophonic runs are the fallback
        # for the files that have none. Either way `is_lead` has the last word.
        spans = marked_solos(track) or detect_lead_runs(track)
        for first, last in spans:
            notes = read_notes(track, first, last)
            fingerprint = passage_fingerprint(notes)
            # A riff that comes back verbatim should not get a second vote.
            if not fingerprint or fingerprint in seen:
                continue
            measured = measure_passage(notes)
            if measured:
                seen.add(fingerprint)
                measured["source"] = {"file": meta["file"], "track": track.name, "bars": f"{first}-{last}"}
                passages.append(measured)
    return meta, passages


def slugify(text: str) -> str:
    cleaned = text.strip().lower().split("(")[0]
    return "-".join(part for part in "".join(
        c if c.isalnum() or c.isspace() else " " for c in cleaned
    ).split())


def resolve_artists(metas: list[dict]) -> None:
    """
    Settle on one slug per artist, and the style it stands for.

    The artist field inside these files cannot be trusted on its own — across
    this sample it holds "Avenged Sevenfold (A7X)", "guns n roses", plain
    "Eagles" and four empty strings. The filenames are consistent, so known
    slugs are gathered from the metadata first and then matched against each
    filename as a prefix, which recovers the untagged files too.
    """
    known = {slug for m in metas if (slug := slugify(m["artist"]))}
    known |= set(STYLES)
    # Longest first, so "the-eagles" wins over "eagles".
    ordered = sorted(known, key=len, reverse=True)

    for meta in metas:
        stem = slugify(os.path.splitext(meta["file"])[0])
        slug = next((k for k in ordered if stem.startswith(k)), None) or slugify(meta["artist"])
        # "eagles" and "the-eagles" are one artist; prefer the form in STYLES.
        if slug not in STYLES:
            slug = next((k for k in STYLES if k.endswith(slug) or slug.endswith(k)), slug)
        meta["slug"] = slug or "unknown"
        meta["style"] = STYLES.get(meta["slug"], "unclassified")


def main() -> None:
    here = os.path.dirname(os.path.abspath(__file__))
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    default_songs = next(
        (d for d in (os.path.join(here, "../../songs"), os.path.join(here, "../../src/songs")) if os.path.isdir(d)),
        os.path.join(here, "../../songs"),
    )
    parser.add_argument("--songs", default=default_songs, help="folder of Guitar Pro files")
    parser.add_argument("--out", default=os.path.join(here, "../../src/generate/styleProfiles.json"),
                        help="style profiles for the app to consume")
    parser.add_argument("--report", default=os.path.join(here, "report.json"),
                        help="full detail, including which songs were read; not shipped")
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args()

    files = sorted(
        f for pattern in ("*.gp3", "*.gp4", "*.gp5", "*.gpx", "*.gp")
        for f in glob.glob(os.path.join(args.songs, pattern))
    )
    if not files:
        raise SystemExit(f"No Guitar Pro files in {os.path.abspath(args.songs)}")

    sources: list[dict] = []
    skipped: list[str] = []
    found: dict[str, list[dict]] = {}

    for path in files:
        try:
            meta, passages = analyse_song(path)
        except Exception as error:  # a malformed file should not stop the run
            skipped.append(f"{os.path.basename(path)}: {type(error).__name__}: {error}")
            continue
        meta["passages"] = len(passages)
        sources.append(meta)
        found[meta["file"]] = passages

    resolve_artists(sources)

    by_style: dict[str, list[dict]] = collections.defaultdict(list)
    by_artist: dict[str, list[dict]] = collections.defaultdict(list)
    for meta in sources:
        passages = found[meta["file"]]
        by_artist[meta["slug"]].extend(passages)
        by_style[meta["style"]].extend(passages)
        if not args.quiet:
            print(f"  {meta['file']:<46} {meta['style']:<14} {len(passages):>2} lead passage(s)")

    everything = [p for passages in found.values() for p in passages]
    if not everything:
        raise SystemExit("No lead passages found — nothing to profile.")

    profiles = {name: combine(p) for name, p in sorted(by_style.items()) if p}
    profiles["all"] = combine(everything)

    stamp = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")

    def write(path: str, payload: dict) -> None:
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        with open(path, "w") as handle:
            json.dump(payload, handle, indent=2)
            handle.write("\n")

    # What the app consumes: numbers only. No song names, so nothing about the
    # source transcriptions ends up in the shipped bundle.
    write(args.out, {
        "generatedAt": stamp,
        "note": "Aggregate phrasing statistics measured from Guitar Pro transcriptions. "
                "Numbers only — no musical content, and no reference to the source files.",
        "profiles": profiles,
    })
    # What you read to check the tool's work, including which files it used.
    write(args.report, {
        "generatedAt": stamp,
        "sources": sources,
        "profiles": profiles,
        "artists": {name: combine(p) for name, p in sorted(by_artist.items()) if p},
    })

    if skipped:
        print("\nskipped:")
        for line in skipped:
            print(f"  {line}")
    print(f"\n{len(sources)} songs, {len(everything)} lead passages "
          f"-> {len(profiles)} style profiles in {os.path.relpath(args.out)}"
          f"\nfull detail in {os.path.relpath(args.report)}")


if __name__ == "__main__":
    main()
