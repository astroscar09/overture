import { describe, expect, it } from 'vitest';
import { SIMPLE_INTERVALS, between, invert, semitones, semitonesBetweenPitchClasses, spell, up } from './intervals';

describe('identification', () => {
  it('names the interval between two notes', () => {
    expect(between('C4', 'E4')).toBe('3M');
    expect(between('C4', 'Eb4')).toBe('3m');
    expect(between('C4', 'G4')).toBe('5P');
    expect(between('C4', 'Gb4')).toBe('5d');
    expect(between('C4', 'C5')).toBe('8P');
  });

  it('distinguishes enharmonic spellings, which is the whole point', () => {
    // Same sound, different interval — an augmented 4th is not a diminished 5th.
    expect(between('C4', 'F#4')).toBe('4A');
    expect(between('C4', 'Gb4')).toBe('5d');
    expect(semitones('4A')).toBe(semitones('5d'));
  });
});

describe('construction', () => {
  it('builds the note an interval above', () => {
    expect(up('C4', '3M')).toBe('E4');
    expect(up('C4', '3m')).toBe('Eb4');
    expect(up('A3', '5P')).toBe('E4');
    expect(up('B3', '2m')).toBe('C4');
  });

  it('keeps the correct letter when it crosses an accidental', () => {
    expect(up('Eb4', '3M')).toBe('G4');
    expect(up('F#4', '3m')).toBe('A4');
    expect(up('Gb4', '3M')).toBe('Bb4');
  });

  it('round-trips: the interval between a note and its transposition', () => {
    for (const iv of SIMPLE_INTERVALS) {
      expect(between('C4', up('C4', iv))).toBe(iv);
    }
  });
});

describe('inversion', () => {
  it('turns intervals over', () => {
    expect(invert('3M')).toBe('6m');
    expect(invert('3m')).toBe('6M');
    expect(invert('5P')).toBe('4P');
    expect(invert('2m')).toBe('7M');
  });

  it('pairs always sum to nine in number terms', () => {
    for (const iv of ['2m', '2M', '3m', '3M', '4P', '5P', '6m', '6M', '7m', '7M']) {
      expect(semitones(iv) + semitones(invert(iv))).toBe(12);
    }
  });
});

describe('spoken names', () => {
  it('reads intervals aloud', () => {
    expect(spell('3m')).toBe('minor 3rd');
    expect(spell('3M')).toBe('major 3rd');
    expect(spell('5P')).toBe('perfect 5th');
    expect(spell('5d')).toBe('diminished 5th');
    expect(spell('4A')).toBe('augmented 4th');
    expect(spell('7m')).toBe('minor 7th');
    expect(spell('1P')).toBe('unison');
    expect(spell('8P')).toBe('octave');
  });
});

describe('pitch-class distance', () => {
  it('measures upward and wraps the octave', () => {
    expect(semitonesBetweenPitchClasses('C', 'E')).toBe(4);
    expect(semitonesBetweenPitchClasses('E', 'C')).toBe(8);
    expect(semitonesBetweenPitchClasses('A', 'A')).toBe(0);
  });

  it('agrees across enharmonic spellings', () => {
    expect(semitonesBetweenPitchClasses('C', 'F#')).toBe(semitonesBetweenPitchClasses('C', 'Gb'));
  });
});
