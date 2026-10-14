// The four checks, run together. Each is independent; this just collects them.

import type { ExerciseSpec, Phrase } from '../generate/types';
import { validatePlayability } from './playability';
import { validateRhythm } from './rhythm';
import { validateTechnique } from './technique';
import { validateTheory } from './theory';
import type { Validator, Violation } from './types';

export const VALIDATORS: Validator[] = [validateTheory, validateRhythm, validatePlayability, validateTechnique];

export function validate(phrase: Phrase, spec: ExerciseSpec): Violation[] {
  return VALIDATORS.flatMap((check) => check(phrase, spec));
}

export { validateTheory, validateRhythm, validatePlayability, validateTechnique };
export * from './types';
