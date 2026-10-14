// Pieces shared by the ear-training topics.

import { shuffle, type Rng } from '../../generate/rng';
import { noteTicks } from '../../music/time';
import type { AudioPrompt, Choice } from '../types';

/** Where ear-training prompts sit: low enough to be guitar-like, high enough to hear. */
export const BASE_MIDI = 52; // E3, the guitar's open low E an octave up
export const RANGE_MIDI = 16;

/** Prompts play at a steady, unhurried tempo regardless of the app's BPM. */
export const PROMPT_BPM = 84;

export const choice = (label: string): Choice => ({ id: label, label });

/** Four options: the answer plus three distinct distractors. */
export function options(rng: Rng, answer: string, candidates: readonly string[]): Choice[] {
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

/** Notes one after another. */
export function melodic(midis: readonly number[], label: string, dur = noteTicks(4)): AudioPrompt {
  return {
    notes: midis.map((midi, i) => ({ midi, start: i * dur, dur })),
    bpm: PROMPT_BPM,
    label,
  };
}

/** Notes together, spread just enough to sound strummed rather than stacked. */
export function harmonic(midis: readonly number[], label: string, dur = noteTicks(2)): AudioPrompt {
  return {
    notes: midis.map((midi, i) => ({ midi, start: i * 12, dur })),
    bpm: PROMPT_BPM,
    label,
  };
}

/** A chord, then a gap, then one note from it. */
export function chordThenNote(chordMidis: readonly number[], noteMidi: number, label: string): AudioPrompt {
  const gap = noteTicks(2);
  return {
    notes: [
      ...chordMidis.map((midi, i) => ({ midi, start: i * 12, dur: gap })),
      { midi: noteMidi, start: gap + noteTicks(8), dur: noteTicks(4) },
    ],
    bpm: PROMPT_BPM,
    label,
  };
}
