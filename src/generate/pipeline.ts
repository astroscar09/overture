// Putting an exercise together: plan, place, articulate, then check.
//
// The four generator stages are each allowed to be imperfect. What is not
// allowed is shipping a phrase that fails a validator — on a violation the
// pipeline reseeds and tries again, and if it runs out of attempts it throws
// with the reasons rather than handing back something unplayable.

import { FOUR_FOUR, type TimeSignature } from '../music/time';
import { STANDARD } from '../music/tuning';
import { validate } from '../validate';
import type { Violation } from '../validate/types';
import { articulate } from './articulation';
import { assignFrets } from './fretting';
import { availablePitches, pickContour, planPitches, planStylePhrase, type ContourId } from './pitch';
import { planPhraseRhythm, planRhythm } from './rhythm';
import { makeRng, type Rng } from './rng';
import { limitsFor } from './limits';
import { DEFAULT_STYLE, styleProfile } from './styleProfiles';
import type { ExerciseSpec, NoteEvent, Phrase } from './types';

/** How many seeds to try before giving up on a spec. */
const MAX_ATTEMPTS = 24;

export class GenerationError extends Error {
  constructor(
    message: string,
    readonly violations: Violation[],
    readonly spec: ExerciseSpec,
  ) {
    super(message);
    this.name = 'GenerationError';
  }
}

/**
 * `contour` is a `ContourId` for every technique except `phrasing`, where it
 * is a style id instead — see `generateExercise`.
 */
function buildOnce(spec: ExerciseSpec, rng: Rng, sig: TimeSignature, contour: string): Phrase | null {
  const tuning = STANDARD;
  const pitches = availablePitches(spec.key, spec.scale, tuning, spec.window);
  if (pitches.length < 2) return null;

  const phrasing = spec.technique === 'phrasing';
  const style = phrasing ? styleProfile(spec.style) : undefined;
  const limits = limitsFor(spec.technique, spec.difficulty);
  const durations = style
    ? planPhraseRhythm(rng, style, spec.difficulty, spec.bars, sig)
    : planRhythm(rng, spec.technique, spec.difficulty, spec.bars, sig);
  const indices = style
    ? planStylePhrase(rng, pitches, durations.length, style, limits.maxLeap)
    : planPitches(rng, pitches, durations.length, contour as ContourId, limits.maxLeap);
  const placements = assignFrets(
    indices.map((i) => pitches[i]),
    tuning,
    spec.window,
    spec.technique,
    limits.maxSpan,
  );
  if (!placements) return null;

  let at = 0;
  const events: NoteEvent[] = placements.map((place, i) => {
    const event: NoteEvent = {
      midi: place.midi,
      string: place.string,
      fret: place.fret,
      start: at,
      dur: durations[i],
      attack: 'pick',
    };
    at += durations[i];
    return event;
  });

  articulate(events, spec.technique, spec.key, spec.scale, rng, style);

  return {
    tuning,
    timeSig: sig,
    bars: spec.bars,
    events,
    window: spec.window,
    meta: {
      seed: spec.seed,
      technique: spec.technique,
      key: spec.key,
      scale: spec.scale,
      difficulty: spec.difficulty,
      bpm: spec.bpm,
      contour,
    },
  };
}

export interface GenerationResult {
  phrase: Phrase;
  /** How many seeds were tried. One means it worked first time. */
  attempts: number;
}

/**
 * Build an exercise for a spec. Deterministic: the same spec and seed always
 * produce the same phrase, including the number of attempts it took.
 */
export function generateExercise(spec: ExerciseSpec): GenerationResult {
  const sig = spec.timeSig ?? FOUR_FOUR;
  let lastViolations: Violation[] = [];

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Each attempt is its own stream, derived from the spec's seed, so the
    // whole search is reproducible and not just the first try.
    const rng = makeRng((spec.seed + attempt * 0x9e3779b1) >>> 0);
    // `phrasing` has no fixed contour; its meta.contour instead names the
    // style it was shaped after (see buildOnce).
    const contour = spec.technique === 'phrasing' ? (spec.style ?? DEFAULT_STYLE) : pickContour(rng, spec.technique);
    const phrase = buildOnce({ ...spec, seed: spec.seed }, rng, sig, contour);
    if (!phrase) {
      lastViolations = [
        { validator: 'playability', rule: 'nothing-to-play', message: 'No scale notes fit in that window.' },
      ];
      continue;
    }
    const violations = validate(phrase, spec);
    if (violations.length === 0) return { phrase: { ...phrase, meta: { ...phrase.meta, seed: spec.seed } }, attempts: attempt + 1 };
    lastViolations = violations;
  }

  throw new GenerationError(
    `Could not build a ${spec.technique} exercise in ${spec.key} ${spec.scale} at frets ${spec.window[0]}–${spec.window[1]} ` +
      `after ${MAX_ATTEMPTS} attempts.`,
    lastViolations,
    spec,
  );
}

/** Try a spec without throwing — for UIs that would rather grey a button out. */
export function tryGenerate(spec: ExerciseSpec): GenerationResult | { error: GenerationError } {
  try {
    return generateExercise(spec);
  } catch (error) {
    if (error instanceof GenerationError) return { error };
    throw error;
  }
}
