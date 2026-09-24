import { NOTE_NAMES, nameToPitchClass, type PitchClass } from './notes';
import { CHORDS, type Chord } from './chords';

// The chord qualities we can build in any key.
export type Quality = 'maj' | 'min' | 'dom7';
export const QUALITIES: Quality[] = ['maj', 'min', 'dom7'];

const SUFFIX: Record<Quality, string> = { maj: '', min: 'm', dom7: '7' };

const mod12 = (n: number): PitchClass => ((n % 12) + 12) % 12;

/** Split a chord name like "A7", "C#m", "F" into a root pitch class + quality. */
export function parseChordName(name: string): { rootPc: PitchClass; quality: Quality } {
  const m = name.match(/^([A-G][#b]?)(.*)$/);
  if (!m) return { rootPc: 0, quality: 'maj' };
  const rootPc = nameToPitchClass(m[1]);
  const suffix = m[2];
  let quality: Quality = 'maj';
  if (suffix === 'm') quality = 'min';
  else if (suffix === '7') quality = 'dom7';
  else if (suffix === 'm7') quality = 'min'; // no dedicated m7 shape yet — approximate
  return { rootPc, quality };
}

export function chordDisplayName(rootPc: number, quality: Quality): string {
  return NOTE_NAMES[mod12(rootPc)] + SUFFIX[quality];
}

// Preferred first-position shapes (the nice open/CAGED voicings), indexed by
// `${quality}:${rootPc}`, derived from the hand-tuned CHORDS library.
const OPEN: Record<string, Chord> = {};
for (const chord of Object.values(CHORDS)) {
  const { rootPc, quality } = parseChordName(chord.name);
  OPEN[`${quality}:${rootPc}`] = chord;
}

// Movable barre templates (fret offset from the barre). E-shape has its root on
// the 6th string; A-shape on the 5th (6th string muted).
const E_SHAPE: Record<Quality, number[]> = {
  maj: [0, 2, 2, 1, 0, 0],
  min: [0, 2, 2, 0, 0, 0],
  dom7: [0, 2, 0, 1, 0, 0],
};
const A_SHAPE: Record<Quality, number[]> = {
  maj: [-1, 0, 2, 2, 2, 0],
  min: [-1, 0, 2, 2, 1, 0],
  dom7: [-1, 0, 2, 0, 2, 0],
};

function barreChord(rootPc: number, quality: Quality): Chord {
  const fE = mod12(rootPc - 4); // low E open = pitch class 4
  const fA = mod12(rootPc - 9); // A open = pitch class 9
  const useA = fA < fE; // pick the lower barre position on the neck
  const f = useA ? fA : fE;
  const template = useA ? A_SHAPE[quality] : E_SHAPE[quality];
  const frets = template.map((t) => (t < 0 ? -1 : f + t));
  return { name: chordDisplayName(rootPc, quality), frets, baseFret: f };
}

/** Build a playable chord for any root + quality (open shape if we have one). */
export function chordFor(rootPc: number, quality: Quality): Chord {
  const pc = mod12(rootPc);
  return OPEN[`${quality}:${pc}`] ?? barreChord(pc, quality);
}

/** Transpose a chord by a number of semitones, re-voicing to a good shape. */
export function transposeChord(chord: Chord, delta: number): Chord {
  const { rootPc, quality } = parseChordName(chord.name);
  return chordFor(mod12(rootPc + delta), quality);
}
