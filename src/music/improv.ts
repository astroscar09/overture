import { pitchClass, type PitchClass } from './notes';
import { SCALES, scalePitchClasses } from './scales';
import { chordFor, type Quality } from './chordShapes';
import { KEY_NAMES, noteNameInKey } from './threeNps';
import type { ProgressionStep } from '../trainer/ChordTrainer';

// Improv routine: pick a key and a fret range, then solo over a backing
// progression in that key while holding one subdivision.

export type Tonality = 'major' | 'minor';

/** A looping progression, one chord per bar: [semitones above the tonic, quality]. */
export interface ImprovProgression {
  id: string;
  name: string;
  chords: [number, Quality][];
}

// Ids are shared across tonalities so switching major/minor keeps the choice.
export const IMPROV_PROGRESSIONS: Record<Tonality, ImprovProgression[]> = {
  major: [
    { id: 'vamp', name: 'I vamp', chords: [[0, 'maj']] },
    { id: 'two', name: 'I – IV', chords: [[0, 'maj'], [5, 'maj']] },
    { id: 'pop', name: 'I – V – vi – IV', chords: [[0, 'maj'], [7, 'maj'], [9, 'min'], [5, 'maj']] },
    { id: 'cadence', name: 'ii – V – I', chords: [[2, 'min'], [7, 'dom7'], [0, 'maj'], [0, 'maj']] },
  ],
  minor: [
    { id: 'vamp', name: 'i vamp', chords: [[0, 'min']] },
    { id: 'two', name: 'i – iv', chords: [[0, 'min'], [5, 'min']] },
    { id: 'pop', name: 'i – VI – III – VII', chords: [[0, 'min'], [8, 'maj'], [3, 'maj'], [10, 'maj']] },
    { id: 'cadence', name: 'i – VII – VI – V', chords: [[0, 'min'], [10, 'maj'], [8, 'maj'], [7, 'dom7']] },
  ],
};

const MINOR_KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
const SUFFIX: Record<Quality, string> = { maj: '', min: 'm', dom7: '7' };

export function improvKeyName(keyPc: PitchClass, tonality: Tonality): string {
  return (tonality === 'major' ? KEY_NAMES : MINOR_KEY_NAMES)[pitchClass(keyPc)];
}

export function improvScale(keyPc: PitchClass, tonality: Tonality): Set<PitchClass> {
  return scalePitchClasses(keyPc, tonality === 'major' ? SCALES.major : SCALES.minor);
}

/** A progression chord's name spelled for the key (minor keys use their relative major). */
export function chordLabel(keyPc: PitchClass, tonality: Tonality, [offset, quality]: [number, Quality]): string {
  const spellingKey = tonality === 'minor' ? pitchClass(keyPc + 3) : keyPc;
  return noteNameInKey(keyPc + offset, spellingKey) + SUFFIX[quality];
}

/** The progression as trainer steps, one full bar per chord. */
export function progressionSteps(
  keyPc: PitchClass,
  progression: ImprovProgression,
  beatsPerMeasure: number,
): ProgressionStep[] {
  return progression.chords.map(([offset, quality]) => ({
    chord: chordFor(keyPc + offset, quality),
    beats: beatsPerMeasure,
  }));
}

/** Every scale note on every string between two frets (inclusive). */
export function rangeNotes(
  keyPc: PitchClass,
  tonality: Tonality,
  openMidi: number[],
  fromFret: number,
  toFret: number,
): { string: number; fret: number }[] {
  const scale = improvScale(keyPc, tonality);
  const notes: { string: number; fret: number }[] = [];
  openMidi.forEach((open, string) => {
    for (let fret = fromFret; fret <= toFret; fret++) {
      if (scale.has(pitchClass(open + fret))) notes.push({ string, fret });
    }
  });
  return notes;
}
