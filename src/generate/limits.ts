// What a given exercise is actually allowed to do.
//
// Difficulty sets the defaults, but a technique can need more room than its
// tier would otherwise give: skipping two strings at once *is* a wide
// interval, so a leap ceiling of five semitones would forbid the technique
// rather than make it easier. For those cases difficulty is expressed through
// speed and the size of the gap instead.
//
// Generator and validators both read this, so they cannot drift apart.

import { DIFFICULTY, type Difficulty, type DifficultyProfile, type TechniqueId } from './types';

/** Two strings apart on a guitar is roughly this far in pitch. */
const SKIP_INTERVAL = 12;

export function limitsFor(technique: TechniqueId, difficulty: Difficulty): DifficultyProfile {
  const base = DIFFICULTY[difficulty];
  if (technique === 'skipping') {
    return {
      ...base,
      maxStringJump: Math.max(2, base.maxStringJump),
      maxLeap: Math.max(SKIP_INTERVAL, base.maxLeap),
    };
  }
  return base;
}
