// Deciding where on the neck each pitch is played.
//
// A pitch usually sits in two or three places inside a fret window, and the
// choice is what makes an exercise feel like a shape rather than a list. The
// assigner scores each candidate against where the hand already is, and
// against what the technique wants from the string the note lands on.

import type { Tuning } from '../music/tuning';
import type { TechniqueId } from './types';

export interface Placement {
  string: number;
  fret: number;
  midi: number;
}

/** Every place a pitch can be played inside the window. */
export function placementsFor(midi: number, tuning: Tuning, window: [number, number]): Placement[] {
  const [lo, hi] = window;
  const out: Placement[] = [];
  tuning.openMidi.forEach((open, string) => {
    const fret = midi - open;
    const reachable = fret === 0 ? lo === 0 : fret >= lo && fret <= hi;
    if (fret >= 0 && reachable) out.push({ string, fret, midi });
  });
  return out;
}

/** How many consecutive notes the fretting hand is treated as holding at once. */
const SPAN_WINDOW = 4;

/**
 * Lower is better. The weights encode what each technique is for: legato wants
 * to stay on a string so there is something to hammer, skipping wants to leave
 * a gap, and everything else just wants the hand to move as little as it can.
 *
 * The span penalty outranks all of them. A preference is a preference; the
 * hand only reaches so far, and an exercise that cannot be fretted is not an
 * exercise. This is why a legato run crosses strings instead of stretching —
 * which is what a player does anyway.
 */
function cost(
  candidate: Placement,
  previous: Placement | null,
  recent: readonly Placement[],
  technique: TechniqueId,
  maxSpan: number,
): number {
  const fretted = [...recent, candidate].filter((p) => p.fret > 0).map((p) => p.fret);
  let spanPenalty = 0;
  if (fretted.length >= 2) {
    const span = Math.max(...fretted) - Math.min(...fretted);
    if (span > maxSpan) spanPenalty = 200 + (span - maxSpan) * 40;
  }

  if (!previous) return Math.abs(candidate.fret - 7) + spanPenalty;

  const fretMove = Math.abs(candidate.fret - previous.fret);
  const stringMove = Math.abs(candidate.string - previous.string);
  let score = fretMove * 2 + stringMove * 3;

  if (technique === 'legato') {
    // Staying put is the whole point; changing string costs a pick.
    score += stringMove * 8;
  }
  if (technique === 'skipping') {
    // Adjacent strings are what this exercise is trying to avoid.
    if (stringMove === 1) score += 12;
    if (stringMove >= 2) score -= 10;
    if (stringMove === 0) score += 4;
  }
  if (technique === 'bending') {
    // Bends live on the thin strings.
    if (candidate.string < 2) score += 15;
  }
  if (technique === 'alternate' || technique === 'gallop' || technique === 'burst') {
    // Big fret jumps read badly at speed; prefer crossing strings.
    if (fretMove > 4) score += 8;
  }
  return score + spanPenalty;
}

/**
 * Place a planned pitch sequence on the neck. Greedy from note to note, which
 * is both what a player does when reading and enough to keep the hand still.
 */
export function assignFrets(
  pitches: readonly number[],
  tuning: Tuning,
  window: [number, number],
  technique: TechniqueId,
  maxSpan: number,
): Placement[] | null {
  const out: Placement[] = [];
  let previous: Placement | null = null;
  for (const midi of pitches) {
    const options = placementsFor(midi, tuning, window);
    if (!options.length) return null;
    // The hand's recent history, so the span rule is applied as the phrase is
    // laid out rather than discovered afterwards by a validator.
    const recent = out.slice(-(SPAN_WINDOW - 1));
    const best = options.reduce((a, b) =>
      cost(b, previous, recent, technique, maxSpan) < cost(a, previous, recent, technique, maxSpan) ? b : a,
    );
    out.push(best);
    previous = best;
  }
  return out;
}
