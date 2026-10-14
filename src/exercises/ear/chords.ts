// Ear training: hearing a chord's quality, and hearing which of its tones is
// sounding. The second of those is the one that feeds straight back into
// soloing — knowing you are sitting on the b7 without having to work it out.

import { int, pick, shuffle } from '../../generate/rng';
import { questionId, type QuestionType, type TheoryTopic } from '../types';
import { BASE_MIDI, RANGE_MIDI, chordThenNote, harmonic, options } from './shared';

export const TOPIC_ID = 'ear-chords';

export interface EarQuality {
  id: string;
  name: string;
  /** Semitones above the root. */
  tones: number[];
  /** What each tone is called, in the same order. */
  degrees: string[];
}

export const QUALITIES: EarQuality[] = [
  { id: 'maj', name: 'major', tones: [0, 4, 7], degrees: ['the root', 'the 3rd', 'the 5th'] },
  { id: 'min', name: 'minor', tones: [0, 3, 7], degrees: ['the root', 'the b3rd', 'the 5th'] },
  { id: 'dom7', name: 'dominant 7th', tones: [0, 4, 7, 10], degrees: ['the root', 'the 3rd', 'the 5th', 'the b7th'] },
  { id: 'min7', name: 'minor 7th', tones: [0, 3, 7, 10], degrees: ['the root', 'the b3rd', 'the 5th', 'the b7th'] },
  { id: 'maj7', name: 'major 7th', tones: [0, 4, 7, 11], degrees: ['the root', 'the 3rd', 'the 5th', 'the major 7th'] },
  { id: 'dim', name: 'diminished', tones: [0, 3, 6], degrees: ['the root', 'the b3rd', 'the b5th'] },
  { id: 'aug', name: 'augmented', tones: [0, 4, 8], degrees: ['the root', 'the 3rd', 'the #5th'] },
  { id: 'sus4', name: 'suspended 4th', tones: [0, 5, 7], degrees: ['the root', 'the 4th', 'the 5th'] },
];

const BY_TIER: Record<number, string[]> = {
  1: ['maj', 'min'],
  2: ['maj', 'min', 'dom7'],
  3: ['maj', 'min', 'dom7', 'min7', 'maj7'],
  4: ['maj', 'min', 'dom7', 'min7', 'maj7', 'dim'],
  5: ['maj', 'min', 'dom7', 'min7', 'maj7', 'dim', 'aug', 'sus4'],
};

const clamp = (t: number) => Math.max(1, Math.min(5, Math.round(t)));
export const qualitiesForTier = (tier: number): EarQuality[] =>
  BY_TIER[clamp(tier)].map((id) => QUALITIES.find((q) => q.id === id)!);

const hearQuality: QuestionType = {
  id: 'hear-quality',
  minTier: 1,
  weight: 2,
  make(rng, tier) {
    const pool = qualitiesForTier(tier);
    const quality = pick(rng, pool);
    const root = BASE_MIDI + int(rng, 0, RANGE_MIDI - 12);
    const midis = quality.tones.map((t) => root + t);

    return {
      id: questionId(TOPIC_ID, 'hear-quality', [quality.id, String(root)]),
      topicId: TOPIC_ID,
      typeId: 'hear-quality',
      tier,
      mode: 'multiple-choice',
      prompt: 'What kind of chord is that?',
      context: 'Listen for the 3rd first — it decides major or minor.',
      audio: harmonic(midis, 'Play the chord'),
      choices: options(rng, quality.name, shuffle(rng, QUALITIES).map((q) => q.name)),
      answer: [quality.name],
      matching: 'exact',
      rationale: `That was a ${quality.name} chord — ${quality.degrees.join(', ')}.`,
      diagnose(given) {
        const guessed = QUALITIES.find((q) => q.name === given[0]);
        if (!guessed) return null;
        const differs = quality.tones.find((t, i) => guessed.tones[i] !== t);
        if (differs !== undefined) {
          return `A ${guessed.name} has ${guessed.tones.join('-')} above the root; this one had ${quality.tones.join('-')}.`;
        }
        return `Compare the two: ${guessed.name} against ${quality.name}.`;
      },
    };
  },
};

const whichTone: QuestionType = {
  id: 'which-tone-sounded',
  minTier: 2,
  weight: 2,
  make(rng, tier) {
    const pool = qualitiesForTier(tier);
    const quality = pick(rng, pool);
    const root = BASE_MIDI + int(rng, 0, RANGE_MIDI - 12);
    const midis = quality.tones.map((t) => root + t);
    // Never the root: hearing the root against its own chord is a different,
    // much easier task than picking the 3rd out of the middle.
    const index = int(rng, 1, quality.tones.length - 1);
    const answer = quality.degrees[index];

    return {
      id: questionId(TOPIC_ID, 'which-tone-sounded', [quality.id, String(root), String(index)]),
      topicId: TOPIC_ID,
      typeId: 'which-tone-sounded',
      tier,
      mode: 'multiple-choice',
      prompt: `A ${quality.name} chord, then one note from it. Which note was it?`,
      context: 'The chord first, then the single note.',
      audio: chordThenNote(midis, midis[index], 'Play chord, then note'),
      choices: options(
        rng,
        answer,
        shuffle(rng, [...quality.degrees, ...QUALITIES.flatMap((q) => q.degrees)]),
      ),
      answer: [answer],
      matching: 'exact',
      rationale: `It was ${answer}, ${quality.tones[index]} semitones above the root of the ${quality.name} chord.`,
      diagnose(given) {
        const g = given[0];
        const guessedIndex = quality.degrees.indexOf(g);
        if (guessedIndex < 0) return `A ${quality.name} chord does not contain ${g}.`;
        const diff = quality.tones[guessedIndex] - quality.tones[index];
        return `${g[0].toUpperCase()}${g.slice(1)} would have sounded ${Math.abs(diff)} semitone${Math.abs(diff) === 1 ? '' : 's'} ${diff > 0 ? 'higher' : 'lower'}.`;
      },
    };
  },
};

export const EAR_CHORDS_TOPIC: TheoryTopic = {
  id: TOPIC_ID,
  title: 'Hearing chords',
  blurb: 'Naming a chord by its sound, and picking out which of its tones is ringing.',
  maxTier: 5,
  types: [hearQuality, whichTone],
};
