// The shape of a Theory Lab question.
//
// A question is data, not behaviour: given the same topic, tier and seed it is
// rebuilt identically, which is what lets a question be logged, replayed and
// snapshot-tested. The only functions on it produce feedback, and those are
// derived from the same data.

import type { Mark } from '../fretboard/Fretboard';
import { int, type Rng } from '../generate/rng';
import type { Ticks } from '../music/time';

export type QuestionMode =
  /** Pick one of several written answers. */
  | 'multiple-choice'
  /** Pick every answer that applies. */
  | 'multiple-select'
  /** Put items in the right order. */
  | 'build-sequence'
  /** Click the right places on the neck. */
  | 'fretboard-select';

export interface Choice {
  id: string;
  label: string;
}

export interface FretTarget {
  string: number;
  fret: number;
}

/**
 * What a question sounds like. Data, not audio: a generator says which pitches
 * happen when, and the panel turns that into sound. Keeping it declarative is
 * what lets an ear-training question be asserted in a test — "this prompt
 * plays C4 then E4, a major 3rd apart" — with no speakers involved.
 */
export interface AudioPrompt {
  /** Pitches to sound, positioned in ticks from the start of the prompt. */
  notes: { midi: number; start: Ticks; dur: Ticks }[];
  /** The tempo those tick positions are read at. */
  bpm: number;
  /** Shown on the replay button, e.g. "Play the interval". */
  label: string;
}

export interface TheoryQuestion {
  /** Stable for identical content, so repeats are recognisable in a log. */
  id: string;
  topicId: string;
  /** Which generator produced it — useful for spotting a weak question type. */
  typeId: string;
  tier: number;
  mode: QuestionMode;
  /** The question itself. */
  prompt: string;
  /** Optional second line: the key being worked in, a reminder, a hint. */
  context?: string;
  /** For the pick-an-answer modes. */
  choices?: Choice[];
  /** For build-sequence: the items to arrange, already shuffled. */
  pool?: Choice[];
  /** For fretboard-select: what to show, and how many spots are wanted. */
  fretboard?: { marks: Mark[]; targets: FretTarget[] };
  /**
   * What a click on the neck records. `spot` is the string and fret, for
   * "where is this note?". `pitch` is the sounding MIDI number, for playing a
   * heard phrase back — there any fingering of the right pitch will do, so
   * the position must not be what is graded.
   */
  fretboardAnswer?: 'spot' | 'pitch';
  /** Present when the question has to be heard rather than read. */
  audio?: AudioPrompt;
  /** Choice ids (or fret keys) that make a right answer. */
  answer: string[];
  /**
   * How `answer` is compared with what was given:
   *  - `exact`   every answer and nothing else, order irrelevant
   *  - `ordered` the same items in the same order
   *  - `any`     one item from `answer` is enough, which is how "find this
   *              note on the neck" works — there are six right frets and
   *              naming one of them is the whole task.
   */
  matching: 'exact' | 'ordered' | 'any';
  /** Why the right answer is right. Always shown once answered. */
  rationale: string;
  /** A targeted nudge for a recognisable mistake, or null. */
  diagnose?(given: string[]): string | null;
}

export interface QuestionType {
  id: string;
  /** The lowest tier this type appears at. */
  minTier: number;
  /** Relative frequency against the other types available at a tier. */
  weight?: number;
  make(rng: Rng, tier: number): TheoryQuestion;
}

export interface TheoryTopic {
  id: string;
  title: string;
  /** One line explaining what the topic drills. */
  blurb: string;
  maxTier: number;
  types: QuestionType[];
}

/** A small stable hash, so the same question always carries the same id. */
export function questionId(topicId: string, typeId: string, parts: readonly string[]): string {
  let h = 2166136261;
  for (const part of [topicId, typeId, ...parts].join('|')) {
    h ^= part.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return `${topicId}:${typeId}:${(h >>> 0).toString(36)}`;
}

/** The question types on offer at a tier. */
export function typesForTier(topic: TheoryTopic, tier: number): QuestionType[] {
  const available = topic.types.filter((t) => t.minTier <= tier);
  if (!available.length) throw new Error(`${topic.id} has no question types at tier ${tier}`);
  return available;
}

/** Build one question. Deterministic for a given rng state. */
export function generateQuestion(topic: TheoryTopic, tier: number, rng: Rng): TheoryQuestion {
  const available = typesForTier(topic, tier);
  const pool = available.flatMap((t) => Array<QuestionType>(Math.max(1, t.weight ?? 1)).fill(t));
  const type = pool[int(rng, 0, pool.length - 1)];
  return type.make(rng, tier);
}

export interface Grade {
  correct: boolean;
  expected: string[];
  given: string[];
  /** Always present: the explanation of the right answer. */
  rationale: string;
  /** Present only when a recognisable mistake was spotted. */
  diagnosis: string | null;
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((v, i) => v === right[i]);
}

export function grade(question: TheoryQuestion, given: readonly string[]): Grade {
  let correct: boolean;
  if (question.matching === 'ordered') {
    correct = given.length === question.answer.length && question.answer.every((v, i) => v === given[i]);
  } else if (question.matching === 'any') {
    correct = given.length === 1 && question.answer.includes(given[0]);
  } else {
    correct = sameSet(question.answer, given);
  }
  return {
    correct,
    expected: question.answer,
    given: [...given],
    rationale: question.rationale,
    diagnosis: correct ? null : (question.diagnose?.([...given]) ?? null),
  };
}

/** The key for a fretboard spot, used as a choice id. */
export const fretKey = (string: number, fret: number): string => `${string}:${fret}`;
