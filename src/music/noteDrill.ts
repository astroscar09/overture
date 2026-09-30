import { CHORD_QUALITIES, type IntervalRole } from './chordTones';
import { NOTE_NAMES, noteName, pitchClass, type PitchClass } from './notes';

// Theory behind the two note-naming drills on the Practice tab: the random note
// finder (where is this note on the neck?) and the chord-tone drill (what is
// the 3rd / 5th / 7th of this chord, and where is it?).

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
  { id: 'accidentals', name: 'Accidentals only (5 notes)', pitchClasses: ACCIDENTALS },
];

/** A note named the way the neck labels it (sharps, no octave). */
export function drillNoteName(pc: PitchClass): string {
  return NOTE_NAMES[pitchClass(pc)];
}

// The five black-key notes answer to two names. The naturals get one each here:
// Cb, E#, Fb and B# are real spellings but not what a fretboard drill is for.
const FLAT_NAMES: Record<number, string> = { 1: 'Db', 3: 'Eb', 6: 'Gb', 8: 'Ab', 10: 'Bb' };

/** Does this note have a flat name as well as a sharp one? */
export function hasFlatName(pc: PitchClass): boolean {
  return FLAT_NAMES[pitchClass(pc)] !== undefined;
}

/** A note written with a flat where it has one ("Bb"); naturals are unchanged. */
export function flatNoteName(pc: PitchClass): string {
  return FLAT_NAMES[pitchClass(pc)] ?? drillNoteName(pc);
}

/** How the drill writes the five accidentals when it calls one out. */
export interface Spelling {
  id: string;
  name: string;
}

export const SPELLINGS: Spelling[] = [
  { id: 'both', name: 'Sharps & flats' },
  { id: 'sharps', name: 'Sharps only (A#)' },
  { id: 'flats', name: 'Flats only (Bb)' },
];

export const DEFAULT_SPELLING = 'both';

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

/** How the spots read out in text, e.g. "5th str fret 3 · 3rd str fret 10". */
export function spotsLabel(spots: Spot[], openMidi: number[]): string {
  return spots
    .map((s) => `${ordinal(openMidi.length - s.string)} str ${s.fret === 0 ? 'open' : `fret ${s.fret}`}`)
    .join(' · ');
}

// ---- Chord-tone drill ----

/** The chord types the drill can call out, in picker order. */
export const DRILL_QUALITIES: { id: string; name: string }[] = [
  { id: 'maj', name: 'Major' },
  { id: 'min', name: 'Minor' },
  { id: 'dom7', name: '7' },
  { id: 'm7', name: 'm7' },
  { id: 'maj7', name: 'maj7' },
  { id: 'dim', name: 'dim' },
  { id: 'm7b5', name: 'm7b5' },
];

/** Ticked when the drill first opens: the three the ear meets most. */
export const DEFAULT_QUALITIES = ['maj', 'min', 'dom7'];

/** The chord tone a question asks for. */
export interface ChordTarget {
  id: string;
  /** Name in the picker, e.g. "3rds". */
  name: string;
  /** Name in a prompt, e.g. "3rd". */
  label: string;
  role: IntervalRole;
}

export const CHORD_TARGETS: ChordTarget[] = [
  { id: 'third', name: '3rds', label: '3rd', role: '3' },
  { id: 'fifth', name: '5ths', label: '5th', role: '5' },
  { id: 'seventh', name: '7ths', label: '7th', role: '7' },
];

/** A chord name spelled the way the neck and the Chord Trainer spell it. */
export function drillChordName(rootPc: PitchClass, qualityId: string): string {
  return drillNoteName(rootPc) + (CHORD_QUALITIES[qualityId]?.suffix ?? '');
}

/** What the chord tone is called against its root, e.g. 3 semitones = "b3rd". */
export function chordToneName(semitone: number): string {
  const names: Record<number, string> = {
    2: '2nd',
    3: 'b3rd',
    4: '3rd',
    5: '4th',
    6: 'b5th',
    7: '5th',
    8: '#5th',
    9: '6th',
    10: 'b7th',
    11: 'major 7th',
  };
  return names[pitchClass(semitone)] ?? `${semitone} semitones up`;
}

/** One question: find this tone of this chord. */
export interface ChordPrompt {
  rootPc: PitchClass;
  qualityId: string;
  target: ChordTarget;
}

export const chordPromptKey = (p: ChordPrompt): string => `${p.rootPc}:${p.qualityId}:${p.target.id}`;

/** Does this chord type have the tone being asked for? (A triad has no 7th.) */
export function hasTarget(qualityId: string, target: ChordTarget): boolean {
  return CHORD_QUALITIES[qualityId]?.tones.some((t) => t.role === target.role) ?? false;
}

/** Every question for the ticked chord types and the chosen target(s), on all 12 roots. */
export function chordPrompts(qualityIds: string[], targets: ChordTarget[]): ChordPrompt[] {
  const prompts: ChordPrompt[] = [];
  for (const qualityId of qualityIds) {
    for (const target of targets) {
      if (!hasTarget(qualityId, target)) continue;
      for (const rootPc of ALL_PCS) prompts.push({ rootPc, qualityId, target });
    }
  }
  return prompts;
}

/** The answer to a question: which note, and how it is spelled against the chord. */
export function resolveChordPrompt(prompt: ChordPrompt): {
  targetPc: PitchClass;
  semitone: number;
  toneName: string;
} {
  const tone = CHORD_QUALITIES[prompt.qualityId]?.tones.find((t) => t.role === prompt.target.role);
  const semitone = tone?.semitone ?? 0;
  return {
    targetPc: pitchClass(prompt.rootPc + semitone),
    semitone,
    toneName: chordToneName(semitone),
  };
}
