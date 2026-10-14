import { pitchClass, type PitchClass } from './notes';

// The circle of fifths as a practice order: twelve keys, each a fifth above
// (or a fourth below) the last, looping back to where it started.

export type CircleDirection = 'fifths' | 'fourths';

/** One stop on the circle: the key's pitch class and how that key is written. */
export interface CircleKey {
  pc: PitchClass;
  name: string;
}

// Going round by fifths the sixth stop is written F#; going the other way it is
// the same key written Gb. Each direction gets the spelling that belongs to it.
const FIFTHS_NAMES = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'];
const FOURTHS_NAMES = ['C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'B', 'E', 'A', 'D', 'G'];

export const CIRCLE_DIRECTIONS: { id: CircleDirection; name: string; glyph: string }[] = [
  { id: 'fifths', name: 'Fifths (C → G → D)', glyph: '↻' },
  { id: 'fourths', name: 'Fourths (C → F → Bb)', glyph: '↺' },
];

/** Every key on the circle in playing order, starting from `startPc`. */
export function circleKeys(startPc: PitchClass, direction: CircleDirection): CircleKey[] {
  const step = direction === 'fifths' ? 7 : 5; // a fifth up, or a fourth up
  const names = direction === 'fifths' ? FIFTHS_NAMES : FOURTHS_NAMES;
  const all = names.map((name, i) => ({ pc: pitchClass(i * step), name }));
  const start = Math.max(0, all.findIndex((key) => key.pc === pitchClass(startPc)));
  return all.map((_, i) => all[(start + i) % all.length]);
}

/** The keys as they are written when picking a starting key, in circle order from C. */
export function circleKeyNames(direction: CircleDirection): CircleKey[] {
  return circleKeys(0, direction);
}
