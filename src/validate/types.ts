// Validation is deliberately separate from generation.
//
// Each validator answers one question about a finished phrase and knows
// nothing about the others, so a new technique adds one rule set rather than
// editing a tangle. They exist to catch generator bugs: if a validator fires,
// the generator is wrong, and the pipeline reseeds rather than shipping it.

import type { ExerciseSpec, Phrase } from '../generate/types';

export type ValidatorName = 'theory' | 'rhythm' | 'playability' | 'technique';

export interface Violation {
  validator: ValidatorName;
  /** Short machine-readable rule id, e.g. "out-of-scale". */
  rule: string;
  /** What is wrong, in words. */
  message: string;
  /** Index into phrase.events, when a single note is at fault. */
  eventIndex?: number;
}

export type Validator = (phrase: Phrase, spec: ExerciseSpec) => Violation[];

export const violation = (
  validator: ValidatorName,
  rule: string,
  message: string,
  eventIndex?: number,
): Violation => ({ validator, rule, message, eventIndex });
