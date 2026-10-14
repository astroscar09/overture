// Interval identification and construction.

import { Interval, Note } from 'tonal';
import type { PitchName, SpelledNote } from './spelling';

/** Shorthand as Tonal writes it: "3m", "5P", "7M". */
export type IntervalName = string;

const QUALITY_WORDS: Record<string, string> = {
  P: 'perfect',
  M: 'major',
  m: 'minor',
  A: 'augmented',
  d: 'diminished',
  AA: 'doubly augmented',
  dd: 'doubly diminished',
};

const ORDINALS = ['unison', '2nd', '3rd', '4th', '5th', '6th', '7th', 'octave', '9th', '10th', '11th', '12th', '13th'];

/** The interval from one note up to another: "C4" to "Eb4" is "3m". */
export function between(from: SpelledNote, to: SpelledNote): IntervalName {
  const iv = Interval.distance(from, to);
  if (!iv) throw new Error(`No interval between ${from} and ${to}`);
  return iv;
}

/** The note that interval above: up("C4", "3m") is "Eb4". */
export function up(from: SpelledNote, interval: IntervalName): SpelledNote {
  const out = Note.transpose(from, interval);
  if (!out) throw new Error(`Cannot raise ${from} by ${interval}`);
  return out;
}

/** The note that interval below. */
export function down(from: SpelledNote, interval: IntervalName): SpelledNote {
  const out = Note.transpose(from, Interval.invert(interval));
  return Note.transpose(from, `-${Interval.num(interval)}${Interval.quality(interval)}`) || out;
}

export function semitones(interval: IntervalName): number {
  const n = Interval.semitones(interval);
  if (n === undefined) throw new Error(`Not an interval: ${interval}`);
  return n;
}

/** Turn it back over: a major 3rd inverts to a minor 6th. */
export function invert(interval: IntervalName): IntervalName {
  return Interval.invert(interval);
}

/** Spoken form: "3m" reads as "minor 3rd". */
export function spell(interval: IntervalName): string {
  const parsed = Interval.get(interval);
  if (parsed.empty) throw new Error(`Not an interval: ${interval}`);
  const quality = QUALITY_WORDS[parsed.q] ?? parsed.q;
  const simple = Math.abs(parsed.simple);
  const name = ORDINALS[simple - 1] ?? `${simple}th`;
  // A perfect unison and a perfect octave read better without the quality word.
  if (name === 'unison' || name === 'octave') return parsed.q === 'P' ? name : `${quality} ${name}`;
  return `${quality} ${name}`;
}

/** Every interval inside one octave, smallest first — the ear-training pool. */
export const SIMPLE_INTERVALS: IntervalName[] = [
  '1P', '2m', '2M', '3m', '3M', '4P', '5d', '5P', '6m', '6M', '7m', '7M', '8P',
];

/** The interval between two pitch classes going upward, 0–11 semitones. */
export function semitonesBetweenPitchClasses(from: PitchName, to: PitchName): number {
  const a = Note.chroma(from);
  const b = Note.chroma(to);
  if (a === undefined || b === undefined) throw new Error(`Not note names: ${from}, ${to}`);
  return (b - a + 12) % 12;
}
