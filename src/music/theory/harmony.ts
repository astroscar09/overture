// Chord formulas, inversions, and functional harmony.

import { Chord, Interval, Progression } from 'tonal';
import type { PitchName } from './spelling';
import { keyInfo, type Mode } from './keys';

export interface ChordInfo {
  /** As written: "Cmaj7". */
  symbol: string;
  root: PitchName;
  /** Correctly spelled notes, root position. */
  notes: PitchName[];
  /** Intervals from the root: 1P 3M 5P 7M. */
  intervals: string[];
  /** The formula as players say it: 1 3 5 7, b3, #5 and so on. */
  formula: string[];
  /** "Major" | "Minor" | "Augmented" | "Diminished" | "Unknown". */
  quality: string;
  /** Plain-language name, e.g. "major seventh". */
  typeName: string;
}

const DEGREE_FOR_SEMITONES: Record<number, string> = {
  0: '1', 1: 'b2', 2: '2', 3: 'b3', 4: '3', 5: '4', 6: 'b5',
  7: '5', 8: '#5', 9: '6', 10: 'b7', 11: '7',
};

/** Interval list to the shorthand players read: ["1P","3m","5P"] -> ["1","b3","5"]. */
export function formulaOf(intervals: readonly string[]): string[] {
  return intervals.map((iv) => {
    const semis = Interval.semitones(iv) ?? 0;
    return DEGREE_FOR_SEMITONES[((semis % 12) + 12) % 12] ?? String(semis);
  });
}

export function chordInfo(symbol: string): ChordInfo {
  const c = Chord.get(symbol);
  if (c.empty || !c.tonic) throw new Error(`Not a chord: ${symbol}`);
  return {
    symbol: c.symbol,
    root: c.tonic,
    notes: [...c.notes],
    intervals: [...c.intervals],
    formula: formulaOf(c.intervals),
    quality: c.quality,
    typeName: c.name.replace(`${c.tonic} `, '') || c.type,
  };
}

/** Notes rotated so `inversion` chord tones have moved to the top. */
export function inversionNotes(symbol: string, inversion: number): PitchName[] {
  const { notes } = chordInfo(symbol);
  const n = ((inversion % notes.length) + notes.length) % notes.length;
  return [...notes.slice(n), ...notes.slice(0, n)];
}

/** How an inversion is named: 0 root position, 1 first inversion, … */
export function inversionName(inversion: number, size: number): string {
  const names = ['root position', 'first inversion', 'second inversion', 'third inversion'];
  return names[((inversion % size) + size) % size] ?? `inversion ${inversion}`;
}

/** The slash-chord spelling of an inversion: Cmaj7 1st inversion is "Cmaj7/E". */
export function slashName(symbol: string, inversion: number): string {
  const notes = inversionNotes(symbol, inversion);
  return inversion === 0 ? symbol : `${symbol}/${notes[0]}`;
}

// ---- Functional harmony ----

/** The seven diatonic triads of a key, as chord symbols. */
export function diatonicTriads(tonic: PitchName, mode: Mode): string[] {
  const scale = keyInfo(tonic, mode).scale;
  const suffix = mode === 'major' ? ['', 'm', 'm', '', '', 'm', 'dim'] : ['m', 'dim', '', 'm', 'm', '', ''];
  return scale.map((note, i) => `${note}${suffix[i]}`);
}

/** The seven diatonic seventh chords of a key. */
export function diatonicSevenths(tonic: PitchName, mode: Mode): string[] {
  const scale = keyInfo(tonic, mode).scale;
  const suffix =
    mode === 'major'
      ? ['maj7', 'm7', 'm7', 'maj7', '7', 'm7', 'm7b5']
      : ['m7', 'm7b5', 'maj7', 'm7', 'm7', 'maj7', '7'];
  return scale.map((note, i) => `${note}${suffix[i]}`);
}

const ROMAN_UPPER = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

/**
 * How a chord quality is written as a numeral. Overture follows the convention
 * taught in theory classes — case carries the quality, so a minor chord is
 * lowercase — rather than Tonal's own "IVm"/"VIm" style.
 */
function numeralFor(roman: string, accidental: string, symbol: string): string {
  const info = chordInfo(symbol);
  const seventh = info.formula.find((f) => f === '7' || f === 'b7');
  const minorish = info.quality === 'Minor' || info.quality === 'Diminished';
  const base = minorish ? roman.toLowerCase() : roman;

  let suffix = '';
  if (info.quality === 'Diminished') suffix = info.formula.includes('b7') ? 'ø7' : seventh ? '°7' : '°';
  else if (info.quality === 'Augmented') suffix = '+';
  if (info.quality !== 'Diminished' && seventh) suffix += seventh === '7' ? 'maj7' : '7';
  // A dominant seventh is just "7" on an uppercase numeral.
  if (info.quality === 'Major' && seventh === 'b7') suffix = '7';

  return `${accidental}${base}${suffix}`;
}

/**
 * Analyse a progression in a key. The tonic must be a pitch ("A"), not a key
 * name ("Am") — Tonal silently returns nonsense for the latter, so this
 * normalises it.
 *
 * `mode` matters for how the numerals are written. Tonal measures every degree
 * against the major scale, so it analyses A minor as i ii° bIII iv v bVI bVII.
 * That is not how minor keys are written: the flats are already in the key
 * signature, so the diatonic chords are III, VI and VII. A flat is kept only
 * for a chord that genuinely sits outside the key — which is what makes bVII
 * meaningful in a *major* key, where it really is borrowed.
 */
export function toRomanNumerals(tonic: PitchName, chords: readonly string[], mode: Mode = 'major'): string[] {
  const root = Chord.get(`${tonic}`).tonic ?? tonic.replace(/m(in)?$/i, '');
  const raw = Progression.toRomanNumerals(root, [...chords]);
  const diatonic = mode === 'minor' ? new Set(diatonicTriads(root, 'minor').concat(diatonicSevenths(root, 'minor'))) : null;
  return raw.map((entry, i) => {
    // Only the degree and its accidental are taken from Tonal. Its own suffix
    // is discarded and rebuilt from the chord, because Tonal writes qualities
    // in a style it cannot itself re-parse ("VIIdim") and that no theory class
    // teaches.
    const parsed = /^([b#]*)([IVX]+)/i.exec(entry);
    if (!parsed) return entry;
    const accidental = diatonic?.has(chords[i]) ? '' : parsed[1];
    return numeralFor(parsed[2].toUpperCase(), accidental, chords[i]);
  });
}

/** Build the chords a numeral sequence names in a key. Accepts either casing. */
export function fromRomanNumerals(tonic: PitchName, numerals: readonly string[]): string[] {
  return Progression.fromRomanNumerals(tonic, numerals.map(normaliseNumeral));
}

/** Tonal reads numerals case-insensitively but wants its own suffixes. */
function normaliseNumeral(numeral: string): string {
  const m = numeral.match(/^([b#]*)([ivxIVX]+)(.*)$/);
  if (!m) return numeral;
  const [, acc, roman, rest] = m;
  const upper = roman.toUpperCase();
  const isMinor = roman === roman.toLowerCase();
  const degree = ROMAN_UPPER.indexOf(upper);
  if (degree < 0) return numeral;
  let suffix = rest.replace('°7', 'dim7').replace('°', 'dim').replace('ø7', 'm7b5').replace('+', 'aug');
  if (isMinor && !suffix.startsWith('dim') && !suffix.startsWith('m')) suffix = `m${suffix}`;
  return `${acc}${upper}${suffix}`;
}
