// Ear training on the neck: hear it, then find it.
//
// This is the join between the ear and the hands, and the reason the other
// three topics exist. A phrase is played; you put it back on the fretboard.
// One note at first, then two, then three — melodic imitation, in the small.

import { int, pick } from '../../generate/rng';
import { availablePitches } from '../../generate/pitch';
import { noteTicks } from '../../music/time';
import { STANDARD } from '../../music/tuning';
import { noteName } from '../../music/notes';
import { questionId, type FretTarget, type QuestionType, type TheoryTopic } from '../types';
import { PROMPT_BPM } from './shared';

export const TOPIC_ID = 'ear-fretboard';

const KEYS = ['E', 'A', 'G', 'D', 'C'];
const SCALES_BY_TIER: Record<number, string[]> = {
  1: ['minor pentatonic'],
  2: ['minor pentatonic'],
  3: ['minor pentatonic', 'blues'],
  4: ['minor pentatonic', 'blues', 'aeolian'],
  5: ['minor pentatonic', 'blues', 'aeolian', 'dorian'],
};

const clamp = (t: number) => Math.max(1, Math.min(5, Math.round(t)));
/** One note at the start, three by the top tier. */
export const phraseLengthForTier = (tier: number): number => (clamp(tier) <= 2 ? 1 : clamp(tier) === 3 ? 2 : 3);
export const windowForTier = (tier: number): [number, number] => (clamp(tier) <= 3 ? [5, 8] : [5, 10]);

const hearAndFind: QuestionType = {
  id: 'hear-and-find',
  minTier: 1,
  make(rng, tier) {
    const key = pick(rng, KEYS);
    const scale = pick(rng, SCALES_BY_TIER[clamp(tier)]);
    const window = windowForTier(tier);
    const length = phraseLengthForTier(tier);
    const pitches = availablePitches(key, scale, STANDARD, window);

    // Walk a short line by scale steps, so it is singable rather than random.
    const start = int(rng, 0, Math.max(0, pitches.length - 1));
    const chosen: number[] = [start];
    for (let i = 1; i < length; i++) {
      const step = pick(rng, [-2, -1, 1, 2]);
      chosen.push(Math.max(0, Math.min(pitches.length - 1, chosen[i - 1] + step)));
    }
    const midis = chosen.map((i) => pitches[i]);

    // Every place each note can be played, so any correct fingering counts.
    const spotsFor = (midi: number): FretTarget[] => {
      const out: FretTarget[] = [];
      STANDARD.openMidi.forEach((open, string) => {
        const fret = midi - open;
        if (fret >= window[0] && fret <= window[1]) out.push({ string, fret });
      });
      return out;
    };
    const perNote = midis.map(spotsFor);

    const anchorMidi = pitches[0];
    const anchorSpots = spotsFor(anchorMidi);

    return {
      id: questionId(TOPIC_ID, 'hear-and-find', [key, scale, midis.join(','), String(window[0])]),
      topicId: TOPIC_ID,
      typeId: 'hear-and-find',
      tier,
      mode: 'fretboard-select',
      prompt:
        length === 1
          ? 'Find the note you heard on the neck.'
          : `Play back the ${length} notes you heard, in order.`,
      context: `${key} ${scale}, frets ${window[0]}–${window[1]}. The lowest note of the scale is marked.`,
      audio: {
        notes: midis.map((midi, i) => ({ midi, start: i * noteTicks(4), dur: noteTicks(4) })),
        bpm: PROMPT_BPM,
        label: length === 1 ? 'Play the note' : 'Play the phrase',
      },
      fretboard: {
        marks: anchorSpots.map((s) => ({ string: s.string, fret: s.fret, label: key, style: 'ghost' as const })),
        targets: perNote.flat(),
      },
      // Graded on pitch, not position: play the note anywhere it falls inside
      // the window and it counts. Order matters once there is more than one.
      fretboardAnswer: 'pitch',
      answer: midis.map(String),
      matching: length === 1 ? 'exact' : 'ordered',
      rationale:
        length === 1
          ? `That was ${noteName(midis[0], false)}. In ${key} ${scale} between frets ${window[0]} and ${window[1]} it sits in ${perNote[0].length} place${perNote[0].length === 1 ? '' : 's'}.`
          : `The phrase was ${midis.map((m) => noteName(m, false)).join(' – ')}.`,
      diagnose() {
        return `Sing it back first, then find it. Everything is inside ${key} ${scale} between frets ${window[0]} and ${window[1]}.`;
      },
    };
  },
};

export const EAR_FRETBOARD_TOPIC: TheoryTopic = {
  id: TOPIC_ID,
  title: 'Hear it, then find it',
  blurb: 'A note or a short phrase is played. Put it back on the neck, in the right order.',
  maxTier: 5,
  types: [hearAndFind],
};
