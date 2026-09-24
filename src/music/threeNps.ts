import { pitchClass, type PitchClass } from './notes';
import { SCALES, scalePitchClasses } from './scales';
import type { Tuning } from './tuning';

// Three-notes-per-string (3NPS) scale positions for the Practice tab routine:
// start on the lowest fretted scale note on the A string, play a 3NPS pattern
// from there up to the high E, then repeat from each next scale note until the
// octave.

/** String index of the A (5th) string: index 1 in every supported tuning. */
export const A_STRING = 1;
const NOTES_PER_STRING = 3;
/** Start note plus the next seven scale notes, ending on the octave. */
export const POSITIONS_PER_KEY = 8;

/** Conventional key names (flats for the flat keys, F# rather than Gb). */
export const KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
// Major keys spelled with flats: F, Bb, Eb, Ab, Db.
const FLAT_KEYS = new Set<PitchClass>([5, 10, 3, 8, 1]);

/** A pitch-class name spelled to suit the key (e.g. A# in F#, Bb in F). */
export function noteNameInKey(pc: PitchClass, keyPc: PitchClass): string {
  if (keyPc === 6 && pitchClass(pc) === 5) return 'E#'; // F# major's 7th
  return (FLAT_KEYS.has(keyPc) ? FLAT_NAMES : SHARP_NAMES)[pitchClass(pc)];
}

export interface PatternNote {
  string: number;
  fret: number;
  midi: number;
}

export interface PracticePosition {
  startMidi: number;
  notes: PatternNote[];
}

export function majorScale(keyPc: PitchClass): Set<PitchClass> {
  return scalePitchClasses(keyPc, SCALES.major);
}

function nextScaleNote(midi: number, scale: Set<PitchClass>): number {
  let next = midi + 1;
  while (!scale.has(pitchClass(next))) next++;
  return next;
}

/** Lowest scale note on the A string, excluding the open string (fret 1 or 2). */
export function startMidiOnA(keyPc: PitchClass, openA: number): number {
  const scale = majorScale(keyPc);
  for (let fret = 1; fret <= 12; fret++) {
    if (scale.has(pitchClass(openA + fret))) return openA + fret;
  }
  throw new Error(`No scale note on the A string for key ${keyPc}`);
}

/** A 3NPS pattern climbing the scale from `startMidi`, from `startString` to the top string. */
export function threeNpsPattern(
  startMidi: number,
  scale: Set<PitchClass>,
  openMidi: number[],
  startString = A_STRING,
): PatternNote[] {
  const notes: PatternNote[] = [];
  let midi = startMidi;
  for (let s = startString; s < openMidi.length; s++) {
    for (let i = 0; i < NOTES_PER_STRING; i++) {
      notes.push({ string: s, fret: midi - openMidi[s], midi });
      midi = nextScaleNote(midi, scale);
    }
  }
  return notes;
}

/** The eight positions for a major key, from the A-string start note to its octave. */
export function practicePositions(keyPc: PitchClass, tuning: Tuning): PracticePosition[] {
  const scale = majorScale(keyPc);
  const positions: PracticePosition[] = [];
  let startMidi = startMidiOnA(keyPc, tuning.openMidi[A_STRING]);
  for (let i = 0; i < POSITIONS_PER_KEY; i++) {
    positions.push({ startMidi, notes: threeNpsPattern(startMidi, scale, tuning.openMidi) });
    startMidi = nextScaleNote(startMidi, scale);
  }
  return positions;
}

/** Highest fret used by any key's positions in this tuning (sizes the neck). */
export function maxPracticeFret(tuning: Tuning): number {
  let max = 0;
  for (let keyPc = 0; keyPc < 12; keyPc++) {
    for (const position of practicePositions(keyPc, tuning)) {
      for (const note of position.notes) max = Math.max(max, note.fret);
    }
  }
  return max;
}
