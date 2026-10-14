// A reference for what each interval sounds like.
//
// The quiz tests recognition; this is the other half — somewhere to sit and
// listen to a major 3rd from a dozen different roots until it sticks. The
// descriptions are deliberately guitar-grounded rather than drawn from songs
// nobody here has agreed on: a fret count and a shape you already play are
// more use at the neck than a half-remembered melody.

import { semitones, spell, type IntervalName } from '../../music/theory/intervals';

export interface IntervalReference {
  interval: IntervalName;
  /** "major 3rd" */
  name: string;
  semitones: number;
  /** How it sits under the hand, and where you have already heard it. */
  blurb: string;
}

const BLURBS: Record<string, string> = {
  '1P': 'No distance at all. On the neck it is the 5th fret of one string against the open string above it — which is how the guitar gets tuned.',
  '2m': 'One fret. The tightest step there is, and the crawl behind every horror-film riff.',
  '2M': 'Two frets. The ordinary step of a scale, and most of what a melody is made of.',
  '3m': 'Three frets. The third of a minor chord, and the opening leap of the Smoke on the Water riff.',
  '3M': 'Four frets. The third of a major chord — the interval that decides a chord is happy.',
  '4P': 'Five frets, and the gap between most pairs of adjacent strings. Your hands already know this one.',
  '4A': 'Six frets. The unstable one, exactly halfway to the octave. Black Sabbath built a genre on it.',
  '5d': 'Six frets — the same sound as the augmented 4th, spelled the other way. Halfway to the octave either way.',
  '5P': 'Seven frets. The power chord, and the most stable interval after the octave.',
  '6m': 'Eight frets. A 5th plus a semitone: the root up to the b6 of a minor key, which is where the drama lives.',
  '6M': 'Nine frets. The bright, open one — the 6th you add to a major chord to soften it.',
  '7m': 'Ten frets. The top note of a dominant 7, and most of the reason the blues sounds like the blues.',
  '7M': 'Eleven frets. A semitone short of the octave, and the tension inside a maj7 chord.',
  '8P': 'Twelve frets. The same note again, one octave up — the 12th fret, or the harmonic above it.',
};

/** Every interval inside an octave, in order, with its reference note. */
export const INTERVAL_REFERENCE: IntervalReference[] = (
  ['1P', '2m', '2M', '3m', '3M', '4P', '4A', '5d', '5P', '6m', '6M', '7m', '7M', '8P'] as IntervalName[]
).map((interval) => ({
  interval,
  name: spell(interval),
  semitones: semitones(interval),
  blurb: BLURBS[interval] ?? '',
}));

export function referenceFor(interval: IntervalName): IntervalReference {
  const found = INTERVAL_REFERENCE.find((r) => r.interval === interval);
  if (!found) throw new Error(`No reference for ${interval}`);
  return found;
}

/**
 * The interval most easily mistaken for this one — what the compare button
 * reaches for by default. Usually its neighbour a semitone away, because that
 * is the distinction that actually takes work.
 */
export function confusableWith(interval: IntervalName): IntervalName {
  const pairs: Record<string, IntervalName> = {
    '1P': '2m', '2m': '2M', '2M': '2m', '3m': '3M', '3M': '3m',
    '4P': '4A', '4A': '5P', '5d': '5P', '5P': '4P',
    '6m': '6M', '6M': '6m', '7m': '7M', '7M': '8P', '8P': '7M',
  };
  return pairs[interval] ?? '3M';
}
