// Theory Lab topic: functional harmony and Roman numeral analysis.
//
// This is where the other three topics pay off: once a key spells itself and a
// chord is a formula, a progression becomes a sentence. The borrowed chords get
// real weight here — bVII, bVI and bIII are not exotic in rock and metal, they
// are most of the vocabulary.

import { pick, shuffle, type Rng } from '../generate/rng';
import { diatonicSevenths, diatonicTriads, fromRomanNumerals, toRomanNumerals } from '../music/theory/harmony';
import type { Mode } from '../music/theory/keys';
import { questionId, type Choice, type QuestionType, type TheoryTopic } from './types';

export const TOPIC_ID = 'functional-harmony';

const KEYS_BY_TIER: Record<number, string[]> = {
  1: ['C', 'G', 'D', 'A'],
  2: ['C', 'G', 'D', 'A', 'E', 'F'],
  3: ['C', 'G', 'D', 'A', 'E', 'F', 'Bb', 'Eb'],
  4: ['G', 'D', 'A', 'E', 'B', 'F', 'Bb', 'Eb', 'Ab'],
  5: ['A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'D', 'G'],
};

const clamp = (tier: number): number => Math.max(1, Math.min(5, Math.round(tier)));
export const keysForTier = (tier: number): string[] => KEYS_BY_TIER[clamp(tier)];
/** Minor keys arrive once the major ones are solid. */
export const modesForTier = (tier: number): Mode[] => (clamp(tier) >= 3 ? ['major', 'minor'] : ['major']);

export const MAJOR_NUMERALS = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
export const MINOR_NUMERALS = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'];

export const numeralsFor = (mode: Mode): string[] => (mode === 'major' ? MAJOR_NUMERALS : MINOR_NUMERALS);

/**
 * What a degree does in the key. Tonic is home, subdominant moves away,
 * dominant pulls back. The names a student is examined on.
 */
export type HarmonicFunction = 'tonic' | 'subdominant' | 'dominant';

const FUNCTION_BY_DEGREE: Record<Mode, HarmonicFunction[]> = {
  major: ['tonic', 'subdominant', 'tonic', 'subdominant', 'dominant', 'tonic', 'dominant'],
  minor: ['tonic', 'subdominant', 'tonic', 'subdominant', 'dominant', 'subdominant', 'dominant'],
};

/** Progressions worth knowing, written as numerals. */
const MAJOR_PROGRESSIONS: string[][] = [
  ['I', 'V', 'vi', 'IV'],
  ['I', 'IV', 'V', 'I'],
  ['ii', 'V', 'I', 'I'],
  ['I', 'vi', 'IV', 'V'],
  ['I', 'bVII', 'IV', 'I'],
  ['I', 'bIII', 'bVII', 'IV'],
];
const MINOR_PROGRESSIONS: string[][] = [
  ['i', 'VI', 'III', 'VII'],
  ['i', 'iv', 'v', 'i'],
  ['i', 'VII', 'VI', 'VII'],
  ['i', 'iv', 'VII', 'III'],
];

/** The chords rock borrows from the parallel minor. */
const BORROWED = ['bIII', 'bVI', 'bVII'];

const choice = (label: string): Choice => ({ id: label, label });

function options(rng: Rng, answer: string, candidates: string[]): Choice[] {
  const seen = new Set([answer]);
  const wrong: string[] = [];
  for (const c of candidates) {
    if (seen.has(c)) continue;
    seen.add(c);
    wrong.push(c);
    if (wrong.length === 3) break;
  }
  if (wrong.length < 3) throw new Error(`options: only ${wrong.length} distractors for "${answer}"`);
  return shuffle(rng, [answer, ...wrong]).map(choice);
}

function pickKey(rng: Rng, tier: number): { tonic: string; mode: Mode; label: string } {
  const tonic = pick(rng, keysForTier(tier));
  const mode = pick(rng, modesForTier(tier));
  return { tonic, mode, label: `${tonic} ${mode}` };
}

// ---- Which numeral is this chord? ----

const numeralForChord: QuestionType = {
  id: 'numeral-for-chord',
  minTier: 1,
  weight: 2,
  make(rng, tier) {
    const { tonic, mode, label } = pickKey(rng, tier);
    const chords = diatonicTriads(tonic, mode);
    const numerals = numeralsFor(mode);
    const degree = Math.floor(rng() * 7);
    const chord = chords[degree];
    const answer = numerals[degree];

    return {
      id: questionId(TOPIC_ID, 'numeral-for-chord', [label, chord]),
      topicId: TOPIC_ID,
      typeId: 'numeral-for-chord',
      tier,
      mode: 'multiple-choice',
      prompt: `In ${label}, which numeral is ${chord}?`,
      choices: options(rng, answer, shuffle(rng, numerals)),
      answer: [answer],
      matching: 'exact',
      rationale: `${label} harmonises as ${chords.map((c, i) => `${numerals[i]} ${c}`).join(', ')}. ${chord} is the ${answer}.`,
      diagnose(given) {
        const g = given[0];
        const index = numerals.indexOf(g);
        if (index < 0) return null;
        if (g.toUpperCase() === answer.toUpperCase()) {
          return `Right degree, wrong quality — ${chord} is ${answer.startsWith(answer[0].toUpperCase()) ? 'major' : 'minor'}, so the numeral is written ${answer}.`;
        }
        return `${g} is ${chords[index]} in this key.`;
      },
    };
  },
};

// ---- Which chord is this numeral? ----

const chordForNumeral: QuestionType = {
  id: 'chord-for-numeral',
  minTier: 1,
  weight: 2,
  make(rng, tier) {
    const { tonic, mode, label } = pickKey(rng, tier);
    const chords = diatonicTriads(tonic, mode);
    const numerals = numeralsFor(mode);
    const degree = Math.floor(rng() * 7);
    const answer = chords[degree];

    return {
      id: questionId(TOPIC_ID, 'chord-for-numeral', [label, numerals[degree]]),
      topicId: TOPIC_ID,
      typeId: 'chord-for-numeral',
      tier,
      mode: 'multiple-choice',
      prompt: `In ${label}, what chord is the ${numerals[degree]}?`,
      choices: options(rng, answer, shuffle(rng, chords)),
      answer: [answer],
      matching: 'exact',
      rationale: `The ${numerals[degree]} of ${label} is ${answer}. The full set is ${chords.join(' ')}.`,
      diagnose(given) {
        const index = chords.indexOf(given[0]);
        if (index < 0) return `${given[0]} is not in ${label} at all — the key gives ${chords.join(' ')}.`;
        return `${given[0]} is the ${numerals[index]}, not the ${numerals[degree]}.`;
      },
    };
  },
};

// ---- Is it in the key? ----

const pickDiatonic: QuestionType = {
  id: 'pick-diatonic',
  minTier: 2,
  make(rng, tier) {
    const { tonic, mode, label } = pickKey(rng, tier);
    const chords = diatonicTriads(tonic, mode);
    const answer = pick(rng, chords);
    const inKey = new Set(chords);

    // Outsiders: the parallel quality of a chord that IS in the key, which is
    // the near-miss worth noticing.
    const outsiders = chords
      .flatMap((c) => (c.endsWith('m') ? [c.slice(0, -1)] : c.endsWith('dim') ? [c.slice(0, -3)] : [`${c}m`]))
      .filter((c) => !inKey.has(c));

    return {
      id: questionId(TOPIC_ID, 'pick-diatonic', [label, answer]),
      topicId: TOPIC_ID,
      typeId: 'pick-diatonic',
      tier,
      mode: 'multiple-choice',
      prompt: `Which of these belongs to ${label}?`,
      choices: options(rng, answer, shuffle(rng, outsiders)),
      answer: [answer],
      matching: 'exact',
      rationale: `${label} contains ${chords.join(' ')}, so ${answer} belongs and the others do not.`,
      diagnose(given) {
        const g = given[0];
        const root = g.replace(/m$|dim$/, '');
        const related = chords.find((c) => c.replace(/m$|dim$/, '') === root);
        if (related) return `${related} is in the key, but ${g} is not — the quality is what puts it outside ${label}.`;
        return `${label} gives ${chords.join(' ')}.`;
      },
    };
  },
};

// ---- Analyse a progression ----

const analyseProgression: QuestionType = {
  id: 'analyse-progression',
  minTier: 2,
  weight: 2,
  make(rng, tier) {
    const { tonic, mode, label } = pickKey(rng, tier);
    const progression = pick(rng, mode === 'major' ? MAJOR_PROGRESSIONS : MINOR_PROGRESSIONS);
    const chords = fromRomanNumerals(tonic, progression);
    const answer = progression.join(' – ');

    const others = (mode === 'major' ? MAJOR_PROGRESSIONS : MINOR_PROGRESSIONS)
      .filter((p) => p.join(' ') !== progression.join(' '))
      .map((p) => p.join(' – '));

    return {
      id: questionId(TOPIC_ID, 'analyse-progression', [label, answer]),
      topicId: TOPIC_ID,
      typeId: 'analyse-progression',
      tier,
      mode: 'multiple-choice',
      prompt: `In ${label}, analyse ${chords.join(' – ')}.`,
      choices: options(rng, answer, shuffle(rng, others)),
      answer: [answer],
      matching: 'exact',
      rationale: `In ${label} that is ${answer}: ${chords.map((c, i) => `${c} = ${progression[i]}`).join(', ')}.`,
      diagnose() {
        return `Work out each chord's degree against the tonic ${tonic}: ${chords.map((c, i) => `${c} is the ${progression[i]}`).join(', ')}.`;
      },
    };
  },
};

// ---- Build a progression from numerals ----

const buildProgression: QuestionType = {
  id: 'build-progression',
  minTier: 3,
  make(rng, tier) {
    const { tonic, mode, label } = pickKey(rng, tier);
    const progression = pick(rng, mode === 'major' ? MAJOR_PROGRESSIONS : MINOR_PROGRESSIONS);
    const chords = fromRomanNumerals(tonic, progression);
    const distractorPool = shuffle(rng, [
      ...diatonicTriads(tonic, mode),
      ...fromRomanNumerals(tonic, BORROWED),
    ]).filter((c) => !chords.includes(c));

    return {
      id: questionId(TOPIC_ID, 'build-progression', [label, progression.join(' ')]),
      topicId: TOPIC_ID,
      typeId: 'build-progression',
      tier,
      mode: 'build-sequence',
      prompt: `Play ${progression.join(' – ')} in ${label}.`,
      context: 'Pick the chords in order.',
      pool: shuffle(rng, [...chords, ...distractorPool.slice(0, 3)]).map(choice),
      answer: [...chords],
      matching: 'ordered',
      rationale: `In ${label}, ${progression.join(' – ')} is ${chords.join(' – ')}.`,
      diagnose(given) {
        const firstWrong = given.findIndex((c, i) => c !== chords[i]);
        if (firstWrong === 0) return `Start on the ${progression[0]} — in ${label} that is ${chords[0]}.`;
        if (firstWrong > 0) return `The first ${firstWrong === 1 ? 'chord is' : `${firstWrong} chords are`} right — the ${progression[firstWrong]} is ${chords[firstWrong]}.`;
        if (given.length !== chords.length) return `This progression has ${chords.length} chords.`;
        return null;
      },
    };
  },
};

// ---- What does it do? ----

const chordFunction: QuestionType = {
  id: 'chord-function',
  minTier: 4,
  make(rng, tier) {
    const { tonic, mode, label } = pickKey(rng, tier);
    const chords = diatonicTriads(tonic, mode);
    const numerals = numeralsFor(mode);
    const degree = Math.floor(rng() * 7);
    const answer = FUNCTION_BY_DEGREE[mode][degree];

    const explain: Record<HarmonicFunction, string> = {
      tonic: 'home — the chord the key rests on',
      subdominant: 'moving away from home, setting up the dominant',
      dominant: 'the tension that pulls back to the tonic',
    };

    return {
      id: questionId(TOPIC_ID, 'chord-function', [label, numerals[degree]]),
      topicId: TOPIC_ID,
      typeId: 'chord-function',
      tier,
      mode: 'multiple-choice',
      prompt: `In ${label}, what is the function of ${chords[degree]} (${numerals[degree]})?`,
      choices: options(rng, answer, ['tonic', 'subdominant', 'dominant', 'leading tone', 'passing chord']),
      answer: [answer],
      matching: 'exact',
      rationale: `The ${numerals[degree]} is ${answer}: ${explain[answer]}.`,
      diagnose(given) {
        const g = given[0] as HarmonicFunction;
        if (!explain[g]) return `The three functions are tonic, subdominant and dominant — everything else is a description, not a function.`;
        const examples = numerals.filter((_, i) => FUNCTION_BY_DEGREE[mode][i] === g);
        return `The ${g} chords in ${label} are ${examples.join(', ')}.`;
      },
    };
  },
};

// ---- Borrowed chords ----

const borrowedChord: QuestionType = {
  id: 'borrowed-chord',
  minTier: 4,
  weight: 2,
  make(rng, tier) {
    const tonic = pick(rng, keysForTier(tier));
    const numeral = pick(rng, BORROWED);
    const answer = fromRomanNumerals(tonic, [numeral])[0];
    const diatonic = diatonicTriads(tonic, 'major');

    return {
      id: questionId(TOPIC_ID, 'borrowed-chord', [tonic, numeral]),
      topicId: TOPIC_ID,
      typeId: 'borrowed-chord',
      tier,
      mode: 'multiple-choice',
      prompt: `In ${tonic} major, what chord is the ${numeral}?`,
      context: 'Borrowed from the parallel minor — the backbone of rock and metal harmony.',
      choices: options(rng, answer, shuffle(rng, [...diatonic, ...fromRomanNumerals(tonic, BORROWED)])),
      answer: [answer],
      matching: 'exact',
      rationale: `The ${numeral} of ${tonic} major is ${answer}. It is not in the key — it is borrowed from ${tonic} minor, a semitone below the diatonic degree, which is what gives it the darker sound.`,
      diagnose(given) {
        const g = given[0];
        if (diatonic.includes(g)) {
          return `${g} is diatonic to ${tonic} major. The ${numeral} is flattened — a semitone below the diatonic degree — which is what makes it borrowed.`;
        }
        return `Count up from ${tonic}: the ${numeral} sits a semitone below the natural degree, giving ${answer}.`;
      },
    };
  },
};

export const HARMONY_TOPIC: TheoryTopic = {
  id: TOPIC_ID,
  title: 'Functional harmony & Roman numerals',
  blurb: 'How chords are numbered inside a key, what each degree does, and where the borrowed rock chords come from.',
  maxTier: 5,
  types: [
    numeralForChord,
    chordForNumeral,
    pickDiatonic,
    analyseProgression,
    buildProgression,
    chordFunction,
    borrowedChord,
  ],
};

/** Exported for tests: the analysis the topic claims for a progression. */
export function analyse(tonic: string, chords: readonly string[], mode: Mode = 'major'): string[] {
  return toRomanNumerals(tonic, chords, mode);
}

/** Exported for tests: diatonic sevenths, used by the harder tiers later. */
export const sevenths = diatonicSevenths;

/** Exported for tests: what each degree does. */
export function functionOf(mode: Mode, degree: number): HarmonicFunction {
  return FUNCTION_BY_DEGREE[mode][degree];
}

export { MAJOR_PROGRESSIONS, MINOR_PROGRESSIONS, BORROWED };
