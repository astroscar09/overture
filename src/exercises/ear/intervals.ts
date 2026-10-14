// Ear training: hearing an interval and naming it.

import { int, pick, type Rng } from '../../generate/rng';
import { invert, semitones, spell, type IntervalName } from '../../music/theory/intervals';
import { questionId, type QuestionType, type TheoryTopic } from '../types';
import { BASE_MIDI, RANGE_MIDI, harmonic, melodic, options } from './shared';

export const TOPIC_ID = 'ear-intervals';

/**
 * Intervals arrive in the order they are usually learned by ear: the ones
 * with the strongest character first, the ones that are easy to confuse last.
 */
const BY_TIER: Record<number, IntervalName[]> = {
  1: ['3M', '5P', '8P'],
  2: ['2M', '3m', '3M', '4P', '5P', '8P'],
  3: ['2m', '2M', '3m', '3M', '4P', '5P', '6M', '8P'],
  4: ['2m', '2M', '3m', '3M', '4P', '5d', '5P', '6m', '6M', '7m', '7M'],
  5: ['2m', '2M', '3m', '3M', '4P', '4A', '5d', '5P', '6m', '6M', '7m', '7M', '8P'],
};

const clamp = (t: number) => Math.max(1, Math.min(5, Math.round(t)));
export const intervalsForTier = (tier: number): IntervalName[] => BY_TIER[clamp(tier)];

/** Every interval inside an octave — the pool the wrong answers come from. */
const ALL: IntervalName[] = ['2m', '2M', '3m', '3M', '4P', '4A', '5d', '5P', '6m', '6M', '7m', '7M', '8P'];

/**
 * Intervals a semitone either side, plus the inversion — the usual confusions.
 * Drawn from every interval rather than only the ones this tier asks about:
 * the tier decides what you are tested on, not how narrow the guess is, and
 * at tier one there are only three intervals in play, which is not enough to
 * fill four options.
 */
function nearby(interval: IntervalName): IntervalName[] {
  const here = semitones(interval);
  return [
    ...ALL.filter((i) => i !== interval && Math.abs(semitones(i) - here) === 1),
    invert(interval),
    ...ALL.filter((i) => i !== interval),
  ];
}

function makeInterval(direction: 'up' | 'down' | 'together'): QuestionType['make'] {
  return (rng: Rng, tier: number) => {
    const pool = intervalsForTier(tier);
    const interval = pick(rng, pool);
    const gap = semitones(interval);
    const root = BASE_MIDI + int(rng, 0, RANGE_MIDI - gap);
    const upper = root + gap;
    const answer = spell(interval);

    const sounded =
      direction === 'down' ? [upper, root] : direction === 'up' ? [root, upper] : [root, upper];
    const prompt =
      direction === 'together'
        ? 'Two notes together — what is the interval?'
        : `Two notes, ${direction === 'up' ? 'the second higher' : 'the second lower'} — what is the interval?`;

    return {
      id: questionId(TOPIC_ID, `hear-${direction}`, [interval, String(root)]),
      topicId: TOPIC_ID,
      typeId: `hear-${direction}`,
      tier,
      mode: 'multiple-choice',
      prompt,
      context: 'Play it as many times as you need.',
      audio:
        direction === 'together'
          ? harmonic(sounded, 'Play the interval')
          : melodic(sounded, 'Play the interval'),
      choices: options(rng, answer, nearby(interval).map(spell)),
      answer: [answer],
      matching: 'exact',
      rationale: `That was ${/^[aeiou]/i.test(answer) ? 'an' : 'a'} ${answer} — ${gap} semitone${gap === 1 ? '' : 's'}.`,
      diagnose(given) {
        const g = given[0];
        if (!g) return null;
        if (g === spell(invert(interval))) {
          return `That is the inversion. Inversions sit close in the ear — try singing the lower note up to the higher one.`;
        }
        const guessed = ALL.find((i) => spell(i) === g);
        if (guessed) {
          const diff = semitones(guessed) - gap;
          return `${/^[aeiou]/i.test(g) ? 'An' : 'A'} ${g} is ${Math.abs(diff)} semitone${Math.abs(diff) === 1 ? '' : 's'} ${diff > 0 ? 'wider' : 'narrower'} than what you heard.`;
        }
        return null;
      },
    };
  };
}

const ascending: QuestionType = { id: 'hear-up', minTier: 1, weight: 3, make: makeInterval('up') };
const descending: QuestionType = { id: 'hear-down', minTier: 3, weight: 2, make: makeInterval('down') };
const together: QuestionType = { id: 'hear-together', minTier: 4, weight: 2, make: makeInterval('together') };

export const EAR_INTERVALS_TOPIC: TheoryTopic = {
  id: TOPIC_ID,
  title: 'Hearing intervals',
  blurb: 'Two notes, played one after the other or together. Name the distance between them.',
  maxTier: 5,
  types: [ascending, descending, together],
};
