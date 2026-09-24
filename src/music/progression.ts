import type { Chord } from './chords';
import { chordFor, parseChordName, transposeChord } from './chordShapes';
import type { ProgressionStep } from '../trainer/ChordTrainer';

// Bar spec token meaning "continue the previous chord" (a lead-sheet %).
const HOLD_TOKEN = '-';

/** One chord within a bar, held for `beats` beats. `chord === null` = hold. */
export interface Slot {
  chord: Chord | null;
  beats: number;
}

/** A bar of music. Its slots' beats sum to the measure length. */
export interface Bar {
  slots: Slot[];
}

/** Split `total` beats across `count` slots as evenly as possible (front-loaded). */
export function distribute(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  let rem = total - base * count;
  return Array.from({ length: count }, () => base + (rem-- > 0 ? 1 : 0));
}

// Fill any slots left without an explicit beat count so the bar sums to `measure`.
function fillBeats(slots: Slot[], measure: number): void {
  const explicit = slots.reduce((sum, s) => sum + s.beats, 0);
  const unset = slots.filter((s) => s.beats === 0);
  if (!unset.length) return;
  const shares = distribute(Math.max(unset.length, measure - explicit), unset.length);
  unset.forEach((s, i) => (s.beats = shares[i]));
}

/**
 * Parse a preset bar spec into a Bar, resolving each token to a real chord shape.
 * Tokens: `Chord`, `Chord:beats`, or `-` (hold). Example: "C", "F:2 G:2", "-".
 */
function parseBar(spec: string, measure: number): Bar {
  const tokens = spec.trim().split(/\s+/).filter(Boolean);
  const slots: Slot[] = tokens.map((tok) => {
    const [name, beats] = tok.split(':');
    const chord = name === HOLD_TOKEN ? null : chordFor(...chordArgs(name));
    return { chord, beats: beats ? Number(beats) : 0 };
  });
  fillBeats(slots, measure);
  return { slots: slots.length ? slots : [{ chord: chordFor(0, 'maj'), beats: measure }] };
}

function chordArgs(name: string): [number, 'maj' | 'min' | 'dom7'] {
  const { rootPc, quality } = parseChordName(name);
  return [rootPc, quality];
}

export function parsePresetBars(specs: string[], measure: number): Bar[] {
  return specs.map((spec) => parseBar(spec, measure));
}

/**
 * Compile the bar grid into the trainer's flat beat timeline. Hold slots extend
 * the previous chord; leading holds wrap onto the final chord (the loop repeats).
 */
export function barsToSteps(bars: Bar[]): ProgressionStep[] {
  const steps: ProgressionStep[] = [];
  let leadingHold = 0;
  for (const bar of bars) {
    for (const slot of bar.slots) {
      if (slot.beats <= 0) continue;
      if (slot.chord === null) {
        if (steps.length) steps[steps.length - 1].beats += slot.beats;
        else leadingHold += slot.beats;
      } else {
        steps.push({ chord: slot.chord, beats: slot.beats });
      }
    }
  }
  if (leadingHold && steps.length) steps[steps.length - 1].beats += leadingHold;
  return steps;
}

/** Transpose every chord in the grid by `delta` semitones, re-voicing shapes. */
export function transposeBars(bars: Bar[], delta: number): void {
  if (!delta) return;
  for (const bar of bars) {
    for (const slot of bar.slots) {
      if (slot.chord) slot.chord = transposeChord(slot.chord, delta);
    }
  }
}

/** Rebalance a bar to sum to `measure`, keeping one slot fixed and evening the rest. */
export function setSlotBeats(bar: Bar, index: number, beats: number, measure: number): void {
  const count = bar.slots.length;
  if (count === 1) {
    bar.slots[0].beats = measure;
    return;
  }
  const fixed = Math.max(1, Math.min(Math.round(beats) || 1, measure - (count - 1)));
  bar.slots[index].beats = fixed;
  const rest = distribute(measure - fixed, count - 1);
  let r = 0;
  bar.slots.forEach((slot, i) => {
    if (i !== index) slot.beats = rest[r++];
  });
}

/** Add a chord to a bar and re-even the split. */
export function addSlot(bar: Bar, chord: Chord, measure: number): void {
  bar.slots.push({ chord, beats: 0 });
  evenBar(bar, measure);
}

/** Remove a chord from a bar and re-even the split. */
export function removeSlot(bar: Bar, index: number, measure: number): void {
  bar.slots.splice(index, 1);
  if (bar.slots.length === 0) bar.slots.push({ chord: chordFor(0, 'maj'), beats: measure });
  evenBar(bar, measure);
}

/** Evenly distribute the measure across a bar's existing slots. */
export function evenBar(bar: Bar, measure: number): void {
  const shares = distribute(measure, bar.slots.length);
  bar.slots.forEach((slot, i) => (slot.beats = shares[i]));
}

export function refitBars(bars: Bar[], measure: number): void {
  for (const bar of bars) evenBar(bar, measure);
}
