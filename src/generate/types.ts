// What a generated exercise is made of.
//
// A Phrase is plain data: no DOM, no audio, no Tone. It can be serialised,
// snapshot-tested, logged with its seed and rebuilt exactly. Everything
// downstream — the tab renderer, the player, the progress log — reads this.

import type { Ticks, TimeSignature } from '../music/time';
import type { Tuning } from '../music/tuning';

export type TechniqueId = 'alternate' | 'legato' | 'skipping' | 'burst' | 'gallop' | 'bending' | 'phrasing';

/** How a note is sounded. Only `pick` uses the picking hand. */
export type Attack = 'pick' | 'hammer' | 'pull' | 'slide';

export type PickDir = 'down' | 'up';

export interface NoteEvent {
  midi: number;
  /** 0 = low E. */
  string: number;
  fret: number;
  start: Ticks;
  dur: Ticks;
  attack: Attack;
  /** Set on picked notes only. */
  pickDir?: PickDir;
  /** Bent up by this many semitones after the note sounds. */
  bend?: number;
}

export interface PhraseMeta {
  seed: number;
  technique: TechniqueId;
  key: string;
  scale: string;
  difficulty: Difficulty;
  bpm: number;
  /**
   * Which shape the pitch planner used, for display and for debugging. For
   * `phrasing`, this is the style id instead — there is no fixed contour.
   */
  contour: string;
}

export interface Phrase {
  tuning: Tuning;
  timeSig: TimeSignature;
  bars: number;
  /** Sorted by start. Monophonic: no two events overlap. */
  events: NoteEvent[];
  /** Inclusive fret window the whole phrase stays inside. */
  window: [number, number];
  meta: PhraseMeta;
}

export type Difficulty = 1 | 2 | 3 | 4 | 5;

export interface ExerciseSpec {
  technique: TechniqueId;
  /** Tonic, spelled: "E", "Bb". */
  key: string;
  /** A scale name Tonal knows: "minor pentatonic", "aeolian". */
  scale: string;
  window: [number, number];
  bars: number;
  difficulty: Difficulty;
  bpm: number;
  seed: number;
  timeSig?: TimeSignature;
  /** `phrasing` only: which measured style to shape the phrase after. */
  style?: string;
}

/**
 * Difficulty as numbers rather than adjectives, so the validators can check it
 * and the player can be told honestly what it is being asked for.
 */
export interface DifficultyProfile {
  /** Widest fret span allowed across any four consecutive notes. */
  maxSpan: number;
  /** Largest melodic jump, in semitones. */
  maxLeap: number;
  /** How many strings a single jump may cross (1 = adjacent only). */
  maxStringJump: number;
  /** Shortest note value allowed, as a denominator (16 = sixteenth). */
  fastestValue: 8 | 16 | 32;
  /** Whether triplet and sextuplet groupings may appear. */
  tuplets: boolean;
}

export const DIFFICULTY: Record<Difficulty, DifficultyProfile> = {
  1: { maxSpan: 4, maxLeap: 2, maxStringJump: 1, fastestValue: 8, tuplets: false },
  2: { maxSpan: 4, maxLeap: 4, maxStringJump: 1, fastestValue: 8, tuplets: true },
  3: { maxSpan: 5, maxLeap: 5, maxStringJump: 2, fastestValue: 16, tuplets: true },
  4: { maxSpan: 6, maxLeap: 9, maxStringJump: 3, fastestValue: 16, tuplets: true },
  5: { maxSpan: 6, maxLeap: 12, maxStringJump: 5, fastestValue: 32, tuplets: true },
};

export const TECHNIQUES: { id: TechniqueId; name: string; blurb: string }[] = [
  { id: 'alternate', name: 'Alternate picking', blurb: 'Strict down-up, no two strokes the same way running.' },
  { id: 'legato', name: 'Legato', blurb: 'Pick once per string, hammer and pull the rest.' },
  { id: 'skipping', name: 'String skipping', blurb: 'Jump over strings instead of crossing to the neighbour.' },
  { id: 'burst', name: 'Speed bursts', blurb: 'Steady notes broken by short bursts at double the rate.' },
  { id: 'gallop', name: 'Gallops', blurb: 'The eighth-plus-two-sixteenths figure, once per beat.' },
  { id: 'bending', name: 'Bending', blurb: 'Bend to a target note in the scale and hold it in tune.' },
  {
    id: 'phrasing',
    name: 'Phrasing & licks',
    blurb: 'A melodic line shaped from real lead playing — repeats, turnarounds and bends, not a drill.',
  },
];

export const techniqueName = (id: TechniqueId): string =>
  TECHNIQUES.find((t) => t.id === id)?.name ?? id;
