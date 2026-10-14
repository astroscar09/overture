// Choosing which notes, before deciding where to play them.
//
// The planner works over the pitches actually available in the fret window, so
// everything it produces is both in key and reachable by construction. The
// validators then check that claim rather than doing the work.
//
// Melodic shape comes from contour templates. A technique exercise that just
// walks up a scale is dull and teaches one motion; a sequence — a short cell
// moved through the scale — is what players actually practise.

import { chance, int, pick, type Rng } from '../generate/rng';
import { scaleNotes } from '../music/theory/keys';
import { pitchClassOf } from '../music/theory/spelling';
import { pitchClass } from '../music/notes';
import type { Tuning } from '../music/tuning';
import type { StyleProfile } from './styleProfiles';

export type ContourId = 'run-up' | 'run-down' | 'up-down' | 'sequence' | 'pedal' | 'zigzag';

export const CONTOURS: { id: ContourId; name: string }[] = [
  { id: 'run-up', name: 'ascending run' },
  { id: 'run-down', name: 'descending run' },
  { id: 'up-down', name: 'up and back' },
  { id: 'sequence', name: 'four-note sequence' },
  { id: 'pedal', name: 'pedal tone' },
  { id: 'zigzag', name: 'zigzag' },
];

/**
 * Every distinct pitch of the scale playable inside the window, ascending.
 * Open strings count only when the window reaches the nut.
 */
export function availablePitches(
  key: string,
  scale: string,
  tuning: Tuning,
  window: [number, number],
): number[] {
  const allowed = new Set(scaleNotes(key, scale).map(pitchClassOf));
  const [lo, hi] = window;
  const found = new Set<number>();
  tuning.openMidi.forEach((open) => {
    for (let fret = lo === 0 ? 0 : lo; fret <= hi; fret++) {
      const midi = open + fret;
      if (allowed.has(pitchClass(midi))) found.add(midi);
    }
  });
  return [...found].sort((a, b) => a - b);
}

/** The scale-degree steps that give each contour its shape. */
const STEP_PATTERN: Record<Exclude<ContourId, 'pedal'>, number[]> = {
  'run-up': [1],
  'run-down': [-1],
  'up-down': [1],
  sequence: [1, 1, 1, -2],
  zigzag: [2, -1],
};

/**
 * Walk the scale following a step pattern, bouncing off the ends rather than
 * wrapping — a run that reaches the top of the window turns round, it does not
 * fall off the bottom — and never leaping further than the difficulty allows.
 */
function constrainedWalk(
  pitches: readonly number[],
  count: number,
  pattern: readonly number[],
  start: number,
  maxLeap: number,
): number[] {
  const n = pitches.length;
  let at = Math.max(0, Math.min(n - 1, start));
  let direction = 1;
  const out = [at];

  for (let i = 1; i < count; i++) {
    const step = pattern[(i - 1) % pattern.length] * direction;
    let next = at + step;
    // Bounce at the edges of the window.
    if (next < 0 || next > n - 1) {
      direction = -direction;
      next = at - step;
    }
    next = Math.max(0, Math.min(n - 1, next));
    // Pull the step in until the jump fits under the ceiling.
    while (next !== at && Math.abs(pitches[next] - pitches[at]) > maxLeap) {
      next += next > at ? -1 : 1;
    }
    // Landing back where we started means a repeated note, which reads as a
    // stutter and cannot be slurred. Take one scale step instead.
    if (next === at) {
      next = at + direction;
      if (next < 0 || next > n - 1) {
        direction = -direction;
        next = at + direction;
      }
      next = Math.max(0, Math.min(n - 1, next));
    }
    out.push(next);
    at = next;
  }
  return out;
}

/**
 * A melody as indices into `pitches`. Index work keeps the shapes scale-wise:
 * "up two steps" means two scale degrees, not two semitones. `maxLeap` is the
 * difficulty's ceiling in semitones, and nothing returned here exceeds it.
 */
export function planPitches(
  rng: Rng,
  pitches: readonly number[],
  count: number,
  contour: ContourId,
  maxLeap: number,
): number[] {
  const n = pitches.length;
  if (n === 0) throw new Error('planPitches: no pitches available in this window');
  if (n === 1 || count <= 0) return new Array(Math.max(0, count)).fill(0);

  const start = int(rng, 0, n - 1);

  if (contour === 'pedal') {
    // One fixed note against a line walking away from it — the shape that
    // makes string skipping worth practising. The moving voice resets once it
    // strays further than the leap ceiling allows.
    const pedal = start;
    const upward = pedal < n - 1;
    const first = upward ? pedal + 1 : pedal - 1;
    let moving = first;
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
      if (i % 2 === 0) {
        out.push(pedal);
        continue;
      }
      out.push(moving);
      moving += upward ? 1 : -1;
      const strayed = moving < 0 || moving > n - 1 || Math.abs(pitches[moving] - pitches[pedal]) > maxLeap;
      if (strayed) moving = first;
    }
    return out;
  }

  return constrainedWalk(pitches, count, STEP_PATTERN[contour], start, maxLeap);
}
/**
 * A melody shaped like the style profile measured, rather than a fixed step
 * pattern: it repeats a note at about the rate real playing does, turns
 * around at about the rate real playing does, and otherwise prefers a small
 * step with an occasional leap. This is what `contoursFor`'s fixed patterns
 * are deliberately simple and this is not — a technique drill wants one
 * repeatable motion, a lick wants to sound like a lick.
 */
export function planStylePhrase(
  rng: Rng,
  pitches: readonly number[],
  count: number,
  profile: StyleProfile,
  maxLeap: number,
): number[] {
  const n = pitches.length;
  if (n === 0) throw new Error('planStylePhrase: no pitches available in this window');
  if (n === 1 || count <= 0) return new Array(Math.max(0, count)).fill(0);

  let at = int(rng, 0, n - 1);
  let direction = chance(rng, 0.5) ? 1 : -1;
  const out = [at];
  // A reversal roughly every notesPerReversal notes — the same rate the
  // analyser measured turnarounds at.
  const reversalChance = 1 / Math.max(1, profile.contour.notesPerReversal);

  for (let i = 1; i < count; i++) {
    if (chance(rng, profile.intervals.repeatRate)) {
      out.push(at);
      continue;
    }
    if (chance(rng, reversalChance)) direction = -direction;
    const stepSize = chance(rng, profile.intervals.leapRate) ? int(rng, 2, 4) : 1;
    let next = at + stepSize * direction;
    if (next < 0 || next > n - 1) {
      direction = -direction;
      next = at + stepSize * direction;
    }
    next = Math.max(0, Math.min(n - 1, next));
    // Pull the step in until the jump fits under the ceiling, same as a
    // fixed-pattern walk.
    while (next !== at && Math.abs(pitches[next] - pitches[at]) > maxLeap) {
      next += next > at ? -1 : 1;
    }
    if (next === at) {
      const fallback = at + direction;
      next = fallback >= 0 && fallback <= n - 1 ? fallback : at - direction;
      next = Math.max(0, Math.min(n - 1, next));
    }
    out.push(next);
    at = next;
  }
  return out;
}

/** Contours that suit a technique, in preference order. */
export function contoursFor(technique: string): ContourId[] {
  switch (technique) {
    case 'skipping':
      return ['pedal', 'zigzag', 'sequence'];
    case 'legato':
      return ['run-up', 'run-down', 'sequence', 'up-down'];
    case 'bending':
      return ['up-down', 'run-up', 'pedal'];
    case 'gallop':
      return ['run-up', 'run-down', 'up-down', 'zigzag'];
    default:
      return ['sequence', 'run-up', 'run-down', 'up-down', 'zigzag'];
  }
}

export const pickContour = (rng: Rng, technique: string): ContourId => pick(rng, contoursFor(technique));
