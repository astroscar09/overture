// Chord-tone theory: the pitch-class content of a chord, tagged by interval role.
// This is the single source of truth for chord *content* (as opposed to playable
// shapes, which live in chordShapes.ts). Everything is semitones from the root.

import type { PitchClass } from './notes';

/** The role a chord tone plays, used for colour-coding on the fretboard. */
export type IntervalRole = 'R' | '3' | '5' | '7';

export interface ChordTone {
  semitone: number; // interval above the root (0–11)
  role: IntervalRole;
}

export interface ChordQualitySpec {
  id: string;
  label: string; // shown in the picker, e.g. "Dominant 7 (7)"
  suffix: string; // appended to the root name, e.g. "7", "m7", "maj7"
  tones: ChordTone[];
}

// Colouring buckets a couple of roles for readability: 2nd/4th (sus) read as the
// "3rd" slot, and altered 5ths (b5/#5) read as the "5th" slot.
export const CHORD_QUALITIES: Record<string, ChordQualitySpec> = {
  maj:  { id: 'maj',  label: 'Major',           suffix: '',     tones: t([0, 'R'], [4, '3'], [7, '5']) },
  min:  { id: 'min',  label: 'Minor (m)',       suffix: 'm',    tones: t([0, 'R'], [3, '3'], [7, '5']) },
  dom7: { id: 'dom7', label: 'Dominant 7 (7)',  suffix: '7',    tones: t([0, 'R'], [4, '3'], [7, '5'], [10, '7']) },
  m7:   { id: 'm7',   label: 'Minor 7 (m7)',    suffix: 'm7',   tones: t([0, 'R'], [3, '3'], [7, '5'], [10, '7']) },
  maj7: { id: 'maj7', label: 'Major 7 (maj7)',  suffix: 'maj7', tones: t([0, 'R'], [4, '3'], [7, '5'], [11, '7']) },
  dim:  { id: 'dim',  label: 'Diminished (dim)', suffix: 'dim', tones: t([0, 'R'], [3, '3'], [6, '5']) },
  aug:  { id: 'aug',  label: 'Augmented (aug)', suffix: 'aug',  tones: t([0, 'R'], [4, '3'], [8, '5']) },
  m7b5: { id: 'm7b5', label: 'Half-dim (m7b5)', suffix: 'm7b5', tones: t([0, 'R'], [3, '3'], [6, '5'], [10, '7']) },
  sus2: { id: 'sus2', label: 'Sus2',            suffix: 'sus2', tones: t([0, 'R'], [2, '3'], [7, '5']) },
  sus4: { id: 'sus4', label: 'Sus4',            suffix: 'sus4', tones: t([0, 'R'], [5, '3'], [7, '5']) },
};

// Tiny builder so the table above stays readable.
function t(...pairs: [number, IntervalRole][]): ChordTone[] {
  return pairs.map(([semitone, role]) => ({ semitone, role }));
}

const mod12 = (n: number): PitchClass => ((n % 12) + 12) % 12;

function spec(qualityId: string): ChordQualitySpec {
  return CHORD_QUALITIES[qualityId] ?? CHORD_QUALITIES.maj;
}

/** Map each of the chord's pitch classes to its interval role (for colouring). */
export function chordToneRoles(rootPc: number, qualityId: string): Map<PitchClass, IntervalRole> {
  const roles = new Map<PitchClass, IntervalRole>();
  for (const tone of spec(qualityId).tones) roles.set(mod12(rootPc + tone.semitone), tone.role);
  return roles;
}

/** The pitch classes belonging to a chord. */
export function chordToneSet(rootPc: number, qualityId: string): Set<PitchClass> {
  return new Set(chordToneRoles(rootPc, qualityId).keys());
}

/**
 * The three tones to use when voicing on a 3-string set. Plain triads use
 * root-3rd-5th; qualities with a 7th use a guide-tone shell (root-3rd-7th,
 * dropping the 5th) so 7th chords stay distinct from triads on three strings.
 */
export function voicingTones(qualityId: string): ChordTone[] {
  const tones = spec(qualityId).tones;
  const seventh = tones.find((x) => x.role === '7');
  if (!seventh) return tones.slice(0, 3);
  const root = tones.find((x) => x.role === 'R')!;
  const third = tones.find((x) => x.role === '3')!;
  return [root, third, seventh];
}
