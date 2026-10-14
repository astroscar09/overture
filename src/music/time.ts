// Musical time, in integer ticks.
//
// Rhythm is counted in ticks rather than seconds or fractions of a beat, so a
// bar either adds up exactly or it does not — there is no floating-point
// "close enough". PPQ 480 divides evenly by 2, 3, 4, 6 and 8, so straight
// notes, triplets, gallops and sextuplets are all exact integers.

/** Ticks per quarter note. */
export const PPQ = 480;

/** A duration or position, in ticks. Always an integer. */
export type Ticks = number;

/** The denominator of a note value: 4 = quarter, 8 = eighth, and so on. */
export type NoteValue = 1 | 2 | 4 | 8 | 16 | 32 | 64;

export interface TimeSignature {
  /** Beats in a bar — the numerator. */
  beats: number;
  /** What counts as a beat — the denominator (4 = quarter note). */
  unit: NoteValue;
}

export const FOUR_FOUR: TimeSignature = { beats: 4, unit: 4 };

/** Ticks in one beat of this signature. */
export function beatTicks(sig: TimeSignature): Ticks {
  return (PPQ * 4) / sig.unit;
}

/** Ticks in one full bar. */
export function barTicks(sig: TimeSignature): Ticks {
  return beatTicks(sig) * sig.beats;
}

/**
 * Ticks for a note value, optionally dotted. One dot adds a half, two dots add
 * a half and a quarter, as written.
 */
export function noteTicks(value: NoteValue, dots = 0): Ticks {
  const base = (PPQ * 4) / value;
  let total = base;
  let add = base;
  for (let i = 0; i < dots; i++) {
    add /= 2;
    total += add;
  }
  if (!Number.isInteger(total)) {
    throw new Error(`noteTicks: ${value} with ${dots} dot(s) is not a whole number of ticks`);
  }
  return total;
}

/**
 * Ticks for one note of a tuplet — `count` notes played in the space of
 * `inSpace` of the same value. A triplet eighth is tuplet(8, 3, 2).
 */
export function tupletTicks(value: NoteValue, count: number, inSpace: number): Ticks {
  const total = noteTicks(value) * inSpace;
  if (total % count !== 0) {
    throw new Error(`tupletTicks: ${count}:${inSpace} of a 1/${value} does not divide evenly`);
  }
  return total / count;
}

/** The note value a duration represents, or null if it is not a plain value. */
export function ticksToValue(ticks: Ticks): { value: NoteValue; dots: number } | null {
  const values: NoteValue[] = [1, 2, 4, 8, 16, 32, 64];
  for (const value of values) {
    for (const dots of [0, 1, 2]) {
      let candidate: Ticks;
      try {
        candidate = noteTicks(value, dots);
      } catch {
        continue;
      }
      if (candidate === ticks) return { value, dots };
    }
  }
  return null;
}

/** Which bar a tick position falls in (0-based). */
export function barOf(position: Ticks, sig: TimeSignature): number {
  return Math.floor(position / barTicks(sig));
}

/** Position within its bar, in ticks. */
export function tickInBar(position: Ticks, sig: TimeSignature): Ticks {
  return ((position % barTicks(sig)) + barTicks(sig)) % barTicks(sig);
}

/** Which beat of the bar a position falls on (0-based), rounded down. */
export function beatOf(position: Ticks, sig: TimeSignature): number {
  return Math.floor(tickInBar(position, sig) / beatTicks(sig));
}

/** True when the position lands exactly on a beat. */
export function isOnBeat(position: Ticks, sig: TimeSignature): boolean {
  return tickInBar(position, sig) % beatTicks(sig) === 0;
}

/**
 * Strong beats carry the harmony: beat 1 and 3 in four, beat 1 in three, beat 1
 * and 4 in a compound six. Chord-tone targeting leans on this.
 */
export function isStrongBeat(position: Ticks, sig: TimeSignature): boolean {
  if (!isOnBeat(position, sig)) return false;
  const beat = beatOf(position, sig);
  if (sig.beats === 4) return beat === 0 || beat === 2;
  if (sig.beats === 6) return beat === 0 || beat === 3;
  return beat === 0;
}

/** Seconds per tick at a tempo, for scheduling against the audio clock. */
export function tickSeconds(bpm: number, sig: TimeSignature = FOUR_FOUR): number {
  // BPM counts the signature's beat unit.
  return 60 / bpm / beatTicks(sig);
}
