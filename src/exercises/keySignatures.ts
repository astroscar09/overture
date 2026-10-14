// Theory Lab topic: key signatures and scale construction.
//
// The distractors matter as much as the answers here. A wrong option is only
// useful if it is a mistake a player actually makes — the relative minor, the
// enharmonic spelling, one accidental too many, sharps where flats belong — so
// each generator builds its wrong answers deliberately and can say, afterwards,
// which mistake was made.

import { pick, shuffle, type Rng } from '../generate/rng';
import { keyInfo, majorKey, minorKey, minorScale } from '../music/theory/keys';
import { pitchClassOf } from '../music/theory/spelling';
import { pitchClassSpots } from '../music/noteDrill';
import { STANDARD } from '../music/tuning';
import { fretKey, questionId, type Choice, type QuestionType, type TheoryTopic } from './types';

export const TOPIC_ID = 'key-signatures';

/**
 * Keys get harder by how many accidentals they carry, which is also the order
 * they are usually taught in.
 */
const KEYS_BY_TIER: Record<number, string[]> = {
  1: ['C', 'G', 'D', 'F'],
  2: ['C', 'G', 'D', 'F', 'A', 'E', 'Bb', 'Eb'],
  3: ['G', 'D', 'A', 'E', 'B', 'F', 'Bb', 'Eb', 'Ab'],
  4: ['A', 'E', 'B', 'F#', 'Eb', 'Ab', 'Db'],
  5: ['B', 'F#', 'Db', 'Gb', 'Ab', 'Eb'],
};

export function keysForTier(tier: number): string[] {
  return KEYS_BY_TIER[Math.max(1, Math.min(5, Math.round(tier)))] ?? KEYS_BY_TIER[1];
}

const choice = (label: string): Choice => ({ id: label, label });

/**
 * Four choices: the answer plus three distinct distractors. A generator that
 * cannot supply three is a bug in that generator, so this throws rather than
 * quietly offering a two-option question with a 50% guess rate.
 */
function options(rng: Rng, answer: string, distractors: string[]): Choice[] {
  const seen = new Set([answer]);
  const wrong: string[] = [];
  for (const d of distractors) {
    if (seen.has(d)) continue;
    seen.add(d);
    wrong.push(d);
    if (wrong.length === 3) break;
  }
  if (wrong.length < 3) {
    throw new Error(`options: only ${wrong.length} distractors for "${answer}" — generator needs more candidates`);
  }
  return shuffle(rng, [answer, ...wrong]).map(choice);
}

function accidentalPhrase(count: number, type: 'sharps' | 'flats' | 'none'): string {
  if (count === 0 || type === 'none') return 'no sharps or flats';
  const word = type === 'sharps' ? 'sharp' : 'flat';
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

// ---- How many accidentals? ----

const countAccidentals: QuestionType = {
  id: 'count-accidentals',
  minTier: 1,
  weight: 2,
  make(rng, tier) {
    const tonic = pick(rng, keysForTier(tier));
    const info = majorKey(tonic);
    const answer = accidentalPhrase(info.accidentals, info.type);

    // Wrong by one either way, and wrong about which accidental — the two
    // mistakes this question exists to catch. Built from every phrase this
    // question could print, so there are always three to choose from even in
    // C major, where "one fewer flat" is not a thing that can be said.
    const other: 'sharps' | 'flats' = info.type === 'flats' ? 'sharps' : 'flats';
    const near = [info.accidentals + 1, info.accidentals - 1, info.accidentals + 2]
      .filter((n) => n >= 1 && n <= 7)
      .map((n) => accidentalPhrase(n, info.type === 'none' ? 'sharps' : info.type));
    const crossed = [info.accidentals, info.accidentals + 1]
      .filter((n) => n >= 1 && n <= 7)
      .map((n) => accidentalPhrase(n, other));
    const distractors = [...near, ...crossed, accidentalPhrase(0, 'none'), accidentalPhrase(1, 'sharps'), accidentalPhrase(2, 'flats')]
      .filter((p) => p !== answer);

    return {
      id: questionId(TOPIC_ID, 'count-accidentals', [tonic]),
      topicId: TOPIC_ID,
      typeId: 'count-accidentals',
      tier,
      mode: 'multiple-choice',
      prompt: `What is the key signature of ${tonic} major?`,
      choices: options(rng, answer, distractors),
      answer: [answer],
      matching: 'exact',
      rationale:
        info.accidentals === 0
          ? `${tonic} major has no sharps or flats — it is the one key written on the white notes.`
          : `${tonic} major has ${answer}: ${info.scale.filter((n) => n.length > 1).join(', ')}.`,
      diagnose(given) {
        const g = given[0];
        if (!g) return null;
        if (g.includes(other)) {
          return `That is the right number, but the wrong accidental — ${tonic} major is a ${info.type === 'sharps' ? 'sharp' : 'flat'} key.`;
        }
        if (g === accidentalPhrase(0, 'none')) return 'Only C major has an empty key signature.';
        return `Count the accidentals in the scale itself: ${info.scale.join(' ')}.`;
      },
    };
  },
};

// ---- Which key has this signature? ----

const nameFromSignature: QuestionType = {
  id: 'name-from-signature',
  minTier: 2,
  make(rng, tier) {
    const tonic = pick(rng, keysForTier(tier).filter((k) => majorKey(k).accidentals > 0));
    const info = majorKey(tonic);

    // The classic traps: the relative minor, and the enharmonic twin.
    const distractors = [info.relative, ...shuffle(rng, keysForTier(5).filter((k) => k !== tonic))];

    return {
      id: questionId(TOPIC_ID, 'name-from-signature', [tonic]),
      topicId: TOPIC_ID,
      typeId: 'name-from-signature',
      tier,
      mode: 'multiple-choice',
      prompt: `Which major key has ${accidentalPhrase(info.accidentals, info.type)}?`,
      context: `Signature: ${info.signature.split('').join(' ')}`,
      choices: options(rng, tonic, distractors),
      answer: [tonic],
      matching: 'exact',
      rationale: `${tonic} major: ${info.scale.join(' ')}.`,
      diagnose(given) {
        const g = given[0];
        if (!g) return null;
        if (g === info.relative) {
          return `${g} minor shares this signature, but the question asked for the major key — its relative major is ${tonic}.`;
        }
        try {
          const guessed = majorKey(g);
          if (guessed.accidentals === info.accidentals && guessed.type !== info.type) {
            return `${g} major has the same number of accidentals, but they are ${guessed.type}, not ${info.type}.`;
          }
          return `${g} major has ${accidentalPhrase(guessed.accidentals, guessed.type)}.`;
        } catch {
          return null;
        }
      },
    };
  },
};

// ---- Spell the scale ----

/** A plausible wrong spelling: right letters, one wrong accidental. */
function misspellAt(scale: string[], degree: number): string {
  return scale
    .map((n, idx) => {
      if (idx !== degree) return n;
      if (n.includes('#')) return n[0];
      if (n.includes('b')) return n[0];
      return `${n}#`;
    })
    .join(' ');
}

const spellScale: QuestionType = {
  id: 'spell-scale',
  minTier: 1,
  weight: 2,
  make(rng, tier) {
    const tonic = pick(rng, keysForTier(tier));
    const info = majorKey(tonic);
    const answer = info.scale.join(' ');

    const distractors = [
      // Sharps where the key wants flats, or the reverse.
      minorKey(tonic).scale.join(' '),
      // The relative minor's notes, started on the wrong degree.
      [...info.scale.slice(5), ...info.scale.slice(0, 5)].join(' '),
      // One accidental wrong, at each degree in turn — always enough of these.
      ...shuffle(rng, [1, 2, 3, 4, 5, 6]).map((d) => misspellAt(info.scale, d)),
    ].filter((d) => d !== answer);

    return {
      id: questionId(TOPIC_ID, 'spell-scale', [tonic]),
      topicId: TOPIC_ID,
      typeId: 'spell-scale',
      tier,
      mode: 'multiple-choice',
      prompt: `How is the ${tonic} major scale spelled?`,
      choices: options(rng, answer, distractors),
      answer: [answer],
      matching: 'exact',
      rationale: `${tonic} major runs ${answer} — one of every letter name, each used exactly once.`,
      diagnose(given) {
        const g = given[0];
        if (!g) return null;
        if (g === minorKey(tonic).scale.join(' ')) return `That is ${tonic} *minor*. The major scale raises the 3rd, 6th and 7th.`;
        const letters = g.split(' ').map((n) => n[0]);
        if (new Set(letters).size !== letters.length) {
          return 'A major scale uses each letter name once — if a letter repeats, an accidental is spelled the wrong way.';
        }
        return `Compare against ${answer}.`;
      },
    };
  },
};

// ---- Which note is altered? ----

const alteredNotes: QuestionType = {
  id: 'altered-notes',
  minTier: 3,
  make(rng, tier) {
    const tonic = pick(rng, keysForTier(tier).filter((k) => majorKey(k).accidentals >= 2));
    const info = majorKey(tonic);
    const altered = info.scale.filter((n) => n.length > 1);
    const naturals = info.scale.filter((n) => n.length === 1);

    return {
      id: questionId(TOPIC_ID, 'altered-notes', [tonic]),
      topicId: TOPIC_ID,
      typeId: 'altered-notes',
      tier,
      mode: 'multiple-select',
      prompt: `Which notes carry an accidental in ${tonic} major?`,
      context: 'Select every one that applies.',
      choices: shuffle(rng, info.scale).map(choice),
      answer: altered,
      matching: 'exact',
      rationale: `${tonic} major alters ${altered.join(', ')}; ${naturals.join(', ')} stay natural.`,
      diagnose(given) {
        const extra = given.filter((g) => !altered.includes(g));
        const missed = altered.filter((a) => !given.includes(a));
        if (extra.length && !missed.length) return `${extra.join(', ')} ${extra.length === 1 ? 'is' : 'are'} natural in this key.`;
        if (missed.length && !extra.length) return `You missed ${missed.join(', ')}.`;
        return `The signature is ${info.signature.split('').join(' ')} — that is ${altered.length} altered note${altered.length === 1 ? '' : 's'}.`;
      },
    };
  },
};

// ---- Build the scale in order ----

const buildScale: QuestionType = {
  id: 'build-scale',
  minTier: 3,
  make(rng, tier) {
    const tonic = pick(rng, keysForTier(tier));
    const minorForm = tier >= 5 && rng() < 0.4;
    const scale = minorForm ? minorScale(tonic, 'harmonic') : majorKey(tonic).scale;
    const label = minorForm ? `${tonic} harmonic minor` : `${tonic} major`;

    return {
      id: questionId(TOPIC_ID, 'build-scale', [label]),
      topicId: TOPIC_ID,
      typeId: 'build-scale',
      tier,
      mode: 'build-sequence',
      prompt: `Build the ${label} scale, starting on ${tonic}.`,
      pool: shuffle(rng, scale).map(choice),
      answer: scale,
      matching: 'ordered',
      rationale: `${label}: ${scale.join(' ')}.`,
      diagnose(given) {
        if (given.length !== scale.length) return `A scale like this has ${scale.length} notes before the octave.`;
        const firstWrong = given.findIndex((n, i) => n !== scale[i]);
        if (firstWrong === 0) return `Start on ${scale[0]} — a scale is named after the note it begins on.`;
        if (firstWrong > 0) {
          const run = firstWrong === 1 ? 'The first note is right' : `The first ${firstWrong} notes are right`;
          return `${run} — degree ${firstWrong + 1} should be ${scale[firstWrong]}.`;
        }
        return null;
      },
    };
  },
};

// ---- Find a degree of the key on the neck ----

const DEGREE_NAMES = ['root', '2nd', '3rd', '4th', '5th', '6th', '7th'];

const findDegreeOnNeck: QuestionType = {
  id: 'find-degree',
  minTier: 2,
  make(rng, tier) {
    const tonic = pick(rng, keysForTier(tier));
    const info = keyInfo(tonic, 'major');
    // The root is given as an anchor; find a different degree.
    const degree = 1 + Math.floor(rng() * 6);
    const target = info.scale[degree];
    const maxFret = 12;
    const openMidi = STANDARD.openMidi;

    const rootSpots = pitchClassSpots(pitchClassOf(info.scale[0]), openMidi, maxFret);
    const targetSpots = pitchClassSpots(pitchClassOf(target), openMidi, maxFret);

    return {
      id: questionId(TOPIC_ID, 'find-degree', [tonic, String(degree)]),
      topicId: TOPIC_ID,
      typeId: 'find-degree',
      tier,
      mode: 'fretboard-select',
      prompt: `In ${tonic} major, find the ${DEGREE_NAMES[degree]}.`,
      context: `The ${tonic} roots are already marked. Click any ${target}.`,
      fretboard: {
        marks: rootSpots.map((s) => ({ string: s.string, fret: s.fret, label: tonic, style: 'ghost' as const })),
        targets: targetSpots,
      },
      choices: targetSpots.map((s) => ({ id: fretKey(s.string, s.fret), label: target })),
      // Any one of the right spots will do.
      answer: targetSpots.map((s) => fretKey(s.string, s.fret)),
      matching: 'any',
      rationale: `The ${DEGREE_NAMES[degree]} of ${tonic} major is ${target}. The full scale is ${info.scale.join(' ')}.`,
      diagnose() {
        return `Count up the scale from ${tonic}: ${info.scale.slice(0, degree + 1).join(' → ')}.`;
      },
    };
  },
};

export const KEY_SIGNATURES_TOPIC: TheoryTopic = {
  id: TOPIC_ID,
  title: 'Key signatures & scale construction',
  blurb: 'How many sharps or flats a key carries, how its scale is spelled, and where its degrees sit on the neck.',
  maxTier: 5,
  types: [countAccidentals, nameFromSignature, spellScale, alteredNotes, buildScale, findDegreeOnNeck],
};
