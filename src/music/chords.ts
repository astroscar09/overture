import { noteName } from './notes';
import type { Tuning } from './tuning';

/**
 * A chord shape as fret positions per string, low E (6th) first to high E (1st).
 *   -1 = muted (x), 0 = open, n = fret n.
 * `fingers` (optional) mirrors `frets`: which finger frets each string (1–4).
 * `baseFret` is the lowest fret drawn on the diagram (1 for open-position shapes).
 */
export interface Chord {
  name: string;
  frets: number[];
  fingers?: number[];
  baseFret?: number;
}

// Common open-position chords + a barre F, plus dominant 7ths.
export const CHORDS: Record<string, Chord> = {
  E:  { name: 'E',  frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0] },
  Em: { name: 'Em', frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0] },
  A:  { name: 'A',  frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0] },
  Am: { name: 'Am', frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0] },
  D:  { name: 'D',  frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2] },
  Dm: { name: 'Dm', frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1] },
  G:  { name: 'G',  frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3] },
  C:  { name: 'C',  frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0] },
  F:  { name: 'F',  frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], baseFret: 1 },
  A7: { name: 'A7', frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 0, 2, 0, 3, 0] },
  D7: { name: 'D7', frets: [-1, -1, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3] },
  E7: { name: 'E7', frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0] },
  G7: { name: 'G7', frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1] },
  C7: { name: 'C7', frets: [-1, 3, 2, 3, 1, 0], fingers: [0, 3, 2, 4, 1, 0] },
  B7: { name: 'B7', frets: [-1, 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4] },
};

// Named preset progressions. Each entry is a bar spec: a chord that fills the
// bar ("C"), several chords sharing the bar ("F:2 G:2"), or "-" to hold the
// previous chord across the bar. `key` is the tonic pitch class the preset is
// written in (its default key); it can be transposed to any other key.
export interface ProgressionPreset {
  name: string;
  key: number;
  bars: string[];
}

export const PROGRESSIONS: Record<string, ProgressionPreset> = {
  popC: { name: 'I–V–vi–IV', key: 0, bars: ['C', 'G', 'Am', 'F'] },
  fiftiesC: { name: "'50s doo-wop", key: 0, bars: ['C', 'Am', 'F', 'G'] },
  iiVIc: { name: 'ii–V–I', key: 0, bars: ['Dm', 'G7', 'C', '-'] },
  punkG: { name: 'Pop-punk', key: 7, bars: ['G', 'D', 'Em', 'C'] },
  subBarC: { name: 'Sub-bar changes', key: 0, bars: ['C', 'F:2 G:2', 'C', 'G'] },
  bluesA: {
    name: '12-bar blues',
    key: 9,
    bars: ['A7', 'A7', 'A7', 'A7', 'D7', 'D7', 'A7', 'A7', 'E7', 'D7', 'A7', 'E7'],
  },
};

/** Note names (with octave) sounding when the chord is strummed in `tuning`. */
export function chordNotes(chord: Chord, tuning: Tuning): string[] {
  const notes: string[] = [];
  chord.frets.forEach((fret, string) => {
    if (fret >= 0) notes.push(noteName(tuning.openMidi[string] + fret));
  });
  return notes;
}
