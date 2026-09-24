// Pure music-theory helpers. Everything is expressed in MIDI note numbers
// (middle C = C4 = MIDI 60, A4 = MIDI 69 = 440 Hz), which matches Tone.js.

export const NOTE_NAMES = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
] as const;

/** A pitch class is 0–11 (C = 0 … B = 11), octave-independent. */
export type PitchClass = number;

/** Fold a MIDI number down to its pitch class (0–11). */
export function pitchClass(midi: number): PitchClass {
  return ((midi % 12) + 12) % 12;
}

/**
 * Human-readable note name for a MIDI number.
 * @param withOctave include the octave number (e.g. "C4" vs "C").
 */
export function noteName(midi: number, withOctave = true): string {
  const pc = pitchClass(midi);
  const octave = Math.floor(midi / 12) - 1; // MIDI 60 -> C4
  return withOctave ? `${NOTE_NAMES[pc]}${octave}` : NOTE_NAMES[pc];
}

/** MIDI number sounding at a given fret on a string tuned to `openMidi`. */
export function noteAt(openMidi: number, fret: number): number {
  return openMidi + fret;
}

/** Pitch class (0–11) for a bare note name like "C", "F#", "Bb". */
export function nameToPitchClass(name: string): PitchClass {
  const letters: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const letter = name[0]?.toUpperCase();
  if (letter === undefined || !(letter in letters)) {
    throw new Error(`Invalid note name: ${name}`);
  }
  let pc = letters[letter];
  for (const accidental of name.slice(1)) {
    if (accidental === '#') pc += 1;
    else if (accidental === 'b') pc -= 1;
  }
  return ((pc % 12) + 12) % 12;
}
