// Ear training: hearing a scale run and naming it.
//
// The pool leans towards what rock, blues and metal are actually built from —
// pentatonics and the blues scale early, phrygian and harmonic minor as the
// darker colours further up.

import { int, pick, shuffle } from '../../generate/rng';
import { scaleNotes } from '../../music/theory/keys';
import { pitchClassOf } from '../../music/theory/spelling';
import { questionId, type QuestionType, type TheoryTopic } from '../types';
import { BASE_MIDI, RANGE_MIDI, melodic, options } from './shared';

export const TOPIC_ID = 'ear-scales';

export interface EarScale {
  id: string;
  name: string;
}

export const SCALES: EarScale[] = [
  { id: 'major', name: 'major' },
  { id: 'aeolian', name: 'natural minor' },
  { id: 'minor pentatonic', name: 'minor pentatonic' },
  { id: 'major pentatonic', name: 'major pentatonic' },
  { id: 'blues', name: 'blues' },
  { id: 'dorian', name: 'dorian' },
  { id: 'mixolydian', name: 'mixolydian' },
  { id: 'phrygian', name: 'phrygian' },
  { id: 'harmonic minor', name: 'harmonic minor' },
  { id: 'lydian', name: 'lydian' },
];

const BY_TIER: Record<number, string[]> = {
  1: ['major', 'aeolian'],
  2: ['major', 'aeolian', 'minor pentatonic'],
  3: ['major', 'aeolian', 'minor pentatonic', 'blues', 'dorian'],
  4: ['major', 'aeolian', 'minor pentatonic', 'blues', 'dorian', 'mixolydian', 'phrygian'],
  5: SCALES.map((s) => s.id),
};

const clamp = (t: number) => Math.max(1, Math.min(5, Math.round(t)));
export const scalesForTier = (tier: number): EarScale[] =>
  BY_TIER[clamp(tier)].map((id) => SCALES.find((s) => s.id === id)!);

/** The scale as MIDI, one octave up from a root, ending on the octave. */
export function scaleRun(rootMidi: number, scaleId: string): number[] {
  const pcs = scaleNotes('C', scaleId).map(pitchClassOf);
  // Tonal spells from C; shift the intervals onto the chosen root.
  const steps = pcs.map((pc) => (pc - pcs[0] + 12) % 12).sort((a, b) => a - b);
  return [...steps.map((s) => rootMidi + s), rootMidi + 12];
}

const hearScale: QuestionType = {
  id: 'hear-scale',
  minTier: 1,
  make(rng, tier) {
    const pool = scalesForTier(tier);
    const scale = pick(rng, pool);
    const root = BASE_MIDI + int(rng, 0, RANGE_MIDI - 12);
    const descending = tier >= 4 && rng() < 0.35;
    const run = scaleRun(root, scale.id);
    const sounded = descending ? [...run].reverse() : run;

    return {
      id: questionId(TOPIC_ID, 'hear-scale', [scale.id, String(root), descending ? 'down' : 'up']),
      topicId: TOPIC_ID,
      typeId: 'hear-scale',
      tier,
      mode: 'multiple-choice',
      prompt: descending ? 'A scale, played downward. Which one?' : 'Which scale is that?',
      context: `${run.length} notes${descending ? ', from the octave down to the root' : ', root to octave'}.`,
      audio: melodic(sounded, 'Play the scale', 240),
      choices: options(rng, scale.name, shuffle(rng, SCALES).map((s) => s.name)),
      answer: [scale.name],
      matching: 'exact',
      rationale: `That was ${scale.name} — ${run.length - 1} notes to the octave.`,
      diagnose(given) {
        const guessed = SCALES.find((s) => s.name === given[0]);
        if (!guessed) return null;
        const theirs = scaleRun(root, guessed.id);
        if (theirs.length !== run.length) {
          return `${given[0][0].toUpperCase()}${given[0].slice(1)} has ${theirs.length - 1} notes to the octave; you heard ${run.length - 1}.`;
        }
        const first = run.findIndex((n, i) => theirs[i] !== n);
        return first > 0
          ? `The two run together until note ${first + 1}, where ${guessed.name} goes somewhere else.`
          : `Listen again to the 3rd — it separates most of these.`;
      },
    };
  },
};

export const EAR_SCALES_TOPIC: TheoryTopic = {
  id: TOPIC_ID,
  title: 'Hearing scales',
  blurb: 'A run of notes, root to octave. Name the scale by its colour.',
  maxTier: 5,
  types: [hearScale],
};
