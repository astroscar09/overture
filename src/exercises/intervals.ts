// Theory Lab topic: interval identification and construction.
//
// Two of these question types live on the neck, because an interval is a shape
// to a guitarist before it is a name. Knowing that a minor 3rd is three frets
// along the string, or two strings up and one fret back, is the thing that
// actually gets used mid-solo.

import { int, pick, shuffle, type Rng } from '../generate/rng';
import { invert, semitones, spell, up, type IntervalName } from '../music/theory/intervals';
import { midiOf, pitchName, sharpName } from '../music/theory/spelling';
import { STANDARD } from '../music/tuning';
import { fretKey, questionId, type Choice, type QuestionType, type TheoryTopic } from './types';

export const TOPIC_ID = 'intervals';

const NECK_FRETS = 15;

/**
 * Intervals get harder by how often a player meets them. The tritone arrives
 * at tier 4 with both of its spellings, because telling an augmented 4th from
 * a diminished 5th is the point at which intervals stop being arithmetic.
 */
const INTERVALS_BY_TIER: Record<number, IntervalName[]> = {
  1: ['2M', '3m', '3M', '4P', '5P', '8P'],
  2: ['2m', '2M', '3m', '3M', '4P', '5P', '6M', '8P'],
  3: ['2m', '2M', '3m', '3M', '4P', '5P', '6m', '6M', '7m', '7M'],
  4: ['2m', '2M', '3m', '3M', '4P', '4A', '5d', '5P', '6m', '6M', '7m', '7M'],
  5: ['2m', '2M', '3m', '3M', '4P', '4A', '5d', '5P', '6m', '6M', '7m', '7M', '8P'],
};

/** Roots follow the same curve: naturals first, then the ones with accidentals. */
const ROOTS_BY_TIER: Record<number, string[]> = {
  1: ['C', 'D', 'E', 'F', 'G', 'A'],
  2: ['C', 'D', 'E', 'F', 'G', 'A', 'B'],
  3: ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'Bb', 'Eb'],
  4: ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'Bb', 'Eb', 'Ab', 'F#'],
  5: ['Bb', 'Eb', 'Ab', 'Db', 'F#', 'C#', 'B', 'E', 'A', 'D'],
};

const LETTERS = 'CDEFGAB';

/** How many letter names an interval covers, counting both ends: C to E is 3. */
export function letterSpan(from: string, to: string): number {
  const a = LETTERS.indexOf(from[0].toUpperCase());
  const b = LETTERS.indexOf(to[0].toUpperCase());
  return ((b - a + 7) % 7) + 1;
}

const clamp = (tier: number): number => Math.max(1, Math.min(5, Math.round(tier)));
export const intervalsForTier = (tier: number): IntervalName[] => INTERVALS_BY_TIER[clamp(tier)];
export const rootsForTier = (tier: number): string[] => ROOTS_BY_TIER[clamp(tier)];

/** Double accidentals are correct theory and terrible drilling. Skip them. */
export function isPlainSpelling(note: string): boolean {
  return !note.includes('##') && !note.includes('bb');
}

/**
 * A root and interval whose answer is written with at most one accidental.
 * `exclude` drops intervals a particular question type cannot use.
 */
function pickPair(rng: Rng, tier: number, exclude: IntervalName[] = []): { root: string; interval: IntervalName } {
  const roots = rootsForTier(tier);
  const intervals = intervalsForTier(tier).filter((i) => !exclude.includes(i));
  for (let attempt = 0; attempt < 40; attempt++) {
    const root = pick(rng, roots);
    const interval = pick(rng, intervals);
    if (isPlainSpelling(up(`${root}4`, interval))) return { root, interval };
  }
  // Every tier's pool contains plain combinations; this is a safety net only.
  return { root: 'C', interval: '3M' };
}

const choice = (label: string): Choice => ({ id: label, label });

// "a major 3rd" but "an augmented 4th", and capitalised at the start of a
// sentence. Interval names turn up mid-prose constantly, so this is worth it.
const a = (name: string): string => (/^[aeiou]/i.test(name) ? 'an' : 'a');
const A = (name: string): string => (/^[aeiou]/i.test(name) ? 'An' : 'A');

/** How the two notes sit relative to each other under the hand. */
function shapeOf(fromString: number, fromFret: number, toString: number, toFret: number): string {
  const strings = toString - fromString;
  const frets = toFret - fromFret;
  const fretPart =
    frets === 0 ? 'at the same fret' : `${Math.abs(frets)} fret${Math.abs(frets) === 1 ? '' : 's'} ${frets > 0 ? 'higher' : 'back'}`;
  if (strings === 0) return `${Math.abs(frets)} fret${Math.abs(frets) === 1 ? '' : 's'} along the same string`;
  return `${Math.abs(strings)} string${Math.abs(strings) === 1 ? '' : 's'} ${strings > 0 ? 'up' : 'down'}, ${fretPart}`;
}

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

/** Intervals a semitone either side, plus the inversion — the usual slips. */
function nearbyIntervals(interval: IntervalName): IntervalName[] {
  const all: IntervalName[] = ['2m', '2M', '3m', '3M', '4P', '4A', '5d', '5P', '6m', '6M', '7m', '7M', '8P'];
  const here = semitones(interval);
  return [
    ...all.filter((i) => i !== interval && Math.abs(semitones(i) - here) === 1),
    invert(interval),
    ...all.filter((i) => i !== interval && semitones(i) === here),
    ...all.filter((i) => i !== interval),
  ];
}

// ---- Name the interval between two written notes ----

const nameInterval: QuestionType = {
  id: 'name-interval',
  minTier: 1,
  weight: 2,
  make(rng, tier) {
    const { root, interval } = pickPair(rng, tier);
    const target = pitchName(up(`${root}4`, interval));
    const answer = spell(interval);

    return {
      id: questionId(TOPIC_ID, 'name-interval', [root, interval]),
      topicId: TOPIC_ID,
      typeId: 'name-interval',
      tier,
      mode: 'multiple-choice',
      prompt: `What is the interval from ${root} up to ${target}?`,
      choices: options(rng, answer, nearbyIntervals(interval).map(spell)),
      answer: [answer],
      matching: 'exact',
      rationale: `${root} up to ${target} is ${a(answer)} ${answer} — ${semitones(interval)} semitone${semitones(interval) === 1 ? '' : 's'}.`,
      diagnose(given) {
        const g = given[0];
        if (!g) return null;
        if (g === spell(invert(interval))) {
          return `That is the inversion — ${a(g)} ${g} is what you get going the other way, from ${target} up to ${root}.`;
        }
        const guessed = (['2m','2M','3m','3M','4P','4A','5d','5P','6m','6M','7m','7M','8P'] as IntervalName[]).find((i) => spell(i) === g);
        if (guessed && semitones(guessed) === semitones(interval)) {
          const span = letterSpan(root, target);
          return `Those two sound identical — the letters are what separate them. ${root} to ${target} covers ${span} letter names, so it has to be called a ${answer.split(' ').pop()}, not a ${g.split(' ').pop()}.`;
        }
        if (guessed) {
          const diff = semitones(guessed) - semitones(interval);
          return `${A(g)} ${g} is ${Math.abs(diff)} semitone${Math.abs(diff) === 1 ? '' : 's'} too ${diff > 0 ? 'wide' : 'narrow'}. ${root} to ${target} spans ${semitones(interval)}.`;
        }
        return `Count from ${root} to ${target}: ${semitones(interval)} semitones.`;
      },
    };
  },
};

// ---- Build the note an interval above ----

const buildInterval: QuestionType = {
  id: 'build-interval',
  minTier: 1,
  weight: 2,
  make(rng, tier) {
    const { root, interval } = pickPair(rng, tier);
    const answer = pitchName(up(`${root}4`, interval));
    const name = spell(interval);

    // The classic wrong answers: right letter wrong accidental, the enharmonic
    // of the right note, and the interval counted downward instead of up.
    const letter = answer[0];
    const candidates = [
      answer.includes('#') ? letter : `${letter}#`,
      answer.includes('b') ? letter : `${letter}b`,
      pitchName(sharpName(midiOf(`${answer}4`))),
      pitchName(up(`${root}4`, invert(interval))),
      ...intervalsForTier(tier).map((i) => pitchName(up(`${root}4`, i))),
    ].filter(isPlainSpelling);

    return {
      id: questionId(TOPIC_ID, 'build-interval', [root, interval]),
      topicId: TOPIC_ID,
      typeId: 'build-interval',
      tier,
      mode: 'multiple-choice',
      prompt: `What note is ${a(name)} ${name} above ${root}?`,
      choices: options(rng, answer, candidates),
      answer: [answer],
      matching: 'exact',
      rationale: `${A(name)} ${name} above ${root} is ${answer}: count the letters ${root} to ${answer}, then check it spans ${semitones(interval)} semitones.`,
      diagnose(given) {
        const g = given[0];
        if (!g) return null;
        if (g[0] === answer[0]) return `Right letter, wrong accidental — ${a(name)} ${name} above ${root} needs ${semitones(interval)} semitones, which lands on ${answer}.`;
        if (g === pitchName(up(`${root}4`, invert(interval)))) return `That is ${a(spell(invert(interval)))} ${spell(invert(interval))} above ${root} — the interval inverted.`;
        return `The letter name decides it: a ${name.split(' ').pop()} above ${root} must be called ${answer[0]}-something, and here it is ${answer}.`;
      },
    };
  },
};

// ---- How many semitones? ----

const countSemitones: QuestionType = {
  id: 'count-semitones',
  minTier: 2,
  make(rng, tier) {
    const interval = pick(rng, intervalsForTier(tier));
    const n = semitones(interval);
    const answer = String(n);
    const candidates = [n + 1, n - 1, n + 2, n - 2, 12 - n].filter((v) => v >= 0 && v <= 12).map(String);

    return {
      id: questionId(TOPIC_ID, 'count-semitones', [interval]),
      topicId: TOPIC_ID,
      typeId: 'count-semitones',
      tier,
      mode: 'multiple-choice',
      prompt: `How many semitones are in ${a(spell(interval))} ${spell(interval)}?`,
      context: 'One semitone is one fret.',
      choices: options(rng, answer, candidates),
      answer: [answer],
      matching: 'exact',
      rationale: `${A(spell(interval))} ${spell(interval)} spans ${n} semitone${n === 1 ? '' : 's'} — ${n} fret${n === 1 ? '' : 's'} along one string.`,
      diagnose(given) {
        const g = Number(given[0]);
        if (Number.isNaN(g)) return null;
        if (g === 12 - n) return `${g} belongs to its inversion, ${a(spell(invert(interval)))} ${spell(invert(interval))}. The two always add up to 12.`;
        return `Out by ${Math.abs(g - n)}. On one string, ${a(spell(interval))} ${spell(interval)} is ${n} fret${n === 1 ? '' : 's'}.`;
      },
    };
  },
};

// ---- Invert it ----

const invertInterval: QuestionType = {
  id: 'invert-interval',
  minTier: 3,
  make(rng, tier) {
    const interval = pick(rng, intervalsForTier(tier).filter((i) => i !== '8P'));
    const inverted = invert(interval);
    const answer = spell(inverted);

    return {
      id: questionId(TOPIC_ID, 'invert-interval', [interval]),
      topicId: TOPIC_ID,
      typeId: 'invert-interval',
      tier,
      mode: 'multiple-choice',
      prompt: `What is the inversion of ${a(spell(interval))} ${spell(interval)}?`,
      context: 'Turn the interval upside down — put the lower note on top.',
      choices: options(rng, answer, [spell(interval), ...nearbyIntervals(inverted).map(spell)]),
      answer: [answer],
      matching: 'exact',
      rationale: `${A(spell(interval))} ${spell(interval)} inverts to ${a(answer)} ${answer}: the numbers add to 9 and the quality flips (${semitones(interval)} + ${semitones(inverted)} = 12 semitones).`,
      diagnose(given) {
        const g = given[0];
        if (g === spell(interval)) return 'That is the interval you started with — inverting it changes both the number and the quality.';
        return `The numbers of an interval and its inversion always add up to 9, so a ${spell(interval).split(' ').pop()} inverts to a ${answer.split(' ').pop()}.`;
      },
    };
  },
};

// ---- On the neck: find the interval above a marked root ----

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

/** A root placed where there is room to reach the interval above it. */
function placeRoot(rng: Rng, rootName: string, openMidi: readonly number[]): Spot | null {
  const candidates: Spot[] = [];
  for (let string = 0; string <= 3; string++) {
    for (let fret = 1; fret <= 9; fret++) {
      const midi = openMidi[string] + fret;
      if (pitchName(sharpName(midi)) === pitchName(sharpName(midiOf(`${rootName}4`)))) {
        candidates.push({ string, fret, midi });
      }
    }
  }
  return candidates.length ? candidates[int(rng, 0, candidates.length - 1)] : null;
}

const findIntervalOnNeck: QuestionType = {
  id: 'find-interval-on-neck',
  minTier: 2,
  weight: 2,
  make(rng, tier) {
    const openMidi = STANDARD.openMidi;
    let root: Spot | null = null;
    let interval: IntervalName = '3M';
    let rootName = 'C';
    let targets: Spot[] = [];

    for (let attempt = 0; attempt < 40; attempt++) {
      const pair = pickPair(rng, tier, ['8P']);
      rootName = pair.root;
      interval = pair.interval;
      root = placeRoot(rng, rootName, openMidi);
      if (!root) continue;
      const targetMidi = root.midi + semitones(interval);
      // Within reach of the hand that is already holding the root.
      targets = neckSpots(targetMidi, openMidi).filter((s) => Math.abs(s.fret - root!.fret) <= 6);
      if (targets.length) break;
    }
    if (!root || !targets.length) {
      root = { string: 1, fret: 3, midi: openMidi[1] + 3 };
      interval = '3M';
      rootName = 'C';
      targets = neckSpots(root.midi + 4, openMidi).filter((s) => Math.abs(s.fret - root!.fret) <= 6);
    }

    const name = spell(interval);
    const targetName = pitchName(up(`${rootName}4`, interval));

    return {
      id: questionId(TOPIC_ID, 'find-interval-on-neck', [rootName, interval, `${root.string}:${root.fret}`]),
      topicId: TOPIC_ID,
      typeId: 'find-interval-on-neck',
      tier,
      mode: 'fretboard-select',
      prompt: `From the marked ${rootName}, find the ${name} above it.`,
      context: 'Click it on the neck — anywhere it falls within reach.',
      fretboard: {
        marks: [{ string: root.string, fret: root.fret, label: rootName, style: 'primary' as const }],
        targets: targets.map((s) => ({ string: s.string, fret: s.fret })),
      },
      answer: targets.map((s) => fretKey(s.string, s.fret)),
      matching: 'any',
      rationale: `${A(name)} ${name} above ${rootName} is ${targetName} — ${semitones(interval)} semitones up, which is ${semitones(interval)} frets along the same string.`,
      diagnose() {
        return `Count ${semitones(interval)} frets up from the marked note, then find the same pitch on a neighbouring string if that is easier to reach.`;
      },
    };
  },
};

// ---- On the neck: name the interval between two marked notes ----

const nameIntervalOnNeck: QuestionType = {
  id: 'name-interval-on-neck',
  minTier: 3,
  weight: 2,
  make(rng, tier) {
    const openMidi = STANDARD.openMidi;
    let root: Spot | null = null;
    let interval: IntervalName = '3M';
    let rootName = 'C';
    let target: Spot | null = null;

    for (let attempt = 0; attempt < 40; attempt++) {
      const pair = pickPair(rng, tier, ['8P']);
      rootName = pair.root;
      interval = pair.interval;
      root = placeRoot(rng, rootName, openMidi);
      if (!root) continue;
      const reachable = neckSpots(root.midi + semitones(interval), openMidi).filter(
        (s) => Math.abs(s.fret - root!.fret) <= 6,
      );
      if (reachable.length) {
        target = reachable[int(rng, 0, reachable.length - 1)];
        break;
      }
    }
    if (!root || !target) {
      root = { string: 1, fret: 3, midi: openMidi[1] + 3 };
      target = neckSpots(root.midi + 4, openMidi)[0];
      interval = '3M';
      rootName = 'C';
    }

    const answer = spell(interval);
    const targetName = pitchName(up(`${rootName}4`, interval));

    return {
      id: questionId(TOPIC_ID, 'name-interval-on-neck', [rootName, interval, `${root.string}:${root.fret}`, `${target.string}:${target.fret}`]),
      topicId: TOPIC_ID,
      typeId: 'name-interval-on-neck',
      tier,
      mode: 'multiple-choice',
      prompt: 'What is the interval between the two marked notes?',
      context: `Lower note ${rootName}, upper note ${targetName}.`,
      fretboard: {
        marks: [
          { string: root.string, fret: root.fret, label: rootName, style: 'primary' as const },
          { string: target.string, fret: target.fret, label: targetName, style: 'secondary' as const },
        ],
        targets: [],
      },
      choices: options(rng, answer, nearbyIntervals(interval).map(spell)),
      answer: [answer],
      matching: 'exact',
      rationale: `${rootName} up to ${targetName} is ${a(answer)} ${answer}, ${semitones(interval)} semitones. As a shape that is ${shapeOf(root.string, root.fret, target.string, target.fret)}.`,
      diagnose(given) {
        if (given[0] === spell(invert(interval))) return `That is the inversion. The lower note is ${rootName}, so count upward from there.`;
        return `Count the semitones between them: ${semitones(interval)}.`;
      },
    };
  },
};

export const INTERVALS_TOPIC: TheoryTopic = {
  id: TOPIC_ID,
  title: 'Intervals',
  blurb: 'Naming the distance between two notes, building one from a root, and seeing both as shapes on the neck.',
  maxTier: 5,
  types: [nameInterval, buildInterval, countSemitones, invertInterval, findIntervalOnNeck, nameIntervalOnNeck],
};
