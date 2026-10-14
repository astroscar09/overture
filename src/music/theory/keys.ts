// Key signatures and scale construction.

import { Key, Scale } from 'tonal';
import { pitchClassOf, type PitchName } from './spelling';

export type Mode = 'major' | 'minor';
export type MinorFlavour = 'natural' | 'harmonic' | 'melodic';

export interface KeyInfo {
  /** "Gb", "F#", "C" … */
  tonic: PitchName;
  mode: Mode;
  /** The seven notes, correctly spelled: Gb Ab Bb Cb Db Eb F. */
  scale: PitchName[];
  /** The signature as accidentals, e.g. "bbbbbb" or "###". */
  signature: string;
  /** How many sharps or flats. */
  accidentals: number;
  type: 'sharps' | 'flats' | 'none';
  /** The relative major/minor of this key. */
  relative: PitchName;
}

function describe(tonic: PitchName, mode: Mode, scale: readonly string[], signature: string, relative: string): KeyInfo {
  const accidentals = signature.length;
  return {
    tonic,
    mode,
    scale: [...scale],
    signature,
    accidentals,
    type: accidentals === 0 ? 'none' : signature.startsWith('b') ? 'flats' : 'sharps',
    relative,
  };
}

export function majorKey(tonic: PitchName): KeyInfo {
  const k = Key.majorKey(tonic);
  if (!k.scale.length) throw new Error(`Not a key: ${tonic}`);
  return describe(k.tonic, 'major', k.scale, k.keySignature, k.minorRelative);
}

export function minorKey(tonic: PitchName): KeyInfo {
  const k = Key.minorKey(tonic);
  if (!k.natural.scale.length) throw new Error(`Not a key: ${tonic}`);
  return describe(k.tonic, 'minor', k.natural.scale, k.keySignature, k.relativeMajor);
}

export function keyInfo(tonic: PitchName, mode: Mode): KeyInfo {
  return mode === 'major' ? majorKey(tonic) : minorKey(tonic);
}

/** The scale of a minor key in its harmonic or melodic form. */
export function minorScale(tonic: PitchName, flavour: MinorFlavour): PitchName[] {
  const k = Key.minorKey(tonic);
  if (flavour === 'harmonic') return [...k.harmonic.scale];
  if (flavour === 'melodic') return [...k.melodic.scale];
  return [...k.natural.scale];
}

/** Any named scale, correctly spelled: scaleNotes('E', 'minor pentatonic'). */
export function scaleNotes(tonic: PitchName, scaleName: string): PitchName[] {
  const s = Scale.get(`${tonic} ${scaleName}`);
  if (s.empty) throw new Error(`Unknown scale: ${tonic} ${scaleName}`);
  return [...s.notes];
}

/** Scale names Tonal knows, for pickers. */
export function scaleNames(): string[] {
  return Scale.names();
}

/** Scales that contain exactly these notes, best match first. */
export function detectScale(notes: readonly PitchName[]): string[] {
  return Scale.detect([...notes]);
}

/** Pitch classes (0–11) of a key, for fretboard work. */
export function keyPitchClasses(info: KeyInfo): Set<number> {
  return new Set(info.scale.map(pitchClassOf));
}

/** The twelve major keys clockwise round the circle of fifths from C. */
export const MAJOR_KEYS_BY_FIFTHS: PitchName[] = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'];

/** Does this key prefer flats when spelling notes outside it? */
export function prefersFlats(info: KeyInfo): boolean {
  return info.type === 'flats';
}
