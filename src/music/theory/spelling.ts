// Spelled notes: the bridge between the app's MIDI-based fretboard and real
// notation.
//
// Everywhere else in Overture a pitch is a MIDI number and a name is a sharp
// ("A#"), which is right for a fretboard but cannot express a key signature:
// Gb major is Gb Ab Bb Cb Db Eb F, and there is no "Cb" in a sharps-only list.
// This module is where a pitch gains a letter and an accidental.

// NOTE: tonal is pinned to 6.4.3 on purpose. 6.5.0 ships a package.json that
// points at dist/index.js and dist/index.d.ts, neither of which is in the
// tarball, so TypeScript cannot resolve it. Check that before upgrading.
import { Note } from 'tonal';

/** A note name with octave, e.g. "Gb4". */
export type SpelledNote = string;

/** A note name without octave, e.g. "Gb". */
export type PitchName = string;

export function midiOf(name: SpelledNote): number {
  const midi = Note.midi(name);
  if (midi === null) throw new Error(`Not a pitch: ${name}`);
  return midi;
}

/** 0–11, where C is 0. Enharmonics share a value: Gb and F# are both 6. */
export function pitchClassOf(name: PitchName): number {
  const chroma = Note.chroma(name);
  if (chroma === undefined) throw new Error(`Not a note name: ${name}`);
  return chroma;
}

/** Strip the octave: "Gb4" -> "Gb". */
export function pitchName(name: SpelledNote): PitchName {
  return Note.pitchClass(name);
}

/** The octave of a spelled note, or null if it has none. */
export function octaveOf(name: SpelledNote): number | null {
  return Note.octave(name) ?? null;
}

/** The other way of writing the same pitch: F# <-> Gb. */
export function enharmonicOf(name: PitchName): PitchName {
  return Note.enharmonic(name);
}

/** True when two names sound the same pitch, however they are written. */
export function sameSound(a: PitchName, b: PitchName): boolean {
  return pitchClassOf(a) === pitchClassOf(b);
}

/**
 * Spell a pitch the way a given key would write it. Notes in the key get their
 * diatonic spelling; everything else follows the key's accidental preference,
 * so a chromatic passing note in F reads Db rather than C#.
 */
export function spellInKey(midi: number, keyScale: readonly PitchName[], preferFlats: boolean): SpelledNote {
  const chroma = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const diatonic = keyScale.find((n) => pitchClassOf(n) === chroma);
  const name = diatonic ?? (preferFlats ? Note.enharmonic(Note.fromMidiSharps(midi)) : Note.fromMidiSharps(midi));
  const bare = Note.pitchClass(name);
  // A spelling can push the letter across an octave boundary: B#3 sounds as
  // C4, and Cb4 sounds as B3. Re-derive the octave from the written letter.
  const naive = `${bare}${octave}`;
  const drift = midi - (Note.midi(naive) ?? midi);
  return `${bare}${octave + Math.round(drift / 12)}`;
}

/** Sharp spelling with octave, e.g. 66 -> "F#4". The fretboard's own language. */
export function sharpName(midi: number): SpelledNote {
  return Note.fromMidiSharps(midi);
}
