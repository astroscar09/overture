// Generates a triad / guide-tone voicing on a chosen set of (usually three)
// adjacent strings, picking the position with the smoothest voice-leading from
// the previous chord. Output is a full 6-string fret array (-1 = muted) so it
// drops straight into Fretboard.setChordShape.

import { pitchClass } from './notes';
import { voicingTones } from './chordTones';

export interface TriadVoicingOptions {
  rootPc: number;
  qualityId: string;
  strings: number[]; // true string indices to voice on (0 = low E … 5 = high E)
  openMidi: number[]; // open-string MIDI per string index (from the tuning)
  prev: number[] | null; // previous full 6-string voicing, for voice-leading
  fretRange?: [number, number]; // inclusive fret bounds to search (default [0, 14])
  maxSpan?: number; // max fretted-note span (open strings excluded; default 4)
}

interface Candidate {
  frets: number[]; // fret per string in `strings` order
  maxFret: number;
  span: number;
  sumFret: number;
}

/** Build a triad/shell voicing on the chosen strings; returns a full 6-array. */
export function triadVoicing(opts: TriadVoicingOptions): number[] {
  const { rootPc, qualityId, strings, openMidi, prev } = opts;
  const [loFret, hiFret] = opts.fretRange ?? [0, 14];
  const maxSpan = opts.maxSpan ?? 4;

  const targetPcs = voicingTones(qualityId).map((tone) => pitchClass(rootPc + tone.semitone));
  const targetSet = new Set(targetPcs);

  // Per-string: every fret in range whose sounding pitch class is a chord tone.
  const perString = strings.map((s) => {
    const frets: { fret: number; pc: number }[] = [];
    for (let f = loFret; f <= hiFret; f++) {
      const pc = pitchClass(openMidi[s] + f);
      if (targetSet.has(pc)) frets.push({ fret: f, pc });
    }
    return frets;
  });

  // If any string can't reach a chord tone at all, we can't voice it here.
  if (perString.some((opts) => opts.length === 0)) {
    return prev ?? mute(openMidi.length);
  }

  // Enumerate complete voicings (every target tone covered), filtered by span.
  const candidates = enumerate(perString, targetSet.size, maxSpan);

  // Fallbacks: widen span, then widen the fret window, before giving up.
  const chosen =
    pick(candidates, prev, strings) ??
    pick(enumerate(perString, targetSet.size, hiFret - loFret), prev, strings) ??
    null;

  if (!chosen) return prev ?? mute(openMidi.length);

  const full = mute(openMidi.length);
  strings.forEach((s, i) => (full[s] = chosen.frets[i]));
  return full;
}

function mute(n: number): number[] {
  return new Array(n).fill(-1);
}

// Cartesian product of per-string fret options, keeping only combos that cover
// all distinct target tones and whose fretted span is within `maxSpan`.
function enumerate(
  perString: { fret: number; pc: number }[][],
  distinctTones: number,
  maxSpan: number,
): Candidate[] {
  const out: Candidate[] = [];
  const acc: { fret: number; pc: number }[] = [];

  const recurse = (i: number) => {
    if (i === perString.length) {
      const pcs = new Set(acc.map((a) => a.pc));
      if (pcs.size < distinctTones) return; // not a complete voicing
      const fretted = acc.map((a) => a.fret).filter((f) => f > 0);
      const span = fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
      if (span > maxSpan) return;
      const allFrets = acc.map((a) => a.fret);
      out.push({
        frets: allFrets.slice(),
        maxFret: Math.max(...allFrets),
        span,
        sumFret: allFrets.reduce((a, b) => a + b, 0),
      });
      return;
    }
    for (const opt of perString[i]) {
      acc.push(opt);
      recurse(i + 1);
      acc.pop();
    }
  };

  recurse(0);
  return out;
}

// Pick the best candidate: closest to the previous voicing when we have one,
// otherwise the lowest compact shape.
function pick(candidates: Candidate[], prev: number[] | null, strings: number[]): Candidate | null {
  if (candidates.length === 0) return null;

  if (prev) {
    const prevFrets = strings.map((s) => prev[s]);
    const haveBaseline = prevFrets.every((f) => f >= 0);
    if (haveBaseline) {
      return candidates
        .slice()
        .sort((a, b) => {
          const da = movement(a.frets, prevFrets);
          const db = movement(b.frets, prevFrets);
          return da - db || a.span - b.span || a.sumFret - b.sumFret;
        })[0];
    }
  }

  // First chord (or no usable baseline): lowest, most compact voicing.
  return candidates.slice().sort((a, b) => a.maxFret - b.maxFret || a.span - b.span || a.sumFret - b.sumFret)[0];
}

// Total per-string fret movement (L1). Muted strings in the baseline don't count.
function movement(frets: number[], prevFrets: number[]): number {
  let sum = 0;
  for (let i = 0; i < frets.length; i++) {
    if (prevFrets[i] < 0) continue;
    sum += Math.abs(frets[i] - prevFrets[i]);
  }
  return sum;
}
