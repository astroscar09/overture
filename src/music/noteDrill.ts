import type { Tonality } from './improv';
import { NOTE_NAMES, noteName, pitchClass, type PitchClass } from './notes';
import { SCALES } from './scales';
import { noteNameInKey } from './threeNps';

// Theory behind the two note-naming drills on the Practice tab: the random note
// finder (where is this note on the neck?) and the diatonic target drill (what
// is the 3rd / 5th / 7th above this note in this key?).

/** One place on the neck. */
export interface Spot {
  string: number;
  fret: number;
}

/** A set of notes a drill draws its prompts from. */
export interface NotePool {
  id: string;
  name: string;
  pitchClasses: PitchClass[];
}

const ALL_PCS = Array.from({ length: 12 }, (_, pc) => pc as PitchClass);
const NATURALS: PitchClass[] = [0, 2, 4, 5, 7, 9, 11];
const ACCIDENTALS: PitchClass[] = [1, 3, 6, 8, 10];

export const NOTE_POOLS: NotePool[] = [
  { id: 'all', name: 'All 12 notes', pitchClasses: ALL_PCS },
  { id: 'naturals', name: 'Naturals only (A–G)', pitchClasses: NATURALS },
  { id: 'accidentals', name: 'Sharps only (5 notes)', pitchClasses: ACCIDENTALS },
];

/** A note named the way the neck labels it (sharps, no octave). */
export function drillNoteName(pc: PitchClass): string {
  return NOTE_NAMES[pitchClass(pc)];
}

/** Ordinals for string numbers and scale degrees (1-based). */
const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'];

export function ordinal(n: number): string {
  return ORDINALS[n - 1] ?? `${n}th`;
}

/**
 * A string's name the way guitarists count them: index 0 is the lowest string
 * but the *6th* string, so "6th (E)".
 */
export function stringLabel(index: number, openMidi: number[]): string {
  return `${ordinal(openMidi.length - index)} (${noteName(openMidi[index], false)})`;
}

/**
 * Every place a pitch class sits on the neck up to `maxFret` (open strings
 * included), optionally limited to one string.
 */
export function pitchClassSpots(
  pc: PitchClass,
  openMidi: number[],
  maxFret: number,
  onlyString: number | null = null,
): Spot[] {
  const spots: Spot[] = [];
  openMidi.forEach((open, string) => {
    if (onlyString !== null && string !== onlyString) return;
    for (let fret = 0; fret <= maxFret; fret++) {
      if (pitchClass(open + fret) === pitchClass(pc)) spots.push({ string, fret });
    }
  });
  return spots;
}

/** How the spots read out in text, e.g. "5th string fret 3 · 3rd string fret 10". */
export function spotsLabel(spots: Spot[], openMidi: number[]): string {
  return spots
    .map((s) => `${ordinal(openMidi.length - s.string)} str ${s.fret === 0 ? 'open' : `fret ${s.fret}`}`)
    .join(' · ');
}

/** The seven pitch classes of a key, in scale order from the tonic. */
export function keyDegrees(keyPc: PitchClass, tonality: Tonality): PitchClass[] {
  const scale = tonality === 'major' ? SCALES.major : SCALES.minor;
  return scale.intervals.map((i) => pitchClass(keyPc + i));
}

/**
 * A note spelled to suit the key. Minor keys borrow the spelling of their
 * relative major (as the rest of the app does), so A minor reads A B C D…
 */
export function keyNoteName(pc: PitchClass, keyPc: PitchClass, tonality: Tonality): string {
  const spellingKey = tonality === 'minor' ? pitchClass(keyPc + 3) : pitchClass(keyPc);
  return noteNameInKey(pc, spellingKey);
}

/** A diatonic target the drill can ask for: the 3rd, 5th or 7th above a note. */
export interface DiatonicTarget {
  id: string;
  /** Name in the picker, e.g. "3rds". */
  name: string;
  /** Name in a prompt, e.g. "3rd". */
  label: string;
  /** Scale steps above the starting note (a 3rd is two steps up). */
  steps: number;
}

export const DIATONIC_TARGETS: DiatonicTarget[] = [
  { id: 'third', name: '3rds', label: '3rd', steps: 2 },
  { id: 'fifth', name: '5ths', label: '5th', steps: 4 },
  { id: 'seventh', name: '7ths', label: '7th', steps: 6 },
];

/** The interval quality for a diatonic target, e.g. "minor 3rd". */
export function intervalQuality(target: DiatonicTarget, fromPc: PitchClass, targetPc: PitchClass): string {
  const semitones = pitchClass(targetPc - fromPc);
  const names: Record<number, Record<number, string>> = {
    2: { 3: 'minor', 4: 'major' },
    4: { 6: 'diminished', 7: 'perfect', 8: 'augmented' },
    6: { 9: 'diminished', 10: 'minor', 11: 'major' },
  };
  const quality = names[target.steps]?.[semitones];
  return quality ? `${quality} ${target.label}` : target.label;
}

/** One question in the diatonic drill: which degree to start from, and what to find. */
export interface DiatonicPrompt {
  /** Index into the key's degrees (0 = tonic). */
  degree: number;
  target: DiatonicTarget;
}

/** Every question for a target (or for all three targets when `targets` has them all). */
export function diatonicPrompts(targets: DiatonicTarget[]): DiatonicPrompt[] {
  return targets.flatMap((target) => Array.from({ length: 7 }, (_, degree) => ({ degree, target })));
}

export const promptKey = (p: DiatonicPrompt): string => `${p.degree}:${p.target.id}`;

/** Resolve a prompt in a key: the note you start on and the note you are after. */
export function resolvePrompt(
  prompt: DiatonicPrompt,
  keyPc: PitchClass,
  tonality: Tonality,
): { fromPc: PitchClass; targetPc: PitchClass; targetDegree: number } {
  const degrees = keyDegrees(keyPc, tonality);
  const targetDegree = (prompt.degree + prompt.target.steps) % 7;
  return { fromPc: degrees[prompt.degree], targetPc: degrees[targetDegree], targetDegree };
}
