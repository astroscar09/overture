import type { PitchClass } from './notes';

// Scales as semitone intervals measured from the root (0).
export interface Scale {
  name: string;
  intervals: number[];
}

export const SCALES: Record<string, Scale> = {
  major: { name: 'Major (Ionian)', intervals: [0, 2, 4, 5, 7, 9, 11] },
  dorian: { name: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10] },
  phrygian: { name: 'Phrygian', intervals: [0, 1, 3, 5, 7, 8, 10] },
  lydian: { name: 'Lydian', intervals: [0, 2, 4, 6, 7, 9, 11] },
  mixolydian: { name: 'Mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10] },
  minor: { name: 'Natural Minor (Aeolian)', intervals: [0, 2, 3, 5, 7, 8, 10] },
  locrian: { name: 'Locrian', intervals: [0, 1, 3, 5, 6, 8, 10] },
  harmonicMinor: { name: 'Harmonic Minor', intervals: [0, 2, 3, 5, 7, 8, 11] },
  melodicMinor: { name: 'Melodic Minor', intervals: [0, 2, 3, 5, 7, 9, 11] },
  majorPentatonic: { name: 'Major Pentatonic', intervals: [0, 2, 4, 7, 9] },
  minorPentatonic: { name: 'Minor Pentatonic', intervals: [0, 3, 5, 7, 10] },
  blues: { name: 'Blues', intervals: [0, 3, 5, 6, 7, 10] },
  wholeTone: { name: 'Whole Tone', intervals: [0, 2, 4, 6, 8, 10] },
};

/** The set of pitch classes (0–11) belonging to a scale rooted at `rootPc`. */
export function scalePitchClasses(rootPc: PitchClass, scale: Scale): Set<PitchClass> {
  return new Set(scale.intervals.map((i) => (rootPc + i) % 12));
}
