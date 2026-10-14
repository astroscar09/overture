// Theory Lab topic: chord formulas, triads, sevenths and inversions.
//
// A chord is a formula before it is a shape: once "1 b3 5 b7" is automatic, a
// player can build m7 anywhere on the neck instead of recalling a grip. These
// questions drill the formula, the spelling it produces, and what happens when
// the stack is rotated.

import { int, pick, shuffle, type Rng } from '../generate/rng';
import { chordInfo, inversionName, inversionNotes, slashName } from '../music/theory/harmony';
import { midiOf, pitchName, sharpName } from '../music/theory/spelling';
import { STANDARD } from '../music/tuning';
import { fretKey, questionId, type Choice, type QuestionType, type TheoryTopic } from './types';

export const TOPIC_ID = 'chords';

const NECK_FRETS = 15;

export interface QualitySpec {
  id: string;
  /** Appended to the root to make a chord symbol: "m7" gives "Dm7". */
  suffix: string;
  /** How it is spoken: "minor 7th". */
  name: string;
  /** Degrees above the root, as players say them. */
  formula: string;
}

/** The qualities drilled here, in roughly the order a player meets them. */
export const QUALITIES: QualitySpec[] = [
  { id: 'maj', suffix: '', name: 'major triad', formula: '1 3 5' },
  { id: 'min', suffix: 'm', name: 'minor triad', formula: '1 b3 5' },
  { id: 'dom7', suffix: '7', name: 'dominant 7th', formula: '1 3 5 b7' },
  { id: 'min7', suffix: 'm7', name: 'minor 7th', formula: '1 b3 5 b7' },
  { id: 'maj7', suffix: 'maj7', name: 'major 7th', formula: '1 3 5 7' },
  { id: 'dim', suffix: 'dim', name: 'diminished triad', formula: '1 b3 b5' },
  { id: 'aug', suffix: 'aug', name: 'augmented triad', formula: '1 3 #5' },
  { id: 'm7b5', suffix: 'm7b5', name: 'half-diminished 7th', formula: '1 b3 b5 b7' },
  { id: 'sus4', suffix: 'sus4', name: 'suspended 4th', formula: '1 4 5' },
];

const QUALITIES_BY_TIER: Record<number, string[]> = {
  1: ['maj', 'min'],
  2: ['maj', 'min', 'dom7'],
  3: ['maj', 'min', 'dom7', 'min7', 'maj7'],
  4: ['maj', 'min', 'dom7', 'min7', 'maj7', 'dim', 'aug'],
  5: ['min7', 'maj7', 'dom7', 'dim', 'aug', 'm7b5', 'sus4', 'min', 'maj'],
};

const ROOTS_BY_TIER: Record<number, string[]> = {
  1: ['C', 'G', 'D', 'A', 'E', 'F'],
  2: ['C', 'G', 'D', 'A', 'E', 'F', 'B'],
  3: ['C', 'G', 'D', 'A', 'E', 'F', 'B', 'Bb', 'Eb'],
  4: ['C', 'G', 'D', 'A', 'E', 'F', 'Bb', 'Eb', 'Ab', 'F#'],
  5: ['Bb', 'Eb', 'Ab', 'Db', 'F#', 'C#', 'B', 'E', 'A', 'D'],
};

const clamp = (tier: number): number => Math.max(1, Math.min(5, Math.round(tier)));
export const qualitiesForTier = (tier: number): QualitySpec[] =>
  QUALITIES_BY_TIER[clamp(tier)].map((id) => QUALITIES.find((q) => q.id === id)!);
export const rootsForTier = (tier: number): string[] => ROOTS_BY_TIER[clamp(tier)];

const symbolOf = (root: string, q: QualitySpec): string => `${root}${q.suffix}`;
const choice = (label: string): Choice => ({ id: label, label });

/** Capitalise a phrase that is starting a sentence: "the 5th" -> "The 5th". */
const sentence = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

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

export function isPlainSpelling(text: string): boolean {
  return !text.includes('##') && !text.includes('bb');
}

/** A root and quality whose chord spells without double accidentals. */
function pickChord(rng: Rng, tier: number, only?: (q: QualitySpec) => boolean): { root: string; quality: QualitySpec } {
  const roots = rootsForTier(tier);
  const qualities = qualitiesForTier(tier).filter((q) => only?.(q) ?? true);
  for (let attempt = 0; attempt < 40; attempt++) {
    const root = pick(rng, roots);
    const quality = pick(rng, qualities);
    if (isPlainSpelling(chordInfo(symbolOf(root, quality)).notes.join(' '))) return { root, quality };
  }
  return { root: 'C', quality: QUALITIES[0] };
}

// ---- The formula ----

const chordFormula: QuestionType = {
  id: 'chord-formula',
  minTier: 1,
  weight: 2,
  make(rng, tier) {
    const quality = pick(rng, qualitiesForTier(tier));
    return {
      id: questionId(TOPIC_ID, 'chord-formula', [quality.id]),
      topicId: TOPIC_ID,
      typeId: 'chord-formula',
      tier,
      mode: 'multiple-choice',
      prompt: `What is the formula for a ${quality.name}?`,
      context: 'Degrees counted from the root.',
      choices: options(rng, quality.formula, shuffle(rng, QUALITIES).map((q) => q.formula)),
      answer: [quality.formula],
      matching: 'exact',
      rationale: `A ${quality.name} is ${quality.formula}.`,
      diagnose(given) {
        const other = QUALITIES.find((q) => q.formula === given[0]);
        return other ? `That is the formula for a ${other.name}.` : null;
      },
    };
  },
};

// ---- Spell it ----

const spellChord: QuestionType = {
  id: 'spell-chord',
  minTier: 1,
  weight: 2,
  make(rng, tier) {
    const { root, quality } = pickChord(rng, tier);
    const symbol = symbolOf(root, quality);
    const answer = chordInfo(symbol).notes.join(' ');

    const candidates = QUALITIES.map((q) => {
      try {
        return chordInfo(symbolOf(root, q)).notes.join(' ');
      } catch {
        return '';
      }
    }).filter((n) => n && isPlainSpelling(n));

    return {
      id: questionId(TOPIC_ID, 'spell-chord', [symbol]),
      topicId: TOPIC_ID,
      typeId: 'spell-chord',
      tier,
      mode: 'multiple-choice',
      prompt: `What notes are in ${symbol}?`,
      choices: options(rng, answer, shuffle(rng, candidates)),
      answer: [answer],
      matching: 'exact',
      rationale: `${symbol} is a ${quality.name}: ${quality.formula} from ${root}, which spells ${answer}.`,
      diagnose(given) {
        const other = QUALITIES.find((q) => {
          try {
            return chordInfo(symbolOf(root, q)).notes.join(' ') === given[0];
          } catch {
            return false;
          }
        });
        return other ? `Those notes spell ${symbolOf(root, other)} — a ${other.name} (${other.formula}).` : null;
      },
    };
  },
};

// ---- Name it from its notes ----

const nameChord: QuestionType = {
  id: 'name-chord',
  minTier: 2,
  make(rng, tier) {
    const { root, quality } = pickChord(rng, tier);
    const symbol = symbolOf(root, quality);
    const notes = chordInfo(symbol).notes;

    const candidates = [
      ...QUALITIES.map((q) => symbolOf(root, q)),
      ...rootsForTier(tier).map((r) => symbolOf(r, quality)),
    ];

    return {
      id: questionId(TOPIC_ID, 'name-chord', [symbol]),
      topicId: TOPIC_ID,
      typeId: 'name-chord',
      tier,
      mode: 'multiple-choice',
      prompt: `Which chord is ${notes.join(' ')}?`,
      choices: options(rng, symbol, shuffle(rng, candidates)),
      answer: [symbol],
      matching: 'exact',
      rationale: `${notes.join(' ')} is ${symbol}: the root is ${root} and the intervals above it are ${quality.formula}.`,
      diagnose(given) {
        const g = given[0];
        if (!g) return null;
        if (!g.startsWith(root)) return `The lowest note here is ${root}, so the chord is named after ${root}.`;
        const other = QUALITIES.find((q) => symbolOf(root, q) === g);
        return other ? `${g} would be ${other.formula}; these notes give ${quality.formula}.` : null;
      },
    };
  },
};

// ---- Which tone is this note? ----

const DEGREE_WORDS: Record<string, string> = {
  '1': 'the root', '3': 'the 3rd', 'b3': 'the b3rd', '5': 'the 5th', 'b5': 'the b5th',
  '#5': 'the #5th', 'b7': 'the b7th', '7': 'the major 7th', '4': 'the 4th', '2': 'the 2nd',
};

const whichTone: QuestionType = {
  id: 'which-tone',
  minTier: 3,
  make(rng, tier) {
    const { root, quality } = pickChord(rng, tier);
    const symbol = symbolOf(root, quality);
    const info = chordInfo(symbol);
    const index = int(rng, 1, info.notes.length - 1);
    const note = info.notes[index];
    const answer = DEGREE_WORDS[info.formula[index]] ?? info.formula[index];

    return {
      id: questionId(TOPIC_ID, 'which-tone', [symbol, note]),
      topicId: TOPIC_ID,
      typeId: 'which-tone',
      tier,
      mode: 'multiple-choice',
      prompt: `In the chord ${symbol}, what is ${note}?`,
      choices: options(rng, answer, shuffle(rng, Object.values(DEGREE_WORDS))),
      answer: [answer],
      matching: 'exact',
      rationale: `${symbol} is ${info.notes.join(' ')} — ${quality.formula}. ${note} is ${answer}.`,
      diagnose() {
        return `Line the notes up against the formula: ${info.notes.join(' ')} against ${quality.formula}.`;
      },
    };
  },
};

// ---- Inversions ----

const identifyInversion: QuestionType = {
  id: 'identify-inversion',
  minTier: 3,
  weight: 2,
  make(rng, tier) {
    const { root, quality } = pickChord(rng, tier);
    const symbol = symbolOf(root, quality);
    const size = chordInfo(symbol).notes.length;
    const inversion = int(rng, 0, size - 1);
    const voiced = inversionNotes(symbol, inversion);
    const answer = inversionName(inversion, size);

    // A triad has no third inversion — a useful thing to have been tempted by.
    const allNames = ['root position', 'first inversion', 'second inversion', 'third inversion'];

    return {
      id: questionId(TOPIC_ID, 'identify-inversion', [symbol, String(inversion)]),
      topicId: TOPIC_ID,
      typeId: 'identify-inversion',
      tier,
      mode: 'multiple-choice',
      prompt: `${symbol} with ${voiced[0]} in the bass — which inversion is that?`,
      context: `The chord is ${chordInfo(symbol).notes.join(' ')}.`,
      choices: options(rng, answer, allNames),
      answer: [answer],
      matching: 'exact',
      rationale:
        inversion === 0
          ? `With the root in the bass the chord is in root position: ${voiced.join(' ')}, written ${symbol}.`
          : `${voiced[0]} is ${DEGREE_WORDS[chordInfo(symbol).formula[inversion]] ?? 'a chord tone'} of ${symbol}, so this is ${answer} — written ${slashName(symbol, inversion)}.`,
      diagnose(given) {
        const g = given[0];
        if (g === 'third inversion' && size === 3) {
          return 'A triad has only three notes, so it has no third inversion — only root position, first and second.';
        }
        return `Count how far up the stack the bass note sits: ${chordInfo(symbol).notes.join(' ')}, and the bass here is ${voiced[0]}.`;
      },
    };
  },
};

// ---- Build it ----

const buildChord: QuestionType = {
  id: 'build-chord',
  minTier: 2,
  make(rng, tier) {
    const { root, quality } = pickChord(rng, tier);
    const symbol = symbolOf(root, quality);
    const notes = chordInfo(symbol).notes;

    return {
      id: questionId(TOPIC_ID, 'build-chord', [symbol]),
      topicId: TOPIC_ID,
      typeId: 'build-chord',
      tier,
      mode: 'build-sequence',
      prompt: `Stack up ${symbol}, from the root.`,
      context: `A ${quality.name} is ${quality.formula}.`,
      pool: shuffle(rng, notes).map(choice),
      answer: [...notes],
      matching: 'ordered',
      rationale: `${symbol} stacks as ${notes.join(' ')} — ${quality.formula} above ${root}.`,
      diagnose(given) {
        const firstWrong = given.findIndex((n, i) => n !== notes[i]);
        if (firstWrong === 0) return `Start on the root, ${root} — the chord takes its name from it.`;
        if (firstWrong > 0) {
          return `The first ${firstWrong === 1 ? 'note is' : `${firstWrong} notes are`} right — next comes ${notes[firstWrong]}, the ${quality.formula.split(' ')[firstWrong]}.`;
        }
        return null;
      },
    };
  },
};

// ---- Find a chord tone on the neck ----

interface Spot {
  string: number;
  fret: number;
  midi: number;
}

function neckSpots(midi: number, openMidi: readonly number[]): Spot[] {
  const spots: Spot[] = [];
  openMidi.forEach((open, string) => {
    const fret = midi - open;
    if (fret >= 0 && fret <= NECK_FRETS) spots.push({ string, fret, midi });
  });
  return spots;
}

function placeRoot(rng: Rng, rootName: string, openMidi: readonly number[]): Spot | null {
  const wanted = pitchName(sharpName(midiOf(`${rootName}4`)));
  const candidates: Spot[] = [];
  for (let string = 0; string <= 3; string++) {
    for (let fret = 1; fret <= 9; fret++) {
      const midi = openMidi[string] + fret;
      if (pitchName(sharpName(midi)) === wanted) candidates.push({ string, fret, midi });
    }
  }
  return candidates.length ? candidates[int(rng, 0, candidates.length - 1)] : null;
}

const findChordTone: QuestionType = {
  id: 'find-chord-tone',
  minTier: 2,
  weight: 2,
  make(rng, tier) {
    const openMidi = STANDARD.openMidi;
    let root: Spot | null = null;
    let quality = QUALITIES[0];
    let rootName = 'C';
    let degreeIndex = 1;
    let targets: Spot[] = [];

    for (let attempt = 0; attempt < 40; attempt++) {
      const picked = pickChord(rng, tier);
      rootName = picked.root;
      quality = picked.quality;
      root = placeRoot(rng, rootName, openMidi);
      if (!root) continue;
      const info = chordInfo(symbolOf(rootName, quality));
      degreeIndex = int(rng, 1, info.notes.length - 1);
      const semis = semitonesOfDegree(info.formula[degreeIndex]);
      targets = neckSpots(root.midi + semis, openMidi).filter((s) => Math.abs(s.fret - root!.fret) <= 6);
      if (targets.length) break;
    }
    if (!root || !targets.length) {
      root = { string: 1, fret: 3, midi: openMidi[1] + 3 };
      rootName = 'C';
      quality = QUALITIES[0];
      degreeIndex = 1;
      targets = neckSpots(root.midi + 4, openMidi).filter((s) => Math.abs(s.fret - root!.fret) <= 6);
    }

    const symbol = symbolOf(rootName, quality);
    const info = chordInfo(symbol);
    const degree = info.formula[degreeIndex];
    const targetNote = info.notes[degreeIndex];
    const spoken = DEGREE_WORDS[degree] ?? `the ${degree}`;

    return {
      id: questionId(TOPIC_ID, 'find-chord-tone', [symbol, degree, `${root.string}:${root.fret}`]),
      topicId: TOPIC_ID,
      typeId: 'find-chord-tone',
      tier,
      mode: 'fretboard-select',
      prompt: `From the marked ${rootName}, find ${spoken} of ${symbol}.`,
      context: `A ${quality.name} is ${quality.formula}. Click it within reach of the root.`,
      fretboard: {
        marks: [{ string: root.string, fret: root.fret, label: rootName, style: 'primary' as const }],
        targets: targets.map((s) => ({ string: s.string, fret: s.fret })),
      },
      answer: targets.map((s) => fretKey(s.string, s.fret)),
      matching: 'any',
      rationale: `${sentence(spoken)} of ${symbol} is ${targetNote} — ${semitonesOfDegree(degree)} semitones above the root.`,
      diagnose() {
        return `Count ${semitonesOfDegree(degree)} frets up from the marked ${rootName}, or find the same pitch on a nearby string.`;
      },
    };
  },
};

/** Semitones above the root for a formula degree like "b3" or "#5". */
export function semitonesOfDegree(degree: string): number {
  const table: Record<string, number> = {
    '1': 0, 'b2': 1, '2': 2, 'b3': 3, '3': 4, '4': 5, 'b5': 6,
    '5': 7, '#5': 8, '6': 9, 'b7': 10, '7': 11,
  };
  return table[degree] ?? 0;
}

export const CHORDS_TOPIC: TheoryTopic = {
  id: TOPIC_ID,
  title: 'Chords: formulas, triads, 7ths & inversions',
  blurb: 'The formula behind each chord quality, the notes it spells, what the tones are called, and what changes when the stack is rotated.',
  maxTier: 5,
  types: [chordFormula, spellChord, nameChord, buildChord, findChordTone, whichTone, identifyInversion],
};
